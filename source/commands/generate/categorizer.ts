import path from 'node:path';
import type { LocalizedString } from '../../types/navigation.js';
import type { 
  ContentFile, 
  CategoryMap, 
  CategoryHierarchy, 
  GenerationOptions,
  PhaseSummary 
} from './types.js';
import { DualLogger } from './ui/logger.js';

interface CategoryNode {
  name: string;
  files: ContentFile[];
  children: Map<string, CategoryNode>;
  level: number;
  path: string;
}

export class CategoryBuilder {
  private logger: DualLogger;
  private options: GenerationOptions;

  constructor(logger: DualLogger, options: GenerationOptions) {
    this.logger = logger;
    this.options = options;
  }

  public async buildHierarchy(files: ContentFile[]): Promise<CategoryHierarchy> {
    this.logger.startPhase('Category Building');
    const startTime = Date.now();
    
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      this.logger.info('Building category hierarchy', { 
        totalFiles: files.length,
        languages: this.options.languages,
        sections: this.options.sections.length > 0 ? this.options.sections : 'all'
      });

      // Group files by section first
      const filesBySection = this.groupFilesBySection(files);
      
      // Build category maps for each section
      const sections: { [section: string]: CategoryMap } = {};
      let totalCategories = 0;
      
      for (const [section, sectionFiles] of Object.entries(filesBySection)) {
        this.logger.info(`Processing section: ${section}`, { 
          files: sectionFiles.length 
        });

        const categoryMap = await this.buildSectionCategories(section, sectionFiles);
        sections[section] = categoryMap;
        
        const categoryCount = this.countCategories(categoryMap);
        totalCategories += categoryCount;
        
        this.logger.info(`Completed section: ${section}`, {
          categories: categoryCount,
          files: sectionFiles.length
        });
      }

      // Calculate language coverage
      const languageCoverage = this.calculateLanguageCoverage(files);
      
      const hierarchy: CategoryHierarchy = {
        sections,
        crossLanguageMap: {}, // Will be populated in Phase 3
        stats: {
          totalCategories,
          totalDocuments: files.length,
          languageCoverage,
        },
      };

      const duration = Date.now() - startTime;
      const summary: PhaseSummary = {
        phase: 'Category Building',
        duration,
        filesProcessed: files.length,
        errors,
        warnings,
        results: {
          totalSections: Object.keys(sections).length,
          totalCategories,
          totalDocuments: files.length,
          languageCoverage,
        },
      };

      this.logger.completePhase('Category Building', summary);
      
      this.logger.info('Category hierarchy completed', {
        sections: Object.keys(sections).length,
        categories: totalCategories,
        documents: files.length,
        duration: `${duration}ms`,
      });

      return hierarchy;

    } catch (error) {
      const errorMsg = `Failed to build category hierarchy: ${error}`;
      errors.push(errorMsg);
      this.logger.error(errorMsg, { error });

      const duration = Date.now() - startTime;
      this.logger.completePhase('Category Building', {
        phase: 'Category Building',
        duration,
        filesProcessed: 0,
        errors,
        warnings,
      });

      throw error;
    }
  }

  private groupFilesBySection(files: ContentFile[]): { [section: string]: ContentFile[] } {
    const grouped: { [section: string]: ContentFile[] } = {};
    
    for (const file of files) {
      if (!grouped[file.section]) {
        grouped[file.section] = [];
      }
      if (!grouped[file.section]) {
        grouped[file.section] = [];
      }
      grouped[file.section].push(file);
    }

    return grouped;
  }

  private async buildSectionCategories(section: string, files: ContentFile[]): Promise<CategoryMap> {
    const categoryMap: CategoryMap = {};

    // Build category tree from files
    const rootNode = this.createCategoryTree(files);
    
    // Convert tree to category map format
    this.convertTreeToMap(rootNode, categoryMap, section, 0);

    return categoryMap;
  }

  private createCategoryTree(files: ContentFile[]): CategoryNode {
    const root: CategoryNode = {
      name: 'root',
      files: [],
      children: new Map(),
      level: 0,
      path: '',
    };

    for (const file of files) {
      this.logger.setCurrentFile(file.path);
      
      try {
        this.insertFileIntoTree(root, file);
        this.logger.incrementProcessed();
      } catch (error) {
        this.logger.error(`Failed to categorize file: ${file.path}`, { 
          error, 
          category: file.category,
          subcategory: file.subcategory 
        });
      }
    }

    return root;
  }

  private insertFileIntoTree(node: CategoryNode, file: ContentFile): void {
    const pathParts = this.getFileCategoryPath(file);
    
    let currentNode = node;
    let currentPath = '';

    // Navigate/create nodes for each path part
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      if (!part) continue;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      
      if (!currentNode.children.has(part)) {
        const newNode: CategoryNode = {
          name: part,
          files: [],
          children: new Map(),
          level: i + 1,
          path: currentPath,
        };
        currentNode.children.set(part, newNode);
        
        this.logger.debug(`Created category: ${currentPath}`, {
          level: i + 1,
          parent: currentNode.name,
        });
      }
      
      currentNode = currentNode.children.get(part)!;
    }

    // Add file to the final category node
    currentNode.files.push(file);
    
    this.logger.debug(`Added file to category: ${currentPath}`, {
      file: file.fileName,
      category: currentNode.name,
      fileCount: currentNode.files.length,
    });
  }

  private getFileCategoryPath(file: ContentFile): string[] {
    const parts: string[] = [];
    
    // Add primary category
    if (file.category && file.category !== 'uncategorized') {
      parts.push(file.category);
    }
    
    // Add subcategory if present
    if (file.subcategory) {
      parts.push(file.subcategory);
    }

    // If no categories, use file's directory structure
    if (parts.length === 0) {
      const dirPath = path.dirname(file.relativePath);
      if (dirPath && dirPath !== '.') {
        parts.push(...dirPath.split(path.sep).filter(Boolean));
      }
    }

    // Fallback to uncategorized if still empty
    if (parts.length === 0) {
      parts.push('Uncategorized');
    }

    return parts;
  }

  private convertTreeToMap(
    node: CategoryNode, 
    categoryMap: CategoryMap, 
    section: string, 
    level: number
  ): void {
    for (const [, childNode] of node.children) {
      const categoryPath = `${section}/${childNode.path}`;
      
      // Create localized name (for now, just use the category name in all languages)
      const localizedName: LocalizedString = this.createLocalizedName(childNode.name);
      
      categoryMap[categoryPath] = {
        name: localizedName,
        children: childNode.children.size > 0 
          ? this.createNestedCategoryMap(childNode, section, level + 1)
          : childNode.files,
        path: categoryPath,
        level: level + 1,
      };

      this.logger.debug(`Mapped category: ${categoryPath}`, {
        name: childNode.name,
        level: level + 1,
        hasChildren: childNode.children.size > 0,
        fileCount: childNode.files.length,
      });
    }
  }

  private createNestedCategoryMap(
    node: CategoryNode, 
    section: string, 
    level: number
  ): CategoryMap {
    const nestedMap: CategoryMap = {};
    this.convertTreeToMap(node, nestedMap, section, level);
    return nestedMap;
  }

  private createLocalizedName(name: string): LocalizedString {
    // For Phase 2, we'll use the same name for all languages
    // Phase 3 will handle proper cross-language linking and naming
    const normalizedName = this.normalizeCategoryName(name);
    
    const localized: Partial<LocalizedString> = {};
    for (const language of this.options.languages) {
      localized[language] = normalizedName;
    }
    
    return localized;
  }

  private normalizeCategoryName(name: string): string {
    // Convert kebab-case or snake_case to Title Case
    return name
      .replace(/[-_]/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private countCategories(categoryMap: CategoryMap): number {
    let count = 0;
    
    for (const [, category] of Object.entries(categoryMap)) {
      count++;
      if (category.children && typeof category.children === 'object' && !Array.isArray(category.children)) {
        count += this.countCategories(category.children as CategoryMap);
      }
    }
    
    return count;
  }

  private calculateLanguageCoverage(files: ContentFile[]): { [lang: string]: number } {
    const coverage: { [lang: string]: number } = {};
    
    for (const language of this.options.languages) {
      const languageFiles = files.filter(f => f.language === language);
      coverage[language] = languageFiles.length;
    }
    
    return coverage;
  }
}

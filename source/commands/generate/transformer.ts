import type { 
  NavigationNode, 
  LocalizedString,
  NavbarItem
} from '../../types/navigation.js';

// Temporary type definition
type NavigationData = any;
import type { 
  CategoryHierarchy,
  ContentFile,
  GenerationOptions,
  PhaseSummary 
} from './types.js';
import { DualLogger } from './ui/logger.js';
import { getSectionSlugPrefix, getSectionConfig } from '../../config/sections.config.js';

export class NavigationTransformer {
  private logger: DualLogger;
  private options: GenerationOptions;

  constructor(logger: DualLogger, options: GenerationOptions) {
    this.logger = logger;
    this.options = options;
  }

  public async transformToNavigation(hierarchy: CategoryHierarchy): Promise<NavigationData> {
    this.logger.startPhase('Navigation Generation');
    const startTime = Date.now();
    
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      this.logger.info('Transforming hierarchy to navigation format', {
        sections: Object.keys(hierarchy.sections).length,
        totalCategories: hierarchy.stats.totalCategories,
        totalDocuments: hierarchy.stats.totalDocuments,
      });

      // Build navbar structure with duplicate tracking
      const { navbar, duplicateWarnings } = await this.buildNavbar(hierarchy);
      warnings.push(...duplicateWarnings);
      
      const navigationData: NavigationData = {
        navbar,
      };

      const duration = Date.now() - startTime;
      const summary: PhaseSummary = {
        phase: 'Navigation Generation',
        duration,
        filesProcessed: 1, // One navigation file generated
        errors,
        warnings,
        results: {
          sectionsGenerated: Object.keys(hierarchy.sections).length,
          totalNodes: this.countNavigationNodes(navbar),
          languages: this.options.languages,
          duplicatesFound: duplicateWarnings.length,
        },
      };

      this.logger.completePhase('Navigation Generation', summary);

      this.logger.info('Navigation transformation completed', {
        sections: Object.keys(hierarchy.sections).length,
        totalNodes: this.countNavigationNodes(navbar),
        duplicates: duplicateWarnings.length,
        duration: `${duration}ms`,
      });

      return navigationData;

    } catch (error) {
      const errorMsg = `Failed to transform navigation: ${error}`;
      errors.push(errorMsg);
      this.logger.error(errorMsg, { error });

      const duration = Date.now() - startTime;
      this.logger.completePhase('Navigation Generation', {
        phase: 'Navigation Generation',
        duration,
        filesProcessed: 0,
        errors,
        warnings,
      });

      throw error;
    }
  }

  private async buildNavbar(hierarchy: CategoryHierarchy): Promise<{ navbar: NavbarItem[], duplicateWarnings: string[] }> {
    this.logger.info('Building unified multilingual navigation structure');
    
    const sections: NavbarItem[] = [];
    const allDuplicateWarnings: string[] = [];
    
    for (const [sectionName, categoryMap] of Object.entries(hierarchy.sections)) {
      if (this.options.sections.length > 0 && !this.options.sections.includes(sectionName)) {
        continue;
      }

      const { section, duplicateWarnings } = await this.buildNavigationSection(
        sectionName, 
        categoryMap, 
        hierarchy
      );
      
      if (section) {
        sections.push(section);
      }
      
      allDuplicateWarnings.push(...duplicateWarnings);
    }
    
    this.logger.info('Completed unified navigation structure', {
      sections: sections.length,
      duplicatesFound: allDuplicateWarnings.length,
    });

    return { navbar: sections, duplicateWarnings: allDuplicateWarnings };
  }

  private async buildNavigationSection(
    sectionName: string,
    categoryMap: any,
    hierarchy: CategoryHierarchy
  ): Promise<{ section: NavbarItem | null, duplicateWarnings: string[] }> {
    
    try {
      // Create section name mapping from config (already has all three languages)
      const sectionConfig = getSectionConfig(sectionName);
      const sectionNameMap = sectionConfig?.displayName || {
        en: sectionName.charAt(0).toUpperCase() + sectionName.slice(1),
        es: '',
        pt: ''
      };

      // Create section-level slug tracking to prevent duplicates across categories
      const sectionProcessedSlugs = new Set<string>();
      const slugToFileMap = new Map<string, ContentFile>();
      const duplicateWarnings: string[] = [];

      // Build category tree (unified across all languages)
      const categories = await this.buildCategoryNodes(
        categoryMap, 
        hierarchy, 
        sectionProcessedSlugs, 
        slugToFileMap, 
        duplicateWarnings,
        sectionName
      );

      const section: NavbarItem = {
        documentation: sectionName,
        name: sectionNameMap,
        slugPrefix: getSectionSlugPrefix(sectionName),
        categories,
      };

      this.logger.debug(`Built section: ${sectionName}`, {
        categories: categories.length,
        name: sectionNameMap,
        uniqueDocuments: sectionProcessedSlugs.size,
        duplicatesSkipped: duplicateWarnings.length,
      });

      return { section, duplicateWarnings };

    } catch (error) {
      this.logger.error(`Failed to build section ${sectionName}`, { error });
      return { section: null, duplicateWarnings: [] };
    }
  }

  private async buildCategoryNodes(
    categoryMap: any,
    hierarchy: CategoryHierarchy,
    sectionProcessedSlugs?: Set<string>,
    slugToFileMap?: Map<string, ContentFile>,
    duplicateWarnings?: string[],
    sectionName?: string
  ): Promise<NavigationNode[]> {
    const nodes: NavigationNode[] = [];

    if (!categoryMap || typeof categoryMap !== 'object') {
      return nodes;
    }

    for (const [categoryPath, categoryData] of Object.entries(categoryMap)) {
      const categoryInfo = categoryData as any;

      try {
        const node = await this.buildNavigationNode(
          categoryInfo, 
          hierarchy, 
          sectionProcessedSlugs, 
          slugToFileMap, 
          duplicateWarnings, 
          sectionName
        );
        if (node) {
          nodes.push(node);
        }
      } catch (error) {
        this.logger.error(`Failed to build node for category: ${categoryPath}`, { 
          error
        });
      }
    }

    return nodes;
  }

  private async buildNavigationNode(
    categoryInfo: any,
    hierarchy: CategoryHierarchy,
    sectionProcessedSlugs?: Set<string>,
    slugToFileMap?: Map<string, ContentFile>,
    duplicateWarnings?: string[],
    sectionName?: string
  ): Promise<NavigationNode | null> {
    
    try {
      // Ensure category name has all required languages with empty string fallback
      const rawName = categoryInfo.name || {};
      const name: LocalizedString = {
        en: '',
        es: '',
        pt: ''
      };
      
      // Populate all required languages
      for (const lang of this.options.languages) {
        if (lang === 'en' || lang === 'es' || lang === 'pt') {
          name[lang] = rawName[lang] || '';
        }
      }
      
      const children = categoryInfo.children;
      
      // Generate category slug from name
      const slug = this.generateCategorySlug(name);

      if (Array.isArray(children)) {
        // This is a category with documents
        const documents = await this.buildDocumentNodes(
          children, 
          hierarchy, 
          sectionProcessedSlugs, 
          slugToFileMap, 
          duplicateWarnings, 
          sectionName
        );
        
        return {
          name,
          slug,
          origin: '',
          type: 'category',
          children: documents,
        } as NavigationNode;
      } else if (children && typeof children === 'object') {
        // This is a category with subcategories
        const subcategoryNodes = await this.buildCategoryNodes(
          children, 
          hierarchy, 
          sectionProcessedSlugs, 
          slugToFileMap, 
          duplicateWarnings, 
          sectionName
        );
        
        return {
          name,
          slug,
          origin: '',
          type: 'category',
          children: subcategoryNodes,
        } as NavigationNode;
      } else {
        this.logger.warn('Invalid category structure', { categoryInfo });
        return null;
      }

    } catch (error) {
      this.logger.error('Failed to build navigation node', { error, categoryInfo });
      return null;
    }
  }

  private async buildDocumentNodes(
    files: ContentFile[],
    hierarchy: CategoryHierarchy,
    sectionProcessedSlugs?: Set<string>,
    slugToFileMap?: Map<string, ContentFile>,
    duplicateWarnings?: string[],
    sectionName?: string
  ): Promise<NavigationNode[]> {
    const nodes: NavigationNode[] = [];
    
    // Use section-level slug tracking if provided, otherwise fall back to category-level
    const processedSlugs = sectionProcessedSlugs || new Set<string>();
    const fileMap = slugToFileMap || new Map<string, ContentFile>();
    const warnings = duplicateWarnings || [];

    // Group files by slugEN to handle multilingual documents properly
    const filesBySlugEN = new Map<string, ContentFile[]>();
    const actualDuplicateSlugs = new Map<string, ContentFile[]>(); // Track actual duplicates within same section+language
    
    // First pass: group files and detect actual duplicates
    for (const file of files) {
      const slugEN = file.metadata.slugEN || this.getDocumentSlug(file);
      
      // Group by slugEN for multilingual processing
      if (!filesBySlugEN.has(slugEN)) {
        filesBySlugEN.set(slugEN, []);
      }
      filesBySlugEN.get(slugEN)!.push(file);
      
      // Check for actual duplicates within the same section and language
      const duplicateKey = `${sectionName || 'unknown'}|${file.language}|${slugEN}`;
      if (!actualDuplicateSlugs.has(duplicateKey)) {
        actualDuplicateSlugs.set(duplicateKey, []);
      }
      actualDuplicateSlugs.get(duplicateKey)!.push(file);
    }

    // Check for and report actual duplicates (multiple files with same slugEN in same section+language)
    for (const [duplicateKey, duplicateFiles] of actualDuplicateSlugs) {
      if (duplicateFiles.length > 1) {
        const [section, language, slugEN] = duplicateKey.split('|');
        
        // Only show warnings if --show-warnings is enabled
        if (this.options.showWarnings) {
          const warningMsg = [
            `True duplicate slug '${slugEN}' found in section '${section}', language '${language}':`,
            ...duplicateFiles.map((file, index) => [
              `  • ${index === 0 ? 'Original' : 'Duplicate ' + index}: '${file.path}'`,
              `    - Title: "${file.metadata.title}"`,
              `    - Category: ${file.category || 'None'}`,
              `    - Subcategory: ${file.subcategory || 'None'}`
            ].join('\n')).flat(),
            `  ➤ Resolution: Ensure each document has a unique 'slug' or 'slugEN' within section '${section}' and language '${language}'.`
          ].join('\n');
          
          warnings.push(warningMsg);
          this.logger.warn(`\n⚠️  TRUE DUPLICATE SLUG DETECTED:\n${warningMsg}`);
        }
        
        // Skip duplicate files (keep only the first one)
        const filesToSkip = duplicateFiles.slice(1);
        for (const fileToSkip of filesToSkip) {
          files = files.filter(f => f !== fileToSkip);
        }
      }
    }

    // Second pass: process unique slugEN groups (this handles multilingual documents correctly)
    for (const [slugEN, groupFiles] of filesBySlugEN) {
      try {
        // Skip duplicates - only process each unique slugEN once (at section level)
        if (processedSlugs.has(slugEN)) {
          continue;
        }
        
        const firstFile = groupFiles[0];
        if (!firstFile) {
          this.logger.warn(`Empty file group for slugEN: ${slugEN}`);
          continue;
        }
        
        processedSlugs.add(slugEN);
        fileMap.set(slugEN, firstFile); // Use first file as representative
        
        // Build node using the first file (they all have the same slugEN so will get the same cross-language data)
        const node = await this.buildDocumentNode(firstFile, hierarchy);
        if (node) {
          nodes.push(node);
        }
      } catch (error) {
        this.logger.error(`Failed to build document node: ${groupFiles[0]?.path}`, { 
          error, 
          slugEN 
        });
      }
    }

    // Sort documents by English title
    nodes.sort((a, b) => {
      const titleA = ((a.name as any).en || '').toLowerCase();
      const titleB = ((b.name as any).en || '').toLowerCase();
      return titleA.localeCompare(titleB);
    });

    return nodes;
  }

  private async buildDocumentNode(
    file: ContentFile,
    hierarchy: CategoryHierarchy
  ): Promise<NavigationNode | null> {
    
    try {
      // Get cross-language information if available
      const crossLangDoc = hierarchy.crossLanguageMap[file.metadata.slugEN];
      
      let name: LocalizedString;
      let slug: LocalizedString;  // Changed to LocalizedString for documents

      if (crossLangDoc) {
        // Use cross-language titles and slugs
        name = crossLangDoc.title as LocalizedString;
        slug = crossLangDoc.slug as LocalizedString;
      } else {
        // Fallback to single language - fill other languages with empty strings
        name = {
          en: '',
          es: '',
          pt: ''
        };
        slug = {
          en: '',
          es: '',
          pt: ''
        };
        
        for (const lang of this.options.languages) {
          if ((lang === 'en' || lang === 'es' || lang === 'pt') && lang === file.language) {
            name[lang] = file.metadata.title;
            slug[lang] = this.getDocumentSlug(file);
          }
          // Other languages remain empty strings (already initialized above)
        }
      }

      const node: NavigationNode = {
        name,
        slug,
        origin: '',
        type: 'markdown',
        children: [],
      };

      this.logger.debug(`Built document node: ${file.fileName}`, {
        title: name,
        slug: slug,
      });

      return node;

    } catch (error) {
      this.logger.error(`Failed to build document node: ${file.path}`, { error });
      return null;
    }
  }

  private getDocumentSlug(file: ContentFile): string {
    // Priority order: legacySlug -> filename-based
    
    // 1. Check if legacySlug exists (preferred for localized slugs)
    if (file.metadata['legacySlug']) {
      return file.metadata['legacySlug'];
    }
    
    // 2. Fallback: generate from filename
    return this.generateSlugFromFilename(file.fileName);
  }


  private generateSlugFromFilename(fileName: string): string {
    // Remove file extension and generate slug from filename
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
    return this.slugify(nameWithoutExt);
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private generateCategorySlug(name: LocalizedString): string {
    // Use English name for slug generation, fallback to first available language
    const englishName = name.en || Object.values(name)[0] || 'category';
    return this.slugify(englishName);
  }


  private countNavigationNodes(navbar: NavbarItem[]): number {
    let count = 0;
    
    for (const section of navbar) {
      count += this.countNodesInSection(section.categories);
    }
    
    return count;
  }

  private countNodesInSection(nodes: NavigationNode[]): number {
    let count = nodes.length;
    
    for (const node of nodes) {
      if (node.children && Array.isArray(node.children)) {
        count += this.countNodesInSection(node.children);
      }
    }
    
    return count;
  }
}

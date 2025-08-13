import type { 
  NavigationNode, 
  LocalizedString 
} from '../../types/navigation.js';

// Temporary type definition
type NavigationData = any;
import type { 
  CategoryHierarchy,
  ContentFile,
  NavigationSection,
  GenerationOptions,
  PhaseSummary 
} from './types.js';
import { DualLogger } from './ui/logger.js';

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

  private async buildNavbar(hierarchy: CategoryHierarchy): Promise<{ navbar: NavigationSection[], duplicateWarnings: string[] }> {
    this.logger.info('Building unified multilingual navigation structure');
    
    const sections: NavigationSection[] = [];
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
  ): Promise<{ section: NavigationSection | null, duplicateWarnings: string[] }> {
    
    try {
      // Create section name mapping
      const sectionNameMap: any = {};
      for (const lang of this.options.languages) {
        sectionNameMap[lang] = this.getSectionDisplayName(sectionName);
      }

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

      const section: NavigationSection = {
        documentation: sectionName,
        name: sectionNameMap,
        slugPrefix: `docs/${sectionName}`,
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
      const name = categoryInfo.name || {};
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

    for (const file of files) {
      try {
        // Skip duplicates - only process each unique slug once (at section level)
        const slugKey = file.metadata.slugEN || this.generateSlug(file);
        
        if (processedSlugs.has(slugKey)) {
          // Create detailed duplicate warning with comprehensive file information
          const originalFile = fileMap.get(slugKey);
          if (originalFile) {
            // Create comprehensive warning message with all relevant details
            const warningMsg = [
              `Duplicate slug '${slugKey}' detected in section '${sectionName || 'unknown'}':`,
              `  • Original: '${originalFile.path}'`,
              `    - Title: "${originalFile.metadata.title}"`,
              `    - Category: ${originalFile.category || 'None'}`,
              `    - Subcategory: ${originalFile.subcategory || 'None'}`,
              `    - Language: ${originalFile.language}`,
              `  • Duplicate (SKIPPED): '${file.path}'`,
              `    - Title: "${file.metadata.title}"`,
              `    - Category: ${file.category || 'None'}`,
              `    - Subcategory: ${file.subcategory || 'None'}`,
              `    - Language: ${file.language}`,
              `  ➤ Resolution: Ensure each document has a unique 'slug' or 'slugEN' in its frontmatter within this section.`
            ].join('\n');
            
            warnings.push(warningMsg);
            
            // Display detailed warning immediately in console only if showWarnings is enabled
            if (this.options.showWarnings) {
              this.logger.warn(`\n⚠️  DUPLICATE SLUG DETECTED:\n${warningMsg}`);
            } else {
              // Show brief warning without details
              this.logger.warn(`Duplicate document slug detected: ${slugKey}`);
            }
            
            // Also log structured data for debugging
            this.logger.debug(`Duplicate document slug detected`, {
              slug: slugKey,
              section: sectionName,
              originalFile: {
                path: originalFile.path,
                title: originalFile.metadata.title,
                category: originalFile.category,
                subcategory: originalFile.subcategory,
                language: originalFile.language,
                slugEN: originalFile.metadata.slugEN
              },
              duplicateFile: {
                path: file.path,
                title: file.metadata.title,
                category: file.category,
                subcategory: file.subcategory,
                language: file.language,
                slugEN: file.metadata.slugEN
              }
            });
          }
          continue;
        }
        
        processedSlugs.add(slugKey);
        fileMap.set(slugKey, file);
        
        const node = await this.buildDocumentNode(file, hierarchy);
        if (node) {
          nodes.push(node);
        }
      } catch (error) {
        this.logger.error(`Failed to build document node: ${file.path}`, { 
          error, 
          file: file.fileName 
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
      let slug: string;

      if (crossLangDoc) {
        // Use cross-language titles
        name = crossLangDoc.title as LocalizedString;
        slug = file.metadata.slugEN; // Use canonical English slug
      } else {
        // Fallback to single language
        name = {} as LocalizedString;
        for (const lang of this.options.languages) {
          name[lang] = file.metadata.title;
        }
        slug = this.generateSlug(file);
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

  private generateSlug(file: ContentFile): string {
    // Generate slug from file path and metadata
    const pathParts = [file.section];
    
    if (file.category && file.category !== 'Uncategorized') {
      pathParts.push(this.slugify(file.category));
    }
    
    if (file.subcategory) {
      pathParts.push(this.slugify(file.subcategory));
    }
    
    // Use slugEN if available, otherwise generate from filename
    const docSlug = file.metadata.slugEN || this.slugify(file.fileName);
    pathParts.push(docSlug);
    
    return pathParts.join('/');
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

  private getSectionDisplayName(sectionName: string): string {
    // Map internal section names to display names
    const sectionMap: { [key: string]: string } = {
      tutorials: 'Tutorials',
      tracks: 'Learning Tracks',
      faq: 'FAQ',
      announcements: 'Announcements',
      troubleshooting: 'Troubleshooting',
    };

    return sectionMap[sectionName] || this.capitalize(sectionName);
  }

  private capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  private countNavigationNodes(navbar: NavigationSection[]): number {
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

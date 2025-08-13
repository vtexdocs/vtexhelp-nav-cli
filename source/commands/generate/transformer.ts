import type { 
  NavigationData, 
  NavigationNode, 
  LocalizedString 
} from '../../types/navigation.js';
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

      // Build navbar structure
      const navbar = await this.buildNavbar(hierarchy);
      
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
        },
      };

      this.logger.completePhase('Navigation Generation', summary);

      this.logger.info('Navigation transformation completed', {
        sections: Object.keys(hierarchy.sections).length,
        totalNodes: this.countNavigationNodes(navbar),
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

  private async buildNavbar(hierarchy: CategoryHierarchy): Promise<{ [language: string]: NavigationSection[] }> {
    const navbar: { [language: string]: NavigationSection[] } = {};

    // Build navigation for each language
    for (const language of this.options.languages) {
      this.logger.info(`Building navigation for language: ${language}`);
      
      const sections: NavigationSection[] = [];
      
      for (const [sectionName, categoryMap] of Object.entries(hierarchy.sections)) {
        if (this.options.sections.length > 0 && !this.options.sections.includes(sectionName)) {
          continue;
        }

        const section = await this.buildNavigationSection(
          sectionName, 
          categoryMap, 
          language,
          hierarchy
        );
        
        if (section) {
          sections.push(section);
        }
      }

      navbar[language] = sections;
      
      this.logger.info(`Completed navigation for ${language}`, {
        sections: sections.length,
      });
    }

    return navbar;
  }

  private async buildNavigationSection(
    sectionName: string,
    categoryMap: any,
    language: string,
    hierarchy: CategoryHierarchy
  ): Promise<NavigationSection | null> {
    
    try {
      // Create section name mapping
      const sectionNameMap: LocalizedString = {};
      for (const lang of this.options.languages) {
        sectionNameMap[lang] = this.getSectionDisplayName(sectionName);
      }

      // Build category tree
      const categories = await this.buildCategoryNodes(categoryMap, language, hierarchy);

      const section: NavigationSection = {
        documentation: sectionName,
        name: sectionNameMap,
        slugPrefix: `docs/${sectionName}`,
        categories,
      };

      this.logger.debug(`Built section: ${sectionName}`, {
        language,
        categories: categories.length,
        name: sectionNameMap[language],
      });

      return section;

    } catch (error) {
      this.logger.error(`Failed to build section ${sectionName} for ${language}`, { error });
      return null;
    }
  }

  private async buildCategoryNodes(
    categoryMap: any,
    language: string,
    hierarchy: CategoryHierarchy
  ): Promise<NavigationNode[]> {
    const nodes: NavigationNode[] = [];

    if (!categoryMap || typeof categoryMap !== 'object') {
      return nodes;
    }

    for (const [categoryPath, categoryData] of Object.entries(categoryMap)) {
      const categoryInfo = categoryData as any;

      try {
        const node = await this.buildNavigationNode(categoryInfo, language, hierarchy);
        if (node) {
          nodes.push(node);
        }
      } catch (error) {
        this.logger.error(`Failed to build node for category: ${categoryPath}`, { 
          error, 
          language 
        });
      }
    }

    return nodes;
  }

  private async buildNavigationNode(
    categoryInfo: any,
    language: string,
    hierarchy: CategoryHierarchy
  ): Promise<NavigationNode | null> {
    
    try {
      const name = categoryInfo.name || {};
      const children = categoryInfo.children;

      if (Array.isArray(children)) {
        // This is a leaf node with documents
        const documents = await this.buildDocumentNodes(children, language, hierarchy);
        
        return {
          name,
          children: documents,
        };
      } else if (children && typeof children === 'object') {
        // This is a category with subcategories
        const subcategoryNodes = await this.buildCategoryNodes(children, language, hierarchy);
        
        return {
          name,
          children: subcategoryNodes,
        };
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
    language: string,
    hierarchy: CategoryHierarchy
  ): Promise<NavigationNode[]> {
    const nodes: NavigationNode[] = [];

    for (const file of files) {
      try {
        const node = await this.buildDocumentNode(file, language, hierarchy);
        if (node) {
          nodes.push(node);
        }
      } catch (error) {
        this.logger.error(`Failed to build document node: ${file.path}`, { 
          error, 
          language, 
          file: file.fileName 
        });
      }
    }

    // Sort documents by title
    nodes.sort((a, b) => {
      const titleA = (a.name[language] || '').toLowerCase();
      const titleB = (b.name[language] || '').toLowerCase();
      return titleA.localeCompare(titleB);
    });

    return nodes;
  }

  private async buildDocumentNode(
    file: ContentFile,
    language: string,
    hierarchy: CategoryHierarchy
  ): Promise<NavigationNode | null> {
    
    try {
      // Get cross-language information if available
      const crossLangDoc = hierarchy.crossLanguageMap[file.metadata.slugEN];
      
      let name: LocalizedString;
      let slug: string | LocalizedString;

      if (crossLangDoc) {
        // Use cross-language titles
        name = crossLangDoc.title;
        slug = file.metadata.slugEN; // Use canonical English slug
      } else {
        // Fallback to single language
        name = {};
        for (const lang of this.options.languages) {
          name[lang] = file.metadata.title;
        }
        slug = this.generateSlug(file);
      }

      const node: NavigationNode = {
        name,
        slug,
      };

      this.logger.debug(`Built document node: ${file.fileName}`, {
        language,
        title: name[language],
        slug: typeof slug === 'string' ? slug : slug[language],
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

  private countNavigationNodes(navbar: { [language: string]: NavigationSection[] }): number {
    let count = 0;
    
    for (const sections of Object.values(navbar)) {
      for (const section of sections) {
        count += this.countNodesInSection(section.categories);
      }
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

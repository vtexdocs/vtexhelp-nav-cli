import * as slugifyLib from 'slugify';
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

    // Drop categories that ended up empty after pruning
    const nonEmpty = nodes.filter(n => Array.isArray((n as any).children) && (n as any).children.length > 0);

    // Merge categories by the English slug so categories are localized entities
    const merged = this.mergeCategoryNodeLists(nonEmpty);

    // Sort merged categories based on section-specific ordering rules
    this.sortCategoryNodes(merged, sectionName);

    return merged;
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
      
      // Generate per-locale category slugs from localized names, avoiding conflicts with child document slugs per locale
      const slug = this.generateLocalizedCategorySlugs(name, children);

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
        
        // Prune empty categories (no leaf documents)
        if (!documents || documents.length === 0) {
          return null;
        }
        
        const node = {
          name,
          // Categories now require localized slugs; all locales filled from localized names with conflict resolution
          slug: slug,
          origin: '',
          type: 'category',
          children: documents,
        } as NavigationNode;
        
        // Add order information if available
        if (typeof categoryInfo.order === 'number') {
          (node as any).order = categoryInfo.order;
        }
        
        return node;
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
        
        // Prune empty categories (no subcategories/documents)
        if (!subcategoryNodes || subcategoryNodes.length === 0) {
          return null;
        }
        
        return {
          name,
          slug: slug,
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

    // Sort documents based on section-specific ordering rules
    this.sortDocumentNodes(nodes, sectionName);

    // Add order numbers to track article names for better UX
    if (sectionName === 'tracks') {
      this.addOrderNumbersToArticleNames(nodes);
    }

    return nodes;
  }

  /**
   * Sort document nodes based on section-specific rules
   */
  private sortDocumentNodes(nodes: NavigationNode[], sectionName?: string): void {
    if (sectionName === 'tracks') {
      // For tracks, sort by order property from frontmatter if available
      nodes.sort((a, b) => {
        // Extract order values from the original files (stored in children metadata)
        const orderA = (a as any).order;
        const orderB = (b as any).order;
        
        // If both have order values, sort by order
        if (typeof orderA === 'number' && typeof orderB === 'number') {
          return orderA - orderB;
        }
        
        // If only one has an order, prioritize the one with order
        if (typeof orderA === 'number' && typeof orderB !== 'number') {
          return -1;
        }
        if (typeof orderB === 'number' && typeof orderA !== 'number') {
          return 1;
        }
        
        // If neither has order, sort by English title
        const titleA = ((a.name as any).en || '').toLowerCase();
        const titleB = ((b.name as any).en || '').toLowerCase();
        return titleA.localeCompare(titleB);
      });
    } else {
      // Default sorting by English title for other sections
      nodes.sort((a, b) => {
        const titleA = ((a.name as any).en || '').toLowerCase();
        const titleB = ((b.name as any).en || '').toLowerCase();
        return titleA.localeCompare(titleB);
      });
    }
  }

  /**
   * Sort category nodes based on section-specific rules
   */
  private sortCategoryNodes(nodes: NavigationNode[], sectionName?: string): void {
    if (sectionName === 'tracks') {
      // For tracks, sort categories (tracks) by their order property from order.json
      nodes.sort((a, b) => {
        // Extract order values from the category data
        const orderA = (a as any).order;
        const orderB = (b as any).order;
        
        // If both have order values, sort by order
        if (typeof orderA === 'number' && typeof orderB === 'number') {
          return orderA - orderB;
        }
        
        // If only one has an order, prioritize the one with order
        if (typeof orderA === 'number' && typeof orderB !== 'number') {
          return -1;
        }
        if (typeof orderB === 'number' && typeof orderA !== 'number') {
          return 1;
        }
        
        // If neither has order, sort by English title
        const titleA = ((a.name as any).en || '').toLowerCase();
        const titleB = ((b.name as any).en || '').toLowerCase();
        return titleA.localeCompare(titleB);
      });
    } else {
      // Default sorting by English title for other sections
      nodes.sort((a, b) => {
        const titleA = ((a.name as any).en || '').toLowerCase();
        const titleB = ((b.name as any).en || '').toLowerCase();
        return titleA.localeCompare(titleB);
      });
    }
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
      
      // Add order information for tracks if available
      if (typeof file.metadata.order === 'number') {
        (node as any).order = file.metadata.order;
      }

      this.logger.debug(`Built document node: ${file.fileName}`, {
        title: name,
        slug: slug,
        order: file.metadata.order,
      });

      return node;

    } catch (error) {
      this.logger.error(`Failed to build document node: ${file.path}`, { error });
      return null;
    }
  }

  private getDocumentSlug(file: ContentFile): string {
    // Always prefer filename-based slug for generator output to ensure
    // runtime consistency with systems that resolve by filenames.
    const filenameSlug = this.generateSlugFromFilename(file.fileName);
    const legacySlug = file.metadata['legacySlug'];

    if (legacySlug && legacySlug !== filenameSlug) {
      const warnMsg = `SLUG_MISMATCH: frontmatter legacySlug ('${legacySlug}') != filename slug ('${filenameSlug}') for ${file.path}`;
      this.logger?.warn?.(warnMsg);
    }

    return filenameSlug;
  }


  private generateSlugFromFilename(fileName: string): string {
    // Remove file extension and generate slug from filename
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
    return this.slugify(nameWithoutExt);
  }

  private slugify(text: string): string {
    return (slugifyLib as any).default(text, {
      lower: true,      // Convert to lowercase
      strict: true,     // Strip special characters except replacement
      locale: 'en',     // Use English transliteration rules (works for PT/ES too)
      trim: true        // Trim leading/trailing replacement chars
    });
  }

  private mergeCategoryNodeLists(nodes: NavigationNode[]): NavigationNode[] {
    const bySlug = new Map<string, NavigationNode>();

    const mergeNames = (target: any, src: any) => {
      for (const lang of ['en','es','pt']) {
        if (!target?.[lang] && src?.[lang]) {
          target[lang] = src[lang];
        }
      }
    };

    // Helper to deduplicate document children by English slug
    const dedupeDocs = (items: NavigationNode[]): NavigationNode[] => {
      const docMap = new Map<string, NavigationNode>();
      for (const it of items) {
        if ((it as any).type === 'markdown') {
          const key = ((it as any).slug?.en) || JSON.stringify((it as any).slug);
          if (!docMap.has(key)) docMap.set(key, it);
        }
      }
      return Array.from(docMap.values());
    };

    for (const node of nodes) {
      if ((node as any).type !== 'category') continue; // should not happen here
      const slugVal = (node as any).slug as any;
      const key = typeof slugVal === 'string' ? slugVal : (slugVal?.en || JSON.stringify(slugVal));
      if (!bySlug.has(key)) {
        // clone shallow
        bySlug.set(key, {
          ...node,
          name: { ...(node as any).name },
          children: Array.isArray(node.children) ? [...node.children] : []
        } as NavigationNode);
      } else {
        const existing = bySlug.get(key)! as any;
        // merge localized names
        mergeNames(existing.name, (node as any).name);
        // merge children
        const mergedChildren = [
          ...(existing.children || []),
          ...((node as any).children || [])
        ] as NavigationNode[];

        // Recursively merge category children by slug; docs dedup by slug
        const categoryChildren = mergedChildren.filter(ch => (ch as any).type === 'category');
        const docChildren = mergedChildren.filter(ch => (ch as any).type === 'markdown');
        const mergedCategoryChildren = this.mergeCategoryNodeLists(categoryChildren);
        const dedupedDocs = dedupeDocs(docChildren);
        existing.children = [...mergedCategoryChildren, ...dedupedDocs];
      }
    }

    return Array.from(bySlug.values());
  }

  private generateLocalizedCategorySlugs(name: LocalizedString, children?: any): LocalizedString {
    const locales: Array<keyof LocalizedString> = ['en','es','pt'];

    // Start with slugified localized names (fallback chain to ensure non-empty)
    const slugs: any = {
      en: this.slugify(name.en || name.es || name.pt || 'category'),
      es: this.slugify(name.es || name.en || name.pt || 'category'),
      pt: this.slugify(name.pt || name.en || name.es || 'category'),
    };

    // If this is a leaf category with document children, gather child slugs per locale
    if (Array.isArray(children)) {
      const childSlugsByLocale: Record<string, Set<string>> = { en: new Set(), es: new Set(), pt: new Set() };
      for (const file of children) {
        try {
          const docSlug = this.getDocumentSlug(file);
          const lang = (file?.language || 'en') as keyof LocalizedString;
          if (childSlugsByLocale[lang]) childSlugsByLocale[lang]!.add(docSlug);
        } catch (e) {
          // ignore
        }
      }

      // Resolve conflicts per locale, mirroring the behavior across all locales
      for (const loc of locales) {
        const set = childSlugsByLocale[loc] || new Set<string>();
        let candidate = slugs[loc];
        let iterations = 0;
        while (set.has(candidate) && iterations < 3) { // prevent runaway loops
          candidate = `${candidate}-category`;
          iterations++;
        }
        if (candidate !== slugs[loc]) {
          this.logger.debug(`Category slug conflict resolved for locale ${loc}`, {
            original: slugs[loc],
            resolved: candidate,
          });
        }
        slugs[loc] = candidate;
      }
    }

    return slugs as LocalizedString;
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

  /**
   * Add order numbers as prefixes to article names for better UX in tracks
   */
  private addOrderNumbersToArticleNames(nodes: NavigationNode[]): void {
    // Only process markdown (article) nodes
    const articleNodes = nodes.filter(node => (node as any).type === 'markdown');
    
    // Assign position-based order numbers (1, 2, 3, etc.)
    // Since nodes are already sorted, we can use their position
    articleNodes.forEach((node, index) => {
      const orderNumber = index + 1;
      const nodeAny = node as any;
      
      // Add order number prefix to all language variants
      if (nodeAny.name) {
        const name = nodeAny.name as LocalizedString;
        for (const lang of ['en', 'es', 'pt'] as const) {
          if (name[lang] && name[lang].trim()) {
            // Only add prefix if it doesn't already exist
            if (!name[lang].match(/^\d+\./)) {
              name[lang] = `${orderNumber}. ${name[lang]}`;
            }
          }
        }
      }
    });
    
    this.logger.debug(`Added order number prefixes to ${articleNodes.length} track articles`);
  }
}

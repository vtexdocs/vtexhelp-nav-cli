import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { LocalizedString } from '../../types/navigation.js';
import type { 
  ContentFile, 
  CategoryMap, 
  CategoryHierarchy, 
  GenerationOptions,
  PhaseSummary,
  CategoryMetadata
} from './types.js';
import { DualLogger } from './ui/logger.js';
import { normalizeCategoryNameAsync as normalizeCategoryName } from '../../utils/categoryNormalization.js';

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
      grouped[file.section]?.push(file);
    }

    return grouped;
  }

  private async buildSectionCategories(section: string, files: ContentFile[]): Promise<CategoryMap> {
    // Use unified hierarchical processing for all sections
    // This ensures proper cross-language unification and respects nested structures
    return this.buildUnifiedCategories(section, files);
  }

  /**
   * Unified category processing that handles both flat and hierarchical structures
   * with proper cross-language unification for all sections
   */
  private async buildUnifiedCategories(section: string, files: ContentFile[]): Promise<CategoryMap> {
    const categoryMap: CategoryMap = {};
    
    // Group files by their canonical hierarchical paths across languages
    // This works for both flat (single level) and nested (multi-level) structures
    const hierarchicalGroups = this.groupFilesByUnifiedHierarchicalPath(section, files);
    
    this.logger.debug(`Unified hierarchical groups for section ${section}:`, {
      groupCount: Object.keys(hierarchicalGroups).length,
      sampleGroups: Object.keys(hierarchicalGroups).slice(0, 5),
      fileCount: files.length
    });
    
    // Build nested category structure recursively
    for (const [fullPath, groupFiles] of Object.entries(hierarchicalGroups)) {
      this.logger.debug(`Building unified path: ${fullPath} with ${groupFiles.length} files`);
      await this.buildNestedCategoryFromPath(categoryMap, section, fullPath, groupFiles);
    }
    
    this.logger.info(`Created ${Object.keys(categoryMap).length} top-level categories in unified map`);
    
    return categoryMap;
  }

  /**
   * Groups files by their canonical hierarchical path for unified processing
   * Handles section-specific directory structures and cross-language unification
   */
  private groupFilesByUnifiedHierarchicalPath(section: string, files: ContentFile[]): { [fullPath: string]: ContentFile[] } {
    const grouped: { [fullPath: string]: ContentFile[] } = {};
    
    for (const file of files) {
      // Extract canonical hierarchical path based on section type and cross-language unification
      const canonicalSegments = this.extractUnifiedCanonicalPath(file, files);
      if (canonicalSegments.length === 0) continue;
      
      const fullPath = canonicalSegments.join('/');
      
      if (fullPath) {
        if (!grouped[fullPath]) {
          grouped[fullPath] = [];
        }
        grouped[fullPath]!.push(file);
      }
    }
    
    this.logger.info(`Total unified grouped paths for ${section}: ${Object.keys(grouped).length}`);
    if (Object.keys(grouped).length > 0) {
      this.logger.info(`Sample unified paths: ${Object.keys(grouped).slice(0, 3)}`);
    }
    
    return grouped;
  }

  /**
   * Extracts canonical path segments for any section type with proper cross-language unification
   */
  private extractUnifiedCanonicalPath(file: ContentFile, allFiles: ContentFile[]): string[] {
    // For all sections, find the canonical folder structure using English as the reference
    let canonicalFile: ContentFile | undefined = file;
    
    // Always try to use the English version as the canonical reference for folder structure
    if (file.language !== 'en') {
      canonicalFile = allFiles.find(
        (f) => f.language === 'en' && f.section === file.section && f.metadata.slugEN === file.metadata.slugEN
      );

      // If there's no English version, use the first available from preferred fallback order
      if (!canonicalFile) {
        const fallbackOrder: Array<ContentFile['language']> = ['es', 'pt'];
        for (const lang of fallbackOrder) {
          const candidate = allFiles.find(
            (f) => f.language === lang && f.section === file.section && f.metadata.slugEN === file.metadata.slugEN
          );
          if (candidate) {
            canonicalFile = candidate;
            break;
          }
        }
      }

      // If still not found, use the current file
      canonicalFile = canonicalFile || file;
    }

    // Extract directory segments using the canonical file's folder structure
    return this.extractCanonicalCategoryPath(canonicalFile);
  }

  /**
   * Extract canonical category path using the canonical file's folder structure
   * This ensures proper cross-language unification for all sections
   */
  private extractCanonicalCategoryPath(canonicalFile: ContentFile): string[] {
    const dirPath = path.dirname(canonicalFile.relativePath);
    
    if (!dirPath || dirPath === '.' || dirPath === '') {
      return [];
    }
    
    const segments = dirPath.split(path.sep).filter(Boolean);
    
    // Map English folder names to canonical identifiers to handle cross-language unification
    const canonicalSegments = segments.map(segment => {
      return this.normalizeCanonicalSegment(segment);
    });
    
    // All sections: respect the natural folder hierarchy
    // If folders are flat, navigation will be flat; if nested, navigation will be nested
    return canonicalSegments; // Keep full hierarchy as defined by folder structure
  }
  
  /**
   * Normalize folder segment to canonical identifier for cross-language unification
   * Maps different language folder names to a single canonical identifier
   */
  private normalizeCanonicalSegment(segment: string): string {
    // Convert to lowercase and normalize common patterns
    const normalized = segment.toLowerCase()
      .replace(/[àáâãäå]/g, 'a')
      .replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i')
      .replace(/[òóôõö]/g, 'o')
      .replace(/[ùúûü]/g, 'u')
      .replace(/[ç]/g, 'c')
      .replace(/[ñ]/g, 'n')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    // Specific mappings for known category translations
    const categoryMappings: { [key: string]: string } = {
      // Troubleshooting categories
      'operaciones-de-la-tienda': 'store-operations',
      'operacoes-da-loja': 'store-operations',
      'integraciones': 'integrations',
      'integracoes': 'integrations',
      
      // Tutorial categories (some common ones)
      'catalogo': 'catalog', // Spanish/Portuguese catalog
      'facturas': 'billing',
      'faturas': 'billing',
      'pagos': 'payments',
      'pagamentos': 'payments',
      'envio': 'shipping', // Spanish/Portuguese shipping
      'configuraciones-de-la-tienda': 'store-settings',
      'configuracoes-da-loja': 'store-settings',
      'gestion-de-la-cuenta': 'account-management',
      'gerenciamento-da-conta': 'account-management',
      'acerca-de-admin': 'about-the-admin',
      'sobre-o-admin': 'about-the-admin',
      'autenticacion': 'authentication',
      'autenticacao': 'authentication',
      'centro-de-mensajes': 'message-center',
      'central-de-mensagens': 'message-center',
      'comercio-unificado': 'unified-commerce',
      'tasas-y-promociones': 'promotions-and-taxes',
      'promocoes-e-taxas': 'promotions-and-taxes',
      'politicas-comerciales': 'trade-policies',
      'politicas-comerciais': 'trade-policies',
      'proyectos-e-integraciones': 'projects-and-integrations',
      'projetos-e-integracoes': 'projects-and-integrations',
      'sugerencias': 'suggestions',
      'sugestoes': 'suggestions',
      'suscripciones': 'subscriptions',
      'assinaturas': 'subscriptions',
      'operativo': 'operational',
      'operacional': 'operational',
      'otros': 'other',
      'outros': 'other',
      'precios': 'prices',
      'precos': 'prices',
      'pedidos': 'orders',
      'infraestructura': 'infrastructure',
      'infraestrutura': 'infrastructure',
      'seguridad': 'security',
      'seguranca': 'security',
      'soporte': 'support',
      'suporte': 'support',
    };
    
    // Return mapped canonical identifier or normalized segment
    return categoryMappings[normalized] || normalized;
  }


  /**
   * Read metadata.json file from a category directory for a specific language
   * Falls back to legacy order.json for backward compatibility
   */
  private async readCategoryMetadata(categoryPath: string, language?: string): Promise<{ order?: number; metadata?: CategoryMetadata }> {
    try {
      // Try multiple possible directory names for the same category
      const possiblePaths = [
        categoryPath, // Try the given path first
        categoryPath.replace(/-/g, '-&-'), // Try with & between dashes
        categoryPath.replace(/-/g, ' & '), // Try with spaces around &
        categoryPath.replace(/-/g, '_'), // Try with underscores
      ];
      
      for (const possiblePath of possiblePaths) {
        // First try to read metadata.json
        const metadataJsonPath = path.join(possiblePath, 'metadata.json');
        const metadataExists = await fs.stat(metadataJsonPath).catch(() => false);
        
        if (metadataExists) {
          if (language) {
            this.logger.debug(`[METADATA] Found metadata.json for ${language} at: ${metadataJsonPath}`);
          } else {
            console.log(`[METADATA] Found metadata.json at: ${metadataJsonPath}`);
          }
          const metadataContent = await fs.readFile(metadataJsonPath, 'utf8');
          const metadataData = JSON.parse(metadataContent) as CategoryMetadata;
          
          if (typeof metadataData.order === 'number') {
            return { 
              order: metadataData.order, 
              metadata: metadataData 
            };
          }
          
          this.logger.warn(`Invalid metadata.json format in: ${metadataJsonPath}`, {
            metadataData
          });
          return { metadata: metadataData };
        }
        
        // Fallback to legacy order.json for backward compatibility
        const orderJsonPath = path.join(possiblePath, 'order.json');
        const orderExists = await fs.stat(orderJsonPath).catch(() => false);
        
        if (orderExists) {
          const orderContent = await fs.readFile(orderJsonPath, 'utf8');
          const orderData = JSON.parse(orderContent);
          
          if (typeof orderData.order === 'number') {
            this.logger.debug(`Using legacy order.json in: ${orderJsonPath}`);
            return { order: orderData.order };
          }
          
          this.logger.warn(`Invalid order.json format in: ${orderJsonPath}`, {
            orderData
          });
        }
      }
      
      return {};
    } catch (error) {
      this.logger.debug(`Failed to read metadata from: ${categoryPath}`, { error });
      return {};
    }
  }

  /**
   * Read localized metadata from all language versions of a category
   * Returns unified metadata with canonical ID and localized names/slugs
   */
  private async readLocalizedCategoryMetadata(
    categorySegments: string[], 
    files: ContentFile[]
  ): Promise<{ order?: number; canonicalId?: string; localizedMetadata: { [lang: string]: CategoryMetadata } }> {
    const localizedMetadata: { [lang: string]: CategoryMetadata } = {};
    let order: number | undefined = undefined;
    let canonicalId: string | undefined = undefined;

    // Group files by language to get the base paths for each language
    const filesByLanguage = this.groupFilesByLanguage(files);

    for (const language of this.options.languages) {
      const languageFiles = filesByLanguage[language];
      if (!languageFiles || languageFiles.length === 0) continue;

      // Get the base path for this language by extracting from the sample file
      const sampleFile = languageFiles[0]!;
      const sampleFileFull = sampleFile.path;
      const relativePathFull = sampleFile.relativePath;
      const sectionBasePath = sampleFileFull.substring(0, sampleFileFull.length - relativePathFull.length);
      
      // Build the category directory path for this language using original path segments
      const originalPathSegments = path.dirname(relativePathFull).split(path.sep).filter(part => part !== '.');
      const relevantSegments = originalPathSegments.slice(0, categorySegments.length);
      const categoryDirPath = path.join(sectionBasePath, ...relevantSegments);

      // Read metadata for this language
      const result = await this.readCategoryMetadata(categoryDirPath, language);
      
      if (result.metadata) {
        localizedMetadata[language] = result.metadata;
        
        // Use English metadata as the canonical source for order and ID
        if (language === 'en') {
          order = result.order;
          canonicalId = result.metadata.id;
        } else if (order === undefined && result.order !== undefined) {
          // Fallback to non-English order if English is not available
          order = result.order;
        }
        
        // If we don't have a canonical ID yet, use this one
        if (!canonicalId && result.metadata.id) {
          canonicalId = result.metadata.id;
        }
      }
    }

    return { order, canonicalId, localizedMetadata };
  }

  private async buildNestedCategoryFromPath(
    categoryMap: CategoryMap, 
    section: string, 
    fullPath: string, 
    files: ContentFile[]
  ): Promise<void> {
    const pathParts = fullPath.split('/');
    let currentPath = section;
    let currentMap = categoryMap;
    
    // Build the nested structure level by level
    for (let i = 0; i < pathParts.length; i++) {
      const pathPart = pathParts[i]!;
      const levelPath = `${currentPath}/${pathPart}`;
      const isLeafLevel = (i === pathParts.length - 1);
      
      // Create the category if it doesn't exist
      if (!currentMap[levelPath]) {
        // Create localized name for this category level
        const localizedName = await this.createLocalizedCategoryNameForPath(
          pathPart, 
          files, 
          pathParts.slice(0, i + 1)
        );
        
        // Read localized metadata.json for category-level metadata across all languages
        let order: number | undefined = undefined;
        let canonicalId: string | undefined = undefined;
        let localizedMetadata: { [lang: string]: CategoryMetadata } = {};
        
        if (files.length > 0) {
          // Get the first file to determine base path structure
          const sampleFile = files[0]!;
          
          // For the current level, build the correct directory path using original folder names
          // The pathParts array represents the hierarchical path we're building (normalized)
          // But we need to use the original folder structure from the sample file
          const targetLevel = i + 1;
          
          // Build the full path to the category directory using original folder names
          const sampleFileFull = sampleFile.path;
          const relativePathFull = sampleFile.relativePath;
          
          // The base path should be everything before the relative path
          const sectionBasePath = sampleFileFull.substring(0, sampleFileFull.length - relativePathFull.length);
          
          // Extract original path segments from the relative path instead of using normalized pathParts
          const originalPathSegments = path.dirname(relativePathFull).split(path.sep).filter(part => part !== '.');
          const categorySegments = originalPathSegments.slice(0, targetLevel);
          
          if (sectionBasePath) {
            // Use the new multilingual metadata reader
            const metadataResult = await this.readLocalizedCategoryMetadata(
              categorySegments, 
              files
            );
            
            order = metadataResult.order;
            canonicalId = metadataResult.canonicalId;
            localizedMetadata = metadataResult.localizedMetadata;
            
            if (order !== undefined || Object.keys(localizedMetadata).length > 0) {
              this.logger.debug(`Localized category metadata found for ${levelPath}:`, { 
                order, 
                canonicalId,
                languages: Object.keys(localizedMetadata),
                sampleMetadata: localizedMetadata[Object.keys(localizedMetadata)[0] || '']
              });
            }
          }
        }
        
        currentMap[levelPath] = {
          name: localizedName,
          children: isLeafLevel ? this.sortTrackArticles(files, section) : {},
          path: levelPath,
          level: i + 1,
          ...(order !== undefined && { order }),
          ...(Object.keys(localizedMetadata).length > 0 && { localizedMetadata })
        };
        
        this.logger.debug(`Created hierarchical category: ${levelPath}`, {
          pathPart,
          level: i + 1,
          isLeaf: isLeafLevel,
          fileCount: isLeafLevel ? files.length : 0,
          order
        });
      } else if (isLeafLevel && Array.isArray(currentMap[levelPath]!.children)) {
        // If this is a leaf level and we already have files, merge them
        const existingFiles = currentMap[levelPath]!.children as ContentFile[];
        const allFiles = [...existingFiles, ...files];
        currentMap[levelPath]!.children = this.sortTrackArticles(allFiles, section);
      }
      
      // Move to the next level for non-leaf nodes
      if (!isLeafLevel) {
        currentPath = levelPath;
        if (typeof currentMap[levelPath]!.children === 'object' && !Array.isArray(currentMap[levelPath]!.children)) {
          currentMap = currentMap[levelPath]!.children as CategoryMap;
        }
      }
    }
  }

  /**
   * Sort track articles by their order property from frontmatter
   */
  private sortTrackArticles(files: ContentFile[], section: string): ContentFile[] {
    if (section !== 'tracks') {
      return files;
    }
    
    // Sort files by the order property in frontmatter, then by title as fallback
    return files.sort((a, b) => {
      const orderA = a.metadata.order;
      const orderB = b.metadata.order;
      
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
      
      // If neither has order, sort by title
      return a.metadata.title.localeCompare(b.metadata.title);
    });
  }

  /**
   * Create localized category name using metadata.json when available, falling back to folder names
   */
  private async createLocalizedCategoryNameForPath(
    pathSegment: string, 
    files: ContentFile[], 
    pathContext: string[]
  ): Promise<LocalizedString> {
    const localized: any = {};
    
    // First, try to get localized names from metadata.json files
    if (files.length > 0) {
      const localizedMetadataResult = await this.readLocalizedCategoryMetadata(
        pathContext, // category segments up to current level
        files
      );
      
      // If we have localized metadata, use those names
      if (Object.keys(localizedMetadataResult.localizedMetadata).length > 0) {
        this.logger.debug(`Using metadata.json names for category: ${pathSegment}`, {
          availableLanguages: Object.keys(localizedMetadataResult.localizedMetadata),
          canonicalId: localizedMetadataResult.canonicalId
        });
        
        // Use metadata names for available languages
        for (const language of this.options.languages) {
          const metadata = localizedMetadataResult.localizedMetadata[language];
          if (metadata && metadata.name) {
            localized[language] = metadata.name;
          }
        }
        
        // Fill in missing languages with fallbacks
        for (const language of this.options.languages) {
          if (!localized[language]) {
            // Try English first as fallback
            const englishMetadata = localizedMetadataResult.localizedMetadata['en'];
            if (englishMetadata && englishMetadata.name) {
              localized[language] = englishMetadata.name;
            } else {
              // Use any available metadata name as last resort
              const anyMetadata = Object.values(localizedMetadataResult.localizedMetadata)[0];
              if (anyMetadata && anyMetadata.name) {
                localized[language] = anyMetadata.name;
              }
            }
          }
        }
        
        // If we have complete localized names from metadata, return them
        if (this.options.languages.every(lang => localized[lang])) {
          return localized as LocalizedString;
        }
      }
    }
    
    // Fallback to folder-based name extraction
    this.logger.debug(`Falling back to folder names for category: ${pathSegment}`);
    
    // Group files by language to extract localized names from folder structure
    const filesByLanguage = this.groupFilesByLanguage(files);
    
    for (const language of this.options.languages) {
      // Skip if we already have this language from metadata
      if (localized[language]) continue;
      
      const languageFiles = filesByLanguage[language] || [];
      
      if (languageFiles.length > 0) {
        // Try to extract the localized folder name from files in this language
        const localizedName = await this.extractLocalizedFolderName(
          languageFiles[0]!, 
          pathSegment, 
          pathContext
        );
        localized[language] = localizedName;
      } else {
        // Fallback to English files or normalized path segment
        const englishFiles = filesByLanguage['en'] || [];
        if (englishFiles.length > 0) {
          const englishName = await this.extractLocalizedFolderName(
            englishFiles[0]!, 
            pathSegment, 
            pathContext
          );
          localized[language] = englishName;
        } else {
          // Last resort: normalize the path segment
          localized[language] = await normalizeCategoryName(pathSegment);
        }
      }
    }
    
    return localized as LocalizedString;
  }

  private async extractLocalizedFolderName(
    file: ContentFile, 
    pathSegment: string, 
    pathContext: string[]
  ): Promise<string> {
    // The relativePath is already relative to the section directory (e.g., "B2B/Overview/b2b-overview.md")
    // So we can directly use the path segments
    const pathSegments = file.relativePath.split(path.sep);
    
    // Get the category path (excluding the filename)
    const categorySegments = pathSegments.slice(0, -1);
    
    // Find the corresponding segment at the same depth as pathContext
    const contextDepth = pathContext.length - 1;
    if (contextDepth >= 0 && contextDepth < categorySegments.length) {
      const localizedSegment = categorySegments[contextDepth];
      if (localizedSegment) {
        // Use the original localized segment directly, preserving accents and special characters
        // Only apply normalizeCategoryName for proper casing and acronym handling
        return await normalizeCategoryName(localizedSegment);
      }
    }
    
    // Fallback to normalizing the path segment (this should be the original, non-canonical segment)
    // We need to find the original segment from the file path, not the normalized pathSegment
    const originalSegment = this.getOriginalSegmentFromFile(file, pathContext.length - 1);
    if (originalSegment) {
      return await normalizeCategoryName(originalSegment);
    }
    
    // Last resort: normalize the pathSegment (which might be canonical)
    return await normalizeCategoryName(pathSegment);
  }



  /**
   * Get the original (non-canonical) segment from file at the specified depth
   * This preserves accents and special characters
   */
  private getOriginalSegmentFromFile(file: ContentFile, depth: number): string | null {
    const pathSegments = file.relativePath.split(path.sep);
    const categorySegments = pathSegments.slice(0, -1); // Remove filename
    
    if (depth >= 0 && depth < categorySegments.length) {
      return categorySegments[depth] || null;
    }
    
    return null;
  }

  private groupFilesByLanguage(files: ContentFile[]): { [language: string]: ContentFile[] } {
    const grouped: { [language: string]: ContentFile[] } = {};
    
    for (const file of files) {
      if (!grouped[file.language]) {
        grouped[file.language] = [];
      }
      grouped[file.language]?.push(file);
    }
    
    return grouped;
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

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
      const canonicalSegments = this.extractUnifiedCanonicalPath(section, file, files);
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
  private extractUnifiedCanonicalPath(section: string, file: ContentFile, allFiles: ContentFile[]): string[] {
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
    return this.extractCanonicalCategoryPath(section, canonicalFile);
  }

  /**
   * Extract canonical category path using the canonical file's folder structure
   * This ensures proper cross-language unification for all sections
   */
  private extractCanonicalCategoryPath(section: string, canonicalFile: ContentFile): string[] {
    const dirPath = path.dirname(canonicalFile.relativePath);
    
    if (!dirPath || dirPath === '.' || dirPath === '') {
      return [];
    }
    
    const segments = dirPath.split(path.sep).filter(Boolean);
    
    // Map English folder names to canonical identifiers to handle cross-language unification
    const canonicalSegments = segments.map(segment => {
      return this.normalizeCanonicalSegment(segment);
    });
    
    if (section === 'tracks') {
      // Tracks: tracks/[track-topic]/[track-name] -> hierarchical processing
      // This handles the Track Topics > Tracks > Track Articles structure
      return canonicalSegments; // Keep full hierarchy: ['marketplace', 'integrating-with-google-shopping']
    } else if (section === 'tutorials') {
      // Tutorials: tutorials/[category]/[subcategory]/... -> hierarchical processing  
      return canonicalSegments; // Keep full hierarchy: ['b2b', 'overview']
    } else {
      // Other sections (FAQ, troubleshooting, etc.): section/[category] -> flat with unification
      // Take only the first level but normalize for cross-language unification
      return canonicalSegments.slice(0, 1); // Just the canonical category: ['store-operations']
    }
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
        
        currentMap[levelPath] = {
          name: localizedName,
          children: isLeafLevel ? files : {},
          path: levelPath,
          level: i + 1,
        };
        
        this.logger.debug(`Created hierarchical category: ${levelPath}`, {
          pathPart,
          level: i + 1,
          isLeaf: isLeafLevel,
          fileCount: isLeafLevel ? files.length : 0
        });
      } else if (isLeafLevel && Array.isArray(currentMap[levelPath]!.children)) {
        // If this is a leaf level and we already have files, merge them
        const existingFiles = currentMap[levelPath]!.children as ContentFile[];
        currentMap[levelPath]!.children = [...existingFiles, ...files];
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

  private async createLocalizedCategoryNameForPath(
    pathSegment: string, 
    files: ContentFile[], 
    pathContext: string[]
  ): Promise<LocalizedString> {
    const localized: any = {};
    
    // Group files by language to extract localized names
    const filesByLanguage = this.groupFilesByLanguage(files);
    
    for (const language of this.options.languages) {
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
        return await normalizeCategoryName(localizedSegment);
      }
    }
    
    // Fallback to normalizing the path segment
    return await normalizeCategoryName(pathSegment);
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

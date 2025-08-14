import type { Language } from '../../types/navigation.js';
import type { 
  ContentFile, 
  CrossLanguageDocument,
  CategoryHierarchy,
  GenerationOptions,
  PhaseSummary 
} from './types.js';
import { DualLogger } from './ui/logger.js';

export class CrossLanguageLinker {
  private logger: DualLogger;
  private options: GenerationOptions;

  constructor(logger: DualLogger, options: GenerationOptions) {
    this.logger = logger;
    this.options = options;
  }

  public async linkDocuments(files: ContentFile[], hierarchy: CategoryHierarchy): Promise<CategoryHierarchy> {
    this.logger.startPhase('Cross-language Linking');
    const startTime = Date.now();
    
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      this.logger.info('Starting cross-language linking', { 
        totalFiles: files.length,
        languages: this.options.languages.length,
        sections: Object.keys(hierarchy.sections).length
      });

      // Build cross-language document map by slugEN
      const crossLanguageMap = await this.buildCrossLanguageMap(files);
      
      // Update hierarchy with cross-language information
      const updatedHierarchy: CategoryHierarchy = {
        ...hierarchy,
        crossLanguageMap,
        stats: {
          ...hierarchy.stats,
          missingTranslations: this.countMissingTranslations(crossLanguageMap),
        },
      };

      // Update category names with proper localization
      this.updateCategoryLocalization(updatedHierarchy, crossLanguageMap);

      const duration = Date.now() - startTime;
      const summary: PhaseSummary = {
        phase: 'Cross-language Linking',
        duration,
        filesProcessed: files.length,
        errors,
        warnings,
        results: {
          crossLanguageDocuments: Object.keys(crossLanguageMap).length,
          missingTranslations: this.countMissingTranslations(crossLanguageMap),
          languageCompletenesss: this.calculateCompletenessStats(crossLanguageMap),
        },
      };

      this.logger.completePhase('Cross-language Linking', summary);

      this.logger.info('Cross-language linking completed', {
        linkedDocuments: Object.keys(crossLanguageMap).length,
        missingTranslations: this.countMissingTranslations(crossLanguageMap),
        duration: `${duration}ms`,
      });

      return updatedHierarchy;

    } catch (error) {
      const errorMsg = `Failed to link cross-language documents: ${error}`;
      errors.push(errorMsg);
      this.logger.error(errorMsg, { error });

      const duration = Date.now() - startTime;
      this.logger.completePhase('Cross-language Linking', {
        phase: 'Cross-language Linking',
        duration,
        filesProcessed: 0,
        errors,
        warnings,
      });

      throw error;
    }
  }

  private async buildCrossLanguageMap(files: ContentFile[]): Promise<{ [slugEN: string]: CrossLanguageDocument }> {
    const crossLanguageMap: { [slugEN: string]: CrossLanguageDocument } = {};
    
    // Group files by slugEN
    const filesBySlug: { [slugEN: string]: ContentFile[] } = {};
    
    for (const file of files) {
      this.logger.setCurrentFile(file.path);
      
      const slugEN = file.metadata.slugEN;
      if (!slugEN) {
        this.logger.warn(`File missing slugEN: ${file.path}`, {
          title: file.metadata.title,
          language: file.language,
          section: file.section,
        });
        continue;
      }

      if (!filesBySlug[slugEN]) {
        filesBySlug[slugEN] = [];
      }
      filesBySlug[slugEN].push(file);
      
      this.logger.incrementProcessed();
    }

    // Process each slug group
    let processedSlugs = 0;
    for (const [slugEN, slugFiles] of Object.entries(filesBySlug)) {
      this.logger.setCurrentFile(slugEN);
      
      try {
        const crossLangDoc = this.createCrossLanguageDocument(slugEN, slugFiles);
        crossLanguageMap[slugEN] = crossLangDoc;
        
        processedSlugs++;
        
        this.logger.debug(`Linked document: ${slugEN}`, {
          languages: Object.keys(crossLangDoc).filter(k => k !== 'slugEN' && k !== 'title' && k !== 'categories'),
          title: crossLangDoc.title,
          missingLanguages: this.getMissingLanguages(crossLangDoc),
        });

      } catch (error) {
        this.logger.error(`Failed to create cross-language document for slug: ${slugEN}`, {
          error,
          fileCount: slugFiles.length,
          languages: slugFiles.map(f => f.language),
        });
      }
    }

    this.logger.info('Cross-language map built', {
      uniqueSlugs: Object.keys(filesBySlug).length,
      linkedDocuments: processedSlugs,
    });

    return crossLanguageMap;
  }

  private createCrossLanguageDocument(slugEN: string, files: ContentFile[]): CrossLanguageDocument {
    const crossLangDoc: CrossLanguageDocument = {
      slugEN,
      title: {} as any,
      slug: {} as any,
      categories: {} as any,
    };

    // Process each language version
    for (const file of files) {
      const lang = file.language;
      
      // Store file reference
      crossLangDoc[lang] = file;
      
      // Build localized title
      crossLangDoc.title[lang] = file.metadata.title;
      
      // Build localized slug using priority order: legacySlug -> filename-based -> empty string
      let localSlug = file.metadata['legacySlug'];
      if (!localSlug) {
        localSlug = this.generateSlugFromFilename(file.fileName);
      }
      crossLangDoc.slug[lang] = localSlug;
      
      // Build localized category path
      const categoryPath = this.buildCategoryPath(file);
      crossLangDoc.categories[lang] = categoryPath;
    }

    // Fill missing languages with fallbacks (use English as primary fallback)
    this.fillMissingLanguageFallbacks(crossLangDoc);

    return crossLangDoc;
  }

  private buildCategoryPath(file: ContentFile): string {
    const parts: string[] = [file.section];
    
    if (file.category && file.category !== 'Uncategorized') {
      parts.push(file.category);
    }
    
    if (file.subcategory) {
      parts.push(file.subcategory);
    }
    
    return parts.join(' > ');
  }

  private fillMissingLanguageFallbacks(crossLangDoc: CrossLanguageDocument): void {
    // Use English as primary fallback, then any available language
    const fallbackOrder: Language[] = ['en', 'es', 'pt'];
    let fallbackLang: Language | undefined;

    // Find first available language for fallback
    for (const lang of fallbackOrder) {
      if (crossLangDoc[lang]) {
        fallbackLang = lang;
        break;
      }
    }

    if (!fallbackLang) {
      return; // No fallback available
    }

    // Fill missing titles
    for (const targetLang of this.options.languages) {
      if (!crossLangDoc.title[targetLang]) {
        crossLangDoc.title[targetLang] = crossLangDoc.title[fallbackLang];
        
        this.logger.debug(`Used fallback title for ${targetLang}`, {
          slugEN: crossLangDoc.slugEN,
          fallbackLang,
          title: crossLangDoc.title[fallbackLang],
        });
      }

      if (!crossLangDoc.slug[targetLang]) {
        crossLangDoc.slug[targetLang] = '';
      }

      if (!crossLangDoc.categories[targetLang]) {
        crossLangDoc.categories[targetLang] = crossLangDoc.categories[fallbackLang];
      }
    }
  }

  private getMissingLanguages(crossLangDoc: CrossLanguageDocument): Language[] {
    const missing: Language[] = [];
    
    for (const lang of this.options.languages) {
      if (!crossLangDoc[lang]) {
        missing.push(lang);
      }
    }
    
    return missing;
  }

  private countMissingTranslations(crossLanguageMap: { [slugEN: string]: CrossLanguageDocument }): number {
    let missingCount = 0;
    
    for (const crossLangDoc of Object.values(crossLanguageMap)) {
      missingCount += this.getMissingLanguages(crossLangDoc).length;
    }
    
    return missingCount;
  }

  private calculateCompletenessStats(crossLanguageMap: { [slugEN: string]: CrossLanguageDocument }): { [lang: string]: number } {
    const stats: { [lang: string]: number } = {};
    const totalDocuments = Object.keys(crossLanguageMap).length;
    
    for (const lang of this.options.languages) {
      let availableCount = 0;
      
      for (const crossLangDoc of Object.values(crossLanguageMap)) {
        if (crossLangDoc[lang]) {
          availableCount++;
        }
      }
      
      stats[lang] = totalDocuments > 0 ? Math.round((availableCount / totalDocuments) * 100) : 0;
    }
    
    return stats;
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

  private updateCategoryLocalization(
    hierarchy: CategoryHierarchy, 
    crossLanguageMap: { [slugEN: string]: CrossLanguageDocument }
  ): void {
    // This is a simplified implementation
    // In a more complete version, we would analyze the cross-language documents
    // to determine proper category names in each language based on the document locations
    
    this.logger.debug('Category localization update completed', {
      sections: Object.keys(hierarchy.sections).length,
      crossLanguageDocuments: Object.keys(crossLanguageMap).length,
    });
  }
}

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
    if (section === 'tutorials') {
      // Use hierarchical categorization for tutorials due to nested folder structure
      return this.buildHierarchicalCategories(section, files);
    } else {
      // Use flat categorization for other sections like tracks
      return this.buildFlatCategories(section, files);
    }
  }

  private async buildFlatCategories(section: string, files: ContentFile[]): Promise<CategoryMap> {
    const categoryMap: CategoryMap = {};

    // Group files by canonical category identifier (for tracks, use trackSlugEN; for others use English folder name)
    const canonicalCategories = this.groupFilesByCanonicalCategory(section, files);
    
    // Build unified categories with localized names
    for (const [canonicalSlug, categoryFiles] of Object.entries(canonicalCategories)) {
      const categoryPath = `${section}/${canonicalSlug}`;
      
      // Create localized category name from files in different languages
      const localizedName = this.createLocalizedCategoryNameFromFiles(categoryFiles);
      
      categoryMap[categoryPath] = {
        name: localizedName,
        children: categoryFiles,
        path: categoryPath,
        level: 1,
      };

      this.logger.debug(`Created unified category: ${categoryPath}`, {
        canonicalSlug,
        fileCount: categoryFiles.length,
        languages: [...new Set(categoryFiles.map(f => f.language))],
        localizedNames: localizedName,
      });
    }

    return categoryMap;
  }

  private async buildHierarchicalCategories(section: string, files: ContentFile[]): Promise<CategoryMap> {
    const categoryMap: CategoryMap = {};
    
    // Group files by their hierarchical paths
    const hierarchicalGroups = this.groupFilesByHierarchicalPath(files);
    
    this.logger.debug(`Hierarchical groups for section ${section}:`, {
      groupCount: Object.keys(hierarchicalGroups).length,
      sampleGroups: Object.keys(hierarchicalGroups).slice(0, 5),
      fileCount: files.length
    });
    
    // Build nested category structure recursively
    for (const [fullPath, groupFiles] of Object.entries(hierarchicalGroups)) {
      this.logger.debug(`Building path: ${fullPath} with ${groupFiles.length} files`);
      this.buildNestedCategoryFromPath(categoryMap, section, fullPath, groupFiles);
    }
    
    this.logger.info(`Created ${Object.keys(categoryMap).length} top-level categories in hierarchical map`);
    
    return categoryMap;
  }

  private groupFilesByHierarchicalPath(files: ContentFile[]): { [fullPath: string]: ContentFile[] } {
    const grouped: { [fullPath: string]: ContentFile[] } = {};
    
    for (const file of files) {
      // The relativePath is already relative to the section directory (e.g., "B2B/Overview/b2b-overview.md")
      // So we just need to extract the directory path (excluding the filename)
      const pathSegments = file.relativePath.split(path.sep);
      
      // Get all path segments except the last one (which is the filename)
      if (pathSegments.length > 1) {
        const categorySegments = pathSegments.slice(0, -1);
        const fullPath = categorySegments.join('/');
        
        if (fullPath) {
          if (!grouped[fullPath]) {
            grouped[fullPath] = [];
          }
          grouped[fullPath]!.push(file);
        }
      }
    }
    
    this.logger.info(`Total grouped paths: ${Object.keys(grouped).length}`);
    if (Object.keys(grouped).length > 0) {
      this.logger.info(`Sample grouped paths: ${Object.keys(grouped).slice(0, 5)}`);
    }
    
    return grouped;
  }

  private buildNestedCategoryFromPath(
    categoryMap: CategoryMap, 
    section: string, 
    fullPath: string, 
    files: ContentFile[]
  ): void {
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
        const localizedName = this.createLocalizedCategoryNameForPath(
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

  private createLocalizedCategoryNameForPath(
    pathSegment: string, 
    files: ContentFile[], 
    pathContext: string[]
  ): LocalizedString {
    const localized: any = {};
    
    // Group files by language to extract localized names
    const filesByLanguage = this.groupFilesByLanguage(files);
    
    for (const language of this.options.languages) {
      const languageFiles = filesByLanguage[language] || [];
      
      if (languageFiles.length > 0) {
        // Try to extract the localized folder name from files in this language
        const localizedName = this.extractLocalizedFolderName(
          languageFiles[0]!, 
          pathSegment, 
          pathContext
        );
        localized[language] = localizedName;
      } else {
        // Fallback to English files or normalized path segment
        const englishFiles = filesByLanguage['en'] || [];
        if (englishFiles.length > 0) {
          const englishName = this.extractLocalizedFolderName(
            englishFiles[0]!, 
            pathSegment, 
            pathContext
          );
          localized[language] = englishName;
        } else {
          // Last resort: normalize the path segment
          localized[language] = this.normalizeCategoryName(pathSegment);
        }
      }
    }
    
    return localized as LocalizedString;
  }

  private extractLocalizedFolderName(
    file: ContentFile, 
    pathSegment: string, 
    pathContext: string[]
  ): string {
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
        return this.normalizeCategoryName(localizedSegment);
      }
    }
    
    // Fallback to normalizing the path segment
    return this.normalizeCategoryName(pathSegment);
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

  private extractLocalizedCategoryName(file: ContentFile, fallbackName: string): string {
    // First prioritize the parsed category field if available
    if (file.category && file.category.trim() !== '') {
      return file.category;
    }
    
    // Extract the category folder name from the file's path for this language
    const pathSegments = file.relativePath.split(path.sep);
    
    // Find the category segment - look for the folder name that matches the category structure
    // For tracks: docs/[lang]/tracks/[category-name]/...
    // For tutorials: docs/[lang]/tutorials/[section]/[category-name]/...
    // For faq: docs/[lang]/faq/[category-name]/...
    
    let categoryNameFromPath = fallbackName;
    
    if (file.section === 'tracks') {
      // For tracks: get the folder name after 'tracks'
      const tracksIndex = pathSegments.indexOf('tracks');
      if (tracksIndex >= 0 && tracksIndex + 1 < pathSegments.length) {
        categoryNameFromPath = pathSegments[tracksIndex + 1] || fallbackName;
      }
    } else if (file.section === 'tutorials') {
      // For tutorials: get the last folder name before the file
      const fileDir = path.dirname(file.relativePath);
      const dirSegments = fileDir.split(path.sep);
      if (dirSegments.length > 0) {
        categoryNameFromPath = dirSegments[dirSegments.length - 1] || fallbackName;
      }
    } else if (file.section === 'faq') {
      // For FAQ: get the folder name after 'faq'
      const faqIndex = pathSegments.indexOf('faq');
      if (faqIndex >= 0 && faqIndex + 1 < pathSegments.length) {
        categoryNameFromPath = pathSegments[faqIndex + 1] || fallbackName;
      }
    }
    
    // Normalize the extracted name
    return this.normalizeCategoryName(categoryNameFromPath);
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

  private groupFilesByCanonicalCategory(section: string, files: ContentFile[]): { [canonicalSlug: string]: ContentFile[] } {
    const grouped: { [canonicalSlug: string]: ContentFile[] } = {};
    
    for (const file of files) {
      // Determine the canonical category identifier
      let canonicalSlug: string;
      
      if (section === 'tracks' && file.metadata['trackSlugEN']) {
        // For tracks, use trackSlugEN as the canonical identifier
        canonicalSlug = file.metadata['trackSlugEN'];
      } else {
        // For other sections, extract canonical slug from path - but prioritize English folder names
        canonicalSlug = this.extractCanonicalSlugWithEnglishFallback(file, files);
      }
      
      if (!grouped[canonicalSlug]) {
        grouped[canonicalSlug] = [];
      }
      grouped[canonicalSlug]?.push(file);
      
      this.logger.debug(`Grouped file into canonical category`, {
        file: file.fileName,
        language: file.language,
        canonicalSlug,
        section,
        trackSlugEN: file.metadata['trackSlugEN'],
      });
    }
    
    return grouped;
  }

  private extractCanonicalSlugWithEnglishFallback(file: ContentFile, allFiles: ContentFile[]): string {
    // First try to find the English version of this document to get canonical slug
    const englishFiles = allFiles.filter(f => f.language === 'en' && f.metadata.slugEN === file.metadata.slugEN);
    
    if (englishFiles.length > 0) {
      const englishFile = englishFiles[0];
      // Use the English file's folder structure as canonical
      return this.extractCanonicalSlug(englishFile!);
    }
    
    // Fallback to the current file's structure
    return this.extractCanonicalSlug(file);
  }

  private extractCanonicalSlug(file: ContentFile): string {
    // Extract canonical slug from file path or metadata
    const pathSegments = file.relativePath.split(path.sep);
    
    if (file.section === 'tracks') {
      // For tracks: get the folder name after 'tracks' from English version or fallback to current
      const tracksIndex = pathSegments.indexOf('tracks');
      if (tracksIndex >= 0 && tracksIndex + 1 < pathSegments.length) {
        return pathSegments[tracksIndex + 1] || 'uncategorized';
      }
    } else if (file.section === 'faq') {
      // For FAQ: get the folder name after 'faq'
      const faqIndex = pathSegments.indexOf('faq');
      if (faqIndex >= 0 && faqIndex + 1 < pathSegments.length) {
        return pathSegments[faqIndex + 1] || 'uncategorized';
      }
    } else if (file.section === 'tutorials') {
      // For tutorials: use the full path after 'tutorials' to create a unique canonical slug
      const tutorialsIndex = pathSegments.indexOf('tutorials');
      if (tutorialsIndex >= 0 && tutorialsIndex + 1 < pathSegments.length) {
        // Get all path segments after 'tutorials' except the last one (which is the file name)
        const categoryPath = pathSegments.slice(tutorialsIndex + 1, -1).join('-');
        return categoryPath || 'uncategorized';
      }
    }
    
    // Fallback to using the file's category or first folder
    return file.category || pathSegments[pathSegments.length - 2] || 'uncategorized';
  }

  private createLocalizedCategoryNameFromFiles(files: ContentFile[]): LocalizedString {
    const localized: any = {};
    
    // Group files by language
    const filesByLanguage = this.groupFilesByLanguage(files);
    
    for (const language of this.options.languages) {
      const languageFiles = filesByLanguage[language] || [];
      
      if (languageFiles.length > 0) {
        // Extract localized category name using the working logic that prioritizes file.category
        const localizedName = this.extractLocalizedCategoryName(languageFiles[0]!, 'Unknown Category');
        localized[language] = localizedName;
      } else {
        // If no files in this language, try to find the canonical English name or use fallback
        const englishFiles = filesByLanguage['en'] || [];
        if (englishFiles.length > 0) {
          const englishName = this.extractLocalizedCategoryName(englishFiles[0]!, 'Unknown Category');
          localized[language] = englishName;
        } else {
          // Last resort: use the first available file's category name
          const anyFile = files[0];
          if (anyFile) {
            const fallbackName = this.extractLocalizedCategoryName(anyFile, 'Unknown Category');
            localized[language] = fallbackName;
          } else {
            localized[language] = 'Unknown Category';
          }
        }
      }
    }
    
    return localized as LocalizedString;
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

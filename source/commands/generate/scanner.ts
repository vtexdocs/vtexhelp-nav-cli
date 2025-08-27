import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { Language } from '../../types/navigation.js';
import type {
  ContentFile,
  FrontMatter,
  ScanResult,
  GenerationOptions
} from './types.js';
import { DualLogger } from './ui/logger.js';
import { getSupportedLanguages, getSupportedSections } from '../../config/sections.config.js';
import { normalizeCategoryName } from '../../utils/categoryNormalization.js';

export class ContentScanner {
  private logger: DualLogger;
  private options: GenerationOptions;

  constructor(logger: DualLogger, options: GenerationOptions) {
    this.logger = logger;
    this.options = options;
  }

  private shouldIncludeKnownIssues(): boolean {
    // If no sections filter is specified, include everything (including known-issues)
    if (!this.options.sections || this.options.sections.length === 0) {
      return true;
    }
    // If sections filter is specified, check if known-issues is included
    return this.options.sections.includes('known-issues');
  }

  public async scan(): Promise<ScanResult> {
    this.logger.startPhase('Directory Scanning');

    const startTime = Date.now();
    const files: ContentFile[] = [];
    const stats = {
      totalFiles: 0,
      byLanguage: {} as { [lang: string]: number },
      bySection: {} as { [section: string]: number },
      errors: [] as string[],
      warnings: [] as string[],
    };

    try {
      // Scan main content directory
      const mainFiles = await this.scanContentDirectory(this.options.contentDir, 'main');
      files.push(...mainFiles.files);
      this.mergeStats(stats, mainFiles.stats);

      // Scan known-issues directory if enabled
      if (this.shouldIncludeKnownIssues()) {
        const knownIssuesPath = path.join(path.dirname(this.options.contentDir), '.vtexhelp-known-issues');
        const knownIssuesExists = await fs.stat(knownIssuesPath).catch(() => false);
        
        if (knownIssuesExists) {
          this.logger.info('Scanning known-issues repository');
          const knownIssuesFiles = await this.scanContentDirectory(knownIssuesPath, 'known-issues');
          files.push(...knownIssuesFiles.files);
          this.mergeStats(stats, knownIssuesFiles.stats);
        } else {
          const warning = `Known issues enabled but directory not found: ${knownIssuesPath}`;
          stats.warnings.push(warning);
          this.logger.warn(warning);
        }
      }

      // Calculate section stats for all files
      for (const file of files) {
        stats.bySection[file.section] = (stats.bySection[file.section] || 0) + 1;
      }

      // Update section stats in logger
      for (const [section, count] of Object.entries(stats.bySection)) {
        this.logger.updateSectionStats(section, count);
      }

      stats.totalFiles = files.length;
      this.logger.updateStats({ totalFiles: files.length });

      const duration = Date.now() - startTime;
      this.logger.completePhase('Directory Scanning', {
        phase: 'Directory Scanning',
        duration,
        filesProcessed: files.length,
        errors: stats.errors,
        warnings: stats.warnings,
      });

      this.logger.info('Scan completed', {
        totalFiles: stats.totalFiles,
        languages: Object.keys(stats.byLanguage).length,
        sections: Object.keys(stats.bySection).length,
        duration: `${duration}ms`,
      });

      return { files, stats };

    } catch (error) {
      const errorMessage = `Failed to scan content directory: ${error}`;
      stats.errors.push(errorMessage);
      this.logger.error(errorMessage, { error });
      return { files, stats };
    }
  }

  private async scanLanguageDirectory(langPath: string, language: Language, contentDir: string): Promise<ContentFile[]> {
    const files: ContentFile[] = [];

    try {
      const entries = await fs.readdir(langPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const section = entry.name;

        // Skip sections not in the filter
        if (this.options.sections.length > 0 && !this.options.sections.includes(section)) {
          this.logger.debug(`Skipping section: ${section}`, { language });
          continue;
        }

        if (!getSupportedSections().includes(section)) {
          this.logger.warn(`Unknown section: ${section}`, { language, section });
          continue;
        }

        this.logger.debug(`Scanning section: ${section}`, { language, section });
        const sectionPath = path.join(langPath, section);
        const sectionFiles = await this.scanSectionDirectory(sectionPath, language, section, contentDir);
        files.push(...sectionFiles);
      }
    } catch (error) {
      this.logger.error(`Failed to scan language directory: ${language}`, { error, path: langPath });
    }

    return files;
  }

  private async scanSectionDirectory(sectionPath: string, language: Language, section: string, contentDir: string): Promise<ContentFile[]> {
    const files: ContentFile[] = [];

    try {
      await this.walkDirectory(sectionPath, async (filePath) => {
        if (path.extname(filePath) !== '.md') return;

        this.logger.setCurrentFile(filePath);

        try {
          const contentFile = await this.parseMarkdownFile(filePath, language, section, contentDir);
          if (contentFile) {
            files.push(contentFile);
            this.logger.incrementProcessed();
            this.logger.debug(`Parsed file: ${contentFile.fileName}`, {
              language,
              section,
              category: contentFile.category,
              slugEN: contentFile.metadata.slugEN,
            });
          }
        } catch (error) {
          this.logger.error(`Failed to parse markdown file: ${filePath}`, { error, language, section });
        }
      });
    } catch (error) {
      this.logger.error(`Failed to scan section directory: ${section}`, { error, language, path: sectionPath });
    }

    return files;
  }

  private async walkDirectory(dirPath: string, callback: (filePath: string, stats: any) => Promise<void>) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await this.walkDirectory(fullPath, callback);
        } else if (entry.isFile()) {
          await callback(fullPath, entry);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to walk directory: ${dirPath}`, { error });
    }
  }

  private async parseMarkdownFile(filePath: string, language: Language, section: string, contentDir: string): Promise<ContentFile | null> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const parsed = matter(content);

      // Extract frontmatter
      const frontmatter = parsed.data as FrontMatter;

      // Validate required fields
      if (!frontmatter.title || !frontmatter.slugEN) {
        this.logger.warn(`Missing required frontmatter fields in: ${filePath}`, {
          title: !!frontmatter.title,
          slugEN: !!frontmatter.slugEN,
        });
        return null;
      }

      // Skip non-published content unless in development
      if (frontmatter.status && frontmatter.status !== 'PUBLISHED') {
        this.logger.debug(`Skipping non-published content: ${filePath}`, {
          status: frontmatter.status,
        });
        return null;
      }

      // Extract category from path
      const relativePath = path.relative(path.join(contentDir, 'docs', language, section), filePath);
      const pathParts = path.dirname(relativePath).split(path.sep).filter(part => part !== '.');

      const category = pathParts.length > 0 ? pathParts[0] : 'uncategorized';
      const subcategory = pathParts.length > 1 ? pathParts[1] : undefined;

      const contentFile: ContentFile = {
        path: filePath,
        relativePath,
        language,
        section,
        category: normalizeCategoryName(category),
        subcategory: subcategory ? normalizeCategoryName(subcategory) : undefined,
        fileName: path.basename(filePath, '.md'),
        metadata: {
          ...frontmatter,
          locale: frontmatter.locale || language,
        },
        content: parsed.content,
      };

      return contentFile;
    } catch (error) {
      this.logger.error(`Failed to parse markdown file: ${filePath}`, { error });
      return null;
    }
  }


  /**
   * Scan a specific content directory (main content or external repos)
   */
  private async scanContentDirectory(contentDir: string, source: string): Promise<ScanResult> {
    const files: ContentFile[] = [];
    const stats = {
      totalFiles: 0,
      byLanguage: {} as { [lang: string]: number },
      bySection: {} as { [section: string]: number },
      errors: [] as string[],
      warnings: [] as string[],
    };

    try {
      const docsPath = path.join(contentDir, 'docs');

      // Check if docs directory exists
      const docsExists = await fs.stat(docsPath).catch(() => false);
      if (!docsExists) {
        const error = `Docs directory not found: ${docsPath} (source: ${source})`;
        stats.errors.push(error);
        this.logger.error(error);
        return { files, stats };
      }

      // Scan each language directory
      for (const language of this.options.languages) {
        if (!getSupportedLanguages().includes(language)) {
          const warning = `Skipping unsupported language: ${language} (source: ${source})`;
          stats.warnings.push(warning);
          this.logger.warn(warning);
          continue;
        }

        const langPath = path.join(docsPath, language);
        const langExists = await fs.stat(langPath).catch(() => false);

        if (!langExists) {
          const warning = `Language directory not found: ${language} (source: ${source})`;
          stats.warnings.push(warning);
          this.logger.warn(warning, { language, path: langPath, source });
          continue;
        }

        this.logger.info(`Scanning language: ${language} (source: ${source})`, { path: langPath });
        const langFiles = await this.scanLanguageDirectory(langPath, language, contentDir);
        files.push(...langFiles);

        // Update language stats
        stats.byLanguage[language] = (stats.byLanguage[language] || 0) + langFiles.length;
        this.logger.updateLanguageStats(language, langFiles.length);
      }

      stats.totalFiles = files.length;
      return { files, stats };

    } catch (error) {
      const errorMessage = `Failed to scan content directory: ${contentDir} (source: ${source}) - ${error}`;
      stats.errors.push(errorMessage);
      this.logger.error(errorMessage, { error, source });
      return { files, stats };
    }
  }

  /**
   * Merge statistics from multiple scan results
   */
  private mergeStats(target: ScanResult['stats'], source: ScanResult['stats']): void {
    // Merge totals
    target.totalFiles += source.totalFiles;

    // Merge language stats
    for (const [lang, count] of Object.entries(source.byLanguage)) {
      target.byLanguage[lang] = (target.byLanguage[lang] || 0) + count;
    }

    // Merge section stats
    for (const [section, count] of Object.entries(source.bySection)) {
      target.bySection[section] = (target.bySection[section] || 0) + count;
    }

    // Merge errors and warnings
    target.errors.push(...source.errors);
    target.warnings.push(...source.warnings);
  }
}

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';
import type { 
  GenerationOptions, 
  ScanResult,
  CategoryHierarchy,
  ContentFile,
  ValidationResult 
} from './types.js';
// Note: Using any temporarily to resolve type issues
type NavigationData = any;
import { ContentScanner } from './scanner.js';
import { CategoryBuilder } from './categorizer.js';
import { CrossLanguageLinker } from './linker.js';
import { NavigationTransformer } from './transformer.js';
import { NavigationValidator } from './validator.js';

const CONTENT_REPO_URL = 'https://github.com/vtexdocs/help-center-content.git';
const DEFAULT_CONTENT_DIR = '.vtexhelp-content';

export class SimpleNavigationGenerator {
  private options: GenerationOptions;
  private startTime: number;

  constructor(options: Partial<GenerationOptions>) {
    this.options = {
      contentDir: options.contentDir || DEFAULT_CONTENT_DIR,
      output: options.output || 'generated-navigation.json',
      validate: options.validate ?? true,
      report: options.report ?? false,
      fix: options.fix ?? false,
      languages: options.languages || ['en', 'es', 'pt'],
      sections: options.sections || [],
      logFile: options.logFile,
      verbose: options.verbose ?? false,
      interactive: false, // Always false for simple generator
      branch: options.branch || 'main',
      force: options.force ?? false,
    };
    
    this.startTime = Date.now();
  }

  private log(level: 'info' | 'warn' | 'error', message: string, context?: any) {
    const emoji = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
    const contextStr = context && this.options.verbose ? ` ${JSON.stringify(context)}` : '';
    console.log(`${emoji} ${message}${contextStr}`);
  }

  private logPhase(phase: string) {
    console.log(`\n🔄 ${phase}...`);
  }

  public async generate(): Promise<boolean> {
    try {
      console.log('🚀 VTEX Navigation Generator (Simple Mode)');
      console.log(`📁 Content Directory: ${this.options.contentDir}`);
      console.log(`📄 Output File: ${this.options.output}`);
      console.log('');

      // Phase 0: Ensure content repository is available
      const contentReady = await this.ensureContentRepository();
      if (!contentReady) {
        this.log('error', 'Content repository not available');
        return false;
      }

      // Phase 1: Scan directory and parse files
      const scanResult = await this.scanContent();
      if (!scanResult || scanResult.stats.errors.length > 0) {
        this.log('error', 'Content scanning failed');
        return false;
      }

      // Phase 2: Build category hierarchy
      const hierarchy = await this.buildCategoryHierarchy(scanResult.files);
      if (!hierarchy) {
        this.log('error', 'Category hierarchy building failed');
        return false;
      }

      // Phase 3: Cross-language linking
      const linkedHierarchy = await this.linkCrossLanguageDocuments(scanResult.files, hierarchy);
      if (!linkedHierarchy) {
        this.log('error', 'Cross-language linking failed');
        return false;
      }

      // Phase 4: Navigation generation
      const navigationData = await this.transformToNavigation(linkedHierarchy);
      if (!navigationData) {
        this.log('error', 'Navigation transformation failed');
        return false;
      }

      // Phase 5: Special sections (placeholder)
      this.logPhase('Processing Special Sections');
      this.log('warn', 'Special sections handling not yet implemented');

      // Phase 6: Validation and output
      const validationResult = await this.validateAndOutput(navigationData);
      if (!validationResult) {
        this.log('error', 'Validation failed');
        return false;
      }

      // Print final summary
      this.printFinalSummary(scanResult, validationResult);
      return true;

    } catch (error) {
      this.log('error', 'Generation failed', { error: error instanceof Error ? error.message : error });
      return false;
    }
  }

  private async ensureContentRepository(): Promise<boolean> {
    this.logPhase('Initializing Content Repository');
    
    try {
      const absoluteContentDir = path.resolve(this.options.contentDir);
      const dirExists = await fs.stat(absoluteContentDir).catch(() => false);

      if (dirExists && !this.options.force) {
        const docsPath = path.join(absoluteContentDir, 'docs');
        const docsExists = await fs.stat(docsPath).catch(() => false);
        
        if (docsExists) {
          this.log('info', 'Using existing content repository', { path: absoluteContentDir });
          return true;
        }
        this.log('warn', 'Content directory exists but no docs found, re-cloning');
      }
      
      if (dirExists) {
        this.log('info', 'Force flag set, removing existing content directory');
        await fs.rm(absoluteContentDir, { recursive: true, force: true });
      }

      this.log('info', 'Cloning content repository', { 
        url: CONTENT_REPO_URL,
        branch: this.options.branch,
        target: this.options.contentDir 
      });

      await execa('git', [
        'clone',
        '--depth', '1',
        '--branch', this.options.branch || 'main',
        CONTENT_REPO_URL,
        this.options.contentDir
      ]);

      this.log('info', 'Content repository cloned successfully');
      return true;

    } catch (error) {
      this.log('error', 'Failed to ensure content repository', { error: error instanceof Error ? error.message : error });
      return false;
    }
  }

  private async scanContent(): Promise<ScanResult | null> {
    this.logPhase('Scanning Content Directory');
    
    try {
      // Create a simple logger interface for the scanner
      const simpleLogger = {
        info: (msg: string, ctx?: any) => this.log('info', msg, ctx),
        warn: (msg: string, ctx?: any) => this.log('warn', msg, ctx),
        error: (msg: string, ctx?: any) => this.log('error', msg, ctx),
        debug: (msg: string, ctx?: any) => this.options.verbose && this.log('info', `[DEBUG] ${msg}`, ctx),
        startPhase: (phase: string) => this.logPhase(phase),
        completePhase: (phase: string, summary: any) => {
          this.log('info', `Completed ${phase}`, {
            duration: summary.duration,
            files: summary.filesProcessed,
            errors: summary.errors?.length || 0,
            warnings: summary.warnings?.length || 0
          });
        },
        setCurrentFile: () => {}, // No-op for simple mode
        incrementProcessed: () => {}, // No-op for simple mode
        updateLanguageStats: () => {}, // No-op for simple mode
        updateSectionStats: () => {}, // No-op for simple mode
        updateStats: () => {}, // No-op for simple mode
        getStats: () => ({ errors: 0, warnings: 0 }), // Simple stats
        setStatsUpdateCallback: () => {},
        setLogUpdateCallback: () => {},
        close: async () => {}
      } as any;

      const scanner = new ContentScanner(simpleLogger, this.options);
      const result = await scanner.scan();
      
      if (result.stats.errors.length > 0) {
        this.log('error', 'Scanning completed with errors', {
          errors: result.stats.errors.length,
          warnings: result.stats.warnings.length,
        });
      } else {
        this.log('info', 'Scanning completed successfully', {
          files: result.files.length,
          warnings: result.stats.warnings.length,
        });
      }

      return result;
    } catch (error) {
      this.log('error', 'Failed to scan content', { error: error instanceof Error ? error.message : error });
      return null;
    }
  }

  private async buildCategoryHierarchy(files: ContentFile[]): Promise<CategoryHierarchy | null> {
    this.logPhase('Building Category Hierarchy');
    
    try {
      const simpleLogger = this.createSimpleLogger();
      const categoryBuilder = new CategoryBuilder(simpleLogger, this.options);
      return await categoryBuilder.buildHierarchy(files);
    } catch (error) {
      this.log('error', 'Failed to build category hierarchy', { error: error instanceof Error ? error.message : error });
      return null;
    }
  }

  private async linkCrossLanguageDocuments(files: ContentFile[], hierarchy: CategoryHierarchy): Promise<CategoryHierarchy | null> {
    this.logPhase('Linking Cross-language Documents');
    
    try {
      const simpleLogger = this.createSimpleLogger();
      const linker = new CrossLanguageLinker(simpleLogger, this.options);
      return await linker.linkDocuments(files, hierarchy);
    } catch (error) {
      this.log('error', 'Failed to link cross-language documents', { error: error instanceof Error ? error.message : error });
      return null;
    }
  }

  private async transformToNavigation(hierarchy: CategoryHierarchy): Promise<NavigationData | null> {
    this.logPhase('Transforming to Navigation Format');
    
    try {
      const simpleLogger = this.createSimpleLogger();
      const transformer = new NavigationTransformer(simpleLogger, this.options);
      return await transformer.transformToNavigation(hierarchy);
    } catch (error) {
      this.log('error', 'Failed to transform to navigation', { error: error instanceof Error ? error.message : error });
      return null;
    }
  }

  private async validateAndOutput(navigationData: NavigationData): Promise<ValidationResult | null> {
    this.logPhase('Validating and Writing Output');
    
    try {
      const simpleLogger = this.createSimpleLogger();
      const validator = new NavigationValidator(simpleLogger, this.options);
      const validationResult = await validator.validateNavigation(navigationData);
      
      // Write navigation file
      await this.writeNavigationFile(navigationData);
      
      // Generate report if requested
      if (this.options.report) {
        await this.generateReport(validationResult, navigationData);
      }
      
      return validationResult;
    } catch (error) {
      this.log('error', 'Failed to validate and output navigation', { error: error instanceof Error ? error.message : error });
      return null;
    }
  }

  private async writeNavigationFile(navigationData: NavigationData): Promise<void> {
    const outputPath = path.resolve(this.options.output);
    const jsonContent = JSON.stringify(navigationData, null, 2);
    
    await fs.writeFile(outputPath, jsonContent, 'utf8');
    
    this.log('info', 'Navigation file written successfully', {
      path: outputPath,
      size: `${Math.round(jsonContent.length / 1024)}KB`,
    });
  }

  private async generateReport(validationResult: ValidationResult, navigationData: NavigationData): Promise<void> {
    const reportPath = this.options.output.replace('.json', '-report.md');
    const report = this.buildMarkdownReport(validationResult, navigationData);
    
    await fs.writeFile(reportPath, report, 'utf8');
    
    this.log('info', 'Report generated', {
      path: reportPath,
      valid: validationResult.valid,
      errors: validationResult.errors.length,
      warnings: validationResult.warnings.length,
    });
  }

  private buildMarkdownReport(validationResult: ValidationResult, navigationData: NavigationData): string {
    const timestamp = new Date().toISOString();
    const languages = Object.keys(navigationData.navbar || {}).join(', ');
    
    let report = `# Navigation Generation Report\n\n`;
    report += `**Generated:** ${timestamp}\n`;
    report += `**Languages:** ${languages}\n`;
    report += `**Output:** ${this.options.output}\n\n`;
    
    // Validation Summary
    report += `## Validation Summary\n\n`;
    report += `- **Status:** ${validationResult.valid ? '✅ PASSED' : '❌ FAILED'}\n`;
    report += `- **Errors:** ${validationResult.errors.length}\n`;
    report += `- **Warnings:** ${validationResult.warnings.length}\n\n`;
    
    // Statistics
    if (validationResult.stats) {
      report += `## Statistics\n\n`;
      report += `- **Total Categories:** ${validationResult.stats.totalCategories || 0}\n`;
      report += `- **Total Documents:** ${validationResult.stats.totalDocuments || 0}\n`;
      report += `- **Missing Translations:** ${validationResult.stats.missingTranslations || 0}\n\n`;
      
      // Language Coverage
      if (validationResult.stats.languageCoverage) {
        report += `### Language Coverage\n\n`;
        for (const [lang, count] of Object.entries(validationResult.stats.languageCoverage)) {
          const total = validationResult.stats.totalDocuments || 0;
          const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
          report += `- **${lang.toUpperCase()}:** ${count} documents (${percentage}%)\n`;
        }
      }
    }
    
    // Errors
    if (validationResult.errors.length > 0) {
      report += `\n## Errors\n\n`;
      validationResult.errors.forEach(error => {
        report += `- ❌ ${error}\n`;
      });
    }
    
    // Warnings
    if (validationResult.warnings.length > 0) {
      report += `\n## Warnings\n\n`;
      validationResult.warnings.forEach(warning => {
        report += `- ⚠️ ${warning}\n`;
      });
    }
    
    return report;
  }

  private printFinalSummary(scanResult: ScanResult, validationResult: ValidationResult) {
    const duration = Math.round((Date.now() - this.startTime) / 1000);
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 NAVIGATION GENERATION COMPLETE');
    console.log('='.repeat(60));
    
    console.log(`\n📄 Output: ${this.options.output}`);
    console.log(`⏱️  Duration: ${duration}s`);
    
    console.log(`\n📊 Statistics:`);
    console.log(`  Files processed: ${scanResult.files.length}`);
    if (validationResult.stats) {
      console.log(`  Categories: ${validationResult.stats.totalCategories || 0}`);
      console.log(`  Documents: ${validationResult.stats.totalDocuments || 0}`);
    }
    
    if (validationResult.stats?.languageCoverage) {
      console.log(`\n🌍 Language Coverage:`);
      for (const [lang, count] of Object.entries(validationResult.stats.languageCoverage)) {
        const total = validationResult.stats.totalDocuments || 0;
        const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
        console.log(`  ${lang.toUpperCase()}: ${count} documents (${percentage}%)`);
      }
    }
    
    console.log(`\n${validationResult.valid ? '✅' : '❌'} Validation: ${validationResult.valid ? 'PASSED' : 'FAILED'}`);
    
    const errors = scanResult.stats.errors.length;
    const warnings = scanResult.stats.warnings.length + validationResult.warnings.length;
    
    if (errors > 0) {
      console.log(`❌ Errors: ${errors}`);
    }
    
    if (warnings > 0) {
      console.log(`⚠️  Warnings: ${warnings}`);
    }
    
    if (errors === 0 && warnings === 0) {
      console.log('🎯 No issues detected!');
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
  }

  private createSimpleLogger(): any {
    return {
      info: (msg: string, ctx?: any) => this.log('info', msg, ctx),
      warn: (msg: string, ctx?: any) => this.log('warn', msg, ctx),
      error: (msg: string, ctx?: any) => this.log('error', msg, ctx),
      debug: (msg: string, ctx?: any) => this.options.verbose && this.log('info', `[DEBUG] ${msg}`, ctx),
      startPhase: (phase: string) => this.logPhase(phase),
      completePhase: (phase: string, summary: any) => {
        this.log('info', `Completed ${phase}`, {
          duration: summary.duration,
          files: summary.filesProcessed,
          errors: summary.errors?.length || 0,
          warnings: summary.warnings?.length || 0
        });
      },
      setCurrentFile: () => {},
      incrementProcessed: () => {},
      updateLanguageStats: () => {},
      updateSectionStats: () => {},
      updateStats: () => {},
      getStats: () => ({ errors: 0, warnings: 0 }),
      setStatsUpdateCallback: () => {},
      setLogUpdateCallback: () => {},
      close: async () => {}
    };
  }
}

// Export helper function for command usage
export async function runSimpleGeneration(options: Partial<GenerationOptions>): Promise<boolean> {
  const generator = new SimpleNavigationGenerator(options);
  return await generator.generate();
}

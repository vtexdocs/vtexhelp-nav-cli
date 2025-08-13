import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';
import type { 
  GenerationOptions, 
  GenerationStats, 
  LogEntry, 
  ScanResult,
  CategoryHierarchy,
  ContentFile,
  ValidationResult 
} from './types.js';
// Note: Using any temporarily to resolve type issues
type NavigationData = any;
import { DualLogger } from './ui/logger.js';
import { ContentScanner } from './scanner.js';
import { CategoryBuilder } from './categorizer.js';
import { CrossLanguageLinker } from './linker.js';
import { NavigationTransformer } from './transformer.js';
import { NavigationValidator } from './validator.js';

const CONTENT_REPO_URL = 'https://github.com/vtexdocs/help-center-content.git';
const DEFAULT_CONTENT_DIR = '.vtexhelp-content';

export class NavigationGenerator {
  private logger: DualLogger;
  private options: GenerationOptions;
  private stats: GenerationStats;
  private logs: LogEntry[] = [];
  private uiInstance?: any;

  constructor(options: Partial<GenerationOptions>) {
    // Set default options
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
      interactive: options.interactive ?? true,
      branch: options.branch || 'main',
      force: options.force ?? false,
    };

    // IMPORTANT: For non-interactive mode, use special handling to avoid any UI component loading
    if (!this.options.interactive) {
      console.log('🚀 Starting VTEX Navigation Generation (non-interactive mode)');
      console.log(`📁 Content Directory: ${this.options.contentDir}`);
      console.log(`📄 Output File: ${this.options.output}`);
      console.log('');
    }

    // Initialize logger
    this.logger = new DualLogger({
      logFile: this.options.logFile,
      verbose: this.options.verbose,
      interactive: this.options.interactive,
    });

    this.stats = this.logger.getStats();

    // CRITICAL: Only set up callbacks if in interactive mode
    if (this.options.interactive) {
      this.logger.setStatsUpdateCallback((stats) => {
        this.stats = stats;
        this.updateUI();
      });

      this.logger.setLogUpdateCallback((entry) => {
        this.logs.push(entry);
        this.updateUI();
      });
    } else {
      // For non-interactive mode, only update stats locally - NO UI callbacks at all
      this.logger.setStatsUpdateCallback((stats) => {
        this.stats = stats;
      });
      // Completely disable log callbacks to prevent any UI rendering
      this.logger.setLogUpdateCallback(() => {});
    }
  }

  public async generate(): Promise<boolean> {
    try {
      this.logger.info('Starting navigation generation', { options: this.options });

      // CRITICAL: Only start UI in interactive mode - never call render() in non-interactive mode
      if (this.options.interactive) {
        await this.startUI();
      } else {
        // For non-interactive mode, ensure absolutely no UI callbacks are set
        this.logger.setStatsUpdateCallback((stats) => {
          this.stats = stats;
        });
        this.logger.setLogUpdateCallback(() => {});
      }

      // Phase 0: Ensure content repository is available
      const contentReady = await this.ensureContentRepository();
      if (!contentReady) {
        this.logger.error('Content repository not available');
        return false;
      }

      // Phase 1: Scan directory and parse files
      const scanResult = await this.scanContent();
      if (!scanResult || scanResult.stats.errors.length > 0) {
        this.logger.error('Content scanning failed');
        return false;
      }

      // Phase 2: Build category hierarchy
      const hierarchy = await this.buildCategoryHierarchy(scanResult.files);
      if (!hierarchy) {
        this.logger.error('Category hierarchy building failed');
        return false;
      }

      // Phase 3: Cross-language linking
      const linkedHierarchy = await this.linkCrossLanguageDocuments(scanResult.files, hierarchy);
      if (!linkedHierarchy) {
        this.logger.error('Cross-language linking failed');
        return false;
      }

      // Phase 4: Navigation generation
      const navigationData = await this.transformToNavigation(linkedHierarchy);
      if (!navigationData) {
        this.logger.error('Navigation transformation failed');
        return false;
      }

      // Phase 5: Special sections (placeholder - can be implemented later)
      this.logger.startPhase('Special Sections');
      await this.sleep(100); // Quick placeholder
      this.logger.completePhase('Special Sections', {
        phase: 'Special Sections',
        duration: 100,
        filesProcessed: 0,
        errors: [],
        warnings: ['Special sections handling not yet implemented'],
      });

      // Phase 6: Validation and output
      const validationResult = await this.validateAndOutput(navigationData);
      if (!validationResult) {
        this.logger.error('Validation failed');
        return false;
      }

      // Complete
      this.logger.startPhase('Complete');
      this.logger.info('Navigation generation completed successfully!', {
        totalFiles: scanResult.files.length,
        output: this.options.output,
        duration: this.stats.elapsedTime,
        validationPassed: validationResult.valid,
        warnings: validationResult.warnings.length,
      });
      
      // Complete the Complete phase
      this.logger.completePhase('Complete', {
        phase: 'Complete',
        duration: 100,
        filesProcessed: 0,
        errors: [],
        warnings: [],
      });
      
      // Print final summary for non-interactive mode
      if (!this.options.interactive) {
        this.printFinalSummary(scanResult, validationResult);
      }
      
      // Ensure UI shows completion status (interactive mode only)
      if (this.options.interactive) {
        this.stats.currentPhase = 'Complete';
        this.updateUI();
        // Small delay to ensure UI updates with 100% progress
        await this.sleep(500);
      }

      // Wait for user to exit in interactive mode
      if (this.options.interactive && this.uiInstance) {
        await new Promise(resolve => {
          // UI will call resolve when user exits
          this.uiInstance.waitForExit = resolve;
        });
      }

      return true;

    } catch (error) {
      this.logger.error('Generation failed', { error });
      return false;
    } finally {
      await this.logger.close();
      if (this.uiInstance) {
        this.uiInstance.unmount();
      }
    }
  }

  private async ensureContentRepository(): Promise<boolean> {
    this.logger.startPhase('Initializing');
    
    try {
      const absoluteContentDir = path.resolve(this.options.contentDir);
      const dirExists = await fs.stat(absoluteContentDir).catch(() => false);

      if (dirExists && !this.options.force) {
        // Check if it's a valid git repository with content
        const docsPath = path.join(absoluteContentDir, 'docs');
        const docsExists = await fs.stat(docsPath).catch(() => false);
        
        if (docsExists) {
          this.logger.info('Using existing content repository', { path: absoluteContentDir });
          this.logger.completePhase('Initializing', {
            phase: 'Initializing',
            duration: 100,
            filesProcessed: 0,
            errors: [],
            warnings: [],
          });
          return true;
        }

        this.logger.warn('Content directory exists but no docs found, re-cloning');
      }
      
      // If force flag is set or directory doesn't have proper content, remove it
      if (dirExists) {
        this.logger.info('Force flag set, removing existing content directory', { path: absoluteContentDir });
        await fs.rm(absoluteContentDir, { recursive: true, force: true });
      }

      // Clone the repository
      this.logger.info('Cloning content repository', { 
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

      this.logger.info('Content repository cloned successfully');
      this.logger.completePhase('Initializing', {
        phase: 'Initializing',
        duration: 2000, // Estimate for clone time
        filesProcessed: 0,
        errors: [],
        warnings: [],
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to ensure content repository', { error });
      this.logger.completePhase('Initializing', {
        phase: 'Initializing',
        duration: 1000,
        filesProcessed: 0,
        errors: [`Failed to clone repository: ${error}`],
        warnings: [],
      });
      return false;
    }
  }

  private async scanContent(): Promise<ScanResult | null> {
    try {
      const scanner = new ContentScanner(this.logger, this.options);
      const result = await scanner.scan();
      
      if (result.stats.errors.length > 0) {
        this.logger.error('Scanning completed with errors', {
          errors: result.stats.errors.length,
          warnings: result.stats.warnings.length,
        });
      } else {
        this.logger.info('Scanning completed successfully', {
          files: result.files.length,
          warnings: result.stats.warnings.length,
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to scan content', { error });
      return null;
    }
  }

  private async startUI() {
    if (!this.options.interactive) return;

    // Dynamically import UI components only when needed
    const { default: React } = await import('react');
    const { render } = await import('ink');
    const { GenerationDashboard } = await import('./ui/GenerationDashboard.js');

    this.uiInstance = render(
      React.createElement(GenerationDashboard, {
        stats: this.stats,
        logs: this.logs,
        showVerbose: this.options.verbose,
        onExit: () => {
          if (this.uiInstance?.waitForExit) {
            this.uiInstance.waitForExit();
          }
        },
      })
    );
  }

  private async updateUI() {
    if (!this.options.interactive || !this.uiInstance) return;

    try {
      // Dynamically import React and components only when needed
      const { default: React } = await import('react');
      const { GenerationDashboard } = await import('./ui/GenerationDashboard.js');

      // Rerender with updated data
      this.uiInstance.rerender(
        React.createElement(GenerationDashboard, {
          stats: this.stats,
          logs: this.logs,
          showVerbose: this.options.verbose,
          onExit: () => {
            if (this.uiInstance?.waitForExit) {
              this.uiInstance.waitForExit();
            }
          },
        })
      );
    } catch (error) {
      // Silently fail if UI components can't be loaded
      console.debug('Failed to update UI:', error);
    }
  }

  private async buildCategoryHierarchy(files: ContentFile[]): Promise<CategoryHierarchy | null> {
    try {
      const categoryBuilder = new CategoryBuilder(this.logger, this.options);
      return await categoryBuilder.buildHierarchy(files);
    } catch (error) {
      this.logger.error('Failed to build category hierarchy', { error });
      return null;
    }
  }

  private async linkCrossLanguageDocuments(files: ContentFile[], hierarchy: CategoryHierarchy): Promise<CategoryHierarchy | null> {
    try {
      const linker = new CrossLanguageLinker(this.logger, this.options);
      return await linker.linkDocuments(files, hierarchy);
    } catch (error) {
      this.logger.error('Failed to link cross-language documents', { error });
      return null;
    }
  }

  private async transformToNavigation(hierarchy: CategoryHierarchy): Promise<NavigationData | null> {
    try {
      const transformer = new NavigationTransformer(this.logger, this.options);
      return await transformer.transformToNavigation(hierarchy);
    } catch (error) {
      this.logger.error('Failed to transform to navigation', { error });
      return null;
    }
  }

  private async validateAndOutput(navigationData: NavigationData): Promise<ValidationResult | null> {
    try {
      // Validate navigation
      const validator = new NavigationValidator(this.logger, this.options);
      const validationResult = await validator.validateNavigation(navigationData);
      
      // Write navigation file
      await this.writeNavigationFile(navigationData);
      
      // Generate report if requested
      if (this.options.report) {
        await this.generateReport(validationResult, navigationData);
      }
      
      return validationResult;
    } catch (error) {
      this.logger.error('Failed to validate and output navigation', { error });
      return null;
    }
  }

  private async writeNavigationFile(navigationData: NavigationData): Promise<void> {
    try {
      const outputPath = path.resolve(this.options.output);
      const jsonContent = JSON.stringify(navigationData, null, 2);
      
      await fs.writeFile(outputPath, jsonContent, 'utf8');
      
      this.logger.info('Navigation file written successfully', {
        path: outputPath,
        size: jsonContent.length,
      });
    } catch (error) {
      this.logger.error('Failed to write navigation file', { error, path: this.options.output });
      throw error;
    }
  }

  private async generateReport(validationResult: ValidationResult, navigationData: NavigationData): Promise<void> {
    try {
      const reportPath = this.options.output.replace('.json', '-report.md');
      
      const report = this.buildMarkdownReport(validationResult, navigationData);
      
      await fs.writeFile(reportPath, report, 'utf8');
      
      this.logger.info('Report generated', {
        path: reportPath,
        valid: validationResult.valid,
        errors: validationResult.errors.length,
        warnings: validationResult.warnings.length,
      });
    } catch (error) {
      this.logger.error('Failed to generate report', { error });
    }
  }

  private buildMarkdownReport(validationResult: ValidationResult, navigationData: NavigationData): string {
    const timestamp = new Date().toISOString();
    const languages = Object.keys(navigationData.navbar).join(', ');
    
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
    report += `## Statistics\n\n`;
    report += `- **Total Categories:** ${validationResult.stats.totalCategories}\n`;
    report += `- **Total Documents:** ${validationResult.stats.totalDocuments}\n`;
    report += `- **Missing Translations:** ${validationResult.stats.missingTranslations}\n\n`;
    
    // Language Coverage
    report += `### Language Coverage\n\n`;
    for (const [lang, count] of Object.entries(validationResult.stats.languageCoverage)) {
      const percentage = validationResult.stats.totalDocuments > 0 
        ? Math.round((count / validationResult.stats.totalDocuments) * 100)
        : 0;
      report += `- **${lang.toUpperCase()}:** ${count} documents (${percentage}%)\n`;
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

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private printFinalSummary(scanResult: ScanResult, validationResult: ValidationResult) {
    console.log('\n' + '='.repeat(60));
    console.log('🎉 NAVIGATION GENERATION COMPLETE');
    console.log('='.repeat(60));
    
    console.log(`\n📄 Output: ${this.options.output}`);
    console.log(`⏱️  Duration: ${this.stats.elapsedTime}`);
    
    console.log(`\n📊 Statistics:`);
    console.log(`  Files processed: ${scanResult.files.length}`);
    console.log(`  Categories: ${validationResult.stats.totalCategories}`);
    console.log(`  Documents: ${validationResult.stats.totalDocuments}`);
    
    console.log(`\n🌍 Language Coverage:`);
    for (const [lang, count] of Object.entries(validationResult.stats.languageCoverage)) {
      const percentage = validationResult.stats.totalDocuments > 0 
        ? Math.round((count / validationResult.stats.totalDocuments) * 100)
        : 0;
      console.log(`  ${lang.toUpperCase()}: ${count} documents (${percentage}%)`);
    }
    
    console.log(`\n${validationResult.valid ? '✅' : '❌'} Validation: ${validationResult.valid ? 'PASSED' : 'FAILED'}`);
    
    if (this.stats.errors > 0) {
      console.log(`❌ Errors: ${this.stats.errors}`);
    }
    
    if (this.stats.warnings > 0) {
      console.log(`⚠️  Warnings: ${this.stats.warnings}`);
    }
    
    if (this.stats.errors === 0 && this.stats.warnings === 0) {
      console.log('🎯 No issues detected!');
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
  }
}

// Export helper function for command usage
export async function runGeneration(options: Partial<GenerationOptions>): Promise<boolean> {
  const generator = new NavigationGenerator(options);
  return await generator.generate();
}

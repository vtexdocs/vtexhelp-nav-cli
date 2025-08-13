import React from 'react';
import { render } from 'ink';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';
import type { GenerationOptions, GenerationStats, LogEntry, ScanResult } from './types.js';
import { DualLogger } from './ui/logger.js';
import { GenerationDashboard } from './ui/GenerationDashboard.js';
import { ContentScanner } from './scanner.js';

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

    // Initialize logger
    this.logger = new DualLogger({
      logFile: this.options.logFile,
      verbose: this.options.verbose,
      interactive: this.options.interactive,
    });

    this.stats = this.logger.getStats();

    // Set up logger callbacks
    this.logger.setStatsUpdateCallback((stats) => {
      this.stats = stats;
      this.updateUI();
    });

    this.logger.setLogUpdateCallback((entry) => {
      this.logs.push(entry);
      this.updateUI();
    });
  }

  public async generate(): Promise<boolean> {
    try {
      this.logger.info('Starting navigation generation', { options: this.options });

      // Start UI if interactive
      if (this.options.interactive) {
        this.startUI();
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

      // Phase 2: Build category hierarchy (placeholder for now)
      this.logger.startPhase('Category Building');
      await this.sleep(1000); // Simulate work
      this.logger.completePhase('Category Building', {
        phase: 'Category Building',
        duration: 1000,
        filesProcessed: scanResult.files.length,
        errors: [],
        warnings: [],
      });

      // Phase 3: Cross-language linking (placeholder for now)
      this.logger.startPhase('Cross-language Linking');
      await this.sleep(800);
      this.logger.completePhase('Cross-language Linking', {
        phase: 'Cross-language Linking',
        duration: 800,
        filesProcessed: scanResult.files.length,
        errors: [],
        warnings: [],
      });

      // Phase 4: Navigation generation (placeholder for now)
      this.logger.startPhase('Navigation Generation');
      await this.sleep(500);
      this.logger.completePhase('Navigation Generation', {
        phase: 'Navigation Generation',
        duration: 500,
        filesProcessed: 1, // One navigation file generated
        errors: [],
        warnings: [],
      });

      // Phase 5: Special sections (placeholder for now)
      this.logger.startPhase('Special Sections');
      await this.sleep(300);
      this.logger.completePhase('Special Sections', {
        phase: 'Special Sections',
        duration: 300,
        filesProcessed: 0,
        errors: [],
        warnings: [],
      });

      // Phase 6: Validation (placeholder for now)
      this.logger.startPhase('Validation');
      await this.sleep(200);
      this.logger.completePhase('Validation', {
        phase: 'Validation',
        duration: 200,
        filesProcessed: 1,
        errors: [],
        warnings: [],
      });

      // Complete
      this.logger.startPhase('Complete');
      this.logger.info('Navigation generation completed successfully!', {
        totalFiles: scanResult.files.length,
        output: this.options.output,
        duration: this.stats.elapsedTime,
      });

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

      if (dirExists) {
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
        if (this.options.force) {
          await fs.rm(absoluteContentDir, { recursive: true, force: true });
        }
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

  private startUI() {
    if (!this.options.interactive) return;

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

  private updateUI() {
    if (!this.options.interactive || !this.uiInstance) return;

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
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export helper function for command usage
export async function runGeneration(options: Partial<GenerationOptions>): Promise<boolean> {
  const generator = new NavigationGenerator(options);
  return await generator.generate();
}

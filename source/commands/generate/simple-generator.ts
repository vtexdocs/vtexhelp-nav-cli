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
import { DualLogger } from './ui/logger.js';

const CONTENT_REPO_URL = 'https://github.com/vtexdocs/help-center-content.git';
const KNOWN_ISSUES_REPO_URL = 'https://github.com/vtexdocs/known-issues.git';
const DEFAULT_CONTENT_DIR = '.vtexhelp-content';

export class SimpleNavigationGenerator {
  private options: GenerationOptions;
  private startTime: number;
  private allWarnings: string[] = [];
  private logger: DualLogger;

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
      showWarnings: options.showWarnings ?? false
    };
    // carry through non-typed flags
    (this.options as any).strict = (options as any).strict ?? false;
    
    this.startTime = Date.now();
    this.logger = new DualLogger(this.options);
  }

  private shouldIncludeKnownIssues(): boolean {
    // If no sections filter is specified, include everything (including known-issues)
    if (!this.options.sections || this.options.sections.length === 0) {
      return true;
    }
    // If sections filter is specified, check if known-issues is included
    return this.options.sections.includes('known-issues');
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
      if (this.shouldIncludeKnownIssues()) {
        console.log('🔧 Known Issues: Enabled');
      }
      console.log('');

      // Phase 0: Ensure content repository is available
      const contentReady = await this.ensureContentRepository();
      if (!contentReady) {
        this.log('error', 'Content repository not available');
        return false;
      }

      // Phase 0.5: Ensure known-issues repository if enabled
      if (this.shouldIncludeKnownIssues()) {
        const knownIssuesReady = await this.ensureKnownIssuesRepository();
        if (!knownIssuesReady) {
          this.log('error', 'Known-issues repository not available');
          return false;
        }
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
      const validationResult = await this.validateAndOutput(navigationData, scanResult);
      if (!validationResult) {
        this.log('error', 'Validation failed');
        return false;
      }
      if (this.options.validate && (this.options as any).strict && !validationResult.valid) {
        this.log('error', 'Strict mode: validation errors present. Aborting.');
        return false;
      }

      // Collect all warnings for display (if not already collected for report)
      if (!this.options.report) {
        this.collectWarnings(scanResult, validationResult);
      }
      
      // Print final summary
      this.printFinalSummary(scanResult, validationResult);
      
      // Display warnings if requested
      if (this.options.showWarnings && this.allWarnings.length > 0) {
        this.displayWarnings();
      }
      
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

  private async ensureKnownIssuesRepository(): Promise<boolean> {
    this.logPhase('Initializing Known Issues Repository');
    
    try {
      const knownIssuesDir = path.join(path.dirname(this.options.contentDir), '.vtexhelp-known-issues');
      const absoluteKnownIssuesDir = path.resolve(knownIssuesDir);
      const dirExists = await fs.stat(absoluteKnownIssuesDir).catch(() => false);

      if (dirExists && !this.options.force) {
        const docsPath = path.join(absoluteKnownIssuesDir, 'docs');
        const docsExists = await fs.stat(docsPath).catch(() => false);
        
        if (docsExists) {
          this.log('info', 'Using existing known-issues repository', { path: absoluteKnownIssuesDir });
          return true;
        }
        this.log('warn', 'Known-issues directory exists but no docs found, re-cloning');
      }
      
      if (dirExists) {
        this.log('info', 'Force flag set, removing existing known-issues directory');
        await fs.rm(absoluteKnownIssuesDir, { recursive: true, force: true });
      }

      this.log('info', 'Cloning known-issues repository', {
        url: KNOWN_ISSUES_REPO_URL,
        branch: 'main',
        target: knownIssuesDir
      });

      await execa('git', [
        'clone',
        '--depth', '1',
        '--branch', 'main',
        KNOWN_ISSUES_REPO_URL,
        knownIssuesDir
      ]);

      this.log('info', 'Known-issues repository cloned successfully');
      return true;

    } catch (error) {
      this.log('error', 'Failed to ensure known-issues repository', { error: error instanceof Error ? error.message : error });
      return false;
    }
  }

  private async scanContent(): Promise<ScanResult | null> {
    this.logPhase('Scanning Content Directory');
    
    try {
      // Use the same logger instance as the generator so all logs are captured together
      const scanner = new ContentScanner(this.logger, this.options);
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
      const categoryBuilder = new CategoryBuilder(this.logger, this.options);
      return await categoryBuilder.buildHierarchy(files);
    } catch (error) {
      this.log('error', 'Failed to build category hierarchy', { error: error instanceof Error ? error.message : error });
      return null;
    }
  }

  private async linkCrossLanguageDocuments(files: ContentFile[], hierarchy: CategoryHierarchy): Promise<CategoryHierarchy | null> {
    this.logPhase('Linking Cross-language Documents');
    
    try {
      const linker = new CrossLanguageLinker(this.logger, this.options);
      return await linker.linkDocuments(files, hierarchy);
    } catch (error) {
      this.log('error', 'Failed to link cross-language documents', { error: error instanceof Error ? error.message : error });
      return null;
    }
  }

  private async transformToNavigation(hierarchy: CategoryHierarchy): Promise<NavigationData | null> {
    this.logPhase('Transforming to Navigation Format');
    
    try {
      const transformer = new NavigationTransformer(this.logger, this.options);
      return await transformer.transformToNavigation(hierarchy);
    } catch (error) {
      this.log('error', 'Failed to transform to navigation', { error: error instanceof Error ? error.message : error });
      return null;
    }
  }

  private async validateAndOutput(navigationData: NavigationData, scanResult: ScanResult): Promise<ValidationResult | null> {
    this.logPhase('Validating and Writing Output');
    
    try {
      // Clean up the navigation data before validation to remove internal fields like 'order'
      const cleanedData = this.cleanupNavigationData(navigationData);
      
      const validator = new NavigationValidator(this.logger, this.options);
      const validationResult = await validator.validateNavigation(cleanedData);
      
      // Write navigation file (using the already cleaned data)
      await this.writeNavigationFile(cleanedData);
      
      // Generate report if requested (need to collect warnings first)
      if (this.options.report) {
        // Collect all warnings for report generation
        this.collectWarnings(scanResult, validationResult);
        await this.generateReport(validationResult, navigationData);
      }
      
      return validationResult;
    } catch (error) {
      this.log('error', 'Failed to validate and output navigation', { error: error instanceof Error ? error.message : error });
      return null;
    }
  }

  /**
   * Cleans up the navigation data to ensure schema compliance
   * Specifically, removes the 'order' field which is used internally
   * but not allowed in the schema
   */
  private cleanupNavigationData(navigationData: NavigationData): NavigationData {
    const cleanedData = JSON.parse(JSON.stringify(navigationData));

    // Function to recursively remove order property from all nodes
    const removeOrderFromNode = (node: any) => {
      if (node && typeof node === 'object') {
        // Delete order property if present
        if ('order' in node) {
          delete node.order;
        }
        
        // Process children recursively
        if (Array.isArray(node.children)) {
          node.children.forEach(removeOrderFromNode);
        }
        
        // Process categories in navbar items
        if (Array.isArray(node.categories)) {
          node.categories.forEach(removeOrderFromNode);
        }
      }
    };
    
    // Start the cleanup process from the navbar array
    if (cleanedData.navbar && Array.isArray(cleanedData.navbar)) {
      cleanedData.navbar.forEach(removeOrderFromNode);
    }
    
    return cleanedData;
  }
  
  private async writeNavigationFile(navigationData: NavigationData): Promise<void> {
    // navigationData is already cleaned, so we can write it directly
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
    
    // Files skipped due to parsing errors
    const parseErrors = this.logger
      .getLogs('error')
      .filter(log => log.message && typeof log.message === 'string' && log.message.includes('Failed to parse markdown file:'))
      .map(log => log.message);
    
    if (parseErrors.length > 0) {
      report += `\n## Files Skipped Due to Parse Errors\n\n`;
      report += `${parseErrors.length} files were skipped due to YAML frontmatter or markdown parsing errors:\n\n`;
      parseErrors.forEach(error => {
        report += `- ❌ ${error}\n`;
      });
      report += `\n> These files were not included in the navigation. Fix the YAML frontmatter issues to include them.\n`;
    }
    
    // All warnings collected
    if (this.allWarnings && this.allWarnings.length > 0) {
      report += `\n## All Warnings\n\n`;
      report += `Total warnings: ${this.allWarnings.length}\n\n`;
      
      const groupedWarnings = this.groupWarningsByType(this.allWarnings);
      for (const [type, warnings] of Object.entries(groupedWarnings)) {
        report += `### ${type} Warnings (${warnings.length})\n\n`;
        warnings.forEach(warning => {
          report += `- ⚠️ ${warning.replace(`[${type}] `, '')}\n`;
        });
        report += `\n`;
      }
    }
    
    // Duplicate slug errors (separate section for better visibility)
    const duplicateSlugErrors = validationResult.errors.filter(error => 
      error.includes('Duplicate slug') && !error.includes('among siblings')
    );
    const otherValidationErrors = validationResult.errors.filter(error => 
      !(error.includes('Duplicate slug') && !error.includes('among siblings'))
    );
    
    if (duplicateSlugErrors.length > 0) {
      report += `\n## Duplicate Slug Conflicts\n\n`;
      report += `Found ${duplicateSlugErrors.length} duplicate slug conflicts that need to be resolved:\n\n`;
      duplicateSlugErrors.forEach(error => {
        report += `- 🔗 ${error}\n`;
      });
      report += `\n> **Fix:** Rename categories or documents to ensure unique slugs within each navigation section.\n`;
    }
    
    // Other validation errors
    if (otherValidationErrors.length > 0) {
      report += `\n## Other Validation Errors\n\n`;
      otherValidationErrors.forEach(error => {
        report += `- ❌ ${error}\n`;
      });
    }
    
    // Validation warnings
    if (validationResult.warnings.length > 0) {
      report += `\n## Validation Warnings\n\n`;
      validationResult.warnings.forEach(warning => {
        report += `- ⚠️ ${warning}\n`;
      });
    }

    // Slug mismatch summary extracted from collected warnings/logs
    const slugMismatch = this.logger
      .getLogs('warn')
      .map(l => l.message)
      .filter(m => typeof m === 'string' && m.startsWith('SLUG_MISMATCH:'))

    if (slugMismatch.length > 0) {
      report += `\n## Slug mismatches (filename vs frontmatter)\n\n`;
      slugMismatch.forEach((m) => {
        report += `- ${m}\n`;
      });
      report += `\n> The generator used the filename-based slug for these entries to ensure runtime consistency.\n`;
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
    
    // Get parse error count
    const parseErrors = this.logger
      .getLogs('error')
      .filter(log => log.message && typeof log.message === 'string' && log.message.includes('Failed to parse markdown file:'))
      .length;
    
    console.log(`\n📊 Statistics:`);
    console.log(`  Files processed: ${scanResult.files.length}`);
    if (parseErrors > 0) {
      console.log(`  Files skipped (parse errors): ${parseErrors}`);
    }
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
    
    const duplicateSlugErrors = validationResult.errors.filter(error => 
      error.includes('Duplicate slug') && !error.includes('among siblings')
    );
    
    console.log(`\n${validationResult.valid ? '✅' : '❌'} Validation: ${validationResult.valid ? 'PASSED' : 'FAILED'}`);
    
    const errors = scanResult.stats.errors.length;
    const warnings = scanResult.stats.warnings.length + validationResult.warnings.length;
    
    if (errors > 0) {
      console.log(`❌ Errors: ${errors}`);
    }
    
    if (warnings > 0) {
      console.log(`⚠️  Warnings: ${warnings}`);
    }
    
    if (parseErrors > 0) {
      console.log(`🚫 Parse errors: ${parseErrors} (use --report for details)`);
    }
    
    if (duplicateSlugErrors.length > 0) {
      console.log(`🔗 Duplicate slug conflicts: ${duplicateSlugErrors.length}`);
    }
    
    if (errors === 0 && warnings === 0 && parseErrors === 0 && duplicateSlugErrors.length === 0) {
      console.log('🎯 No issues detected!');
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
  }

  private collectWarnings(scanResult: ScanResult, validationResult: ValidationResult) {
    // Collect warnings from all phases
    this.allWarnings = [];
    
    // Add scan warnings
    this.allWarnings.push(...scanResult.stats.warnings.map(w => `[SCAN] ${w}`));
    
    // Add validation warnings
    this.allWarnings.push(...validationResult.warnings.map(w => `[VALIDATION] ${w}`));
    
    // Add our own warning about special sections
    this.allWarnings.push('[GENERATION] Special sections handling not yet implemented');

    // Add slug mismatch warnings extracted from logs so we can print a summary later
    const slugMismatchLogs = this.logger
      .getLogs('warn')
      .map(l => l.message)
      .filter(m => typeof m === 'string' && m.startsWith('SLUG_MISMATCH:'))
    
    for (const msg of slugMismatchLogs) {
      this.allWarnings.push(`[SLUG] ${msg}`)
    }
  }
  
  private displayWarnings() {
    console.log('\n' + '⚠️'.repeat(20));
    console.log('🔍 DETAILED WARNINGS ANALYSIS');
    console.log('⚠️'.repeat(20));
    
    console.log(`\n📊 Total Warnings: ${this.allWarnings.length}\n`);
    
    // Group warnings by type
    const groupedWarnings = this.groupWarningsByType(this.allWarnings);
    
    for (const [type, warnings] of Object.entries(groupedWarnings)) {
      console.log(`📋 ${type} (${warnings.length} warnings):`);
      warnings.slice(0, 10).forEach((warning, i) => {
        console.log(`  ${i + 1}. ${warning.replace(`[${type}] `, '')}`);
      });
      
      if (warnings.length > 10) {
        console.log(`  ... and ${warnings.length - 10} more ${type.toLowerCase()} warnings`);
      }
      console.log('');
    }
    
    console.log('💡 Tip: Use --report to generate a detailed markdown report with all warnings');
    console.log('⚠️'.repeat(20) + '\n');
  }
  
  private groupWarningsByType(warnings: string[]): { [key: string]: string[] } {
    const grouped: { [key: string]: string[] } = {};
    
    for (const warning of warnings) {
      const match = warning.match(/^\[([A-Z]+)\]/);
      const type = match?.[1] ?? 'OTHER';
      
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(warning);
    }
    
    return grouped;
  }
}

// Export helper function for command usage
export async function runSimpleGeneration(options: Partial<GenerationOptions>): Promise<boolean> {
  const generator = new SimpleNavigationGenerator(options);
  return await generator.generate();
}

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
// Temporary type definition
type NavigationData = any;
import type { 
  ValidationResult,
  GenerationOptions,
  PhaseSummary 
} from './types.js';
import { DualLogger } from './ui/logger.js';

export class NavigationValidator {
  private logger: DualLogger;
  private options: GenerationOptions;
  private ajv: any;

  constructor(logger: DualLogger, options: GenerationOptions) {
    this.logger = logger;
    this.options = options;
    this.ajv = new (Ajv as any)({ allErrors: true });
  }

  public async validateNavigation(navigationData: NavigationData): Promise<ValidationResult> {
    this.logger.startPhase('Validation');
    const startTime = Date.now();
    
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      this.logger.info('Starting navigation validation', {
        languages: Object.keys(navigationData.navbar).length,
        totalSections: this.countTotalSections(navigationData),
      });

      // Load and validate against JSON schema (primary validation)
      const schemaValidation = await this.validateAgainstSchema(navigationData);
      errors.push(...schemaValidation.errors);
      warnings.push(...schemaValidation.warnings);

      // Basic content consistency checks
      const contentValidation = await this.validateContent(navigationData);
      warnings.push(...contentValidation.warnings);

      const stats = this.generateValidationStats(navigationData);
      
      const result: ValidationResult = {
        valid: errors.length === 0,
        errors,
        warnings,
        stats,
      };

      const duration = Date.now() - startTime;
      const summary: PhaseSummary = {
        phase: 'Validation',
        duration,
        filesProcessed: 1, // One navigation file validated
        errors,
        warnings,
        results: {
          valid: result.valid,
          totalErrors: errors.length,
          totalWarnings: warnings.length,
          stats,
        },
      };

      this.logger.completePhase('Validation', summary);

      if (result.valid) {
        this.logger.info('Navigation validation passed', {
          warnings: warnings.length,
          stats,
          duration: `${duration}ms`,
        });
      } else {
        this.logger.error('Navigation validation failed', {
          errors: errors.length,
          warnings: warnings.length,
          duration: `${duration}ms`,
        });
      }

      return result;

    } catch (error) {
      const errorMsg = `Validation process failed: ${error}`;
      errors.push(errorMsg);
      this.logger.error(errorMsg, { error });

      const duration = Date.now() - startTime;
      this.logger.completePhase('Validation', {
        phase: 'Validation',
        duration,
        filesProcessed: 0,
        errors,
        warnings,
      });

      return {
        valid: false,
        errors,
        warnings,
        stats: {
          totalCategories: 0,
          totalDocuments: 0,
          languageCoverage: {},
          missingTranslations: 0,
        },
      };
    }
  }

  private async validateAgainstSchema(navigationData: NavigationData): Promise<{ errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Load navigation schema relative to this file so it works in both src and dist
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      // ../../schemas from source/commands/generate -> source/schemas
      // and the same ../../schemas from dist/commands/generate -> dist/schemas
      const schemaPath = path.join(__dirname, '../../schemas/navigation.schema.json');
      const schemaContent = await fs.readFile(schemaPath, 'utf8');
      const schema = JSON.parse(schemaContent);

      // Compile schema
      const validate = this.ajv.compile(schema);

      // Validate navigation data
      const isValid = validate(navigationData);

      if (!isValid && validate.errors) {
        for (const error of validate.errors) {
          const errorMsg = `Schema validation: ${error.instancePath} ${error.message}`;
          errors.push(errorMsg);
          
          this.logger.debug('Schema validation error', {
            path: error.instancePath,
            message: error.message,
            data: error.data,
            schema: error.schema,
          });
        }
      }

      this.logger.info('Schema validation completed', {
        valid: isValid,
        errors: errors.length,
      });

    } catch (error) {
      const errorMsg = `Failed to load or validate schema: ${error}`;
      errors.push(errorMsg);
      this.logger.error(errorMsg, { error });
    }

    return { errors, warnings };
  }





  private async validateContent(navigationData: NavigationData): Promise<{ warnings: string[] }> {
    const warnings: string[] = [];

    // Check for duplicate slugs within each section (slugs should be unique per section)
    if (Array.isArray(navigationData.navbar)) {
      for (const section of navigationData.navbar) {
        const sectionSlugWarnings = this.validateSectionSlugs(section);
        warnings.push(...sectionSlugWarnings);
      }
    }

    this.logger.info('Content validation completed', {
      warnings: warnings.length,
    });

    return { warnings };
  }

  private validateSectionSlugs(section: any): string[] {
    const warnings: string[] = [];
    
    if (!section.categories || !Array.isArray(section.categories)) {
      return warnings;
    }
    
    const sectionName = section.documentation || 'unknown';
    
    // For unified structure, we check slug uniqueness within the entire section
    // since the navigation uses unified multilingual documents
    const slugsInSection = new Set<string>();
    
    this.checkSlugsInSection(section.categories, slugsInSection, warnings, sectionName);
    
    return warnings;
  }
  
  private checkSlugsInSection(nodes: any[], slugs: Set<string>, warnings: string[], sectionName: string) {
    for (const node of nodes) {
      if (node.slug && node.type === 'markdown') {
        // Only check slug uniqueness for documents, not categories
        const slugValue = typeof node.slug === 'string' ? node.slug : node.slug.en || Object.values(node.slug)[0];
        
        if (slugValue) {
          if (slugs.has(slugValue)) {
            warnings.push(`Duplicate slug '${slugValue}' found in section '${sectionName}'`);
          } else {
            slugs.add(slugValue);
          }
        }
      }

      if (node.children && Array.isArray(node.children)) {
        this.checkSlugsInSection(node.children, slugs, warnings, sectionName);
      }
    }
  }



  private generateValidationStats(navigationData: NavigationData): ValidationResult['stats'] {
    let totalCategories = 0;
    let totalDocuments = 0;
    const languageCoverage: { [lang: string]: number } = {};

    if (Array.isArray(navigationData.navbar)) {
      for (const section of navigationData.navbar) {
        if (section.categories && Array.isArray(section.categories)) {
          const sectionStats = this.countSectionNodes(section.categories);
          totalCategories += sectionStats.categories;
          totalDocuments += sectionStats.documents;
        }
      }

      // For unified structure, all languages have the same coverage
      for (const lang of this.options.languages) {
        languageCoverage[lang] = totalDocuments;
      }
    }

    return {
      totalCategories,
      totalDocuments,
      languageCoverage,
      missingTranslations: 0, // No missing translations in unified structure
    };
  }

  private countSectionNodes(nodes: any[]): { categories: number; documents: number } {
    let categories = 0;
    let documents = 0;

    for (const node of nodes) {
      if (node.type === 'markdown') {
        // This is a document (per navigation schema)
        documents++;
      } else if (node.type === 'category') {
        // This is a category (per navigation schema)
        categories++;
        if (node.children && Array.isArray(node.children)) {
          // Recursively count children
          const childStats = this.countSectionNodes(node.children);
          categories += childStats.categories;
          documents += childStats.documents;
        }
      }
    }

    return { categories, documents };
  }

  private countTotalSections(navigationData: NavigationData): number {
    return Array.isArray(navigationData.navbar) ? navigationData.navbar.length : 0;
  }
}

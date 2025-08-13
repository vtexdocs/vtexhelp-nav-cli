import { promises as fs } from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import type { NavigationData } from '../../types/navigation.js';
import type { 
  ValidationResult,
  GenerationOptions,
  PhaseSummary 
} from './types.js';
import { DualLogger } from './ui/logger.js';

export class NavigationValidator {
  private logger: DualLogger;
  private options: GenerationOptions;
  private ajv: Ajv;

  constructor(logger: DualLogger, options: GenerationOptions) {
    this.logger = logger;
    this.options = options;
    this.ajv = new Ajv({ allErrors: true });
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

      // Load and validate against JSON schema
      const schemaValidation = await this.validateAgainstSchema(navigationData);
      errors.push(...schemaValidation.errors);
      warnings.push(...schemaValidation.warnings);

      // Perform structural validation
      const structuralValidation = await this.validateStructure(navigationData);
      errors.push(...structuralValidation.errors);
      warnings.push(...structuralValidation.warnings);

      // Validate content consistency
      const contentValidation = await this.validateContent(navigationData);
      errors.push(...contentValidation.errors);
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
      // Load navigation schema
      const schemaPath = path.resolve(process.cwd(), 'source/schemas/navigation.schema.json');
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

  private async validateStructure(navigationData: NavigationData): Promise<{ errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate navbar structure
    if (!navigationData.navbar || typeof navigationData.navbar !== 'object') {
      errors.push('Navigation must have a navbar object');
      return { errors, warnings };
    }

    // Validate each language
    for (const [language, sections] of Object.entries(navigationData.navbar)) {
      if (!Array.isArray(sections)) {
        errors.push(`Language ${language} must have an array of sections`);
        continue;
      }

      // Check for required languages
      if (this.options.languages.includes(language as any)) {
        this.logger.debug(`Validating language: ${language}`, { sections: sections.length });
      } else {
        warnings.push(`Unexpected language in navigation: ${language}`);
      }

      // Validate each section
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        const sectionPath = `${language}.sections[${i}]`;
        
        const sectionValidation = this.validateSection(section, sectionPath);
        errors.push(...sectionValidation.errors);
        warnings.push(...sectionValidation.warnings);
      }
    }

    // Check for missing languages
    for (const expectedLang of this.options.languages) {
      if (!navigationData.navbar[expectedLang]) {
        errors.push(`Missing navigation for language: ${expectedLang}`);
      }
    }

    this.logger.info('Structure validation completed', {
      errors: errors.length,
      warnings: warnings.length,
    });

    return { errors, warnings };
  }

  private validateSection(section: any, path: string): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!section.documentation) {
      errors.push(`${path}: Section missing 'documentation' field`);
    }

    if (!section.name) {
      errors.push(`${path}: Section missing 'name' field`);
    } else {
      // Validate localized names
      const nameValidation = this.validateLocalizedString(section.name, `${path}.name`);
      errors.push(...nameValidation.errors);
      warnings.push(...nameValidation.warnings);
    }

    if (!section.slugPrefix) {
      errors.push(`${path}: Section missing 'slugPrefix' field`);
    }

    if (!Array.isArray(section.categories)) {
      errors.push(`${path}: Section must have 'categories' array`);
    } else {
      // Validate categories
      for (let i = 0; i < section.categories.length; i++) {
        const category = section.categories[i];
        const categoryPath = `${path}.categories[${i}]`;
        
        const categoryValidation = this.validateNavigationNode(category, categoryPath);
        errors.push(...categoryValidation.errors);
        warnings.push(...categoryValidation.warnings);
      }
    }

    return { errors, warnings };
  }

  private validateNavigationNode(node: any, path: string): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!node.name) {
      errors.push(`${path}: Node missing 'name' field`);
    } else {
      // Validate localized names
      const nameValidation = this.validateLocalizedString(node.name, `${path}.name`);
      errors.push(...nameValidation.errors);
      warnings.push(...nameValidation.warnings);
    }

    // Optional slug validation
    if (node.slug) {
      if (typeof node.slug !== 'string' && typeof node.slug !== 'object') {
        errors.push(`${path}: Invalid slug type (must be string or localized object)`);
      } else if (typeof node.slug === 'object') {
        const slugValidation = this.validateLocalizedString(node.slug, `${path}.slug`);
        errors.push(...slugValidation.errors);
        warnings.push(...slugValidation.warnings);
      }
    }

    // Validate children if present
    if (node.children) {
      if (!Array.isArray(node.children)) {
        errors.push(`${path}: Children must be an array`);
      } else {
        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i];
          const childPath = `${path}.children[${i}]`;
          
          const childValidation = this.validateNavigationNode(child, childPath);
          errors.push(...childValidation.errors);
          warnings.push(...childValidation.warnings);
        }
      }
    }

    return { errors, warnings };
  }

  private validateLocalizedString(localizedString: any, path: string): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof localizedString !== 'object') {
      errors.push(`${path}: Must be a localized object`);
      return { errors, warnings };
    }

    // Check for required languages
    for (const expectedLang of this.options.languages) {
      if (!localizedString[expectedLang]) {
        warnings.push(`${path}: Missing translation for language '${expectedLang}'`);
      } else if (typeof localizedString[expectedLang] !== 'string') {
        errors.push(`${path}: Translation for '${expectedLang}' must be a string`);
      }
    }

    return { errors, warnings };
  }

  private async validateContent(navigationData: NavigationData): Promise<{ errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for duplicate slugs within each language
    for (const [language, sections] of Object.entries(navigationData.navbar)) {
      const slugs = new Set<string>();
      const duplicateCheck = this.collectAndCheckSlugs(sections, slugs, `${language}`);
      errors.push(...duplicateCheck.errors);
      warnings.push(...duplicateCheck.warnings);
    }

    // Check cross-language consistency
    const languageKeys = Object.keys(navigationData.navbar);
    if (languageKeys.length > 1) {
      const consistencyCheck = this.validateCrossLanguageConsistency(navigationData);
      warnings.push(...consistencyCheck.warnings);
    }

    this.logger.info('Content validation completed', {
      errors: errors.length,
      warnings: warnings.length,
    });

    return { errors, warnings };
  }

  private collectAndCheckSlugs(
    nodes: any[], 
    slugs: Set<string>, 
    path: string
  ): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const node of nodes) {
      if (node.slug) {
        const slugValue = typeof node.slug === 'string' ? node.slug : node.slug.en || Object.values(node.slug)[0];
        
        if (slugValue) {
          if (slugs.has(slugValue)) {
            errors.push(`Duplicate slug found: ${slugValue} in ${path}`);
          } else {
            slugs.add(slugValue);
          }
        }
      }

      if (node.children && Array.isArray(node.children)) {
        const childCheck = this.collectAndCheckSlugs(node.children, slugs, path);
        errors.push(...childCheck.errors);
        warnings.push(...childCheck.warnings);
      }
    }

    return { errors, warnings };
  }

  private validateCrossLanguageConsistency(navigationData: NavigationData): { warnings: string[] } {
    const warnings: string[] = [];

    // This is a simplified implementation
    // In a complete version, we would compare structure across languages
    // to ensure they have similar navigation hierarchies

    const languages = Object.keys(navigationData.navbar);
    const sectionCounts: { [lang: string]: number } = {};

    for (const [language, sections] of Object.entries(navigationData.navbar)) {
      sectionCounts[language] = sections.length;
    }

    // Check if all languages have similar section counts
    const counts = Object.values(sectionCounts);
    const maxCount = Math.max(...counts);
    const minCount = Math.min(...counts);

    if (maxCount - minCount > 1) {
      warnings.push('Languages have significantly different numbers of sections, check for missing translations');
    }

    return { warnings };
  }

  private generateValidationStats(navigationData: NavigationData): ValidationResult['stats'] {
    let totalCategories = 0;
    let totalDocuments = 0;
    const languageCoverage: { [lang: string]: number } = {};

    for (const [language, sections] of Object.entries(navigationData.navbar)) {
      let langDocuments = 0;
      
      for (const section of sections) {
        const sectionStats = this.countSectionNodes(section.categories);
        totalCategories += sectionStats.categories;
        langDocuments += sectionStats.documents;
      }

      languageCoverage[language] = langDocuments;
      totalDocuments = Math.max(totalDocuments, langDocuments);
    }

    // Calculate missing translations
    const missingTranslations = Object.values(languageCoverage)
      .reduce((total, count) => total + (totalDocuments - count), 0);

    return {
      totalCategories,
      totalDocuments,
      languageCoverage,
      missingTranslations,
    };
  }

  private countSectionNodes(nodes: any[]): { categories: number; documents: number } {
    let categories = 0;
    let documents = 0;

    for (const node of nodes) {
      if (node.children && Array.isArray(node.children)) {
        if (node.children.length > 0 && node.children[0].children) {
          // This is a category with subcategories
          categories++;
          const childStats = this.countSectionNodes(node.children);
          categories += childStats.categories;
          documents += childStats.documents;
        } else {
          // This is a category with documents
          categories++;
          documents += node.children.length;
        }
      } else {
        // This is a document
        documents++;
      }
    }

    return { categories, documents };
  }

  private countTotalSections(navigationData: NavigationData): number {
    return Object.values(navigationData.navbar)
      .reduce((total, sections) => total + sections.length, 0);
  }
}

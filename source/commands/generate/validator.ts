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

      // Custom structural checks we care about
      const custom = this.customChecks(navigationData);
      errors.push(...custom.errors);
      warnings.push(...custom.warnings);

      // Basic content consistency checks
      const contentValidation = await this.validateContent(navigationData);
      warnings.push(...contentValidation.warnings);
      errors.push(...contentValidation.errors);

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





  private customChecks(navigationData: NavigationData): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check sibling category english slug uniqueness per parent
    const checkCategoryUniq = (nodes: any[], path: string[]) => {
      const seen = new Map<string, number>();
      for (const n of nodes || []) {
        if (n?.type === 'category') {
          const key = typeof n.slug === 'string' ? n.slug : n.slug?.en || '';
          if (key) {
            const prev = seen.get(key) || 0;
            seen.set(key, prev + 1);
          }
        }
      }
      for (const [k, count] of seen) {
        if (count > 1) {
          errors.push(`Duplicate category englishSlug '${k}' among siblings at ${path.join(' > ')}`);
        }
      }
      for (const n of nodes || []) {
        if (n?.type === 'category' && Array.isArray(n.children)) {
          checkCategoryUniq(n.children, [...path, (n.name?.en || '(category)')]);
        }
      }
    };

    // Run per section
    for (const section of navigationData.navbar || []) {
      if (Array.isArray(section.categories)) {
        checkCategoryUniq(section.categories, [section.documentation || 'section']);
      }
    }

    return { errors, warnings };
  }

  private async validateContent(navigationData: NavigationData): Promise<{ warnings: string[]; errors: string[] }> {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check for duplicate slugs within each section (slugs should be unique per section/language)
    if (Array.isArray(navigationData.navbar)) {
      for (const section of navigationData.navbar) {
        const slugValidation = this.validateSectionSlugs(section);
        warnings.push(...slugValidation.warnings);
        errors.push(...slugValidation.errors);
      }
    }

    this.logger.info('Content validation completed', {
      warnings: warnings.length,
      errors: errors.length,
    });

    return { warnings, errors };
  }

  private validateSectionSlugs(section: any): { warnings: string[]; errors: string[] } {
    const warnings: string[] = [];
    const errors: string[] = [];
    
    if (!section.categories || !Array.isArray(section.categories)) {
      return { warnings, errors };
    }
    
    const sectionName = section.documentation || 'unknown';
    
    // Check slug uniqueness for each language within the section
    for (const language of this.options.languages) {
      const slugDuplicates = this.findSlugDuplicatesInSection(section, language);
      
      for (const duplicate of slugDuplicates) {
        if (duplicate.slug === '') {
          // Empty slugs are errors (likely from parsing failures)
          errors.push(`Empty slug found for ${duplicate.items.length} documents in section '${sectionName}' (${language}): ${duplicate.items.map(item => item.name).join(', ')}`);
        } else {
          // Non-empty duplicate slugs are errors as they break navigation
          const itemDescriptions = duplicate.items.map(item => `${item.type}:'${item.name}' at '${item.path}'`);
          errors.push(`Duplicate slug '${duplicate.slug}' found ${duplicate.items.length} times in section '${sectionName}' (${language}): ${itemDescriptions.join(', ')}`);
        }
      }
    }
    
    return { warnings, errors };
  }
  
  private findSlugDuplicatesInSection(section: any, language: string): Array<{
    slug: string;
    items: Array<{ type: string; name: string; path: string }>
  }> {
    const slugMap = new Map<string, Array<{ type: string; name: string; path: string }>>();
    
    // Collect all slugs (categories and documents) within this section for the specified language
    this.collectSlugsFromCategories(section.categories, language, slugMap, []);
    
    // Filter to only duplicates (more than one occurrence)
    const duplicates: Array<{ slug: string; items: Array<{ type: string; name: string; path: string }> }> = [];
    
    for (const [slug, items] of slugMap.entries()) {
      if (items.length > 1) {
        duplicates.push({ slug, items });
      }
    }
    
    return duplicates;
  }
  
  private collectSlugsFromCategories(
    categories: any[], 
    language: string, 
    slugMap: Map<string, Array<{ type: string; name: string; path: string }>>,
    pathSegments: string[]
  ) {
    for (const category of categories) {
      // Collect category slug
      const categorySlug = this.getSlugForLanguage(category.slug, language);
      const categoryName = this.getNameForLanguage(category.name, language);
      const currentPath = [...pathSegments, categoryName || 'Unknown Category'];
      
      if (categorySlug !== null) {
        const categoryInfo = { 
          type: 'category', 
          name: categoryName || 'Unknown Category',
          path: currentPath.join(' > ')
        };
        if (!slugMap.has(categorySlug)) {
          slugMap.set(categorySlug, []);
        }
        slugMap.get(categorySlug)!.push(categoryInfo);
      }
      
      // Collect document slugs and recurse into nested categories from children
      if (category.children && Array.isArray(category.children)) {
        const nestedCategories: any[] = [];
        
        for (const child of category.children) {
          if (child.type === 'document') {
            // Handle documents
            const documentSlug = this.getSlugForLanguage(child.slug, language);
            const documentName = this.getNameForLanguage(child.name, language);
            
            if (documentSlug !== null) {
              const documentInfo = { 
                type: 'document', 
                name: documentName || 'Unknown Document',
                path: [...currentPath, documentName || 'Unknown Document'].join(' > ')
              };
              if (!slugMap.has(documentSlug)) {
                slugMap.set(documentSlug, []);
              }
              slugMap.get(documentSlug)!.push(documentInfo);
            }
          } else if (child.type === 'category') {
            // Collect nested categories for recursion
            nestedCategories.push(child);
          }
        }
        
        // Recurse into nested categories only
        if (nestedCategories.length > 0) {
          this.collectSlugsFromCategories(nestedCategories, language, slugMap, currentPath);
        }
      }
    }
  }
  
  private getSlugForLanguage(slugObj: any, language: string): string | null {
    if (typeof slugObj === 'string') {
      return slugObj;
    }
    if (slugObj && typeof slugObj === 'object') {
      return slugObj[language] || slugObj.en || Object.values(slugObj)[0] || null;
    }
    return null;
  }
  
  private getNameForLanguage(nameObj: any, language: string): string | null {
    if (typeof nameObj === 'string') {
      return nameObj;
    }
    if (nameObj && typeof nameObj === 'object') {
      return nameObj[language] || nameObj.en || Object.values(nameObj)[0] || null;
    }
    return null;
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

# Navigation Generation Implementation Plan

## Overview
The VTEX Help Center content repository has a clear file structure that maps to the navigation.json format. The content is organized by language (`en`, `es`, `pt`) with markdown files containing frontmatter metadata.

## Repository Structure Analysis

```
docs/
├── en/
│   ├── tutorials/       # Tutorial content
│   ├── tracks/          # Learning tracks
│   ├── faq/            # FAQ section
│   ├── announcements/  # News/announcements
│   └── troubleshooting/ # Known issues
├── es/                 # Spanish translations
└── pt/                 # Portuguese translations
```

### Markdown File Structure
Each markdown file contains frontmatter with:
- `title`: Document title
- `id`: Unique identifier
- `status`: Publication status (PUBLISHED, DRAFT, etc.)
- `slugEN`: English slug (used for cross-language linking)
- `locale`: Language code
- `subcategoryId`: Category relationship

## Implementation Plan

### Phase 1: Directory Scanner
Create a module to scan the file system and build the initial structure:

```typescript
interface ContentFile {
  path: string;
  language: Language;
  section: string;  // tutorials, tracks, etc.
  category: string;
  subcategory?: string;
  metadata: FrontMatter;
}

interface FrontMatter {
  title: string;
  id: string;
  status: string;
  slugEN: string;
  locale: string;
  subcategoryId?: string;
  createdAt: string;
  updatedAt: string;
}
```

**Implementation steps:**
1. Recursively scan `docs/` directory
2. Parse markdown files using gray-matter
3. Extract frontmatter metadata
4. Build a map of files by language and category

### Phase 2: Category Hierarchy Builder
Build the hierarchical structure from flat files:

```typescript
interface CategoryMap {
  [categoryPath: string]: {
    name: LocalizedString;
    children: CategoryMap | DocumentInfo[];
  }
}
```

**Implementation steps:**
1. Group files by their directory path
2. Infer category names from folder names (need mapping/normalization)
3. Create parent-child relationships based on directory nesting
4. Handle special cases (e.g., `catalog-overview` → "Catalog Overview")

### Phase 3: Cross-Language Linking
Link documents across languages using `slugEN`:

```typescript
interface CrossLanguageDocument {
  en?: DocumentInfo;
  es?: DocumentInfo;
  pt?: DocumentInfo;
  slugEN: string;
}
```

**Implementation steps:**
1. Build a map of all documents by `slugEN`
2. Group documents with the same `slugEN`
3. Merge titles and create localized names
4. Handle missing translations (fallback to English)

### Phase 4: Navigation Structure Generator
Transform the processed data into the navigation.json format:

```typescript
interface NavigationSection {
  documentation: string;
  name: LocalizedString;
  slugPrefix: string;
  categories: NavigationNode[];
}
```

**Mapping Rules:**
- `docs/en/tutorials/` → `{ documentation: "tutorials", slugPrefix: "docs/tutorials" }`
- `docs/en/tracks/` → `{ documentation: "tracks", slugPrefix: "docs/tracks" }`
- Directory names → Category names (with formatting)
- Markdown files → Document nodes

### Phase 5: Special Sections Handler
Handle special sections with different structures:

1. **Announcements/News**: 
   - Organized by year/month
   - Files prefixed with dates (YYYY-MM-DD)
   - Generate month-based categories

2. **FAQ/Troubleshooting**:
   - Flatter structure
   - May need custom categorization

3. **Tracks**:
   - Multi-level learning paths
   - May have ordering/prerequisites

### Phase 6: Validation & Output
Validate and write the final navigation:

1. Validate against our JSON schema
2. Check for:
   - Missing translations
   - Broken references
   - Duplicate slugs
   - Invalid characters in slugs
3. Generate report of issues
4. Write navigation.json

## Code Structure

```typescript
// source/commands/generate/
├── scanner.ts          // File system scanner
├── parser.ts           // Markdown/frontmatter parser
├── categorizer.ts      // Category hierarchy builder
├── linker.ts           // Cross-language linker
├── transformer.ts      // Navigation structure transformer
├── specialSections.ts  // Special section handlers
├── validator.ts        // Schema validator
└── index.ts           // Main orchestrator
```

## Command Implementation

```typescript
generate
  --content-dir <dir>    // Content repository location
  --output <file>        // Output navigation.json path
  --validate             // Validate against existing navigation
  --report               // Generate detailed report
  --fix                  // Auto-fix common issues
  --languages <langs>    // Languages to process (default: all)
  --sections <sections>  // Sections to process (default: all)
```

## Key Challenges & Solutions

### 1. Category Name Normalization
**Challenge**: Directory names like "catalog-overview" need proper formatting
**Solution**: Create a normalization map and title case converter

### 2. Missing Translations
**Challenge**: Not all documents exist in all languages
**Solution**: Use English as fallback, mark missing translations in report

### 3. Slug Generation
**Challenge**: Need consistent slugs across languages
**Solution**: Use `slugEN` from frontmatter as canonical slug

### 4. Category vs Document Detection
**Challenge**: Distinguishing between category folders and document folders
**Solution**: Check for presence of markdown files vs subdirectories

### 5. Special Characters in Titles
**Challenge**: Titles may contain HTML/special characters
**Solution**: HTML entity decoder and sanitization

## Testing Strategy

1. **Unit Tests**:
   - Parser functions
   - Category builder
   - Slug generation
   - Validation rules

2. **Integration Tests**:
   - Full generation from sample content
   - Comparison with existing navigation.json
   - Schema validation

3. **Edge Cases**:
   - Empty directories
   - Missing frontmatter
   - Duplicate slugs
   - Circular references

## Success Metrics

- Generated navigation passes schema validation
- All published documents are included
- Cross-language links are preserved
- Category hierarchy matches directory structure
- Generation completes in < 10 seconds
- Clear error reporting for issues

## Next Steps

1. Implement Phase 1 (Scanner) with basic file reading
2. Add Phase 2 (Parser) with gray-matter integration
3. Test with small subset of content
4. Iterate based on actual data patterns
5. Add remaining phases incrementally
6. Compare output with existing navigation.json
7. Add auto-fix capabilities for common issues

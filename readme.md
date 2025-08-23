# VTEX Navigation CLI

A comprehensive command-line tool for both **generating** and **viewing** VTEX documentation navigation structures.

## Features

### 🏗️ Navigation Generation
- 🤖 **Intelligent Generation**: Automatically generates navigation from VTEX Help Center content repository
- 🎯 **Simple Generation**: Console-only generator focused on speed and clarity
- 🌍 **Multi-language Support**: Processes English, Spanish, and Portuguese content with proper localized slugs
- 🔗 **Cross-language Linking**: Automatically links related documents across languages
- 📝 **Smart Slug Generation**: Prioritizes `legacySlug` → filename-based → empty string for missing translations
- 🔍 **Intelligent Duplicate Detection**: Only warns about true duplicates (same section + language), not multilingual documents
- 📊 **Validation & Reports**: Built-in validation with detailed reporting capabilities
- ⚡ **Performance Optimized**: Simple mode offers ~13% better performance

### 🌳 Interactive Viewer
- 🌳 **Interactive Tree View**: Navigate through the VTEX documentation structure with keyboard controls
- 🌍 **Multi-language Support**: Switch between English, Spanish, and Portuguese on the fly
- 📊 **Statistics**: View detailed statistics about the documentation structure
- 💾 **Auto-download**: Automatically downloads the navigation file if not present locally
- ⚡ **Fast Navigation**: Keyboard shortcuts for efficient browsing

## Installation

```bash
npm install -g vtexhelp-nav-cli
```

Or run directly with npx:

```bash
npx vtexhelp-nav-cli
```

## Usage

Note: The executable name is vtex-nav (alias: vtexhelp-nav-cli).

### 🏗️ Navigation Generation

The CLI currently provides a simple, console-only generation command:

#### Simple Mode (Recommended for CI/CD)
```bash
# Generate navigation with clean console output
vtexhelp-nav gen

# Generate with custom options
vtexhelp-nav gen --output custom-nav.json --verbose --force

# Generate specific languages only
vtexhelp-nav gen --languages en,es --report
```


#### Generation Options
```
Options:
  -d, --content-dir <dir>    Directory to clone/use content from (default: ".vtexhelp-content")
  -o, --output <file>        Output navigation.json file path (default: "generated-navigation.json")
  --validate                 Validate against existing navigation schema (default: true)
  --report                   Generate detailed report (default: false)
  --fix                      Auto-fix common issues (default: false)
  --strict                   Fail generation when validation errors are found (default: false)
  -l, --languages <langs>    Comma-separated languages to process (en,es,pt) (default: "en,es,pt")
  -s, --sections <sections>  Comma-separated sections to process (leave empty for all)
  -v, --verbose              Show detailed log lines in terminal (default: false)
  -b, --branch <branch>      Git branch to clone (default: "main")
  -f, --force                Force overwrite existing content directory (default: false)
  --log-file <file>          Export detailed logs to file
  --show-warnings            Display detailed analysis of all warnings (default: false)
```

### ✅ Validation

Validate a navigation.json file (schema + custom cross-node checks):

```bash
# Validate and print issues (non-zero exit only if --strict)
vtex-nav validate ./public/navigation.json

# Fail the build if any errors are found
vtex-nav validate ./public/navigation.json --strict
```

What’s validated:
- Structural JSON Schema (Draft-07)
  - name and slug are LocalizedString objects with en, es, pt keys
  - Categories: type=category, children min 1
  - Documents: type=markdown, children must be empty
  - Additional properties are rejected for safety
- Custom rule: sibling categories under the same parent must have unique english slug (slug.en)

Notes:
- Empty strings are allowed in LocalizedString fields to indicate a missing translation. This keeps the structure consistent while signalling gaps.

### 🌳 Viewing Navigation

#### Basic Viewer Usage

```bash
# Run the interactive viewer (downloads navigation.json if not present)
vtex-nav view

# Use a specific navigation file
vtex-nav view --file ./custom-navigation.json

# Start in a specific language
vtex-nav view --language es
```

#### Viewer Options

```
Options:
  --file, -f     Path to navigation.json file
  --language, -l Language to use (en, es, pt) [default: en]
  --help         Show help
```

### Keyboard Shortcuts

#### Navigation
- `↑/↓` - Navigate up/down through items
- `PgUp/PgDn` - Navigate faster (10 items at a time)
- `Space` or `Enter` - Expand/collapse current item
- `a` - Toggle all items expanded/collapsed

#### Language
- `e` - Switch to English
- `s` - Switch to Spanish  
- `p` - Switch to Portuguese

#### Other
- `h` or `?` - Toggle help screen
- `i` - Toggle statistics view
- `q` or `Esc` - Quit the application

## Configuration

You can configure the tool using environment variables:

Create a `.env` file in your project root:

```env
# URL to fetch navigation.json from
VTEX_NAVIGATION_URL=https://newhelp.vtex.com/navigation.json

# Default output path for downloaded navigation
DEFAULT_OUTPUT_PATH=./navigation.json

# Auto-format JSON output
AUTO_FORMAT_JSON=true

# Request timeout in milliseconds
REQUEST_TIMEOUT=30000
```

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/vtexhelp-nav-cli.git
cd vtexhelp-nav-cli

# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev
```

### Temporary caches and external repositories

This project clones content repositories locally for generation. These folders are temporary, ignored by Git, and can be safely deleted at any time:

- .vtexhelp-content — VTEX Help Center content clone
- .vtexhelp-known-issues — Known issues repository clone used for categorization

If either folder is missing, the generator will fetch it automatically when needed.

### Project Structure

```
vtexhelp-nav-cli/
├── source/
│   ├── app.tsx                        # Main viewer app component
│   ├── cli.tsx                        # CLI entry point and command routing
│   ├── NavigationTree.tsx             # Interactive tree component
│   ├── commands/
│   │   ├── generate-simple.tsx        # Simple mode generation command
│   │   ├── generateCommand.ts         # Command definitions and options
│   │   └── generate/                  # Generation system
│   │       ├── index.ts               # Main generation orchestrator
│   │       ├── simple-generator.ts    # Simple mode generator (Ink-free)
│   │       ├── scanner.ts             # Content repository scanner
│   │       ├── categorizer.ts         # Category hierarchy builder
│   │       ├── linker.ts              # Cross-language document linker
│   │       ├── transformer.ts         # Navigation format transformer
│   │       ├── external-repositories.ts # Handles cloning/using external content repos
│   │       ├── validator.ts           # Navigation validation engine
│   │       ├── types.ts               # Generation-specific types
│   │       └── ui/                    # Interactive UI components
│   │           ├── GenerationDashboard.tsx  # Main dashboard
│   │           ├── ProgressBar.tsx           # Progress visualization
│   │           ├── StatsPanel.tsx            # Statistics display
│   │           └── logger.ts                 # Dual-mode logger
│   ├── types/
│   │   └── navigation.ts              # Core navigation types
│   ├── services/
│   │   └── navigationService.ts       # Navigation data service
│   ├── config/
│   │   └── config.ts                  # Configuration management
│   └── utils/
│       └── validateSchema.ts          # Schema validation utilities
├── source/schemas/
│   └── navigation.schema.json         # JSON schema for validation
└── dist/                              # Compiled TypeScript output
```

## Examples

### 🏗️ Generation Workflow

```bash
# 1. Generate navigation (perfect for CI/CD)
vtex-nav gen --verbose --report --output production-nav.json

# 2. Generate with custom branch and specific languages
vtex-nav gen --branch develop --languages en,pt --force

# 3. Validate generated file
vtex-nav view --file production-nav.json
```

### 🌳 Viewer Workflow

```bash
# 1. Quick view with auto-download
vtex-nav view

# 2. Browse specific navigation file
vtex-nav view --file ./my-navigation.json --language es

# 3. Compare different navigation structures
vtex-nav view --file ./old-nav.json
vtex-nav view --file ./new-nav.json
```

### 🔄 Full Development Cycle

```bash
# Generate fresh navigation
vtex-nav gen --verbose --report --output latest-nav.json

# Inspect and validate the structure
vtex-nav view --file latest-nav.json

# Generate detailed report for review
vtex-nav gen --report --log-file generation.log
```

## Schema overview

LocalizedString
- Keys: en, es, pt
- Value: string (can be empty to indicate missing translation)

NavigationNode
- name: LocalizedString
- slug: LocalizedString
- type: "category" | "markdown"
- children: NavigationNode[]
- Rules:
  - category: children.length >= 1
  - markdown: children.length == 0

Merging and duplicates
- Categories across languages are merged by their English slug (slug.en), treating categories as localized entities.
- Within the same parent, sibling category english slugs must be unique; duplicates are flagged by validation.

## Architecture

### 🎯 Generation Mode

- Simple mode (gen): console logging, optimized performance, clean output
- Designed for CI/CD and automation
- Use --verbose for detailed logs and --show-warnings for in-depth analysis
- No interactive generation mode is available at the moment

### 🏗️ Generation Pipeline

1. **Repository Initialization**: Clones VTEX Help Center content
2. **Content Scanning**: Parses markdown files across all languages
3. **Category Building**: Constructs hierarchical category structure
4. **Cross-language Linking**: Links related documents across languages
5. **Navigation Transformation**: Converts to VTEX navigation format
6. **Validation**: Ensures schema compliance and content integrity
7. **Output Generation**: Writes navigation JSON and optional reports

## Requirements

- Node.js >= 16
- Terminal with UTF-8 support for proper character display
- Git (for content repository cloning)
- ~100MB disk space for content cache

## License

MIT

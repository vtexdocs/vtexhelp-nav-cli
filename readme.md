# VTEX Navigation CLI

A comprehensive command-line tool for both **generating** and **viewing** VTEX documentation navigation structures.

## Features

### 🏗️ Navigation Generation
- 🤖 **Intelligent Generation**: Automatically generates navigation from VTEX Help Center content repository
- 🎯 **Dual Modes**: Choose between interactive (with UI) or simple (console-only) generation
- 🌍 **Multi-language Support**: Processes English, Spanish, and Portuguese content
- 🔗 **Cross-language Linking**: Automatically links related documents across languages
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

### 🏗️ Navigation Generation

The CLI offers two modes for generating navigation files from the VTEX Help Center content repository:

#### Simple Mode (Recommended for CI/CD)
```bash
# Generate navigation with clean console output
vtexhelp-nav gen

# Generate with custom options
vtexhelp-nav gen --output custom-nav.json --verbose --force

# Generate specific languages only
vtexhelp-nav gen --languages en,es --report
```

#### Interactive Mode (Rich UI Experience)
```bash
# Generate with full interactive dashboard
vtexhelp-nav generate

# Generate in non-interactive mode (same as simple)
vtexhelp-nav generate --no-interactive
```

#### Generation Options
```
Options:
  -d, --content-dir <dir>    Directory to clone/use content from (default: ".vtexhelp-content")
  -o, --output <file>        Output navigation.json file path (default: "generated-navigation.json")
  --validate                 Validate against existing navigation schema (default: true)
  --report                   Generate detailed report (default: false)
  --fix                      Auto-fix common issues (default: false)
  -l, --languages <langs>    Comma-separated languages to process (default: "en,es,pt")
  -s, --sections <sections>  Comma-separated sections to process (leave empty for all)
  -v, --verbose              Show detailed log lines in terminal (default: false)
  -b, --branch <branch>      Git branch to clone (default: "main")
  -f, --force                Force overwrite existing content directory (default: false)
  --log-file <file>          Export detailed logs to file
  --no-interactive           Disable interactive UI (for generate command only)
```

### 🌳 Viewing Navigation

#### Basic Viewer Usage

```bash
# Run with default settings (downloads navigation.json to current directory)
vtexhelp-nav

# Use a specific navigation file
vtexhelp-nav --file ./custom-navigation.json

# Start in a specific language
vtexhelp-nav --language es
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
├── schema/
│   └── navigation.schema.json         # JSON schema for validation
└── dist/                              # Compiled TypeScript output
```

## Examples

### 🏗️ Generation Workflow

```bash
# 1. Generate navigation in simple mode (perfect for CI/CD)
vtexhelp-nav gen --verbose --report --output production-nav.json

# 2. Generate with custom branch and specific languages
vtexhelp-nav gen --branch develop --languages en,pt --force

# 3. Interactive generation with full dashboard
vtexhelp-nav generate --output interactive-nav.json

# 4. Validate generated file
vtexhelp-nav view --file production-nav.json
```

### 🌳 Viewer Workflow

```bash
# 1. Quick view with auto-download
vtexhelp-nav

# 2. Browse specific navigation file
vtexhelp-nav --file ./my-navigation.json --language es

# 3. Compare different navigation structures
vtexhelp-nav --file ./old-nav.json
vtexhelp-nav --file ./new-nav.json
```

### 🔄 Full Development Cycle

```bash
# Generate fresh navigation
vtexhelp-nav gen --verbose --report --output latest-nav.json

# Inspect and validate the structure
vtexhelp-nav --file latest-nav.json

# Generate detailed report for review
vtexhelp-nav gen --report --log-file generation.log
```

## Architecture

### 🎯 Generation Modes Comparison

| Feature | Simple Mode (`gen`) | Interactive Mode (`generate`) |
|---------|--------------------|--------------------------|
| **UI** | Console logging only | Full Ink dashboard with progress bars |
| **Performance** | ~13% faster (23s avg) | Slower due to UI overhead (26s avg) |
| **Output** | Clean, structured logs | Rich visual feedback |
| **Use Case** | CI/CD, automation, scripts | Development, manual runs |
| **Process Management** | Clean exit, no zombies | Ink lifecycle management |
| **Memory Usage** | Lower | Higher (UI components) |

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

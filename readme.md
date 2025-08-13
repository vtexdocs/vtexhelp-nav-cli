# VTEX Navigation CLI

An interactive command-line tool to browse and explore VTEX documentation navigation structure.

## Features

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

### Basic Usage

```bash
# Run with default settings (downloads navigation.json to current directory)
vtexhelp-nav

# Use a specific navigation file
vtexhelp-nav --file ./custom-navigation.json

# Start in a specific language
vtexhelp-nav --language es
```

### Command-line Options

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
│   ├── app.tsx              # Main app component
│   ├── cli.tsx              # CLI entry point
│   ├── NavigationTree.tsx  # Interactive tree component
│   ├── types/
│   │   └── navigation.ts    # TypeScript types
│   ├── services/
│   │   └── navigationService.ts  # Navigation data service
│   ├── config/
│   │   └── config.ts        # Configuration management
│   └── utils/
│       └── validateSchema.ts # Schema validation
├── schema/
│   └── navigation.schema.json  # JSON schema for validation
└── dist/                    # Compiled output
```

## Requirements

- Node.js >= 16
- Terminal with UTF-8 support for proper character display

## License

MIT

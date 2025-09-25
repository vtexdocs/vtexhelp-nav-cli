# VTEX Navigation CLI

A command-line tool that generates and previews the VTEX Help Center navigation (navigation.json). It is designed for CI/CD and local inspection.

- Generates a unified, multilingual navigation from the Help Center content repositories
- Validates output against a JSON Schema plus custom rules
- Includes a simple viewer for quick inspection

## Install

```bash
npm install -g vtexhelp-nav-cli
# or
npx vtexhelp-nav-cli
```

## Quick start

```bash
# Generate navigation (writes ./generated-navigation.json)
vtex-nav gen

# View a navigation file in the terminal
vtex-nav view --file ./generated-navigation.json

# Validate a navigation file (schema + custom checks)
vtex-nav validate ./generated-navigation.json --strict
```

For the full list of flags, run `vtex-nav gen --help` and `vtex-nav view --help`.

## How it works

Generation pipeline:

1) Scan content repositories (docs/en|es|pt/*)
2) Build category hierarchy from the natural folder structure
3) Link cross-language files and normalize localized names/slugs
4) Transform into the navigation schema
5) Validate (JSON Schema + custom checks) and write output

### Folder hierarchy and per‑section rules

- All sections respect the natural folder hierarchy. If the repository is nested, navigation is nested; if folders are flat, navigation is flat.
- Announcements
  - Directory layout: year/month/articles
  - Within each year, months are categories; within each month, articles are listed
  - Month articles are ordered by the YYYY‑MM‑DD prefix in the filename/slug (newest first)
- Tracks
  - Track articles are ordered by the `order` field in frontmatter; we also prefix article titles with positional numbers for better UX
- Tutorials, FAQ, Troubleshooting, Known Issues
  - Follow folder hierarchy; documents are sorted alphabetically unless an `order` is present (see below)

### Category names, order and metadata.json

- The generator reads `metadata.json` in category folders (for each language) when present
  - Uses `name` to set localized category titles
  - Uses `order` to sort categories; this applies to all sections
  - Falls back to legacy `order.json` if needed
- When metadata is absent, names are derived from folder names and categories are sorted alphabetically

### Slugs and cross‑language unification

- Categories and documents use LocalizedString slugs (en/es/pt)
- Categories across languages are merged by their English slug so they are treated as a single localized entity
- Document slugs are derived from filenames; for Announcements we only read the leading date to sort but do not alter names

### Validation

See also: Troubleshooting guide at docs/troubleshooting.md

- JSON Schema (Draft‑07) at `source/schemas/navigation.schema.json`
  - name and slug are LocalizedString objects with en, es, pt keys
  - Categories: type=category, children >= 1
  - Documents: type=markdown, children must be empty
  - Additional properties are disallowed
- Custom checks
  - Sibling categories under the same parent must have unique English slug
  - Current content check also flags duplicate slugs anywhere in a section (not just siblings). This is conservative and may report Announcements months across different years. We plan to scope this to siblings only.

## Commands

- gen: generate navigation
  - Common flags: `--content-dir`, `--output`, `--languages`, `--sections`, `--branch`, `--verbose`, `--show-warnings`
- view: inspect a navigation file in the terminal
- validate: validate a navigation file against the schema + custom rules

## Configuration (env)

You can provide a `.env` with:

```
VTEX_NAVIGATION_URL=https://newhelp.vtex.com/navigation.json
DEFAULT_OUTPUT_PATH=./navigation.json
AUTO_FORMAT_JSON=true
REQUEST_TIMEOUT=30000
```

## Schema overview (brief)

Definitions are in `source/schemas/navigation.schema.json`. A minimal shape:

```
{
  "navbar": [
    {
      "documentation": "announcements|tracks|...",
      "name": { "en": "...", "es": "...", "pt": "..." },
      "slugPrefix": "...",
      "categories": [
        {
          "type": "category",
          "name": { ... },
          "slug": { ... },
          "children": [
            { "type": "markdown", "name": { ... }, "slug": { ... }, "children": [] }
          ]
        }
      ]
    }
  ]
}
```

## Development

```bash
npm install
npm run build
npm run dev
```

Temporary caches created by the generator (safe to delete):
- `.vtexhelp-content`
- `.vtexhelp-known-issues`

## Requirements

- Node.js >= 16
- Git (for content repository cloning)

## License

MIT

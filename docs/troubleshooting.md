# Troubleshooting

This page lists practical steps to diagnose and fix common issues when generating or validating the Help Center navigation.

If you get stuck, collect the diagnostics below and open an issue with the details.

## Quick fixes

- Reset local caches and regenerate
  ```bash
  rm -rf .vtexhelp-content .vtexhelp-known-issues generated-navigation.json
  vtex-nav gen --verbose --show-warnings --log-file generation.log
  ```
- Narrow the scope to isolate a problem
  ```bash
  vtex-nav gen --languages en --sections announcements --verbose --log-file generation.log
  ```

## Common issues

### Parse errors from known-issues repository
- Cause: malformed YAML frontmatter in external entries.
- Impact: files are skipped; generation completes. Counts are reported.
- Workarounds:
  - Ignore unless you are using `--strict`.
  - Exclude the section while debugging:
    ```bash
    vtex-nav gen --sections announcements,faq,tracks,tutorials,troubleshooting
    ```

### Duplicate slug conflicts
- Announcements month categories repeat across years (e.g., "september"). Today the validator flags duplicates across the whole section.
- We plan to scope duplicate checks to siblings only (unique among the same parent).
- Until then:
  - Avoid `--strict` if month duplicates are the only errors.
  - Or filter/patch validation in CI to treat same-name months across years as OK.

### Category order seems ignored
- Ensure there is a `metadata.json` inside the category folder (per language) with a numeric `order` field. Example:
  ```json
  { "id": "catalog", "name": "Catalog", "slug": "catalog", "order": 10 }
  ```
- The generator reads `metadata.json` for all sections and sorts categories by `order`. Fallback is alphabetical.

### Announcements not ordered newest-first
- Month article ordering relies on the filename/slug prefix `YYYY-MM-DD-...`.
- Ensure articles under `announcements/<year>/<month>/` start with a date prefix.

### "No navigation.json to view"
- Generate first or define the source URL in `.env`:
  ```env
  VTEX_NAVIGATION_URL=https://newhelp.vtex.com/navigation.json
  ```
- Then run:
  ```bash
  vtex-nav view --file ./generated-navigation.json
  ```

## Diagnostics

- Rerun with logs and verbose output
  ```bash
  vtex-nav gen --verbose --show-warnings --log-file generation.log
  vtex-nav validate ./generated-navigation.json --strict
  ```
- Collect environment info (include in bug reports)
  ```bash
  node -v
  npm -v
  git rev-parse HEAD
  ```
- Minimal reproduction
  ```bash
  rm -rf .vtexhelp-content .vtexhelp-known-issues
  vtex-nav gen --languages en --sections announcements --verbose --log-file generation.log
  ```

## Reporting a bug

Include the following:
- Exact command(s) and full output (or `generation.log`)
- `generated-navigation.json` (or a reduced snippet if sensitive)
- Node and npm versions; OS; current commit (`git rev-parse HEAD`)
- Whether you used `--strict`, `--show-warnings`, or section/language filters
- The smallest command that reproduces the issue

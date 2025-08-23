#!/usr/bin/env node

/*
  Validator for VTEX Help Center navigation.json

  Checks performed:
  - Duplicate categories by English slug (global and per-parent)
  - Localization coverage per category (expected: en, es, pt)
  - Empty categories (no children)
  - Mixed-language children under a single category (FYI)
  - Summary counts (nodes, categories, documents, per-locale docs)

  Usage:
  node scripts/validate-nav.js [path_to_navigation.json] [--expected-locales=en,es,pt] [--max-report=50]
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = { file: null, expectedLocales: ['en', 'es', 'pt'], maxReport: 100 };
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith('--')) {
      args.file = arg;
      continue;
    }
    const [k, v] = arg.split('=');
    if (k === '--expected-locales') {
      args.expectedLocales = v.split(',').map(s => s.trim()).filter(Boolean);
    } else if (k === '--max-report') {
      args.maxReport = Number(v) || args.maxReport;
    }
  }
  if (!args.file) {
    // Default to sibling repo help-center-content next to vtexhelp-nav-cli root
    args.file = path.resolve(__dirname, '../../help-center-content/public/navigation.json');
  } else {
    args.file = path.resolve(process.cwd(), args.file);
  }
  return args;
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function slugify(str) {
  return String(str || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function getEnglishSlug(node) {
  if (!node || typeof node !== 'object') return undefined;
  // Most likely properties
  const candidates = [
    node.slugEN,
    node.slugEn,
    node.englishSlug,
    node.enSlug,
    node.legacySlugEN,
  ];
  for (const c of candidates) if (typeof c === 'string' && c) return c;

  // Mapped slugs per locale
  const mapCandidates = [node.slugByLocale, node.slug_i18n, node.slug, node.slugs];
  for (const m of mapCandidates) {
    if (isPlainObject(m) && typeof m.en === 'string' && m.en) return m.en;
  }

  // As a very last resort, try deriving from localized name
  const name = node.name || node.title || node.label;
  if (isPlainObject(name) && typeof name.en === 'string') return slugify(name.en);
  if (typeof name === 'string') return slugify(name);

  return undefined;
}

function getNodeId(node) {
  // Try common identifiers to dedupe cycles or references
  return node.id || node._id || node.key || node.uid || undefined;
}

function getChildren(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node.children)) return node.children;
  if (Array.isArray(node.sections)) return node.sections;
  if (Array.isArray(node.items)) return node.items;
  if (Array.isArray(node.nodes)) return node.nodes;
  if (Array.isArray(node.pages)) return node.pages;
  return [];
}

function getNodeType(node) {
  if (!node || typeof node !== 'object') return 'unknown';
  if (getChildren(node).length > 0) return 'category';
  if (node.type && typeof node.type === 'string') {
    const t = node.type.toLowerCase();
    if (t.includes('category')) return 'category';
    if (t.includes('doc') || t.includes('article') || t.includes('page')) return 'document';
  }
  // Heuristic: has a path/slug but no children
  if ((typeof node.slug === 'string' || typeof node.path === 'string' || typeof node.url === 'string') && getChildren(node).length === 0) return 'document';
  return 'unknown';
}

function collectLocalesFromValue(v, expectedLocales) {
  const set = new Set();
  if (typeof v === 'string') return set; // not localized map
  if (isPlainObject(v)) {
    for (const k of Object.keys(v)) {
      if (expectedLocales.includes(k)) set.add(k);
    }
  }
  return set;
}

function getNodeLocales(node, expectedLocales) {
  const locales = new Set();
  if (!node || typeof node !== 'object') return locales;

  if (typeof node.locale === 'string') locales.add(node.locale);
  if (Array.isArray(node.locales)) node.locales.forEach(l => typeof l === 'string' && locales.add(l));

  // Look into localized fields
  const fields = ['name', 'title', 'label', 'slug', 'slugByLocale', 'slug_i18n'];
  for (const f of fields) {
    const v = node[f];
    for (const l of collectLocalesFromValue(v, expectedLocales)) locales.add(l);
  }

  // Translations arrays
  const t = node.translations || node.i18n || node.localizedVariants;
  if (Array.isArray(t)) {
    for (const item of t) {
      if (isPlainObject(item) && typeof item.locale === 'string') locales.add(item.locale);
    }
  }

  return locales;
}

function traverse(root, expectedLocales) {
  const state = {
    totalNodes: 0,
    categories: 0,
    documents: 0,
    unknowns: 0,
    perLocaleDocs: new Map(), // locale -> count
    categoriesByEnglishSlug: new Map(), // slug -> { count, nodes: [], locales:Set }
    perParentCategoryDuplicates: [], // { parentPath, slugEN, count, nodeNames }
    emptyCategories: [], // { path, slugEN }
    mixedLanguageChildren: [], // { path, childLocales:[...], childCount }
  };

  const seen = new Set(); // guard against cycles

  function walk(node, pathParts) {
    if (!node || typeof node !== 'object') return;
    const ref = node; // object reference key
    if (seen.has(ref)) return;
    seen.add(ref);

    state.totalNodes++;
    const type = getNodeType(node);
    const name = node.name || node.title || node.label || '';
    const displayName = isPlainObject(name) ? (name.en || name.es || name.pt || Object.values(name)[0] || '') : name;
    const pathStr = pathParts.join(' / ');

    if (type === 'category') {
      state.categories++;
      const slugEN = getEnglishSlug(node) || '(unknown)';
      const locales = getNodeLocales(node, expectedLocales);

      // Global aggregation by english slug
      let agg = state.categoriesByEnglishSlug.get(slugEN);
      if (!agg) {
        agg = { count: 0, nodes: [], locales: new Set() };
        state.categoriesByEnglishSlug.set(slugEN, agg);
      }
      agg.count += 1;
      agg.nodes.push({ path: pathStr, name: displayName });
      for (const l of locales) agg.locales.add(l);

      // Children analysis
      const children = getChildren(node);
      if (children.length === 0) {
        state.emptyCategories.push({ path: pathStr, slugEN });
      }

      // Per-parent duplicate detection
      const siblingMap = new Map();
      for (const child of children) {
        if (getNodeType(child) !== 'category') continue;
        const cSlug = getEnglishSlug(child) || '(unknown)';
        const entry = siblingMap.get(cSlug) || [];
        entry.push(child);
        siblingMap.set(cSlug, entry);
      }
      for (const [slug, arr] of siblingMap) {
        if (arr.length > 1) {
          state.perParentCategoryDuplicates.push({
            parentPath: pathStr,
            slugEN: slug,
            count: arr.length,
            nodeNames: arr.map(c => {
              const n = c.name || c.title || c.label;
              return isPlainObject(n) ? (n.en || n.es || n.pt || Object.values(n)[0] || '') : (n || '');
            }),
          });
        }
      }

      // Mixed-language children locales
      const childLocales = new Set();
      for (const child of children) {
        const locs = getNodeLocales(child, expectedLocales);
        for (const l of locs) childLocales.add(l);
      }
      if (childLocales.size > 1) {
        state.mixedLanguageChildren.push({ path: pathStr, childLocales: Array.from(childLocales), childCount: children.length });
      }

      // Walk children
      let idx = 0;
      for (const child of children) {
        const childName = child && typeof child === 'object' ? (child.name || child.title || child.label || child.id || `child-${idx}`) : `child-${idx}`;
        const childDisplay = isPlainObject(childName) ? (childName.en || childName.es || childName.pt || Object.values(childName)[0] || '') : childName;
        walk(child, [...pathParts, String(childDisplay)]);
        idx++;
      }
    } else if (type === 'document') {
      state.documents++;

      const locales = getNodeLocales(node, expectedLocales);
      if (locales.size === 0) {
        // Try to infer a single-locale doc; skip counting if unknown
      } else {
        for (const l of locales) {
          state.perLocaleDocs.set(l, (state.perLocaleDocs.get(l) || 0) + 1);
        }
      }
    } else {
      state.unknowns++;
    }
  }

  walk(root, ['root']);
  return state;
}

function printReport(state, expectedLocales, maxReport) {
  const lines = [];
  lines.push('Navigation validation report');
  lines.push('');
  lines.push(`Totals: nodes=${state.totalNodes}, categories=${state.categories}, documents=${state.documents}, unknown=${state.unknowns}`);
  const perLoc = Array.from(state.perLocaleDocs.entries()).sort((a,b) => a[0].localeCompare(b[0]));
  if (perLoc.length > 0) {
    lines.push('Documents per locale:');
    for (const [loc, count] of perLoc) lines.push(`  - ${loc}: ${count}`);
  } else {
    lines.push('Documents per locale: unavailable (no locale metadata found on documents)');
  }

  // Global duplicates by English slug
  const dupes = Array.from(state.categoriesByEnglishSlug.entries()).filter(([, agg]) => agg.count > 1);
  lines.push('');
  lines.push(`Duplicate categories by English slug (global): ${dupes.length}`);
  let shown = 0;
  for (const [slug, agg] of dupes) {
    if (shown >= maxReport) { lines.push(`  ...and ${dupes.length - shown} more`); break; }
    lines.push(`  - slugEN="${slug}" appears ${agg.count} times at:`);
    for (const node of agg.nodes.slice(0, 5)) {
      lines.push(`      • ${node.path} (${node.name})`);
    }
    if (agg.nodes.length > 5) lines.push(`      ... +${agg.nodes.length - 5} more`);
    const locs = Array.from(agg.locales).sort();
    const missing = expectedLocales.filter(l => !agg.locales.has(l));
    lines.push(`      locales: [${locs.join(', ')}], missing: [${missing.join(', ')}]`);
    shown++;
  }

  // Per-parent duplicates
  lines.push('');
  lines.push(`Duplicate subcategories by English slug within the same parent: ${state.perParentCategoryDuplicates.length}`);
  for (const item of state.perParentCategoryDuplicates.slice(0, maxReport)) {
    lines.push(`  - parent="${item.parentPath}": slugEN="${item.slugEN}" count=${item.count} names=[${item.nodeNames.join(' | ')}]`);
  }
  if (state.perParentCategoryDuplicates.length > maxReport) lines.push(`  ...and ${state.perParentCategoryDuplicates.length - maxReport} more`);

  // Empty categories
  lines.push('');
  lines.push(`Empty categories: ${state.emptyCategories.length}`);
  for (const item of state.emptyCategories.slice(0, Math.min(maxReport, 50))) {
    lines.push(`  - ${item.path} (slugEN=${item.slugEN})`);
  }
  if (state.emptyCategories.length > 50) lines.push(`  ...and ${state.emptyCategories.length - 50} more`);

  // Mixed-language children
  lines.push('');
  lines.push(`Categories with mixed-language children (FYI): ${state.mixedLanguageChildren.length}`);
  for (const item of state.mixedLanguageChildren.slice(0, Math.min(maxReport, 50))) {
    lines.push(`  - ${item.path} -> locales=[${item.childLocales.join(', ')}], children=${item.childCount}`);
  }
  if (state.mixedLanguageChildren.length > 50) lines.push(`  ...and ${state.mixedLanguageChildren.length - 50} more`);

  console.log(lines.join('\n'));
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.file)) {
    console.error(`File not found: ${args.file}`);
    process.exit(2);
  }

  const raw = fs.readFileSync(args.file, 'utf8');
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse JSON:', e.message);
    process.exit(2);
  }

  // The generated file may have a root object with a known property or might already be an array/tree.
  let root = json;
  if (Array.isArray(json)) {
    // Wrap as a root category
    root = { name: 'root', children: json };
  } else if (isPlainObject(json)) {
    // Try common root keys
    const keys = ['navigation', 'nav', 'root', 'sections', 'data'];
    for (const k of keys) {
      if (Array.isArray(json[k])) { root = { name: 'root', children: json[k] }; break; }
      if (isPlainObject(json[k])) { root = json[k]; break; }
    }
    // If root-like object has a sections array, unwrap to children
    if (isPlainObject(root) && Array.isArray(root.sections) && !Array.isArray(root.children)) {
      root = { ...root, children: root.sections };
    }
  }

  const state = traverse(root, args.expectedLocales);
  printReport(state, args.expectedLocales, args.maxReport);
}

// Execute when run directly
const entry = pathToFileURL(process.argv[1]).href;
if (import.meta.url === entry) {
  main();
}


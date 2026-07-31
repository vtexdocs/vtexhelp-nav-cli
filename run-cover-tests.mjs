/**
 * Standalone test runner for category cover scenarios.
 * Uses dist/ (compiled JS) to avoid ts-node/esm issues on Node 24.
 */

import { NavigationTransformer } from './dist/commands/generate/transformer.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌  ${name}`);
    console.log(`       ${err.message}`);
    failed++;
  }
}

function makeLogger(warnings = []) {
  return {
    info: () => {},
    debug: () => {},
    error: () => {},
    warn: (msg) => { warnings.push(msg); },
    startPhase: () => {},
    completePhase: () => {},
    log: () => {},
    setStatsUpdateCallback: () => {},
    setLogUpdateCallback: () => {},
    updateStats: () => {},
    setCurrentFile: () => {},
    incrementProcessed: () => {},
    updateLanguageStats: () => {},
    updateSectionStats: () => {},
    getStats: () => ({}),
    getLogs: () => [],
    close: async () => {},
  };
}

const defaultOptions = {
  contentDir: '',
  output: '',
  validate: false,
  report: false,
  fix: false,
  languages: ['en', 'pt', 'es'],
  sections: [],
  verbose: false,
  interactive: false,
};

function makeFile(slugEN, { categoryCover, locale = 'en' } = {}) {
  return {
    path: `/content/${locale}/${slugEN}.md`,
    relativePath: `${locale}/${slugEN}.md`,
    language: locale,
    section: 'docs',
    category: 'test-category',
    originalCategory: 'test-category',
    fileName: `${slugEN}.md`,
    content: '',
    metadata: {
      title: slugEN.replace(/-/g, ' '),
      id: slugEN,
      status: 'published',
      slugEN,
      locale,
      ...(categoryCover !== undefined ? { categoryCover } : {}),
    },
  };
}

function makeHierarchy() {
  return {
    sections: {},
    crossLanguageMap: {},
    stats: { totalCategories: 0, totalDocuments: 0, languageCoverage: {} },
  };
}

function makeCategoryInfo(path, overrides = {}) {
  return {
    name: { en: 'Test Category', pt: 'Categoria de Teste', es: 'Categoría de Prueba' },
    path,
    level: 1,
    children: { files: [], subcategories: {} },
    ...overrides,
  };
}

// A subcategory with one file so it survives empty-category pruning
function makeSubcat(parentPath) {
  const subPath = `${parentPath}/payments`;
  return {
    [subPath]: {
      name: { en: 'Payments', pt: 'Pagamentos', es: 'Pagos' },
      path: subPath,
      level: 2,
      children: { files: [makeFile('card-payments')], subcategories: {} },
    },
  };
}

async function buildNode(transformer, categoryInfo, hierarchy, directFiles, subcategories) {
  return transformer.buildNavigationNode(
    { ...categoryInfo, children: { files: directFiles, subcategories } },
    hierarchy,
    new Set(),
    new Map(),
    [],
    'docs',
  );
}

// ─────────────────────────────────────────────────────────────────────────────

console.log('\nCategory cover scenarios\n');

await test('Case 1 — single .md + subfolders, no categoryCover → regular category (no structure-driven auto cover)', async () => {
  const transformer = new NavigationTransformer(makeLogger(), defaultOptions);
  const node = await buildNode(
    transformer,
    makeCategoryInfo('test-category'),
    makeHierarchy(),
    [makeFile('overview')],
    makeSubcat('test-category'),
  );
  assert(node?.type === 'category', `expected type category, got ${node?.type}`);
  const childSlugs = node?.children?.map(c => c?.slug?.en ?? c?.slug);
  assert(childSlugs?.includes('overview'), `expected overview kept as a direct child, got ${JSON.stringify(childSlugs)}`);
});

await test('Case 1b — single .md + subfolders + categoryCover: true → explicit cover still works', async () => {
  const transformer = new NavigationTransformer(makeLogger(), defaultOptions);
  const node = await buildNode(
    transformer,
    makeCategoryInfo('test-category'),
    makeHierarchy(),
    [makeFile('overview', { categoryCover: true })],
    makeSubcat('test-category'),
  );
  assert(node?.type === 'markdown', `expected type markdown, got ${node?.type}`);
  assert(node?.slug?.en === 'overview', `expected slug.en=overview, got ${node?.slug?.en}`);
});

await test('Case 2 — single .md, no subfolders → regular category (no structure-driven flatten)', async () => {
  const transformer = new NavigationTransformer(makeLogger(), defaultOptions);
  const node = await buildNode(
    transformer,
    makeCategoryInfo('test-category'),
    makeHierarchy(),
    [makeFile('release-notes-2024')],
    {},
  );
  assert(node?.type === 'category', `expected type category, got ${node?.type}`);
  assert(node?.children?.length === 1, `expected one child, got ${node?.children?.length}`);
});

await test('Case 3 — multiple .md + subfolders, no categoryCover → regular category', async () => {
  const transformer = new NavigationTransformer(makeLogger(), defaultOptions);
  const node = await buildNode(
    transformer,
    makeCategoryInfo('test-category'),
    makeHierarchy(),
    [makeFile('overview'), makeFile('getting-started')],
    makeSubcat('test-category'),
  );
  assert(node?.type === 'category', `expected type category, got ${node?.type}`);
});

await test('Case 4 — multiple .md + subfolders, one categoryCover: true → that file becomes cover', async () => {
  const transformer = new NavigationTransformer(makeLogger(), defaultOptions);
  const node = await buildNode(
    transformer,
    makeCategoryInfo('test-category'),
    makeHierarchy(),
    [makeFile('overview', { categoryCover: true }), makeFile('getting-started')],
    makeSubcat('test-category'),
  );
  assert(node?.type === 'markdown', `expected type markdown, got ${node?.type}`);
  assert(node?.slug?.en === 'overview', `expected slug.en=overview, got ${node?.slug?.en}`);
  const childSlugs = node?.children?.map(c => c?.slug?.en ?? c?.slug);
  assert(childSlugs?.some(s => s === 'getting-started'), `expected getting-started in children, got ${JSON.stringify(childSlugs)}`);
});

await test('Case 5 — multiple categoryCover: true → warning logged, falls back to regular category', async () => {
  const warnings = [];
  const transformer = new NavigationTransformer(makeLogger(warnings), defaultOptions);
  const node = await buildNode(
    transformer,
    makeCategoryInfo('test-category'),
    makeHierarchy(),
    [makeFile('overview', { categoryCover: true }), makeFile('getting-started', { categoryCover: true })],
    makeSubcat('test-category'),
  );
  assert(node?.type === 'category', `expected type category, got ${node?.type}`);
  assert(warnings.some(w => w.includes('Multiple files with categoryCover: true')), `expected warning, got: ${warnings}`);
});

await test('Case 6 — EN/PT/ES variants of same slugEN, no categoryCover → regular category (no auto cover)', async () => {
  const transformer = new NavigationTransformer(makeLogger(), defaultOptions);
  const node = await buildNode(
    transformer,
    makeCategoryInfo('test-category'),
    makeHierarchy(),
    [makeFile('overview', { locale: 'en' }), makeFile('overview', { locale: 'pt' }), makeFile('overview', { locale: 'es' })],
    makeSubcat('test-category'),
  );
  assert(node?.type === 'category', `expected type category, got ${node?.type}`);
});

await test('Case 6b — EN/PT/ES variants of same slugEN + categoryCover: true on PT → cover fires once (slugEN dedup)', async () => {
  const transformer = new NavigationTransformer(makeLogger(), defaultOptions);
  const node = await buildNode(
    transformer,
    makeCategoryInfo('test-category'),
    makeHierarchy(),
    [makeFile('overview', { locale: 'en' }), makeFile('overview', { categoryCover: true, locale: 'pt' }), makeFile('overview', { locale: 'es' })],
    makeSubcat('test-category'),
  );
  assert(node?.type === 'markdown', `expected type markdown (cover), got ${node?.type}`);
  assert(node?.slug?.en === 'overview', `expected slug.en=overview, got ${node?.slug?.en}`);
});

await test('Case 8 — categoryCover: true on an EN file warns that it should be set on PT', async () => {
  const warnings = [];
  const transformer = new NavigationTransformer(makeLogger(warnings), defaultOptions);
  const node = await buildNode(
    transformer,
    makeCategoryInfo('test-category'),
    makeHierarchy(),
    [makeFile('overview', { categoryCover: true, locale: 'en' }), makeFile('getting-started')],
    makeSubcat('test-category'),
  );
  assert(node?.type === 'markdown', `expected type markdown, got ${node?.type}`);
  assert(
    warnings.some(w => w.startsWith('CATEGORY_COVER_NON_PT:') && w.includes('language: en')),
    `expected CATEGORY_COVER_NON_PT warning, got: ${JSON.stringify(warnings)}`
  );
});

await test('Case 9 — categoryCover: true on the PT file does not warn', async () => {
  const warnings = [];
  const transformer = new NavigationTransformer(makeLogger(warnings), defaultOptions);
  await buildNode(
    transformer,
    makeCategoryInfo('test-category'),
    makeHierarchy(),
    [makeFile('overview', { categoryCover: true, locale: 'pt' }), makeFile('getting-started')],
    makeSubcat('test-category'),
  );
  assert(
    !warnings.some(w => w.startsWith('CATEGORY_COVER_NON_PT:')),
    `expected no CATEGORY_COVER_NON_PT warning, got: ${JSON.stringify(warnings)}`
  );
});

await test('Case 7 — cover-backed markdown node (via explicit categoryCover) with children is not dropped by pruning', async () => {
  const transformer = new NavigationTransformer(makeLogger(), defaultOptions);
  const node = await buildNode(
    transformer,
    makeCategoryInfo('test-category'),
    makeHierarchy(),
    [makeFile('overview', { categoryCover: true })],
    makeSubcat('test-category'),
  );
  assert(node != null, 'node should not be null');
  assert(node?.type === 'markdown', `expected type markdown, got ${node?.type}`);
  assert(Array.isArray(node?.children), 'children should be an array');
});

// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);

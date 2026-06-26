import test from 'ava';
import { NavigationTransformer } from './transformer.js';
import type { CategoryHierarchy, ContentFile, GenerationOptions } from './types.js';

// Minimal DualLogger stub
function makeLogger(warnings: string[] = []) {
  return {
    info: () => {},
    debug: () => {},
    error: () => {},
    warn: (_msg: string, _ctx?: any) => { warnings.push(_msg); },
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
  } as any;
}

const defaultOptions: GenerationOptions = {
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

function makeFile(slugEN: string, opts: { categoryCover?: boolean; locale?: string } = {}): ContentFile {
  const locale = opts.locale ?? 'en';
  return {
    path: `/content/${locale}/${slugEN}.md`,
    relativePath: `${locale}/${slugEN}.md`,
    language: locale as any,
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
      ...(opts.categoryCover !== undefined ? { categoryCover: opts.categoryCover } : {}),
    },
  };
}

function makeHierarchy(): CategoryHierarchy {
  return {
    sections: {},
    crossLanguageMap: {},
    stats: { totalCategories: 0, totalDocuments: 0, languageCoverage: {} },
  };
}

function makeCategoryInfo(path: string, overrides: Record<string, any> = {}) {
  return {
    name: { en: 'Test Category', pt: 'Categoria de Teste', es: 'Categoría de Prueba' },
    path,
    level: 1,
    children: { files: [], subcategories: {} },
    ...overrides,
  };
}

// Helper: call the private buildNavigationNode
async function buildNode(
  transformer: NavigationTransformer,
  categoryInfo: any,
  hierarchy: CategoryHierarchy,
  directFiles: ContentFile[],
  subcategories: Record<string, any>,
) {
  return (transformer as any).buildNavigationNode(
    { ...categoryInfo, children: { files: directFiles, subcategories } },
    hierarchy,
    new Set<string>(),
    new Map(),
    [],
    'docs',
  );
}

// ─── Case 1: single .md + subfolders → auto cover ────────────────────────────

test('single .md + subfolders → type becomes markdown, name/slug from cover file', async t => {
  const logger = makeLogger();
  const transformer = new NavigationTransformer(logger, defaultOptions);
  const hierarchy = makeHierarchy();

  const coverFile = makeFile('overview');
  const subcatInfo = makeCategoryInfo('test-category/payments');

  const node = await buildNode(
    transformer,
    makeCategoryInfo('test-category'),
    hierarchy,
    [coverFile],
    { 'test-category/payments': subcatInfo },
  );

  t.is(node?.type, 'markdown');
  t.is((node?.slug as any)?.en, 'overview');
  t.truthy(node?.children?.length > 0);
});

// ─── Case 2: single .md, no subfolders → flatten to plain markdown ────────────

test('single .md, no subfolders → flattened to plain markdown node with no category wrapper', async t => {
  const logger = makeLogger();
  const transformer = new NavigationTransformer(logger, defaultOptions);
  const hierarchy = makeHierarchy();

  const file = makeFile('release-notes-2024');

  const node = await buildNode(
    transformer,
    makeCategoryInfo('test-category'),
    hierarchy,
    [file],
    {},
  );

  t.is(node?.type, 'markdown');
  t.is((node?.slug as any)?.en, 'release-notes-2024');
  // Flattened node has no children array (it's the raw document node)
  t.falsy(node?.children?.length);
});

// ─── Case 3: multiple .md + subfolders, no categoryCover → regular category ──

test('multiple .md + subfolders, no categoryCover → type stays category', async t => {
  const logger = makeLogger();
  const transformer = new NavigationTransformer(logger, defaultOptions);
  const hierarchy = makeHierarchy();

  const files = [makeFile('overview'), makeFile('getting-started')];
  const subcatInfo = makeCategoryInfo('test-category/payments');

  const node = await buildNode(
    transformer,
    makeCategoryInfo('test-category'),
    hierarchy,
    files,
    { 'test-category/payments': subcatInfo },
  );

  t.is(node?.type, 'category');
});

// ─── Case 4: multiple .md + subfolders, one categoryCover: true → that file is cover

test('multiple .md + subfolders, one categoryCover: true → that file becomes cover', async t => {
  const logger = makeLogger();
  const transformer = new NavigationTransformer(logger, defaultOptions);
  const hierarchy = makeHierarchy();

  const files = [
    makeFile('overview', { categoryCover: true }),
    makeFile('getting-started'),
  ];
  const subcatInfo = makeCategoryInfo('test-category/payments');

  const node = await buildNode(
    transformer,
    makeCategoryInfo('test-category'),
    hierarchy,
    files,
    { 'test-category/payments': subcatInfo },
  );

  t.is(node?.type, 'markdown');
  t.is((node?.slug as any)?.en, 'overview');
  // getting-started should still be in children
  const childSlugs = node?.children?.map((c: any) => c?.slug?.en ?? c?.slug);
  t.true(childSlugs?.some((s: string) => s === 'getting-started'));
});

// ─── Case 5: multiple categoryCover: true → warning, fallback to category ────

test('multiple categoryCover: true → warning logged, falls back to regular category', async t => {
  const warnings: string[] = [];
  const logger = makeLogger(warnings);
  const transformer = new NavigationTransformer(logger, defaultOptions);
  const hierarchy = makeHierarchy();

  const files = [
    makeFile('overview', { categoryCover: true }),
    makeFile('getting-started', { categoryCover: true }),
  ];
  const subcatInfo = makeCategoryInfo('test-category/payments');

  const node = await buildNode(
    transformer,
    makeCategoryInfo('test-category'),
    hierarchy,
    files,
    { 'test-category/payments': subcatInfo },
  );

  t.is(node?.type, 'category');
  t.true(warnings.some(w => w.includes('Multiple files with categoryCover: true')));
});

// ─── Case 6: multilingual files, same slugEN → counted as one ────────────────

test('EN/PT/ES variants of same slugEN count as one file, not three', async t => {
  const logger = makeLogger();
  const transformer = new NavigationTransformer(logger, defaultOptions);
  const hierarchy = makeHierarchy();

  // Three language versions, all with same slugEN
  const files = [
    makeFile('overview', { locale: 'en' }),
    makeFile('overview', { locale: 'pt' }),
    makeFile('overview', { locale: 'es' }),
  ];
  const subcatInfo = makeCategoryInfo('test-category/payments');

  const node = await buildNode(
    transformer,
    makeCategoryInfo('test-category'),
    hierarchy,
    files,
    { 'test-category/payments': subcatInfo },
  );

  // Still treated as single file → auto cover
  t.is(node?.type, 'markdown');
});

// ─── Case 7: cover node survives mergeCategoryNodeLists and pruning ───────────

test('cover-backed markdown node with children is not dropped by empty-children pruning', async t => {
  const logger = makeLogger();
  const transformer = new NavigationTransformer(logger, defaultOptions);
  const hierarchy = makeHierarchy();

  const coverFile = makeFile('overview');
  const subcatInfo = makeCategoryInfo('test-category/payments');

  const node = await buildNode(
    transformer,
    makeCategoryInfo('test-category'),
    hierarchy,
    [coverFile],
    { 'test-category/payments': subcatInfo },
  );

  // Node must survive: it has type markdown + non-empty children
  t.truthy(node);
  t.is(node?.type, 'markdown');
  t.true(Array.isArray(node?.children));
});

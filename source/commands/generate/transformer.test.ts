import test from 'ava';
import type { NavigationNode } from '../../types/navigation.js';
import type { GenerationOptions } from './types.js';
import { DualLogger } from './ui/logger.js';
import { NavigationTransformer } from './transformer.js';

// End-to-end coverage for NavigationTransformer.sortDocumentNodes/sortCategoryNodes
// (EDU-18801): the pure comparator/sorter in sortByOrder.test.ts is unit-tested in
// isolation, but nothing previously exercised these two methods themselves — a
// regression here (e.g. reintroducing alphabetical-only sorting for a newly
// order-aware section) would have gone uncaught.

function node(en: string, order?: number, extra: Partial<NavigationNode> = {}): NavigationNode {
  return {
    name: { en, es: '', pt: '' },
    slug: en.toLowerCase(),
    type: 'markdown',
    children: [],
    ...(order !== undefined ? { order } : {}),
    ...extra
  } as NavigationNode;
}

function buildTransformer(): NavigationTransformer {
  const logger = new DualLogger({ verbose: false, interactive: false });
  const options: GenerationOptions = {
    contentDir: '.',
    output: 'navigation.json',
    validate: false,
    report: false,
    fix: false,
    languages: ['en', 'es', 'pt'],
    sections: [],
    verbose: false,
    interactive: false
  };
  return new NavigationTransformer(logger, options);
}

// sortDocumentNodes and sortCategoryNodes are private; calling them via `as any` is
// the standard way to unit-test a private method in TypeScript (private is a
// compile-time-only restriction, so this exercises the real runtime method).
type TransformerInternals = {
  sortDocumentNodes(nodes: NavigationNode[], sectionName?: string): void;
  sortCategoryNodes(nodes: NavigationNode[]): void;
};

for (const sectionName of ['tracks', 'tutorials', 'faq', 'known-issues', 'troubleshooting']) {
  test(`NavigationTransformer.sortDocumentNodes: '${sectionName}' sorts by order then title, duplicates tiebreak alphabetically`, (t) => {
    const nodes = [
      node('Zebra article', 2),
      node('No order at all'),
      node('Apple article', 2), // duplicate order with "Zebra article" -> alphabetical tiebreak
      node('First', 1)
    ];

    (buildTransformer() as unknown as TransformerInternals).sortDocumentNodes(nodes, sectionName);

    t.deepEqual(
      nodes.map((n) => n.name.en),
      ['First', 'Apple article', 'Zebra article', 'No order at all']
    );
  });
}

test('NavigationTransformer.sortDocumentNodes: pt-only and es-only siblings sort correctly alongside order-having nodes', (t) => {
  const ptOnly = node('', undefined, { name: { en: '', es: '', pt: 'Sem ordem definida' } });
  const esOnly = node('', 1, { name: { en: '', es: 'Con orden uno', pt: '' } });
  const nodes = [ptOnly, esOnly];

  (buildTransformer() as unknown as TransformerInternals).sortDocumentNodes(nodes, 'faq');

  // The node with a defined order (esOnly) must come first regardless of which
  // fallback language its title happens to be in.
  t.is(nodes[0], esOnly);
  t.is(nodes[1], ptOnly);
});

test('NavigationTransformer.sortDocumentNodes: announcements still sort by date descending, unaffected by the order-sorting change', (t) => {
  const nodes = [
    node('Oldest announcement', 99, { slug: '2024-01-01-oldest' }),
    node('Newest announcement', 1, { slug: '2025-05-05-newest' })
  ];

  (buildTransformer() as unknown as TransformerInternals).sortDocumentNodes(nodes, 'announcements');

  // Order value is irrelevant for announcements (99 vs 1) -- date wins.
  t.deepEqual(
    nodes.map((n) => n.name.en),
    ['Newest announcement', 'Oldest announcement']
  );
});

test('NavigationTransformer.sortCategoryNodes: category folders sort by order then title, same rules as documents', (t) => {
  const nodes = [
    node('Zebra category', undefined, { type: 'category' }),
    node('First category', 1, { type: 'category' }),
    node('Apple category', undefined, { type: 'category' })
  ];

  (buildTransformer() as unknown as TransformerInternals).sortCategoryNodes(nodes);

  t.deepEqual(
    nodes.map((n) => n.name.en),
    ['First category', 'Apple category', 'Zebra category']
  );
});

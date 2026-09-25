import test from 'ava';
import type { NavigationNode } from '../types/navigation.js';
import {
  compareByOrderThenTitle,
  compareByPrimaryKeyThenTitle,
  resolveFallbackTitle,
  toFullLocalizedString,
  sortNodesByPrimaryKeyThenTitle,
  extractDateFromSlugText,
  extractDateFromNodeSlug
} from './sortByOrder.js';

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

test('compareByOrderThenTitle: different order values sort ascending', (t) => {
  t.true(compareByOrderThenTitle(1, 2, 'Zebra', 'Apple') < 0);
  t.true(compareByOrderThenTitle(5, 3, 'Apple', 'Zebra') > 0);
});

test('compareByOrderThenTitle: equal order values fall through to the title tiebreak', (t) => {
  t.true(compareByOrderThenTitle(1, 1, 'Apple', 'Zebra') < 0);
  t.true(compareByOrderThenTitle(1, 1, 'Zebra', 'Apple') > 0);
});

test('compareByOrderThenTitle: gaps between order values are unaffected', (t) => {
  t.true(compareByOrderThenTitle(1, 2, 'A', 'B') < 0);
  t.true(compareByOrderThenTitle(2, 5, 'B', 'C') < 0);
  t.true(compareByOrderThenTitle(5, 1, 'C', 'A') > 0);
});

test('compareByOrderThenTitle: an article with an order always outranks one without', (t) => {
  t.true(compareByOrderThenTitle(10, undefined, 'Zebra', 'Apple') < 0);
  t.true(compareByOrderThenTitle(undefined, 10, 'Apple', 'Zebra') > 0);
});

test('compareByOrderThenTitle: neither has an order -> sorts by title', (t) => {
  t.true(compareByOrderThenTitle(undefined, undefined, 'Apple', 'Zebra') < 0);
  t.true(compareByOrderThenTitle(undefined, undefined, 'Zebra', 'Apple') > 0);
  t.is(compareByOrderThenTitle(undefined, undefined, 'Same', 'Same'), 0);
});

test('compareByOrderThenTitle: locale choice is symmetric regardless of argument order', (t) => {
  // A pt-only title vs an es-only title, both missing order: the locale used for the
  // comparison must not depend on which one is passed as "a".
  const forward = compareByOrderThenTitle(undefined, undefined, 'Édição', 'Ñandú', 'pt', 'es');
  const reversed = compareByOrderThenTitle(undefined, undefined, 'Ñandú', 'Édição', 'es', 'pt');
  t.is(Math.sign(forward), -Math.sign(reversed));
});

test('resolveFallbackTitle: picks English when present', (t) => {
  t.deepEqual(resolveFallbackTitle({ en: 'Hello', pt: 'Olá', es: 'Hola' }), {
    title: 'Hello',
    locale: 'en'
  });
});

test('resolveFallbackTitle: falls back to Portuguese when English is empty', (t) => {
  t.deepEqual(resolveFallbackTitle({ en: '', pt: 'Olá', es: 'Hola' }), {
    title: 'Olá',
    locale: 'pt'
  });
});

test('resolveFallbackTitle: falls back to Spanish when English and Portuguese are empty', (t) => {
  t.deepEqual(resolveFallbackTitle({ en: '', pt: '', es: 'Hola' }), {
    title: 'Hola',
    locale: 'es'
  });
});

test('resolveFallbackTitle: all empty does not throw and returns an empty English title', (t) => {
  t.notThrows(() => resolveFallbackTitle({ en: '', pt: '', es: '' }));
  t.deepEqual(resolveFallbackTitle({ en: '', pt: '', es: '' }), { title: '', locale: 'en' });
});

test('compareByPrimaryKeyThenTitle: direction "desc" reverses the primary-key comparison but not the title tiebreak', (t) => {
  // Higher key first under desc (mirrors announcements' "newest first" date sort)
  t.true(compareByPrimaryKeyThenTitle(1, 2, 'A', 'B', 'en', 'en', 'desc') > 0);
  t.true(compareByPrimaryKeyThenTitle(2, 1, 'A', 'B', 'en', 'en', 'desc') < 0);
  // Tied key still falls back to plain alphabetical title order regardless of direction
  t.true(compareByPrimaryKeyThenTitle(5, 5, 'Apple', 'Zebra', 'en', 'en', 'desc') < 0);
});

test('compareByPrimaryKeyThenTitle: a defined key outranks an undefined one in both directions', (t) => {
  t.true(compareByPrimaryKeyThenTitle(1, undefined, 'Z', 'A', 'en', 'en', 'asc') < 0);
  t.true(compareByPrimaryKeyThenTitle(1, undefined, 'Z', 'A', 'en', 'en', 'desc') < 0);
});

test('toFullLocalizedString: fills missing languages with empty strings instead of leaving them undefined', (t) => {
  t.deepEqual(toFullLocalizedString({ en: 'Hello' }), { en: 'Hello', es: '', pt: '' });
  t.deepEqual(toFullLocalizedString(undefined), { en: '', es: '', pt: '' });
  t.deepEqual(toFullLocalizedString({ en: 'Hello', es: 'Hola', pt: 'Olá' }), {
    en: 'Hello',
    es: 'Hola',
    pt: 'Olá'
  });
});

test('extractDateFromSlugText: parses a leading YYYY-MM-DD date, defaults to 0 otherwise', (t) => {
  t.true(extractDateFromSlugText('2025-09-17-some-announcement') > 0);
  t.is(extractDateFromSlugText('no-date-here'), 0);
  t.is(extractDateFromSlugText(''), 0);
});

test('extractDateFromNodeSlug: falls back across locales when the English slug is empty', (t) => {
  const withEnDate = node('A');
  withEnDate.slug = { en: '2025-01-01-a', es: '', pt: '' };
  const withPtOnlyDate = node('B');
  withPtOnlyDate.slug = { en: '', es: '', pt: '2025-06-01-b' };

  t.true(extractDateFromNodeSlug(withEnDate) > 0);
  t.true(extractDateFromNodeSlug(withPtOnlyDate) > 0);
  t.true(extractDateFromNodeSlug(withPtOnlyDate) > extractDateFromNodeSlug(withEnDate));
});

// --- sortNodesByPrimaryKeyThenTitle: the shared engine behind sortDocumentNodes/sortCategoryNodes ---

test('sortNodesByPrimaryKeyThenTitle: order ascending, with duplicate-order and missing-order tiebreaks', (t) => {
  const nodes = [
    node('Zebra tutorial', 2),
    node('No order at all'),
    node('Apple tutorial', 2), // duplicate order with "Zebra tutorial" -> alphabetical tiebreak
    node('First', 1)
  ];

  sortNodesByPrimaryKeyThenTitle(nodes, (n) => n.order, 'asc');

  t.deepEqual(nodes.map((n) => n.name.en), [
    'First',
    'Apple tutorial',
    'Zebra tutorial',
    'No order at all'
  ]);
});

test('sortNodesByPrimaryKeyThenTitle: order sorting is unaffected by pt/es-only sibling titles', (t) => {
  const ptOnly = node('', 1, { name: { en: '', es: '', pt: 'Artigo em português' } });
  const enTitled = node('English article', 2);

  const nodes = [enTitled, ptOnly];
  sortNodesByPrimaryKeyThenTitle(nodes, (n) => n.order, 'asc');

  t.deepEqual(nodes.map((n) => n.name.en || n.name.pt), ['Artigo em português', 'English article']);
});

test('sortNodesByPrimaryKeyThenTitle: descending date order, newest first (announcements shape)', (t) => {
  const nodes = [
    node('Oldest', undefined, { slug: '2024-01-01-oldest' }),
    node('Newest', undefined, { slug: '2025-05-05-newest' }),
    node('Middle', undefined, { slug: '2024-06-06-middle' })
  ];

  sortNodesByPrimaryKeyThenTitle(nodes, extractDateFromNodeSlug, 'desc');

  t.deepEqual(nodes.map((n) => n.name.en), ['Newest', 'Middle', 'Oldest']);
});

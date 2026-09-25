import test from 'ava';
import { compareByOrderThenTitle, resolveFallbackTitle } from './sortByOrder.js';

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

import type {LocalizedString, NavigationNode} from '../types/navigation.js';

type Locale = 'en' | 'pt' | 'es';

// Fixed preference order used to pick ONE shared locale for a comparison between
// two titles that may come from different fallback locales. Deriving it from both
// sides (rather than always using the first argument's locale) keeps the
// comparator symmetric: compare(a, b) and compare(b, a) agree on which locale to
// collate with, regardless of which node the sort happened to pass as "a".
const LOCALE_PRIORITY: Record<Locale, number> = {en: 0, pt: 1, es: 2};

function pickSharedLocale(localeA: Locale, localeB: Locale): Locale {
  return LOCALE_PRIORITY[localeA] <= LOCALE_PRIORITY[localeB] ? localeA : localeB;
}

/**
 * Generic comparator core shared by every navigation sort (documents, categories,
 * announcements): compare by a numeric primary key in the given direction, falling
 * back to a locale-aware title compare when the key ties or is missing on either
 * side. A defined key always outranks an undefined one regardless of direction.
 */
export function compareByPrimaryKeyThenTitle(
  primaryA: number | undefined,
  primaryB: number | undefined,
  titleA: string,
  titleB: string,
  localeA: Locale = 'en',
  localeB: Locale = localeA,
  direction: 'asc' | 'desc' = 'asc'
): number {
  const aHasKey = typeof primaryA === 'number';
  const bHasKey = typeof primaryB === 'number';

  if (aHasKey && bHasKey) {
    if (primaryA !== primaryB) {
      const diff = primaryA! - primaryB!;
      return direction === 'asc' ? diff : -diff;
    }
    // Tied primary key -> fall through to the title tiebreak below.
  } else if (aHasKey !== bHasKey) {
    return aHasKey ? -1 : 1;
  }

  const sharedLocale = pickSharedLocale(localeA, localeB);
  return titleA.localeCompare(titleB, sharedLocale, {sensitivity: 'base'});
}

/**
 * Rules (EDU-18801) for the `order` frontmatter field specifically:
 * - Numeric `order` wins, ascending. Gaps between values (e.g. 1, 2, 5) are fine as-is.
 * - Equal `order` values fall through to the title tiebreak instead of staying tied.
 * - A defined `order` always outranks an undefined one.
 * - With no order on either side, sort by title.
 */
export function compareByOrderThenTitle(
  orderA: number | undefined,
  orderB: number | undefined,
  titleA: string,
  titleB: string,
  localeA: Locale = 'en',
  localeB: Locale = localeA
): number {
  return compareByPrimaryKeyThenTitle(orderA, orderB, titleA, titleB, localeA, localeB, 'asc');
}

type LocalizedTitle = {en: string; es: string; pt: string};

/**
 * Picks the first non-empty title (en -> pt -> es) to use as a sort key.
 *
 * `NavigationNode.name` holds one shared LocalizedString across all locales, so a
 * pt/es-only article's `en` title is often an empty string. Comparing against that
 * blank string (instead of the article's actual title) produced inconsistent sibling
 * order when browsing the pt/es site — this picks a real title instead.
 */
export function resolveFallbackTitle(
  name: LocalizedTitle
): {title: string; locale: Locale} {
  if (name.en) {
    return {title: name.en, locale: 'en'};
  }

  if (name.pt) {
    return {title: name.pt, locale: 'pt'};
  }

  if (name.es) {
    return {title: name.es, locale: 'es'};
  }

  return {title: '', locale: 'en'};
}

/**
 * Fills in a Partial<LocalizedString> with empty strings for any missing language,
 * instead of casting the partial object straight to LocalizedString. NavigationNode.name
 * promises `en`/`es`/`pt` are always strings; a bare `as LocalizedString` cast on
 * cross-language data (which is genuinely partial when a run only covers some
 * languages) would let `undefined` slip through that promise.
 */
export function toFullLocalizedString(partial: Partial<LocalizedString> | undefined): LocalizedString {
  return {
    en: partial?.en ?? '',
    es: partial?.es ?? '',
    pt: partial?.pt ?? ''
  };
}

/**
 * Sorts navigation nodes in place by a numeric primary key extracted per node
 * (e.g. frontmatter `order`, or a date parsed from the slug), falling back to a
 * locale-aware title compare. Used by every navigation sort (documents, categories,
 * announcements) so the "primary key, then title" rule only needs to be
 * implemented once.
 *
 * Each node's primary key and fallback title are computed once up front rather
 * than recomputed on every pairwise comparison the sort makes.
 */
export function sortNodesByPrimaryKeyThenTitle(
  nodes: NavigationNode[],
  primaryKeyExtractor: (node: NavigationNode) => number | undefined,
  direction: 'asc' | 'desc' = 'asc'
): void {
  const decorated = nodes.map((node) => {
    const {title, locale} = resolveFallbackTitle(node.name as LocalizedTitle);
    return {node, primaryKey: primaryKeyExtractor(node), title, locale};
  });

  decorated.sort((a, b) =>
    compareByPrimaryKeyThenTitle(a.primaryKey, b.primaryKey, a.title, b.title, a.locale, b.locale, direction)
  );

  for (const [index, entry] of decorated.entries()) {
    nodes[index] = entry.node;
  }
}

// Extract a sortable date (milliseconds since epoch) from a document node's slug.
// Supports slugs starting with YYYY-MM-DD, falling back to other locales if EN is empty.
// Returns 0 when no date prefix is found, which sorts last under 'desc' ordering.
export function extractDateFromSlugText(text: string): number {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:-|$)/.exec(text || '');
  if (!m) return 0;
  const [, y, mm, dd] = m;
  const ts = Date.parse(`${y}-${mm}-${dd}T00:00:00Z`);
  return Number.isNaN(ts) ? 0 : ts;
}

export function extractDateFromNodeSlug(node: NavigationNode): number {
  const anyNode = node as any;
  const slugObj = anyNode.slug;
  let s = '';
  if (typeof slugObj === 'string') {
    s = slugObj;
  } else if (slugObj && typeof slugObj === 'object') {
    s = slugObj.en || slugObj.es || slugObj.pt || '';
  }

  return extractDateFromSlugText(s);
}

/**
 * Shared comparator for ordering navigation siblings (documents and categories).
 *
 * Rules (EDU-18801):
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
  localeTag = 'en'
): number {
  const aHasOrder = typeof orderA === 'number';
  const bHasOrder = typeof orderB === 'number';

  if (aHasOrder && bHasOrder) {
    if (orderA !== orderB) {
      return orderA! - orderB!;
    }
    // Duplicate order values -> fall through to the title tiebreak below.
  } else if (aHasOrder !== bHasOrder) {
    return aHasOrder ? -1 : 1;
  }

  return titleA.localeCompare(titleB, localeTag, {sensitivity: 'base'});
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
): {title: string; locale: 'en' | 'pt' | 'es'} {
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

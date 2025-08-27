/**
 * Category normalization utilities with comprehensive acronym handling
 */

import { getAcronymCase as getAcronymCaseSync } from '../config/acronyms.js';

/**
 * Normalize a category name with proper acronym handling and title case
 * Converts kebab-case or snake_case to Title Case with proper acronym casing
 */
export function normalizeCategoryName(name: string | undefined): string {
  if (!name) return 'Uncategorized';

  // Convert kebab-case or snake_case to Title Case
  const words = name.replace(/[-_]/g, ' ').split(' ');
  const normalizedWords: string[] = [];
  
  for (const word of words) {
    // Check if word is a known acronym using the comprehensive dictionary
    const lowerWord = word.toLowerCase();
    const acronymCase = getAcronymCaseSync(lowerWord);
    if (acronymCase) {
      normalizedWords.push(acronymCase);
    } else {
      // Regular title case for other words
      normalizedWords.push(word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    }
  }
  
  return normalizedWords.join(' ');
}

/**
 * Async version for compatibility with existing async code patterns
 * Uses the same synchronous logic under the hood
 */
export async function normalizeCategoryNameAsync(name: string | undefined): Promise<string> {
  return normalizeCategoryName(name);
}

/**
 * Get the proper case for an acronym from our comprehensive dictionary (async version)
 * For compatibility with existing async patterns
 */
export async function getAcronymCase(word: string): Promise<string | undefined> {
  return getAcronymCaseSync(word);
}

/**
 * Category normalization utilities with comprehensive acronym handling
 */

import { getAcronymCase as getAcronymCaseSync } from '../config/acronyms.js';

/**
 * Normalize a category name with proper acronym handling and sentence case
 * Converts kebab-case, snake_case, or title case to sentence case with proper acronym casing
 */
export function normalizeCategoryName(name: string | undefined): string {
  if (!name) return 'Uncategorized';

  // Check if the entire name is a known acronym first
  const lowerName = name.toLowerCase().replace(/[-_]/g, '');
  const wholeAcronym = getAcronymCaseSync(lowerName);
  if (wholeAcronym) {
    return wholeAcronym;
  }

  // Convert kebab-case or snake_case to spaced words
  const spacedName = name.replace(/[-_]/g, ' ');
  
  // Split into words and process each one
  const words = spacedName.split(' ').filter(word => word.length > 0);
  const processedWords: string[] = [];
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!word) continue; // Skip empty words
    
    const lowerWord = word.toLowerCase();
    
    // Check if individual word is a known acronym
    const acronymCase = getAcronymCaseSync(lowerWord);
    if (acronymCase) {
      processedWords.push(acronymCase);
    } else {
      // Apply sentence case logic: first word capitalized, others lowercase
      if (processedWords.length === 0) {
        // This is the first actual word (after filtering empty words)
        processedWords.push(word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
      } else {
        processedWords.push(word.toLowerCase());
      }
    }
  }
  
  return processedWords.join(' ');
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

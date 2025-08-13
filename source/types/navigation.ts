/**
 * TypeScript types for VTEX Documentation Navigation structure
 * Based on the JSON schema defined in schemas/navigation.schema.json
 */

/**
 * Localized string object containing translations for supported languages
 */
export interface LocalizedString {
  en: string;  // English translation
  es: string;  // Spanish translation  
  pt: string;  // Portuguese translation
}

/**
 * Type for node types in the navigation tree
 */
export type NodeType = 'category' | 'markdown';

/**
 * Navigation node that can be either a category (container) or markdown (document)
 */
export interface NavigationNode {
  /** Localized name of the node */
  name: LocalizedString;
  
  /** URL slug - can be either a simple string or localized object */
  slug: string | LocalizedString;
  
  /** Origin field (typically empty string) */
  origin?: string;
  
  /** Type of node: 'category' for containers, 'markdown' for documents */
  type: NodeType;
  
  /** Child nodes - can contain both categories and documents */
  children: NavigationNode[];
}

/**
 * Top-level navigation section in the navbar
 */
export interface NavbarItem {
  /** Identifier for the documentation section */
  documentation: string;
  
  /** Localized name of the section */
  name: LocalizedString;
  
  /** URL prefix for this section (e.g., "docs/tracks") */
  slugPrefix: string;
  
  /** Categories within this section */
  categories: NavigationNode[];
}

/**
 * Root navigation structure
 */
export interface Navigation {
  /** Array of top-level navigation sections */
  navbar: NavbarItem[];
}

/**
 * Supported languages in the navigation
 */
export const Language = {
  EN: 'en',
  ES: 'es',
  PT: 'pt'
} as const;

export type Language = typeof Language[keyof typeof Language];

/**
 * Navigation statistics for analysis
 */
export interface NavigationStats {
  totalSections: number;
  totalCategories: number;
  totalDocuments: number;
  maxDepth: number;
  languages: Language[];
}

/**
 * Flattened navigation item for easier searching/filtering
 */
export interface FlatNavigationItem {
  name: LocalizedString;
  slug: string | LocalizedString;
  type: NodeType;
  path: string[];  // Breadcrumb path from root
  depth: number;
  section: string;  // Parent navbar section
}

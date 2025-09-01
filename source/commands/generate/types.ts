import type { Language, LocalizedString } from '../../types/navigation.js';

export interface FrontMatter {
  title: string;
  id: string;
  status: string;
  slugEN: string;
  locale: string;
  subcategoryId?: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  order?: number; // Order for track articles
  [key: string]: any; // Allow additional fields
}

export interface ContentFile {
  path: string;
  relativePath: string;
  language: Language;
  section: string; // tutorials, tracks, faq, announcements, troubleshooting
  category: string;
  subcategory?: string;
  fileName: string;
  metadata: FrontMatter;
  content: string;
}

export interface CategoryMap {
  [categoryPath: string]: {
    name: LocalizedString;
    children: CategoryMap | ContentFile[];
    path: string;
    level: number;
    order?: number; // Order for tracks (from order.json)
  };
}

export interface CrossLanguageDocument {
  en?: ContentFile;
  es?: ContentFile;
  pt?: ContentFile;
  slugEN: string;
  title: Partial<LocalizedString>;
  slug: Partial<LocalizedString>;
  categories: Partial<LocalizedString>;
}

export interface GenerationStats {
  totalFiles: number;
  processedFiles: number;
  errors: number;
  warnings: number;
  currentPhase: string;
  currentFile: string;
  languages: { [lang: string]: number };
  sections: { [section: string]: number };
  startTime: Date;
  elapsedTime: string;
  memoryUsage?: {
    used: number;
    total: number;
  };
}

export interface GenerationOptions {
  contentDir: string;
  output: string;
  validate: boolean;
  report: boolean;
  fix: boolean;
  languages: Language[];
  sections: string[];
  logFile?: string;
  verbose: boolean;
  interactive: boolean;
  branch?: string;
  knownIssuesBranch?: string;
  sparseCheckout?: boolean;
  force?: boolean;
  showWarnings?: boolean;
  // Cross-language linking options
  linkSimilarTitles?: boolean;
  linkThreshold?: number;
}

export interface PhaseSummary {
  phase: string;
  duration: number;
  filesProcessed: number;
  errors: string[];
  warnings: string[];
  results?: any;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: any;
  phase?: string;
  file?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalCategories: number;
    totalDocuments: number;
    languageCoverage: { [lang: string]: number };
    missingTranslations: number;
  };
}

// NavigationSection has been replaced by NavbarItem from navigation.ts

export interface ScanResult {
  files: ContentFile[];
  stats: {
    totalFiles: number;
    byLanguage: { [lang: string]: number };
    bySection: { [section: string]: number };
    errors: string[];
    warnings: string[];
  };
}

export interface CategoryHierarchy {
  sections: { [section: string]: CategoryMap };
  crossLanguageMap: { [slugEN: string]: CrossLanguageDocument };
  stats: {
    totalCategories: number;
    totalDocuments: number;
    languageCoverage: { [lang: string]: number };
    missingTranslations?: number;
  };
}

import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface LocalizedDisplayName {
  en: string;
  es: string;
  pt: string;
}

export interface SectionConfig {
  displayName: LocalizedDisplayName;
  slugPrefix: string;
}

export interface SectionsConfiguration {
  sections: {
    [sectionName: string]: SectionConfig;
  };
}

let cachedConfig: SectionsConfiguration | null = null;

export function loadSectionsConfig(): SectionsConfiguration {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const configPath = join(__dirname, 'sections.config.json');
    const configData = readFileSync(configPath, 'utf-8');
    cachedConfig = JSON.parse(configData) as SectionsConfiguration;
    return cachedConfig;
  } catch (error) {
    // Fallback to hardcoded configuration if file loading fails
    console.warn('Failed to load sections config file, using fallback configuration:', error);
    
    cachedConfig = {
      sections: {
        tracks: {
          displayName: { en: 'Start here', es: 'Comece aqui', pt: 'Comece aqui' },
          slugPrefix: 'docs/tracks'
        },
        tutorials: {
          displayName: { en: 'Tutorials', es: 'Tutoriales', pt: 'Tutoriais' },
          slugPrefix: 'docs/tutorials'
        },
        announcements: {
          displayName: { en: 'Announcements', es: 'Anuncios', pt: 'Anúncios' },
          slugPrefix: 'announcements'
        },
        faq: {
          displayName: { en: 'FAQ', es: 'FAQ', pt: 'FAQ' },
          slugPrefix: 'faq'
        },
        'known-issues': {
          displayName: { en: 'Known Issues', es: 'Problemas conocidos', pt: 'Problemas conhecidos' },
          slugPrefix: 'known-issues'
        },
        troubleshooting: {
          displayName: { en: 'Troubleshooting', es: 'Troubleshooting', pt: 'Troubleshooting' },
          slugPrefix: 'troubleshooting'
        }
      }
    };
    
    return cachedConfig;
  }
}

export function getSectionConfig(sectionName: string): SectionConfig | null {
  const config = loadSectionsConfig();
  return config.sections[sectionName] || null;
}

export function getSectionDisplayName(sectionName: string, language: string = 'en'): string {
  const config = getSectionConfig(sectionName);
  if (config && config.displayName[language as keyof LocalizedDisplayName]) {
    return config.displayName[language as keyof LocalizedDisplayName];
  }
  
  // Fallback to capitalized section name
  return sectionName.charAt(0).toUpperCase() + sectionName.slice(1);
}

export function getSectionSlugPrefix(sectionName: string): string {
  const config = getSectionConfig(sectionName);
  if (config) {
    return config.slugPrefix;
  }
  
  // Fallback to section name as prefix
  return sectionName;
}

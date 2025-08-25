/**
 * Comprehensive acronym dictionary for VTEX documentation
 * Based on analysis of actual content usage patterns
 */

export interface AcronymConfig {
  [key: string]: string;
}

/**
 * VTEX-specific and general tech acronyms found in the content
 * Organized by frequency and category for easier maintenance
 */
export const VTEX_ACRONYMS: AcronymConfig = {
  // VTEX Core (>1000 occurrences)
  'vtex': 'VTEX',
  'sku': 'SKU',
  'api': 'API', 
  'id': 'ID',
  'url': 'URL',
  'cms': 'CMS',
  'io': 'IO',

  // Business Models (>50 occurrences)
  'b2b': 'B2B',
  'b2c': 'B2C',
  'oms': 'OMS',
  'erp': 'ERP',
  'crm': 'CRM',

  // Web Technologies (>100 occurrences)
  'html': 'HTML',
  'css': 'CSS',
  'js': 'JS',
  'json': 'JSON',
  'xml': 'XML',
  'http': 'HTTP',
  'https': 'HTTPS',
  'ssl': 'SSL',
  'tls': 'TLS',
  'cdn': 'CDN',
  'dns': 'DNS',
  'rest': 'REST',

  // E-commerce & Business (>50 occurrences)
  'seo': 'SEO',
  'utm': 'UTM',
  'ean': 'EAN',
  'sla': 'SLA',
  'pdp': 'PDP',
  'plp': 'PLP',
  'faq': 'FAQ',
  'pci': 'PCI',
  'fba': 'FBA',
  'pwa': 'PWA',

  // Data & File Formats (>50 occurrences)
  'csv': 'CSV',
  'png': 'PNG',
  'jpg': 'JPG',
  'jpeg': 'JPEG',
  'gif': 'GIF',
  'pdf': 'PDF',
  'zip': 'ZIP',

  // Payments & Financial (>25 occurrences)
  'pse': 'PSE',
  'pix': 'PIX',
  'cvv': 'CVV',
  'bin': 'BIN',
  'tid': 'TID',
  'nsu': 'NSU',

  // Geographic & Language (>100 occurrences)
  'usd': 'USD',
  'brl': 'BRL',
  'us': 'US',
  'br': 'BR',
  'en': 'EN',
  'pt': 'PT',
  'es': 'ES',
  'utc': 'UTC',

  // Infrastructure & Technical (>25 occurrences)
  'aws': 'AWS',
  'cli': 'CLI',
  'ide': 'IDE',
  'ui': 'UI',
  'ux': 'UX',
  'sms': 'SMS',
  'smtp': 'SMTP',
  'waf': 'WAF',
  'spf': 'SPF',
  'caa': 'CAA',
  'qr': 'QR',

  // Document Management (>25 occurrences)
  'cep': 'CEP',
  'cnpj': 'CNPJ',
  'cpf': 'CPF',
  'cname': 'CNAME',
  'wms': 'WMS',
  'pim': 'PIM',
  'pos': 'POS',

  // Technical Terms (>25 occurrences)
  'sso': 'SSO',
  'saml': 'SAML',
  'gdpr': 'GDPR',
  'ascii': 'ASCII',
  'utf': 'UTF',
  'hex': 'HEX',
  'mcf': 'MCF',
  'har': 'HAR',

  // Units & Measurements (>25 occurrences)
  'mb': 'MB',
  'gb': 'GB',
  'mm': 'MM',
  'ip': 'IP',
  'kit': 'KIT',

  // VTEX-Specific Tools & Services
  'meli': 'MELI', // MercadoLibre integration
  'gtm': 'GTM',   // Google Tag Manager
  'nps': 'NPS',   // Net Promoter Score
  'hub': 'HUB',   // VTEX Hub
  'ads': 'ADS',   // Advertising
  'gmc': 'GMC',   // Google Merchant Center

  // Common Technical Abbreviations
  'get': 'GET',
  'post': 'POST',
  'put': 'PUT',
  'ok': 'OK',
  'and': 'AND',
  'or': 'OR',
  'new': 'NEW',
  'old': 'OLD',

  // Status & States
  'true': 'TRUE',
  'false': 'FALSE',
  'null': 'NULL',
  'beta': 'BETA',
  'draft': 'DRAFT',

  // Additional common tech terms
  'spa': 'SPA',   // Single Page Application
  'sdk': 'SDK',   // Software Development Kit
  'orm': 'ORM',   // Object Relational Mapping
  'sql': 'SQL',   // Structured Query Language
  'nosql': 'NoSQL',
  'tcp': 'TCP',   // Transmission Control Protocol
  'udp': 'UDP',   // User Datagram Protocol
  'ftp': 'FTP',   // File Transfer Protocol
  'ssh': 'SSH',   // Secure Shell
  'vpn': 'VPN',   // Virtual Private Network
  'ddos': 'DDoS', // Distributed Denial of Service
  'csrf': 'CSRF', // Cross-Site Request Forgery
  'xss': 'XSS',   // Cross-Site Scripting
  'cors': 'CORS', // Cross-Origin Resource Sharing
};

/**
 * Categories for easier management and extension
 */
export const ACRONYM_CATEGORIES = {
  vtexCore: ['VTEX', 'SKU', 'API', 'ID', 'URL', 'CMS', 'IO'],
  business: ['B2B', 'B2C', 'OMS', 'ERP', 'CRM', 'SEO', 'SLA'],
  webTech: ['HTML', 'CSS', 'JS', 'JSON', 'XML', 'HTTP', 'HTTPS', 'SSL', 'TLS'],
  ecommerce: ['PDP', 'PLP', 'FAQ', 'PCI', 'FBA', 'PWA', 'UTM', 'EAN'],
  fileFormats: ['CSV', 'PNG', 'JPG', 'JPEG', 'GIF', 'PDF', 'ZIP'],
  infrastructure: ['AWS', 'CLI', 'IDE', 'UI', 'UX', 'SMS', 'SMTP', 'CDN', 'DNS'],
  payments: ['PSE', 'PIX', 'CVV', 'BIN', 'TID', 'NSU'],
  geographic: ['USD', 'BRL', 'US', 'BR', 'EN', 'PT', 'ES', 'UTC'],
} as const;

/**
 * Get all acronyms as an array for pattern matching
 */
export function getAllAcronyms(): string[] {
  return Object.values(VTEX_ACRONYMS);
}

/**
 * Get all acronym keys (lowercase versions) as an array
 */
export function getAllAcronymKeys(): string[] {
  return Object.keys(VTEX_ACRONYMS);
}

/**
 * Check if a word is a known acronym
 */
export function isKnownAcronym(word: string): boolean {
  return word.toLowerCase() in VTEX_ACRONYMS;
}

/**
 * Get the proper case for an acronym
 */
export function getAcronymCase(word: string): string | undefined {
  return VTEX_ACRONYMS[word.toLowerCase()];
}

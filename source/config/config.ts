import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

// Load .env file if it exists
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

/**
 * Configuration for the CLI
 */
export const config = {
  /**
   * Get the navigation URL from environment variable or use default
   */
  getNavigationUrl(): string {
    return process.env['VTEX_NAVIGATION_URL'] || process.env['NAVIGATION_URL'] || 'https://newhelp.vtex.com/navigation.json';
  },

  /**
   * Get default output path
   */
  getDefaultOutputPath(): string {
    return process.env['DEFAULT_OUTPUT_PATH'] || './navigation.json';
  },

  /**
   * Check if we should auto-format JSON output
   */
  shouldAutoFormat(): boolean {
    return process.env['AUTO_FORMAT_JSON'] === 'true';
  },

  /**
   * Get timeout for HTTP requests (in milliseconds)
   */
  getRequestTimeout(): number {
    const timeout = process.env['REQUEST_TIMEOUT'];
    return timeout ? parseInt(timeout, 10) : 30000; // Default 30 seconds
  }
};

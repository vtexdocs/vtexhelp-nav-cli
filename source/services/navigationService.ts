import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import { Navigation } from '../types/navigation.js';
import { config } from '../config/config.js';

/**
 * Default navigation URL for VTEX Help Center
 */
export const DEFAULT_NAVIGATION_URL = 'https://newhelp.vtex.com/navigation.json';

/**
 * Known VTEX documentation portal URLs
 */
export const PORTAL_URLS = {
  help: 'https://newhelp.vtex.com/navigation.json',
  developers: 'https://developers.vtex.com/navigation.json',
  learning: 'https://learning.vtex.com/navigation.json',
  // Add more portals as discovered
};

/**
 * Download navigation.json from a given URL
 * @param url - The URL to download from
 * @returns The parsed navigation data
 */
export async function downloadNavigation(url: string): Promise<Navigation> {
  try {
    const response = await axios.get<Navigation>(url, {
      timeout: 30000, // 30 seconds timeout
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'vtex-navigation-cli/1.0.0'
      }
    });

    if (!response.data || !response.data.navbar) {
      throw new Error('Invalid navigation structure received');
    }

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // Server responded with error
        throw new Error(`Server error ${error.response.status}: ${error.response.statusText}`);
      } else if (error.request) {
        // Request made but no response
        throw new Error(`No response from server: ${error.message}`);
      } else {
        // Request setup error
        throw new Error(`Request failed: ${error.message}`);
      }
    }
    throw error;
  }
}

/**
 * Get navigation statistics
 */
export function getNavigationStats(navigation: Navigation) {
  let totalCategories = 0;
  let totalDocuments = 0;
  let maxDepth = 0;

  function traverseNode(node: any, depth: number = 0) {
    if (depth > maxDepth) maxDepth = depth;
    
    if (node.type === 'category') {
      totalCategories++;
    } else if (node.type === 'markdown') {
      totalDocuments++;
    }

    if (node.children && Array.isArray(node.children)) {
      node.children.forEach((child: any) => traverseNode(child, depth + 1));
    }
  }

  navigation.navbar.forEach(section => {
    section.categories.forEach(category => traverseNode(category, 1));
  });

  return {
    sections: navigation.navbar.length,
    totalCategories,
    totalDocuments,
    maxDepth
  };
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Load navigation from file or download if needed
 */
export async function loadNavigation(filePath?: string): Promise<Navigation> {
  // Use provided file path or default
  const targetPath = filePath || config.getDefaultOutputPath();
  
  // Check if file exists
  if (!existsSync(targetPath)) {
    // If file doesn't exist and no custom path was provided, try to download it
    if (!filePath) {
      console.log('Navigation file not found locally. Downloading...');
      const navigation = await downloadNavigation(config.getNavigationUrl());
      
      // Save the downloaded file
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, JSON.stringify(navigation, null, 2));
      
      return navigation;
    } else {
      throw new Error(`Navigation file not found at ${targetPath}`);
    }
  }
  
  // Read and parse the file
  const fileContent = await fs.readFile(targetPath, 'utf-8');
  const navigation = JSON.parse(fileContent) as Navigation;
  
  // Simple validation - just check for navbar property
  if (!navigation.navbar || !Array.isArray(navigation.navbar)) {
    throw new Error('Invalid navigation structure: missing navbar array');
  }
  
  return navigation;
}

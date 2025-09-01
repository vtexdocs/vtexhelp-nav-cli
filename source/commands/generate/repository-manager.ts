import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';

export interface RepositoryConfig {
  name: string;
  url: string;
  branch: string;
  targetDir: string;
  sparseCheckout?: string[];
}

export interface RepositoryManagerOptions {
  force?: boolean;
  verbose?: boolean;
}

export class RepositoryManager {
  private options: RepositoryManagerOptions;

  constructor(options: RepositoryManagerOptions = {}) {
    this.options = {
      force: options.force ?? false,
      verbose: options.verbose ?? false,
    };
  }

  private log(level: 'info' | 'warn' | 'error', message: string, context?: any) {
    const emoji = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
    const contextStr = context && this.options.verbose ? ` ${JSON.stringify(context)}` : '';
    console.log(`${emoji} ${message}${contextStr}`);
  }

  /**
   * Ensure a repository is available locally, cloning if necessary
   */
  public async ensureRepository(config: RepositoryConfig): Promise<boolean> {
    this.log('info', `Initializing ${config.name} repository`);

    try {
      const absoluteTargetDir = path.resolve(config.targetDir);
      const dirExists = await fs.stat(absoluteTargetDir).catch(() => false);

      if (dirExists && !this.options.force) {
        // Check if repository has expected content
        const hasContent = await this.checkRepositoryContent(absoluteTargetDir);
        if (hasContent) {
          this.log('info', `Using existing ${config.name} repository`, { path: absoluteTargetDir });
          return true;
        }
        this.log('warn', `${config.name} directory exists but content is missing, re-cloning`);
      }

      if (dirExists) {
        this.log('info', 'Force flag set, removing existing directory');
        await fs.rm(absoluteTargetDir, { recursive: true, force: true });
      }

      this.log('info', `Cloning ${config.name} repository`, {
        url: config.url,
        branch: config.branch,
        target: config.targetDir
      });

      await this.cloneRepository(config);

      this.log('info', `${config.name} repository cloned successfully`);
      return true;

    } catch (error) {
      this.log('error', `Failed to ensure ${config.name} repository`, {
        error: error instanceof Error ? error.message : error
      });
      return false;
    }
  }

  /**
   * Clone a repository with optional sparse checkout
   */
  private async cloneRepository(config: RepositoryConfig): Promise<void> {
    const absoluteTargetDir = path.resolve(config.targetDir);

    if (config.sparseCheckout && config.sparseCheckout.length > 0) {
      // Use sparse checkout for selective file types
      await this.cloneWithSparseCheckout(config, absoluteTargetDir);
    } else {
      // Standard clone
      await execa('git', [
        'clone',
        '--depth', '1',
        '--branch', config.branch,
        config.url,
        config.targetDir
      ]);
    }
  }

  /**
   * Clone repository with sparse checkout to only get specific file types
   */
  private async cloneWithSparseCheckout(config: RepositoryConfig, absoluteTargetDir: string): Promise<void> {
    // Use proper Git sparse-checkout with blob filtering like the GitHub Action
    // This prevents downloading unnecessary blobs (images, etc.)
    
    // Clone with blob filtering (no blob content initially)
    await execa('git', [
      'clone',
      '--filter=blob:none',
      '--depth', '1',
      '--branch', config.branch,
      config.url,
      config.targetDir
    ]);

    // Configure sparse-checkout with cone mode disabled (to allow file extension patterns)
    await execa('git', ['config', 'core.sparseCheckout', 'true'], { cwd: absoluteTargetDir });
    await execa('git', ['config', 'core.sparseCheckoutCone', 'false'], { cwd: absoluteTargetDir });

    // Set sparse checkout patterns
    if (config.sparseCheckout) {
      const sparseCheckoutContent = config.sparseCheckout.join('\n') + '\n';
      const sparseCheckoutPath = path.join(absoluteTargetDir, '.git', 'info', 'sparse-checkout');
      await fs.writeFile(sparseCheckoutPath, sparseCheckoutContent);
    }

    // Re-read the sparse-checkout patterns and update the working directory
    await execa('git', ['sparse-checkout', 'reapply'], { cwd: absoluteTargetDir });
  }

  /**
   * Check if repository has expected content (looks for docs directory)
   */
  private async checkRepositoryContent(repoPath: string): Promise<boolean> {
    try {
      const docsPath = path.join(repoPath, 'docs');
      await fs.stat(docsPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create repository configurations for the standard VTEX repositories
   */
  public static createStandardConfigs(
    contentDir: string,
    contentBranch: string = 'main',
    knownIssuesBranch: string = 'main',
    useSparseCheckout: boolean = true
  ): RepositoryConfig[] {
    const configs: RepositoryConfig[] = [];

    // Content repository config
    configs.push({
      name: 'content',
      url: 'https://github.com/vtexdocs/help-center-content.git',
      branch: contentBranch,
      targetDir: contentDir,
      sparseCheckout: useSparseCheckout ? [
        '/**/*.md',
        '/**/*.mdx', 
        '/**/*.json',
        '/**/*.yml',
        'public/'
      ] : undefined,
    });

    // Known issues repository config
    const knownIssuesDir = path.join(path.dirname(contentDir), '.vtexhelp-known-issues');
    configs.push({
      name: 'known-issues',
      url: 'https://github.com/vtexdocs/known-issues.git',
      branch: knownIssuesBranch,
      targetDir: knownIssuesDir,
      sparseCheckout: useSparseCheckout ? [
        '/**/*.md',
        '/**/*.mdx',
        '/**/*.json',
        '/**/*.yml'
      ] : undefined,
    });

    return configs;
  }
}

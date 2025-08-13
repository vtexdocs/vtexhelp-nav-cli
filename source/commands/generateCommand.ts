import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';
import ora from 'ora';

const CONTENT_REPO_URL = 'https://github.com/vtexdocs/help-center-content.git';
const DEFAULT_CONTENT_DIR = '.vtexhelp-content';

interface GenerateCommandOptions {
  contentDir?: string;
  branch?: string;
  force?: boolean;
}

async function cloneContentRepo(options: GenerateCommandOptions) {
  const contentDir = options.contentDir || DEFAULT_CONTENT_DIR;
  const branch = options.branch || 'main';
  const spinner = ora('Cloning VTEX Help Center content repository...').start();

  try {
    // Check if directory exists
    const absoluteContentDir = path.resolve(process.cwd(), contentDir);
    const dirExists = await fs.stat(absoluteContentDir).catch(() => false);

    if (dirExists) {
      if (!options.force) {
        spinner.fail(`Directory ${contentDir} already exists. Use --force to overwrite.`);
        return false;
      }
      spinner.text = 'Removing existing content directory...';
      await fs.rm(absoluteContentDir, { recursive: true, force: true });
    }

    // Clone the repository
    await execa('git', [
      'clone',
      '--depth', '1',  // Shallow clone for faster download
      '--branch', branch,
      CONTENT_REPO_URL,
      contentDir
    ]);

    spinner.succeed(`Successfully cloned content repository to ${contentDir}`);
    return true;
  } catch (error) {
    spinner.fail(`Failed to clone content repository: ${error}`);
    return false;
  }
}

export function createGenerateCommand() {
  const generate = new Command('generate')
    .description('Generate navigation from VTEX Help Center content repository')
    .option('-d, --content-dir <dir>', 'Directory to clone content into', DEFAULT_CONTENT_DIR)
    .option('-b, --branch <branch>', 'Branch to clone', 'main')
    .option('-f, --force', 'Force overwrite existing content directory', false)
    .action(async (options: GenerateCommandOptions) => {
      const success = await cloneContentRepo(options);
      
      if (success) {
        console.log('\nNext steps:');
        console.log('1. Navigate content structure');
        console.log('2. Generate navigation.json');
        console.log('3. Validate against existing navigation');
      } else {
        process.exit(1);
      }
    });

  return generate;
}

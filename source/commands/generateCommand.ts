import { Command } from 'commander';
import type { Language } from '../types/navigation.js';
import generateSimple from './generate-simple.js';

const DEFAULT_CONTENT_DIR = '.vtexhelp-content';

// Using inline 'any' types in the action handler to avoid over-constraining CLI options.

export function createSimpleGenerateCommand() {
  const generateSimpleCmd = new Command('gen')
    .description('Generate navigation from VTEX Help Center content repository (simple mode, no Ink UI)')
    .option('-d, --content-dir <dir>', 'Directory to clone/use content from', DEFAULT_CONTENT_DIR)
    .option('-o, --output <file>', 'Output navigation.json file path', 'generated-navigation.json')
    .option('--validate', 'Validate against existing navigation schema', true)
    .option('--report', 'Generate detailed report', false)
    .option('--fix', 'Auto-fix common issues', false)
    .option('--strict', 'Fail generation when validation errors are found', false)
    .option('-l, --languages <langs>', 'Comma-separated languages to process (en,es,pt)', 'en,es,pt')
    .option('-s, --sections <sections>', 'Comma-separated sections to process (leave empty for all)')
    .option('-v, --verbose', 'Show detailed log lines in terminal', false)
    .option('-b, --branch <branch>', 'Git branch to clone for content repository', 'main')
    .option('--known-issues-branch <branch>', 'Git branch to clone for known-issues repository', 'main')
    .option('--sparse-checkout', 'Use sparse checkout to only clone content files (.md, .mdx, .json, .yaml)', true)
    .option('-f, --force', 'Force overwrite existing content directory', false)
    .option('--log-file <file>', 'Export detailed logs to file')
    .option('--preserve-order', 'Preserve order fields in output for debugging', false)
    .option('--show-warnings', 'Display detailed analysis of all warnings', false)
    .action(async (options: any) => {
      try {
        // Parse language list
        const languages = options.languages
          ?.split(',')
          .map((lang: string) => lang.trim() as Language)
          .filter((lang: string) => ['en', 'es', 'pt'].includes(lang)) || ['en', 'es', 'pt'];

        // Parse sections list  
        const sections = options.sections
          ?.split(',')
          .map((section: string) => section.trim())
          .filter(Boolean) || [];

        // Run the simple generation
        await generateSimple({
          contentDir: options.contentDir,
          output: options.output,
          validate: options.validate,
          report: options.report,
          fix: options.fix,
          languages,
          sections,
          verbose: options.verbose,
          branch: options.branch,
          knownIssuesBranch: options.knownIssuesBranch,
          sparseCheckout: options.sparseCheckout,
          force: options.force,
          logFile: options.logFile,
          showWarnings: options.showWarnings,
          preserveOrder: options.preserveOrder,
          // pass through strict flag (not typed in GenerationOptions)
          ...(options.strict ? { strict: true } : {})
        });

      } catch (error) {
        console.error('\n❌ Generation failed:', error);
        process.exit(1);
      }
    });

  return generateSimpleCmd;
}

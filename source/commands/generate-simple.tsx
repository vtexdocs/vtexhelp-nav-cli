import process from 'node:process';
import { runSimpleGeneration } from './generate/simple-generator.js';
import type { GenerationOptions } from './generate/types.js';
import type { Language } from '../types/navigation.js';

export interface GenerateSimpleOptions {
  contentDir?: string;
  output?: string;
  validate?: boolean;
  report?: boolean;
  fix?: boolean;
  languages?: Language[];
  sections?: string[];
  verbose?: boolean;
  branch?: string;
  knownIssuesBranch?: string;
  sparseCheckout?: boolean;
  force?: boolean;
  logFile?: string;
  showWarnings?: boolean;
  preserveOrder?: boolean;
}

export default async function generateSimple(options: GenerateSimpleOptions): Promise<void> {
  console.log('Starting VTEX Navigation Generation (Simple Mode)\n');

  // Convert CLI options to generation options
  const generationOptions: Partial<GenerationOptions> = {
    contentDir: options.contentDir,
    output: options.output,
    validate: options.validate,
    report: options.report,
    fix: options.fix,
    languages: options.languages,
    sections: options.sections,
    verbose: options.verbose,
    branch: options.branch,
    knownIssuesBranch: options.knownIssuesBranch,
    sparseCheckout: options.sparseCheckout,
    force: options.force,
    logFile: options.logFile,
    showWarnings: options.showWarnings,
    preserveOrder: options.preserveOrder,
    interactive: false, // Always non-interactive for simple mode
  };

  try {
    const success = await runSimpleGeneration(generationOptions);
    
    if (!success) {
      console.error('\n❌ Navigation generation failed');
      process.exit(1);
    }
    
    console.log('✅ Navigation generation completed successfully');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Fatal error during navigation generation:');
    console.error(error instanceof Error ? error.message : String(error));
    
    if (options.verbose && error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    
    process.exit(1);
  }
}

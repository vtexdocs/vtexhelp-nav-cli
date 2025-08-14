#!/usr/bin/env node
import { Command } from 'commander';
import React from 'react';
import {render} from 'ink';
import App from './app.js';
import { createSimpleGenerateCommand } from './commands/generateCommand.js';

const program = new Command()
  .name('vtexhelp-nav')
  .description('VTEX Help Center Navigation CLI')
  .version('1.0.0');

// View command (default)
program
  .command('view', { isDefault: true })
  .description('View navigation tree')
  .option('-f, --file <path>', 'Path to navigation.json file')
  .option('-l, --language <lang>', 'Language to use (en, es, pt)', 'en')
  .addHelpText('after', `
  Keyboard Shortcuts:
    ↑/↓       Navigate items
    Space     Expand/collapse
    e/s/p     Switch language (English/Spanish/Portuguese)
    h         Show help
    i         Show statistics
    q         Quit
  `)
  .action((options) => {
    render(<App filePath={options.file} language={options.language} />);
  });

// Add generate command (simple mode only)
program.addCommand(createSimpleGenerateCommand());

program.parse();

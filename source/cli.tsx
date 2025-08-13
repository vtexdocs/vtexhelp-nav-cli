#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';

const cli = meow(
	`
		Usage
		  $ vtexhelp-nav

		Options
			--file, -f     Path to navigation.json file
			--language, -l Language to use (en, es, pt) [default: en]
			--help         Show help

		Examples
		  $ vtexhelp-nav
		  $ vtexhelp-nav --file ./custom-navigation.json
		  $ vtexhelp-nav --language es
		  $ vtexhelp-nav -f ./nav.json -l pt

		Keyboard Shortcuts:
		  ↑/↓       Navigate items
		  Space     Expand/collapse
		  e/s/p     Switch language (English/Spanish/Portuguese)
		  h         Show help
		  i         Show statistics
		  q         Quit
	`,
	{
		importMeta: import.meta,
		flags: {
			file: {
				type: 'string',
				shortFlag: 'f',
			},
			language: {
				type: 'string',
				shortFlag: 'l',
				default: 'en',
			},
		},
	},
);

render(<App filePath={cli.flags.file} language={cli.flags.language} />);

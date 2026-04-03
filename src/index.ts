import { Command } from 'commander';
import { scanCommand } from './commands/scan.js';
import { initCommand } from './commands/init.js';
import { generateCommand } from './commands/generate.js';
import { checkCommand } from './commands/check.js';
import { analyzeCommand } from './commands/analyze.js';
import { diffCommand } from './commands/diff.js';
import { watchCommand } from './commands/watch.js';

const program = new Command();

program
  .name('goodbot')
  .description('Auto-generate AI agent guardrail files for your project')
  .version('0.1.0');

program.addCommand(scanCommand);
program.addCommand(initCommand);
program.addCommand(generateCommand);
program.addCommand(checkCommand);
program.addCommand(analyzeCommand);
program.addCommand(diffCommand);
program.addCommand(watchCommand);

program.parse();

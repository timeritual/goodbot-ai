import { Command } from 'commander';
import { scanCommand } from './commands/scan.js';
import { initCommand } from './commands/init.js';
import { generateCommand } from './commands/generate.js';
import { checkCommand } from './commands/check.js';

const program = new Command();

program
  .name('goodbot')
  .description('Auto-generate AI agent guardrail files for your project')
  .version('0.1.0');

program.addCommand(scanCommand);
program.addCommand(initCommand);
program.addCommand(generateCommand);
program.addCommand(checkCommand);

program.parse();

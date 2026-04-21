import { Command } from 'commander';
import { scanCommand } from './commands/scan.js';
import { initCommand } from './commands/init.js';
import { generateCommand } from './commands/generate.js';
import { checkCommand } from './commands/check.js';
import { analyzeCommand } from './commands/analyze.js';
import { diffCommand } from './commands/diff.js';
import { watchCommand } from './commands/watch.js';
import { fixCommand } from './commands/fix.js';
import { scoreCommand } from './commands/score.js';
import { prCommand } from './commands/pr.js';
import { ciCommand } from './commands/ci.js';
import { trendCommand } from './commands/trend.js';
import { syncCommand } from './commands/sync.js';
import { reportCommand } from './commands/report.js';
import { onboardCommand } from './commands/onboard.js';
import { freshnessCommand } from './commands/freshness.js';
import { hooksCommand } from './commands/hooks.js';
import { presetsCommand } from './commands/presets.js';

const program = new Command();

program
  .name('goodbot')
  .description('Auto-generate AI agent guardrail files for your project')
  .version('0.6.4');

program.addCommand(scanCommand);
program.addCommand(initCommand);
program.addCommand(generateCommand);
program.addCommand(checkCommand);
program.addCommand(analyzeCommand);
program.addCommand(diffCommand);
program.addCommand(watchCommand);
program.addCommand(fixCommand);
program.addCommand(scoreCommand);
program.addCommand(prCommand);
program.addCommand(freshnessCommand);
program.addCommand(hooksCommand);
program.addCommand(ciCommand);
program.addCommand(trendCommand);
program.addCommand(syncCommand);
program.addCommand(reportCommand);
program.addCommand(onboardCommand);
program.addCommand(presetsCommand);

program.parse();

import { Command } from 'commander';
import chalk from 'chalk';
import { PRESET_DESCRIPTIONS, type PresetName } from '../config/index.js';

const PRESET_DETAILS: Record<PresetName, Record<string, string>> = {
  strict: {
    'Barrel imports': 'Always (enforced)',
    'Interface contracts': 'Yes (if detected)',
    'Import style': 'barrel',
    'Architecture layers': 'Full (from scan)',
    'Red flags': 'All framework-specific',
    'SOLID analysis': 'Enabled',
    'File size limit': '300 lines',
    'Agent files': 'All 6 files',
  },
  recommended: {
    'Barrel imports': 'Auto (enforced if barrels exist, else recommended)',
    'Interface contracts': 'Yes (if detected)',
    'Import style': 'Auto (barrel if barrels exist)',
    'Architecture layers': 'Full (from scan)',
    'Red flags': 'All framework-specific',
    'SOLID analysis': 'Enabled',
    'File size limit': '300 lines',
    'Agent files': 'All 6 files',
  },
  relaxed: {
    'Barrel imports': 'None',
    'Interface contracts': 'No',
    'Import style': 'direct',
    'Architecture layers': 'None',
    'Red flags': 'None',
    'SOLID analysis': 'Enabled',
    'File size limit': '300 lines',
    'Agent files': 'All 6 files',
  },
};

export const presetsCommand = new Command('presets')
  .description('List available presets and what they configure')
  .action(() => {
    const presetNames: PresetName[] = ['strict', 'recommended', 'relaxed'];

    console.log();
    console.log(chalk.bold('  Available Presets'));
    console.log(chalk.dim('  ─'.repeat(25)));
    console.log();

    for (const name of presetNames) {
      console.log(`  ${chalk.bold.cyan(name.padEnd(14))} ${chalk.dim(PRESET_DESCRIPTIONS[name])}`);
    }

    console.log();
    console.log(chalk.bold('  Comparison'));
    console.log(chalk.dim('  ─'.repeat(25)));
    console.log();

    // Header
    const labelWidth = 22;
    const colWidth = 18;
    const header = `  ${''.padEnd(labelWidth)} ${presetNames.map(n => chalk.bold(n.padEnd(colWidth))).join(' ')}`;
    console.log(header);
    console.log();

    // Rows
    const allKeys = Object.keys(PRESET_DETAILS.strict);
    for (const key of allKeys) {
      const values = presetNames.map(n => PRESET_DETAILS[n][key]);
      const allSame = values.every(v => v === values[0]);

      const row = presetNames.map((n, i) => {
        const val = values[i];
        if (allSame) return chalk.dim(val.padEnd(colWidth));
        return chalk.white(val.padEnd(colWidth));
      }).join(' ');

      console.log(`  ${chalk.dim(key.padEnd(labelWidth))} ${row}`);
    }

    console.log();
    console.log(chalk.dim(`  Usage: goodbot init --preset <name>`));
    console.log(chalk.dim(`  Preview: goodbot init --preset <name> --dry-run`));
    console.log();
  });

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { loadConfig, saveConfig, GoodbotConfigSchema, type GoodbotConfig } from '../config/index.js';
import { log, safeReadFile, safeWriteFile } from '../utils/index.js';

export const syncCommand = new Command('sync')
  .description('Sync team config from a shared source (URL or git repo)')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--from <source>', 'Source URL or git repo path for shared config')
  .option('--push', 'Push local config to the shared source', false)
  .action(async (opts) => {
    const projectRoot = opts.path;

    if (opts.push) {
      await pushConfig(projectRoot, opts.from);
      return;
    }

    await pullConfig(projectRoot, opts.from);
  });

async function pullConfig(projectRoot: string, source?: string): Promise<void> {
  // Determine source: from flag, from config, or error
  let syncUrl = source;
  if (!syncUrl) {
    try {
      const config = await loadConfig(projectRoot);
      syncUrl = config.team?.syncUrl;
    } catch {
      // no config
    }
  }

  if (!syncUrl) {
    log.error('No sync source specified. Use --from <url> or set team.syncUrl in config.');
    log.dim('Examples:');
    log.dim('  goodbot sync --from https://raw.githubusercontent.com/org/config/main/.goodbot/config.json');
    log.dim('  goodbot sync --from /path/to/shared-config/config.json');
    process.exit(1);
  }

  // Security: only allow HTTPS for remote URLs
  if (syncUrl.startsWith('http://')) {
    log.error('HTTP URLs are not supported for security reasons. Use HTTPS instead.');
    process.exit(1);
  }

  const spinner = ora(`Fetching config from ${syncUrl}...`).start();

  try {
    let remoteContent: string | null = null;

    if (syncUrl.startsWith('https://')) {
      const response = await fetch(syncUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      remoteContent = await response.text();
    } else {
      // Read from local file path
      remoteContent = await safeReadFile(syncUrl);
    }

    if (!remoteContent) {
      throw new Error(`Could not read config from ${syncUrl}`);
    }

    // Parse and validate through Zod schema
    let rawConfig: unknown;
    try {
      rawConfig = JSON.parse(remoteContent);
    } catch {
      throw new Error('Remote config is not valid JSON.');
    }

    const parseResult = GoodbotConfigSchema.safeParse(rawConfig);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.slice(0, 5)
        .map(i => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Remote config failed schema validation:\n${issues}`);
    }

    const remoteConfig = parseResult.data;

    // Merge: remote config is the base, local project/verification are preserved
    let localConfig: GoodbotConfig | null = null;
    try {
      localConfig = await loadConfig(projectRoot);
    } catch {
      // No local config — use remote as-is
    }

    const merged: GoodbotConfig = {
      ...remoteConfig,
      // Preserve local project identity
      project: localConfig?.project ?? remoteConfig.project,
      // Preserve local verification commands (they're project-specific)
      verification: localConfig?.verification ?? remoteConfig.verification,
      // Keep sync URL
      team: { ...remoteConfig.team, syncUrl },
    };

    spinner.succeed('Config synced');

    // Show what changed
    if (localConfig) {
      const changes = diffConfigs(localConfig, merged);
      if (changes.length > 0) {
        console.log();
        log.header('Changes Applied');
        console.log(chalk.dim('─'.repeat(50)));
        for (const change of changes) {
          console.log(`  ${chalk.yellow('~')} ${change}`);
        }
      } else {
        log.dim('No changes — local config already matches remote.');
      }
    }

    await saveConfig(projectRoot, merged);

    console.log();
    log.success('Merged team config with local settings.');
    log.dim('Team rules, architecture, and custom rules updated from shared source.');
    log.dim('Local project name and verification commands preserved.');
  } catch (err) {
    spinner.fail('Sync failed');
    log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

export function diffConfigs(local: GoodbotConfig, merged: GoodbotConfig): string[] {
  const changes: string[] = [];

  // Architecture
  if (local.architecture.barrelImportRule !== merged.architecture.barrelImportRule) {
    changes.push(`barrelImportRule: ${local.architecture.barrelImportRule} → ${merged.architecture.barrelImportRule}`);
  }
  if (local.architecture.interfaceContracts !== merged.architecture.interfaceContracts) {
    changes.push(`interfaceContracts: ${local.architecture.interfaceContracts} → ${merged.architecture.interfaceContracts}`);
  }
  if (local.architecture.layers.length !== merged.architecture.layers.length) {
    changes.push(`layers: ${local.architecture.layers.length} → ${merged.architecture.layers.length}`);
  }

  // Business logic
  const localAllowed = local.businessLogic.allowedIn.join(', ');
  const mergedAllowed = merged.businessLogic.allowedIn.join(', ');
  if (localAllowed !== mergedAllowed) {
    changes.push(`businessLogic.allowedIn: [${localAllowed}] → [${mergedAllowed}]`);
  }

  // Custom rules
  if (local.conventions.customRules.length !== merged.conventions.customRules.length) {
    changes.push(`customRules: ${local.conventions.customRules.length} → ${merged.conventions.customRules.length}`);
  }
  if ((local.customRulesConfig?.length ?? 0) !== (merged.customRulesConfig?.length ?? 0)) {
    changes.push(`customRulesConfig: ${local.customRulesConfig?.length ?? 0} → ${merged.customRulesConfig?.length ?? 0}`);
  }

  // Analysis thresholds
  if (local.analysis.thresholds.maxFileLines !== merged.analysis.thresholds.maxFileLines) {
    changes.push(`maxFileLines: ${local.analysis.thresholds.maxFileLines} → ${merged.analysis.thresholds.maxFileLines}`);
  }

  // Cursorignore output
  if (local.output.cursorignore.paths.length !== merged.output.cursorignore.paths.length) {
    changes.push(`output.cursorignore.paths: ${local.output.cursorignore.paths.length} → ${merged.output.cursorignore.paths.length}`);
  }

  return changes;
}

async function pushConfig(projectRoot: string, destination?: string): Promise<void> {
  if (!destination) {
    log.error('Specify destination with --from <path>');
    process.exit(1);
  }

  const spinner = ora('Pushing config...').start();

  try {
    const config = await loadConfig(projectRoot);
    const content = JSON.stringify(config, null, 2) + '\n';

    if (destination.startsWith('http')) {
      spinner.fail('Push to URL not supported. Use a local path or git repo.');
      process.exit(1);
    }

    await safeWriteFile(destination, content);
    spinner.succeed(`Config pushed to ${destination}`);
    log.dim('Team members can now run: goodbot sync --from ' + destination);
  } catch (err) {
    spinner.fail('Push failed');
    log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

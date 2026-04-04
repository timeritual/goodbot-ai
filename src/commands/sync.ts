import { Command } from 'commander';
import path from 'node:path';
import { execSync } from 'node:child_process';
import ora from 'ora';
import { loadConfig, saveConfig, configPath, type GoodbotConfig } from '../config/index.js';
import { log, safeReadFile, safeReadJson, safeWriteFile } from '../utils/index.js';

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

  const spinner = ora(`Fetching config from ${syncUrl}...`).start();

  try {
    let remoteContent: string | null = null;

    if (syncUrl.startsWith('http://') || syncUrl.startsWith('https://')) {
      // Fetch from URL
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

    const remoteConfig = JSON.parse(remoteContent) as GoodbotConfig;

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

    await saveConfig(projectRoot, merged);
    spinner.succeed('Config synced');

    log.success('Merged team config with local settings.');
    log.dim('Team rules, architecture, and custom rules updated from shared source.');
    log.dim('Local project name and verification commands preserved.');
  } catch (err) {
    spinner.fail('Sync failed');
    log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
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

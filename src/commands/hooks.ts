import { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import { log, fileExists } from '../utils/index.js';

const HOOK_MARKER_START = '# --- goodbot hooks start ---';
const HOOK_MARKER_END = '# --- goodbot hooks end ---';

const POST_MERGE_HOOK = `
${HOOK_MARKER_START}
# Run goodbot check after merges to detect stale guardrails
if command -v goodbot &> /dev/null; then
  goodbot check --path "$(git rev-parse --show-toplevel)" 2>/dev/null || true
elif npx --yes goodbot --version &> /dev/null 2>&1; then
  npx --yes goodbot check --path "$(git rev-parse --show-toplevel)" 2>/dev/null || true
fi
${HOOK_MARKER_END}
`;

const PRE_PUSH_HOOK = `
${HOOK_MARKER_START}
# Run goodbot freshness before push to warn about stale guardrails
if command -v goodbot &> /dev/null; then
  goodbot freshness --path "$(git rev-parse --show-toplevel)" 2>/dev/null || echo "⚠ goodbot: guardrails may be stale. Run 'goodbot freshness' for details."
elif npx --yes goodbot --version &> /dev/null 2>&1; then
  npx --yes goodbot freshness --path "$(git rev-parse --show-toplevel)" 2>/dev/null || echo "⚠ goodbot: guardrails may be stale. Run 'goodbot freshness' for details."
fi
${HOOK_MARKER_END}
`;

export const hooksCommand = new Command('hooks')
  .description('Install or remove git hooks for automatic freshness checks')
  .argument('<action>', 'install or uninstall')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--post-merge', 'Install post-merge hook (runs goodbot check)', true)
  .option('--pre-push', 'Install pre-push hook (runs goodbot freshness)', true)
  .action(async (action: string, opts) => {
    const projectRoot = opts.path;

    if (action !== 'install' && action !== 'uninstall') {
      log.error('Action must be "install" or "uninstall".');
      process.exit(1);
    }

    const hooksDir = getHooksDir(projectRoot);
    if (!hooksDir) {
      log.error('Not a git repository. Run this from inside a git project.');
      process.exit(1);
    }

    // Ensure hooks directory exists
    await fs.mkdir(hooksDir, { recursive: true });

    if (action === 'install') {
      let installed = 0;
      if (opts.postMerge) {
        await installHook(hooksDir, 'post-merge', POST_MERGE_HOOK);
        installed++;
      }
      if (opts.prePush) {
        await installHook(hooksDir, 'pre-push', PRE_PUSH_HOOK);
        installed++;
      }
      console.log();
      log.success(`${installed} hook${installed > 1 ? 's' : ''} installed.`);
      log.dim('Hooks are advisory — they warn but do not block.');
    } else {
      let removed = 0;
      if (opts.postMerge) {
        const didRemove = await uninstallHook(hooksDir, 'post-merge');
        if (didRemove) removed++;
      }
      if (opts.prePush) {
        const didRemove = await uninstallHook(hooksDir, 'pre-push');
        if (didRemove) removed++;
      }
      console.log();
      if (removed > 0) {
        log.success(`${removed} hook${removed > 1 ? 's' : ''} removed.`);
      } else {
        log.info('No goodbot hooks found to remove.');
      }
    }
  });

function getHooksDir(projectRoot: string): string | null {
  try {
    // Respect core.hooksPath if configured
    const customPath = execSync('git config core.hooksPath 2>/dev/null', {
      cwd: projectRoot,
      encoding: 'utf-8',
    }).trim();
    if (customPath) {
      const resolved = path.isAbsolute(customPath)
        ? customPath
        : path.join(projectRoot, customPath);

      // Husky v9 sets core.hooksPath to `.husky/_`, but `.husky/_` is
      // husky's internal managed directory — files there are regenerated
      // on every `husky install` / `npm install --prepare`. Installing
      // there means goodbot's hooks get wiped silently.
      //
      // Husky's user-facing hooks live in the PARENT (`.husky/`).
      // Detect this case and install into the parent instead, so our
      // changes survive husky reinstalls.
      if (resolved.endsWith(`${path.sep}_`) || resolved === '_') {
        return path.dirname(resolved);
      }
      return resolved;
    }
  } catch {
    // No custom hooks path
  }

  try {
    const gitDir = execSync('git rev-parse --git-dir 2>/dev/null', {
      cwd: projectRoot,
      encoding: 'utf-8',
    }).trim();
    const resolved = path.isAbsolute(gitDir)
      ? gitDir
      : path.join(projectRoot, gitDir);
    return path.join(resolved, 'hooks');
  } catch {
    return null;
  }
}

async function installHook(
  hooksDir: string,
  hookName: string,
  hookContent: string,
): Promise<void> {
  const hookPath = path.join(hooksDir, hookName);
  const exists = await fileExists(hookPath);

  if (exists) {
    const existing = await fs.readFile(hookPath, 'utf-8');

    // Already installed — replace the goodbot section
    if (existing.includes(HOOK_MARKER_START)) {
      const updated = replaceSection(existing, hookContent);
      await fs.writeFile(hookPath, updated, { mode: 0o755 });
      console.log(`  ${hookName.padEnd(16)} ${chalk.yellow('↻ updated')}`);
      return;
    }

    // Existing hook without goodbot — append
    const appended = existing.trimEnd() + '\n' + hookContent;
    await fs.writeFile(hookPath, appended, { mode: 0o755 });
    console.log(`  ${hookName.padEnd(16)} ${chalk.green('✓ appended')} ${chalk.dim('(existing hook preserved)')}`);
  } else {
    // New hook
    const content = '#!/bin/sh\n' + hookContent;
    await fs.writeFile(hookPath, content, { mode: 0o755 });
    console.log(`  ${hookName.padEnd(16)} ${chalk.green('✓ installed')}`);
  }
}

async function uninstallHook(
  hooksDir: string,
  hookName: string,
): Promise<boolean> {
  const hookPath = path.join(hooksDir, hookName);
  const exists = await fileExists(hookPath);

  if (!exists) return false;

  const content = await fs.readFile(hookPath, 'utf-8');
  if (!content.includes(HOOK_MARKER_START)) return false;

  const cleaned = removeSection(content);

  // If only the shebang (or nothing) remains, remove the file
  const trimmed = cleaned.trim();
  if (!trimmed || trimmed === '#!/bin/sh' || trimmed === '#!/bin/bash') {
    await fs.unlink(hookPath);
    console.log(`  ${hookName.padEnd(16)} ${chalk.green('✓ removed')}`);
  } else {
    await fs.writeFile(hookPath, cleaned, { mode: 0o755 });
    console.log(`  ${hookName.padEnd(16)} ${chalk.green('✓ removed')} ${chalk.dim('(other hooks preserved)')}`);
  }

  return true;
}

function replaceSection(content: string, newSection: string): string {
  const startIdx = content.indexOf(HOOK_MARKER_START);
  const endIdx = content.indexOf(HOOK_MARKER_END);
  if (startIdx === -1 || endIdx === -1) return content;

  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + HOOK_MARKER_END.length);
  return before + newSection.trim() + after;
}

function removeSection(content: string): string {
  const startIdx = content.indexOf(HOOK_MARKER_START);
  const endIdx = content.indexOf(HOOK_MARKER_END);
  if (startIdx === -1 || endIdx === -1) return content;

  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + HOOK_MARKER_END.length);
  return (before + after).replace(/\n{3,}/g, '\n\n');
}

import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, saveConfig } from '../config/index.js';
import { runFullScan } from '../scanners/index.js';
import { runFullAnalysis } from '../analyzers/index.js';
import { log } from '../utils/index.js';
import type { CircularDependency, SolidViolation } from '../analyzers/types.js';
import type { SuppressionRule } from '../analyzers/suppressions.js';

/** Candidate violation that can be suppressed, with a stable content-based ID. */
interface Candidate {
  id: string;
  rule: SuppressionRule;
  identifier: { file?: string; cycle?: string };
  label: string;
}

export const suppressCommand = new Command('suppress')
  .description('List suppressible violations and emit paste-ready suppression entries')
  .argument('[id]', 'Content-based violation id (e.g. cycle-app-database, layer-src-scripts-migrate). Omit to list everything.')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-r, --reason <text>', 'Reason to attach to the suppression')
  .option('--apply', 'Write the suppression to .goodbot/config.json instead of printing', false)
  .action(async (id: string | undefined, opts) => {
    const projectRoot = opts.path;

    let config;
    try {
      config = await loadConfig(projectRoot);
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    const scan = await runFullScan(projectRoot);
    // Run with --no-ignore so the user can suppress violations that are currently
    // being filtered by `analysis.ignore.*`. That makes every violation addressable.
    const analysis = await runFullAnalysis(projectRoot, scan.structure, config, { noIgnore: true });

    const candidates = collectCandidates(analysis);

    if (!id) {
      renderList(candidates);
      return;
    }

    const match = candidates.find((c) => c.id === id);
    if (!match) {
      log.error(`No violation with id "${id}".`);
      log.dim('IDs are content-based (e.g. cycle-app-database). If this ID worked before, the underlying violation may have been fixed or its shape changed.');
      log.dim('Run `goodbot suppress` (no args) to see current IDs.');
      process.exit(1);
    }

    const reason = (opts.reason ?? '').trim();

    // --apply requires a real reason. No TODO placeholders reach main.
    if (opts.apply) {
      const reasonError = validateReason(reason);
      if (reasonError) {
        log.error(reasonError);
        console.log(`  goodbot suppress ${id} --reason "Migration scripts legitimately use services" --apply`);
        process.exit(1);
      }
    } else if (!reason) {
      log.warn('No --reason provided. Suppressions require a reason. Example:');
      console.log(`  goodbot suppress ${id} --reason "Migration scripts legitimately use services"`);
      console.log();
    }

    const entry = {
      rule: match.rule,
      ...match.identifier,
      reason: reason || 'TODO: explain why this is intentional',
    };

    if (opts.apply) {
      const existing = config.analysis.suppressions ?? [];
      const dupe = existing.find(
        (s) =>
          s.rule === entry.rule &&
          s.file === entry.file &&
          s.cycle === entry.cycle,
      );
      if (dupe) {
        log.warn('This suppression is already in .goodbot/config.json.');
        process.exit(0);
      }
      config.analysis.suppressions = [...existing, entry];
      await saveConfig(projectRoot, config);
      log.success(`Added suppression to .goodbot/config.json (${match.label})`);
    } else {
      console.log();
      log.dim('Add this to .goodbot/config.json under analysis.suppressions:');
      console.log();
      console.log(JSON.stringify(entry, null, 2));
      console.log();
      log.dim('Or run with --apply to append it for you (requires --reason).');
    }
  });

// ─── unsuppress command (removes a suppression by id) ───

export const unsuppressCommand = new Command('unsuppress')
  .description('Remove a suppression from analysis.suppressions by its content-based id')
  .argument('<id>', 'The same id format emitted by `goodbot suppress` (e.g. cycle-app-database)')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .action(async (id: string, opts) => {
    const projectRoot = opts.path;

    let config;
    try {
      config = await loadConfig(projectRoot);
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    const existing = config.analysis.suppressions ?? [];
    if (existing.length === 0) {
      log.info('No suppressions to remove — .goodbot/config.json has none.');
      return;
    }

    // Match the provided ID against each suppression's synthesized ID.
    // This is the reverse lookup: given a suppression in config, what ID would
    // `goodbot suppress` emit for it today?
    const targetIndex = existing.findIndex((s) => suppressionMatchesId(s, id));
    if (targetIndex === -1) {
      log.error(`No suppression in config matches id "${id}".`);
      log.dim('Run `goodbot suppress` (no args) to see current ids, or open .goodbot/config.json to inspect existing suppressions.');
      process.exit(1);
    }

    const removed = existing[targetIndex];
    const remaining = [...existing.slice(0, targetIndex), ...existing.slice(targetIndex + 1)];
    config.analysis.suppressions = remaining;
    await saveConfig(projectRoot, config);

    const label = removed.cycle ? `cycle="${removed.cycle}"` : removed.file ? `file="${removed.file}"` : '(no identifier)';
    log.success(`Removed suppression: ${removed.rule} ${label}`);
    log.dim(`  reason was: ${removed.reason}`);
  });

/**
 * Check whether an existing suppression config entry would have the given
 * content-based ID. Works for both file-based and cycle-based suppressions.
 */
export function suppressionMatchesId(suppression: { rule: SuppressionRule; file?: string; cycle?: string }, id: string): boolean {
  const prefix = RULE_PREFIX[suppression.rule];

  if (suppression.cycle) {
    // Cycle IDs are content-based on sorted, deduped module names.
    const modules = suppression.cycle
      .split(/\s*(?:→|↔|<->|->|<-|>|,)\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    const unique = Array.from(new Set(modules)).sort();
    const expected = `${prefix}-${unique.map(slugify).join('-')}`;
    return expected === id;
  }

  if (suppression.file) {
    const expected = `${prefix}-${slugify(suppression.file)}`;
    return expected === id;
  }

  return false;
}

/**
 * Ensure the reason attached to a suppression is useful. Empty strings and
 * literal TODO placeholders are rejected so nothing useless reaches main.
 */
export function validateReason(reason: string): string | null {
  if (!reason) {
    return '--apply requires --reason. Suppressions must be documented with a real justification.';
  }
  if (/^\s*TODO\b/i.test(reason)) {
    return '`--reason` looks like a placeholder ("TODO..."). Provide the real justification.';
  }
  if (reason.length < 8) {
    return '`--reason` is too short. Provide a real justification (min 8 characters).';
  }
  return null;
}

// ─── ID generation ──────────────────────────────────────

/**
 * Short rule prefixes used in violation IDs. Readable form preferred over hashes
 * so IDs tell you what they target at a glance.
 */
const RULE_PREFIX: Record<SuppressionRule, string> = {
  circularDep: 'cycle',
  layerViolation: 'layer',
  barrelViolation: 'barrel',
  stabilityViolation: 'stability',
  oversizedFile: 'oversized',
  complexity: 'complexity',
  duplication: 'duplication',
  deadExport: 'dead-export',
  dependencyInversion: 'dip',
  interfaceSegregation: 'isp',
  shallowModule: 'shallow',
  godModule: 'god',
};

/** Convert a path (or any string) into a stable slug: alphanumerics + dashes. */
function slugify(raw: string): string {
  return raw
    .replace(/\.[a-zA-Z0-9]+$/, '') // strip extension
    .replace(/[^a-zA-Z0-9]+/g, '-') // non-alnum → dash
    .replace(/^-+|-+$/g, '')        // trim leading/trailing dashes
    .toLowerCase();
}

function cycleId(cycle: CircularDependency): string {
  // Dedupe + sort so the ID is invariant across direction and the
  // trailing-repeat convention Tarjan's output uses.
  const unique = Array.from(new Set(cycle.cycle)).sort();
  return `${RULE_PREFIX.circularDep}-${unique.map(slugify).join('-')}`;
}

function fileBasedId(rule: SuppressionRule, file: string): string {
  return `${RULE_PREFIX[rule]}-${slugify(file)}`;
}

// ─── Helpers ────────────────────────────────────────────

function collectCandidates(
  analysis: Awaited<ReturnType<typeof runFullAnalysis>>,
): Candidate[] {
  const out: Candidate[] = [];
  const seenIds = new Set<string>();

  const push = (candidate: Candidate) => {
    // Stable IDs should be unique in practice. If two violations collide,
    // fall back to appending a short disambiguator.
    if (seenIds.has(candidate.id)) {
      let n = 2;
      while (seenIds.has(`${candidate.id}-${n}`)) n++;
      candidate = { ...candidate, id: `${candidate.id}-${n}` };
    }
    seenIds.add(candidate.id);
    out.push(candidate);
  };

  for (const cycle of analysis.dependency.circularDependencies) {
    push({
      id: cycleId(cycle),
      rule: 'circularDep',
      identifier: { cycle: formatCycleForConfig(cycle) },
      label: `cycle: ${cycle.cycle.join(' → ')}`,
    });
  }

  for (const v of analysis.dependency.layerViolations) {
    push({
      id: fileBasedId('layerViolation', v.file),
      rule: 'layerViolation',
      identifier: { file: v.file },
      label: `${v.file} (L${v.fromLevel} → L${v.toLevel})`,
    });
  }

  for (const v of analysis.dependency.barrelViolations) {
    push({
      id: fileBasedId('barrelViolation', v.file),
      rule: 'barrelViolation',
      identifier: { file: v.file },
      label: `${v.file}: ${v.specifier}`,
    });
  }

  for (const v of analysis.solid.violations) {
    const category = categorizeSolid(v);
    if (!category) continue;
    push({
      id: fileBasedId(category, v.file),
      rule: category,
      identifier: { file: v.file },
      label: `${v.file}: ${v.message.substring(0, 80)}`,
    });
  }

  return out;
}

function renderList(candidates: Candidate[]): void {
  if (candidates.length === 0) {
    log.success('No violations detected — nothing to suppress.');
    return;
  }

  const byRule: Record<string, Candidate[]> = {};
  for (const c of candidates) {
    (byRule[c.rule] ??= []).push(c);
  }

  console.log();
  log.dim('Detected violations (ignores bypassed — see everything):');
  log.dim('IDs are content-based — stable as long as the violation exists. Fixing the violation makes the ID disappear.');
  console.log();

  const order: SuppressionRule[] = [
    'circularDep', 'layerViolation', 'barrelViolation', 'stabilityViolation',
    'oversizedFile', 'complexity', 'duplication', 'deadExport',
    'dependencyInversion', 'interfaceSegregation', 'shallowModule', 'godModule',
  ];
  for (const rule of order) {
    const group = byRule[rule];
    if (!group || group.length === 0) continue;
    console.log(`  ${chalk.bold(rule)} (${group.length}):`);
    for (const c of group) {
      console.log(`    ${chalk.cyan(`[${c.id}]`)}  ${c.label}`);
    }
    console.log();
  }

  console.log(chalk.dim('To suppress, run with an id and a reason:'));
  const example = candidates[0];
  console.log(chalk.dim(`  goodbot suppress ${example.id} --reason "explain why this is intentional"`));
  console.log(chalk.dim(`  goodbot suppress ${example.id} --reason "..." --apply   # writes to config`));
}

/** Convert a cycle's module list into the canonical "a ↔ b" form that
 *  analysis.suppressions.cycle accepts.
 */
function formatCycleForConfig(cycle: CircularDependency): string {
  const unique = cycle.cycle[cycle.cycle.length - 1] === cycle.cycle[0]
    ? cycle.cycle.slice(0, -1)
    : cycle.cycle;
  return unique.join(' ↔ ');
}

function categorizeSolid(v: SolidViolation): SuppressionRule | null {
  if (v.principle === 'SRP' && v.message.includes('lines (threshold')) return 'oversizedFile';
  if (v.principle === 'SRP' && v.message.toLowerCase().includes('complexity')) return 'complexity';
  if (v.principle === 'SRP' && v.message.toLowerCase().includes('duplicat')) return 'duplication';
  if (v.message.includes('Dead export')) return 'deadExport';
  if (v.principle === 'DIP') return 'dependencyInversion';
  if (v.message.includes('Shallow module')) return 'shallowModule';
  if (v.message.includes('God module')) return 'godModule';
  if (v.principle === 'ISP') return 'interfaceSegregation';
  return null;
}

import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, saveConfig } from '../config/index.js';
import { runFullScan } from '../scanners/index.js';
import { runFullAnalysis } from '../analyzers/index.js';
import { log } from '../utils/index.js';
import type { CircularDependency, SolidViolation } from '../analyzers/types.js';
import type { SuppressionRule } from '../analyzers/suppressions.js';

/** Candidate violation that can be suppressed, with a stable ID for user selection */
interface Candidate {
  id: string;
  rule: SuppressionRule;
  identifier: { file?: string; cycle?: string };
  label: string;
}

export const suppressCommand = new Command('suppress')
  .description('List suppressible violations and emit paste-ready suppression entries')
  .argument('[id]', 'Violation id from the list (e.g. c0, l2, s1). Omit to list everything.')
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
      log.error(`No violation with id "${id}". Run \`goodbot suppress\` (no args) to see the list.`);
      process.exit(1);
    }

    const reason = opts.reason ?? '';
    if (!reason) {
      log.warn(`No --reason provided. Suppressions require a reason. Example:`);
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
      if (!reason) {
        log.warn('Remember to update the reason field — the default placeholder will not help your future teammate.');
      }
    } else {
      console.log();
      log.dim('Add this to .goodbot/config.json under analysis.suppressions:');
      console.log();
      console.log(JSON.stringify(entry, null, 2));
      console.log();
      log.dim('Or run with --apply to append it for you.');
    }
  });

// ─── Helpers ────────────────────────────────────────────

function collectCandidates(
  analysis: Awaited<ReturnType<typeof runFullAnalysis>>,
): Candidate[] {
  const out: Candidate[] = [];

  analysis.dependency.circularDependencies.forEach((cycle, i) => {
    out.push({
      id: `c${i}`,
      rule: 'circularDep',
      identifier: { cycle: formatCycleForConfig(cycle) },
      label: `cycle: ${cycle.cycle.join(' → ')}`,
    });
  });

  analysis.dependency.layerViolations.forEach((v, i) => {
    out.push({
      id: `l${i}`,
      rule: 'layerViolation',
      identifier: { file: v.file },
      label: `${v.file} (L${v.fromLevel} → L${v.toLevel})`,
    });
  });

  analysis.dependency.barrelViolations.forEach((v, i) => {
    out.push({
      id: `b${i}`,
      rule: 'barrelViolation',
      identifier: { file: v.file },
      label: `${v.file}: ${v.specifier}`,
    });
  });

  const solidViolations = analysis.solid.violations;
  const solidByCategory = new Map<SuppressionRule, SolidViolation[]>();
  for (const v of solidViolations) {
    const category = categorizeSolid(v);
    if (!category) continue;
    const list = solidByCategory.get(category) ?? [];
    list.push(v);
    solidByCategory.set(category, list);
  }
  for (const [category, vs] of solidByCategory.entries()) {
    const prefix = CATEGORY_PREFIX[category];
    vs.forEach((v, i) => {
      out.push({
        id: `${prefix}${i}`,
        rule: category,
        identifier: { file: v.file },
        label: `${v.file}: ${v.message.substring(0, 80)}`,
      });
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
  console.log();

  const order = ['circularDep', 'layerViolation', 'barrelViolation', 'stabilityViolation', 'oversizedFile', 'complexity', 'duplication', 'deadExport', 'dependencyInversion', 'interfaceSegregation', 'shallowModule', 'godModule'];
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

const CATEGORY_PREFIX: Partial<Record<SuppressionRule, string>> = {
  oversizedFile: 'o',
  complexity: 'x',
  duplication: 'd',
  deadExport: 'de',
  dependencyInversion: 'dip',
  interfaceSegregation: 'isp',
  shallowModule: 'sh',
  godModule: 'g',
  stabilityViolation: 's',
};

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


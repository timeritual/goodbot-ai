import { Command } from 'commander';
import path from 'node:path';
import ora from 'ora';
import { runFullScan } from '../scanners/index.js';
import { runFullAnalysis } from '../analyzers/index.js';
import { loadConfig, type GoodbotConfig } from '../config/index.js';
import { log, safeWriteFile } from '../utils/index.js';
import type { FullAnalysis } from '../analyzers/index.js';
import type { ScanResult, DetectedLayer } from '../scanners/index.js';

export const onboardCommand = new Command('onboard')
  .description('Generate a new developer onboarding guide for your project')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-o, --output <file>', 'Output file', 'ONBOARDING.md')
  .action(async (opts) => {
    const projectRoot = opts.path;
    const spinner = ora('Analyzing project for onboarding guide...').start();

    try {
      const scan = await runFullScan(projectRoot);
      let config: GoodbotConfig | undefined;
      try { config = await loadConfig(projectRoot); } catch { /* no config */ }

      const analysis = await runFullAnalysis(projectRoot, scan.structure, config);
      spinner.succeed('Analysis complete');

      const guide = generateOnboardingGuide(scan, analysis, config);
      const outputPath = path.join(projectRoot, opts.output);
      await safeWriteFile(outputPath, guide);

      log.success(`Onboarding guide saved to ${opts.output}`);
      log.dim(`${guide.split('\n').length} lines — ready for new team members.`);
    } catch (err) {
      spinner.fail('Failed');
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

function generateOnboardingGuide(
  scan: ScanResult,
  analysis: FullAnalysis,
  config?: GoodbotConfig,
): string {
  const lines: string[] = [];
  const { health, dependency: dep } = analysis;

  // Header
  lines.push(`# Developer Onboarding — ${scan.projectName}`);
  lines.push('');
  lines.push(`> Welcome to the ${scan.projectName} codebase! This guide will help you understand the architecture, conventions, and rules before you start contributing.`);
  lines.push('');

  // Project overview
  lines.push('## Project Overview');
  lines.push('');
  lines.push(`| | |`);
  lines.push(`|---|---|`);
  lines.push(`| **Framework** | ${scan.framework.framework} |`);
  lines.push(`| **Language** | ${scan.language.primary} |`);
  lines.push(`| **Architecture Health** | ${health.grade} (${health.score}/100) |`);
  lines.push(`| **Modules** | ${dep.modules.length} |`);
  lines.push(`| **Source Files** | ${dep.filesParsed} |`);
  if (config) {
    lines.push(`| **Main Branch** | \`${config.conventions.mainBranch}\` |`);
  }
  lines.push('');

  // Architecture
  if (scan.structure.detectedLayers.length > 0) {
    lines.push('## Architecture');
    lines.push('');
    lines.push('This project uses a **layered architecture** with downward-only dependencies. Higher layers can import from lower layers, never the reverse.');
    lines.push('');
    lines.push('```');

    const sorted = [...scan.structure.detectedLayers].sort((a, b) => b.suggestedLevel - a.suggestedLevel);
    for (const layer of sorted) {
      const extras: string[] = [];
      if (layer.hasBarrel) extras.push('barrel');
      if (layer.hasInterfaces) extras.push('interfaces');
      const tag = extras.length > 0 ? ` (${extras.join(', ')})` : '';
      lines.push(`  Layer ${layer.suggestedLevel}:  ${layer.name.padEnd(16)} ← ${layer.path}${tag}`);
    }

    lines.push('```');
    lines.push('');

    // Module descriptions — derived from analysis data
    lines.push('### Modules');
    lines.push('');

    for (const layer of scan.structure.detectedLayers) {
      const desc = describeModule(layer, dep, analysis);
      lines.push(`- **${layer.name}/** — ${desc}`);
    }
    lines.push('');
  }

  // Key rules
  lines.push('## Key Rules');
  lines.push('');

  if (scan.structure.hasBarrelFiles) {
    lines.push('### Import Convention');
    lines.push('');
    lines.push('Always import from barrel files (the module root), never from internal files:');
    lines.push('');
    lines.push('```typescript');
    lines.push("// ✅ Correct");
    lines.push("import { myFunction } from '../services';");
    lines.push('');
    lines.push("// ❌ Wrong — bypasses the barrel");
    lines.push("import { myFunction } from '../services/myService';");
    lines.push('```');
    lines.push('');
  }

  if (config?.businessLogic) {
    lines.push('### Business Logic Placement');
    lines.push('');
    if (config.businessLogic.allowedIn.length > 0) {
      lines.push(`Business logic belongs in: **${config.businessLogic.allowedIn.join(', ')}**`);
    }
    if (config.businessLogic.forbiddenIn.length > 0) {
      lines.push(`Business logic must NOT go in: ${config.businessLogic.forbiddenIn.join(', ')}`);
    }
    lines.push('');

    if (config.businessLogic.redFlags.length > 0) {
      lines.push('**Red flags** — if you see yourself doing any of these, reconsider:');
      lines.push('');
      for (const flag of config.businessLogic.redFlags) {
        lines.push(`- ${flag}`);
      }
      lines.push('');
    }
  }

  // Verification
  const verCmds = scan.verification;
  const hasVer = verCmds.typecheck || verCmds.lint || verCmds.test;
  if (hasVer) {
    lines.push('## Before You Commit');
    lines.push('');
    lines.push('Always run these before committing:');
    lines.push('');
    lines.push('```bash');
    if (verCmds.typecheck) lines.push(verCmds.typecheck);
    if (verCmds.lint) lines.push(verCmds.lint);
    if (verCmds.test) lines.push(verCmds.test);
    lines.push('```');
    lines.push('');
  }

  // Current health
  lines.push('## Current Health');
  lines.push('');
  lines.push(`| Dimension | Score |`);
  lines.push(`|-----------|-------|`);
  lines.push(`| Dependencies | ${health.breakdown.dependencies}/100 |`);
  lines.push(`| Stability | ${health.breakdown.stability}/100 |`);
  lines.push(`| SOLID | ${health.breakdown.solid}/100 |`);
  lines.push(`| Architecture | ${health.breakdown.architecture}/100 |`);
  lines.push('');

  // Known issues
  const issues: string[] = [];
  if (dep.circularDependencies.length > 0) {
    issues.push(`${dep.circularDependencies.length} circular dependenc${dep.circularDependencies.length === 1 ? 'y' : 'ies'}`);
  }
  if (dep.layerViolations.length > 0) {
    issues.push(`${dep.layerViolations.length} layer violation${dep.layerViolations.length === 1 ? '' : 's'}`);
  }
  const solidErrors = analysis.solid.violations.filter(v => v.severity === 'error').length;
  if (solidErrors > 0) {
    issues.push(`${solidErrors} SOLID violation${solidErrors === 1 ? '' : 's'}`);
  }
  if (issues.length > 0) {
    lines.push(`> **Known issues:** ${issues.join(', ')}. Run \`goodbot analyze\` for details.`);
    lines.push('');
  }

  // Custom rules
  if (config?.conventions.customRules && config.conventions.customRules.length > 0) {
    lines.push('## Project-Specific Rules');
    lines.push('');
    for (const rule of config.conventions.customRules) {
      lines.push(`- ${rule}`);
    }
    lines.push('');
  }

  // Getting started
  lines.push('## Getting Started');
  lines.push('');
  lines.push('1. Read `CODING_GUIDELINES.md` — the authoritative source of truth for all code conventions');
  lines.push('2. Run `goodbot analyze` to see the current architecture health');
  lines.push('3. Run `goodbot watch` while coding to get real-time feedback');
  lines.push('4. Before submitting a PR, run `goodbot diff` to check your changes');
  lines.push('');

  lines.push('---');
  lines.push('*Generated by [goodbot](https://github.com/timeritual/goodbot-ai)*');
  lines.push('');

  return lines.join('\n');
}

/**
 * Derive a module description from analysis data rather than using hardcoded strings.
 * Looks at file count, dependency relationships, stability, and role in the graph.
 */
export function describeModule(
  layer: DetectedLayer,
  dep: FullAnalysis['dependency'],
  analysis: FullAnalysis,
): string {
  const mod = dep.modules.find(m => m.name === layer.name);
  if (!mod) return `${layer.name} module.`;

  const parts: string[] = [];

  // File count
  parts.push(`${mod.fileCount} file${mod.fileCount === 1 ? '' : 's'}`);

  // Stability characterization
  const stability = dep.stability.find(s => s.moduleName === layer.name);
  if (stability) {
    if (stability.instability <= 0.2 && stability.afferentCoupling > 0) {
      parts.push('highly stable (many dependents)');
    } else if (stability.instability >= 0.8 && stability.efferentCoupling > 0) {
      parts.push('volatile (depends on many modules)');
    }
  }

  // Dependency direction
  const dependsOn = Array.from(mod.dependsOn);
  const dependedOnBy = Array.from(mod.dependedOnBy);

  if (dependedOnBy.length > 0 && dependsOn.length === 0) {
    parts.push('foundation layer — imported by ' + formatModuleList(dependedOnBy));
  } else if (dependsOn.length > 0 && dependedOnBy.length === 0) {
    parts.push('leaf layer — imports from ' + formatModuleList(dependsOn));
  } else if (dependsOn.length > 0 && dependedOnBy.length > 0) {
    parts.push(`imports from ${formatModuleList(dependsOn)}, used by ${formatModuleList(dependedOnBy)}`);
  }

  // Barrel status
  if (layer.hasBarrel) {
    parts.push('has barrel (import from index)');
  }

  // Violations in this module
  const moduleViolations = analysis.solid.violations.filter(
    v => v.file.startsWith(layer.path + '/') || v.file.startsWith(layer.name + '/'),
  );
  const errorCount = moduleViolations.filter(v => v.severity === 'error').length;
  if (errorCount > 0) {
    parts.push(`${errorCount} issue${errorCount === 1 ? '' : 's'} to address`);
  }

  return parts.join('. ') + '.';
}

function formatModuleList(modules: string[]): string {
  if (modules.length <= 3) return modules.join(', ');
  return `${modules.slice(0, 3).join(', ')} and ${modules.length - 3} more`;
}

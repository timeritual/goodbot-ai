import { Command } from 'commander';
import path from 'node:path';
import ora from 'ora';
import { runFullScan } from '../scanners/index.js';
import { runFullAnalysis } from '../analyzers/index.js';
import { loadConfig, type GoodbotConfig } from '../config/index.js';
import { log, safeWriteFile } from '../utils/index.js';
import type { FullAnalysis } from '../analyzers/index.js';
import type { ScanResult } from '../scanners/index.js';

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

    // Module descriptions
    lines.push('### What Each Module Does');
    lines.push('');

    const moduleDescriptions: Record<string, string> = {
      types: 'Pure type definitions. No runtime code. The foundation everything depends on.',
      constants: 'Static configuration values, magic numbers, enums. No logic.',
      config: 'Environment configuration, API URLs, feature flags.',
      utils: 'Shared utilities — storage helpers, error handling, device detection.',
      api: 'HTTP clients, API request/response handling, token management.',
      services: 'Business logic — data transformation, validation, caching, API orchestration.',
      hooks: 'React hooks — thin wrappers that call services and manage UI state.',
      contexts: 'React context providers — global state management.',
      components: 'Reusable UI components — buttons, inputs, modals, layouts.',
      screens: 'Screen-level components — compose other components, handle navigation.',
      navigation: 'Routing and navigation configuration.',
      features: 'Feature modules — self-contained slices of functionality.',
      lib: 'Shared library code used across the application.',
      stores: 'State management stores (Redux, Zustand, etc.).',
      pages: 'Page-level components (Next.js pages or similar).',
      routes: 'API route handlers.',
      middleware: 'Request/response middleware.',
      controllers: 'Request handlers (MVC pattern).',
    };

    for (const layer of scan.structure.detectedLayers) {
      const desc = moduleDescriptions[layer.name] ?? `${layer.name} module.`;
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

  if (dep.circularDependencies.length > 0) {
    lines.push(`> **Known issues:** ${dep.circularDependencies.length} circular dependencies. Run \`goodbot analyze\` for details.`);
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

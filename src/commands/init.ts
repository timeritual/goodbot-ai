import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import { runFullScan } from '../scanners/index.js';
import {
  saveConfig,
  loadConfig,
  configExists,
  frameworkDefaults,
  buildPresetConfig,
  defaultAnalysisExclude,
  mergeConfigWithPreset,
  diffConfigs,
  PRESET_DESCRIPTIONS,
  type GoodbotConfig,
  type PresetName,
} from '../config/index.js';
import { log, fileExists, safeWriteFile } from '../utils/index.js';
import type { Framework, Language } from '../scanners/index.js';
import path from 'node:path';

const FRAMEWORKS: Framework[] = [
  'react', 'react-native', 'next', 'angular', 'vue', 'nuxt',
  'node', 'express', 'nest',
  'python', 'django', 'flask', 'fastapi', 'go', 'other',
];

const LANGUAGES: Language[] = ['typescript', 'javascript', 'python', 'go', 'other'];

export const initCommand = new Command('init')
  .description('Initialize goodbot configuration for your project')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--force', 'Overwrite existing config', false)
  .option('--preset <preset>', 'Use a preset: strict, recommended, or relaxed')
  .option('--dry-run', 'Preview what the preset would configure without saving', false)
  .option('--on-conflict <strategy>', 'How to handle existing agent files: merge, overwrite, or skip (default: merge)')
  .action(async (opts) => {
    const projectRoot = opts.path;
    const isPreset = !!opts.preset;
    const configAlreadyExists = await configExists(projectRoot);

    // If config exists and user didn't pass --force, we merge preset into existing config
    // (preserving user customizations). Interactive mode confirms.
    if (configAlreadyExists && !opts.force && !isPreset) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: '.goodbot/config.json already exists. What do you want to do?',
          choices: [
            { name: 'Merge — refresh detected fields, preserve my customizations', value: 'merge' },
            { name: 'Overwrite — replace everything (loses custom verification commands, rules, etc.)', value: 'overwrite' },
            { name: 'Cancel', value: 'cancel' },
          ],
          default: 'merge',
        },
      ]);
      if (action === 'cancel') {
        log.info('Cancelled.');
        return;
      }
      if (action === 'overwrite') opts.force = true;
    }

    // Phase 1: Auto-scan
    const spinner = ora('Scanning project...').start();
    const scan = await runFullScan(projectRoot);
    spinner.succeed('Scan complete');

    // Determine existing file strategy
    let existingFileStrategy: 'merge' | 'overwrite' | 'skip' = 'merge';
    if (opts.onConflict) {
      if (!['merge', 'overwrite', 'skip'].includes(opts.onConflict)) {
        log.error(`Unknown --on-conflict value "${opts.onConflict}". Use: merge, overwrite, or skip.`);
        process.exit(1);
      }
      existingFileStrategy = opts.onConflict as 'merge' | 'overwrite' | 'skip';
    } else if (!isPreset) {
      // Interactive: check for existing agent files
      const agentFileNames = ['CLAUDE.md', '.cursorrules', '.windsurfrules', 'AGENTS.md', 'CODING_GUIDELINES.md'];
      const existingFiles: string[] = [];
      for (const f of agentFileNames) {
        if (await fileExists(path.join(projectRoot, f))) {
          existingFiles.push(f);
        }
      }

      if (existingFiles.length > 0) {
        log.warn(`Found existing agent files: ${existingFiles.join(', ')}`);
        const { fileAction } = await inquirer.prompt([
          {
            type: 'list',
            name: 'fileAction',
            message: 'How should `goodbot generate` handle these files?',
            choices: [
              { name: 'Merge — prepend goodbot section, keep your content', value: 'merge' },
              { name: 'Overwrite — replace entirely with generated content', value: 'overwrite' },
              { name: 'Skip — do not generate files that already exist', value: 'skip' },
            ],
            default: 'merge',
          },
        ]);
        existingFileStrategy = fileAction;
      }
    }

    // Fast path: preset mode (no further interactive prompts)
    if (isPreset) {
      const preset = opts.preset as PresetName;
      if (!['strict', 'recommended', 'relaxed'].includes(preset)) {
        log.error(`Unknown preset "${preset}". Use: strict, recommended, or relaxed.`);
        process.exit(1);
      }

      let config = buildPresetConfig(preset, scan);
      config.agentFiles.existingFileStrategy = existingFileStrategy;

      // If an existing config is present, merge the preset into it (preserving user customizations).
      // --force bypasses the merge and overwrites with the raw preset.
      if (configAlreadyExists && !opts.force) {
        try {
          const existing = await loadConfig(projectRoot);
          const merged = mergeConfigWithPreset(existing, config);
          // Preserve user's existingFileStrategy unless they passed --on-conflict explicitly
          if (!opts.onConflict) {
            merged.agentFiles.existingFileStrategy = existing.agentFiles.existingFileStrategy;
          }
          const changes = diffConfigs(existing, merged);
          config = merged;
          if (changes.length > 0) {
            log.info(`Merging "${preset}" preset into existing config (preserving your customizations). ${changes.length} detected-field${changes.length === 1 ? '' : 's'} refreshed:`);
            for (const c of changes) {
              console.log(`  ${c.path}: ${c.from} → ${c.to}`);
            }
          } else {
            log.dim('Existing config already matches current scan — no changes needed.');
          }
        } catch (err) {
          log.warn(`Could not load existing config for merge — falling back to preset defaults. (${err instanceof Error ? err.message : String(err)})`);
        }
      }

      if (opts.dryRun) {
        log.info(`Preview of "${preset}" preset for ${config.project.name}:`);
        console.log();
        const show = (label: string, value: string) =>
          console.log(`  ${label.padEnd(24)} ${value}`);
        show('Framework', `${config.project.framework} (${config.project.language})`);
        show('Layers', config.architecture.layers.length > 0 ? config.architecture.layers.map(l => l.name).join(', ') : 'none');
        show('Barrel imports', config.architecture.barrelImportRule);
        show('Interface contracts', config.architecture.interfaceContracts ? 'yes' : 'no');
        show('Import style', config.conventions.importStyle);
        show('Business logic in', config.businessLogic.allowedIn.join(', ') || 'not specified');
        show('Red flags', config.businessLogic.redFlags.length > 0 ? `${config.businessLogic.redFlags.length} rules` : 'none');
        show('Existing files', existingFileStrategy);
        if (config.verification.typecheck) show('Type check', config.verification.typecheck);
        if (config.verification.lint) show('Lint', config.verification.lint);
        if (config.verification.test) show('Test', config.verification.test);
        console.log();
        log.dim('Run without --dry-run to save this config.');
        return;
      }

      await saveConfig(projectRoot, config);
      await ensureGoodbotGitignore(projectRoot);
      log.success(configAlreadyExists && !opts.force
        ? `Config updated at .goodbot/config.json (your customizations preserved)`
        : `Config saved with "${preset}" preset to .goodbot/config.json`);
      log.dim(PRESET_DESCRIPTIONS[preset]);
      printNextSteps();
      return;
    }

    // Phase 2: Interactive prompts
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Project name:',
        default: scan.projectName,
      },
      {
        type: 'confirm',
        name: 'frameworkCorrect',
        message: `Detected ${scan.framework.framework} (${scan.language.primary}). Is this correct?`,
        default: true,
      },
    ]);

    let framework: Framework = scan.framework.framework;
    let language: Language = scan.language.primary;

    if (!answers.frameworkCorrect) {
      const corrections = await inquirer.prompt([
        {
          type: 'list',
          name: 'framework',
          message: 'Select your framework:',
          choices: FRAMEWORKS,
        },
        {
          type: 'list',
          name: 'language',
          message: 'Select your primary language:',
          choices: LANGUAGES,
        },
      ]);
      framework = corrections.framework;
      language = corrections.language;
    }

    const { mainBranch } = await inquirer.prompt([
      {
        type: 'input',
        name: 'mainBranch',
        message: 'Main branch name:',
        default: scan.defaultBranch,
      },
    ]);

    // Architecture layers
    let layers: GoodbotConfig['architecture']['layers'] = [];
    let barrelImportRule: GoodbotConfig['architecture']['barrelImportRule'] = 'recommended';
    let interfaceContracts = false;

    if (scan.structure.detectedLayers.length > 0) {
      const { useLayers } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'useLayers',
          message: `Detected ${scan.structure.detectedLayers.length} directories under ${scan.structure.srcRoot}/. Define layer architecture?`,
          default: true,
        },
      ]);

      if (useLayers) {
        layers = scan.structure.detectedLayers.map((l) => ({
          name: l.name,
          path: l.path,
          level: l.suggestedLevel,
          hasBarrel: l.hasBarrel,
          role: l.role,
        }));

        const { barrel } = await inquirer.prompt([
          {
            type: 'list',
            name: 'barrel',
            message: 'Require barrel imports for cross-layer access?',
            choices: [
              { name: 'Always (ESLint enforced)', value: 'always' },
              { name: 'Recommended (documented, not enforced)', value: 'recommended' },
              { name: 'None', value: 'none' },
            ],
            default: scan.structure.hasBarrelFiles ? 'always' : 'recommended',
          },
        ]);
        barrelImportRule = barrel;

        if (scan.structure.hasInterfaceFiles) {
          const { useContracts } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'useContracts',
              message: 'Detected interfaces.ts files. Use TypeScript `satisfies` contracts?',
              default: true,
            },
          ]);
          interfaceContracts = useContracts;
        }
      }
    }

    // Business logic placement
    const defaults = frameworkDefaults[framework];
    const layerNames = layers.map((l) => l.name);

    let businessLogicAllowedIn = defaults.businessLogicIn;
    let businessLogicForbiddenIn = defaults.businessLogicForbidden;

    if (layerNames.length > 0) {
      const { allowedIn } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'allowedIn',
          message: 'Where should business logic live?',
          choices: layerNames,
          default: defaults.businessLogicIn.filter((d) => layerNames.includes(d)),
        },
      ]);
      businessLogicAllowedIn = allowedIn;
      businessLogicForbiddenIn = layerNames.filter(
        (n: string) => !allowedIn.includes(n),
      );
    }

    // Verification commands
    const { typecheck, lint, test } = await inquirer.prompt([
      {
        type: 'input',
        name: 'typecheck',
        message: 'Type check command:',
        default: scan.verification.typecheck ?? '',
      },
      {
        type: 'input',
        name: 'lint',
        message: 'Lint command:',
        default: scan.verification.lint ?? '',
      },
      {
        type: 'input',
        name: 'test',
        message: 'Test command:',
        default: scan.verification.test ?? '',
      },
    ]);

    // Agent files
    const { agentFiles } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'agentFiles',
        message: 'Which files to generate?',
        choices: [
          { name: 'CLAUDE.md', value: 'claudeMd', checked: true },
          { name: '.cursorrules', value: 'cursorrules', checked: true },
          { name: '.windsurfrules', value: 'windsurfrules', checked: true },
          { name: 'AGENTS.md', value: 'agentsMd', checked: true },
          { name: '.cursorignore', value: 'cursorignore', checked: true },
          { name: 'CODING_GUIDELINES.md', value: 'codingGuidelines', checked: true },
        ],
      },
    ]);

    // Custom rules
    const customRules: string[] = [];
    let addingRules = true;
    const { wantsCustom } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'wantsCustom',
        message: 'Add custom rules/conventions?',
        default: false,
      },
    ]);

    if (wantsCustom) {
      while (addingRules) {
        const { rule } = await inquirer.prompt([
          {
            type: 'input',
            name: 'rule',
            message: 'Enter a rule (empty to finish):',
          },
        ]);
        if (!rule) {
          addingRules = false;
        } else {
          customRules.push(rule);
        }
      }
    }

    // Build config
    const config: GoodbotConfig = {
      version: 1,
      project: {
        name: answers.name,
        framework,
        language,
      },
      architecture: {
        layers,
        dependencyDirection: 'downward',
        barrelImportRule,
        interfaceContracts,
        systemType: scan.systemType,
      },
      businessLogic: {
        allowedIn: businessLogicAllowedIn,
        forbiddenIn: businessLogicForbiddenIn,
        redFlags: defaults.redFlags,
      },
      verification: {
        typecheck: typecheck || null,
        lint: lint || null,
        test: test || null,
        format: scan.verification.format,
        build: scan.verification.build,
      },
      agentFiles: {
        claudeMd: agentFiles.includes('claudeMd'),
        cursorrules: agentFiles.includes('cursorrules'),
        windsurfrules: agentFiles.includes('windsurfrules'),
        agentsMd: agentFiles.includes('agentsMd'),
        cursorignore: agentFiles.includes('cursorignore'),
        codingGuidelines: agentFiles.includes('codingGuidelines'),
        existingFileStrategy,
      },
      conventions: {
        mainBranch,
        importStyle: barrelImportRule === 'always' ? 'barrel' : barrelImportRule === 'recommended' ? 'barrel' : 'direct',
        customRules,
      },
      analysis: {
        solid: true,
        thresholds: { maxFileLines: 300, maxBarrelExports: 15, maxModuleCoupling: 8 },
        budget: {},
        exclude: defaultAnalysisExclude(framework),
        suppressions: [],
      },
      customRulesConfig: [],
      team: {},
      output: {
        cursorignore: {
          paths: defaults.ignorePaths,
          sensitiveFiles: ['.env', '.env.*', 'credentials.json', '*.pem', '*.key'],
        },
      },
    };

    // If an existing config is present and user chose "merge" at the top, apply
    // the merge rules (preserve customizations). --force (or they chose overwrite)
    // skips this branch.
    let finalConfig = config;
    if (configAlreadyExists && !opts.force) {
      try {
        const existing = await loadConfig(projectRoot);
        finalConfig = mergeConfigWithPreset(existing, config);
        // Respect the existingFileStrategy they just picked, not the stored one
        finalConfig.agentFiles.existingFileStrategy = existingFileStrategy;
        const changes = diffConfigs(existing, finalConfig);
        if (changes.length > 0) {
          log.info(`${changes.length} detected-field${changes.length === 1 ? '' : 's'} refreshed (customizations preserved):`);
          for (const c of changes) {
            console.log(`  ${c.path}: ${c.from} → ${c.to}`);
          }
        }
      } catch (err) {
        log.warn(`Could not load existing config for merge — saving fresh config instead. (${err instanceof Error ? err.message : String(err)})`);
      }
    }

    await saveConfig(projectRoot, finalConfig);
    await ensureGoodbotGitignore(projectRoot);

    log.success(configAlreadyExists && !opts.force
      ? 'Config updated at .goodbot/config.json (your customizations preserved)'
      : 'Config saved to .goodbot/config.json');
    printNextSteps();
  });

async function ensureGoodbotGitignore(projectRoot: string): Promise<void> {
  const gitignorePath = path.join(projectRoot, '.goodbot', '.gitignore');
  if (await fileExists(gitignorePath)) return;

  const content = `# Generated by goodbot — local analysis state, not shared
snapshot.json
checksums.json
history.json
`;
  await safeWriteFile(gitignorePath, content);
}

function printNextSteps(): void {
  console.log();
  log.dim('Next steps:');
  console.log('  1. Generate guardrails:  npx goodbot-ai generate');
  console.log('  2. Install git hooks:    npx goodbot-ai hooks install');
  console.log('  3. Check freshness:      npx goodbot-ai freshness');
  console.log('  4. Add to CI:            npx goodbot-ai check');
}

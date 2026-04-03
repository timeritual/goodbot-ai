import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import { runFullScan } from '../scanners/index.js';
import {
  saveConfig,
  configExists,
  frameworkDefaults,
  type GoodbotConfig,
} from '../config/index.js';
import { log } from '../utils/index.js';
import type { Framework, Language } from '../scanners/types.js';

const FRAMEWORKS: Framework[] = [
  'react', 'react-native', 'next', 'node', 'express', 'nest',
  'python', 'django', 'flask', 'fastapi', 'go', 'other',
];

const LANGUAGES: Language[] = ['typescript', 'javascript', 'python', 'go', 'other'];

export const initCommand = new Command('init')
  .description('Initialize goodbot configuration for your project')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--force', 'Overwrite existing config', false)
  .action(async (opts) => {
    const projectRoot = opts.path;

    if (!opts.force && (await configExists(projectRoot))) {
      const { overwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: '.goodbot/config.json already exists. Overwrite?',
          default: false,
        },
      ]);
      if (!overwrite) {
        log.info('Cancelled.');
        return;
      }
    }

    // Phase 1: Auto-scan
    const spinner = ora('Scanning project...').start();
    const scan = await runFullScan(projectRoot);
    spinner.succeed('Scan complete');

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
        default: 'main',
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
      },
      conventions: {
        mainBranch,
        importStyle: barrelImportRule === 'always' ? 'barrel' : barrelImportRule === 'recommended' ? 'barrel' : 'direct',
        customRules,
      },
      ignore: {
        paths: defaults.ignorePaths,
        sensitiveFiles: ['.env', '.env.*', 'credentials.json', '*.pem', '*.key'],
      },
    };

    await saveConfig(projectRoot, config);

    log.success('Config saved to .goodbot/config.json');
    log.dim('Run `goodbot generate` to create your agent files.');
  });

import type { GoodbotConfig } from '../config/index.js';
import type { DependencyAnalysisSummary } from '../analyzers/index.js';
import type { GeneratorContext } from './types.js';

function buildLayerDiagram(
  layers: GoodbotConfig['architecture']['layers'],
): string {
  if (layers.length === 0) return '';

  const maxNameLen = Math.max(...layers.map((l) => l.name.length));
  const maxPathLen = Math.max(...layers.map((l) => l.path.length));

  const lines: string[] = [];
  // Sort by level descending for the diagram (highest = top)
  const sorted = [...layers].sort((a, b) => b.level - a.level);

  for (const layer of sorted) {
    const barrel = layer.hasBarrel ? '(barrel)' : '';
    lines.push(
      `  Layer ${layer.level}:  ${layer.name.padEnd(maxNameLen)}  ← ${layer.path.padEnd(maxPathLen)}  ${barrel}`,
    );
  }

  return lines.join('\n');
}

export function buildContext(config: GoodbotConfig, analysisSummary?: DependencyAnalysisSummary): GeneratorContext {
  const { project, architecture, businessLogic, verification, conventions, ignore } = config;

  const verificationCommands: Array<{ name: string; command: string }> = [];
  if (verification.typecheck) verificationCommands.push({ name: 'Type check', command: verification.typecheck });
  if (verification.lint) verificationCommands.push({ name: 'Lint', command: verification.lint });
  if (verification.test) verificationCommands.push({ name: 'Test', command: verification.test });
  if (verification.format) verificationCommands.push({ name: 'Format', command: verification.format });
  if (verification.build) verificationCommands.push({ name: 'Build', command: verification.build });

  const fw = project.framework;

  return {
    project,
    architecture: {
      ...architecture,
      layerDiagramAscii: buildLayerDiagram(architecture.layers),
    },
    businessLogic,
    verification: { commands: verificationCommands },
    conventions,
    ignore,
    isReact: fw === 'react',
    isReactNative: fw === 'react-native',
    isNext: fw === 'next',
    isNode: fw === 'node' || fw === 'express' || fw === 'nest',
    isPython: fw === 'python' || fw === 'django' || fw === 'flask' || fw === 'fastapi',
    isTypescript: project.language === 'typescript',
    hasBarrels: architecture.barrelImportRule !== 'none',
    hasLayers: architecture.layers.length > 0,
    hasRedFlags: businessLogic.redFlags.length > 0,
    hasCustomRules: conventions.customRules.length > 0,
    hasVerification: verificationCommands.length > 0,
    dependencyAnalysis: analysisSummary ? {
      moduleCount: analysisSummary.moduleCount,
      circularDependencyCount: analysisSummary.circularDependencyCount,
      barrelViolationCount: analysisSummary.barrelViolationCount,
      layerViolationCount: analysisSummary.layerViolationCount,
      stabilityViolationCount: analysisSummary.stabilityViolationCount,
      topViolations: analysisSummary.topViolations,
    } : undefined,
    hasAnalysis: !!analysisSummary,
  };
}

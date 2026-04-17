import { describe, it, expect } from 'vitest';
import { findLayerViolations } from './layer-checker.js';
import type { FileImports } from './types.js';

function makeImport(filePath: string, moduleName: string, targets: Array<{ specifier: string; targetModule: string; line: number }>): FileImports {
  return {
    filePath,
    moduleName,
    imports: targets.map(t => ({
      specifier: t.specifier,
      resolvedPath: `src/${t.targetModule}/index.ts`,
      line: t.line,
      kind: 'import' as const,
      targetModule: t.targetModule,
    })),
  };
}

describe('findLayerViolations', () => {
  const layers = [
    { name: 'utils', level: 0 },
    { name: 'services', level: 1 },
    { name: 'controllers', level: 2 },
    { name: 'commands', level: 3 },
  ];

  it('allows downward imports (higher level → lower level)', () => {
    const imports = [
      makeImport('src/commands/app.ts', 'commands', [
        { specifier: '../services', targetModule: 'services', line: 1 },
      ]),
      makeImport('src/services/user.ts', 'services', [
        { specifier: '../utils', targetModule: 'utils', line: 1 },
      ]),
    ];
    const result = findLayerViolations(imports, layers);
    expect(result).toHaveLength(0);
  });

  it('detects upward imports (lower level → higher level)', () => {
    const imports = [
      makeImport('src/utils/helper.ts', 'utils', [
        { specifier: '../services', targetModule: 'services', line: 5 },
      ]),
    ];
    const result = findLayerViolations(imports, layers);
    expect(result).toHaveLength(1);
    expect(result[0].fromModule).toBe('utils');
    expect(result[0].toModule).toBe('services');
    expect(result[0].fromLevel).toBe(0);
    expect(result[0].toLevel).toBe(1);
  });

  it('allows same-layer imports', () => {
    const imports = [
      makeImport('src/services/user.ts', 'services', [
        { specifier: './order', targetModule: 'services', line: 1 },
      ]),
    ];
    const result = findLayerViolations(imports, layers);
    expect(result).toHaveLength(0);
  });

  it('ignores modules not in layer config', () => {
    const imports = [
      makeImport('src/unknown/test.ts', 'unknown', [
        { specifier: '../commands', targetModule: 'commands', line: 1 },
      ]),
    ];
    const result = findLayerViolations(imports, layers);
    expect(result).toHaveLength(0);
  });

  it('detects multiple violations across files', () => {
    const imports = [
      makeImport('src/utils/a.ts', 'utils', [
        { specifier: '../services', targetModule: 'services', line: 2 },
        { specifier: '../commands', targetModule: 'commands', line: 5 },
      ]),
      makeImport('src/services/b.ts', 'services', [
        { specifier: '../commands', targetModule: 'commands', line: 3 },
      ]),
    ];
    const result = findLayerViolations(imports, layers);
    expect(result).toHaveLength(3);
  });

  it('returns empty for no layers', () => {
    const imports = [
      makeImport('src/utils/a.ts', 'utils', [
        { specifier: '../services', targetModule: 'services', line: 1 },
      ]),
    ];
    const result = findLayerViolations(imports, []);
    expect(result).toHaveLength(0);
  });
});

import { describe, it, expect } from 'vitest';
import { buildDependencyGraph } from './graph-builder.js';
import type { FileImports } from './types.js';

function makeFileImport(filePath: string, moduleName: string, targets: Array<{ specifier: string; resolvedPath: string; targetModule: string }>): FileImports {
  return {
    filePath,
    moduleName,
    imports: targets.map(t => ({
      specifier: t.specifier,
      resolvedPath: t.resolvedPath,
      line: 1,
      kind: 'import' as const,
      _targetModule: t.targetModule,
    })) as FileImports['imports'],
  };
}

describe('buildDependencyGraph', () => {
  it('builds empty graph from no imports', () => {
    const { modules, edges } = buildDependencyGraph([]);
    expect(modules).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });

  it('creates module nodes from file imports', () => {
    const imports = [
      makeFileImport('src/services/user.ts', 'services', []),
      makeFileImport('src/services/order.ts', 'services', []),
      makeFileImport('src/utils/helper.ts', 'utils', []),
    ];
    const { modules } = buildDependencyGraph(imports);
    expect(modules).toHaveLength(2);
    const services = modules.find(m => m.name === 'services')!;
    expect(services.fileCount).toBe(2);
  });

  it('creates edges for cross-module imports', () => {
    const imports = [
      makeFileImport('src/services/user.ts', 'services', [
        { specifier: '../utils', resolvedPath: 'src/utils/index.ts', targetModule: 'utils' },
      ]),
    ];
    const { edges } = buildDependencyGraph(imports);
    expect(edges).toHaveLength(1);
    expect(edges[0].from).toBe('services');
    expect(edges[0].to).toBe('utils');
  });

  it('skips intra-module imports', () => {
    const imports = [
      makeFileImport('src/services/user.ts', 'services', [
        { specifier: './order', resolvedPath: 'src/services/order.ts', targetModule: 'services' },
      ]),
    ];
    const { edges } = buildDependencyGraph(imports);
    expect(edges).toHaveLength(0);
  });

  it('aggregates multiple file-level imports into one edge', () => {
    const imports = [
      makeFileImport('src/services/user.ts', 'services', [
        { specifier: '../utils', resolvedPath: 'src/utils/index.ts', targetModule: 'utils' },
      ]),
      makeFileImport('src/services/order.ts', 'services', [
        { specifier: '../utils/logger', resolvedPath: 'src/utils/logger.ts', targetModule: 'utils' },
      ]),
    ];
    const { edges } = buildDependencyGraph(imports);
    expect(edges).toHaveLength(1);
    expect(edges[0].files).toHaveLength(2);
  });

  it('sets dependsOn and dependedOnBy correctly', () => {
    const imports = [
      makeFileImport('src/services/user.ts', 'services', [
        { specifier: '../utils', resolvedPath: 'src/utils/index.ts', targetModule: 'utils' },
      ]),
      makeFileImport('src/utils/helper.ts', 'utils', []),
    ];
    const { modules } = buildDependencyGraph(imports);
    const services = modules.find(m => m.name === 'services')!;
    const utils = modules.find(m => m.name === 'utils')!;

    expect(services.dependsOn.has('utils')).toBe(true);
    expect(utils.dependedOnBy.has('services')).toBe(true);
  });

  it('creates target module node even without its own files', () => {
    const imports = [
      makeFileImport('src/services/user.ts', 'services', [
        { specifier: '../external', resolvedPath: 'src/external/index.ts', targetModule: 'external' },
      ]),
    ];
    const { modules } = buildDependencyGraph(imports);
    const external = modules.find(m => m.name === 'external');
    expect(external).toBeDefined();
    expect(external!.fileCount).toBe(0);
  });
});

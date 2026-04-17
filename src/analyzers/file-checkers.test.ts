import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkSRP } from './srp-checker.js';
import { checkComplexity } from './complexity-checker.js';
import { checkISP } from './isp-checker.js';
import { checkShallowModules } from './shallow-module-checker.js';
import { checkPassthroughMethods } from './passthrough-checker.js';
import { DEFAULT_THRESHOLDS } from './types.js';
import type { FileImports, ModuleNode } from './types.js';
import type { DetectedLayer } from '../scanners/index.js';

let tmpDir: string;
let srcDir: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), 'goodbot-test-'));
  srcDir = path.join(tmpDir, 'src');
  await mkdir(srcDir, { recursive: true });
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeFixture(relativePath: string, content: string): Promise<string> {
  const fullPath = path.join(tmpDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content);
  return fullPath;
}

// ─── SRP Checker ─────────────────────────────────────────

describe('checkSRP', () => {
  it('flags files over the line threshold', async () => {
    const bigFile = await writeFixture('src/big.ts', 'const x = 1;\n'.repeat(250));
    const smallFile = await writeFixture('src/small.ts', 'const x = 1;\n'.repeat(50));

    const fileImports: FileImports[] = [
      { filePath: 'src/big.ts', moduleName: 'test', imports: [] },
      { filePath: 'src/small.ts', moduleName: 'test', imports: [] },
    ];

    const violations = await checkSRP(fileImports, [bigFile, smallFile], tmpDir, DEFAULT_THRESHOLDS);
    const bigViolation = violations.find(v => v.file.includes('big.ts'));
    const smallViolation = violations.find(v => v.file.includes('small.ts'));

    expect(bigViolation).toBeDefined();
    expect(bigViolation!.message).toContain('250 lines');
    expect(smallViolation).toBeUndefined();
  });

  it('escalates to error for files over 2x threshold', async () => {
    const hugeFile = await writeFixture('src/huge.ts', 'const x = 1;\n'.repeat(450));

    const violations = await checkSRP([], [hugeFile], tmpDir, DEFAULT_THRESHOLDS);
    const violation = violations.find(v => v.file.includes('huge.ts'));
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('error');
  });

  it('flags files importing from 4+ modules', async () => {
    const imports: FileImports['imports'] = [
      { specifier: '../a', resolvedPath: null, line: 1, kind: 'import' as const, targetModule: 'a' },
      { specifier: '../b', resolvedPath: null, line: 2, kind: 'import' as const, targetModule: 'b' },
      { specifier: '../c', resolvedPath: null, line: 3, kind: 'import' as const, targetModule: 'c' },
      { specifier: '../d', resolvedPath: null, line: 4, kind: 'import' as const, targetModule: 'd' },
    ];
    const fileImports: FileImports[] = [{
      filePath: 'src/mixed.ts',
      moduleName: 'app',
      imports,
    }];

    const violations = await checkSRP(fileImports, [], tmpDir, DEFAULT_THRESHOLDS);
    const violation = violations.find(v => v.message.includes('4 different modules'));
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('warning');
  });
});

// ─── Complexity Checker ──────────────────────────────────

describe('checkComplexity', () => {
  it('flags files with high cyclomatic complexity', async () => {
    // Generate a file with many branches
    const branches = Array.from({ length: 30 }, (_, i) =>
      `if (x === ${i}) { console.log(${i}); }`
    ).join('\n');
    const complexFile = await writeFixture('src/complex.ts', branches);

    const result = await checkComplexity([complexFile], tmpDir, DEFAULT_THRESHOLDS);
    const violation = result.violations.find(v => v.message.includes('Cyclomatic complexity'));
    expect(violation).toBeDefined();
  });

  it('does not flag simple files', async () => {
    const simpleFile = await writeFixture('src/simple.ts',
      'export function add(a: number, b: number) {\n  return a + b;\n}\n',
    );

    const result = await checkComplexity([simpleFile], tmpDir, DEFAULT_THRESHOLDS);
    expect(result.violations).toHaveLength(0);
  });

  it('skips comments and imports when counting', async () => {
    const content = [
      '// if this were code it would count',
      '/* if (block) { comment } */',
      'import { something } from "./other";',
      'export type Foo = string;',
      'const x = 1;',
    ].join('\n');
    const file = await writeFixture('src/comments.ts', content);

    const result = await checkComplexity([file], tmpDir, DEFAULT_THRESHOLDS);
    expect(result.fileComplexities[0].complexity).toBe(1); // just the base
  });

  it('counts logical operators as complexity', async () => {
    const content = 'const result = a && b || c && d || e;\n';
    const file = await writeFixture('src/logical.ts', content);

    const result = await checkComplexity([file], tmpDir, DEFAULT_THRESHOLDS);
    // 1 base + 4 logical ops (&&, ||, &&, ||)
    expect(result.fileComplexities[0].complexity).toBe(5);
  });
});

// ─── ISP Checker ─────────────────────────────────────────

describe('checkISP', () => {
  it('flags barrel files with too many exports', async () => {
    const exports = Array.from({ length: 15 }, (_, i) =>
      `export { thing${i} } from './thing${i}.js';`
    ).join('\n');
    await writeFixture('src/bloated/index.ts', exports);

    const layers: DetectedLayer[] = [{
      name: 'bloated',
      path: 'src/bloated',
      suggestedLevel: 0,
      hasBarrel: true,
      hasInterfaces: false,
    }];

    const violations = await checkISP(layers, srcDir, DEFAULT_THRESHOLDS);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].message).toContain('15 symbols');
  });

  it('does not flag barrels under threshold', async () => {
    const exports = Array.from({ length: 5 }, (_, i) =>
      `export { thing${i} } from './thing${i}.js';`
    ).join('\n');
    await writeFixture('src/lean/index.ts', exports);

    const layers: DetectedLayer[] = [{
      name: 'lean',
      path: 'src/lean',
      suggestedLevel: 0,
      hasBarrel: true,
      hasInterfaces: false,
    }];

    const violations = await checkISP(layers, srcDir, DEFAULT_THRESHOLDS);
    expect(violations).toHaveLength(0);
  });
});

// ─── Shallow Module Checker ──────────────────────────────

describe('checkShallowModules', () => {
  it('flags a shallow module (many exports, little code)', async () => {
    // 8 exports, ~16 lines of code → depth ~2
    const barrel = Array.from({ length: 8 }, (_, i) =>
      `export function fn${i}() { return ${i}; }`
    ).join('\n');
    await writeFixture('src/thin/index.ts', barrel);
    await writeFixture('src/thin/helpers.ts', 'export const x = 1;\n');

    const layers: DetectedLayer[] = [{
      name: 'thin',
      path: 'src/thin',
      suggestedLevel: 0,
      hasBarrel: true,
      hasInterfaces: false,
    }];

    const modules: ModuleNode[] = [{
      name: 'thin',
      path: 'src/thin',
      fileCount: 2,
      dependsOn: new Set(),
      dependedOnBy: new Set(),
    }];

    const thinIndex = path.join(srcDir, 'thin', 'index.ts');
    const thinHelpers = path.join(srcDir, 'thin', 'helpers.ts');

    const result = await checkShallowModules(modules, layers, [thinIndex, thinHelpers], srcDir, DEFAULT_THRESHOLDS);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.shallowModules[0].depth).toBeLessThan(10);
  });

  it('does not flag a deep module', async () => {
    // 3 exports but 200+ lines of implementation
    const impl = 'function internal() {\n' + '  const x = 1;\n'.repeat(100) + '}\n';
    const barrel = 'export function a() { return 1; }\nexport function b() { return 2; }\nexport function c() { return 3; }\n';
    await writeFixture('src/deep/index.ts', barrel + impl);

    const layers: DetectedLayer[] = [{
      name: 'deep',
      path: 'src/deep',
      suggestedLevel: 0,
      hasBarrel: true,
      hasInterfaces: false,
    }];

    const modules: ModuleNode[] = [{
      name: 'deep',
      path: 'src/deep',
      fileCount: 1,
      dependsOn: new Set(),
      dependedOnBy: new Set(),
    }];

    const deepIndex = path.join(srcDir, 'deep', 'index.ts');

    const result = await checkShallowModules(modules, layers, [deepIndex], srcDir, DEFAULT_THRESHOLDS);
    expect(result.violations).toHaveLength(0);
  });
});

// ─── Passthrough Checker ─────────────────────────────────

describe('checkPassthroughMethods', () => {
  it('detects a pure pass-through function', async () => {
    const content = `
function createUser(name: string, email: string) {
  return userService.create(name, email);
}
`;
    const file = await writeFixture('src/passthrough.ts', content);

    const result = await checkPassthroughMethods([file], tmpDir);
    expect(result.passthroughs.length).toBeGreaterThan(0);
    expect(result.passthroughs[0].functionName).toBe('createUser');
    expect(result.passthroughs[0].forwardedCount).toBe(2);
  });

  it('does not flag functions with multiple statements', async () => {
    const content = `
function createUser(name: string, email: string) {
  validate(name);
  return userService.create(name, email);
}
`;
    const file = await writeFixture('src/not-passthrough.ts', content);

    const result = await checkPassthroughMethods([file], tmpDir);
    expect(result.passthroughs).toHaveLength(0);
  });

  it('does not flag single-param delegation', async () => {
    const content = `
function getUser(id: string) {
  return userService.find(id);
}
`;
    const file = await writeFixture('src/single-param.ts', content);

    const result = await checkPassthroughMethods([file], tmpDir);
    expect(result.passthroughs).toHaveLength(0);
  });

  it('detects arrow function pass-throughs', async () => {
    const content = `
const updateUser = (id: string, data: object) => userRepo.update(id, data);
`;
    const file = await writeFixture('src/arrow-passthrough.ts', content);

    const result = await checkPassthroughMethods([file], tmpDir);
    expect(result.passthroughs.length).toBeGreaterThan(0);
    expect(result.passthroughs[0].functionName).toBe('updateUser');
  });

  it('skips framework lifecycle methods', async () => {
    const content = `
function constructor(name: string, email: string) {
  return init(name, email);
}
`;
    const file = await writeFixture('src/lifecycle.ts', content);

    const result = await checkPassthroughMethods([file], tmpDir);
    expect(result.passthroughs).toHaveLength(0);
  });
});

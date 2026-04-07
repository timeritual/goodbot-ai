import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkDeadExports } from './dead-export-checker.js';
import type { DetectedLayer } from '../scanners/index.js';

let tmpDir: string;
let srcDir: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), 'goodbot-deadexport-'));
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

describe('checkDeadExports', () => {
  it('detects exports that are never imported', async () => {
    // Module "utils" exports: add, subtract, multiply
    await writeFixture('src/utils/index.ts', [
      'export function add(a: number, b: number) { return a + b; }',
      'export function subtract(a: number, b: number) { return a - b; }',
      'export function multiply(a: number, b: number) { return a * b; }',
    ].join('\n'));

    // Module "app" only imports "add" from utils
    const appFile = await writeFixture('src/app/main.ts', [
      "import { add } from '../utils';",
      'console.log(add(1, 2));',
    ].join('\n'));

    const layers: DetectedLayer[] = [
      { name: 'utils', path: 'src/utils', suggestedLevel: 0, hasBarrel: true, hasInterfaces: false },
      { name: 'app', path: 'src/app', suggestedLevel: 1, hasBarrel: false, hasInterfaces: false },
    ];

    const sourceFiles = [
      path.join(srcDir, 'utils', 'index.ts'),
      appFile,
    ];

    const result = await checkDeadExports(sourceFiles, layers, srcDir, tmpDir);

    // subtract and multiply should be detected as dead
    const deadNames = result.deadExports.map(d => d.exportName);
    expect(deadNames).toContain('subtract');
    expect(deadNames).toContain('multiply');
    expect(deadNames).not.toContain('add');
  });

  it('does not flag exports that are imported', async () => {
    await writeFixture('src/helpers/index.ts', [
      'export function greet(name: string) { return `Hi ${name}`; }',
    ].join('\n'));

    const consumer = await writeFixture('src/consumer/main.ts', [
      "import { greet } from '../helpers';",
      'greet("world");',
    ].join('\n'));

    const layers: DetectedLayer[] = [
      { name: 'helpers', path: 'src/helpers', suggestedLevel: 0, hasBarrel: true, hasInterfaces: false },
    ];

    const sourceFiles = [
      path.join(srcDir, 'helpers', 'index.ts'),
      consumer,
    ];

    const result = await checkDeadExports(sourceFiles, layers, srcDir, tmpDir);
    expect(result.deadExports).toHaveLength(0);
  });

  it('handles re-exports with aliases', async () => {
    await writeFixture('src/lib/index.ts', [
      "export { default as Logger } from './logger.js';",
      "export { Config } from './config.js';",
    ].join('\n'));

    // Only Logger is imported
    const consumer = await writeFixture('src/main/app.ts', [
      "import { Logger } from '../lib';",
      'new Logger();',
    ].join('\n'));

    const layers: DetectedLayer[] = [
      { name: 'lib', path: 'src/lib', suggestedLevel: 0, hasBarrel: true, hasInterfaces: false },
    ];

    const sourceFiles = [
      path.join(srcDir, 'lib', 'index.ts'),
      consumer,
    ];

    const result = await checkDeadExports(sourceFiles, layers, srcDir, tmpDir);
    // Config is dead, Logger is not
    const deadNames = result.deadExports.map(d => d.exportName);
    expect(deadNames).toContain('Config');
    expect(deadNames).not.toContain('Logger');
  });

  it('skips modules without barrel files', async () => {
    await writeFixture('src/nobarrel/helper.ts', [
      'export function orphan() { return 1; }',
    ].join('\n'));

    const layers: DetectedLayer[] = [
      { name: 'nobarrel', path: 'src/nobarrel', suggestedLevel: 0, hasBarrel: false, hasInterfaces: false },
    ];

    const result = await checkDeadExports(
      [path.join(srcDir, 'nobarrel', 'helper.ts')],
      layers,
      srcDir,
      tmpDir,
    );
    expect(result.deadExports).toHaveLength(0);
    expect(result.violations).toHaveLength(0);
  });

  it('returns empty when no layers have barrels', async () => {
    const result = await checkDeadExports([], [], srcDir, tmpDir);
    expect(result.deadExports).toHaveLength(0);
    expect(result.violations).toHaveLength(0);
  });

  it('only generates violation when 2+ exports are dead', async () => {
    // 2 exports, 1 unused
    await writeFixture('src/single/index.ts', [
      'export function used() { return 1; }',
      'export function unused() { return 2; }',
    ].join('\n'));

    const consumer = await writeFixture('src/singleconsumer/main.ts', [
      "import { used } from '../single';",
      'used();',
    ].join('\n'));

    const layers: DetectedLayer[] = [
      { name: 'single', path: 'src/single', suggestedLevel: 0, hasBarrel: true, hasInterfaces: false },
    ];

    const sourceFiles = [
      path.join(srcDir, 'single', 'index.ts'),
      consumer,
    ];

    const result = await checkDeadExports(sourceFiles, layers, srcDir, tmpDir);
    // 1 dead export → no violation (threshold is 2)
    expect(result.deadExports).toHaveLength(1);
    expect(result.violations).toHaveLength(0);
  });
});

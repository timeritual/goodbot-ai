import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkDuplication } from './duplication-checker.js';

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), 'goodbot-dup-'));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeFixture(name: string, content: string): Promise<string> {
  const fullPath = path.join(tmpDir, name);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content);
  return fullPath;
}

// Helper: generate a block of unique-looking but structurally identical code
function makeBlock(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, i) => [
    `const ${prefix}${i} = getValue(${i});`,
    `if (${prefix}${i} !== null) {`,
    `  process(${prefix}${i});`,
    `  log(${prefix}${i});`,
    `  save(${prefix}${i});`,
    `  notify(${prefix}${i});`,
    `  cleanup(${prefix}${i});`,
    `}`,
  ].join('\n')).join('\n\n');
}

describe('checkDuplication', () => {
  it('detects duplicated code blocks across files', async () => {
    // Same logic in two files — variable names differ but structure matches after normalization
    const sharedBlock = [
      'function handleRequest(req: Request) {',
      '  const data = parseBody(req);',
      '  if (!data) { throw new Error("invalid"); }',
      '  const result = processData(data);',
      '  await saveResult(result);',
      '  return formatResponse(result);',
      '}',
    ].join('\n');

    const file1 = await writeFixture('src/handler1.ts', sharedBlock + '\n\n// extra1');
    const file2 = await writeFixture('src/handler2.ts', sharedBlock + '\n\n// extra2');

    const result = await checkDuplication([file1, file2], tmpDir);
    expect(result.duplicates.length).toBeGreaterThan(0);

    // Both files should appear in the duplicate locations
    const files = result.duplicates.flatMap(d => d.locations.map(l => l.file));
    expect(files).toContain('src/handler1.ts');
    expect(files).toContain('src/handler2.ts');
  });

  it('does not flag completely different code', async () => {
    const file1 = await writeFixture('src/unique1.ts', [
      'function alpha() {',
      '  const x = computeAlpha();',
      '  if (x > threshold) {',
      '    adjustUp(x);',
      '    recalibrate();',
      '    reportAlpha(x);',
      '  }',
      '}',
    ].join('\n'));

    const file2 = await writeFixture('src/unique2.ts', [
      'class BetaProcessor {',
      '  async run(): Promise<void> {',
      '    for (const item of this.items) {',
      '      await this.transform(item);',
      '      this.emit("processed", item);',
      '      this.count++;',
      '    }',
      '  }',
      '}',
    ].join('\n'));

    const result = await checkDuplication([file1, file2], tmpDir);
    expect(result.duplicates).toHaveLength(0);
  });

  it('ignores imports, comments, and type declarations', async () => {
    // Two files with identical imports and type declarations but different logic
    const file1 = await writeFixture('src/typed1.ts', [
      "import { foo } from './foo';",
      '// This is a comment about the module',
      'export type Config = { key: string };',
      'export interface Options { flag: boolean }',
      'function unique1() { return specificLogic1(); }',
    ].join('\n'));

    const file2 = await writeFixture('src/typed2.ts', [
      "import { foo } from './foo';",
      '// This is a comment about the module',
      'export type Config = { key: string };',
      'export interface Options { flag: boolean }',
      'function unique2() { return differentLogic2(); }',
    ].join('\n'));

    const result = await checkDuplication([file1, file2], tmpDir);
    // Imports, comments, and type declarations are stripped, so no duplication
    expect(result.duplicates).toHaveLength(0);
  });

  it('normalizes string literals and numbers', async () => {
    // Same structure but different string/number values — should match
    const file1 = await writeFixture('src/normalized1.ts', [
      'function setup() {',
      '  const name = "Alice";',
      '  const count = 42;',
      '  if (count > 10) {',
      '    log("Processing " + name);',
      '    execute(count);',
      '  }',
      '}',
    ].join('\n'));

    const file2 = await writeFixture('src/normalized2.ts', [
      'function setup() {',
      '  const name = "Bob";',
      '  const count = 99;',
      '  if (count > 10) {',
      '    log("Processing " + name);',
      '    execute(count);',
      '  }',
      '}',
    ].join('\n'));

    const result = await checkDuplication([file1, file2], tmpDir);
    expect(result.duplicates.length).toBeGreaterThan(0);
  });

  it('returns empty for a single file', async () => {
    const file = await writeFixture('src/solo.ts', [
      'function solo() {',
      '  const x = getValue();',
      '  if (x) { process(x); }',
      '  return x;',
      '}',
    ].join('\n'));

    const result = await checkDuplication([file], tmpDir);
    expect(result.duplicates).toHaveLength(0);
  });

  it('returns empty for empty file list', async () => {
    const result = await checkDuplication([], tmpDir);
    expect(result.duplicates).toHaveLength(0);
    expect(result.violations).toHaveLength(0);
  });

  it('handles files shorter than window size', async () => {
    const file1 = await writeFixture('src/short1.ts', 'const x = 1;');
    const file2 = await writeFixture('src/short2.ts', 'const y = 2;');

    const result = await checkDuplication([file1, file2], tmpDir);
    expect(result.duplicates).toHaveLength(0);
  });
});

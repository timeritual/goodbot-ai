import { describe, it, expect } from 'vitest';
import { diffConfigs } from './sync.js';
import { GoodbotConfigSchema } from '../config/schema.js';
import type { GoodbotConfig } from '../config/schema.js';

function makeConfig(overrides: Record<string, unknown> = {}): GoodbotConfig {
  return GoodbotConfigSchema.parse({
    version: 1,
    project: { name: 'test', framework: 'node', language: 'typescript' },
    ...overrides,
  });
}

describe('diffConfigs', () => {
  it('returns empty array when configs are identical', () => {
    const config = makeConfig();
    const result = diffConfigs(config, config);
    expect(result).toEqual([]);
  });

  it('detects barrelImportRule change', () => {
    const local = makeConfig({ architecture: { barrelImportRule: 'recommended' } });
    const merged = makeConfig({ architecture: { barrelImportRule: 'always' } });

    const result = diffConfigs(local, merged);

    expect(result).toContain('barrelImportRule: recommended → always');
  });

  it('detects interfaceContracts change', () => {
    const local = makeConfig({ architecture: { interfaceContracts: false } });
    const merged = makeConfig({ architecture: { interfaceContracts: true } });

    const result = diffConfigs(local, merged);

    expect(result).toContain('interfaceContracts: false → true');
  });

  it('detects layer count change', () => {
    const local = makeConfig({
      architecture: {
        layers: [{ name: 'api', path: 'src/api', level: 0 }],
      },
    });
    const merged = makeConfig({
      architecture: {
        layers: [
          { name: 'api', path: 'src/api', level: 0 },
          { name: 'db', path: 'src/db', level: 1 },
        ],
      },
    });

    const result = diffConfigs(local, merged);

    expect(result).toContain('layers: 1 → 2');
  });

  it('detects businessLogic.allowedIn change', () => {
    const local = makeConfig({ businessLogic: { allowedIn: ['services'] } });
    const merged = makeConfig({ businessLogic: { allowedIn: ['services', 'handlers'] } });

    const result = diffConfigs(local, merged);

    expect(result.some(c => c.includes('businessLogic.allowedIn'))).toBe(true);
  });

  it('detects customRules count change', () => {
    const local = makeConfig({ conventions: { customRules: ['no-console'] } });
    const merged = makeConfig({ conventions: { customRules: ['no-console', 'no-debugger'] } });

    const result = diffConfigs(local, merged);

    expect(result).toContain('customRules: 1 → 2');
  });

  it('detects customRulesConfig count change', () => {
    const local = makeConfig({ customRulesConfig: [] });
    const merged = makeConfig({
      customRulesConfig: [
        { name: 'rule1', pattern: '*.ts' },
      ],
    });

    const result = diffConfigs(local, merged);

    expect(result).toContain('customRulesConfig: 0 → 1');
  });

  it('detects maxFileLines threshold change', () => {
    const local = makeConfig({ analysis: { thresholds: { maxFileLines: 300 } } });
    const merged = makeConfig({ analysis: { thresholds: { maxFileLines: 500 } } });

    const result = diffConfigs(local, merged);

    expect(result).toContain('maxFileLines: 300 → 500');
  });

  it('returns multiple changes at once', () => {
    const local = makeConfig({
      architecture: { barrelImportRule: 'recommended', interfaceContracts: false },
      analysis: { thresholds: { maxFileLines: 300 } },
    });
    const merged = makeConfig({
      architecture: { barrelImportRule: 'always', interfaceContracts: true },
      analysis: { thresholds: { maxFileLines: 500 } },
    });

    const result = diffConfigs(local, merged);

    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result).toContain('barrelImportRule: recommended → always');
    expect(result).toContain('interfaceContracts: false → true');
    expect(result).toContain('maxFileLines: 300 → 500');
  });
});

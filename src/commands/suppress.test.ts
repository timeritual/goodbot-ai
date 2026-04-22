import { describe, it, expect } from 'vitest';
import { validateReason, suppressionMatchesId } from './suppress.js';

describe('validateReason', () => {
  it('rejects empty reason', () => {
    expect(validateReason('')).toContain('--apply requires --reason');
  });

  it('rejects TODO placeholder', () => {
    expect(validateReason('TODO: fill in')).toContain('placeholder');
    expect(validateReason('todo: update later')).toContain('placeholder');
    expect(validateReason('  TODO fix this')).toContain('placeholder');
  });

  it('rejects reasons that are too short', () => {
    expect(validateReason('wip')).toContain('too short');
    expect(validateReason('fix')).toContain('too short');
  });

  it('accepts a real justification', () => {
    expect(validateReason('Migration scripts legitimately use services')).toBeNull();
    expect(validateReason('TypeORM entity bidirectional relationships')).toBeNull();
  });

  it('allows reasons that merely mention TODO inside them (not as a prefix)', () => {
    // "not TODO" and similar should not be rejected
    expect(validateReason('The team agreed not TODO this file until Q2')).toBeNull();
  });
});

describe('suppressionMatchesId', () => {
  it('matches cycle suppression by content-based id', () => {
    expect(
      suppressionMatchesId(
        { rule: 'circularDep', cycle: 'app ↔ database', reason: 'ok' } as Parameters<typeof suppressionMatchesId>[0],
        'cycle-app-database',
      ),
    ).toBe(true);
  });

  it('cycle matching is direction-agnostic', () => {
    expect(
      suppressionMatchesId(
        { rule: 'circularDep', cycle: 'database → app', reason: 'ok' } as Parameters<typeof suppressionMatchesId>[0],
        'cycle-app-database',
      ),
    ).toBe(true);
  });

  it('cycle matching handles ASCII arrow and loop forms', () => {
    expect(
      suppressionMatchesId(
        { rule: 'circularDep', cycle: 'app -> database -> app', reason: 'ok' } as Parameters<typeof suppressionMatchesId>[0],
        'cycle-app-database',
      ),
    ).toBe(true);
  });

  it('matches file-based suppression by content-based id', () => {
    expect(
      suppressionMatchesId(
        { rule: 'layerViolation', file: 'src/scripts/migrate.ts', reason: 'ok' } as Parameters<typeof suppressionMatchesId>[0],
        'layer-src-scripts-migrate',
      ),
    ).toBe(true);
  });

  it('uses correct prefix for each rule type', () => {
    const cases: Array<[string, string, string]> = [
      ['oversizedFile', 'src/gen.ts', 'oversized-src-gen'],
      ['complexity', 'src/a.ts', 'complexity-src-a'],
      ['duplication', 'src/a.ts', 'duplication-src-a'],
      ['deadExport', 'src/a', 'dead-export-src-a'],
      ['dependencyInversion', 'src/a.ts', 'dip-src-a'],
      ['interfaceSegregation', 'src/a.ts', 'isp-src-a'],
      ['shallowModule', 'src/a', 'shallow-src-a'],
      ['godModule', 'src/a', 'god-src-a'],
      ['barrelViolation', 'src/a.ts', 'barrel-src-a'],
      ['stabilityViolation', 'src/a.ts', 'stability-src-a'],
    ];
    for (const [rule, file, id] of cases) {
      expect(
        suppressionMatchesId(
          { rule: rule as Parameters<typeof suppressionMatchesId>[0]['rule'], file },
          id,
        ),
        `${rule} → ${id}`,
      ).toBe(true);
    }
  });

  it('returns false when suppression has no file or cycle', () => {
    expect(
      suppressionMatchesId(
        { rule: 'layerViolation', reason: 'ok' } as Parameters<typeof suppressionMatchesId>[0],
        'layer-anything',
      ),
    ).toBe(false);
  });

  it('returns false for mismatched ids', () => {
    expect(
      suppressionMatchesId(
        { rule: 'layerViolation', file: 'src/scripts/migrate.ts', reason: 'ok' } as Parameters<typeof suppressionMatchesId>[0],
        'layer-src-scripts-migrate-v2', // doesn't match
      ),
    ).toBe(false);
  });
});

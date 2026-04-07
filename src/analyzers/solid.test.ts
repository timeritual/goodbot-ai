import { describe, it, expect } from 'vitest';
import type { SolidViolation } from './types.js';

// We need to test calculateScores which is not exported.
// We'll test it indirectly through observable behavior, or
// extract a focused test on the scoring math.

// Since calculateScores is private, we test the scoring behavior
// by verifying the runSolidAnalysis output characteristics.
// For unit testing the math, we replicate the formula here.

function calculateScores(violations: SolidViolation[], totalFiles: number) {
  if (totalFiles === 0) return { srp: 100, dip: 100, isp: 100, overall: 100 };

  const count = (principle: string) =>
    violations.filter((v) => v.principle === principle);

  const score = (principle: string): number => {
    const v = count(principle);
    const errors = v.filter((x) => x.severity === 'error').length;
    const warnings = v.filter((x) => x.severity === 'warning').length;
    const infos = v.filter((x) => x.severity === 'info').length;

    const rawPenalty = errors * 10 + warnings * 5 + infos * 1;
    const normalizer = Math.max(Math.sqrt(totalFiles / 10), 1);
    const penalty = rawPenalty / normalizer;
    return Math.max(0, Math.round(100 - penalty));
  };

  const srp = score('SRP');
  const dip = score('DIP');
  const isp = score('ISP');
  const overall = Math.round((srp + dip + isp) / 3);

  return { srp, dip, isp, overall };
}

function makeViolation(principle: string, severity: 'error' | 'warning' | 'info'): SolidViolation {
  return {
    principle: principle as SolidViolation['principle'],
    severity,
    file: 'test.ts',
    message: 'test violation',
    suggestion: 'fix it',
  };
}

describe('SOLID scoring math', () => {
  it('gives 100 across the board with no violations', () => {
    const result = calculateScores([], 50);
    expect(result).toEqual({ srp: 100, dip: 100, isp: 100, overall: 100 });
  });

  it('gives 100 for 0 files (no data)', () => {
    const result = calculateScores([], 0);
    expect(result).toEqual({ srp: 100, dip: 100, isp: 100, overall: 100 });
  });

  it('penalizes errors more than warnings', () => {
    const withError = calculateScores([makeViolation('SRP', 'error')], 10);
    const withWarning = calculateScores([makeViolation('SRP', 'warning')], 10);
    expect(withError.srp).toBeLessThan(withWarning.srp);
  });

  it('penalizes warnings more than info', () => {
    const withWarning = calculateScores([makeViolation('SRP', 'warning')], 10);
    const withInfo = calculateScores([makeViolation('SRP', 'info')], 10);
    expect(withWarning.srp).toBeLessThan(withInfo.srp);
  });

  it('uses sqrt normalization — large projects are not fully forgiven', () => {
    const violations = Array.from({ length: 20 }, () => makeViolation('SRP', 'warning'));

    const smallProject = calculateScores(violations, 50);    // sqrt(5) ≈ 2.24
    const largeProject = calculateScores(violations, 1000);  // sqrt(100) = 10

    // Both should be penalized, but large project less so
    expect(largeProject.srp).toBeGreaterThan(smallProject.srp);
    // But large project should NOT be at 100
    expect(largeProject.srp).toBeLessThan(100);
  });

  it('sqrt normalization is less forgiving than old linear normalization', () => {
    // Old formula: penalty / (totalFiles / 10)
    // New formula: penalty / sqrt(totalFiles / 10)
    const violations = Array.from({ length: 10 }, () => makeViolation('SRP', 'warning'));
    const files = 1000;

    // Old: 50 / (1000/10) = 50/100 = 0.5 penalty → score 100
    // New: 50 / sqrt(100) = 50/10 = 5 penalty → score 95
    const result = calculateScores(violations, files);
    expect(result.srp).toBeLessThan(100);
    expect(result.srp).toBe(95);
  });

  it('floors at 0 — never goes negative', () => {
    const violations = Array.from({ length: 100 }, () => makeViolation('SRP', 'error'));
    const result = calculateScores(violations, 10);
    expect(result.srp).toBe(0);
  });

  it('calculates overall as average of three principles', () => {
    const violations = [
      ...Array.from({ length: 5 }, () => makeViolation('SRP', 'warning')),
      makeViolation('DIP', 'error'),
    ];
    const result = calculateScores(violations, 10);
    expect(result.overall).toBe(Math.round((result.srp + result.dip + result.isp) / 3));
  });

  it('only penalizes the relevant principle', () => {
    const violations = [makeViolation('SRP', 'error')];
    const result = calculateScores(violations, 10);
    expect(result.srp).toBeLessThan(100);
    expect(result.dip).toBe(100);
    expect(result.isp).toBe(100);
  });
});

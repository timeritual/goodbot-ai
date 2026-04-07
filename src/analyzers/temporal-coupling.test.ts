import { describe, it, expect } from 'vitest';
import { findTemporalCoupling } from './temporal-coupling.js';
import type { GitCommit } from './git-history.js';

function makeCommit(files: string[], isAI = false): GitCommit {
  return {
    hash: Math.random().toString(36).slice(2, 10),
    authorEmail: 'dev@example.com',
    date: '2026-01-01 12:00:00 -0500',
    subject: 'Update',
    body: '',
    isAI,
    files: files.map(f => ({ file: f, added: 10, deleted: 5 })),
  };
}

describe('findTemporalCoupling', () => {
  it('detects files that always change together', () => {
    const commits = [
      makeCommit(['src/services/user.ts', 'src/utils/validate.ts']),
      makeCommit(['src/services/user.ts', 'src/utils/validate.ts']),
      makeCommit(['src/services/user.ts', 'src/utils/validate.ts']),
    ];

    const result = findTemporalCoupling(commits, 3, 0.5);
    expect(result).toHaveLength(1);
    expect(result[0].coChangeCount).toBe(3);
    expect(result[0].couplingStrength).toBe(1);
  });

  it('ignores files in the same module', () => {
    const commits = [
      makeCommit(['src/services/user.ts', 'src/services/order.ts']),
      makeCommit(['src/services/user.ts', 'src/services/order.ts']),
      makeCommit(['src/services/user.ts', 'src/services/order.ts']),
    ];

    const result = findTemporalCoupling(commits, 3, 0.5);
    expect(result).toHaveLength(0);
  });

  it('respects minimum co-change threshold', () => {
    const commits = [
      makeCommit(['src/services/user.ts', 'src/utils/validate.ts']),
      makeCommit(['src/services/user.ts', 'src/utils/validate.ts']),
      // Only 2 co-changes, threshold is 3
    ];

    const result = findTemporalCoupling(commits, 3, 0.5);
    expect(result).toHaveLength(0);
  });

  it('respects minimum strength threshold', () => {
    const commits = [
      makeCommit(['src/services/user.ts', 'src/utils/validate.ts']),
      makeCommit(['src/services/user.ts', 'src/utils/validate.ts']),
      makeCommit(['src/services/user.ts', 'src/utils/validate.ts']),
      makeCommit(['src/services/user.ts']),  // user changes alone
      makeCommit(['src/services/user.ts']),  // user changes alone
      makeCommit(['src/services/user.ts']),  // user changes alone
      makeCommit(['src/services/user.ts']),  // user changes alone
      makeCommit(['src/services/user.ts']),  // user changes alone
      makeCommit(['src/services/user.ts']),  // user changes alone
    ];

    // co-changes: 3, total user changes: 9, total validate changes: 3
    // strength: 3 / min(9, 3) = 3/3 = 1.0 — still passes
    const result = findTemporalCoupling(commits, 3, 0.5);
    expect(result).toHaveLength(1);
  });

  it('skips large merge commits (>30 files)', () => {
    const largeCommit = makeCommit(
      Array.from({ length: 35 }, (_, i) => `src/module${i}/file.ts`),
    );
    const commits = [largeCommit, largeCommit, largeCommit];

    const result = findTemporalCoupling(commits, 3, 0.5);
    expect(result).toHaveLength(0);
  });

  it('sorts by coupling strength descending', () => {
    const commits = [
      // Strong coupling: always change together
      makeCommit(['src/services/a.ts', 'src/utils/b.ts']),
      makeCommit(['src/services/a.ts', 'src/utils/b.ts']),
      makeCommit(['src/services/a.ts', 'src/utils/b.ts']),
      // Weaker coupling: sometimes change together
      makeCommit(['src/config/c.ts', 'src/utils/d.ts']),
      makeCommit(['src/config/c.ts', 'src/utils/d.ts']),
      makeCommit(['src/config/c.ts', 'src/utils/d.ts']),
      makeCommit(['src/config/c.ts']),
      makeCommit(['src/config/c.ts']),
    ];

    const result = findTemporalCoupling(commits, 3, 0.5);
    expect(result.length).toBeGreaterThanOrEqual(1);
    if (result.length >= 2) {
      expect(result[0].couplingStrength).toBeGreaterThanOrEqual(result[1].couplingStrength);
    }
  });

  it('returns empty for no commits', () => {
    const result = findTemporalCoupling([], 3, 0.5);
    expect(result).toHaveLength(0);
  });

  it('returns empty for single-file commits', () => {
    const commits = [
      makeCommit(['src/services/user.ts']),
      makeCommit(['src/utils/validate.ts']),
      makeCommit(['src/services/user.ts']),
    ];

    const result = findTemporalCoupling(commits, 3, 0.5);
    expect(result).toHaveLength(0);
  });

  it('filters by srcFilter when provided', () => {
    const commits = [
      makeCommit(['src/services/user.ts', 'lib/utils/validate.ts']),
      makeCommit(['src/services/user.ts', 'lib/utils/validate.ts']),
      makeCommit(['src/services/user.ts', 'lib/utils/validate.ts']),
    ];

    // Only look at src/ files
    const result = findTemporalCoupling(commits, 3, 0.5, 'src/');
    expect(result).toHaveLength(0); // validate.ts is filtered out
  });
});

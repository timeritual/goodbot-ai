import { describe, it, expect } from 'vitest';
import { decideFileWrite, mergeGoodbotContent, GOODBOT_START, GOODBOT_END } from './file-write-decision.js';

const wrap = (content: string): string => `${GOODBOT_START}\n${content}\n${GOODBOT_END}`;

// ─── Non-mergeable files (e.g. CODING_GUIDELINES.md) ─────

describe('decideFileWrite — non-mergeable files', () => {
  it('creates when no existing file', () => {
    const result = decideFileWrite({
      generated: 'NEW',
      existing: null,
      mergeWithExisting: false,
      strategy: 'merge',
      checksumExists: false,
    });
    expect(result).toEqual({ action: 'create', content: 'NEW' });
  });

  it('overwrites existing content fully', () => {
    const result = decideFileWrite({
      generated: 'NEW',
      existing: 'OLD',
      mergeWithExisting: false,
      strategy: 'merge',
      checksumExists: true,
    });
    expect(result).toEqual({ action: 'overwrite', content: 'NEW' });
  });

  it('reports no-change when content is identical', () => {
    const result = decideFileWrite({
      generated: 'SAME',
      existing: 'SAME',
      mergeWithExisting: false,
      strategy: 'merge',
      checksumExists: true,
    });
    expect(result.action).toBe('no-change');
  });

  it('ignores strategy for non-mergeable files', () => {
    const result = decideFileWrite({
      generated: 'NEW',
      existing: 'OLD',
      mergeWithExisting: false,
      strategy: 'skip',
      checksumExists: false,
    });
    // skip strategy doesn't apply to non-mergeable files
    expect(result.action).toBe('overwrite');
  });
});

// ─── New files ───────────────────────────────────────────

describe('decideFileWrite — new files', () => {
  it('creates mergeable file when it does not exist', () => {
    const result = decideFileWrite({
      generated: 'NEW',
      existing: null,
      mergeWithExisting: true,
      strategy: 'merge',
      checksumExists: false,
    });
    expect(result).toEqual({ action: 'create', content: 'NEW' });
  });
});

// ─── Markers present — the bug that broke user content ───

describe('decideFileWrite — mergeable file with existing markers', () => {
  it('replaces marker section and preserves user content below (the v0.6.x regression)', () => {
    const existing = `${wrap('OLD goodbot content')}\n\n## My project notes\n- keep me`;
    const result = decideFileWrite({
      generated: 'NEW goodbot content',
      existing,
      mergeWithExisting: true,
      strategy: 'merge',
      checksumExists: true,
    });
    expect(result.action).toBe('merge');
    expect(result.content).toContain('NEW goodbot content');
    expect(result.content).toContain('## My project notes');
    expect(result.content).toContain('- keep me');
    expect(result.content).not.toContain('OLD goodbot content');
  });

  it('preserves user content ABOVE the markers', () => {
    const existing = `# My custom header\n${wrap('OLD')}`;
    const result = decideFileWrite({
      generated: 'NEW',
      existing,
      mergeWithExisting: true,
      strategy: 'merge',
      checksumExists: true,
    });
    expect(result.action).toBe('merge');
    expect(result.content).toContain('# My custom header');
    expect(result.content).toContain('NEW');
    expect(result.content).not.toContain('OLD');
  });

  it('preserves user content on BOTH sides of markers', () => {
    const existing = `# Header\n\n${wrap('OLD')}\n\n## Footer\n- item`;
    const result = decideFileWrite({
      generated: 'NEW',
      existing,
      mergeWithExisting: true,
      strategy: 'merge',
      checksumExists: true,
    });
    expect(result.content).toContain('# Header');
    expect(result.content).toContain('NEW');
    expect(result.content).toContain('## Footer');
    expect(result.content).toContain('- item');
  });

  it('replaces section regardless of strategy when markers are present', () => {
    const existing = `${wrap('OLD')}\n\nuser stuff`;
    for (const strategy of ['merge', 'overwrite', 'skip'] as const) {
      const result = decideFileWrite({
        generated: 'NEW',
        existing,
        mergeWithExisting: true,
        strategy,
        checksumExists: true,
      });
      expect(result.action, `strategy=${strategy}`).toBe('merge');
      expect(result.content).toContain('NEW');
      expect(result.content).toContain('user stuff');
    }
  });

  it('replaces section even when checksum is missing (user deleted .goodbot/)', () => {
    const existing = `${wrap('OLD')}\n\nuser stuff`;
    const result = decideFileWrite({
      generated: 'NEW',
      existing,
      mergeWithExisting: true,
      strategy: 'merge',
      checksumExists: false, // .goodbot/checksums.json missing
    });
    expect(result.action).toBe('merge');
    expect(result.content).toContain('user stuff');
  });

  it('reports no-change when markers already hold identical content', () => {
    const existing = `${wrap('SAME')}\n\nuser stuff`;
    const result = decideFileWrite({
      generated: 'SAME',
      existing,
      mergeWithExisting: true,
      strategy: 'merge',
      checksumExists: true,
    });
    expect(result.action).toBe('no-change');
  });
});

// ─── Pre-existing user files (no markers, no checksum) ───

describe('decideFileWrite — pre-existing user files with strategy=merge', () => {
  it('prepends goodbot section with markers, preserving existing content', () => {
    const result = decideFileWrite({
      generated: 'NEW goodbot',
      existing: 'user content',
      mergeWithExisting: true,
      strategy: 'merge',
      checksumExists: false,
    });
    expect(result.action).toBe('merge');
    expect(result.content).toContain(GOODBOT_START);
    expect(result.content).toContain(GOODBOT_END);
    expect(result.content).toContain('NEW goodbot');
    expect(result.content).toContain('user content');
    // Goodbot section comes first
    expect(result.content.indexOf('NEW goodbot')).toBeLessThan(result.content.indexOf('user content'));
  });
});

describe('decideFileWrite — pre-existing user files with strategy=skip', () => {
  it('skips the file entirely', () => {
    const result = decideFileWrite({
      generated: 'NEW',
      existing: 'USER',
      mergeWithExisting: true,
      strategy: 'skip',
      checksumExists: false,
    });
    expect(result.action).toBe('skip');
    expect(result.content).toBe('USER');
  });
});

describe('decideFileWrite — pre-existing user files with strategy=overwrite', () => {
  it('overwrites user file entirely', () => {
    const result = decideFileWrite({
      generated: 'NEW',
      existing: 'USER',
      mergeWithExisting: true,
      strategy: 'overwrite',
      checksumExists: false,
    });
    expect(result.action).toBe('overwrite');
    expect(result.content).toBe('NEW');
  });
});

// ─── Previously generated by goodbot (no markers, checksum exists) ─

describe('decideFileWrite — no markers but goodbot-owned', () => {
  it('overwrites when checksum indicates goodbot wrote it', () => {
    const result = decideFileWrite({
      generated: 'NEW',
      existing: 'OLD goodbot content (from before markers were used)',
      mergeWithExisting: true,
      strategy: 'merge',
      checksumExists: true,
    });
    expect(result.action).toBe('overwrite');
    expect(result.content).toBe('NEW');
  });
});

// ─── mergeGoodbotContent unit tests ──────────────────────

describe('mergeGoodbotContent', () => {
  it('replaces marker section when markers exist', () => {
    const existing = `${GOODBOT_START}\nOLD\n${GOODBOT_END}\n\nrest`;
    const result = mergeGoodbotContent('NEW', existing);
    expect(result).toContain('NEW');
    expect(result).not.toContain('OLD');
    expect(result).toContain('rest');
  });

  it('prepends wrapped content when no markers exist', () => {
    const result = mergeGoodbotContent('NEW', 'user content');
    expect(result.startsWith(GOODBOT_START)).toBe(true);
    expect(result).toContain('NEW');
    expect(result).toContain(GOODBOT_END);
    expect(result).toContain('user content');
  });

  it('round-trips correctly: prepend then replace', () => {
    const prepended = mergeGoodbotContent('V1', 'user content');
    const replaced = mergeGoodbotContent('V2', prepended);
    expect(replaced).toContain('V2');
    expect(replaced).not.toContain('V1');
    expect(replaced).toContain('user content');
  });
});

/**
 * Config migration — rewrites legacy field names to their canonical form
 * before schema validation. Callers receive both the migrated config and a
 * list of deprecation notices they can surface to the user.
 *
 * Migrations applied:
 *   - Top-level `ignore` → `output.cursorignore`
 *   - `analysis.ignore.<plural>` → `analysis.ignore.<singular>`
 *     (e.g. circularDeps → circularDep)
 */

const ANALYSIS_IGNORE_RENAMES: Record<string, string> = {
  circularDeps: 'circularDep',
  layerViolations: 'layerViolation',
  barrelViolations: 'barrelViolation',
  stabilityViolations: 'stabilityViolation',
  oversizedFiles: 'oversizedFile',
  deadExports: 'deadExport',
  shallowModules: 'shallowModule',
  godModules: 'godModule',
  // complexity, duplication, dependencyInversion, interfaceSegregation are
  // already singular-shaped.
};

export interface MigrationResult {
  migrated: unknown;
  deprecations: string[];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function migrateLegacyConfig(raw: unknown): MigrationResult {
  if (!isObject(raw)) return { migrated: raw, deprecations: [] };

  const deprecations: string[] = [];
  const cfg: Record<string, unknown> = { ...raw };

  // ─── Top-level ignore → output.cursorignore ─────────────
  if ('ignore' in cfg && isObject(cfg.ignore)) {
    const legacyIgnore = cfg.ignore;
    const existingOutput = isObject(cfg.output) ? cfg.output : {};
    const existingCursorignore = isObject(existingOutput.cursorignore) ? existingOutput.cursorignore : {};

    const merged: Record<string, unknown> = { ...legacyIgnore, ...existingCursorignore };
    cfg.output = { ...existingOutput, cursorignore: merged };
    delete cfg.ignore;
    deprecations.push('`ignore` has been renamed to `output.cursorignore` (affects .cursorignore generation only, not analysis). Your config has been migrated — save to persist the new shape.');
  }

  // ─── analysis.ignore → analysis.exclude ─────────────────
  //     + plural keys (circularDeps, ...) → singular (circularDep, ...)
  if (isObject(cfg.analysis)) {
    const analysis: Record<string, unknown> = { ...cfg.analysis };

    // Rename analysis.ignore → analysis.exclude (keep both temporarily for
    // transition; the singular-rename loop below applies to whichever key
    // is present).
    if (isObject(analysis.ignore) && !isObject(analysis.exclude)) {
      analysis.exclude = analysis.ignore;
      delete analysis.ignore;
      deprecations.push('`analysis.ignore` has been renamed to `analysis.exclude` (to disambiguate from `output.cursorignore`). Your config has been migrated — save to persist.');
    } else if (isObject(analysis.ignore) && isObject(analysis.exclude)) {
      // Both set — prefer exclude (canonical), drop ignore, warn.
      delete analysis.ignore;
      deprecations.push('Both `analysis.ignore` (legacy) and `analysis.exclude` (canonical) are set — the legacy key was dropped. Only `analysis.exclude` is used.');
    }

    if (isObject(analysis.exclude)) {
      const exclude: Record<string, unknown> = { ...analysis.exclude };
      const renamed: string[] = [];
      for (const [legacy, canonical] of Object.entries(ANALYSIS_IGNORE_RENAMES)) {
        if (legacy in exclude) {
          if (!(canonical in exclude)) {
            exclude[canonical] = exclude[legacy];
          }
          delete exclude[legacy];
          renamed.push(`${legacy} → ${canonical}`);
        }
      }
      if (renamed.length > 0) {
        analysis.exclude = exclude;
        deprecations.push(`\`analysis.exclude\` uses deprecated plural keys — renamed: ${renamed.join(', ')}. Save to persist the canonical (singular) form.`);
      } else {
        analysis.exclude = exclude;
      }
    }
    cfg.analysis = analysis;
  }

  return { migrated: cfg, deprecations };
}

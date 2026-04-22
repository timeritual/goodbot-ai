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

  // ─── analysis.ignore plural keys → singular ─────────────
  if (isObject(cfg.analysis)) {
    const analysis: Record<string, unknown> = { ...cfg.analysis };
    if (isObject(analysis.ignore)) {
      const ignore: Record<string, unknown> = { ...analysis.ignore };
      const renamed: string[] = [];
      for (const [legacy, canonical] of Object.entries(ANALYSIS_IGNORE_RENAMES)) {
        if (legacy in ignore) {
          // If both exist, the singular/canonical form wins; drop the legacy copy.
          if (!(canonical in ignore)) {
            ignore[canonical] = ignore[legacy];
          }
          delete ignore[legacy];
          renamed.push(`${legacy} → ${canonical}`);
        }
      }
      if (renamed.length > 0) {
        analysis.ignore = ignore;
        deprecations.push(`\`analysis.ignore\` uses deprecated plural keys — renamed: ${renamed.join(', ')}. Save to persist the canonical (singular) form.`);
      }
    }
    cfg.analysis = analysis;
  }

  return { migrated: cfg, deprecations };
}

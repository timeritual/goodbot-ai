import path from 'node:path';
import { safeReadFile } from '../utils/index.js';
import type { SolidViolation, LayerViolation, BarrelViolation } from './types.js';

interface IgnoreRule {
  pattern: string;  // glob-like file pattern or exact path
  principle?: string;  // optional: only ignore specific principle
}

/**
 * Load ignore rules from .goodbot/ignore
 *
 * Format:
 *   # Comment
 *   src/legacy/**                    ← ignore all violations in legacy code
 *   src/contexts/SketchContext.tsx    ← ignore specific file
 *   src/debug/** SRP                 ← ignore only SRP violations in debug
 */
export async function loadIgnoreRules(projectRoot: string): Promise<IgnoreRule[]> {
  const content = await safeReadFile(path.join(projectRoot, '.goodbot', 'ignore'));
  if (!content) return [];

  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const parts = line.split(/\s+/);
      return {
        pattern: parts[0],
        principle: parts[1]?.toUpperCase(),
      };
    });
}

function matchesPattern(filePath: string, pattern: string): boolean {
  // Exact match
  if (filePath === pattern) return true;

  // Glob-like ** matching
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return filePath.startsWith(prefix);
  }

  // Simple wildcard
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(filePath);
  }

  return false;
}

function isIgnored(file: string, principle: string | undefined, rules: IgnoreRule[]): boolean {
  for (const rule of rules) {
    if (!matchesPattern(file, rule.pattern)) continue;
    if (!rule.principle || rule.principle === principle) return true;
  }
  return false;
}

export function filterSolidViolations(
  violations: SolidViolation[],
  rules: IgnoreRule[],
): SolidViolation[] {
  if (rules.length === 0) return violations;
  return violations.filter((v) => !isIgnored(v.file, v.principle, rules));
}

export function filterLayerViolations(
  violations: LayerViolation[],
  rules: IgnoreRule[],
): LayerViolation[] {
  if (rules.length === 0) return violations;
  return violations.filter((v) => !isIgnored(v.file, 'LAYER', rules));
}

export function filterBarrelViolations(
  violations: BarrelViolation[],
  rules: IgnoreRule[],
): BarrelViolation[] {
  if (rules.length === 0) return violations;
  return violations.filter((v) => !isIgnored(v.file, 'BARREL', rules));
}

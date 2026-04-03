import type { FileImports, SolidViolation } from './types.js';

export interface CustomRule {
  name: string;
  description?: string;
  pattern: string;          // regex to match import specifiers
  forbidden_in?: string[];  // glob patterns for files where this import is forbidden
  required_in?: string[];   // glob patterns for files where this import is required
  max_imports?: number;     // max number of cross-module imports allowed in matching files
  severity?: 'info' | 'warning' | 'error';
}

export function checkCustomRules(
  fileImports: FileImports[],
  rules: CustomRule[],
): SolidViolation[] {
  if (rules.length === 0) return [];

  const violations: SolidViolation[] = [];

  for (const rule of rules) {
    const regex = new RegExp(rule.pattern);

    // Check forbidden_in: files matching glob must NOT have imports matching pattern
    if (rule.forbidden_in) {
      for (const fi of fileImports) {
        if (!matchesAnyGlob(fi.filePath, rule.forbidden_in)) continue;

        for (const imp of fi.imports) {
          if (regex.test(imp.specifier)) {
            violations.push({
              principle: 'SRP', // Custom rules map to closest SOLID principle
              severity: rule.severity ?? 'warning',
              file: fi.filePath,
              line: imp.line,
              message: `[${rule.name}] Forbidden import '${imp.specifier}' in ${fi.filePath}`,
              suggestion: rule.description ?? `Remove this import — it violates rule "${rule.name}"`,
            });
          }
        }
      }
    }

    // Check max_imports: files matching patterns can't have more than N cross-module imports
    if (rule.max_imports !== undefined) {
      for (const fi of fileImports) {
        if (rule.forbidden_in && !matchesAnyGlob(fi.filePath, rule.forbidden_in)) continue;
        if (rule.required_in && !matchesAnyGlob(fi.filePath, rule.required_in)) continue;

        const matchingImports = fi.imports.filter((imp) => regex.test(imp.specifier));
        if (matchingImports.length > rule.max_imports) {
          violations.push({
            principle: 'SRP',
            severity: rule.severity ?? 'warning',
            file: fi.filePath,
            message: `[${rule.name}] ${matchingImports.length} imports matching pattern (max: ${rule.max_imports})`,
            suggestion: rule.description ?? `Reduce imports to stay under ${rule.max_imports}`,
          });
        }
      }
    }

    // Check required_in: files matching glob MUST have at least one import matching pattern
    if (rule.required_in && !rule.max_imports) {
      for (const fi of fileImports) {
        if (!matchesAnyGlob(fi.filePath, rule.required_in)) continue;

        const hasMatch = fi.imports.some((imp) => regex.test(imp.specifier));
        if (!hasMatch) {
          violations.push({
            principle: 'DIP',
            severity: rule.severity ?? 'info',
            file: fi.filePath,
            message: `[${rule.name}] Expected import matching '${rule.pattern}' not found`,
            suggestion: rule.description ?? `This file should import from a module matching "${rule.pattern}"`,
          });
        }
      }
    }
  }

  return violations;
}

function matchesAnyGlob(filePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (matchGlob(filePath, pattern)) return true;
  }
  return false;
}

function matchGlob(filePath: string, pattern: string): boolean {
  // Simple glob matching: ** matches any path, * matches within segment
  const regexStr = pattern
    .replace(/\*\*/g, '<<DOUBLESTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<DOUBLESTAR>>/g, '.*');
  return new RegExp(`^${regexStr}$`).test(filePath) ||
    new RegExp(`${regexStr}`).test(filePath);
}

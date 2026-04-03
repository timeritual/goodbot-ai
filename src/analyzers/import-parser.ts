import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { ParsedImport } from './types.js';

// Regex patterns for import detection
const IMPORT_FROM_RE = /import\s+(?:type\s+)?(?:[\w*{}\s,]+)\s+from\s+['"]([^'"]+)['"]/;
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/;
const REEXPORT_RE = /export\s+(?:type\s+)?(?:\{[^}]*\}|\*)\s+from\s+['"]([^'"]+)['"]/;

export async function parseFileImports(filePath: string): Promise<ParsedImport[]> {
  const imports: ParsedImport[] = [];
  let lineNumber = 0;
  let inBlockComment = false;
  let pendingImport = '';

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  for await (const rawLine of rl) {
    lineNumber++;
    let line = rawLine;

    // Handle block comments
    if (inBlockComment) {
      const endIdx = line.indexOf('*/');
      if (endIdx === -1) continue;
      line = line.slice(endIdx + 2);
      inBlockComment = false;
    }

    // Strip block comments within a line
    line = stripInlineBlockComments(line);

    // Check for block comment start
    const blockStart = line.indexOf('/*');
    if (blockStart !== -1) {
      const beforeComment = line.slice(0, blockStart);
      inBlockComment = true;
      // Check if comment ends on same line
      const endIdx = line.indexOf('*/', blockStart + 2);
      if (endIdx !== -1) {
        line = beforeComment + line.slice(endIdx + 2);
        inBlockComment = false;
      } else {
        line = beforeComment;
      }
    }

    // Skip single-line comments
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) continue;

    // Handle multi-line imports: accumulate until we see 'from'
    if (pendingImport) {
      pendingImport += ' ' + trimmed;
      if (trimmed.includes('from ') || trimmed.includes('from\t')) {
        processLine(pendingImport, lineNumber, imports);
        pendingImport = '';
      }
      continue;
    }

    // Detect start of multi-line import
    if (
      (trimmed.startsWith('import ') || trimmed.startsWith('export ')) &&
      trimmed.includes('{') &&
      !trimmed.includes('}') &&
      !trimmed.includes('from')
    ) {
      pendingImport = trimmed;
      continue;
    }

    processLine(trimmed, lineNumber, imports);
  }

  return imports;
}

function processLine(line: string, lineNumber: number, imports: ParsedImport[]): void {
  // Check re-exports first (more specific)
  let match = REEXPORT_RE.exec(line);
  if (match && isRelative(match[1])) {
    imports.push({ specifier: match[1], resolvedPath: null, line: lineNumber, kind: 'reexport' });
    return;
  }

  // Static imports
  match = IMPORT_FROM_RE.exec(line);
  if (match && isRelative(match[1])) {
    imports.push({ specifier: match[1], resolvedPath: null, line: lineNumber, kind: 'import' });
    return;
  }

  // require()
  match = REQUIRE_RE.exec(line);
  if (match && isRelative(match[1])) {
    imports.push({ specifier: match[1], resolvedPath: null, line: lineNumber, kind: 'require' });
  }
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith('.') || specifier.startsWith('/');
}

function stripInlineBlockComments(line: string): string {
  // Remove /* ... */ pairs that start and end on the same segment
  return line.replace(/\/\*.*?\*\//g, '');
}

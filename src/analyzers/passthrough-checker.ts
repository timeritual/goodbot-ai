import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { SolidViolation } from './types.js';

/**
 * Pass-through method detector based on Ousterhout's "Different Layer, Different Abstraction"
 * from A Philosophy of Software Design.
 *
 * A pass-through method does little except invoke another method with a similar or identical
 * signature. It adds a layer of indirection without adding a layer of abstraction — making
 * code harder to follow without making it simpler.
 *
 * Detection heuristics:
 *  1. Function body is very short (1-2 statements)
 *  2. The body is primarily a call to another function
 *  3. Most parameters are forwarded unchanged
 */

export interface PassthroughResult {
  file: string;
  line: number;
  functionName: string;
  delegatesTo: string;
  paramCount: number;
  forwardedCount: number;
}

export async function checkPassthroughMethods(
  sourceFiles: string[],
  projectRoot: string,
): Promise<{ violations: SolidViolation[]; passthroughs: PassthroughResult[] }> {
  const violations: SolidViolation[] = [];
  const passthroughs: PassthroughResult[] = [];

  const BATCH = 50;
  for (let i = 0; i < sourceFiles.length; i += BATCH) {
    const batch = sourceFiles.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(f => analyzeFile(f)));

    for (const fileResults of results) {
      for (const pt of fileResults) {
        passthroughs.push(pt);

        const relative = pt.file.replace(projectRoot + '/', '');
        violations.push({
          principle: 'DIP',
          severity: pt.forwardedCount === pt.paramCount && pt.paramCount >= 2 ? 'warning' : 'info',
          file: relative,
          line: pt.line,
          message: `Pass-through method: ${pt.functionName}() delegates to ${pt.delegatesTo}() forwarding ${pt.forwardedCount}/${pt.paramCount} params`,
          suggestion: 'Each layer should provide a different abstraction. Consider removing this indirection or having it add real value (validation, transformation, error handling)',
        });
      }
    }
  }

  return { violations, passthroughs };
}

/** Parse a single file for pass-through methods */
async function analyzeFile(filePath: string): Promise<PassthroughResult[]> {
  const results: PassthroughResult[] = [];

  try {
    const lines: string[] = [];
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) lines.push(line);

    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();

      // Try to match a function/method declaration
      const funcMatch = matchFunctionDeclaration(line);
      if (funcMatch) {
        const result = checkIfPassthrough(funcMatch, lines, i, filePath);
        if (result) results.push(result);
      }

      i++;
    }
  } catch {
    // Can't read file, skip
  }

  return results;
}

interface FuncDeclaration {
  name: string;
  params: string[];
  lineIndex: number;
}

/** Try to extract function name and parameter names from a declaration line */
function matchFunctionDeclaration(line: string): FuncDeclaration | null {
  // Match: function foo(a, b, c) {
  // Match: async function foo(a: string, b: number) {
  // Match: foo(a, b, c) {                       (method)
  // Match: async foo(a, b) {                     (async method)
  // Match: export function foo(a, b) {
  // Match: export async function foo(a, b) {
  // Match: const foo = (a, b) =>
  // Match: const foo = async (a, b) =>

  let match: RegExpMatchArray | null;

  // function declarations and methods
  match = line.match(
    /^(?:export\s+)?(?:async\s+)?(?:function\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\s*\{?\s*$/,
  );

  if (!match) {
    // Arrow function: const foo = (params) =>
    match = line.match(
      /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*(?::\s*[^=]+)?\s*=>\s*\{?\s*$/,
    );
  }

  if (!match) {
    // Arrow function single-expression: const foo = (params) => otherFunc(...)
    match = line.match(
      /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*(?::\s*[^=]+)?\s*=>\s*(.+)$/,
    );
    if (match && match[3]) {
      // The third group is the body — we'll handle this in checkIfPassthrough
    }
  }

  if (!match) return null;

  const name = match[1];
  // Skip constructors, lifecycle methods, very common framework methods
  if (isFrameworkMethod(name)) return null;

  const rawParams = match[2] || '';
  const params = extractParamNames(rawParams);

  // Need at least 1 parameter to be meaningful
  if (params.length === 0) return null;

  return { name, params, lineIndex: 0 };
}

/** Extract just the parameter names from a param list, stripping types and defaults */
function extractParamNames(rawParams: string): string[] {
  if (!rawParams.trim()) return [];

  return rawParams
    .split(',')
    .map(p => {
      let name = p.trim();
      // Strip destructuring — too complex to track
      if (name.startsWith('{') || name.startsWith('[')) return '';
      // Strip rest operator
      name = name.replace(/^\.\.\./, '');
      // Strip type annotations
      name = name.split(':')[0].trim();
      // Strip default values
      name = name.split('=')[0].trim();
      // Strip optional marker
      name = name.replace(/\?$/, '');
      return name;
    })
    .filter(Boolean);
}

/** Check if the function body is primarily a delegation to another function */
function checkIfPassthrough(
  func: FuncDeclaration,
  lines: string[],
  startLine: number,
  filePath: string,
): PassthroughResult | null {
  const declLine = lines[startLine].trim();

  // Case 1: Single-expression arrow function on same line
  // const foo = (a, b) => bar(a, b)
  const arrowInline = declLine.match(
    /=>\s*(?:await\s+)?(?:return\s+)?(?:this\.)?(\w[\w.]*)\s*\(([^)]*)\)\s*;?\s*$/,
  );
  if (arrowInline) {
    return checkDelegation(func, arrowInline[1], arrowInline[2], startLine, filePath);
  }

  // Case 2: Function body in following lines — collect the body
  const body = collectFunctionBody(lines, startLine);
  if (!body || body.statements.length === 0) return null;

  // Pure pass-through: body is exactly 1 statement (the delegation call).
  // If there are 2+ statements, the function adds logic beyond delegation.
  if (body.statements.length > 1) return null;

  // The single statement should be a return/call to another function
  for (const stmt of body.statements) {
    const trimmed = stmt.trim();

    // Match: return someFunc(args) or return this.someFunc(args)
    // Match: return await someFunc(args)
    // Match: someFunc(args)  (void delegation)
    // Match: this.service.method(args)
    const callMatch = trimmed.match(
      /^(?:return\s+)?(?:await\s+)?(?:this\.)?(\w[\w.]*)\s*\(([^)]*)\)\s*;?\s*$/,
    );

    if (callMatch) {
      const delegateTo = callMatch[1];
      const callArgs = callMatch[2];

      // Don't flag if delegating to itself (recursion)
      if (delegateTo === func.name) continue;

      return checkDelegation(func, delegateTo, callArgs, startLine, filePath);
    }
  }

  return null;
}

/** Check if a function call forwards most of the original params */
function checkDelegation(
  func: FuncDeclaration,
  delegateTo: string,
  callArgsRaw: string,
  startLine: number,
  filePath: string,
): PassthroughResult | null {
  const callArgs = callArgsRaw
    .split(',')
    .map(a => a.trim().replace(/^\.\.\./, ''))
    .filter(Boolean);

  // Count how many function params appear in the call args
  let forwarded = 0;
  for (const param of func.params) {
    if (callArgs.some(arg => arg === param || arg.startsWith(param + '.') || arg.endsWith('.' + param))) {
      forwarded++;
    }
  }

  // It's a pass-through if most params are forwarded
  const ratio = forwarded / func.params.length;
  if (ratio < 0.5 || forwarded < 2) return null;

  // Need at least 2 params forwarded — single-param delegation is too common and usually fine
  return {
    file: filePath,
    line: startLine + 1,
    functionName: func.name,
    delegatesTo: delegateTo,
    paramCount: func.params.length,
    forwardedCount: forwarded,
  };
}

interface FunctionBody {
  statements: string[];
  endLine: number;
}

/** Collect the statements of a short function body, handling brace nesting */
function collectFunctionBody(lines: string[], startLine: number): FunctionBody | null {
  const declLine = lines[startLine];

  // Find the opening brace
  let braceDepth = 0;
  let bodyStart = -1;

  for (let i = 0; i < declLine.length; i++) {
    if (declLine[i] === '{') {
      if (braceDepth === 0) bodyStart = startLine;
      braceDepth++;
    }
  }

  // Opening brace might be on the next line
  if (braceDepth === 0 && startLine + 1 < lines.length) {
    const nextLine = lines[startLine + 1].trim();
    if (nextLine.startsWith('{')) {
      bodyStart = startLine + 1;
      braceDepth = 1;
    }
  }

  if (bodyStart === -1) return null;

  const statements: string[] = [];
  let currentStatement = '';

  for (let i = bodyStart + (bodyStart === startLine ? 1 : 1); i < lines.length && i < startLine + 15; i++) {
    const line = lines[i].trim();

    // Track brace depth
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
    }

    if (braceDepth <= 0) {
      if (currentStatement.trim()) statements.push(currentStatement.trim());
      return { statements, endLine: i };
    }

    // Skip empty lines and comments
    if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) continue;

    currentStatement += ' ' + line;
    if (line.endsWith(';') || line.endsWith('{') || line.endsWith('}')) {
      if (currentStatement.trim()) statements.push(currentStatement.trim());
      currentStatement = '';
    }
  }

  return null;
}

/** Methods that are commonly short delegation points by design */
function isFrameworkMethod(name: string): boolean {
  const SKIP = new Set([
    'constructor', 'ngOnInit', 'ngOnDestroy', 'componentDidMount',
    'componentWillUnmount', 'render', 'toString', 'valueOf',
    'toJSON', 'dispose', 'destroy', 'init', 'setup', 'teardown',
    'main', 'run', 'start', 'stop', 'close', 'open',
    // Common test methods
    'beforeEach', 'afterEach', 'beforeAll', 'afterAll',
    // Getters/setters are fine as pass-through
    'get', 'set',
  ]);
  return SKIP.has(name);
}

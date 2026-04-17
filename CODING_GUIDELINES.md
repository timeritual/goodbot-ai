# Coding Guidelines — goodbot-ai

> **For AI coding agents:** Read this entire file before writing or modifying any code.

## Architecture

### Module Layers (downward-only dependencies)

Higher layers may import from lower layers, never the reverse.

```
  Layer 5:  analyzers   ← src/analyzers   (barrel)
  Layer 5:  commands    ← src/commands    
  Layer 5:  freshness   ← src/freshness   (barrel)
  Layer 5:  generators  ← src/generators  (barrel)
  Layer 5:  scanners    ← src/scanners    (barrel)
  Layer 5:  templates   ← src/templates   
  Layer 1:  config      ← src/config      (barrel)
  Layer 1:  utils       ← src/utils       (barrel)
```

### Import Rules

**Always import from barrel files** (e.g., `../services`, `../hooks`), never from internal files like `../services/orderService`.

This is checked by `goodbot analyze` — barrel bypasses are flagged as violations.

Example:
```
// ✓ Correct
import { myFunction } from '../services';

// ✗ Wrong — bypasses barrel
import { myFunction } from '../services/myService';
```

### Business Logic Placement

Business logic **must** live in: **services**

Business logic **must NOT** live in: routes, controllers

| Layer | Should Contain | Should NOT Contain |
|-------|---------------|-------------------|
| **services** | API calls, validation, caching, business rules | UI rendering, navigation |
| **routes** | UI rendering, state wiring, navigation | Direct API calls, data transformation |
| **controllers** | UI rendering, state wiring, navigation | Direct API calls, data transformation |

### Red Flags

If you see any of these patterns in code you're writing, stop and reconsider:

- Business logic in route handlers
- Direct database calls in controllers
- Missing error handling in async operations

## Verification Checklist

Before committing, always run:

1. `tsc --noEmit` — Type check
2. `eslint src/` — Lint
3. `npm test` — Test
4. `npm run build` — Build


## SOLID Principles

Follow these principles in all code you write or modify.

### S — Single Responsibility
Each file and module should have **one reason to change**.
- **services**: Business logic, data transformation, API orchestration
- **routes**: UI rendering, user interaction — no business logic
- **controllers**: UI rendering, user interaction — no business logic
- Keep files under 300 lines. If a file is growing large, split it by responsibility.
- A function that fetches data should not also format it for display.

### O — Open/Closed
Modules should be **open for extension, closed for modification**.
- Prefer composition over inheritance.
- Use callback patterns, strategy functions, and configuration objects instead of modifying existing code.
- When adding a new variant (e.g., a new order type), extend — don't add another `if` branch.

### L — Liskov Substitution
Subtypes must be **substitutable** for their base types.
- Never narrow the accepted input types of a function override.
- Never broaden the possible error types a subclass may throw.
- Honor all contracts and invariants of the base type.

### I — Interface Segregation
Keep interfaces **focused and minimal**.
- Barrel files should not export everything — only what external consumers need.
- If a consumer only uses 2 of 15 exports, the interface is too broad.
- Prefer many small, focused modules over one large utility module.

### D — Dependency Inversion
Depend on **abstractions**, not concretions.
- Always import from barrel files (`../services`), never from internal files (`../services/orderService`).
- High-level modules (screens, hooks) should not know about low-level implementation details.
- If a module provides `interfaces.ts`, depend on those abstractions.

## Known Issues in This Codebase

> These rules are generated from a live analysis of this project (grade: **A**, score: 85/100). Pay special attention to these areas.

### Dead Exports — Do Not Create Unused Code

This project has unused exports that nothing imports. Before creating a new export:
1. **Search** for an existing function that does what you need
2. If you find one, import and use it instead of writing a new one
3. If no existing function fits, create the new export and ensure at least one consumer imports it

- **config** has unused exports: `type`, `type`, `type`
- **analyzers** has unused exports: `type`, `type`, `type`, `type`, `type`, `runDependencyAnalysis`

### Code Duplication — Reuse Existing Logic

Duplicated code blocks have been detected across files. Before writing new logic:
1. **Search the codebase** for similar functions before implementing from scratch
2. Extract shared patterns into a common utility rather than copying code
3. If two files contain similar logic, refactor into a shared helper




### High Complexity — Keep Functions Simple

These files have high cyclomatic complexity and need careful attention:
- `/Users/alanboyce/Documents/projects/goodbot-ai/src/analyzers/complexity-checker.ts`
- `/Users/alanboyce/Documents/projects/goodbot-ai/src/analyzers/custom-rules.ts`
- `/Users/alanboyce/Documents/projects/goodbot-ai/src/analyzers/cycles.ts`
- `/Users/alanboyce/Documents/projects/goodbot-ai/src/analyzers/dead-export-checker.ts`
- `/Users/alanboyce/Documents/projects/goodbot-ai/src/analyzers/duplication-checker.ts`
- `/Users/alanboyce/Documents/projects/goodbot-ai/src/analyzers/git-history.ts`
- `/Users/alanboyce/Documents/projects/goodbot-ai/src/analyzers/health-score.ts`
- `/Users/alanboyce/Documents/projects/goodbot-ai/src/analyzers/import-parser.ts`
- `/Users/alanboyce/Documents/projects/goodbot-ai/src/analyzers/module-resolver.ts`
- `/Users/alanboyce/Documents/projects/goodbot-ai/src/analyzers/passthrough-checker.ts`

When modifying these files, look for opportunities to extract helper functions. New code should keep branching logic (if/else/for/while/ternary) minimal.

### Shallow Modules — Add Depth, Not Width

These modules have wide interfaces relative to their implementation:
- `utils`

When adding to these modules, focus on adding implementation depth (more logic behind existing exports) rather than adding new exports.


### Hotspot Files — High Churn Risk

These files change frequently and are complex. Extra care is needed when modifying them — they are the most likely source of regressions:
- `src/commands/analyze.ts`
- `src/analyzers/index.ts`
- `src/index.ts`
- `src/analyzers/solid.ts`
- `src/commands/generate.ts`
- `src/commands/init.ts`
- `src/commands/diff.ts`
- `src/commands/ci.ts`
- `src/generators/context-builder.ts`
- `src/commands/fix.ts`

Before modifying a hotspot file, understand its full scope and run all tests.

### Temporal Coupling — Hidden Dependencies

These file pairs always change together but are in different modules. This often means they share logic that should be extracted:
- `src/analyzers/index.ts` ↔ `src/commands/analyze.ts` (coupling: 0.57)

If you modify one file in a coupled pair, check whether the other needs a matching change.


### Oversized Files

These files exceed the size threshold and should not grow further:
- `/Users/alanboyce/Documents/projects/goodbot-ai/src/analyzers/passthrough-checker.ts`
- `/Users/alanboyce/Documents/projects/goodbot-ai/src/commands/analyze.ts`
- `/Users/alanboyce/Documents/projects/goodbot-ai/src/commands/fix.ts`
- `/Users/alanboyce/Documents/projects/goodbot-ai/src/commands/init.ts`
- `/Users/alanboyce/Documents/projects/goodbot-ai/src/analyzers/complexity-checker.ts`
- `/Users/alanboyce/Documents/projects/goodbot-ai/src/analyzers/custom-rules.ts`
- `/Users/alanboyce/Documents/projects/goodbot-ai/src/analyzers/cycles.ts`
- `/Users/alanboyce/Documents/projects/goodbot-ai/src/analyzers/health-score.ts`
- `/Users/alanboyce/Documents/projects/goodbot-ai/src/analyzers/import-parser.ts`
- `/Users/alanboyce/Documents/projects/goodbot-ai/src/analyzers/module-resolver.ts`

When modifying these files, look for opportunities to extract functionality into separate files rather than adding more code.

## Code Style

- TypeScript for all new files
- Follow existing linter rules strictly — zero warnings allowed
- Match the formatting and naming conventions of surrounding code

## Git Workflow

- Main branch: `main`
- Do not commit `.env`, credentials, or large binaries
- Run the verification checklist before every commit

---
*Generated by [goodbot](https://github.com/timeritual/goodbot-ai)*

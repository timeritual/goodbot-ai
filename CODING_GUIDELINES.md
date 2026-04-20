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

## Design Principles

These principles guard against the most common ways AI-generated code degrades a codebase.

### Deep Modules, Not Shallow Ones
A module's value is the complexity it hides behind a simple interface. Before creating a new file, function, or class, ask: does this **absorb complexity** from its callers, or just **move it around**?
- A helper that wraps one function call with no added logic is shallow — inline it.
- A utility module with 15 tiny exports is a symptom, not a solution. Fewer exports that each do meaningful work are better.
- If the interface (parameters, return types, setup) is nearly as complex as the implementation, the abstraction isn't earning its keep.

### Don't Add Complexity "Just in Case"
Every conditional, parameter, configuration option, and error handler has a maintenance cost. Only add complexity that solves a problem **that exists today**.
- Don't add feature flags, options, or generics for hypothetical future requirements.
- Don't handle error cases that the current code path makes impossible.
- Don't create abstractions for a pattern you've only seen once — wait for the second or third instance.
- Three similar lines of code are better than a premature abstraction.

### Complexity Is Incremental
No single change makes a codebase unmaintainable — it happens one "harmless" addition at a time. Before adding code, consider whether you are making the overall system simpler or more complex.
- Prefer removing code over adding code when fixing bugs.
- When extending a feature, check if existing machinery can handle the new case before adding new machinery.
- If a change requires touching many files, the design may need to change — not just the code.


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

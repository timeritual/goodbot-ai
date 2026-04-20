
<p align="center">
  <img src="https://img.shields.io/npm/v/goodbot-ai?style=flat-square&color=22c55e" alt="npm version" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-22c55e?style=flat-square" alt="node version" />
  <img src="https://img.shields.io/npm/l/goodbot-ai?style=flat-square&color=22c55e" alt="license" />
  <img src="https://img.shields.io/badge/AI_agents-Claude%20%7C%20Cursor%20%7C%20Windsurf%20%7C%20Codex%20%7C%20Copilot-22c55e?style=flat-square" alt="supported agents" />
</p>

<h1 align="center">goodbot</h1>

<p align="center">
  <strong>Train your AI to be a good bot.</strong><br/>
  Auto-generate guardrail files that keep AI coding agents aligned with your project's conventions.<br/>
  Design principles. Health grades. Continuous monitoring.
</p>

<p align="center">
  <code>npx goodbot-ai init</code>
</p>

---

## The Problem

AI coding agents (Claude, Cursor, Copilot, Windsurf, Codex) are powerful — but they don't know your project's rules. Without guardrails, they will:

- **Break your architecture** — import from internal files instead of barrels, mix business logic into UI components, bypass your layer boundaries
- **Violate design principles** — create god files, add speculative abstractions, wrap everything in unnecessary helpers
- **Ignore your conventions** — wrong naming, wrong patterns, wrong file locations
- **Introduce regressions** — skip your verification checklist, miss type checks, forget to run tests
- **Drift across agents** — your Claude instructions say one thing, your Cursor rules say another, and your Codex config says nothing at all

Every team using AI agents ends up writing the same boilerplate: `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `AGENTS.md`, `CODING_GUIDELINES.md`... manually, inconsistently, and then forgetting to update them when the project evolves.

## The Solution

**goodbot** scans your codebase, detects your framework, language, architecture, and conventions — then generates a complete set of AI agent guardrail files from a single source of truth. It continuously analyzes your codebase for architectural violations, SOLID principles, code duplication, dead exports, and complexity — and gives you a single health grade.

More importantly, **goodbot detects when your guardrails go stale**. As your codebase evolves, the rules drift from reality. goodbot tracks what your guardrails claim vs what the codebase actually looks like, and surfaces the gap — in your terminal, in PR comments, and via git hooks.

```
$ goodbot freshness

Guardrail Freshness Report (generated 12 days ago)
───────────────────────────────────────────────────────
  Health grade             A → B+    ⚠ stale
  Circular dependencies    0 → 2     ✗ degraded (+2)
  Dead exports             0 → 3     ✗ degraded (+3)
  Barrel violations        5 → 3     ↑ improved (-2)

  8 fresh · 1 stale · 2 degraded · 1 improved

✗ Your guardrails are stale. Run `goodbot generate --analyze --force` to update.
```

Two commands to get started. One command to check if your rules are still honest.

---

## Quick Start

```bash
# Initialize and generate guardrails (auto-analyzes your codebase)
npx goodbot-ai init
npx goodbot-ai generate
```

That's it. goodbot scans your project, runs a full analysis, and generates adaptive guardrail files tailored to your codebase. A snapshot is saved so you can track drift over time.

```bash
# Later, check if your guardrails are still accurate
npx goodbot-ai freshness

# Install git hooks to catch staleness automatically
npx goodbot-ai hooks install
```

Skip the interactive setup with a preset:

```bash
npx goodbot-ai init --preset recommended   # Balanced defaults
npx goodbot-ai init --preset strict         # Maximum enforcement
npx goodbot-ai init --preset relaxed        # Minimal guardrails
```

Or install globally:

```bash
npm install -g goodbot-ai
goodbot init && goodbot generate
```

---

## Commands

### `goodbot init`

Interactive setup that scans your project and walks you through configuration. Or use `--preset` to skip the prompts entirely.

```
$ goodbot init --preset recommended

✔ Scan complete
✓ Config saved with "recommended" preset to .goodbot/config.json
```

Full interactive mode:

```
$ goodbot init

✔ Scan complete
⚠ Found existing agent files: CLAUDE.md, .cursorrules
? How should `goodbot generate` handle these files? Merge — prepend goodbot section, keep your content
? Project name: my-app
? Detected react-native (typescript). Is this correct? Yes
? Main branch name: main
...

✓ Config saved to .goodbot/config.json
```

If existing agent files are detected (CLAUDE.md, .cursorrules, etc.), init asks whether to **merge** (prepend goodbot section, keep your content), **overwrite**, or **skip** them during generation. The default is merge.

Preview a preset before committing:

```bash
goodbot init --preset recommended --dry-run
```

Saves everything to `.goodbot/config.json` — your single source of truth. Also creates `.goodbot/.gitignore` to keep local state files out of version control.

### `goodbot generate`

Reads your config, scans for framework conventions, and generates all enabled agent files:

```
$ goodbot generate

✔ Scan complete
ℹ First run detected — running analysis automatically.
✔ Analysis complete — B+ (81/100), 38 commits (3% AI)
✔ Generated 6 files
✓ CODING_GUIDELINES.md
✓ CLAUDE.md — prepending goodbot section (your content preserved below)
✓ .cursorrules
✓ .windsurfrules
✓ AGENTS.md
✓ .cursorignore
Snapshot saved for freshness tracking.
```

On **first run**, goodbot automatically analyzes your codebase and generates **adaptive guardrails** — rules that reflect your actual codebase state, not just generic best practices. On subsequent runs, analysis is skipped (the CLI tells you why) — use `--analyze` to refresh:

```
$ goodbot generate

✔ Scan complete
  Skipping analysis (snapshot exists). Use --analyze to refresh.
✔ Generated 6 files
...
```

If existing agent files are found (e.g., an existing CLAUDE.md), goodbot **prepends its content at the top** wrapped in `<!-- goodbot:start/end -->` markers, preserving your content below. On re-generation, only the marker section is replaced. This behavior is controlled by the `existingFileStrategy` in config (set during `goodbot init`) — options are `merge` (default), `overwrite`, or `skip`.

| Flag | Description |
|------|-------------|
| `--analyze` | Re-run analysis and refresh adaptive guardrails (automatic on first run) |
| `--dry-run` | Preview what would be generated without writing |
| `--force` | Overwrite existing files without prompting |

### `goodbot check`

Detects when generated files have been manually edited or gone missing, and warns when your analysis snapshot is getting old. Returns exit code 1 on drift — perfect for CI.

```
$ goodbot check

  CODING_GUIDELINES.md          ✓ in sync
  CLAUDE.md                     ✓ in sync
  .cursorrules                  ✗ drifted (manually edited)
  .windsurfrules                ✓ in sync
  AGENTS.md                     ✓ in sync
  .cursorignore                 ✗ missing
  ⚠ Snapshot is 12 days old. Run goodbot freshness to verify claims.

⚠ 3 issues found. Run `goodbot generate --force` to regenerate.
```

If you generated with `--analyze`, the snapshot age is also checked. Snapshots older than 7 days trigger a warning to run `goodbot freshness`.

### `goodbot scan`

Lightweight reconnaissance — detects your framework, languages, project structure, architectural layers, verification commands (from `package.json` scripts), and framework-specific conventions. No files created, no config needed. Use this to see what goodbot sees before committing to anything.

```bash
goodbot scan                        # Quick project overview
goodbot scan --path /other/project  # Scan a different directory
goodbot scan --analyze              # Include a condensed health summary
```

| Flag | Description |
|------|-------------|
| `-p, --path <path>` | Project path to scan (default: current directory) |
| `-a, --analyze` | Append a condensed health grade + architecture summary |

**`scan` vs `analyze` vs `scan --analyze`** — `scan` gives you a fast, read-only snapshot of your project's structure. `analyze` runs a full architectural audit (dependency graph, SOLID checks, health grade). `scan --analyze` is a middle ground: it runs the scan first, then appends a condensed analysis summary with just the key numbers — health grade, module count, circular deps, layer violations, and SOLID score — and suggests running `goodbot analyze` for the full breakdown.

### `goodbot analyze`

Deep architectural analysis — the killer feature. Parses every import in your codebase, builds a dependency graph, checks SOLID principles, and gives you a health grade.

```
$ goodbot analyze

✔ Analysis complete (203ms)

  Health Grade:  B+  (80/100)

  Dependencies     ███████░░░ 65
  Stability        ██████████ 100
  SOLID            █████████░ 91
  Architecture     ███████░░░ 70

  Biggest issues:
      2  Circular dependencies
      8  Oversized files
      1  Layer violations

Dependency Analysis
──────────────────────────────────────────────────
  Modules            14
  Cross-module edges 52
  Files parsed       193

Module Stability
──────────────────────────────────────────────────
  Module                 Ca   Ce  Instability
  constants               5    0  0.00 ██████████
  types                  11    0  0.00 ██████████
  utils                   8    1  0.11 █████████░
  services                4    4  0.50 █████░░░░░
  screens                 1   11  0.92 █░░░░░░░░░
  navigation              0    4  1.00 ░░░░░░░░░░

Circular Dependencies (2)
──────────────────────────────────────────────────
  ⚠ debug → contexts → debug
  ⚠ _root → components → _root

Layer Violations (1)
──────────────────────────────────────────────────
  ✗ debug (L5) → contexts (L6)

SOLID Analysis
──────────────────────────────────────────────────
  SRP (Single Responsibility)      ████████░░ 75
  DIP (Dependency Inversion)       ██████████ 100
  ISP (Interface Segregation)      ██████████ 99

  ✗ [SRP] File has 999 lines (threshold: 300)
    src/components/Canvas/layers/AngleProtractorDisplay.tsx
    → Split into smaller, focused modules

  ⚠ [SRP] File has 451 lines (threshold: 300)
    src/api/sketchApi.ts

⚠ 35 issues found.
```

**What it checks:**

| Analysis | What it does |
|----------|-------------|
| **Health Grade (A+ to F)** | Single score combining all metrics — the thing you screenshot and share |
| **SOLID Principles** | SRP (file size, mixed concerns), DIP (concrete vs abstract imports), ISP (barrel bloat) |
| **Stability Metrics** | Afferent coupling (Ca), efferent coupling (Ce), and instability (I = Ce/(Ca+Ce)) per module |
| **Stable Dependency Principle** | Flags when a stable module depends on a less stable one |
| **Circular Dependencies** | Finds cycles using Tarjan's strongly connected components algorithm |
| **Layer Violations** | Validates imports flow downward only through your declared architecture layers |
| **Barrel Violations** | Detects imports that bypass barrel files (e.g., `../services/orderService` instead of `../services`) |
| **Cyclomatic Complexity** | Flags files with high branching complexity (if/else/switch/ternary density) |
| **Code Duplication** | Detects copy-pasted code blocks across files using fingerprint hashing |
| **Dead Exports** | Finds barrel exports that nothing imports — common in AI-generated code |
| **God Modules** | Modules with excessive fan-in and fan-out (too many responsibilities) |
| **Shallow Modules** | Wide interfaces with little implementation — re-export layers adding no value |
| **Custom Rules** | Team-defined import rules (`forbiddenIn`, `requiredIn`, `maxImports`) — shown in their own section |
| **Violation Budgets** | Compares actual violations against configured limits per category |

With `--git`, also analyzes git history:

| Analysis | What it does |
|----------|-------------|
| **Hotspot Detection** | Files that change frequently with high churn — risk areas for regressions |
| **AI Commit Detection** | Classifies commits as AI vs human (Claude, Copilot, GPT, bot emails) |
| **Temporal Coupling** | Files that always change together but aren't structurally connected — hidden dependencies |

| Flag | Description |
|------|-------------|
| `--json` | Output full analysis as JSON for programmatic consumption |
| `--diagram` | Generate `architecture.md` with mermaid dependency graph |
| `--git` | Include git history analysis (hotspots, AI commits, temporal coupling) |
| `--path <path>` | Analyze a specific project directory |

### `goodbot diff`

Analyze only changed files. Shows violations introduced by your current branch — perfect for PR reviews and CI. Doesn't show 50 existing violations, just the delta.

```
$ goodbot diff --base main

  Health Grade:  B+  (80/100)

Changes vs main
──────────────────────────────────────────────────
  Files changed      4
  Layer violations   0
  Barrel violations  0
  SOLID violations   1

Violations in Changed Files
──────────────────────────────────────────────────
  ⚠ [SRP] File has 450 lines (threshold: 300)
    src/services/orderService.ts

⚠ 1 violation in changed files.

Tip: Use `goodbot diff --freshness` to compare against your guardrail snapshot.
```

Add `--freshness` for **guardrail impact** — compares your changes against the stored snapshot to show which claims have moved:

```
$ goodbot diff --base main --freshness

  ...

Guardrail Impact
──────────────────────────────────────────────────
  Your guardrails were generated 13d ago. This diff has moved:

  ⚠ Health grade: A → B+
  ✗ SRP violations: 35 → 44 (+9)
  ↑ Barrel violations: 5 → 3 (-2)

⚠ 2 guardrail claims degraded. Run `goodbot generate --analyze --force` to update.
```

| Flag | Description |
|------|-------------|
| `--base <branch>` | Base branch to compare against (default: main) |
| `--freshness` | Include guardrail freshness comparison (runs git history analysis) |
| `--json` | Output as JSON |

### `goodbot watch`

Continuous monitoring. Watches your source files and re-runs analysis on every change with a live dashboard.

```
$ goodbot watch

  goodbot watching... (2:34:05 PM, 193 files, 158ms)

  Health:  B+  (80/100)
  ──────────────────────────────────────────────
  Circular deps      2 (unchanged)
  Layer violations   1 (unchanged)
  Barrel violations  0
  SDP violations     0
  SOLID              5 errors, 12 warnings (-1)

  Resolved:
    ✓ [SRP] src/services/orderService.ts
```

Shows new and resolved violations in real-time as you code. Color-coded deltas so you immediately see if your changes are improving or degrading the architecture. Automatically re-scans when directories are added or removed (new modules, restructuring).

### `goodbot fix`

Auto-fix architectural violations. Rewrites barrel-bypassing imports, removes dead exports from barrels, generates missing barrel files, adds split markers to oversized files, sorts barrel exports, and creates missing `.cursorignore`.

```
$ goodbot fix --dry-run

✔ Analysis complete

Barrel Import Fixes (3)
  ~ src/screens/Home.ts:5 — '../services/orderService' → '../services'
  ~ src/screens/Home.ts:8 — '../utils/format' → '../utils'
  ~ src/hooks/useAuth.ts:2 — '../services/authService' → '../services'

Dead Export Removal (2)
  ~ config/index.ts — would remove: configDir, checksumsPath
  ~ generators/index.ts — would remove: renderTemplate

Missing Barrels (1)
  + Would create src/features/index.ts

SRP Split Points (1)
  ~ src/components/Canvas/operations/SelectionOperations.ts — 3 suggested split points

ℹ 7 fixes available. Run `goodbot fix` to apply.
```

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview fixes without applying |
| `--only <type>` | Run only specific fix types: `barrels`, `imports`, `dead-exports`, `srp`, `sort` |

### `goodbot score`

Just the health grade. One line. Fast enough for terminal prompts and git hooks.

```
$ goodbot score
B+ (80/100)
```

Exits with code 1 if grade is D or F, or if any [violation budget](#violation-budgets) is exceeded — use it as a pre-commit hook:

```bash
# .husky/pre-commit
goodbot score --no-color || echo "Architecture health too low!"
```

### `goodbot freshness`

The guardrails you generated last week claim "2 circular deps" and "health grade B+" — but is that still true? `freshness` compares your stored snapshot against a fresh analysis and tells you exactly what's changed.

```
$ goodbot freshness

Guardrail Freshness Report (generated 12 days ago)
───────────────────────────────────────────────────────
  Health grade             A → B+    ⚠ stale
  Health score             90 → 81 (-9)    ✗ degraded
  Circular dependencies    0    ✓ fresh
  Barrel violations        0 → 1 (+1)    ✗ degraded
  Layer violations         0    ✓ fresh
  SRP violations           30 → 43 (+13)    ✗ degraded
  Dead exports             0 → 3 (+3)    ✗ degraded
  Hotspot files            10    ✓ fresh
  AI commit ratio          3    ✓ fresh
  Custom rules             0 rules    ✓ fresh

  8 fresh · 1 stale · 6 degraded

✗ Your guardrails are stale and codebase health has degraded.
⚠ Run `goodbot generate --analyze --force` to update.
```

Requires a snapshot (created automatically on first `goodbot generate`, or on any run with `--analyze`). Exits with code 1 if any claims are degraded — use it in CI to catch guardrail drift.

Use `--watch` for continuous monitoring:

```bash
goodbot freshness --watch        # Poll every 60 seconds
goodbot freshness --watch 30     # Poll every 30 seconds
```

Clears the screen and redraws on each tick, with alerts when the overall status changes (e.g., fresh to degraded).

| Flag | Description |
|------|-------------|
| `--json` | Output full freshness report as JSON |
| `--watch [seconds]` | Continuously monitor freshness (default: 60s, minimum: 10s) |
| `--path <path>` | Project path |

### `goodbot hooks`

Install lightweight git hooks that automatically check for stale guardrails.

```
$ goodbot hooks install

  post-merge       ✓ installed
  pre-push         ✓ installed

✓ 2 hooks installed.
Hooks are advisory — they warn but do not block.
```

- **post-merge** — runs `goodbot check` after every merge (surfaces stale snapshots)
- **pre-push** — runs `goodbot freshness` before push (warns if codebase has degraded)

Hooks are safe: they append to existing hooks (won't overwrite husky, lint-staged, etc.), and `goodbot hooks uninstall` cleanly removes only the goodbot sections.

### `goodbot pr`

Generate a markdown PR description with architectural impact. Copy-paste into your pull request.

```
$ goodbot pr --base main

─── Copy below this line ───

## Architecture Impact

| Metric | Value |
|--------|-------|
| Health Grade | 🔵 **B+** (80/100) |
| Files Changed | 11 (9 source) |
| Violations in PR | 0 ✅ |
| Modules | 14 |
| Circular Deps | 2 ⚠️ |

─── Copy above this line ───
```

| Flag | Description |
|------|-------------|
| `--base <branch>` | Base branch to compare against (default: main) |
| `--copy` | Copy to clipboard (macOS) |

---

## Health Grade

Every analysis produces a single **A+ to F** grade — the thing you screenshot and share.

The grade is a weighted composite of four dimensions:

| Dimension | Weight | What it measures |
|-----------|--------|-----------------|
| **Dependencies** | 30% | Circular deps, layer violations, barrel violations |
| **Stability** | 20% | SDP violations (stable modules depending on unstable ones) |
| **SOLID** | 25% | SRP, DIP, ISP principle adherence |
| **Architecture** | 25% | Module count, coupling density, layer definition |

| Grade | Score | Meaning |
|-------|-------|---------|
| A+ | 95-100 | Exceptional architecture |
| A | 85-94 | Clean, well-structured |
| B+ | 78-84 | Good with minor issues |
| B | 70-77 | Solid but room for improvement |
| C+ | 63-69 | Notable architectural debt |
| C | 55-62 | Significant issues |
| D | 40-54 | Major problems |
| F | 0-39 | Architectural emergency |

---

## Design Principles

goodbot generates two sets of design principles in CODING_GUIDELINES.md — **SOLID** for structural correctness and **design principles** (inspired by *A Philosophy of Software Design*) that counteract common AI agent failure modes.

### SOLID Principles

Three principles are statically analyzed; all five are generated as guidelines:

| Principle | Checked | What it detects |
|-----------|---------|-----------------|
| **S** — Single Responsibility | Yes | Files over 300 lines, files importing from 4+ modules (mixed concerns) |
| **O** — Open/Closed | Guidelines only | Generated guidelines teach composition over modification |
| **L** — Liskov Substitution | Guidelines only | Generated guidelines teach contract honoring |
| **I** — Interface Segregation | Yes | Barrel files exporting 15+ symbols (fat interfaces) |
| **D** — Dependency Inversion | Yes | Importing concrete files when interfaces.ts exists in the target module |

### AI-Focused Design Principles

These rules target the specific ways AI-generated code degrades a codebase over time:

| Principle | What it prevents |
|-----------|-----------------|
| **Deep modules, not shallow ones** | AI creating wrappers and helpers that just move complexity around |
| **Don't add complexity "just in case"** | Speculative feature flags, unnecessary error handling, premature abstractions |
| **Complexity is incremental** | Death by a thousand "harmless" additions — prefer removing code over adding it |

---

## Managing Violations

**Suppress false positives** with `.goodbot/ignore`:

```
# Ignore all violations in legacy code
src/legacy/**

# Ignore only SRP violations in specific files
src/contexts/SketchContext.tsx SRP

# Ignore barrel violations in test utilities
src/test-utils/** BARREL
```

**Accept known debt** with [violation budgets](#violation-budgets) — acknowledge violations without hiding them, and fail only when the count exceeds the budget.

---

## Mermaid Dependency Diagram

Generate a visual architecture diagram that renders beautifully on GitHub:

```bash
goodbot analyze --diagram
```

Creates `architecture.md` with a mermaid graph showing module dependencies, color-coded by stability:
- **Green** = stable (low instability)
- **Yellow** = moderate
- **Red** = unstable (high instability)

Includes a stability metrics table and lists any circular dependencies or layer violations.

---

## What Gets Generated

| File | Who reads it | Purpose |
|------|-------------|---------|
| `CODING_GUIDELINES.md` | All agents + humans | Architecture, framework conventions, SOLID + design principles, business logic placement, verification checklist |
| `CLAUDE.md` | Claude Code, Claude in IDEs | Points to CODING_GUIDELINES.md + quick reference |
| `.cursorrules` | Cursor AI | Points to CODING_GUIDELINES.md |
| `.windsurfrules` | Windsurf AI | Points to CODING_GUIDELINES.md |
| `AGENTS.md` | OpenAI Codex | Points to CODING_GUIDELINES.md |
| `.cursorignore` | Cursor AI | Keeps build artifacts, secrets, and noise out of AI context |
| `architecture.md` | All agents + humans | Mermaid dependency diagram (via `--diagram` flag) |

goodbot also generates internal tracking files in `.goodbot/`:

| File | Purpose | Commit? |
|------|---------|---------|
| `.goodbot/config.json` | Your single source of truth — all rules and settings | **Yes** — shared across the team |
| `.goodbot/checksums.json` | Hashes of generated files (for drift detection via `check`) | No — local state |
| `.goodbot/snapshot.json` | Analysis snapshot (for freshness tracking via `freshness`) | No — local state |
| `.goodbot/history.json` | Health score history (for trend tracking via `trend`) | No — local state |
| `.goodbot/.gitignore` | Auto-created by `goodbot init` to gitignore local state files | **Yes** |

The key insight: **CODING_GUIDELINES.md is the single source of truth**. All agent-specific files simply point to it. This eliminates drift between agents and keeps maintenance to one file. The generated guidelines include SOLID principles tailored to your framework, design principles that counteract common AI agent failure modes, and auto-detected framework conventions specific to your codebase.

---

## Configuration

All config lives in `.goodbot/config.json`. Here's what it controls:

```jsonc
{
  "version": 1,
  "project": {
    "name": "my-app",
    "framework": "react-native",    // auto-detected
    "language": "typescript"         // auto-detected
  },
  "architecture": {
    "layers": [                      // your module layers
      { "name": "types", "path": "src/types", "level": 0, "hasBarrel": true },
      { "name": "services", "path": "src/services", "level": 4, "hasBarrel": true },
      { "name": "screens", "path": "src/screens", "level": 8, "hasBarrel": false }
    ],
    "dependencyDirection": "downward",
    "barrelImportRule": "always",    // always | recommended | none
    "interfaceContracts": true       // TypeScript satisfies checks
  },
  "businessLogic": {
    "allowedIn": ["services"],
    "forbiddenIn": ["hooks", "screens", "components"],
    "redFlags": [
      "Direct fetch/axios calls in screens or components",
      "AsyncStorage for business data in components"
    ]
  },
  "verification": {
    "typecheck": "npm run typecheck",  // detected from package.json scripts
    "lint": "npm run lint",
    "test": "npm test"
  },
  "agentFiles": {
    "claudeMd": true,
    "cursorrules": true,
    "windsurfrules": true,
    "agentsMd": true,
    "cursorignore": true,
    "codingGuidelines": true
  },
  "conventions": {
    "mainBranch": "main",
    "customRules": [
      "Use --legacy-peer-deps for npm installs",
      "Use device.disableSynchronization() in Detox tests"
    ]
  },
  "analysis": {
    "solid": true,
    "thresholds": { "maxFileLines": 300, "maxBarrelExports": 15, "maxModuleCoupling": 8 },
    "budget": { "circular": 0, "srp": 10 }
  },
  "customRulesConfig": []
}
```

See [Custom Rules](#custom-rules) and [Violation Budgets](#violation-budgets) for details on those sections.

Edit this file directly or re-run `goodbot init` to regenerate it.

---

## Supported Frameworks

**Deep analysis** (import graphs, SOLID checks, dependency cycles, complexity, duplication, dead exports, health grading) is currently **TypeScript/JavaScript only**. Support for Python and Go is planned.

**Framework detection and guardrail generation** work for all frameworks below — goodbot detects your stack and generates framework-specific red flags, guidelines, and auto-detected conventions. Projects in any language get guardrail files; TS/JS projects additionally get adaptive guardrails powered by live analysis.

| Framework | Detection | Red flags | Convention detection | Deep analysis |
|-----------|-----------|-----------|---------------------|:---:|
| React | `package.json → react` | Business logic in components, fetch in useEffect | State management (Redux/Zustand/Context), custom hooks | Yes |
| React Native | `package.json → react-native` | AsyncStorage misuse, fetch in screens | State management, custom hooks | Yes |
| Next.js | `package.json → next` | Secrets in client code, missing caching | App/Pages router, server actions, state management | Yes |
| NestJS | `package.json → @nestjs/core` | Logic in controllers, missing DTOs | Modules, guards, repositories, entities, DTOs, interceptors, pipes | Yes |
| Express | `package.json → express` | Logic in route handlers, missing validation | Middleware files, router organization | Yes |
| Angular | `package.json → @angular/core` | Logic in components, direct HTTP in components, missing DI | — | Yes |
| Node.js | `package.json` (fallback) | Logic in route handlers | — | Yes |
| Django | `requirements.txt → django` | Logic in views, querysets in templates | — | Coming soon |
| Flask | `requirements.txt → flask` | Logic in routes, missing validation | — | Coming soon |
| FastAPI | `requirements.txt → fastapi` | Logic in endpoints, missing Pydantic models | — | Coming soon |
| Go | `go.mod` | Logic in handlers, missing error wrapping | — | Coming soon |

Convention detection scans your source files for framework-specific patterns (decorators, file naming conventions, state management libraries, routing patterns) and surfaces them in CODING_GUIDELINES.md so AI agents follow your project's actual conventions — not just generic best practices.

---

## CI, Trends, and Multi-Repo

### `goodbot ci` — GitHub Action PR Bot

Run analysis in CI and output markdown for PR comments. Includes a reusable GitHub Action.

```yaml
# .github/workflows/goodbot.yml
name: Architecture Analysis
on: [pull_request]
jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: timeritual/goodbot-ai@main
        with:
          mode: diff
          comment: 'true'
          fail-on-grade: C
```

Or use the CLI directly:

```bash
goodbot ci --output pr-comment.md --json result.json
```

The PR comment includes health grade with emoji bars, violation counts, and collapsible details — and updates itself on each push. If a freshness snapshot exists, the comment also includes a **Guardrail Freshness** section showing which claims have drifted. If [violation budgets](#violation-budgets) are configured, a **Violation Budget** table shows which categories are within or over budget.

### `goodbot trend` — Track Health Over Time

Record snapshots and visualize architectural progress across sprints.

```bash
# Record current state
goodbot trend --record

# View history
goodbot trend

Architecture Health Trend
──────────────────────────────────────────────────
  Current          B+ (80/100)
  First recorded   C+ (64/100)
  Change           +16
  Entries          12
  Period           Jan 15, 2026 → Apr 3, 2026

Latest vs Previous
──────────────────────────────────────────────────
  Dependencies     65 +5
  Stability        100 ±0
  SOLID            91 +3
  Architecture     70 +2
```

Add `goodbot trend --record` to your CI pipeline to track every merge to main.

Use `--effectiveness` to see which rule categories are getting better or worse over time — the ones that consistently worsen may need clearer guardrail rules:

```
$ goodbot trend --effectiveness

Rule Effectiveness
───────────────────────────────────────────────────────
  3 entries from Mar 15, 2026 → Apr 14, 2026

  Category              First Latest    Delta    Trend
  ──────────────────── ────── ────── ──────── ────────
  Circular deps             1      0       -1   ↓ better
  Layer violations          2      0       -2   ↓ better
  SRP                      55     46       -9   ↓ better
  Duplication               8      3       -5   ↓ better
  Dead exports              6      3       -3   ↓ better

✓ Improving: Circular deps, Layer violations, SRP, Duplication, Dead exports
```

### `goodbot sync` — Shared Team Config

One team lead configures the rules. All repos inherit them.

```bash
# Push your config to a shared location
goodbot sync --push --from /path/to/shared/config.json

# Team members pull from the shared source
goodbot sync --from https://raw.githubusercontent.com/org/config/main/.goodbot/config.json

# Or set it in config once, then just run:
goodbot sync
```

Merges team rules with local project identity — your project name and verification commands stay local, architecture rules come from the team. Remote configs are validated against the goodbot schema before applying, and a summary of changes is shown after sync. Only HTTPS URLs are accepted for remote sources.

### `goodbot report` — Multi-Repo Dashboard

CTO-level visibility across your entire org.

```bash
goodbot report ./app ./api ./shared-lib ./admin

Multi-Repo Health Report
──────────────────────────────────────────────────
  Repos analyzed   4
  Average score    74
  Best             shared-lib — A (88)
  Worst            admin — C+ (63)

  Repo                     Grade    Score    Circular  Layer   SOLID
  ──────────────────────────────────────────────────────────────────
  shared-lib               A        88       0         0       0
  app                      B+       80       2         1       5
  api                      B        72       0         0       3
  admin                    C+       63       1         3       8
```

```bash
# Generate a markdown report
goodbot report ./app ./api --output health-report.md
```

### `goodbot onboard` — New Developer Guide

Generate a comprehensive onboarding doc from your architecture — saves hours per new hire.

```bash
goodbot onboard

✓ Onboarding guide saved to ONBOARDING.md
95 lines — ready for new team members.
```

The guide includes project overview, data-driven module descriptions (file count, stability, dependency relationships, violations), import conventions, business logic rules, verification commands, and current health status. Module descriptions are derived from analysis data, not generic templates — so they accurately reflect your project's actual architecture.

### Custom Rules

Define team-specific import rules in `.goodbot/config.json`. Custom rules are validated against actual code during `goodbot analyze` and appear in their own section — separate from SOLID violations.

```json
{
  "customRulesConfig": [
    {
      "name": "no-api-in-components",
      "description": "Components must not import from api layer directly",
      "pattern": "\\.\\./(api|services/.*Service)",
      "forbiddenIn": ["src/components/**"],
      "severity": "error"
    },
    {
      "name": "max-hook-deps",
      "description": "Hooks should not import from more than 3 modules",
      "pattern": "\\.\\./(.*)",
      "forbiddenIn": ["src/hooks/**"],
      "maxImports": 3,
      "severity": "warning"
    },
    {
      "name": "services-use-types",
      "description": "Services must import from the types module",
      "pattern": "\\.\\./types",
      "requiredIn": ["src/services/**"],
      "severity": "info"
    }
  ]
}
```

**Rule types:**

| Field | What it does |
|-------|-------------|
| `forbiddenIn` | Files matching these globs must NOT import anything matching `pattern` |
| `requiredIn` | Files matching these globs MUST import something matching `pattern` |
| `maxImports` | Files can't have more than N imports matching `pattern` |
| `severity` | `error` (fails CI), `warning` (flagged), `info` (noted) |

Custom rules track separately in `goodbot trend --effectiveness` and appear in their own section in `goodbot analyze` output.

### Violation Budgets

Set acceptable limits for known technical debt. Unlike `.goodbot/ignore` (which hides violations), budgets acknowledge them and fail only when the limit is exceeded. This lets teams set realistic targets instead of either perfection or suppression.

```json
{
  "analysis": {
    "budget": {
      "circular": 2,
      "layer": 0,
      "barrel": 5,
      "srp": 10,
      "complexity": 3,
      "duplication": 5,
      "deadExports": 8,
      "custom": 0
    }
  }
}
```

Budget results appear in `goodbot analyze`, `goodbot score`, and CI PR comments:

```
Violation Budget
──────────────────────────────────────────────────
  Circular dependencies    2/2 ✓ within budget
  Layer violations         0/0 ✓ within budget
  SRP violations           12/10 ✗ over budget
```

`goodbot score` exits with code 1 if any category is over budget — use it as a pre-commit hook alongside the grade check. Only categories with a configured budget are checked; omitted categories are unconstrained.

---

## CI Integration

```yaml
# Simple — just check guardrail files
- name: Check AI guardrails
  run: npx goodbot-ai check

# Fail if guardrails have degraded since last generate
- name: Check guardrail freshness
  run: npx goodbot-ai freshness

# PR analysis with comment
- uses: timeritual/goodbot-ai@main
  with:
    mode: diff
    comment: 'true'
    fail-on-grade: C

# Record trend on merge to main
- name: Record health trend
  if: github.ref == 'refs/heads/main'
  run: npx goodbot-ai trend --record
```

All commands return exit code 1 on violations — fail the build and keep your AI agents honest.

For local development, install git hooks to catch staleness automatically:

```bash
goodbot hooks install
```

---

## Command Reference

| Command | Description |
|---------|-------------|
| `goodbot init` | Interactive project setup (or `--preset strict\|recommended\|relaxed`, `--dry-run` to preview) |
| `goodbot generate` | Generate AI agent guardrail files (auto-analyzes on first run, merges with existing files) |
| `goodbot presets` | Compare available presets side-by-side |
| `goodbot check` | Detect drift in generated files + snapshot age |
| `goodbot freshness` | Compare guardrail claims against current codebase reality (`--watch` for continuous) |
| `goodbot hooks` | Install/uninstall git hooks for automatic freshness checks |
| `goodbot scan` | Quick project structure detection (framework, layers, commands) |
| `goodbot scan --analyze` | Scan + condensed health grade and architecture summary |
| `goodbot analyze` | Full architecture + SOLID analysis with detailed health grade |
| `goodbot diff` | Analyze only changed files vs base branch (`--freshness` for guardrail impact) |
| `goodbot watch` | Continuous live monitoring dashboard (auto re-scans on structural changes) |
| `goodbot fix` | Auto-fix violations: barrel imports, dead exports, missing barrels, sort, split markers (`--only`) |
| `goodbot score` | One-line health grade + budget check (for scripts and git hooks) |
| `goodbot pr` | Generate PR description with architectural impact |
| `goodbot ci` | CI/CD analysis with PR comment output |
| `goodbot trend` | Track health score over time (`--effectiveness` for per-rule trends) |
| `goodbot sync` | Sync shared team config across repos (HTTPS-only, schema-validated) |
| `goodbot report` | Multi-repo health dashboard |
| `goodbot onboard` | Generate new developer onboarding guide |

---

## Why "goodbot"?

Because AI coding agents are like eager interns — incredibly fast, surprisingly capable, but they need clear rules to follow. **goodbot** is obedience training for your AI. Set the rules once, enforce them everywhere, and your AI becomes a good bot.

---

## Contributing

```bash
git clone https://github.com/timeritual/goodbot-ai.git
cd goodbot-ai
npm install
npx tsx src/index.ts --help    # Run in dev mode
```

---

## License

MIT

<p align="center">
  <sub>Built by <a href="https://github.com/timeritual">timeritual</a></sub>
</p>

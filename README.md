
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
  SOLID principles analysis. Health grades. Continuous monitoring.
</p>

<p align="center">
  <code>npx goodbot-ai init</code>
</p>

---

## The Problem

AI coding agents (Claude, Cursor, Copilot, Windsurf, Codex) are powerful — but they don't know your project's rules. Without guardrails, they will:

- **Break your architecture** — import from internal files instead of barrels, mix business logic into UI components, bypass your layer boundaries
- **Violate SOLID principles** — create god files, depend on concretions instead of abstractions, build fat interfaces
- **Ignore your conventions** — wrong naming, wrong patterns, wrong file locations
- **Introduce regressions** — skip your verification checklist, miss type checks, forget to run tests
- **Drift across agents** — your Claude instructions say one thing, your Cursor rules say another, and your Codex config says nothing at all

Every team using AI agents ends up writing the same boilerplate: `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `AGENTS.md`, `CODING_GUIDELINES.md`... manually, inconsistently, and then forgetting to update them when the project evolves.

## The Solution

**goodbot** scans your codebase, detects your framework, language, architecture, and conventions — then generates a complete set of AI agent guardrail files from a single source of truth. It also continuously analyzes your codebase for architectural violations, SOLID principle adherence, and gives you a single health grade.

```
$ goodbot analyze

✔ Analysis complete (203ms)

  Health Grade:  B+  (80/100)

  Dependencies     ███████░░░ 65
  Stability        ██████████ 100
  SOLID            █████████░ 91
  Architecture     ███████░░░ 70
```

One command generates all your agent files. One command grades your architecture. One command watches for violations in real-time.

---

## Quick Start

```bash
# Initialize goodbot in your project
npx goodbot-ai init

# Generate all agent guardrail files
npx goodbot-ai generate

# Analyze your architecture
npx goodbot-ai analyze

# Watch for violations as you code
npx goodbot-ai watch
```

Or install globally:

```bash
npm install -g goodbot-ai
goodbot init
```

Or skip the interactive flow entirely with a preset:

```bash
npx goodbot-ai init --preset recommended   # Balanced defaults
npx goodbot-ai init --preset strict         # Maximum enforcement
npx goodbot-ai init --preset relaxed        # Minimal guardrails
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
? Project name: my-app
? Detected react-native (typescript). Is this correct? Yes
? Main branch name: main
? Detected 13 directories under src/. Define layer architecture? Yes
? Require barrel imports for cross-layer access? Always (ESLint enforced)
? Where should business logic live? services
? Type check command: npx tsc --noEmit
? Lint command: npx eslint src/
? Test command: npm test
? Which files to generate? CLAUDE.md, .cursorrules, .windsurfrules, AGENTS.md, .cursorignore, CODING_GUIDELINES.md
? Add custom rules/conventions? No

✓ Config saved to .goodbot/config.json
```

Saves everything to `.goodbot/config.json` — your single source of truth.

### `goodbot generate`

Reads your config and generates all enabled agent files:

```
$ goodbot generate

✔ Generated 6 files
✓ CODING_GUIDELINES.md
✓ CLAUDE.md
✓ .cursorrules
✓ .windsurfrules
✓ AGENTS.md
✓ .cursorignore
```

Use `--analyze` to generate **adaptive guardrails** — rules that reflect your actual codebase state, not just generic best practices:

```
$ goodbot generate --analyze

✔ Analysis complete — B+ (81/100), 38 commits (3% AI)
✔ Generated 6 files
✓ CODING_GUIDELINES.md
✓ CLAUDE.md
...
Snapshot saved for freshness tracking.
```

With `--analyze`, guardrails include your current health grade, specific violation counts, hotspot files, and known issues — so AI agents know exactly what to watch out for. A snapshot is also saved for [freshness tracking](#goodbot-freshness).

| Flag | Description |
|------|-------------|
| `--analyze` | Run analysis first and generate adaptive guardrails based on findings |
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

Lightweight reconnaissance — detects your framework, languages, project structure, architectural layers, and verification commands. No files created, no config needed. Use this to see what goodbot sees before committing to anything.

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

| Flag | Description |
|------|-------------|
| `--json` | Output full analysis as JSON for programmatic consumption |
| `--diagram` | Generate `architecture.md` with mermaid dependency graph |
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
```

| Flag | Description |
|------|-------------|
| `--base <branch>` | Base branch to compare against (default: main) |
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

Shows new and resolved violations in real-time as you code. Color-coded deltas so you immediately see if your changes are improving or degrading the architecture.

### `goodbot fix`

Auto-fix what it can. Generates missing barrel files, adds split markers to oversized files, creates missing `.cursorignore`.

```
$ goodbot fix --dry-run

✔ Analysis complete
  ~ src/components/Canvas/operations/SelectionOperations.ts — 3 suggested split points:
    Line 311: // --- split: find-closest-shape.ts ---
    Line 499: // --- split: is-point-near-midpoint-circle.ts ---
    Line 639: // --- split: find-closest-independent-line.ts ---
  + Would create src/features/index.ts

ℹ 2 fixes available. Run `goodbot fix` to apply.
```

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview fixes without applying |

### `goodbot score`

Just the health grade. One line. Fast enough for terminal prompts and git hooks.

```
$ goodbot score
B+ (80/100)
```

Exits with code 1 if grade is D or F — use it as a pre-commit hook:

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

Requires a snapshot from a previous `goodbot generate --analyze` run. Exits with code 1 if any claims are degraded — use it in CI to catch guardrail drift.

| Flag | Description |
|------|-------------|
| `--json` | Output full freshness report as JSON |
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

## SOLID Principles

goodbot checks three statically-analyzable SOLID principles and **generates guidelines for all five** in your CODING_GUIDELINES.md so AI agents follow them when writing code.

| Principle | Checked | What it detects |
|-----------|---------|-----------------|
| **S** — Single Responsibility | Yes | Files over 300 lines, files importing from 4+ modules (mixed concerns) |
| **O** — Open/Closed | Guidelines only | Generated guidelines teach composition over modification |
| **L** — Liskov Substitution | Guidelines only | Generated guidelines teach contract honoring |
| **I** — Interface Segregation | Yes | Barrel files exporting 15+ symbols (fat interfaces) |
| **D** — Dependency Inversion | Yes | Importing concrete files when interfaces.ts exists in the target module |

---

## Suppressing Violations

Create `.goodbot/ignore` to suppress false positives:

```
# Ignore all violations in legacy code
src/legacy/**

# Ignore only SRP violations in specific files
src/contexts/SketchContext.tsx SRP

# Ignore barrel violations in test utilities
src/test-utils/** BARREL
```

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
| `CODING_GUIDELINES.md` | All agents + humans | Architecture, import rules, SOLID principles, business logic placement, verification checklist |
| `CLAUDE.md` | Claude Code, Claude in IDEs | Points to CODING_GUIDELINES.md + quick reference |
| `.cursorrules` | Cursor AI | Points to CODING_GUIDELINES.md |
| `.windsurfrules` | Windsurf AI | Points to CODING_GUIDELINES.md |
| `AGENTS.md` | OpenAI Codex | Points to CODING_GUIDELINES.md |
| `.cursorignore` | Cursor AI | Keeps build artifacts, secrets, and noise out of AI context |
| `architecture.md` | All agents + humans | Mermaid dependency diagram (via `--diagram` flag) |

The key insight: **CODING_GUIDELINES.md is the single source of truth**. All agent-specific files simply point to it. This eliminates drift between agents and keeps maintenance to one file. The generated guidelines include SOLID principles tailored to your framework.

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
    "typecheck": "npx tsc --noEmit",
    "lint": "npx eslint src/",
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
  }
}
```

Edit this file directly or re-run `goodbot init` to regenerate it.

---

## Supported Frameworks

goodbot auto-detects your stack and tailors the generated guidelines accordingly:

| Framework | Detection | Red flags included |
|-----------|-----------|-------------------|
| Angular | `package.json → @angular/core` | Logic in components, direct HTTP in components, missing DI |
| React | `package.json → react` | Business logic in components, fetch in useEffect |
| React Native | `package.json → react-native` | AsyncStorage misuse, fetch in screens |
| Next.js | `package.json → next` | Secrets in client code, missing caching |
| Express | `package.json → express` | Logic in route handlers, missing validation |
| NestJS | `package.json → @nestjs/core` | Logic in controllers, missing DTOs |
| Django | `requirements.txt → django` | Logic in views, querysets in templates |
| Flask | `requirements.txt → flask` | Logic in routes, missing validation |
| FastAPI | `requirements.txt → fastapi` | Logic in endpoints, missing Pydantic models |
| Go | `go.mod` | Logic in handlers, missing error wrapping |
| Node.js | `package.json` (fallback) | Logic in route handlers |

---

## Team Features

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

The PR comment includes health grade with emoji bars, violation counts, and collapsible details — and updates itself on each push.

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

Merges team rules with local project identity — your project name and verification commands stay local, architecture rules come from the team.

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

The guide includes project overview, module descriptions, import conventions, business logic rules, verification commands, and current health status.

### Custom Rules

Define team-specific rules in `.goodbot/config.json`:

```json
{
  "customRulesConfig": [
    {
      "name": "no-api-in-components",
      "description": "Components must not import from api layer directly",
      "pattern": "\\.\\./(api|services/.*Service)",
      "forbidden_in": ["src/components/**"],
      "severity": "error"
    },
    {
      "name": "max-hook-deps",
      "description": "Hooks should not import from more than 3 modules",
      "pattern": "\\.\\./(.*)",
      "forbidden_in": ["src/hooks/**"],
      "max_imports": 3,
      "severity": "warning"
    }
  ]
}
```

Custom rules are checked during `goodbot analyze` and appear alongside SOLID violations.

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

### Free Tier

| Command | Description |
|---------|-------------|
| `goodbot init` | Interactive project setup (or `--preset strict\|recommended\|relaxed`) |
| `goodbot generate` | Generate AI agent guardrail files (`--analyze` for adaptive guardrails) |
| `goodbot check` | Detect drift in generated files + snapshot age |
| `goodbot freshness` | Compare guardrail claims against current codebase reality |
| `goodbot hooks` | Install/uninstall git hooks for automatic freshness checks |
| `goodbot scan` | Quick project structure detection (framework, layers, commands) |
| `goodbot scan --analyze` | Scan + condensed health grade and architecture summary |
| `goodbot analyze` | Full architecture + SOLID analysis with detailed health grade |
| `goodbot diff` | Analyze only changed files vs base branch |
| `goodbot watch` | Continuous live monitoring dashboard |
| `goodbot fix` | Auto-fix violations (missing barrels, split markers) |
| `goodbot score` | One-line health grade (for scripts and git hooks) |
| `goodbot pr` | Generate PR description with architectural impact |

### Team Tier

| Command | Description |
|---------|-------------|
| `goodbot ci` | CI/CD analysis with PR comment output |
| `goodbot trend` | Track health score over time |
| `goodbot sync` | Sync shared team config across repos |
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

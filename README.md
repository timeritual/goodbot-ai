
<p align="center">
  <img src="https://img.shields.io/npm/v/goodbot-ai?style=flat-square&color=22c55e" alt="npm version" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-22c55e?style=flat-square" alt="node version" />
  <img src="https://img.shields.io/npm/l/goodbot-ai?style=flat-square&color=22c55e" alt="license" />
  <img src="https://img.shields.io/badge/AI_agents-Claude%20%7C%20Cursor%20%7C%20Windsurf%20%7C%20Codex%20%7C%20Copilot-22c55e?style=flat-square" alt="supported agents" />
</p>

<h1 align="center">goodbot</h1>

<p align="center">
  <strong>Train your AI to be a good bot.</strong><br/>
  Auto-generate guardrail files that keep AI coding agents aligned with your project's conventions.
</p>

<p align="center">
  <code>npx goodbot-ai init</code>
</p>

---

## The Problem

AI coding agents (Claude, Cursor, Copilot, Windsurf, Codex) are powerful — but they don't know your project's rules. Without guardrails, they will:

- **Break your architecture** — import from internal files instead of barrels, mix business logic into UI components, bypass your layer boundaries
- **Ignore your conventions** — wrong naming, wrong patterns, wrong file locations
- **Introduce regressions** — skip your verification checklist, miss type checks, forget to run tests
- **Drift across agents** — your Claude instructions say one thing, your Cursor rules say another, and your Codex config says nothing at all

Every team using AI agents ends up writing the same boilerplate: `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `AGENTS.md`, `CODING_GUIDELINES.md`... manually, inconsistently, and then forgetting to update them when the project evolves.

## The Solution

**goodbot** scans your codebase, detects your framework, language, architecture, and conventions — then generates a complete set of AI agent guardrail files from a single source of truth.

```
$ goodbot scan

✔ Scan complete

Project Analysis
─────────────────────────────────────────────
  Project            my-app
  Framework          react-native (package.json → "react-native")
  Confidence         high
  Language           typescript
  Src root           src
  Barrel files       yes
  Interface files    yes

Detected Layers
─────────────────────────────────────────────
  L0 types              src/types            barrel
  L1 utils              src/utils            barrel
  L3 api                src/api              barrel, interfaces
  L4 services           src/services         barrel, interfaces
  L6 hooks              src/hooks            barrel, interfaces
  L7 components         src/components       barrel
  L8 screens            src/screens          no barrel
```

One command generates all your agent files. One config keeps them in sync. One check catches drift.

---

## Quick Start

```bash
# Initialize goodbot in your project
npx goodbot-ai init

# Generate all agent guardrail files
npx goodbot-ai generate

# Check for drift
npx goodbot-ai check
```

Or install globally:

```bash
npm install -g goodbot-ai
goodbot init
```

---

## Commands

### `goodbot init`

Interactive setup that scans your project and walks you through configuration.

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

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview what would be generated without writing |
| `--force` | Overwrite existing files without prompting |

### `goodbot check`

Detects when generated files have been manually edited or gone missing. Returns exit code 1 on drift — perfect for CI.

```
$ goodbot check

  CODING_GUIDELINES.md          ✓ in sync
  CLAUDE.md                     ✓ in sync
  .cursorrules                  ✗ drifted (manually edited)
  .windsurfrules                ✓ in sync
  AGENTS.md                     ✓ in sync
  .cursorignore                 ✗ missing

⚠ 2 issues found. Run `goodbot generate --force` to regenerate.
```

### `goodbot scan`

Read-only analysis of your project. No files created, no config needed — just run it and see what goodbot detects.

```bash
goodbot scan
goodbot scan --path /path/to/other/project
goodbot scan --analyze    # Include dependency analysis summary
```

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

Module Stability
──────────────────────────────────────────────────
  Module                 Ca   Ce  Instability
  constants               5    0  0.00 ██████████
  types                  11    0  0.00 ██████████
  utils                   8    1  0.11 █████████░
  services                4    4  0.50 █████░░░░░
  screens                 1   11  0.92 █░░░░░░░░░

SOLID Analysis
──────────────────────────────────────────────────
  SRP (Single Responsibility)      ████████░░ 75
  DIP (Dependency Inversion)       ██████████ 100
  ISP (Interface Segregation)      ██████████ 99

  ✗ [SRP] File has 999 lines (threshold: 300)
    src/components/Canvas/layers/AngleProtractorDisplay.tsx
    → Split into smaller, focused modules
```

**What it checks:**

| Analysis | What it does |
|----------|-------------|
| **Health Grade (A+ to F)** | Single score combining all metrics — the thing you screenshot and share |
| **SOLID Principles** | SRP (file size, mixed concerns), DIP (concrete vs abstract imports), ISP (barrel bloat) |
| **Stability Metrics** | Afferent/efferent coupling and instability per module |
| **Stable Dependency Principle** | Flags stable modules depending on unstable ones |
| **Circular Dependencies** | Tarjan's SCC algorithm |
| **Layer Violations** | Validates downward-only import flow |
| **Barrel Violations** | Detects imports bypassing barrel files |

| Flag | Description |
|------|-------------|
| `--json` | Output full analysis as JSON for programmatic consumption |
| `--diagram` | Generate `architecture.md` with mermaid dependency graph |
| `--path <path>` | Analyze a specific project directory |

### `goodbot diff`

Analyze only changed files. Shows violations introduced by your current branch — perfect for PR reviews and CI.

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

Shows new and resolved violations in real-time as you code.

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

Generate a visual architecture diagram that renders on GitHub:

```bash
goodbot analyze --diagram
```

Creates `architecture.md` with a mermaid graph showing module dependencies, color-coded by stability (green = stable, yellow = moderate, red = unstable).

---

## What Gets Generated

| File | Who reads it | Purpose |
|------|-------------|---------|
| `CODING_GUIDELINES.md` | All agents + humans | The source of truth — architecture, import rules, business logic placement, verification checklist, code style |
| `CLAUDE.md` | Claude Code, Claude in IDEs | Points to CODING_GUIDELINES.md + quick reference |
| `.cursorrules` | Cursor AI | Points to CODING_GUIDELINES.md |
| `.windsurfrules` | Windsurf AI | Points to CODING_GUIDELINES.md |
| `AGENTS.md` | OpenAI Codex | Points to CODING_GUIDELINES.md |
| `.cursorignore` | Cursor AI | Keeps build artifacts, secrets, and noise out of AI context |

The key insight: **CODING_GUIDELINES.md is the single source of truth**. All agent-specific files simply point to it. This eliminates drift between agents and keeps maintenance to one file.

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

## CI Integration

```yaml
# GitHub Actions
- name: Check AI guardrails
  run: npx goodbot-ai check

- name: Analyze changed files
  run: npx goodbot-ai diff --base ${{ github.event.pull_request.base.ref }}

- name: Full architecture analysis
  run: npx goodbot-ai analyze --json > analysis.json
```

All commands return exit code 1 on violations — fail the build and keep your AI agents honest.

---

## Why "goodbot"?

Because AI coding agents are like eager interns — incredibly fast, surprisingly capable, but they need clear rules to follow. **goodbot** is obedience training for your AI. Set the rules once, enforce them everywhere, and your AI becomes a good bot.

---

## Contributing

```bash
git clone https://github.com/protocoding/goodbot-ai.git
cd goodbot-ai
npm install
npx tsx src/index.ts --help    # Run in dev mode
```

---

## License

MIT

<p align="center">
  <sub>Built by <a href="https://github.com/protocoding">protocoding</a></sub>
</p>

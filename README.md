
<p align="center">
  <img src="https://img.shields.io/npm/v/goodbot-ai?style=flat-square&color=22c55e" alt="npm version" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-22c55e?style=flat-square" alt="node version" />
  <img src="https://img.shields.io/npm/l/goodbot-ai?style=flat-square&color=22c55e" alt="license" />
  <img src="https://img.shields.io/badge/AI_agents-Claude%20%7C%20Cursor%20%7C%20Windsurf%20%7C%20Codex%20%7C%20Copilot-22c55e?style=flat-square" alt="supported agents" />
</p>

<h1 align="center">goodbot</h1>

<p align="center">
  <strong>Train your AI to be a good bot.</strong><br/>
  Auto-generate guardrail files that keep Claude, Cursor, Windsurf, Codex and Copilot aligned with your project's conventions — then detect when they go stale.
</p>

<p align="center">
  <code>npx goodbot-ai init && npx goodbot-ai generate</code>
</p>

---

## Why goodbot

AI agents are powerful but they don't know your rules. Without guardrails, they create god files, mix business logic into UI components, bypass your layer boundaries, and drift across agents (your `CLAUDE.md` says one thing, your `.cursorrules` says another).

**goodbot solves three problems:**

1. **Generate once, use everywhere.** One source of truth → `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `AGENTS.md`, `CODING_GUIDELINES.md`.
2. **Make the rules adaptive.** Scans your actual codebase for framework conventions, architectural layers, and real violations — so guardrails match your code, not a generic template.
3. **Detect when they go stale.** As your codebase evolves, goodbot tracks drift between what the guardrails claim and what the code actually looks like.

---

## Install & run (60 seconds)

```bash
npx goodbot-ai init              # interactive, or add --preset recommended
npx goodbot-ai generate          # writes CLAUDE.md, CODING_GUIDELINES.md, etc.
```

That's it. On first run goodbot scans your project, runs an architectural analysis, detects your framework's conventions (e.g. NestJS modules, React hooks), and generates guardrail files tailored to what it found. It saves an analysis snapshot so future runs can show you what's changed.

Skip the prompts with a preset (safe for CI):

```bash
npx goodbot-ai init --preset recommended --on-conflict merge
```

| Preset | What you get |
|--------|-------------|
| `strict` | Barrel imports enforced, interface contracts, all agent files, tight thresholds |
| `recommended` | Balanced defaults — barrel imports recommended, all agent files |
| `relaxed` | Minimal guardrails — just the basic generated files |

Run `goodbot presets` to see a side-by-side comparison.

---

## The goodbot lifecycle

goodbot is designed to fit into your team's workflow at four moments:

### 1. Day 1 — Onboard the codebase

```bash
npx goodbot-ai init --preset recommended
npx goodbot-ai generate
git add CLAUDE.md CODING_GUIDELINES.md .cursorrules .windsurfrules AGENTS.md .cursorignore .goodbot/config.json .goodbot/.gitignore
git commit -m "Add AI agent guardrails"
```

goodbot detects whether you're building an API, a UI, a full-stack app, or a library, and applies the right **stability ordering** (Stable Dependency Principle) for that system type. For a NestJS API: controllers depend on services depend on repositories depend on domain. For a React app: screens depend on hooks depend on services depend on types.

Your team's AI agents now have a shared understanding of:
- Which layers exist and their ordering
- Where business logic belongs vs where it doesn't
- Framework-specific red flags (e.g. "business logic in NestJS controllers")
- SOLID and design principles framed for your specific framework
- Current architectural health (grade + top issues)

> **Safe re-runs:** if CLAUDE.md (or any agent file) already exists, goodbot wraps its content in `<!-- goodbot:start/end -->` markers and prepends at the top — your team notes below are preserved.

### 2. Day 2+ — AI agents stay aligned

No action needed. Your agents read the generated files automatically. If you tweak a rule (e.g. add a line to `conventions.customRules` in `.goodbot/config.json`), re-run `generate`:

```bash
npx goodbot-ai generate    # fast — reuses cached snapshot
```

Quick re-runs reuse the last analysis snapshot so the Current Health block still renders without a full scan. Pass `--analyze` to refresh the analysis:

```bash
npx goodbot-ai generate --analyze
```

### 3. On every PR — catch drift in CI

Install git hooks locally, add a CI step, and goodbot catches new violations before they merge:

```bash
# Local — once per dev machine
npx goodbot-ai hooks install
```

```yaml
# .github/workflows/goodbot.yml
on: [pull_request]
jobs:
  guardrails:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx goodbot-ai check           # drift in generated files
      - run: npx goodbot-ai freshness       # health claims still accurate?
      - run: npx goodbot-ai diff --freshness # did THIS PR move the grade?
```

Or use the official GitHub Action for PR comments with emoji bars:

```yaml
- uses: timeritual/goodbot-ai@main
  with:
    mode: diff
    comment: 'true'
    fail-on-grade: C
```

### 4. Periodically — audit and refresh

Once a month (or when the analysis snapshot is 7+ days old), run:

```bash
npx goodbot-ai freshness     # what's stale? what's degraded?
npx goodbot-ai generate --analyze --force   # refresh guardrails
```

`freshness` compares the snapshot goodbot saved at generation time against the current state of the codebase — and tells you exactly which claims have drifted:

```
Guardrail Freshness Report (generated 12 days ago)
───────────────────────────────────────────────────────
  Health grade             A → B+    ⚠ stale
  Circular dependencies    0 → 2     ✗ degraded (+2)
  Dead exports             0 → 3     ✗ degraded (+3)
  Barrel violations        5 → 3     ↑ improved (-2)

✗ Your guardrails are stale. Run `goodbot generate --analyze --force` to update.
```

### 5. When things change — re-init safely

Framework upgrade? Added a new top-level directory? Run `init` again:

```bash
npx goodbot-ai init --preset recommended
```

**Your customizations are preserved.** goodbot refreshes only the scan-detected fields (framework, layers, system type) and keeps everything you've hand-edited (verification commands with custom flags, custom rules, suppressions, thresholds, budgets). A diff of what changed prints before the save. Pass `--force` only if you want to blow everything away.

---

## What gets generated

| File | Read by | Contents |
|------|---------|----------|
| `CODING_GUIDELINES.md` | **All agents + humans** | Single source of truth — architecture diagram, SOLID + design principles, business logic rules, detected framework conventions, "Known Issues" list, verification checklist |
| `CLAUDE.md` | Claude Code, Claude in IDEs | Quick reference + current health snapshot, points to `CODING_GUIDELINES.md` |
| `.cursorrules` / `.windsurfrules` / `AGENTS.md` | Cursor / Windsurf / Codex | Point to `CODING_GUIDELINES.md` — eliminates cross-agent drift |
| `.cursorignore` | Cursor | Keeps build artifacts, secrets, noise out of AI context |

Plus internal state in `.goodbot/`:

| File | Commit? |
|------|---------|
| `.goodbot/config.json` | **Yes** — your shared team config |
| `.goodbot/.gitignore` | **Yes** — auto-created, ignores the rest |
| `.goodbot/snapshot.json`, `checksums.json`, `history.json` | No — local analysis state |

---

## Essential commands

| Command | What it does |
|---------|--------------|
| `goodbot init` | Set up `.goodbot/config.json`. Merges into existing config by default (preserves customizations); `--force` overwrites. |
| `goodbot generate` | Write/refresh the guardrail files. Safe to re-run — preserves user content via markers. |
| `goodbot check` | Verify generated files haven't drifted. CI-friendly (exit 1 on drift). |
| `goodbot freshness` | Compare snapshot claims to current reality. Tells you what's stale. |
| `goodbot analyze` | Full architectural audit — dependency graph, SOLID, layer violations, health grade. |
| `goodbot diff` | Show violations introduced by the current branch (vs base). Great for PR review. |
| `goodbot hooks install` | Install git hooks that warn on stale guardrails. |
| `goodbot suppress` | List detected violations with IDs; emit paste-ready suppression JSON. `--apply` writes to config. |
| `goodbot score` | One-line health grade. Fast enough for pre-commit hooks. |
| `goodbot presets` | Side-by-side comparison of the strict/recommended/relaxed presets. |

Run any command with `--help` for full flags. Other commands available but less frequently used: `scan`, `watch`, `fix`, `pr`, `onboard`, `trend`, `sync`, `report`, `ci`.

---

## Framework support

goodbot auto-detects your framework and applies a canonical layer ordering + framework-specific conventions.

| Framework | System type | Canonical layers |
|-----------|-------------|------------------|
| React / React Native | UI | types → utils → api → services → state → hooks → components → screens → navigation |
| Angular | UI | types → services → pipes → directives → interceptors → guards → components → NgModules → pages |
| Vue | UI | types → services → stores → composables → plugins → components → layouts → pages → router |
| Next.js / Nuxt | Mixed | Combines API and UI layers — server routes at low level, pages at top |
| NestJS | API | domain → config → repositories → infrastructure → services → modules → cross-cutting → controllers |
| Express / Node | API | domain → config → services → routes/middleware → controllers |

Plus reasonable defaults for Django, Flask, FastAPI, and Go (framework detection works; deep analysis is TypeScript/JavaScript only for now).

For NestJS specifically, goodbot also detects decorator-based patterns (`*.controller.ts`, `*.module.ts`, `*.entity.ts`, guards, interceptors, pipes) and surfaces them in `CODING_GUIDELINES.md` so agents follow your project's real conventions.

Unknown framework? goodbot treats it as a library and still produces sensible guardrails.

---

## Configuration

All config lives in `.goodbot/config.json`. It's meant to be committed and shared across the team. The key sections:

```jsonc
{
  "project":       { "name": "...", "framework": "...", "language": "..." },
  "architecture":  { "systemType": "api", "layers": [...], "barrelImportRule": "recommended" },
  "businessLogic": { "allowedIn": ["services"], "forbiddenIn": ["controllers", "guards"] },
  "verification":  { "typecheck": "npm run typecheck", "lint": "npm run lint", "test": "npm test" },
  "conventions":   { "mainBranch": "main", "customRules": ["Project-specific rule"] },
  "analysis":      {
    "thresholds":   { "maxFileLines": 300, "maxBarrelExports": 15 },
    "budget":       { "circular": 0, "srp": 10 },
    "ignore":       { "circularDeps": ["**/entities/**"] },
    "suppressions": [{ "rule": "layerViolation", "file": "src/scripts/migrate.ts", "reason": "..." }]
  }
}
```

Edit directly or re-run `goodbot init` to regenerate (merges by default, preserves your edits).

---

## Managing violations

Four knobs, pick based on intent:

| Knob | Scope | When to use |
|------|-------|-------------|
| `analysis.suppressions` | Exact file/cycle + rule + **required reason** | You accept this specific violation intentionally. Shows as `(N suppressed)` in output. |
| `analysis.ignore.*` | Glob pattern per check category | Well-known false positives (TypeORM entity cycles, generated code). Doesn't appear at all. |
| `.goodbot/ignore` | File paths → all checks | Legacy / vendored code you never want analyzed. |
| Violation budgets | Per-category threshold | Known debt you want visible but not failing CI until it grows past a limit. |

`ignore.paths` in config only affects `.cursorignore` output — it does NOT suppress analysis. Use one of the four knobs above.

**Use `goodbot suppress` to add suppressions safely.** It lists detected violations with IDs and emits the correct JSON to paste (or apply directly with `--apply`). This avoids typos in cycle patterns and Unicode characters. Goodbot also warns loudly about any suppression that matches no detected violation — so typos / stale entries can't silently disable guardrails.

---

## What's new in 0.9

- **Orphaned-suppression warnings.** Suppressions that match no detected violation (typo in cycle pattern, renamed/deleted file, already-fixed bug) are flagged loudly on every `analyze` and `generate`. No more silently-dead suppressions lurking in config.
- **`goodbot suppress` command.** Lists suppressible violations with stable IDs (`c0`, `l2`, `sh1`, etc.) and emits paste-ready JSON. `goodbot suppress c0 --reason "..." --apply` writes to config for you. No need to hand-type the Unicode `↔` character anymore.
- **Broader cycle syntax.** `analysis.suppressions[*].cycle` now accepts all common forms: `a → b`, `a ↔ b`, `a -> b`, `a <-> b`, `a,b`, `a > b`, and the human-natural loop form `a → b → a`. All normalize to the same canonical cycle.

## What's new in 0.8

- **Re-init preserves customizations.** `goodbot init --preset recommended` no longer clobbers hand-edited fields. Refreshes scan-detected fields (framework, layers), preserves everything else. `--force` for full overwrite.
- **Per-rule suppressions with reasons.** Accept a specific violation intentionally via `analysis.suppressions`. Each entry needs a `rule + file` (or `rule + cycle`) and a `reason`. Shows as `(N suppressed)` in output.
- **Next-step prompts.** After `init` and `generate`, the CLI surfaces the highest-value next actions (generate, install hooks, check freshness, add to CI) instead of a single-line hint.
- **Cached snapshot reuse.** Quick `generate` re-runs render the Current Health block from the last snapshot without re-scanning — pass `--analyze` to refresh.

---

## Supported agents

Works with anything that reads one of the standard guardrail files:

- **Claude Code, Claude in Cursor / VS Code / IDE extensions** — via `CLAUDE.md`
- **Cursor** — via `.cursorrules` + `.cursorignore`
- **Windsurf** — via `.windsurfrules`
- **OpenAI Codex** — via `AGENTS.md`
- **GitHub Copilot / any other agent** — via `CODING_GUIDELINES.md` (the single source of truth all other files point to)

---

## Why "goodbot"?

AI coding agents are like eager interns — fast, capable, and in desperate need of clear rules. **goodbot** is obedience training for your AI: set the rules once, enforce them everywhere, catch drift before it ships.

---

## Contributing

```bash
git clone https://github.com/timeritual/goodbot-ai.git
cd goodbot-ai
npm install
npx tsx src/index.ts --help    # run in dev mode
```

Issues and PRs welcome.

---

## License

MIT

<p align="center">
  <sub>Built by <a href="https://github.com/timeritual">timeritual</a></sub>
</p>

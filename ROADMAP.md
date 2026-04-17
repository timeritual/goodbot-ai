# Goodbot Roadmap

## Vision

Goodbot keeps AI guardrails honest as codebases evolve. In multi-developer AI-assisted codebases, guardrail files go stale almost immediately — a rule written in week 1 doesn't reflect week 3 patterns. Goodbot's job is to detect that drift and surface it before it causes damage.

---

## Shipped (v0.3.x)

### Core Analysis
- Health grading (A+ to F) with weighted scoring across dependencies, stability, SOLID, architecture
- Circular dependency detection (Tarjan's algorithm)
- Layer violation checking (downward-only dependency enforcement)
- Barrel import violation detection
- Stable Dependency Principle (SDP) analysis
- SOLID principles: SRP, DIP, ISP checking
- Complexity, duplication, dead export, god module, shallow module detection
- Git history analysis: hotspots, AI commit detection, temporal coupling
- Custom rules shown as their own category (separate from SOLID violations)
- Violation budget system — set acceptable limits per category, fail only when exceeded

### Guardrail Generation
- 6 agent files from single config (CLAUDE.md, CODING_GUIDELINES.md, .cursorrules, .windsurfrules, AGENTS.md, .cursorignore)
- Adaptive guardrails (`generate --analyze`) — rules reflect actual codebase state
- Framework-specific red flags (React, Next.js, Node, etc.)

### Freshness Detection
- Analysis snapshots saved at generation time (`.goodbot/snapshot.json`)
- `freshness` command compares stored claims vs current reality
- `freshness --watch` for continuous monitoring with configurable interval
- 16 claim categories tracked: health, violations, file lists, AI ratio, custom rules
- Guardrail impact via `diff --freshness` (opt-in to avoid slow git history on every diff)
- Freshness data in CI/PR comments
- Snapshot age warnings in `check`

### Auto-Fix (`goodbot fix`)
- Rewrite barrel-bypassing imports to use barrel files
- Remove dead exports from barrel files
- Generate missing barrel files
- Sort barrel exports alphabetically
- Add split markers to oversized files (SRP)
- Generate missing `.cursorignore`
- `--only <type>` flag to run specific fix types

### Workflow Integration
- Git hooks (`hooks install/uninstall`) — post-merge check, pre-push freshness
- GitHub Action for automated PR comments with grade + freshness + budget
- `trend --record` with per-category violation tracking
- `trend --effectiveness` — which rule categories are improving or worsening
- `watch` auto re-scans on directory structure changes (new modules, renamed dirs)
- `sync` validates remote configs via Zod schema, HTTPS-only, shows change diff
- `onboard` generates data-driven module descriptions from analysis (not hardcoded)
- `score` checks violation budgets in addition to grade threshold

### Tooling
- ESLint with TypeScript support
- Prepublish validation (typecheck + lint + test + build)
- 161 tests across 18 test files (analyzers, freshness, commands)

---

## Next Up

### Python Import Parser
**Problem:** Deep analysis (import graphs, SOLID, cycles, complexity, duplication, dead exports, health grading) is TS/JS only. Python projects get framework detection and guardrail generation, but no adaptive guardrails powered by live analysis.

**Approach:**
- Build a Python import parser (`import X`, `from X import Y`, relative imports)
- Python imports are simpler than TS — no barrel files, no `index.ts` convention
- Reuse existing graph builder, stability, cycle detection — they're language-agnostic once imports are parsed
- Start with import graph + SRP (file size) + dead exports. Skip ISP/DIP initially (different patterns in Python)
- Framework detection for Django/Flask/FastAPI already exists — wire the parser into the analysis pipeline

**Priority:** High — Python is the most-requested non-JS language for AI-assisted codebases.

### CLI Integration Tests
**Problem:** The 161 tests cover analyzers, freshness, and command pure functions — but no test exercises the full CLI flow (init -> generate -> analyze -> diff). A regression in command wiring or argument parsing wouldn't be caught.

**Approach:**
- Create a temp project fixture with a known structure (few TS files, known violations)
- Test the full pipeline: `init --preset recommended` -> `generate` -> `analyze --json` -> verify JSON output
- Test `fix --dry-run` output matches expected fixes
- Test `diff` with a synthetic git history
- Use `execSync` to run the CLI as a subprocess, or import command actions directly
- Keep it fast — one fixture project, ~5 integration tests

**Scope:** Small — a few hours of work. High confidence gain for low effort.

### Pattern Emergence Detection
**Problem:** When 8 out of 10 files in a module start using a new pattern (new error handling approach, new naming convention), goodbot doesn't notice. It can detect violations of declared rules, but can't detect new conventions that have emerged organically.

**Approach:**
- Analyze multiple snapshots over time to detect consistent changes
- When a violation count in a category consistently decreases without rule changes, the codebase may have self-corrected — suggest removing the rule
- When a new pattern appears across multiple files (detected via AST analysis or import pattern clustering), suggest adding it as a rule
- Requires: accumulated snapshot history from `trend --record` runs (the data pipeline already exists)

**Prerequisite:** Real-world usage data from the week-long test plan. Need to see what actual drift looks like before building detection heuristics.

### Per-PR Delta Framing
**Problem:** `diff` currently says "your PR has 3 SRP violations." A more useful output would be "your PR introduces a new utility pattern in `src/lib/` that the current guidelines don't cover" — framing what the PR *teaches* the codebase, not just what it breaks.

**Approach:**
- Compare the PR's import graph against the existing module graph
- Detect new cross-module dependencies that didn't exist before
- Detect new files in directories that previously had a consistent pattern
- Surface as "This PR establishes: [new pattern]" alongside the violation list
- This is a different lens than violations — it's about evolution, not breakage

### Agent Violation Feedback Loop
**Problem:** When an AI agent violates a guardrail rule, that violation is signal about rule clarity. A rule violated 12 times in the last 20 AI commits is either unclear or wrong. But we don't track this.

**Approach:**
- Extend `trend --record` to correlate violations with AI vs human commits (data already exists in git history analysis)
- New view: `trend --agent-feedback` showing which rules AI agents break most
- Use violation-per-AI-commit rate as a "rule clarity score"
- Rules with high AI violation rates get flagged: "Consider rewording this guardrail — AI agents aren't following it"
- Requires: enough AI commits in the history to be statistically meaningful

### Automatic Incremental Regeneration
**Problem:** Regeneration is all-or-nothing (`generate --analyze --force`). When only one claim has drifted, rewriting all 6 files is heavy-handed.

**Approach:**
- Parse generated files into sections (each Handlebars `{{#if}}` block is a logical section)
- When freshness detects drift in a specific category, regenerate only that section
- `goodbot freshen` (or `generate --incremental`) updates stale sections in place
- Harder than it sounds — template sections aren't cleanly separable. May need to restructure templates with clear section markers.

**Defer until:** Freshness detection is validated in real usage. If teams just run `generate --analyze --force` weekly and it's fine, incremental isn't worth building.

---

## Future Explorations

### Multi-Language Support
Currently TS/JS only for import parsing and SOLID analysis. Python support is partially scaffolded (framework detection works, but no import graph analysis). Go is detected but not analyzed.

**Priority:** Depends on user demand. The guardrail generation and freshness features work for any language — it's the deep analysis (import graphs, SOLID) that's language-specific.

### Config-as-Code for Rules
Move beyond freeform `customRules` strings to structured, validatable rules. The `customRulesConfig` field already supports pattern-based rules with `forbiddenIn`/`requiredIn`. Extend this to:
- Import pattern rules ("services must not import from components")
- File naming rules ("hooks must start with `use`")
- Dependency rules ("no direct `fetch` in components")

These could be validated against actual code, unlike freeform text rules.

### Team Dashboard
`report` currently runs analysis across multiple repos locally. A hosted version could:
- Aggregate trend data across repos
- Show team-wide rule effectiveness
- Alert on cross-repo guardrail drift
- Correlate AI activity with architecture health

This is a product expansion, not a feature — would need a backend service.

### IDE Integration
VS Code / JetBrains extensions that surface freshness and violations inline. The analysis is already fast enough (<1s for most projects). An extension could:
- Show health grade in the status bar
- Highlight files with violations
- Warn when editing a hotspot file
- Show freshness status

---

## Decisions to Make After Test Week

1. **Regeneration cadence** — Should goodbot auto-regenerate on `trend --record`? Or is manual regeneration the right default?
2. **Hook behavior** — Advisory (warn) vs blocking (exit 1)? Should this be configurable per-hook?
3. **Scoring calibration** — Is the D grade for a 95-file project with 17 duplication clusters fair? Or does the scoring penalize too heavily?
4. **Snapshot storage** — Should snapshots be committed to git (so CI can compare) or gitignored (local-only)?
5. **Freshness threshold** — 7-day snapshot age warning — is that too aggressive? Too lenient?

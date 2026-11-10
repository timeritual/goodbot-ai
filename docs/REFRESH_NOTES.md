# Identity Refresh Notes

Summary of the docs-only pass that reframed goodbot from "a CLI that generates guardrail
files" to "a software immune system for your codebase," done on branch
`docs/immune-identity-refresh`. No behavior, command names, or config file names changed —
`npm run typecheck`, `npm run lint`, and `npm test` (293 tests) all pass unmodified on this
branch, same as on `main`.

## What changed, per file

- **`README.md`** — Replaced the "Train your AI to be a good bot" / "auto-generate guardrail
  files" opening and the "Why goodbot" (three-problems) section with: a one-liner + problem
  statement (the trust bottleneck moving to AI-written code, guidelines/gates drifting apart
  when hand-maintained), and a new **"What it does today"** section organized around
  shape-what-gets-written / verify-what-got-written / keep-exceptions-honest. All existing
  accurate technical content (5-agent parity, system-type detection, framework-aware role
  sets, re-init preservation, drift detection, layer-violation analysis, suppression
  lifecycle) was kept — reorganized into that three-part structure, not deleted. Renamed
  "Install & run (60 seconds)" to "Quick start" (content unchanged). Added two new sections
  near the end: **"Where this is going"** (roadmap summary, explicitly marked, linking to
  `docs/EVOLUTION.md`, stating the safety invariant) and **"Scope & honesty note"**. Left the
  lifecycle, what-gets-generated, essential-commands, framework-support, configuration,
  managing-violations, changelog ("What's new in 0.x"), supported-agents, and troubleshooting
  sections in place and in order — they were already accurate and framework-agnostic. Lightly
  touched the "Why 'goodbot'?" section to bridge it to the new framing instead of leaving it
  as a disconnected leftover, and fixed a pre-existing off-by-one ("four moments" → "five
  moments" — the lifecycle section has always had five numbered steps). Updated "Two docs to
  orient" → "Three docs to orient" in Contributing to include `docs/EVOLUTION.md`.

- **`docs/EVOLUTION.md`** (new) — The phased roadmap: Phase 0 Consolidation, Phase 1
  Adjudication loop, Phase 2 Incident → antibody, Phase 3 Self-tuning, Phase 4 Germline, each
  3-5 sentences, ending with the safety invariant and the "biology can't write acquired
  adaptations back into its genome" line. Opens with an explicit "this entire document is
  roadmap, not shipped behavior" status line.

- **`HOW_IT_WORKS.md`** — Added a new "The immune framing" section right after the intro
  paragraph, before "The one-sentence version": the vocabulary mapping table (canonical
  source → genome, drift detection → innate sensor, suppression lifecycle → proto-ratchet,
  re-init preservation → proto-adjudication), explicitly stating it's a framing layer over the
  same mechanisms described in the rest of the document, with a link to
  `docs/EVOLUTION.md` for the unshipped parts. No other restructuring.

- **`ARCHITECTURE.md`** — Same treatment: a new "The immune framing" section right after the
  title, before "Overview," with the same vocabulary table and an explicit note that the
  forward-looking parts of the framing aren't part of this architecture. No other
  restructuring.

- **`ROADMAP.md`** — Added a one-line scope note at the top distinguishing it (near-term
  feature roadmap, by version) from `docs/EVOLUTION.md` (long-term immune-system vision), so
  the two roadmap documents don't read as competing. No other changes — its "Shipped (v0.3.x)"
  section header is stale relative to the current 0.13.0 version, but that's a pre-existing
  accuracy issue unrelated to this task; see open questions below.

- **`package.json`** — `description` changed to one sentence from the new identity. Added
  `immune-system`, `code-quality`, `drift-detection`, `ai-guardrails`,
  `architecture-enforcement` to `keywords`, keeping all existing ones. No version bump, no
  dependency changes.

- **`src/index.ts`** — Updated the top-level Commander `.description()` string (shows in
  `goodbot --help`) to match the new one-liner. Verified no test asserts on the old string.
  Left every subcommand's `.description()` untouched — they're accurate, purely technical
  descriptions of what each command does (e.g. "Check if generated files are in sync with
  your config") and don't contradict the new framing.

## Old-identity phrases found, and what happened to them

- README tagline "Train your AI to be a good bot" / "Auto-generate guardrail files that keep
  Claude, Cursor, Windsurf, Codex and Copilot aligned" — replaced with the immune-system
  one-liner.
- README "Why goodbot" → "goodbot solves three problems: generate once / make rules adaptive /
  detect when they go stale" — folded into "What it does today," reframed as
  shape/verify/keep-exceptions-honest (the third item, suppression lifecycle, didn't have a
  home in the old three-problems list at all — it's new structure, not new content, since the
  suppression commands already existed).
- `package.json` description "Auto-generate AI agent guardrail files for your project. Train
  your AI to be a good bot." — replaced.
- `src/index.ts` CLI `--help` top-line description "Auto-generate AI agent guardrail files for
  your project" — replaced.
- README "Why 'goodbot'?" section ("obedience training for your AI") — this is name etymology,
  not a product description, so it wasn't false under the new identity, but it was a leftover
  of the old mental model sitting disconnected at the bottom of the file. Added one bridging
  sentence rather than rewriting it, since the task asked to preserve accurate content and
  this is still an accurate (if narrower) way to explain the name.

## What I deliberately skipped, and why

- **No separate troubleshooting guide exists.** The task mentioned "the troubleshooting
  guide" as a file to inventory; the only troubleshooting content in the repo is the
  `## Troubleshooting` section inside `README.md`, which was already covered by the README
  rewrite (left in place, untouched beyond the surrounding reorg — its content doesn't
  reference the old identity, it's all command-specific FAQ).
- **CLAUDE.md, AGENTS.md, `.cursorrules`-equivalents at the repo root were not touched.**
  These are goodbot's own *generated output* (dogfooding goodbot on itself) — e.g.
  `CLAUDE.md` is auto-generated from `CODING_GUIDELINES.md` and carries a "Generated by
  goodbot" footer. Editing them by hand would be editing generated artifacts, not hand-written
  positioning docs, and would get overwritten on the next `goodbot generate` run anyway. Out
  of scope for a docs/positioning pass.
- **`CODING_GUIDELINES.md` at the repo root** — same reasoning: it's generated output from
  goodbot's own config, not hand-authored prose about goodbot's identity.
- **Subcommand `--help` descriptions** (`check`, `generate`, `analyze`, `freshness`, `diff`,
  etc.) — left untouched per the task's instruction to change only descriptions that "directly
  contradict the new framing." None of them do; they're accurate one-line descriptions of
  command behavior (e.g. "Run deep dependency and SOLID analysis on your project") that read
  the same under either identity.
- **`TEST_PLAN.md`** — not in the task's file list, and it's an internal dogfooding test
  checklist, not positioning prose. Left untouched.
- **ROADMAP.md's stale "Shipped (v0.3.x)" header and command list** (mentions `fix`, `trend`,
  `sync`, `report`, `onboard`, `watch` as shipped — true — but the header still says v0.3.x
  while `package.json` is at 0.13.0, and some "Next Up" items like "CLI Integration Tests" and
  test counts ("161 tests") are stale relative to the current 293 tests). This is a real
  pre-existing accuracy problem, but it's unrelated to the immune-identity framing and touching
  it risked scope creep into a file the task didn't list. I only added the one-line scope note
  pointing to EVOLUTION.md. Flagging it below as an open question.

## Open questions for Alan

1. **ROADMAP.md is stale independent of this refresh.** It still says "Shipped (v0.3.x)" and
   "161 tests across 18 test files" while the package is at 0.13.0 with 293 tests across 25
   files, and several "Next Up" items (e.g. `fix`, `trend --effectiveness`, `sync`, `onboard`)
   are already listed as shipped further up the same file. Worth a separate pass to reconcile
   ROADMAP.md with reality, independent of the immune-system framing — I did not touch this
   beyond the one-line cross-reference, to stay inside this task's scope.

2. **The CLI exposes more surface area than the README's "Essential commands" table
   suggests.** `fix`, `watch`, `pr`, `onboard`, `trend`, `sync`, `report`, `ci` all exist as
   real commands (confirmed in `src/commands/`) but are only name-dropped at the bottom of the
   README's command table as "less frequently used." Under the immune framing, several of
   these are arguably part of "tolerate/recover" already in embryonic form (e.g. `trend
   --effectiveness` tracks which rule categories improve or worsen over time — that's
   adjacent to the Phase 3 self-tuning idea in EVOLUTION.md, just without the adjudication
   loop around it). I did not reclassify these into the shape/verify/exceptions structure or
   claim they're part of "tolerance" today, since the task was explicit that shipped vs.
   planned is sacred and I didn't have enough certainty about how load-bearing `trend
   --effectiveness` actually is in practice. Worth a conversation about whether any of this
   second tier of commands should be promoted into the "What it does today" narrative.

3. **Behavior surprise: the repo dogfoods itself.** `CLAUDE.md`, `AGENTS.md`, and
   `CODING_GUIDELINES.md` at the repo root are goodbot's own generated output on its own
   codebase, not hand-written docs — I hadn't assumed that going in, and it's a nice piece of
   proof that the tool works, but it also means those files will keep changing shape on every
   `goodbot generate --analyze --force` run regardless of this refresh. Might be worth a
   one-line callout somewhere (README Contributing section?) pointing out that the repo uses
   its own output, as a (true, not fabricated) show-don't-tell credibility signal — I left
   this out since the task said not to imply adoption or add unrequested claims, and "we use
   our own tool on this repo" sits right at that line. Flagging rather than deciding.

4. **The "five moments" lifecycle fix.** I corrected "four moments" to "five moments" in the
   README lifecycle section since there are and always were five numbered steps (Day 1, Day
   2+, every PR, periodically, when things change). This is a pre-existing copy bug, not an
   identity issue — flagging it here in case Alan wants it reverted or handled differently
   (e.g. by cutting a step instead of fixing the count).

## Merge pass (2026-11-10)

External review of the identity refresh came back with six requested fixes plus a verify-and-merge
pass. Status of each, applied against `docs/immune-identity-refresh`:

1. **README tagline precision fix — applied.** "both generated from one canonical source" →
   "both driven by one canonical source" in the header tagline. Guidelines are generated from
   `.goodbot/config.json`; verification compares against it rather than being "generated" itself,
   so "driven by" is the accurate verb for both sides.

2. **"The problem" honesty fix — applied.** "so the system gets stricter over time" → "so the
   system can get stricter over time." Nothing in the codebase automates the suppression ratchet
   (shrinking `analysis.suppressions` is a manual, human act) — "can get stricter" states a
   capability instead of implying an automatic guarantee.

3. **`ROADMAP.md` stale numbers — applied.**
   - `## Shipped (v0.3.x)` → `## Shipped (v0.13.0)`, matching `package.json`'s current
     `"version": "0.13.0"`.
   - `npm test` (vitest) was run directly: **293 tests passed across 25 test files** (0
     failures). Updated both stale "161 tests across 18 test files" mentions — the Tooling
     bullet under Shipped, and the problem statement in the "CLI Integration Tests" Next-Up
     item — to the real 293/25 numbers.
   - Checked whether `fix`, `trend --effectiveness`, `sync`, or `onboard` were misfiled under
     "Next Up": they were not. All four were already correctly listed under "Shipped" (the
     Auto-Fix and Workflow Integration subsections) confirmed against `src/commands/fix.ts`,
     `src/commands/trend.ts` (the `--effectiveness` flag and `renderEffectiveness()` function),
     `src/commands/sync.ts`, and `src/commands/onboard.ts`, all of which exist and are wired
     into `src/index.ts`. The only "Next Up" item that mentions `fix` is "CLI Integration
     Tests," which proposes testing `fix --dry-run`'s *output* as part of a future subprocess
     test suite — it does not claim `fix` itself is unshipped. No relocation was needed; no
     other structural changes were made to this file.

4. **README Contributing dogfooding paragraph — applied, wording adjusted.** Verified the
   premise: `CLAUDE.md`, `AGENTS.md`, and `CODING_GUIDELINES.md` at the repo root all end with
   a literal `*Generated by [goodbot](https://github.com/timeritual/goodbot-ai)*` footer, and
   `src/generators/` confirms all three are generated purely from `.goodbot/config.json` — there
   is no separate "source config" embedded inside `CODING_GUIDELINES.md` itself (it is output,
   not a second source). Dropped the task's suggested "...or CODING_GUIDELINES.md's source
   config" clause for that reason and added the paragraph, right after the clone/install code
   block and before "Three docs to orient," as:
   > This repo runs goodbot on itself: the `CLAUDE.md`, `AGENTS.md`, and `CODING_GUIDELINES.md`
   > at the root are goodbot's own generated output (see the "Generated by goodbot" footer in
   > each). Don't hand-edit them — change `.goodbot/config.json` and re-run `goodbot generate`.

5. **`docs/EVOLUTION.md` Phase 3 embryo sentence — applied.** Verified `trend --effectiveness`
   exists (`src/commands/trend.ts`, the `--effectiveness` option and `renderEffectiveness()`)
   and does what the sentence claims: it reads `.goodbot/history.json`, and for each violation
   category (circular deps, layer, barrel, SDP, SOLID, SRP, complexity, duplication, dead
   exports) compares a first-half vs. second-half rolling average across recorded entries and
   renders `↑ worse` / `↓ better` / `stable`. That is "tracks which rule categories improve or
   worsen over time," so the sentence was appended verbatim to the end of the Phase 3
   (Self-tuning) section.

6. **`fix` command safety-invariant check — verdict: consistent, no code changed.** Read
   `src/commands/fix.ts` in full.
   - It is registered only as a standalone Commander subcommand (`src/index.ts`: `import {
     fixCommand } from './commands/fix.js'` / `program.addCommand(fixCommand)`). Grepped
     `src/commands/ci.ts`, `src/commands/watch.ts`, and `src/commands/hooks.ts` for any
     reference to `fix` — none found. Nothing in the codebase invokes it automatically; a human
     has to explicitly type `goodbot fix`.
   - Its only flags are `--dry-run` and `--only <type>` (`fix.ts` lines 22–24) — there is no
     `--yes`/`--force`/auto-apply flag, no CI-auto-run wiring, and no `watch`-mode integration.
   - One nuance worth flagging: without `--dry-run`, `fix` writes files immediately via
     `safeWriteFile` with no secondary "are you sure?" confirmation prompt — the review gate is
     the human's decision to type the command (and optionally preview with `--dry-run` first),
     not an in-command confirmation step. This is still consistent with "goodbot never changes
     the host without review" in the sense the README/EVOLUTION.md invariant is written for —
     explicit, local, human-invoked — but it is not interactive in the sense of prompting before
     each write. No code was changed.

**Verification:**
- `npm run typecheck` — pass, zero errors.
- `npm run lint` — pass, zero warnings/errors.
- `npm test` — pass, **293 tests passed across 25 test files**, 0 failures.
- Manual link check on every relative markdown link in `README.md`, `docs/EVOLUTION.md`,
  `ROADMAP.md`, and this file: all resolve to real files (`./ARCHITECTURE.md`,
  `./HOW_IT_WORKS.md`, `./docs/EVOLUTION.md`, `../HOW_IT_WORKS.md`, `../README.md`). No broken
  links found.

**Tag and merge:**
- Tagged `main`'s pre-refresh tip with annotated tag `pre-immune-identity` (message: "Last
  commit before the immune-system identity refresh").
- Merged `docs/immune-identity-refresh` into `main` with `git merge --no-ff`, commit message
  `docs: reframe goodbot as a software immune system (identity refresh)`.
- Exact SHAs for the tag and merge commit are recorded in the task's final report to the user
  (this file is written just before the merge commit, so it cannot self-reference its own
  resulting SHA).

**Not done, by design:** nothing was pushed to `origin`, and no `npm publish` or other publish
command was run. The merge and the `pre-immune-identity` tag exist only in this local clone.

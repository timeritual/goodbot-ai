# Goodbot Week-Long Test Plan

**Target project:** [inferay](https://github.com/timeritual/inferay) — 95 TS/TSX files, active development, real module structure (components, features, hooks, pages, services, server, lib)

**Goal:** Validate that goodbot's freshness detection actually changes developer behavior and catches real drift in a production workflow.

---

## Day 1 (Tuesday) — Baseline

### Setup
```bash
cd ~/Documents/projects/inferay
npx goodbot-ai init --preset recommended
npx goodbot-ai generate --analyze --force
npx goodbot-ai hooks install
git add .goodbot/ CLAUDE.md CODING_GUIDELINES.md AGENTS.md .cursorrules .windsurfrules .cursorignore
git commit -m "Add goodbot guardrails"
```

### Record baseline
```bash
npx goodbot-ai trend --record
npx goodbot-ai analyze --git
npx goodbot-ai freshness
```

### What to observe
- [ ] Does `init --preset recommended` produce sensible config for inferay's structure?
- [ ] Does the generated CODING_GUIDELINES.md accurately describe inferay's architecture?
- [ ] Is the health grade reasonable? (inferay got D/53 in our E2E test — does that feel right?)
- [ ] Are the detected layers correct?
- [ ] Any false positives in violations that should be suppressed via `.goodbot/ignore`?

---

## Day 2 (Wednesday) — Normal Development

### Work on inferay as usual
Do your normal development work. Don't change anything about your workflow — just let goodbot observe via the installed hooks.

### End of day
```bash
npx goodbot-ai freshness
npx goodbot-ai trend --record
```

### What to observe
- [ ] Did the post-merge hook fire after any merges? Was the output useful or noisy?
- [ ] Did the pre-push hook fire before push? Was the freshness output meaningful?
- [ ] After a day of development, has anything drifted from the baseline snapshot?
- [ ] Did any AI agent (Claude Code, Cursor) actually read and follow the CODING_GUIDELINES.md?

---

## Day 3 (Thursday) — Intentional Drift

### Create some architectural drift intentionally
- Add a new file that violates a layer rule (e.g., import from `server/` inside a `component/`)
- Create a large file (300+ lines) to trigger SRP
- Add a duplicate code block from another file

### Then check
```bash
npx goodbot-ai diff --base main
npx goodbot-ai freshness
```

### What to observe
- [ ] Does `diff` catch the violations in changed files?
- [ ] Does the Guardrail Impact section in `diff` show meaningful claim drift?
- [ ] Does `freshness` correctly show degraded claims?
- [ ] Is the output clear enough that you'd act on it?
- [ ] Revert the intentional drift after testing

---

## Day 4 (Friday) — AI Agent Session

### Use Claude Code or Cursor to build a feature on inferay
Let the AI agent read the CODING_GUIDELINES.md and build something non-trivial (a new feature, refactor, etc.)

### After the session
```bash
npx goodbot-ai diff --base main
npx goodbot-ai freshness
npx goodbot-ai analyze
```

### What to observe
- [ ] Did the AI agent follow the guardrails? Which rules did it follow/ignore?
- [ ] Did the agent introduce violations that goodbot detects?
- [ ] Are there patterns the agent established that the guardrails don't cover?
- [ ] Would a `goodbot generate --analyze --force` produce meaningfully different guardrails now?

---

## Day 5-6 (Weekend) — Soak

### Let the snapshot age
Don't run goodbot. Just develop normally.

---

## Day 7 (Monday) — Week Review

### Full assessment
```bash
npx goodbot-ai freshness
npx goodbot-ai trend --effectiveness
npx goodbot-ai analyze --git
npx goodbot-ai trend
```

### Regenerate and compare
```bash
# Save old guardrails for comparison
cp CODING_GUIDELINES.md CODING_GUIDELINES.old.md

# Regenerate with fresh analysis
npx goodbot-ai generate --analyze --force

# Diff the guardrails
diff CODING_GUIDELINES.old.md CODING_GUIDELINES.md
```

### What to observe
- [ ] How stale did the guardrails get in 7 days?
- [ ] Which claims drifted most? (use `freshness` output from before regeneration)
- [ ] Does `trend --effectiveness` show any categories getting worse?
- [ ] How different are the regenerated guardrails from the originals?
- [ ] Did the hooks add value, or were they just noise?
- [ ] What's the health score trend over the week?

---

## Key Questions to Answer

### Product
1. **Does freshness detection change behavior?** Did knowing guardrails were stale make you regenerate sooner?
2. **Are hooks the right trigger?** Or should freshness run in CI instead of (or in addition to) local hooks?
3. **Is the D grade fair for inferay?** If not, what's the scoring model getting wrong?
4. **What's the right regeneration cadence?** After every PR? Weekly? When freshness says degraded?

### Technical
5. **Any crashes or confusing errors?** Note the exact command and error.
6. **Performance issues?** How long does `freshness` take on 95 files? Is it too slow for hooks?
7. **False positives?** Violations that aren't real problems — what should be suppressed or recalibrated?
8. **Missing detections?** Real problems that goodbot doesn't catch.

### UX
9. **Is the output readable?** Too verbose? Too terse? Wrong information highlighted?
10. **CLI discoverability** — did you need to check `--help` or README to remember commands?

---

## Log Template

Use this for daily notes:

```
### Day N — [Date]

**What I did:** [normal dev / intentional test / AI session]
**Commands run:** [list]
**Freshness status:** [fresh / stale / degraded]
**Health grade:** [grade (score)]
**Surprises:** [anything unexpected]
**Friction:** [anything annoying]
**Ideas:** [feature ideas or improvements]
```

---

*After the week, the notes become input for the next development cycle.*

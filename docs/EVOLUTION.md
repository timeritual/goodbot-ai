# The Evolution Roadmap

> **Status: this entire document is roadmap, not shipped behavior.** Everything below describes
> where goodbot is going, not what `npx goodbot-ai` does today. For what's actually implemented,
> see [README.md](../README.md) ("What it does today") and [HOW_IT_WORKS.md](../HOW_IT_WORKS.md).

## The framing

A biological immune system does three things: it **prevents** harm from entering, **tolerates**
the harm that gets in without the host dying of its own defenses, and **recovers — and
remembers** — afterward, so the next encounter with the same threat is faster and cheaper.

goodbot today is the prevention layer's two-sided core: it **shapes** what AI agents write
(guidelines generated into `CLAUDE.md`, `.cursorrules`, etc. from one canonical source) and
**verifies** what got written (drift detection against that same source). Both surfaces come
from one file, so they cannot drift apart from each other — and drift between the code and the
declared architecture is detected and reported.

The rest of the immune system — tolerance and memory — doesn't exist yet. This document is the
plan for building it. It is organized as phases. Nothing here is sequenced to a date; phases are
ordered by dependency (each one needs the previous one's plumbing), not by target quarter.

## Phase 0 — Consolidation

Before goodbot can evolve anything, it needs one thing to evolve: a single declared manifest in
the host repository — provisionally `immune.config.ts` — that covers rules, gates, and verified
capabilities in one place, with generation and checking both running from that one source.
The current canonical-source flow (`CODING_GUIDELINES.md` → generated agent files, driven by
`.goodbot/config.json`) is the embryo of this; it already proves the "one source, many
surfaces" shape works. This phase does not rename `.goodbot/config.json` or any existing file —
it's about making sure every rule and gate goodbot enforces is traceable to that one source
before anything is allowed to mutate it automatically.

## Phase 1 — Adjudication loop

Every drift finding `freshness`/`diff` surfaces today just sits in a report — a human reads it
and decides what to do, off to the side, with no structured record of the decision. This phase
gives every finding an explicit verdict: **reject** (the code is wrong, the gate holds, nothing
in the canonical source changes) or **accept-as-evolution** (the architecture legitimately moved,
so the canonical source updates and every generated surface regenerates in the same pull request).
Both verdicts get recorded with provenance — which finding, who adjudicated it, when — so the
history of "why does this rule say what it says" becomes queryable instead of folklore.

## Phase 2 — Incident → antibody

When a defect escapes past the gates and causes real damage, the fix today is a one-off patch
and maybe a comment. This phase turns that into a proposed permanent rule: an escaped incident
becomes a draft addition to the canonical source, carrying explicit provenance — "this rule
exists because of incident #N" — so future maintainers can see why a rule exists, not just that
it exists. The proposal is a diff like any other; nothing is added to the ruleset without a
human approving it.

## Phase 3 — Self-tuning

Rules that are too noisy get ignored, then eventually ripped out by an annoyed team — that's how
guardrails die today. This phase adds per-rule false-positive tracking, so goodbot can see which
rules fire often and get overridden often. From that signal it proposes demotions (error → warn),
threshold adjustments, or narrower scope for noisy rules — slowly, with hysteresis so a single bad
week doesn't flip a rule off, and always as a suggestion a human reviews, never a silent change.

## Phase 4 — Germline

Rule shapes that prove themselves across one host become candidates to ship as versioned default
packs for new hosts — the way useful mutations propagate to offspring. A rule pack is shapes and
thresholds only: a new project adopting the "NestJS API, strict" pack gets the rule structure, not
anyone else's code, file paths, or violation baselines. Nothing host-specific — no code, no paths,
no baselines, no incident history — ever leaves the host it was learned on.

## The safety invariant

**goodbot never changes itself or the host without review.** Every mutation described above —
accepting drift as evolution, proposing an antibody from an incident, tuning a noisy rule,
adopting a germline pack — is a diff a human approves, in the same review flow as any other code
change. "Evolves" means *proposes, with evidence* — it never means silent self-modification.
There is no phase of this roadmap, present or future, where goodbot commits a change to its own
ruleset or to host code without a human in the loop.

Biology can't write acquired adaptations back into its genome. goodbot can, because its genome
is a text file in version control and every mutation is a reviewable PR.

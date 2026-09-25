# Audit fix 1 — Overview tile notes on phones

- Updated: 2026-09-25T18:10:00-03:00 · Agent: Claude Code · Model: Sonnet 5
- State: implemented, tested, verified
- Objective: remove the 4 dead/regressing `.overview-stats` phone rules workspace.css kept past the styling boundary; add the note-hierarchy and lone-tile-row fixes to globals.css.
- Owned paths: apps/web/app/globals.css, apps/web/features/workspace/workspace.css, apps/web/tests/e2e/overview.spec.ts, this report.

## Changes
- workspace.css — deleted `> div + div` padding-left rules (1000px/640px) + stale comment, the 640px `> div > span { min-height:32px; ... }` rule, and the 374px `> div > span { font-size }` rule. `grep -n overview-stats features/workspace/workspace.css` now prints nothing.
- globals.css — 374px block: added `.overview-stats > div > span, .overview-stats small { font-size: var(--text-xs); }` (brief text verbatim). 480px block: added explicit 2-col grid + `> div:last-child:nth-child(odd) { grid-column: 1 / -1 }` for the lone third client tile.
- overview.spec.ts — added the brief's 2 assertions (note-gap, lone-tile width) to "the client Overview fits a phone in dark mode".
- design-system.md / workspace/README.md — checked with grep; no sentence describes the removed phone rules specifically, left unchanged.

## Decisions and interface changes
- None; no consumer outside these 3 files reads the removed selectors (confirmed by stylesheet-boundary test + grep).

## Checks actually run
- RED: `npx playwright test tests/e2e/overview.spec.ts --output=../outputs/pw-audit-fix` before the CSS edit — 3 passed, 1 failed at line 137 only (`Expected: <= 1 / Received: 189`, lone-tile width). The note-gap assertion (line 135) already passed pre-fix: the 32px min-height inflates the label span's own box rather than opening a gap to `small` (`small`'s `margin-top: 2px` is unaffected), so only the width assertion was true RED.
- GREEN (after the CSS edit): same command — `4 passed (4.7s)`.
- `npx vitest run features/shared` — `11 passed / 135 passed` (colour gate + stylesheet boundary clean).
- `npx playwright test tests/e2e/client-pages-layout.spec.ts tests/e2e/theme.spec.ts --output=../outputs/pw-audit-fix` — `6 passed (30.5s)`.
- Visual captures (throwaway scratchpad script; signed in with `DEMO_PASSWORD`, never printed) at 390×844/340×800 → `outputs/overview-audit-fix/{studio-home,designer-home,client-overview}-{390x844,340x800}.png`. Studio `/home` (6 tiles, no notes): visually unchanged — tiles were already grid-stretched to equal height and left/right padding was already symmetric, so removing the dead rules only removed ~10px of invisible space under each label; no regression. Client Overview: the note now sits directly under its label, and the lone third tile now spans the full row width. Designer `/home`: notes sit tight under their labels too.
- `npx prettier --write` on the 3 touched files — all "(unchanged)". `npm run check` (apps/web) — typecheck, lint, format:check, vitest all pass: 91 files / 1037 tests.

## Risks and next action
- None open. Ownership: all 3 owned paths released, no active writer; commit follows this report.

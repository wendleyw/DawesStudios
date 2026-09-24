# Status badge tone colors

- Updated: 2026-09-24T00:35:00-03:00 · Agent: Claude Code · Model: Sonnet
- State: tested
- Objective and owned paths: add a restrained hue per `.status-badge` tone while keeping shape cues; `apps/web/app/globals.css` (status-badge + `:root` tokens), `apps/web/features/shared/status-tone.ts`, `docs/architecture/design-system.md`.

## Changes
- `apps/web/app/globals.css` — added `--tone-active-fg/-bg/-border` (#1d4e89/#e7f0fb/#a9c6ea), `--tone-attention-fg/-bg/-border` (#7a5400/#fbf1dc/#e3bd6e), `--tone-complete-fg/-bg/-border` (#2f5d34/#e7f0df/#a9c48a) to `:root`; `.status-badge.tone-active/.tone-attention/.tone-complete` now set background/border-color/color from these tokens, keeping the existing ring/dashed/square shapes and `neutral` grey unchanged.
- `apps/web/features/shared/status-tone.ts` — comment now documents shape + hue per tone in a table.
- `docs/architecture/design-system.md` — Decision paragraph (~line 23) now lists the hex tokens and measured contrast; line ~21 records the status badge as the one colored exception to monochrome chrome, per the user's 2026-09-24 request; line ~158 "monochrome status marker" reworded to "status marker" with hue noted as additive.

## Decisions and interface changes
- Domain tone mappings (`projectStatusTones`, `briefingStatusTones`, `creditRequestStatusTones`) untouched — no consumer interface change.
- Token names are exact: `--tone-active-*`, `--tone-attention-*`, `--tone-complete-*`, matching the credits chip's expected `--tone-attention-*` reference.
- Verified `board.css` (:697, :790) and `briefings.css` (:471) and `globals.css` (:1353) `.status-badge` overrides only touch font-size/display/max-width, no color conflicts.

## Checks actually run
- `npm run typecheck` — pass.
- `npx prettier --check app/globals.css features/shared/status-tone.ts` — pass.
- `npx vitest run features/shared` — 6 files, 64 tests, pass.
- Contrast computed via node script in scratchpad (WCAG relative-luminance formula): active fg/bg 7.29:1, attention fg/bg 6.05:1, complete fg/bg 6.55:1 — all above the 4.5:1 floor.

## Risks and next action
- Border-vs-background contrast (~1.5–1.6:1) was not required by the task and not verified against 3:1 non-text guidance; flag if a future accessibility pass needs it.
- No visual/browser screenshot taken (not requested); recommend a quick visual check once the credits chip agent's work lands to confirm shared token usage.
- Ownership: paths released, no active writer.

# Credit balance chip in client workspace header

- Updated: 2026-09-24T00:36:00-03:00 · Agent: Claude Code · Model: Sonnet
- State: tested
- Objective and owned paths: add a compact credit balance chip left of the notifications bell; owned `apps/web/features/credits/credit-balance-chip*`, `credits.css`, `credits/README.md`, `workspace/canvas-header.tsx`, `workspace/README.md`.

## Changes
- `apps/web/features/credits/credit-balance-chip.tsx` — new component; reads `useCreditAccount(clientId)`, renders nothing for designer/null viewer/loading/error, links to `/clients/:id/credits`, "N credits"/"1 credit" via `Intl.NumberFormat("en-US")`, `aria-label`/`title` with full text.
- `apps/web/features/credits/credit-balance-chip.css` — new; matches `.board-account` height/radius/type tokens without editing `globals.css`; `.credit-balance-chip-attention` uses `var(--tone-attention-fg/bg/border, <fallback>)`; hides the word at the same 1100px `@container board` breakpoint `.board-profile-name` already uses, plus a 640px/650px media fallback.
- `apps/web/features/credits/credit-balance-chip.test.tsx` — new; covers client/agency render+link, designer→null, null viewer→null, loading/error→null, balance 0→attention class.
- `apps/web/features/workspace/canvas-header.tsx` — renders `<CreditBalanceChip clientId={client.id} viewer={viewer} />` before `<NotificationsPopover />` in `.board-account`.
- `apps/web/features/credits/README.md`, `apps/web/features/workspace/README.md` — documented the new chip and its render/loading/role rules.

## Decisions and interface changes
- Chip's own CSS file (not `credits.css`) since `credits.css` only loads on the Credits route, not everywhere `canvas-header.tsx` renders. No `globals.css` or shared-UI change made; relies on `--tone-attention-*` tokens another agent is adding, with inline fallbacks — no coordination needed if those land later.

## Checks actually run
- `npx vitest run features/credits features/workspace` — 5 files / 33 tests pass.
- `npm run typecheck` — passes (route types regenerated, `tsc --noEmit` clean).
- `npx eslint features/credits/credit-balance-chip.tsx features/credits/credit-balance-chip.test.tsx features/workspace/canvas-header.tsx` — clean.
- `npx prettier --check` on the same files plus the new `.css` — clean (one auto-format applied to the test file).

## Risks and next action
- `.board-account` has a fixed 264px `max-width` in `globals.css` (out of scope); the chip plus bell plus profile could still get visually tight on mid-width windows before the 1100px container query hides the word — not verified with a real browser screenshot.
- Ownership: paths released, no active writer.

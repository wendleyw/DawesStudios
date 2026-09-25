# Task 5: Navigation and landing

- Updated: 2026-09-25T16:40:50-04:00 · Agent: Claude Code · Model: Sonnet 5
- State: tested
- Objective and owned paths: land clients/agency on Overview first; `features/workspace/{client-navigation,client-switcher,home-page}.tsx`, its README, 4 named e2e specs.

## Changes
- `client-navigation.tsx` — Overview destination first for agency/client, hidden for designers.
- `client-navigation.test.tsx` (new) — unit coverage for both roles.
- `home-page.tsx` — single-workspace client redirect target now `overview` (only that line changed).
- `client-switcher.tsx` — single-workspace link uses `useAuth()`; Overview for client/agency, Board for designer.
- `README.md` — documents Overview as the first destination and the two role-aware landing links.
- `test-support.ts` `signIn` — URL regex accepts `board|overview` after sign-in.
- `workspace.spec.ts` — client test expects `/overview$`, clicks Board nav link, then expects `/board$`.
- `client-navigation.spec.ts` — both SABRE nav `toHaveCount(6)` → `(7)`.
- `client-pages-layout.spec.ts` — `["Overview","overview"]` added as the first `[label, route]` entry.

## Decisions and interface changes
- None beyond the brief. Grepped every other e2e spec calling `signIn(..., credentials.client)`; all `page.goto()` immediately after, so the redirect-target change is safe for them.

## Checks actually run
- `vitest run client-navigation.test.tsx` — RED (1/2 fail, no Overview link) then GREEN (2/2 pass).
- `npx playwright test client-navigation.spec.ts client-pages-layout.spec.ts workspace.spec.ts --output=../outputs/pw-overview-nav` — 8 passed, 3 failed.
- `client-pages-layout.spec.ts` "brand sections…" failed (session closed, 7.3m); rerun alone — **passed, 5.9s**: one-off flake from the long single-worker run, unrelated to any touched file/route.
- `workspace.spec.ts` rerun alone — both failures are the known SABRE overlay `.board-card` count (7 expected, 50 actual); my Overview→Board steps pass before that assertion.
- `npm run check` (apps/web) — PASS: typecheck, lint, format:check, vitest 90 files/1036 tests.

## Risks and next action
- Concerns: none blocking; the one flaky failure did not reproduce in isolation.
- Ownership: paths released. Next: commit `feat(overview): open the client workspace on its Overview` with only the listed files.

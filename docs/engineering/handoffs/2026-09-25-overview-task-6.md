# Task 6: Designer home and the studio's greeting

- Updated: 2026-09-25T21:08:46Z · Agent: Claude Code · Model: Sonnet 5
- State: verified
- Objective and owned paths: designer `/home` dashboard plus a shared `WelcomeHeader` greeting for every `/home` role; `features/overview/{overview-data.ts,designer-overview.tsx,designer-overview.test.tsx,README.md}`, `features/workspace/{home-page.tsx,README.md}`, `tests/e2e/canonical-workspaces.spec.ts`.

## Changes
- `features/overview/overview-data.ts`, `designer-overview.tsx`, `designer-overview.test.tsx` (new) — verbatim from the brief: `useDesignerVersions`, `DesignerOverview`, its test.
- `features/workspace/home-page.tsx` — designer early-return to `DesignerOverview`; `page-heading` block replaced with `WelcomeHeader`/`welcomeTitle` for agency/client; everything below unchanged.
- `tests/e2e/canonical-workspaces.spec.ts` — designer assertion now checks "Welcome back" heading text plus eyebrow "My work"; wrapped both in `{ }` since the existing `if` was unbraced and the brief's snippet has two statements.
- Both READMEs — documented the designer `/home` (tiles, columns, `useDesignerVersions`, `publishedVersionStatus` mapping, no-credits rule) and `/home`'s per-role greeting/eyebrow.

## Decisions and interface changes
- None beyond the brief's own interfaces (`useDesignerVersions`, `DesignerOverview`).

## Checks actually run
- RED: `npx vitest run features/overview/designer-overview.test.tsx` — failed, module missing, as expected.
- GREEN: same command — 1/1 pass; then `npx vitest run features/overview features/workspace` — 47/47 pass across 10 files.
- `npm run check` (typecheck, lint, format:check, test) — PASS: 1037/1037 tests across 91 files, zero lint errors.
- Throwaway Playwright script outside the repo (scratchpad), 1440×900 screenshots to `outputs/overview-task6/`: signed in as `designer@dawes.local` and `studio@dawes.local`, DEMO_PASSWORD read from `supabase/.env.local` and never printed/written. Designer: "Welcome back, Alex" / eyebrow "My work", 4 tiles (30/8/11/5), 3 columns (What's moving, Your turn, Recently delivered), no "See all" links, no credit word anywhere. Studio: "Welcome back, Dawes" / eyebrow "Overview", unchanged 6-tile agency dashboard and needs-attention table below, "New client" action present. Both matched the model; no visual regressions.

## Risks and next action
- None outstanding. `canonical-workspaces.spec.ts` itself was not executed (known SABRE-overlay count failures elsewhere in that file are out of scope); its two new designer-heading lines match the unit-tested markup exactly.
- Ownership: all paths above released; no active writer or process left.

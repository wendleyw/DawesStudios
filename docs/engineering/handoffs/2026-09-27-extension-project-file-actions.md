# Project, competitor and Files action coverage

- Updated: 2026-09-27 15:08 EDT · Agent: Codex delegate · Model: Sonnet-equivalent
- State: implemented; static checks and orchestrator browser verification passed
- Objective: cover missing durable UI actions without changing application or seed data.
- Owned paths: `apps/web/tests/e2e/workspace-actions.spec.ts`, `competitor-ads.spec.ts`, `files-actions.spec.ts`, and this report.

## Changes
- `workspace-actions.spec.ts` — edit title and notes on an acceptance project; verify database and reload persistence alongside dates.
- Canonical failure correction: locate the Notes textbox by dialog role and accessible name, which the failure snapshot shows, instead of `getByLabel`.
- `competitor-ads.spec.ts` — edit name and library identifiers; verify persisted Meta/TikTok links and keep designer/client/removal assertions.
- `files-actions.spec.ts` — agency and assigned designer upload through Files, reload, download matching bytes; client cannot see rows or download internal bytes; exercise Approved and project filters.

## Decisions and interface changes
- Reused disposable production project fixture and guarded cleanup; edited title retains the `Acceptance ` prefix required by cleanup.
- Existing Files search/folders, competitor removal and no individual file delete UI were left unchanged. No interface changes.

## Checks actually run
- `npx eslint` on all three owned specs — passed.
- `npm run typecheck` in `apps/web` — passed.
- `npx prettier --check` on all three owned specs — passed.
- `git diff --check` on owned specs — passed.
- Playwright E2E — not run by instruction while the orchestrator's broad suite runs.
- After the selector correction, focused ESLint, Prettier check and diff check — passed.
- Orchestrator: competitor and Files cases PASS in the focused run; corrected canonical workspace-actions PASS 3/3.

## Risks and next action
- Browser logs: `outputs/extension-audit-2026-09-27/focused-actions.log` and `workspace-final.log`.
- No application or database behavior changed in these specs; root owns the integrated audit.
- Ownership: owned paths released; no writer or process remains active here.

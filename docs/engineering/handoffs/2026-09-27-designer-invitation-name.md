# Designer invitation name

- Updated: 2026-09-27 18:39 EDT · Agent: Codex implementer · Model: GPT-6
- State: tested; local Auth delivery and visual checks pending orchestrator integration.
- Objective: accept a person's name when the studio sends an invitation.
- Owned paths: `apps/web/features/team/team-page.tsx`, `team-page.test.tsx`, `README.md`; `apps/web/features/settings/settings-model.ts`, `settings-model.test.ts`, `invitation-route.test.ts`; `apps/web/app/api/invitations/route.ts`; this report.

## Changes
- Shared invite dialog adds optional Full name, clear existing-account guidance, and sends normalized input.
- Invitation schema trims names, omits blanks, enforces 120 characters; API passes `display_name` only to new Auth invitations.
- UI, schema, and route tests cover trimmed names, blank/legacy input, length limit, and existing-account isolation.
- Team README documents the name behavior and targeted test command.

## Decisions and interface changes
- Optional name preserves existing invitation callers; no database migration or extra profile write. Existing `handle_new_auth_user` uses Auth metadata.
- `features/settings/README.md` also describes delivery but was outside assigned write ownership; orchestrator may update its overview.

## Checks actually run
- `npx vitest run features/settings/settings-model.test.ts features/settings/invitation-route.test.ts features/team/team-page.test.tsx` — pass, 3 files / 17 tests.
- `npm run typecheck` — pass.
- Targeted `npx eslint` on changed TypeScript/TSX files — pass.
- Targeted `npx prettier --check` on changed files — pass.
- `git diff --check` — pass.

## Risks and next action
- Local SMTP capture, real Auth invitation acceptance, and visual UI check remain for orchestrator; no external sends or Docker work done here.
- Ownership: all assigned paths released; no active process. Existing unrelated `workspace.css` modification and `login.png` deletion untouched.

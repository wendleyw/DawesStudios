# Workflow action notifications UI

- Updated: 2026-09-27 17:19 EDT · Agent: Codex implementer · Model: GPT-6
- State: tested; integrated typecheck and browser verification pending
- Objective: show current workflow actions in the notification page, popover and bell.
- Owned paths: workspace notification data, feed, bell, action component/tests, CSS, README, this report.

## Changes
- `workspace-data.ts`: action-view query keyed by user, exact count, latest 100, 15-second poll, mount refresh.
- `action-notifications.tsx` and test: nine workflow destinations, full-row links, independent loading/error/retry/empty states.
- `notification-feed.tsx` and test: actions above Activity; read mutation remains scoped to Activity.
- `notifications-bell.tsx`: lights for either count and announces each count separately.
- `workspace.css` and `README.md`: restrained section styles and updated behavior documentation.

## Decisions and interface changes
- Credit request links use `/clients/:id/credits#credit-requests`; root owns the destination anchor.
- Root owns the `action_notifications` database view/types and project deep-link handling.
- The view contract supplies `id, kind, client_id, project_id, entity_id, board_id, subject, created_at`.

## Checks actually run
- `npx vitest run features/workspace/action-notifications.test.tsx features/workspace/notification-feed.test.tsx` — pass, 22 tests.
- `npx eslint` on touched TS/TSX files — pass.
- `npx prettier --check` on touched feature files — pass.
- `git diff --check -- apps/web/features/workspace` — pass.
- `npm run typecheck` — blocked by pending generated view type; also fails in root-owned `tests/e2e/action-notifications.spec.ts:25` on nullable `UserResponse.data.user`.

## Risks and next action
- Root generates view types, fixes its e2e type error, then reruns integrated typecheck and browser flow.
- Root verifies UI visually in the page and popover; no browser or screenshots run by this worker.
- Ownership: owned paths released; no worker process remains.

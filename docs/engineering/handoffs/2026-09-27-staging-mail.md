# Filesystem staging mail capture

- Updated: 2026-09-27 EDT · Agent: Codex implementer · Model: GPT-6
- State: implemented and statically checked; live staging application pending orchestrator.
- Objective: make filesystem staging invitation and recovery sends capturable without touching live or MinIO mode.
- Owned paths: `deploy/staging/compose.filesystem.override.yml`, `deploy/staging/README.md`, `apps/web/tests/e2e/intake-fixture.ts`, this report.

## Changes
- Filesystem override adds pinned `axllent/mailpit:v1.31.1`, loopback UI/API `56115`, private SMTP `1025`, and Auth's blank SMTP credentials.
- E2E intake helper requires `ACCEPTANCE_MAIL_URL` for nonlocal backends and accepts only a loopback HTTP origin; local Inbucket `55424` remains the fallback.
- Staging README documents the new port, existing 3113 Auth redirects, upgrade command and browser environment variable.

## Decisions and interface changes
- Existing prepared filesystem `.env` has the expected `SITE_URL`/invite/recovery redirects on 3113 (values checked without printing secrets); no env or `stage.sh` edits.
- MinIO Compose and live local mail on 55424 remain separate; Mailpit's v1 message API matches the existing helper calls.
- Mailpit [Docker docs](https://mailpit.axllent.org/docs/install/docker/) document ports 8025/1025 and fixed release tags; [Supabase Auth docs](https://github.com/supabase/auth) describe SMTP user/password as optional when the server needs no authentication.

## Checks actually run
- One-off execution of the helper's transpiled URL validator: 8 local/staging/rejected cases passed after correcting empty-string fallback.
- `npm run typecheck` in `apps/web` — pass.
- Targeted ESLint and Prettier on `intake-fixture.ts` — pass.
- Ruby YAML parse of filesystem override plus Mailpit/Auth port and host assertions — pass.
- `git diff --check` on owned implementation files — pass.
- Initial targeted Vitest attempt reported no test files because the repo's config includes only `features/` and `lib/`; the unused draft test was removed.
- No Docker, server, provisioning, staging mutation, browser suite or commit run by this agent.

## Risks and next action
- Root: after the current browser suite ends, run `STAGING_STORAGE=file deploy/staging/scripts/stage.sh up` to add Mailpit/recreate Auth; check `curl --fail http://127.0.0.1:56115/api/v1/messages`; rerun invitation/recovery Chromium cases with `ACCEPTANCE_MAIL_URL=http://127.0.0.1:56115` and existing staging declarations.
- Then verify exact canonical 10/25 and role isolation. Compose resolution and real SMTP delivery remain unverified until root's run.
- Ownership released: all paths above; no process left running.

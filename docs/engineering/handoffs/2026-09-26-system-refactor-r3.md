# System refactor R3 — database hardening and test coverage

- Updated: 2026-09-26T04:10:54-04:00 · Agent: Claude Code · Model: Sonnet 5
- State: verified
- Objective/paths: cap briefing/attachment sizes, lock `adjust_credits` idempotency lookup, cover 6
  security-definer functions + new caps + retry, cover removed-account lockout; `supabase/migrations/`,
  `supabase/tests/database/`, `apps/web/features/auth/`, `docs/architecture/backend.md`, `apps/web/features/briefings/README.md`.

## Changes
- `202609260003_briefing_limits_and_credit_lock.sql`: triggers cap briefings (deliverables ≤50,
  direction ≤65536B, title ≤200 chars, overview/goals/budget_note ≤10000, drafts/client ≤100 under a
  per-client lock) and attachments (≤20/briefing, per-briefing lock). `adjust_credits` gains
  `request_credits`'s pre-lookup `pg_advisory_xact_lock`; body else unchanged. Pre-check: local max
  was 3 deliverables/493B direction/49-char title/1 attachment/3 drafts — every row already passes.
- `security_definer_coverage.test.sql` (new, self-built fixtures, not seed/SABRE rows): allowed+
  refused caller for `submit_design_version`/`resolve_comment`(x2 channels)/`revoke_invitation`/
  `reject_credit_request`/`discard_sanitized_asset`/`finalize_asset_discard`; refused-above/accepted-
  at-cap per limit; `adjust_credits` retry. `auth-data.test.ts` (new): lockout on/off `removed_at`.
- Docs updated in this commit: `backend.md`, `briefings/README.md`. Decision: discard/finalize
  refusal asserts `42501`/null message — `authenticated` has no EXECUTE grant, so Postgres' own
  denial fires before the function's message (confirmed live, not assumed).

## Checks actually run
- RED pre-migration: new file 10/40 fail (new-limit cases only); GREEN post-`migration up`: 40/40.
- `supabase test db` full: 25 files/633 tests, only the 6 known `access_and_workflows.sql` failures.
- `apps/web`: `npx vitest run && npm run check` — 109 files/1168 tests, typecheck/lint/format pass.
- Playwright (briefing-modal/intake-admin/production-workflow, `--output=../outputs/pw-r3`): 9/9.

## Risks and next action
- None unresolved. No public signature changed; `database.types.ts` untouched. Ownership released.

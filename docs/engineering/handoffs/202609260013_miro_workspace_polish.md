# 202609260013 Miro workspace polish — handoff

Status: implemented and verified. Commit `aff6b80`
"fix(db): tighten Miro workspace retries, round sharing and delivered projects".

Changed files:
- `supabase/migrations/202609260013_miro_workspace_polish.sql` (new)
- `supabase/tests/database/miro_workspace.test.sql`
- `docs/architecture/backend.md`

Checks executed: `supabase migration up --local` (applied clean), `supabase test db`.
`miro_workspace.test.sql` — ok, all assertions pass. Only baseline
`access_and_workflows.test.sql` failed tests 2, 4, 9, 18, 32, 54 (pre-existing SABRE-overlay
counts, unrelated to this change).

Existing assertions updated to the new error codes (deliberate):
- `send_board_round` on a delivered project: `'P0001'` → `'22023'`.
- `share_miro_version` reused-key-with-different-data: `'P0001'` → `'23505'`.
- `share_miro_version` on a delivered project: `'P0001'` → `'22023'`.

New assertions added: cross-board idempotency-key reuse in `send_board_round` (23505); a retry
with the same key but a different board link in `share_miro_version` (23505); re-sharing an
already-shared round (23505 "This round is already shared"); sharing a round from another
project (P0002); anon role calling `share_miro_version` (42501, via the existing revoke, reaches
`assert_agency` never); an idempotency key colliding with another `private.publication_sources`
row's `request_key` (23505, caught unique_violation instead of raw constraint error); a
non-agency relink attempt on a delivered project via `set_version_miro_link` (22023), with the
agency's unaffected relink as a `lives_ok` control.

No signature changes; types were not regenerated. No files outside `supabase/` and
`docs/architecture/backend.md` were touched.

Concerns: none outstanding. The fixture-collision test writes directly into
`private.publication_sources`/`public.published_versions` (bypassing RPCs) to simulate a
`publish_version`-authored `request_key`; this is test-only scaffolding, rolled back with the
file's final `rollback;`.

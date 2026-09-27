# Existing-client invitation implementation

- Date: 2026-09-27 · Agent: Codex backend implementer · State: implemented and locally verified; root integration pending.
- Changed: `supabase/migrations/202609270013_client_reinvitation.sql`, `202609270014_preserve_removed_staff_invitation_guard.sql`, `202609270015_invitation_password_requirement.sql`, `202609270016_invitation_password_setup_intent.sql`, `supabase/tests/database/client_reinvitation.test.sql`, `apps/web/app/api/invitations/route.ts`, `apps/web/features/settings/settings-data.ts`, `invitation-acceptance.tsx`, `invitation-route.test.ts`, `invitation-acceptance.test.tsx`; this report. No commit.
- 013 extends agency-only `create_invitation` JSON with `existing_user_id`/`existing_removed`; active client accounts may accept another client without losing other memberships. Removed clients may accept only a valid client invitation; acceptance atomically removes all stale memberships, clears removal markers and adds only the invited client. No existing staff role changes.
- 014 restores the prior early `42501 Your studio access has been removed` response for removed staff. It is forward-only because 013 had already been applied locally when the targeted removal spec identified the regression.
- 015 serializes creation/acceptance with removal and refuses a removed client while `removal_completed_at` is NULL, preventing an in-flight Auth ban from disabling a newly returned client. Its authenticated setup RPC validates token and confirmed matching email and rejects pending removal.
- 016 fixes the actual GoTrue invite flow: a disposable local invite showed empty password before verification but a nonempty placeholder hash afterward; that user was deleted. The private invitation token now records whether no Auth identity existed when the invitation was created, and the setup RPC returns that trusted flag instead of checking the mutable Auth hash. Existing identities always retain their password.
- The API uses `signInWithOtp({ shouldCreateUser:false })` for existing Auth identities, unbans a removed client before mail, and uses `inviteUserByEmail` for new identities. It revokes a pending token on delivery failure. The UI ignores URL setup hints, rechecks the RPC before any password write, preserves existing passwords, and requires new accounts to set one.
- On failed mail after a successful Auth unban, the Auth account can remain unbanned while `profiles.removed_at` still denies application data. No compensating re-ban is attempted because it could ban a concurrently reactivated account. Root should assess whether future reconciliation is warranted.
- A removed client gets no old/new client access before token acceptance; token validation requires confirmed matching email, pending unexpired status and one-time use. Removed staff, wrong email, revoked token and staff-role invitations are blocked.

## Checks actually run
- `supabase migration up --local` applied 013–016 without reset/down.
- Transaction-rollback `client_reinvitation.test.sql`: 32/32 pgTAP; `team_removal_authorization.test.sql`: 21/21; earlier `authorization_matrix.test.sql`: 13/13.
- `npx vitest run` on invitation route, acceptance component and settings data: 31/31; ESLint and Prettier on owned TS/TSX files, `git diff --check`: passed.
- Root regenerated `database.types.ts`; the previous `npx tsc --noEmit` reached only duplicate `const redirect` declarations in root-owned `apps/web/tests/e2e/intake-admin.spec.ts:666,686`, which root is fixing.
- Real local Auth invite/verify probe confirmed the hash transition and cleaned up its disposable user. Root's two existing-client browser flows passed before 016; corrected new-account browser acceptance and staging 016 migration remain unverified by this agent.
- Pending invitations created before 016 default to password setup optional; they remain scoped and valid. If their newly invited users need a password, Auth recovery is the safe path; reissuing after the identity exists will not mark it as new.

## Root next action
- Update `apps/web/features/settings/README.md` and shared invitation/backend docs; rerun the corrected new-account browser case and apply 016 to staging before DB checks; integrate and commit.

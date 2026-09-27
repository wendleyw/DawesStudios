# Existing-client invitation review

- Date: 2026-09-27 · Agent: Codex reviewer · State: reproduced; implementation pending.
- Owned artifact: this report and ignored `outputs/recovery-2026-09-27/invitations/reproduce.sql`. No runtime source or persistent data changed.

## Verified findings
- [P1] `supabase/migrations/202609230002_removed_member_guards.sql:50` rejects any existing client membership. An active client A person with a valid, email-matched, agency-created client B invitation receives `P0001 Existing members require an administrator-managed role change`; no B membership is added.
- [P1] The same function at line 43 rejects a removed client before token validation (`42501 Your studio access has been removed`). This protects removed staff and stale tokens intentionally, but prevents agency-authorized client re-invitation.
- [P1] `supabase/migrations/202609250003_client_notification_routing.sql:82` retains the removed person's last membership. A naive reactivation clearing both profile removal markers immediately revives access to that old client, even if the new invitation names another client.
- [P1] `apps/web/app/api/invitations/route.ts:85` uses `admin.auth.admin.inviteUserByEmail`; its existing-account failure is handled at lines 90-103 by revoking the prepared invitation and returning 502 (also asserted in `intake-admin.spec.ts:645`). A SQL-only fix cannot deliver either existing-account invitation. The API behavior is code/test evidence; this route was not invoked in this review.
- [P2] `apps/web/features/settings/invitation-acceptance.tsx:34` updates the account password before calling `accept_invitation`. An existing client would be forced to set a new password even if acceptance fails.

## Smallest safe change
- Forward-migrate `accept_invitation`: after the existing confirmed-email/token/status/expiry checks and membership lock, accept `client` invitations for an active `client` profile into a *different* client without changing role; reject duplicate membership and keep all agency/designer role-change guards.
- For removed `client` profiles only, require the same valid agency-created client invitation, atomically remove retained stale memberships, add only the invited client, clear `removed_at` and `removal_completed_at`, then consume/audit the invitation. Keep removed agency/designer accounts blocked.
- In the agency-only API, deliver a token-bearing link to the existing verified address without calling new-user `inviteUserByEmail`; safely unban a removed client while `removed_at` still denies every data read, then invoke the reactivation path. Do not expose the token in the API response or create a second Auth identity. The existing-account UI should sign in and accept without changing its password.
- Preserve exact-email binding, token hash/expiry/single use, active-agency checks, role isolation, serialized membership writes, and safe retries when Auth unban/email delivery fails.

## Checks and next action
- `docker exec ... psql < outputs/recovery-2026-09-27/invitations/reproduce.sql`: 7/7 pgTAP assertions passed; transaction ended with ROLLBACK. Both `create_invitation` calls returned pending tokens; both acceptances failed as above; clearing removal markers revived the stale membership.
- Existing relevant tests were read, not rerun. End-to-end Auth ban, mail delivery and browser acceptance remain unverified.
- Next action: implement the forward migration and local-safe existing-account delivery/UI path, then test A→B, removed→same/other, duplicate/wrong/reused token, staff denial, Auth unban failure and membership scope after reactivation.

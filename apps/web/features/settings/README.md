# Settings and account access

The Settings feature persists account, studio, client, campaign, and service-preset changes through the authenticated Supabase contract. Agency users have Workspace, Team, Clients, and Presets. Every authenticated role can open Account. Backend permissions independently reject administrative mutations from clients and designers.

- `settings-page.tsx` provides the shared navigation and role-aware section selection. `account-settings.tsx` updates the caller's display name and Auth password. Password changes require matching values of at least 12 characters.
- `workspace-settings.tsx` reads the singleton studio name and IANA timezone and saves through `update_workspace_settings`. The shared read hook lives in `features/workspace/workspace-settings.ts`, which supplies the settings editor, application shell, and notifications without a workspace-to-settings dependency.
- `team-settings.tsx` reads the protected staff directory and invitation history, creates scoped email invitations, and revokes pending invitations. Expiry presentation uses a periodically refreshed clock instead of reading the time during render.
- `client-settings.tsx` creates a client and opening credit account through `create_client`, edits client details, and opens scoped invitation and campaign forms. `campaign-settings.tsx` saves campaign goals and validated date ranges.
- `preset-settings.tsx` creates immutable service-preset revisions. New briefing estimates and timing use the current preset; accepted quotes remain unchanged. The Other service keeps a custom estimate and timing.
- `account-recovery.tsx` sends a real Supabase recovery email and sets a new Auth password after its verification redirect. Invalid or expired links provide a path to request another email.
- `invitation-acceptance.tsx` uses the invitation's opaque token and email-confirmed Auth session. It sets the user's password and calls `accept_invitation`; the backend verifies role, scope, expiry, replay, and existing access before granting membership.

Routes are `/settings/{workspace,team,clients,presets,account}`, `/auth/recovery`, and `/auth/invite`. `/settings` defaults to Workspace for agency users and displays authorized account settings for other roles.

## Invitation delivery

`app/api/invitations/route.ts` accepts an authenticated Bearer token, validates it with Auth `getUser`, reads the caller's protected agency role, validates a bounded request body and same-origin browser requests, then creates the invitation through the caller-scoped RPC. The service credential is used only on the server for `inviteUserByEmail`; role metadata never authorizes membership. The backend serializes rate limits of 20 creations per sender per hour and 50 unexpired pending invitations per installation.

Email failure revokes the pending database invitation and returns an explicit failure. Existing Auth accounts are not silently reassigned or elevated. The interface reports that their access needs studio administration; it does not claim an email was delivered. A revocation failure is surfaced for manual cleanup.

The server needs `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_INTERNAL_URL` (or `NEXT_PUBLIC_SUPABASE_URL` as fallback). Inside Docker, the internal URL must resolve the backend from the application container; the public URL remains browser-reachable. Never prefix the service credential with `NEXT_PUBLIC_` or expose it in a browser bundle. Supabase Auth's redirect allowlist must include the deployed `/auth/invite?token=...` and `/auth/recovery?mode=update` URLs. The local inbox is available at `http://127.0.0.1:55424`; production email delivery requires configured SMTP.

## Verification

From `apps/web`:

```sh
npm run test -- features/settings/settings-model.test.ts
npm run test:e2e -- tests/e2e/intake-admin.spec.ts
npm run typecheck
npx eslint features/settings app/api/invitations app/auth 'app/(workspace)/settings'
```

Unit coverage exercises invitation normalization/scope, password rules, client slugs, and website validation. The E2E suite creates an isolated acceptance client, exercises actual invitation/recovery mail and settings mutations, and removes its resources afterward. It restores the studio/preset values it changes; preset history intentionally records those revisions. Run it against the isolated local backend without resetting the canonical ten-client, twenty-project dataset. Verification results and remaining coverage belong in the [acceptance matrix](../../../../docs/architecture/acceptance-matrix.md).

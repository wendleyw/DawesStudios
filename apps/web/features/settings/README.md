# Settings and account access

The Settings feature persists account, studio, client, campaign, and service-preset changes through the authenticated Supabase contract. Agency users have Workspace, Clients, and Presets. Every authenticated role can open Account. Backend permissions independently reject administrative mutations from clients and designers.

Team moved out of this feature into `features/team/` (`team-page.tsx`, `team-data.ts`): the studio
roster, invitations, role changes and removal. It uses `/team`, with `/settings/team` redirecting there for existing links and its own `SettingsSuccess`/
`invitationRequestSchema` imports from this feature, since invitation validation and the shared
"saved" banner stayed here. See `features/team/README.md` for its own documentation.

- `settings-page.tsx` provides the shared navigation and role-aware section selection. `account-settings.tsx` updates the caller's display name and Auth password. Password changes require matching values of at least 12 characters. For a client person, Your account also shows one Team section per client (`client-team-section.tsx`, styled by `.client-team` and `.client-team-notifications` in `settings.css`, reading its people and notification choice from `features/team/team-data.ts`).
- `workspace-settings.tsx` reads the singleton studio name and IANA timezone and saves through `update_workspace_settings`. The shared read hook lives in `features/workspace/workspace-settings.ts`, which supplies the settings editor, application shell, and notifications without a workspace-to-settings dependency.
- `client-settings.tsx` creates a client and opening credit account through `create_client`, edits client details, sets the client's workspace logo (the avatar beside each client name opens the logo dialog), and opens the client's **People** dialog (`features/team/client-people-dialog.tsx`: people, pending invitations, invite and remove) and campaign forms. The logo is uploaded to `brand-assets` under the client's scope and stored in `clients.logo_path` (`supabase/migrations/202609230010_client_logo.sql`, raster-only since `202609230012_client_logo_raster.sql`); `uploadClientLogoFile`, `saveClientLogo` and `removeClientLogoFile` in `settings-data.ts` are its writes. A retried upload reuses its opaque path, and the replaced file is removed only after the client points at the new one. `campaign-settings.tsx` saves campaign goals and validated date ranges.
- `preset-settings.tsx` creates immutable service-preset revisions. New briefing estimates and timing use the current preset; accepted quotes remain unchanged. The Other service keeps a custom estimate and timing. The list merges presets with `catalogWithPresets` and words each estimate with `estimateLabel`, exactly as the briefing editor does, so a fixed estimate reads **12 credits** rather than a 12–12 range.
- `account-recovery.tsx` sends a real Supabase recovery email and sets a new Auth password after its verification redirect. Invalid or expired links provide a path to request another email.
- `invitation-acceptance.tsx` uses the invitation's opaque token and email-confirmed Auth session. It validates invitation setup against the backend before showing password controls. New accounts set a password; existing accounts retain theirs. `accept_invitation` verifies role, scope, expiry, replay, and existing access before granting membership.

Routes are `/settings/{workspace,clients,presets,account}`, `/team` (a separate feature with a legacy `/settings/team` redirect, see `features/team/README.md`), `/auth/recovery`, and `/auth/invite`. `/settings` defaults to Workspace for agency users and displays authorized account settings for other roles.

## Data access

`settings-data.ts` owns every Supabase query this feature's own components issue, as
[the data-access contract](../../../../docs/architecture/data-access.md) requires. It relocated 8
call sites out of six components: `campaign-settings.tsx` (2: the campaign update and insert),
`client-settings.tsx` (2: the client update and `create_client`), `account-settings.tsx` (1: the
profile update), `preset-settings.tsx` (1: `save_service_preset`), `workspace-settings.tsx` (1:
`update_workspace_settings`), and `invitation-acceptance.tsx` (1: `accept_invitation`). Team's own
three call sites (the roster read, the invitation-history read, and `revoke_invitation`) relocated a
second time, out of `settings-data.ts` into `features/team/team-data.ts`, when Team became its own
feature; see that feature's README for their current table. The later invitation setup read
`useInvitationPasswordRequirement` also lives here and keys its cache by authenticated user and token.

| Source (component)                                                 | Destination in `settings-data.ts`       | Table/procedure                                                                            | Unchanged?                                                                                                                                                         |
| ------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `campaign-settings.tsx` — save (edit branch)                       | `saveCampaign({ mode: "update", ... })` | `campaigns` `.update(payload).eq("id", ...).eq("client_id", ...)`                          | Yes                                                                                                                                                                |
| `campaign-settings.tsx` — save (new branch)                        | `saveCampaign({ mode: "create", ... })` | `campaigns` `.insert({ ...payload, client_id })`                                           | Yes                                                                                                                                                                |
| `client-settings.tsx` — save (edit branch)                         | `saveClient({ mode: "update", ... })`   | `clients` `.update({...}).eq("id", ...)`                                                   | Yes                                                                                                                                                                |
| `client-settings.tsx` — save (new branch)                          | `saveClient({ mode: "create", ... })`   | `rpc("create_client", { p_name, p_slug, p_industry, p_initial_credits })`                  | Yes                                                                                                                                                                |
| `account-settings.tsx` — `saveProfile` mutation                    | `updateProfile()`                       | `profiles` `.update({ display_name }).eq("id", ...)`                                       | Yes                                                                                                                                                                |
| `preset-settings.tsx` — save mutation                              | `saveServicePreset()`                   | `rpc("save_service_preset", { p_service_type, p_min_credits, p_max_credits, p_due_days })` | Yes                                                                                                                                                                |
| `workspace-settings.tsx` — save mutation                           | `saveWorkspaceSettings()`               | `rpc("update_workspace_settings", { p_studio_name, p_timezone })`                          | Yes                                                                                                                                                                |
| `invitation-acceptance.tsx` — `accept` mutation (RPC portion only) | `acceptInvitation()`                    | `rpc("accept_invitation", { p_token })`                                                    | Yes — the `database.auth.updateUser({ password })` call in the same mutation stays in the component; it is Supabase Auth, not a `.from(`/`.rpc(`/`.storage.` query |

Every `.select()` column list, filter, order clause and `assertResult(...)` error surfacing is
unchanged; only the call site moved. Validation, trimming and `clientSlug`/date-range checks stay in
the components exactly as before, per rule 4 of the contract.

The table above records that relocation. Every editing write in it has since gained a
concurrent-edit guard; see below.

### Refusing a stale save

Two agency sessions could open the same record and the second save would silently revert the first.
Each editing write now quotes the revision its form was opened on, the way
`features/projects/project-data.ts` `updateProjectDetails` does:

| Editor                   | Revision it quotes                                                    | Where the refusal is raised                                                                  |
| ------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `client-settings.tsx`    | `clients.updated_at`, held in state from the row the dialog opened on | `saveClient`, on the no-rows result only the `.eq("updated_at", ...)` filter can produce     |
| `campaign-settings.tsx`  | `campaigns.updated_at`, same                                          | `saveCampaign`, same                                                                         |
| `preset-settings.tsx`    | `service_presets.revision`                                            | `save_service_preset`, which raises `PT409` itself                                           |
| `workspace-settings.tsx` | `workspace_settings.updated_at`                                       | `update_workspace_settings`, which raises `PT409` and returns the revision its save produced |

`clients` and `campaigns` gained `updated_at` and a `before update` trigger in
`supabase/migrations/202609210003_concurrent_edit_guards.sql`; the timestamp is always the
database's, never a browser's. The revision a dialog opened on is never refreshed while it stays
open, so a refused save keeps refusing and the text that was typed survives to be copied out. The
studio form is the exception: it stays on screen after a save, so it adopts the revision its own
save returned. `account-settings.tsx` needs no guard — it writes one field of the caller's own row,
so no neighbouring field can be lost.

### Why five domains instead of one shared module

`settings-data.ts` groups its exports by the domain the underlying component serves — clients,
campaigns, presets, workspace, account — rather than as one flat list of 8 functions, because that
is what the components themselves are: five independent tabs (plus invitation acceptance, folded into
"account" because it writes to the same signed-in caller's row) that never share a page and never
want to see each other's mutations invalidate their cache. Each domain gets its own
`<domain>QueryKeys` array and `useInvalidate<Domain>()` hook, following the shape `credit-data.ts`
and `project-data.ts` established, but split five ways instead of held as one `settingsQueryKeys` /
`useInvalidateSettings()` pair. A single shared pair, invalidated by every mutation in the feature,
would change behavior: saving a service preset would also refetch the client list, when today it
refetches only `service-presets`. Splitting by domain is what keeps every mutation invalidating
exactly the query key it invalidated before this migration. Each of these five domains has one
invalidating call site, and gains a named export mainly for a consistent shape and so a second write
added to that domain has one place to invalidate from. (Team, before it moved out entirely, was the
domain with genuine repetition to remove — three mutations invalidating `["invitations"]` — see
`features/team/README.md` for that reasoning in its new home.)

Two write functions — `saveClient` and `saveCampaign` — each combine what was an `if (client) ... else
...` / `if (campaign) ... else ...` branch in a single mutation into one function with a discriminated
`mode: "update" | "create"` input, mirroring the single call site exactly rather than splitting one
mutation's two branches into two exported functions.

`acceptInvitation` in the account domain extracts only the `database.rpc("accept_invitation", ...)`
call from `invitation-acceptance.tsx`'s `accept` mutation. The same mutation's preceding
`database.auth.updateUser({ password })` call stays in the component: it is Supabase Auth, not a
`.from(`/`.rpc(`/`.storage.` query, so it is outside this contract's scope and the boundary check
(`grep -rn '\.from(\|\.rpc(\|\.storage\.' features/settings --include='*.tsx'`) does not expect it to
move.

### `SettingsSuccess`

`features/shared/README.md` evaluated the `<p className="settings-success" role="status">{...}</p>`
markup already and rejected it for `features/shared/` at the time: all 8 call sites were inside this
feature, so a primitive shared by "two or more features" did not apply. Within this feature, the same
markup repeats at 7 call sites (`account-recovery.tsx` ×2, `account-settings.tsx` ×2,
`client-settings.tsx`, `preset-settings.tsx`, `workspace-settings.tsx`) with only the message
varying, exactly the shape that justified `FormError` in `features/shared/`. It is now
`SettingsSuccess` in `settings-success.tsx`. `team/team-page.tsx` also imports it directly from here
rather than duplicating it — a second real cross-feature consumer since Team moved out — which is a
candidate for `features/shared/` per that boundary rule the next time either call site changes; it
was not moved as part of the Team relocation itself, which only moved Team's own components and
data access.

### CSS boundary

`app/globals.css` holds no selector used only by this feature. Every class this feature's
components and `settings.css` reference from `globals.css` — `button`, `primary`, `quiet`,
`form-error` (via the shared `FormError` component), `page-content`, `page-heading` and
`status-badge` — is consumed by at least one other feature as well:

```sh
$ grep -n "settings" apps/web/app/globals.css
# (no output — globals.css defines no settings-specific selector)
```

`status-badge`, for one, looked like a candidate at first glance (only `team/team-page.tsx`, now
outside this feature, uses the bare class), but its tone variants (`.status-badge.tone-active`,
`.tone-attention`, `.tone-complete`) are consumed by `board/board-page.tsx`, `board/board-nodes.tsx`,
`briefings/briefings-page.tsx`, `briefings/briefing-detail.tsx`, `credits/credits-page.tsx`,
`projects/project-page.tsx` and `workspace/home-page.tsx`, so it stays shared. (Those variants used
to be named after project enum values; they now name meanings, and each domain maps its enum onto
one in TypeScript — see `features/shared/status-tone.ts`. `team/team-page.tsx` renders the bare
class, which is the resting `neutral` tone.) No file was moved or split for this step.

## Invitation delivery

The shared Team invitation form accepts an optional full name (trimmed, at most 120 characters).
For a new Auth identity, the server passes it as `display_name` metadata and the existing profile
trigger persists it. Existing users keep their chosen profile name. Local Auth mail is captured
in the test inbox; see the [email runbook](../../../../docs/operations/email.md) for local testing
and Resend production setup.

Invitation and recovery screens render the studio logo in the theme's foreground color, retaining
the original image's accessible name and aspect ratio so the white source remains legible in light mode.

`app/api/invitations/route.ts` accepts an authenticated Bearer token, validates it with Auth `getUser`, reads the caller's protected agency role, validates a bounded request body and same-origin browser requests, then creates the invitation through the caller-scoped RPC. The service credential remains server-only: new accounts receive `inviteUserByEmail`; existing eligible client accounts receive `signInWithOtp` with account creation disabled. Role metadata never authorizes membership. The backend serializes rate limits of 20 creations per sender per hour and 50 unexpired pending invitations per installation.

The request body cap (4096 bytes) is enforced by `readCappedBody` (`invitation-body.ts`), which reads the stream incrementally and cancels it as soon as the cap is crossed. A `Content-Length` precheck alone cannot catch a chunked-encoded request (no `Content-Length` header), and measuring `request.text()`'s result after the fact means the oversized body was already fully buffered; `readCappedBody` mirrors `readBody` in `apps/media/src/server.js` for the same reason.

An active client can accept an invitation to another client while keeping current memberships.
Inviting someone already active in that same client is rejected before sending mail. Removed clients
may return through an explicit client invitation: the route unblocks Auth sign-in, but `removed_at`
continues denying application access until acceptance atomically removes stale memberships, clears
the removal markers and adds only the invited client. Removed staff remain blocked. Invitations
cannot promote an existing client member into staff.

Creation, setup and acceptance refuse a return while the earlier Auth removal is still pending.
`useInvitationPasswordRequirement` reads `invitation_requires_password` with the authenticated
identity and token in its cache key. The RPC validates token ownership and email confirmation, then
returns only the private per-token setup flag recorded before Auth identity creation. GoTrue fills
a temporary password hash when confirming a new invitation, so hash presence cannot identify a
user-chosen password. The acceptance form rechecks immediately before
any password write. URL query hints cannot skip setup or overwrite an existing password, and a link
opened under the wrong account is rejected before password mutation.

Email failure revokes the pending database invitation and returns an explicit failure. A revocation
failure is surfaced for manual cleanup. An unblocked Auth login may remain after failed delivery;
the removal marker still denies application access. The route does not re-ban in compensation,
because doing so could block a concurrent successful invitation. Browser journeys in
`client-invitations.spec.ts` cover both return flows with real local mail, password preservation
and negative scope assertions. Invitations prepared before migration `202609270016` default to
no password setup to protect existing passwords; password recovery provides the setup path for any
older invitation account that still needs a password. Reissuing does not imply a new Auth identity.

The server needs `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_INTERNAL_URL` (or `NEXT_PUBLIC_SUPABASE_URL` as fallback). Inside Docker, the internal URL must resolve the backend from the application container; the public URL remains browser-reachable. Never prefix the service credential with `NEXT_PUBLIC_` or expose it in a browser bundle. Supabase Auth's redirect allowlist must include the deployed `/auth/invite?token=...` and `/auth/recovery?mode=update` URLs. The local inbox is available at `http://127.0.0.1:55424`; production email delivery requires configured SMTP.

## Verification

From `apps/web`:

```sh
npm run test -- features/settings/settings-model.test.ts features/settings/settings-data.test.ts features/settings/invitation-body.test.ts
npm run test:e2e -- tests/e2e/intake-admin.spec.ts
npm run typecheck
npx eslint features/settings app/api/invitations app/auth 'app/(workspace)/settings'
```

Unit coverage exercises invitation normalization/scope, password rules, client slugs, and website
validation (`settings-model.test.ts`), and every relocated write function's exact table/procedure
name, argument shape and database-error surfacing (`settings-data.test.ts`, 18 tests, using the same
Proxy call-recording stub as `features/projects/project-data.test.ts`), and `readCappedBody`
rejecting an oversized chunked body mid-stream, before it is fully buffered
(`invitation-body.test.ts`). The E2E suite creates an
isolated acceptance client, exercises actual invitation/recovery mail and settings mutations, and
removes its resources afterward. It restores the studio/preset values it changes; preset history
intentionally records those revisions. Run it against the isolated local backend without resetting
the canonical ten-client, twenty-five-project dataset. Verification results and remaining coverage
belong in the [acceptance matrix](../../../../docs/architecture/acceptance-matrix.md).

Executed for this data-access migration (Task 12):

- `npm run check` from `apps/web`: typecheck, eslint, prettier and the unit suites. 22 files / 376
  tests pass (358 pre-existing + 18 new in `settings-data.test.ts`). The two lint warnings reported
  belong to `features/board` and predate this task.
- `grep -rn '\.from(\|\.rpc(\|\.storage\.' features/settings --include='*.tsx' | grep -v 'Array\.from('`
  returns no output: no component in this feature issues a Supabase query directly.
- `npm --prefix apps/web run test:e2e -- intake-admin` — see the task-12 handoff report for the full
  run output.

## Browser action coverage

`tests/e2e/settings-actions.spec.ts` verifies disposable agency, designer and client accounts changing
their display names and passwords, rejection of old passwords, sign-out/sign-in, agency logo upload with decoded
image persistence and removal, client logo-write denial, and campaign edits with cross-client
denial and reload persistence. Campaign settings currently offer creation and editing, not deletion.

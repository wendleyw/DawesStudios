# Team

The studio roster, its invitations, role changes and removal — moved out of `features/settings/`
into its own feature, since Team never shared a page or a mutation's cache invalidation with
Studio/Presets/Clients beyond once sharing a tab bar. Agency-only: every other role hitting
`/team` sees the same "Studio settings are private." refusal `settings-page.tsx` shows for
its own non-account tabs, not the roster — `team-page.tsx` renders that refusal itself now that the
route no longer goes through `settings-page.tsx`.

- `team-page.tsx` exports `TeamPage` (the page itself) and `InvitePerson` (the invite dialog, reused
  by `features/settings/client-settings.tsx` for client-scoped invitations). Each member row except
  the signed-in caller's own gets a role select (`Agency`/`Designer`) and a `Remove` button; removal
  asks for confirmation first, mirroring the pattern `projects/project-details.tsx` already uses for
  revoking a single project assignment. A designer's row shows their active-project count instead of
  a bare role badge.
- `InvitePerson` offers an optional full name for studio and client invitations. The form and API
  trim it, omit blank input, and reject names longer than 120 characters. For a new Auth identity,
  the API passes it as `display_name` metadata so the existing profile-creation trigger saves the
  name. An existing account keeps its own profile name; the invitation never overwrites it.
- `team-data.ts` owns every Supabase query this feature issues, as
  [the data-access contract](../../../../docs/architecture/data-access.md) requires.

Route: `/team` renders `TeamPage` directly. `/settings/team` redirects to `/team` for existing links. Team is absent from the Settings tab bar and remains agency-only in the sidebar.

## Data access

| Function                             | Table/procedure                                                                                                                                                                                                                                                                     | Notes                                                                                                                                                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useTeamMembers()`                   | `profiles` `.select("id,display_name,role,avatar_url,removed_at")` `.in("role", ["agency","designer"]).is("removal_completed_at", null)` `.order("display_name")`, then `project_assignments` `.select("designer_id,projects!inner(status)")` `.neq("projects.status","delivered")` | One extra query for the whole list's workload, not one per row: active-project counts grouped by designer, merged onto the roster as `activeProjectCount`.                                                                             |
| `useInvitations()`                   | `invitations` `.select("*")` `.order("created_at", { ascending: false })`                                                                                                                                                                                                           |                                                                                                                                                                                                                                        |
| `revokeInvitation()`                 | `rpc("revoke_invitation", { p_invitation_id })`                                                                                                                                                                                                                                     |                                                                                                                                                                                                                                        |
| `setTeamMemberRole()`                | `rpc("set_team_member_role", { p_profile_id, p_role })`                                                                                                                                                                                                                             |                                                                                                                                                                                                                                        |
| `removeTeamMember()`                 | `POST /api/team-members/{id}/remove`, bearer token                                                                                                                                                                                                                                  | The only write here that does not take `database`: removal's second step bans the Auth account, which needs the service-role key and therefore the server route in `app/api/team-members/[id]/remove/route.ts`, not a direct RPC call. |
| `useClientPeople(clientId)`          | `rpc("client_team", { p_client_id })`; for the studio also `profiles` `.select("id,display_name").eq("role", "client")`                                                                                                                                                             | Studio and client people only. The second read names people who have left.                                                                                                                                                             |
| `usePendingClientRemovals(clientId)` | `client_memberships` `.select("user_id").eq("client_id", …)`, then `profiles` `.select("id,display_name").in("id", …).not("removed_at", "is", null).is("removal_completed_at", null).order("display_name")`                                                                         | Studio only.                                                                                                                                                                                                                           |
| `useClientNotificationChoices()`     | `client_memberships` `.select("client_id,notify_all").eq("user_id", …)`                                                                                                                                                                                                             | Client people only; the membership policy already admits a person's own rows.                                                                                                                                                          |
| `setClientNotifications()`           | `rpc("set_client_notifications", { p_client_id, p_all })`                                                                                                                                                                                                                           |                                                                                                                                                                                                                                        |
| `removeClientMember()`               | `POST /api/clients/{clientId}/members/{profileId}/remove`, bearer token                                                                                                                                                                                                             | Like `removeTeamMember`: blocking sign-in needs the service-role key.                                                                                                                                                                  |

`teamQueryKeys = ["studio-team", "invitations"]` and `useInvalidateTeam()` invalidate both. Before
this feature existed, the equivalent array in `settings-data.ts` was `["invitations"]` only — a real
bug, not a stylistic choice: a role change or removal never refreshed the member list itself, only
the invitation list, and the fix landed in the same move because every call site was changing anyway.

`clientPeopleQueryKeys` is a named-key record, because its writers dirty different subsets: a
removal refreshes `client-people` (the team and the pending-removal list), a person's notification
choice only `client-notification-choices`.

An invitation's "pending" state is one pure rule, `isInvitationPending(invitation, now)` in this
file, rather than each caller comparing `expires_at` to its own clock. `team-page.tsx`'s invitation
list and `client-people-dialog.tsx`'s Invited section both call it, paired with `useNow(60_000)`
(`use-now.ts`: a small live clock, refreshed on an interval — not a Supabase read, so it lives
beside these two consumers rather than in this data-access file) so an invitation that expires while
either is open drops out on its own instead of only after a reopen. Before this fix, the People
dialog froze `Date.now()` once at mount (`useState(() => Date.now())`) and never rechecked it, so an
invitation that expired while the dialog stayed open (or the tab sat idle) kept its row under
**Invited** until the dialog was reopened; the Team page already refreshed its own clock every 60 s,
which is why both now share `useNow` instead of each keeping a separate rule.

### Verifying the workload query

`project_assignments?select=designer_id,projects!inner(status)&projects.status=neq.delivered` was
checked against the live local database (an authenticated agency session, not assumed): PostgREST
resolves the `projects!inner` embed and the `neq` filter correctly, returning one row per active,
non-delivered assignment. No change to the query shape was needed.

## Removal and recovery

`profiles.removed_at` revokes the member's role-based authorization immediately. Existing access tokens cannot read project/brand/internal-channel data or receive new studio notifications. Auth then blocks future sign-ins, and the server writes `removal_completed_at`. Historical profiles, authored comments, versions, and audits remain intact. Already-issued signed file URLs retain their existing expiration; removing membership prevents new authorized reads and URL issuance.

Role changes, removal, assignment, and invitation acceptance serialize membership decisions with one transaction lock. The last-agency guard counts only active profiles. Removed staff cannot change their role, accept another invitation, clear their marker, or receive new project assignments. A removed client may accept an explicit new client invitation; acceptance discards stale memberships before restoring only the invited client. See [invitation delivery](../settings/README.md#invitation-delivery).

A partial removal remains visible as `Access removed · Account block pending`, with `Finish removal` available after reload. Retries keep the original removal time and do not repeat the removal audit. Completed removals disappear from the roster. Member/invitation queries run only for an agency profile, and project assignment options exclude removed designers.

The server-route unit tests cover Auth-ban and completion-write failures, authorization, origin checks, and recovery. Database tests cover active-administrator protection, stale tokens, nullable permission predicates, notification isolation, and idempotency. The browser suite uses disposable accounts to verify the complete UI flow.

## A client's people

A client has one login per person. The studio manages them from Settings → Clients → **People**
(`client-people-dialog.tsx`, opened by `features/settings/client-settings.tsx`): the client's active
people (name and email) with **Remove**, pending invitations (email and expiry, read-only) and the
unchanged `InvitePerson` form. Remove asks first ("<name> loses access to <client>.") and warns when
the client would be left with nobody. `POST /api/clients/{clientId}/members/{profileId}/remove`
mirrors the team route: `remove_client_member` runs first; when it was the person's last client the
RPC also deactivates the account, and the route then blocks sign-in and records
`removal_completed_at`. That membership row is kept as the record of the pending removal, so a
failed second step stays listed as "Access removed · Account block pending" with **Finish removal**
after a reload. Someone who still belongs to another client keeps their login and only loses this
client (and its notifications).

A client person sees one **Team** section per client on Settings → Your account
(`features/settings/client-team-section.tsx`, a Your account block that reads this feature's data):
the client's active people, "You" for themselves, "To add or remove
someone, contact the studio." and their notification choice — **My requests** (the default) or
**All <client> activity** — stored on their own membership by `set_client_notifications`.

`client-people.ts` holds the words every feature uses for a recorded person: `personName` (an active
member by name; someone who left as "<name> (left)" to the studio and "Former member" to the
client; nobody to a designer), `requesterLabel` and `reviewDecisionLabel`. `useClientPeople` is the
one read of a client's people for briefings, projects, reviews and settings.

## Styling boundary

`team.css` declares only genuinely team-only selectors: `.member-role-select`, and `.settings-avatar`
(this page's own avatar circle — its only other historical consumer, `team-settings.tsx`, was
deleted when Team moved out of Settings, so it is no longer shared with anything and does not belong
in `app/globals.css`). `.client-people` (the People dialog) is team-only too; a long email wraps
through the shared `.settings-list-row p` rule in `app/globals.css`.

Everything else the page uses that also has a real consumer in `features/settings/`
(`.settings-sections`, `.settings-block` and its heading/header-row/header-paragraph, `.settings-form`
and its labels/`input`/`select` box styling, `.settings-note`, `.settings-list-row` and its children,
`.settings-dialog-actions`, including their media-query overrides) lives in `app/globals.css`, not
`settings.css` and not duplicated into `team.css` — `client-settings.tsx` and `preset-settings.tsx`
are the other real consumers. `settings.css` keeps the selectors that stayed settings-only
(`.settings-section`, `.settings-form textarea`, `.settings-form > .button`,
`.settings-form input[readonly]`, `.settings-success`, …).

This is [the styling boundary rule](../../../../docs/architecture/design-system.md#styling-boundary)
applied selector by selector, not file by file — grep each candidate class across `apps/web/features`
before assuming a class "belongs" to whichever file happened to declare it first.
`npx vitest run features/shared/stylesheet-boundary --root apps/web` guards this directly, including
its same-file duplicate-selector check (relevant here: `.settings-block header p` had two separate
declarations in the old `settings.css`, at different specificities in file order; moving both into
`app/globals.css` required consolidating them into one rule with the final, cascade-correct
`max-width: 620px` rather than declaring the same selector twice in the new file).

## Cross-feature imports

`team-page.tsx` imports `invitationRequestSchema` from `@/features/settings/settings-model` and
`SettingsSuccess` from `@/features/settings/settings-success` rather than duplicating either: the
invite dialog's validation is identical to the one `client-settings.tsx` still uses for client-scoped
invitations, and the "saved" banner is the same one every other Settings editor uses. `SettingsSuccess`
now has a real consumer outside `features/settings/` for the first time — see that feature's README
for the shared-primitive note this leaves open.

## Verification

From `apps/web`:

```sh
npm run test -- features/team/team-data.test.ts
npx vitest run features/team/team-page.test.tsx features/settings/settings-model.test.ts features/settings/invitation-route.test.ts
npx vitest run features/shared/stylesheet-boundary --root apps/web
npm run check
```

`grep -rn "team-settings" apps/web` returns no output — no stale reference to the old
`features/settings/team-settings.tsx` remains anywhere in the app.

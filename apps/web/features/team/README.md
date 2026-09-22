# Team

The studio roster, its invitations, role changes and removal — moved out of `features/settings/`
into its own feature, since Team never shared a page or a mutation's cache invalidation with
Studio/Presets/Clients beyond once sharing a tab bar. Agency-only: every other role hitting
`/settings/team` sees the same "Studio settings are private." refusal `settings-page.tsx` shows for
its own non-account tabs, not the roster — `team-page.tsx` renders that refusal itself now that the
route no longer goes through `settings-page.tsx`.

- `team-page.tsx` exports `TeamPage` (the page itself) and `InvitePerson` (the invite dialog, reused
  by `features/settings/client-settings.tsx` for client-scoped invitations). Each member row except
  the signed-in caller's own gets a role select (`Agency`/`Designer`) and a `Remove` button; removal
  asks for confirmation first, mirroring the pattern `projects/project-details.tsx` already uses for
  revoking a single project assignment. A designer's row shows their active-project count instead of
  a bare role badge.
- `team-data.ts` owns every Supabase query this feature issues, as
  [the data-access contract](../../../../docs/architecture/data-access.md) requires.

Route: `/settings/team` (`app/(workspace)/settings/team/page.tsx` renders `TeamPage` directly — it no
longer goes through `settings-page.tsx`'s tab shell, though the tab bar there still links to it).

## Data access

| Function              | Table/procedure                                                                                                                                                                                                                         | Notes                                                                                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useTeamMembers()`    | `profiles` `.select("id,display_name,role,avatar_url")` `.in("role", ["agency","designer"])` `.order("display_name")`, then `project_assignments` `.select("designer_id,projects!inner(status)")` `.neq("projects.status","delivered")` | One extra query for the whole list's workload, not one per row: active-project counts grouped by designer, merged onto the roster as `activeProjectCount`.                                                                             |
| `useInvitations()`    | `invitations` `.select("*")` `.order("created_at", { ascending: false })`                                                                                                                                                               |                                                                                                                                                                                                                                        |
| `revokeInvitation()`  | `rpc("revoke_invitation", { p_invitation_id })`                                                                                                                                                                                         |                                                                                                                                                                                                                                        |
| `setTeamMemberRole()` | `rpc("set_team_member_role", { p_profile_id, p_role })`                                                                                                                                                                                 |                                                                                                                                                                                                                                        |
| `removeTeamMember()`  | `POST /api/team-members/{id}/remove`, bearer token                                                                                                                                                                                      | The only write here that does not take `database`: removal's second step bans the Auth account, which needs the service-role key and therefore the server route in `app/api/team-members/[id]/remove/route.ts`, not a direct RPC call. |

`teamQueryKeys = ["studio-team", "invitations"]` and `useInvalidateTeam()` invalidate both. Before
this feature existed, the equivalent array in `settings-data.ts` was `["invitations"]` only — a real
bug, not a stylistic choice: a role change or removal never refreshed the member list itself, only
the invitation list, and the fix landed in the same move because every call site was changing anyway.

### Verifying the workload query

`project_assignments?select=designer_id,projects!inner(status)&projects.status=neq.delivered` was
checked against the live local database (an authenticated agency session, not assumed): PostgREST
resolves the `projects!inner` embed and the `neq` filter correctly, returning one row per active,
non-delivered assignment. No change to the query shape was needed.

## Styling boundary

`team.css` declares only genuinely new, team-only selectors (`.member-role-select`). Everything else
the page uses (`.settings-list-row`, `.settings-avatar`, `.status-badge`, `.settings-block`, …) is
shared with `features/settings/` (`client-settings.tsx`, `preset-settings.tsx`) and stays in
`settings.css` / `app/globals.css` rather than duplicating into this file, per
[the styling boundary rule](../../../../docs/architecture/design-system.md#styling-boundary):
`npx vitest run features/shared/stylesheet-boundary --root apps/web` guards this directly.

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
npx vitest run features/shared/stylesheet-boundary --root apps/web
npm run check
```

`grep -rn "team-settings" apps/web` returns no output — no stale reference to the old
`features/settings/team-settings.tsx` remains anywhere in the app.

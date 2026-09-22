# Team management design

**Date:** 2026-09-22
**Status:** Approved by the user through the brainstorming process; awaiting written-spec review before `writing-plans`.

## Problem

`Studio settings` and `Team` open the same shared page shell (`apps/web/features/settings/settings-page.tsx`),
differing only in which tab is active. The sidebar (`app-shell.tsx`) already gives `Team` its own
top-level link, distinct from `Studio settings` — the navigation promises a separate surface the page
does not deliver.

Separately, `Team` is thinner than the product's own permission model needs it to be:

- `team-settings.tsx` lists agency and designer members in one flat list with no per-member action
  beyond inviting and revoking a **pending** invitation. There is no way to change an accepted
  member's role, and no way to remove an active member's access.
- Nothing joins the list to `project_assignments`, despite "a designer can access only the projects
  assigned to them" being the load-bearing permission rule this product is built on. A studio
  assigning work has no workload signal in the one place that lists its people.

## Scope

Two independent pieces, delivered together in this spec:

- **(A) Team management capability** — change a member's role between `agency` and `designer`,
  remove an active member's access, show each designer's active-project count. This is the
  architecturally sensitive half: new `security definer` functions, new grants, and — for removal —
  a privileged step outside Postgres entirely.
- **(B) Navigation** — `Team` becomes its own top-level surface (`/team`, `features/team/`) instead of
  a tab inside the `Settings` shell. `Studio`, `Presets`, `Clients` and `Your account` stay together
  under `/settings/*` exactly as they are today; only `Team` leaves.

`Clients` staying inside `Settings` is a deliberate choice, not an oversight: this spec only pulls out
what has to move to give Team real management capability. Reorganizing `Clients` is a separate,
future decision.

## Out of scope

- Reactivating a removed member. The user chose "remove access, keep history intact" over a
  soft-delete/reactivation model; removal is not exposed as a paused, reversible state in this pass.
- A client-role account in `Team`. Team management covers `agency` and `designer` only — a client is
  never listed or actionable here, and `Clients`' own invite path is unchanged.
- Revoking an already-issued access token immediately on removal. See **Known limitation** below.
- Workload beyond a count — no per-designer project list or drill-down in this pass.

## Data model and authorization

### Role change — a pure database RPC

```sql
create function public.set_team_member_role(p_profile_id uuid, p_role public.app_role)
  returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.assert_agency();
  if p_role not in ('agency', 'designer') then
    raise exception 'Team members are agency or designer only' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.profiles where id = p_profile_id and role in ('agency', 'designer')
  ) then
    raise exception 'Target is not a team member' using errcode = 'P0001';
  end if;
  if (select role from public.profiles where id = p_profile_id) = 'agency'
     and p_role <> 'agency'
     and (select count(*) from public.profiles where role = 'agency') <= 1
  then
    raise exception 'Cannot change the studio''s only agency member' using errcode = 'P0001';
  end if;
  update public.profiles set role = p_role where id = p_profile_id;
  perform private.audit('member.role_changed', p_profile_id, jsonb_build_object('role', p_role));
end $$;
revoke execute on function public.set_team_member_role(uuid, public.app_role) from public, anon;
grant execute on function public.set_team_member_role(uuid, public.app_role) to authenticated;
```

No Auth-layer involvement: a role change never touches `auth.users`, so it carries none of removal's
two-phase concerns.

### Removal — a data RPC plus a privileged server step

**Why this cannot be one RPC.** `private.is_agency()` / `assert_agency()` gate on `profiles.role`
alone, unconditionally — an agency member's access was never assignment-scoped anywhere in this
schema, so revoking `project_assignments` (which only exist for designers in the first place) does
nothing for an agency member at all. Verified rather than assumed: `private.can_access_client()`
(`202609200001_foundation.sql:221`), the function every brand-data policy gates on, resolves a
designer's access through `exists(... project_assignments a ... a.designer_id = auth.uid())` — so for
a *designer* specifically, revoking every assignment does also close brand-data access, one query
away from a complete removal. It does not follow that assignment revocation is a complete removal for
a designer in general, only that this one path is — asserting "nothing designer-role-gated survives
zero assignments" would mean re-auditing every policy across twenty-five migrations, which this spec
does not attempt. One removal mechanism that works unconditionally for both roles is safer than two
mechanisms where one depends on that unaudited claim. Real removal requires disabling the ability to
sign in, which needs the Auth Admin API — available only to a server holding the service-role key,
never to the browser's `authenticated` role.

**Why this cannot delete the Auth user.** `profiles.id references auth.users on delete cascade`
(`202609200001_foundation.sql:11`), and thirteen tables reference `public.profiles` as a foreign key —
comments, audit events, credit ledger entries, invitations sent, and more. Deleting `auth.users`
cascades into deleting `profiles`, which would orphan or cascade through every one of those
thirteen references — the opposite of "remove access, keep history intact." Removal must **ban**
the account (`ban_duration`), which leaves `auth.users` and every historical reference untouched and
only blocks future sign-ins.

**The data half:**

```sql
create function public.remove_team_member(p_profile_id uuid) returns void
  language plpgsql security definer set search_path='' as $$
begin
  perform private.assert_agency();
  if not exists (
    select 1 from public.profiles where id = p_profile_id and role in ('agency', 'designer')
  ) then
    raise exception 'Target is not a team member' using errcode = 'P0001';
  end if;
  if (select role from public.profiles where id = p_profile_id) = 'agency'
     and (select count(*) from public.profiles where role = 'agency') <= 1
  then
    raise exception 'Cannot remove the studio''s only agency member' using errcode = 'P0001';
  end if;
  delete from public.project_assignments where designer_id = p_profile_id;
  delete from public.notifications where user_id = p_profile_id;
  perform private.audit('member.removed', p_profile_id);
end $$;
revoke execute on function public.remove_team_member(uuid) from public, anon;
grant execute on function public.remove_team_member(uuid) to authenticated;
```

Mirrors `revoke_design_assignment`'s own shape (`202609200015_designer_brief_and_project_integrity.sql:35`)
but over every assignment the departing designer holds, in one statement rather than one call per
project. A designer with zero assignments is a no-op, same as the function it mirrors — removal never
fails because there was nothing to revoke.

**The privileged half**, a new Next.js route mirroring the existing pattern in
`apps/web/app/api/invitations/route.ts` (which already calls `admin.auth.admin.inviteUserByEmail` from
a server-role client):

```
POST /api/team-members/[id]/remove
```

1. Call `remove_team_member(id)` through the caller's own session (so `assert_agency()` and the
   last-agency-member guard run as the actual caller, not as an unconditionally privileged route).
2. On success, call `admin.auth.admin.updateUserById(id, { ban_duration: '876000h' })` using the
   service-role client. `'876000h'` (~100 years) is the documented GoTrue idiom for an effectively
   permanent ban, since the API takes a duration rather than a boolean — confirm the exact accepted
   format against the installed `@supabase/supabase-js` version during implementation rather than
   trusting this spec's copy of it.

**Ordering, and why:** the data RPC runs first. If the ban call then fails, the person has already
lost project access and audit is already recorded — incomplete, but safe, and retrying the route is
free (step 1 is a no-op on a second call, matching the RPC's own idempotence). Reversing the order
would leave a banned account with no audit trail of why, and a failed step 1 afterward would leave
data inconsistent with what the ban implies happened.

### Known limitation — stated, not solved

Banning blocks *future* sign-ins; it does not revoke a token already issued. This session already
reduced `jwt_expiry` to 900 seconds for a related reason (an access token was outliving logout by an
hour). The same 15-minute window applies here: someone removed can keep using an already-issued token
until it expires. Immediate session revocation is out of scope for this spec — recorded as an accepted
gap, not a silent one, and the testing plan below measures it rather than assumes it away.

### Workload — a read, not a write

`useTeamMembers()` (`apps/web/features/settings/settings-data.ts`) gains a joined count of each
designer's rows in `project_assignments` where the project is not `delivered` — active work, not
lifetime totals. One query, no new table, no new column.

## Navigation

- New feature directory `apps/web/features/team/` — `team-page.tsx`, `team-data.ts`,
  `team-model.ts` (as needed), colocated tests — moved out of `features/settings/` rather than
  shared, since Team no longer has anything in common with Studio/Presets/Clients beyond having
  once shared a tab bar.
- New route `apps/web/app/(workspace)/team/page.tsx`, replacing `/settings/team`. Own
  `<h1>Team</h1>` and its own purpose line — not the shared "Keep the studio organized..." copy the
  `Settings` shell uses, since that copy was written for Studio/Presets/Clients, not for
  member management.
- `app-shell.tsx`: the existing sidebar entry's `href` changes from `/settings/team` to `/team`; it
  already sits at its own level, so nothing else about its position changes.
- `settings-page.tsx`: `SettingsTab` drops `"team"`. The agency tab list becomes
  `["workspace", "clients", "presets", "account"]`. `TeamSettings` and its `InvitePerson` export move
  to `features/team/`; `client-settings.tsx`'s existing import of `InvitePerson` updates its path —
  its own use (inviting a client contact) is unaffected.

## Error handling and testing

**pgTAP** (new file, `supabase/tests/database/team_management.test.sql`):

- `set_team_member_role` and `remove_team_member` both refuse a non-agency caller (`42501`).
- Both refuse when the target is `client` or does not exist, and when the target is the studio's
  only agency member (for role change, only when the new role is not `agency`) — all as `P0001`,
  matching this codebase's one convention for a business-rule refusal rather than inventing new codes.
- `remove_team_member` deletes **every** row in `project_assignments` for a designer holding more
  than one, in a single call — the property this RPC exists to add over calling
  `revoke_design_assignment` once per project.
- `remove_team_member` against a designer with zero assignments succeeds (no-op), matching
  `revoke_design_assignment`'s own behavior.

**Browser test** (extends the e2e suite):

- Full route flow: an agency session removes a designer, the designer's prior session (a token
  fetched *before* removal) can still authenticate a read until it naturally expires — this measures
  the known limitation above rather than leaving it as an assumption, and a fresh sign-in attempt
  with the same credentials fails immediately.
- Role change round-trip: promote a designer to agency, confirm `assert_agency()`-gated actions that
  were refused now succeed for that session; demote back, confirm the reverse.
- The last-agency-member guard, exercised from the browser as the only remaining agency account,
  confirming the refusal reaches the UI as a readable message rather than a raw Postgres error.

**Unit tests:** the workload join in `team-data.ts`. Removal reuses the confirmation pattern already
in this codebase for revoking a project assignment — `project-details.tsx` gates that action behind a
"Remove this designer?" modal rather than an inline button — since removing someone from the whole
studio is at least as consequential as removing them from one project.

## Files touched

| Action | Path |
|---|---|
| New migration | `supabase/migrations/202609220001_team_management.sql` |
| New route | `apps/web/app/api/team-members/[id]/remove/route.ts` |
| New route file | `apps/web/app/(workspace)/team/page.tsx` |
| New feature dir | `apps/web/features/team/` (moved from `features/settings/team-settings.tsx`) |
| Modify | `apps/web/features/settings/settings-page.tsx` (drop `team` tab) |
| Modify | `apps/web/features/settings/client-settings.tsx` (update `InvitePerson` import path) |
| Modify | `apps/web/features/workspace/app-shell.tsx` (sidebar href) |
| New pgTAP | `supabase/tests/database/team_management.test.sql` |
| New/extended e2e | `apps/web/tests/e2e/team-management.spec.ts` |

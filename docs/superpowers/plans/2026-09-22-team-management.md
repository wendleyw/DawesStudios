# Team Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the agency real control over its own team — change a member's role, remove an active
member's access, see each designer's active-project count — and give `Team` a navigation surface that
matches the one the sidebar already promises it.

**Architecture:** Two new `security definer` Postgres functions handle the data half (role change,
assignment revocation, the last-agency-member guard); a new Next.js API route handles the privileged
half removal needs (banning the Auth account, which only a service-role client can do); `Team` moves
from a tab inside the shared `Settings` shell into its own route and feature directory.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + Auth Admin API), TanStack Query v5,
pgTAP, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-22-team-management-design.md`

## Global Constraints

- Every new `security definer` function starts with `perform private.assert_agency();` and ends with
  explicit `revoke ... from public,anon` / `grant ... to authenticated` — the pattern every existing
  function in this schema follows; no exceptions.
- Business-rule refusals use `errcode = 'P0001'` — this codebase's one established convention
  (`'Insufficient credit balance'` in `202609200002_workflows.sql:78` is the precedent), not a new code
  per error.
- `Team` covers `agency` and `designer` roles only. A `client` profile is never a valid target for
  either new RPC.
- Removal bans the Auth account (`ban_duration`); it must never delete it —
  `profiles.id references auth.users on delete cascade` and thirteen tables reference `profiles` as a
  foreign key, so a delete would cascade through every one of them.
- The data RPC always runs before the Auth-layer ban in the removal route, and never the reverse — see
  spec section "Ordering, and why" for the exact reasoning.
- English throughout — code, comments, tests, docs, commit messages.
- Conventional Commits; hooks run through `core.hooksPath=.husky/_` (note the trailing `_` — plain
  `.husky` silently no-ops every hook). Confirm gitleaks/lint-staged output appears in each commit.
- Never `git add -A` — untracked files under `docs/superpowers/` may belong to unrelated work in
  flight; stage only the paths a task names.
- `npm run check` and `npm run db:test` must stay green after every task before moving to the next.

---

## Task 1: Team management RPCs

**Files:**
- Create: `supabase/migrations/202609220002_team_management.sql` (verify this number is still free —
  `ls supabase/migrations/ | tail -3` — before creating; another task in flight this session may have
  claimed `202609220001`. Bump to the next free number if not.)
- Test: `supabase/tests/database/team_management.test.sql`

**Interfaces:**
- Produces: `public.set_team_member_role(p_profile_id uuid, p_role public.app_role) returns void` —
  raises `P0001` for a non-team target, an out-of-range `p_role`, or demoting the studio's only
  agency member; raises `42501` for a non-agency caller.
- Produces: `public.remove_team_member(p_profile_id uuid) returns void` — same refusal shape as
  above; on success, deletes every `project_assignments` row for that profile and every
  `notifications` row addressed to it, and writes a `private.audit('member.removed', p_profile_id)`
  event. A target with zero assignments is a no-op, not an error.
- Consumes: `private.assert_agency()`, `private.audit(event_name text, target_id uuid, event_details
  jsonb default '{}')` (`202609200002_workflows.sql:1`) — both already exist, no changes to either.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/202609220002_team_management.sql

-- Changing a member's role between agency and designer. A client profile is never a valid target —
-- Team management is scoped to people who work IN the studio, never the people it serves.
create function public.set_team_member_role(p_profile_id uuid, p_role public.app_role) returns void
  language plpgsql security definer set search_path='' as $$
declare current_role public.app_role;
begin
  perform private.assert_agency();
  if p_role not in ('agency', 'designer') then
    raise exception 'Team members are agency or designer only' using errcode = 'P0001';
  end if;
  select role into current_role from public.profiles where id = p_profile_id;
  if current_role is null or current_role not in ('agency', 'designer') then
    raise exception 'Target is not a team member' using errcode = 'P0001';
  end if;
  if current_role = 'agency' and p_role <> 'agency'
     and (select count(*) from public.profiles where role = 'agency') <= 1
  then
    raise exception 'Cannot change the studio''s only agency member' using errcode = 'P0001';
  end if;
  update public.profiles set role = p_role where id = p_profile_id;
  perform private.audit('member.role_changed', p_profile_id, jsonb_build_object('role', p_role));
end $$;
revoke execute on function public.set_team_member_role(uuid, public.app_role) from public, anon;
grant execute on function public.set_team_member_role(uuid, public.app_role) to authenticated;

-- Removing a member's access to studio data. This is the DATA half only — it never touches
-- auth.users. The privileged half (banning the Auth account so the person cannot sign in at all)
-- lives in `apps/web/app/api/team-members/[id]/remove/route.ts`, Task 2, because only a server
-- holding the service-role key can call the Auth Admin API; a Postgres function running as
-- `authenticated` cannot.
create function public.remove_team_member(p_profile_id uuid) returns void
  language plpgsql security definer set search_path='' as $$
declare current_role public.app_role;
begin
  perform private.assert_agency();
  select role into current_role from public.profiles where id = p_profile_id;
  if current_role is null or current_role not in ('agency', 'designer') then
    raise exception 'Target is not a team member' using errcode = 'P0001';
  end if;
  if current_role = 'agency' and (select count(*) from public.profiles where role = 'agency') <= 1
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

- [ ] **Step 2: Apply the migration**

Run: `supabase migration up --local`
Expected: applies cleanly, no errors. Do **not** run `npm run db:reset` for this — the stack is live
and other work may depend on its current state; a plain `migration up` is additive and safe.

- [ ] **Step 3: Write the failing pgTAP tests**

```sql
-- supabase/tests/database/team_management.test.sql
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- A client cannot call either function, against any target. A subquery for "some client profile"
-- rather than a hand-computed fixture key, for the same reason as the two throws_ok calls below.
select set_config(
  'request.jwt.claim.sub', (select id from public.profiles where role='client' limit 1)::text, true
);
set local role authenticated;
select throws_ok(
  $$select public.set_team_member_role(md5('dawes:designer-1')::uuid,'agency')$$,
  '42501', null, 'A client cannot change a team member''s role'
);
select throws_ok(
  $$select public.remove_team_member(md5('dawes:designer-1')::uuid)$$,
  '42501', null, 'A client cannot remove a team member'
);
reset role;

-- As the agency, exercise the refusals first: they must not depend on setup, only on the seeded
-- dataset already having exactly one agency profile.
select set_config('request.jwt.claim.sub', md5('dawes:agency')::uuid::text, true);
set local role authenticated;
select is(
  (select count(*)::int from public.profiles where role='agency'), 1,
  'Precondition: exactly one agency profile in the seeded dataset'
);
select throws_ok(
  $$select public.set_team_member_role(md5('dawes:agency')::uuid,'designer')$$,
  'P0001', 'Cannot change the studio''s only agency member',
  'Refuses to demote the only agency member'
);
select throws_ok(
  $$select public.remove_team_member(md5('dawes:agency')::uuid)$$,
  'P0001', 'Cannot remove the studio''s only agency member',
  'Refuses to remove the only agency member'
);
-- A subquery for "some client profile" rather than a hardcoded fixture-key guess: this test only
-- needs a profile whose role is 'client', not a specific one, and a live query cannot be wrong about
-- which key maps to which seeded row the way a hand-computed md5('dawes:client-N') can be.
select throws_ok(
  $$select public.set_team_member_role((select id from public.profiles where role='client' limit 1),'agency')$$,
  'P0001', 'Target is not a team member',
  'Refuses a client profile as a role-change target'
);
select throws_ok(
  $$select public.remove_team_member((select id from public.profiles where role='client' limit 1))$$,
  'P0001', 'Target is not a team member',
  'Refuses a client profile as a removal target'
);
select throws_ok(
  $$select public.set_team_member_role(md5('dawes:designer-1')::uuid,'client')$$,
  'P0001', 'Team members are agency or designer only',
  'Refuses an out-of-range role'
);

-- A successful role change round-trips, and is audited.
select public.set_team_member_role(md5('dawes:designer-1')::uuid, 'agency');
select is(
  (select role::text from public.profiles where id=md5('dawes:designer-1')::uuid), 'agency',
  'Role change actually updates profiles.role'
);
select isnt_empty(
  $$select 1 from private.audit_events where event='member.role_changed' and entity_id=md5('dawes:designer-1')::uuid$$,
  'Role change writes an audit event'
);
select public.set_team_member_role(md5('dawes:designer-1')::uuid, 'designer');
select is(
  (select role::text from public.profiles where id=md5('dawes:designer-1')::uuid), 'designer',
  'Role change reverses cleanly'
);

-- Removal revokes every assignment the designer holds, in one call, not one project at a time —
-- the property this function exists to add over calling revoke_design_assignment per project.
select ok(
  (select count(*)::int from public.project_assignments where designer_id=md5('dawes:designer-1')::uuid) > 0,
  'Precondition: the fixture designer holds at least one assignment before removal'
);
select public.remove_team_member(md5('dawes:designer-1')::uuid);
select is(
  (select count(*)::int from public.project_assignments where designer_id=md5('dawes:designer-1')::uuid), 0,
  'Removal revokes every assignment the designer held'
);
select isnt_empty(
  $$select 1 from private.audit_events where event='member.removed' and entity_id=md5('dawes:designer-1')::uuid$$,
  'Removal writes an audit event'
);

-- Removal against a target already holding zero assignments is a no-op, not an error — matching
-- revoke_design_assignment's own behavior (202609200015_designer_brief_and_project_integrity.sql:35).
select lives_ok(
  $$select public.remove_team_member(md5('dawes:designer-1')::uuid)$$,
  'Removing an already-removed member does not error'
);
reset role;

select * from finish();
rollback;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run db:test`
Expected: all new assertions pass; the total assertion count grows from whatever `npm run db:test`
currently reports (confirm the exact current number before this step, do not assume a stale figure).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202609220002_team_management.sql supabase/tests/database/team_management.test.sql
git commit -m "feat(db): add role-change and removal RPCs for team management

Both gate on assert_agency() and refuse a client target or the studio's
only agency member, matching this codebase's P0001 convention for a
business-rule refusal. Removal revokes every project_assignments row for
a designer in one call and is a no-op, not an error, against a target
already holding none.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Removal route — bans the Auth account

**Files:**
- Create: `apps/web/app/api/team-members/[id]/remove/route.ts`

**Interfaces:**
- Consumes: `public.remove_team_member(uuid)` (Task 1); the same server-role-client construction
  pattern already in `apps/web/app/api/invitations/route.ts:25-28,72-74`.
- Produces: `POST /api/team-members/{id}/remove`, called from `apps/web/features/team/team-data.ts`
  (Task 3) with the caller's bearer token, no request body.

- [ ] **Step 1: Write the route**

```ts
// apps/web/app/api/team-members/[id]/remove/route.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@database";

/**
 * Removal is two layers, not one, and this route is the second. The RPC below (Task 1) handles the
 * data layer — revoking project assignments, writing the audit event — but an agency member's
 * access was never assignment-scoped (`private.is_agency()` checks `profiles.role` alone), so
 * nothing in Postgres can fully remove one. Only banning the Auth account does, and that needs the
 * Auth Admin API, which needs the service-role key — never available to the browser's
 * `authenticated` role. See the design spec's "Removal — a data RPC plus a privileged server step".
 *
 * Ordering matters: the RPC runs first. If the ban call then fails, the person has already lost
 * project access and the removal is already audited — incomplete, but safe, and this route is free
 * to retry (the RPC is a no-op on a target with nothing left to revoke). Banning first and running
 * the RPC second would risk a banned account with no audit trail of why.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  if (request.headers.get("origin") && request.headers.get("origin") !== origin)
    return Response.json({ error: "This request must come from your workspace." }, { status: 403 });
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token)
    return Response.json({ error: "Sign in before removing a teammate." }, { status: 401 });
  const url = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !serviceKey)
    return Response.json(
      { error: "Team removal is not configured. Contact the workspace administrator." },
      { status: 503 },
    );
  const caller = createClient<Database>(url, publicKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: rpcError } = await caller.rpc("remove_team_member", { p_profile_id: id });
  if (rpcError) return Response.json({ error: rpcError.message }, { status: 400 });
  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: banError } = await admin.auth.admin.updateUserById(id, {
    ban_duration: "876000h",
  });
  if (banError)
    return Response.json(
      {
        error:
          "Access to studio data was removed, but the account could not be blocked from signing in. Try again.",
      },
      { status: 502 },
    );
  return Response.json({ removed: true });
}
```

- [ ] **Step 2: Verify the build accepts the new dynamic route**

Run: `npm run build`
Expected: exit 0. This is the first `app/api/**/[id]/route.ts` in the codebase (existing dynamic
segments are all page routes) — confirm Next.js 16's `params: Promise<{ id: string }>` shape
compiles and is recognized as a valid route, since there is no prior example to fall back on if this
is wrong.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/team-members/[id]/remove/route.ts
git commit -m "feat(api): add the privileged half of team member removal

Bans the Auth account after the data RPC succeeds, in that order: if the
ban call fails, the person already lost project access and the removal is
already audited, and this route is safe to retry. Mirrors the
service-role client construction already in app/api/invitations/route.ts.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Team data layer

**Files:**
- Create: `apps/web/features/team/team-data.ts`
- Modify: `apps/web/features/settings/settings-data.ts:27-64` (remove `useTeamMembers`,
  `useInvitations`, `teamQueryKeys`, `useInvalidateTeam`, `revokeInvitation` — they move, not copy)
- Modify: `apps/web/features/settings/client-settings.tsx:13` (import path for `InvitePerson`, once
  Task 4 has moved it)
- Test: `apps/web/features/team/team-data.test.ts`

**Interfaces:**
- Consumes: `assertResult`, `SupabaseDatabase` (`@/lib/supabase`); `Profile`, `Invitation`
  (`@/features/settings/settings-model` — types stay put, only the data-access functions move).
- Produces: `useTeamMembers(): UseQueryResult<(Profile & { activeProjectCount: number })[]>`;
  `useInvitations()`; `useInvalidateTeam()`; `revokeInvitation(database, { invitationId })`;
  `setTeamMemberRole(database, { profileId, role }): Promise<void>`;
  `removeTeamMember(session, { profileId }): Promise<void>` (takes the session, not `database` —
  it calls the API route with a bearer token, not an RPC directly).

**A bug fixed in the same move, not a new task:** the current `teamQueryKeys` in
`settings-data.ts:56` is `["invitations"] as const` — it never included `"studio-team"`, the member
list's own query key, so `useInvalidateTeam()` has never refreshed the member list itself. This move
is the right place to fix it, since every call site changes anyway.

- [ ] **Step 1: Write the failing test for the workload join**

```ts
// apps/web/features/team/team-data.test.ts
import { describe, expect, it, vi } from "vitest";
import { teamQueryKeys } from "./team-data";

describe("teamQueryKeys", () => {
  it("includes the member list's own key, not only invitations", () => {
    // Regression guard for the bug this move fixes: useInvalidateTeam() previously invalidated only
    // "invitations", so a role change or removal never refreshed the member list itself.
    expect(teamQueryKeys).toContain("studio-team");
    expect(teamQueryKeys).toContain("invitations");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run features/team/team-data.test.ts`
Expected: FAIL — `./team-data` does not exist yet.

- [ ] **Step 3: Write the data module**

```ts
// apps/web/features/team/team-data.ts
"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult, type SupabaseDatabase } from "@/lib/supabase";
import type { Profile } from "@/features/settings/settings-model";
import type { Invitation } from "@/features/settings/settings-model";
import type { Session } from "@supabase/supabase-js";

export function useTeamMembers() {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["studio-team", session?.user.id],
    queryFn: async () => {
      const members = assertResult(
        await database
          .from("profiles")
          .select("id,display_name,role,avatar_url")
          .in("role", ["agency", "designer"])
          .order("display_name"),
      ) as Profile[];
      // One query for the whole list's workload rather than one per row: active-project counts,
      // grouped by designer, over every non-delivered project they are assigned to.
      const counts = assertResult(
        await database
          .from("project_assignments")
          .select("designer_id,projects!inner(status)")
          .neq("projects.status", "delivered"),
      ) as { designer_id: string }[];
      const byDesigner = new Map<string, number>();
      for (const row of counts) byDesigner.set(row.designer_id, (byDesigner.get(row.designer_id) ?? 0) + 1);
      return members.map((member) => ({
        ...member,
        activeProjectCount: byDesigner.get(member.id) ?? 0,
      }));
    },
  });
}

export function useInvitations() {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["invitations", session?.user.id],
    queryFn: async () =>
      assertResult(
        await database.from("invitations").select("*").order("created_at", { ascending: false }),
      ) as Invitation[],
  });
}

export const teamQueryKeys = ["studio-team", "invitations"] as const;

export function useInvalidateTeam() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      teamQueryKeys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
}

export async function revokeInvitation(
  database: SupabaseDatabase,
  input: { invitationId: string },
) {
  assertResult(await database.rpc("revoke_invitation", { p_invitation_id: input.invitationId }));
}

export async function setTeamMemberRole(
  database: SupabaseDatabase,
  input: { profileId: string; role: "agency" | "designer" },
) {
  assertResult(
    await database.rpc("set_team_member_role", { p_profile_id: input.profileId, p_role: input.role }),
  );
}

/**
 * Unlike every other write in this module, this does not take `database` — removal's second step
 * bans the Auth account, which needs the service-role key and therefore a server route, not a
 * direct RPC call. See `apps/web/app/api/team-members/[id]/remove/route.ts`.
 */
export async function removeTeamMember(session: Session, input: { profileId: string }) {
  const response = await fetch(`/api/team-members/${input.profileId}/remove`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? "The team member could not be removed.");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run features/team/team-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Remove the moved exports from `settings-data.ts`**

Delete `useTeamMembers`, `useInvitations`, `teamQueryKeys`, `useInvalidateTeam`, and
`revokeInvitation` from `apps/web/features/settings/settings-data.ts` (currently lines 27–64) — they
now live only in `team-data.ts`.

- [ ] **Step 6: Run the full unit suite**

Run: `npm run check`
Expected: fails at this point — `team-settings.tsx` (not yet moved, Task 4) still imports the
now-deleted exports from `settings-data.ts`. This failure is expected and temporary; do not treat it
as this task's own regression. Confirm the *only* failures are those stale imports, then proceed to
Task 4 before committing either.

- [ ] **Step 7: Commit** (after Task 4 restores a green `npm run check` — see Task 4 Step 5)

```bash
git add apps/web/features/team/team-data.ts apps/web/features/team/team-data.test.ts apps/web/features/settings/settings-data.ts
git commit -m "refactor(team): move team data access out of settings

Team no longer shares anything with Studio/Presets/Clients beyond having
once shared a tab bar. Also fixes a real bug in the move: teamQueryKeys
only ever invalidated \"invitations\", never the member list's own
\"studio-team\" key, so a role change or removal would not have refreshed
the list without a manual reload.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Team page — role change, removal, workload

**Files:**
- Create: `apps/web/features/team/team-page.tsx` (moved and extended from
  `apps/web/features/settings/team-settings.tsx`; `InvitePerson` moves with it)
- Delete: `apps/web/features/settings/team-settings.tsx`
- Modify: `apps/web/features/settings/client-settings.tsx:13` (import path for `InvitePerson`)
- Modify: `apps/web/features/team/team.css` (new stylesheet for the two additions below; the
  existing `.settings-list-row` etc. classes are reused as-is by copying the file, only new rules for
  the role-select and workload badge are added — see the styling boundary note below)

**Interfaces:**
- Consumes: `useTeamMembers`, `useInvitations`, `useInvalidateTeam`, `revokeInvitation`,
  `setTeamMemberRole`, `removeTeamMember` (Task 3).
- Produces: `TeamPage()` (default export consumed by Task 5's route file); `InvitePerson` (unchanged
  signature, re-exported for `client-settings.tsx`).

**Styling boundary note:** `team.css` is a new feature stylesheet. Per this project's own boundary
rule (`docs/architecture/design-system.md#styling-boundary`), any class it declares that is *also*
used outside `features/team/` must stay in `globals.css` instead — `.settings-list-row`,
`.settings-avatar`, `.status-badge` etc. are used by `client-settings.tsx` and `preset-settings.tsx`
too, so they are **not** moved into `team.css`; only genuinely new, team-only classes
(`.member-role-select`, `.member-workload`) go there. Run
`npx vitest run features/shared/stylesheet-boundary` after this task to confirm nothing crossed the
line.

- [ ] **Step 1: Write the moved-and-extended page**

```tsx
// apps/web/features/team/team-page.tsx
"use client";

import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { useClients } from "@/features/workspace/workspace-data";
import { invitationRequestSchema } from "@/features/settings/settings-model";
import {
  removeTeamMember,
  revokeInvitation,
  setTeamMemberRole,
  useInvalidateTeam,
  useInvitations,
  useTeamMembers,
} from "./team-data";
import { SettingsSuccess } from "@/features/settings/settings-success";
import { FormError } from "@/features/shared/form-error";
import "./team.css";

export function TeamPage() {
  const { database, session } = useAuth();
  const invalidateTeam = useInvalidateTeam();
  const clients = useClients();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const members = useTeamMembers();
  const invitations = useInvitations();
  const revoke = useMutation({
    mutationFn: async (id: string) => revokeInvitation(database, { invitationId: id }),
    onSuccess: () => invalidateTeam(),
  });
  const changeRole = useMutation({
    mutationFn: async (input: { profileId: string; role: "agency" | "designer" }) =>
      setTeamMemberRole(database, input),
    onSuccess: () => invalidateTeam(),
  });
  const remove = useMutation({
    mutationFn: async (profileId: string) => removeTeamMember(session!, { profileId }),
    onSuccess: async () => {
      setRemoving(null);
      await invalidateTeam();
    },
  });
  return (
    <div className="page-content team-page">
      <header className="page-heading">
        <div>
          <h1>Team</h1>
          <p>The people who work in the studio, and what they're carrying right now.</p>
        </div>
      </header>
      <div className="settings-sections">
        <section className="settings-block">
          <header>
            <div>
              <h2>Your team</h2>
              <p>The people who keep good work moving.</p>
            </div>
            <button
              className="button primary"
              onClick={() => {
                setInviteOpen(true);
                setSent(false);
              }}
            >
              <Plus size={15} />
              Invite someone
            </button>
          </header>
          {sent && <SettingsSuccess>Invitation email sent.</SettingsSuccess>}
          {members.isPending ? (
            <p role="status">Loading the team…</p>
          ) : members.error ? (
            <FormError>
              Team members could not be loaded.{" "}
              <button className="button quiet" onClick={() => void members.refetch()}>
                Try again
              </button>
            </FormError>
          ) : (
            <div className="settings-list">
              {members.data?.map((person) => (
                <div className="settings-list-row" key={person.id}>
                  <span className="settings-avatar">
                    {person.display_name
                      .split(" ")
                      .map((value) => value[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <div>
                    <strong>
                      {person.display_name}
                      {person.id === session?.user.id ? " (you)" : ""}
                    </strong>
                    <p>
                      {person.role === "agency"
                        ? "Studio team"
                        : `Designer · ${person.activeProjectCount} active project${person.activeProjectCount === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  {person.id === session?.user.id ? (
                    <span className="status-badge">
                      {person.role === "agency" ? "Agency" : "Designer"}
                    </span>
                  ) : (
                    <>
                      <select
                        className="member-role-select"
                        aria-label={`Change ${person.display_name}'s role`}
                        value={person.role}
                        disabled={changeRole.isPending}
                        onChange={(event) =>
                          changeRole.mutate({
                            profileId: person.id,
                            role: event.target.value as "agency" | "designer",
                          })
                        }
                      >
                        <option value="agency">Agency</option>
                        <option value="designer">Designer</option>
                      </select>
                      <button
                        className="button quiet"
                        onClick={() => setRemoving({ id: person.id, name: person.display_name })}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {changeRole.error && <FormError>{changeRole.error.message}</FormError>}
        </section>
        <section className="settings-block">
          <header>
            <div>
              <h2>Invitations</h2>
              <p>Each invitation is restricted to its email address and expires after seven days.</p>
            </div>
          </header>
          {invitations.isPending ? (
            <p role="status">Loading invitations…</p>
          ) : invitations.error ? (
            <FormError>
              Invitations could not be loaded.{" "}
              <button className="button quiet" onClick={() => void invitations.refetch()}>
                Try again
              </button>
            </FormError>
          ) : invitations.data?.length ? (
            <div className="settings-list">
              {invitations.data.map((item) => {
                const expired =
                  item.status === "pending" && new Date(item.expires_at).getTime() < now;
                return (
                  <div className="settings-list-row" key={item.id}>
                    <div>
                      <strong>{item.email}</strong>
                      <p>
                        {item.role === "client"
                          ? `${clients.data?.find((client) => client.id === item.client_id)?.name ?? "Client"} · Client`
                          : item.role === "agency"
                            ? "Studio team"
                            : "Designer"}
                      </p>
                    </div>
                    <span className="status-badge">
                      {expired
                        ? "Expired"
                        : item.status === "pending"
                          ? "Pending"
                          : item.status === "accepted"
                            ? "Accepted"
                            : "Revoked"}
                    </span>
                    {item.status === "pending" && (
                      <button
                        className="button quiet"
                        disabled={revoke.isPending}
                        onClick={() => revoke.mutate(item.id)}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="settings-note">No invitations yet.</p>
          )}
          {revoke.error && <FormError>{revoke.error.message}</FormError>}
        </section>
      </div>
      {inviteOpen && (
        <InvitePerson
          onClose={() => setInviteOpen(false)}
          onSent={() => {
            setInviteOpen(false);
            setSent(true);
          }}
        />
      )}
      {/* Removing someone from the whole studio is at least as consequential as removing them from
          one project, and that action already asks first (project-details.tsx's "Remove this
          designer?" modal) — the same pattern applies here rather than a new one. */}
      <Modal
        open={!!removing}
        title="Remove this team member?"
        description="They will lose access to every project and cannot sign in again."
        onClose={() => {
          if (!remove.isPending) setRemoving(null);
        }}
      >
        <div className="form-actions">
          <button className="button" onClick={() => setRemoving(null)} disabled={remove.isPending}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={() => removing && remove.mutate(removing.id)}
            disabled={remove.isPending}
          >
            {remove.isPending ? "Removing…" : "Remove"}
          </button>
        </div>
        {remove.error && <FormError>{remove.error.message}</FormError>}
      </Modal>
    </div>
  );
}

export function InvitePerson({
  onClose,
  onSent,
  clientId,
}: {
  onClose: () => void;
  onSent: () => void;
  clientId?: string;
}) {
  const { session } = useAuth();
  const invalidateTeam = useInvalidateTeam();
  const clients = useClients();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"agency" | "client" | "designer">(
    clientId ? "client" : "designer",
  );
  const [selectedClient, setSelectedClient] = useState(clientId ?? "");
  const invite = useMutation({
    mutationFn: async () => {
      const parsed = invitationRequestSchema.safeParse({
        email: email.trim(),
        role,
        ...(role === "client" ? { clientId: selectedClient } : {}),
      });
      if (!parsed.success)
        throw new Error(parsed.error.issues[0]?.message ?? "Check the invitation details.");
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session!.access_token}`,
        },
        body: JSON.stringify(parsed.data),
      });
      const result = (await response.json()) as { error?: string; delivered?: boolean };
      if (!response.ok || !result.delivered)
        throw new Error(result.error ?? "The invitation email could not be sent.");
    },
    onSuccess: async () => {
      await invalidateTeam();
      onSent();
    },
    onError: () => invalidateTeam(),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={clientId ? "Invite a client" : "Invite someone"}
      description="They will receive a secure email to create their account."
    >
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          invite.mutate();
        }}
      >
        <label>
          Email address
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        {!clientId && (
          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
              <option value="designer">Designer</option>
              <option value="agency">Agency</option>
              <option value="client">Client</option>
            </select>
          </label>
        )}
        {role === "client" && !clientId && (
          <label>
            Client
            <select
              required
              value={selectedClient}
              onChange={(event) => setSelectedClient(event.target.value)}
            >
              <option value="">Choose a client</option>
              {clients.data?.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="settings-note">
          {role === "agency"
            ? "Agency members can manage studio work, clients and credits."
            : role === "designer"
              ? "Designers can access only the projects assigned to them."
              : "Clients can access only their own projects and shared work."}
        </p>
        {invite.error && <FormError>{invite.error.message}</FormError>}
        <div className="settings-dialog-actions">
          <button className="button" type="button" onClick={onClose} disabled={invite.isPending}>
            Cancel
          </button>
          <button className="button primary" disabled={invite.isPending || clients.isPending}>
            {invite.isPending ? "Sending invitation…" : "Send invitation"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: Write `team.css`**

```css
/* apps/web/features/team/team.css */
.member-role-select {
  font-size: var(--text-sm);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 4px 8px;
  background: var(--surface);
}
```

- [ ] **Step 3: Delete the old file and fix the one remaining import**

Delete `apps/web/features/settings/team-settings.tsx`. In
`apps/web/features/settings/client-settings.tsx:13`, change:

```ts
import { InvitePerson } from "./team-settings";
```
to:
```ts
import { InvitePerson } from "@/features/team/team-page";
```

- [ ] **Step 4: Run the boundary and unit tests**

Run: `npx vitest run features/shared/stylesheet-boundary`
Expected: PASS — confirms no class in `team.css` collides with another feature's stylesheet, and
that nothing team-specific leaked into `globals.css` or vice versa.

Run: `npm run check`
Expected: PASS, restoring the green suite that Task 3 Step 6 left red. If anything besides
`client-settings.tsx`'s import still references the deleted `team-settings.tsx`, fix it now — search
`grep -rln "team-settings" apps/web` to confirm zero remaining references before treating this as
done.

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/team/team-page.tsx apps/web/features/team/team.css apps/web/features/settings/client-settings.tsx
git rm apps/web/features/settings/team-settings.tsx
git commit -m "feat(team): add role change, removal and workload to the team page

Every member row except the signed-in caller's own gets a role select and
a Remove button; removal asks first, mirroring the confirmation
project-details.tsx already uses for revoking a single project
assignment. A designer's row shows their active-project count instead of
a bare role badge.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Navigation — Team leaves the Settings shell

**Files:**
- Create: `apps/web/app/(workspace)/team/page.tsx`
- Delete: `apps/web/app/(workspace)/settings/team/page.tsx` (and its now-empty parent directory)
- Modify: `apps/web/features/settings/settings-page.tsx:13,37`
- Modify: `apps/web/features/workspace/app-shell.tsx` (the `Team` sidebar link block, currently
  documented at lines 328–336)

- [ ] **Step 1: Write the new route**

```tsx
// apps/web/app/(workspace)/team/page.tsx
import { TeamPage } from "@/features/team/team-page";

export default function Page() {
  return <TeamPage />;
}
```

- [ ] **Step 2: Delete the old route**

```bash
git rm "apps/web/app/(workspace)/settings/team/page.tsx"
rmdir "apps/web/app/(workspace)/settings/team" 2>/dev/null || true
```

- [ ] **Step 3: Drop the `team` tab from the Settings shell**

In `apps/web/features/settings/settings-page.tsx`:

```ts
type SettingsTab = "workspace" | "team" | "clients" | "presets" | "account";
```
becomes:
```ts
type SettingsTab = "workspace" | "clients" | "presets" | "account";
```

and:

```ts
  const tabs: SettingsTab[] =
    profile.role === "agency"
      ? ["workspace", "team", "clients", "presets", "account"]
      : ["account"];
```
becomes:
```ts
  const tabs: SettingsTab[] =
    profile.role === "agency" ? ["workspace", "clients", "presets", "account"] : ["account"];
```

Also remove the now-dead `import { TeamSettings } from "./team-settings";` and the
`tab === "team" ? <TeamSettings /> :` branch in the same file's render.

- [ ] **Step 4: Point the sidebar at the new route**

In `apps/web/features/workspace/app-shell.tsx`, the `Team` link block currently reads:

```tsx
{profile.role === "agency" && (
  /* The same page Studio settings opens on its Team tab, given a way in of its own:
     who is in the studio is a thing you look for by name, not a setting you tune. */
  <Link
    href="/settings/team"
    className={`nav-item ${pathname === "/settings/team" ? "active" : ""}`}
  >
    <Users size={17} />
    <span>Team</span>
  </Link>
)}
```

Replace the comment (now describing a page that no longer exists) and the `href`/`pathname` check:

```tsx
{profile.role === "agency" && (
  <Link href="/team" className={`nav-item ${pathname === "/team" ? "active" : ""}`}>
    <Users size={17} />
    <span>Team</span>
  </Link>
)}
```

- [ ] **Step 5: Run the full suite**

Run: `npm run check && npm run build`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(workspace)/team/page.tsx" apps/web/features/settings/settings-page.tsx apps/web/features/workspace/app-shell.tsx
git rm "apps/web/app/(workspace)/settings/team/page.tsx"
git commit -m "refactor(nav): give Team its own route instead of a Settings tab

The sidebar already linked to Team as if it were separate from Studio
settings; the page now delivers on that. Settings keeps Studio, Presets,
Clients and Your account exactly as they were — only Team leaves.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Browser tests — the full flow, measured

**Files:**
- Create: `apps/web/tests/e2e/team-management.spec.ts`

**Interfaces:**
- Consumes: `signIn`, `credentials`, `localAdmin` (`apps/web/tests/e2e/test-support.ts`) — the same
  helpers every other e2e spec in this suite uses.

- [ ] **Step 1: Write the test file**

```ts
// apps/web/tests/e2e/team-management.spec.ts
import { test, expect } from "@playwright/test";
import { credentials, localAdmin, localAgency, localCaller, signIn } from "./test-support";

test.describe("team management", () => {
  test("role change round-trips and takes effect immediately", async ({ page }) => {
    await signIn(page, credentials.agency);
    await page.goto("/team");
    await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
    const designerRow = page.locator(".settings-list-row", { hasText: "Alex Morgan" });
    await designerRow.getByRole("combobox").selectOption("agency");
    // Confirm the change actually reached the database, not only the optimistic UI.
    await expect(async () => {
      const promoted = await localAdmin
        .from("profiles")
        .select("role")
        .eq("display_name", "Alex Morgan")
        .single();
      expect(promoted.data?.role).toBe("agency");
    }).toPass();
    // Reverse it so later tests in this file see the fixture's original shape.
    await designerRow.getByRole("combobox").selectOption("designer");
    await expect(async () => {
      const reverted = await localAdmin
        .from("profiles")
        .select("role")
        .eq("display_name", "Alex Morgan")
        .single();
      expect(reverted.data?.role).toBe("designer");
    }).toPass();
  });

  test("cannot demote or remove the studio's only agency member", async () => {
    // The signed-in caller's own row never carries a select or a Remove button (Task 4), so there
    // is no UI path to even attempt this — the guard is asserted directly against the RPC instead,
    // the same way `authorization_matrix.test.sql` asserts a database-level refusal pgTAP already
    // covers. This test is about the RPC being reachable and refusing correctly end to end through
    // PostgREST, not a duplicate of Task 1's pgTAP assertion.
    const agencyId = (await localAdmin.from("profiles").select("id").eq("role", "agency").single())
      .data!.id;
    const asAgency = await localAgency();
    const roleRefusal = await asAgency.rpc("set_team_member_role", {
      p_profile_id: agencyId,
      p_role: "designer",
    });
    expect(roleRefusal.error?.message).toContain("Cannot change the studio's only agency member");
    const removeRefusal = await asAgency.rpc("remove_team_member", { p_profile_id: agencyId });
    expect(removeRefusal.error?.message).toContain("Cannot remove the studio's only agency member");
  });

  test("removal revokes access and blocks a fresh sign-in, but an already-issued session survives until its token expires", async ({
    request,
  }) => {
    // This measures the spec's own "Known limitation" rather than assuming it: a session obtained
    // before removal keeps authenticating reads until its access token naturally expires
    // (jwt_expiry = 900s), while a fresh sign-in attempt with the same credentials fails immediately.
    // Held before removal, exactly as a real browser tab would hold it.
    const asDesigner2 = await localCaller(credentials.designer2);
    const target = (
      await localAdmin.from("profiles").select("id").eq("display_name", "Jordan Reed").single()
    ).data!;

    const asAgency = await localAgency();
    const agencySession = (await asAgency.auth.getSession()).data.session!;
    // `request` is Playwright's own fixture, bound to `baseURL` in `playwright.config.ts` — the
    // same pattern `intake-admin.spec.ts` already uses to call `/api/invitations` directly.
    const removal = await request.post(`/api/team-members/${target.id}/remove`, {
      headers: { Authorization: `Bearer ${agencySession.access_token}` },
    });
    expect(removal.status()).toBe(200);

    // A fresh sign-in fails right away — banning blocks new authentication immediately.
    await expect(localCaller(credentials.designer2)).rejects.toThrow();

    // The session obtained before removal still authenticates a read — the known limitation,
    // measured rather than assumed. Uses the SAME client instance held above, not a new one.
    const stillWorks = await asDesigner2.from("profiles").select("id").eq("id", target.id).single();
    expect(stillWorks.error).toBeNull();
    expect(stillWorks.data?.id).toBe(target.id);
  });
});
```

- [ ] **Step 2: Run the new spec in isolation**

Run: `npx playwright test team-management`
Expected: all pass.

- [ ] **Step 3: Run the full browser suite**

Run: `npm run test:e2e`
Expected: every previously-passing spec still passes; the total count grows by the three new tests
above.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/e2e/team-management.spec.ts
git commit -m "test(e2e): cover role change, the last-agency guard and removal

Removal's browser test measures the known limitation the design spec
states rather than assuming it away: a token issued before removal still
authenticates a read until it naturally expires, while a fresh sign-in
with the same credentials fails immediately.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] `npm run check` — green
- [ ] `npm run db:test` — green, assertion count grown by Task 1's new file
- [ ] `npm run test:e2e` — green, spec count grown by Task 6's new file
- [ ] `npm run build` — exit 0
- [ ] `grep -rln "team-settings" apps/web` — no results (confirms Task 4's move left nothing behind)
- [ ] Manually open `/team` and `/settings` as the seeded agency account; confirm Team no longer
      appears as a tab under Settings and the sidebar's Team link lands on the new page.

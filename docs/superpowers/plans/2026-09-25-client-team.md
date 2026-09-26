# Client Team Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every person at a client their own login and make the product record and show who
asked for each briefing and who decided on each version, send project notifications to the person
who asked (with an opt-in to everything), let the studio see, invite and remove a client's people,
and let each person see their team.

**Architecture:** Two migrations add `briefings.requested_by`, `publication_reviews.reviewed_by` and
`client_memberships.notify_all`; the `client_team`, `set_client_notifications`,
`set_briefing_requester` and `remove_client_member` functions; the requester rule inside
`save_briefing`, the reviewer inside `review_publication`, and the routing inside
`private.notify_client` (same signature, so its six callers do not change). `features/team` owns the
one read of a client's people (`useClientPeople`) and the pure naming rules (`client-people.ts`)
that briefings, projects, reviews and settings consume. The studio's People dialog lives in
`features/team` and opens from Settings → Clients; the client's Team section is a Your account block
in `features/settings`; removal goes through a server route that mirrors the team-member removal
route.

**Tech Stack:** Next.js 16.3.5 App Router, React 19.2.8, TanStack Query 5, Supabase (PostgreSQL,
pgTAP), Vitest 5 with Testing Library, Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-09-25-client-team-design.md`

## Global Constraints

- English for all code, identifiers, comments, UI copy and documentation. UI nouns follow
  `docs/architecture/design-system.md` (Interface vocabulary): **Client**, never "workspace";
  **Notification**, never "update".
- UI copy, verbatim from the spec: **People** (the client row's button and the dialog's first
  list), **Invited**, **Invite person**, **Remove**, "`<name>` loses access to `<client>`.", "To add
  or remove someone, contact the studio.", **My requests**, **All `<client>` activity**, "Requested
  by `<name>`", "`<name>` (left)" (studio), "Former member" (client), "Approved by `<name>` ·
  `<date>`", "Changes requested by `<name>` · `<date>`", "You".
- No new dependencies, tables or row-level policies; profile and membership policies do not widen.
  New public functions: `revoke execute … from public, anon` then `grant execute … to
  authenticated`; new private functions: `revoke all … from public, anon, authenticated`.
- Clients never receive designer identity: `client_team` returns only client-role, non-removed
  members; a client resolves a name only through it; designers see neither requester nor reviewer.
- Data access: Supabase calls only in `features/<feature>/<feature>-data.ts`; reads are
  `use<Thing>()` hooks, writes are `async (database, input)`; `removeClientMember` posts to a server
  route, like `removeTeamMember`. Components compose cache keys from exported constants
  (`features/shared/invalidation-boundary.test.ts`).
- Styling: feature rules only in `features/team/team.css`, `features/settings/settings.css` and
  `features/briefings/briefings.css`; shared primitives (`.settings-*`, `.segmented-control`,
  `.status-badge`, `.stack-form`, `.form-actions`, `.button.small`) are reused, never redeclared —
  the one shared-primitive change is `.settings-list-row p` wrapping anywhere (`app/globals.css`);
  a class used by two features belongs in `app/globals.css`; every colour a token
  (`features/shared/theme-colors.test.ts`); no selector in two stylesheets
  (`features/shared/stylesheet-boundary.test.ts`). No new colour is needed.
- Database functions: base every `create or replace` on the live definition
  (`docker exec supabase_db_dawes-studios psql -U postgres -Atc "select pg_get_functiondef('<schema>.<name>'::regproc)"`);
  a changed argument list is dropped explicitly and re-granted. Read-only `psql` queries only; the
  migrations are the only writes.
- Local Supabase: never reset or re-provision; apply with `supabase migration up` from the
  repository root, then `supabase gen types typescript --local > supabase/database.types.ts`.
- The SABRE demonstration overlay stays (10 clients, 68 projects, 50 at SABRE): compare counts with
  database reads, never constants.
- The Next.js dev server on http://localhost:3003 is already running; never start another.
  Playwright always with a private `--output=../outputs/<name>`. Known overlay-count failures:
  `workspace-actions`, `design-audit`, `canonical-workspaces`, `workspace`. `supabase test db` has
  six known failures in `access_and_workflows.test.sql` (2, 4, 9, 18, 32, 54).
- Commands run from `apps/web` unless stated. `npm run check` = typecheck, lint, prettier check,
  vitest; run `npx prettier --write <touched files>` first (it also formats `apps/web/features/**/*.md`).
- One Conventional Commit per task, staging explicit paths only (other sessions share the tree; the
  deleted `login.png` is unrelated), ending with the committing agent's own `Co-Authored-By:` line.
  Each task writes its report to `docs/engineering/handoffs/2026-09-25-client-team-task-<N>.md`
  (template in `docs/engineering/handoffs/README.md`, 30 lines or fewer: changed files, decisions,
  the checks actually run with results, risks, next action) and commits it with the task.
- Do not read `docs/ref`, `docs/engineering/history`, `docs/verification`, screenshots or
  `outputs/`. Never print secrets (`supabase/.env.local`).

## Review Focus

1. A person who belongs to two clients (the playground browser fixture already makes the canonical
   SABRE person a member of a second client): Your account must show one Team section per client with
   independent notification choices, and removing them from one client must keep their login and
   their other client. Pinned in Task 2 (membership-only removal) and Task 5 (two-client test).
2. The sign-in block failing after someone's last client is removed: the person must stay listed as
   "Access removed · Account block pending" with **Finish removal**, including after a reload, and a
   retry must finish without a second audit event. Pinned in Task 2 (retry) and Task 4 (route retry
   tests, pending row in the dialog test).
3. The studio reopening a draft whose requester has since left: the picker must never resend the
   former person, and a client with a single remaining person must open on that person. Pinned in
   Task 6 (`initialRequester` tests and the editor test).
4. A studio reply in a conversation where someone wrote before leaving the client: they must not be
   notified. Pinned in Task 2.
5. Long names, emails and client names at 390 px (the People dialog, the Team section and its "All
   `<client>` activity" button): no horizontal scroll. Pinned in Task 9 (phone checks) with the
   `.settings-list-row p` wrap rule (Task 4) and the segmented-control wrap rule (Task 5).

## Decisions this plan takes where the spec is silent

1. **One person means that person.** When the studio saves without naming a requester and the client
   has exactly one active person, `save_briefing` records that person (the only valid answer) and the
   picker opens on them. With two or more people a choice is required, and a missing or foreign one
   is refused. All ten canonical clients have one person, so every existing studio flow keeps
   working between Task 1 and Task 6.
2. A client person passing `p_requested_by` is ignored: the first client person to save a briefing
   becomes its requester, including a draft the studio filed for a client that had nobody.
3. `set_briefing_requester` refuses null, works on any status and does not touch `updated_at`, so a
   requester change never conflicts with a client's open draft.
4. Removing someone who still belongs to another client deletes that membership and that client's
   notifications for them. Removing someone's **last** client deactivates the account and **keeps the
   membership row** as the record of which client the pending removal belongs to (access already ends
   through `removed_at`), so **Finish removal** survives a reload. This is the one deviation from the
   spec's "deletes that membership", needed for the team route's recovery to be mirrored.
5. `notify_client` keeps its signature, so it recognises a studio reply by `post_comment`'s fixed
   title `New message from Studio`; the database test drives it through `post_comment`, so renaming
   the title fails a test. Conversation participants are client-role authors who are still members.
6. A reviewer who left reads like a requester who left. The spec's "A studio reviewer shows as 'the
   studio'" is not built: `review_publication` admits only client members, so `reviewed_by` is
   always a client person.
7. The Reviews list shows the decision in its note column for decided rows (the release note moves
   to the tooltip); the Briefings list gains a Requested by column that drops below 1000 px like the
   service and date columns.
8. The Overview greeting is already personal (`welcomeTitle(profile.display_name)`); Task 9 checks
   it for a second person and no code changes.
9. Notifications live in `features/workspace`, so the spec's "notifications README" is
   `features/workspace/README.md`. The vocabulary rule turns the spec's "the workspace will have
   nobody" into "`<client>` will have nobody who can sign in until someone is invited."

## File Structure

| Path | Responsibility | Task |
| --- | --- | --- |
| `supabase/migrations/202609250002_client_team.sql` (create) | Three columns, backfill, `private.is_active_client_person`, `client_team`, `set_client_notifications`, `save_briefing`/`save_briefing_revision` with the requester, `set_briefing_requester`, `review_publication` with the reviewer | 1 |
| `supabase/migrations/202609250003_client_notification_routing.sql` (create) | `private.notify_client` routing, `remove_client_member` | 2 |
| `supabase/tests/database/client_team.test.sql` (create) | Every database case of the spec's Testing section | 1, 2 |
| `supabase/database.types.ts` (regenerate) | Generated types | 1, 2 |
| `supabase/scripts/build_seed.py`, `supabase/seed.sql` (modify, regenerate) | Seeded briefings name their creator as requester | 1 |
| `apps/web/features/briefings/briefing-model.test.ts`, `apps/web/features/projects/canvas-versions.test.ts` (modify) | Typed row literals gain the new columns | 1 |
| `apps/web/features/team/client-people.ts` (+ `.test.ts`) (create) | Pure types and naming rules | 3 |
| `apps/web/features/team/team-data.ts` (+ `team-data.test.ts`) (modify) | People reads, notification choice, removal write | 3 |
| `apps/web/app/api/clients/[clientId]/members/[profileId]/remove/route.ts` (create) | RPC, then Auth block and completion | 4 |
| `apps/web/features/team/client-member-removal-server.test.ts` (create) | Route tests | 4 |
| `apps/web/features/team/client-people-dialog.tsx` (+ `.test.tsx`) (create) | Studio People dialog | 4 |
| `apps/web/features/team/team.css`, `apps/web/app/globals.css` (modify) | Dialog rules; list-row paragraphs wrap anywhere | 4 |
| `apps/web/features/settings/client-settings.tsx` (modify) | Invite button becomes People | 4 |
| `apps/web/features/settings/client-team-section.tsx` (+ `.test.tsx`) (create) | Client Team sections and switch | 5 |
| `apps/web/features/settings/account-settings.tsx`, `settings.css` (modify) | Renders the Team sections; their rules | 5 |
| `apps/web/features/briefings/briefing-model.ts`, `briefing-editor.tsx`, `briefing-editor-form.tsx` (+ new `.test.tsx`), `briefing-editor-details.tsx` (modify) | The studio's Requested by picker | 6 |
| `apps/web/features/briefings/briefing-data.ts` (+ test), `briefings-page.tsx` (+ new test), `briefing-detail.tsx` (+ test), `briefings.css`; `apps/web/features/projects/project-details.tsx` (+ new test) (modify) | Requested by labels and the studio's change control | 7 |
| `apps/web/features/reviews/review-data.ts`, `reviews-page.tsx` (+ new test); `apps/web/features/projects/project-data.ts`, `canvas-versions.test.ts`, `project-details.tsx` (+ test); `apps/web/features/overview/overview-model.test.ts` (modify) | Approved by / Changes requested by | 8 |
| `apps/web/tests/e2e/client-team.spec.ts` (create), `apps/web/tests/e2e/project-fixture.ts` (modify) | Browser check | 9 |
| Feature READMEs, `docs/architecture/{backend,permissions,data-access,sitemap,design-system,acceptance-matrix}.md` | Documentation | 10 |
| `docs/verification/client-team-2026-09-25.md`, `docs/engineering/handoff.md` | Verification record and checkpoint | 11 |

---

### Task 1: People, requesters and reviewers in the database

**Files:**
- Create: `supabase/migrations/202609250002_client_team.sql`
- Create: `supabase/tests/database/client_team.test.sql`
- Modify: `supabase/database.types.ts` (regenerated)
- Modify: `supabase/scripts/build_seed.py` (the three `insert('public.briefings', …)` calls), `supabase/seed.sql` (regenerated)
- Modify: `apps/web/features/briefings/briefing-model.test.ts` (typed `briefings` row literal),
  `apps/web/features/projects/canvas-versions.test.ts` (typed `publication_reviews` row literal)
- Create: `docs/engineering/handoffs/2026-09-25-client-team-task-1.md`

**Interfaces:**
- Produces (database):
  - `briefings.requested_by uuid null references profiles(id) on delete set null`
  - `publication_reviews.reviewed_by uuid null references profiles(id) on delete set null`
  - `client_memberships.notify_all boolean not null default false`
  - `public.client_team(p_client_id uuid) returns table(user_id uuid, display_name text, email text)`
  - `public.set_client_notifications(p_client_id uuid, p_all boolean) returns void`
  - `public.save_briefing(… same twelve arguments …, p_requested_by uuid default null) returns uuid`
    and `public.save_briefing_revision(… same …, p_requested_by uuid default null) returns jsonb`
  - `public.set_briefing_requester(p_briefing_id uuid, p_requested_by uuid) returns void`
  - `public.review_publication` records `reviewed_by = auth.uid()`
  - `private.is_active_client_person(target_client uuid, target_user uuid) returns boolean`
  - Error messages (`P0001`): `Choose a person from this client as the requester`, `Choose who requested this briefing`
- Produces (TypeScript, regenerated): `Database["public"]["Functions"]["client_team"]["Returns"]` is
  `{ user_id: string; display_name: string; email: string }[]`; `save_briefing` and
  `save_briefing_revision` Args gain `p_requested_by?: string`.
- Produces (test file): the temporary table `client_team_context`, `pg_temp.context(key)` and
  `pg_temp.act_as(key)`, which Task 2 appends to.

- [ ] **Step 1: Write the failing database test**

Create `supabase/tests/database/client_team.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- One rolled-back transaction. SABRE is client-org-8 and its seeded person client-8; Acme is
-- client-org-1 and client-1 (supabase/seed.sql). Everything created below exists only here.
create temporary table client_team_context(key text primary key,value uuid);
grant all on client_team_context to authenticated;
insert into client_team_context values
  ('sabre',md5('dawes:client-org-8')::uuid),
  ('sabre-person',md5('dawes:client-8')::uuid),
  ('acme',md5('dawes:client-org-1')::uuid),
  ('acme-person',md5('dawes:client-1')::uuid),
  ('agency',md5('dawes:agency')::uuid),
  ('designer',md5('dawes:designer-1')::uuid),
  ('teammate',md5('client-team:teammate')::uuid),
  ('quiet',md5('client-team:quiet')::uuid),
  ('leaving',md5('client-team:leaving')::uuid),
  ('former',md5('client-team:former')::uuid),
  ('solo',md5('client-team:solo-client')::uuid),
  ('solo-person',md5('client-team:solo-person')::uuid),
  ('empty',md5('client-team:empty-client')::uuid),
  ('newcomer',md5('client-team:newcomer')::uuid),
  ('project',md5('client-team:project')::uuid),
  ('deliverable',md5('client-team:deliverable')::uuid),
  ('publication',md5('client-team:publication')::uuid);
create function pg_temp.context(p_key text) returns uuid language sql as $$
  select value from client_team_context where key=p_key
$$;
-- The JWT subject every following statement acts as, until the next call.
create function pg_temp.act_as(p_key text) returns text language sql as $$
  select set_config('request.jwt.claim.sub',pg_temp.context(p_key)::text,true)
$$;

-- Four more SABRE people (Tess edits, Quinn keeps My requests, Riley will leave, Fran is already
-- removed), a client with exactly one person and a client with nobody. A designer given a stray
-- SABRE membership row proves that the role, not the membership, makes someone a client person.
insert into auth.users(id,email,raw_user_meta_data) values
  (pg_temp.context('teammate'),'teammate@client-team.test','{"display_name":"Tess Teammate"}'),
  (pg_temp.context('quiet'),'quiet@client-team.test','{"display_name":"Quinn Quiet"}'),
  (pg_temp.context('leaving'),'leaving@client-team.test','{"display_name":"Riley Leaving"}'),
  (pg_temp.context('former'),'former@client-team.test','{"display_name":"Fran Former"}'),
  (pg_temp.context('solo-person'),'solo@client-team.test','{"display_name":"Sol Only"}'),
  (pg_temp.context('newcomer'),'newcomer@client-team.test','{"display_name":"Nia Newcomer"}');
insert into public.clients(id,name,slug) values
  (pg_temp.context('solo'),'Client team solo fixture','client-team-solo-fixture'),
  (pg_temp.context('empty'),'Client team empty fixture','client-team-empty-fixture');
insert into public.client_memberships(client_id,user_id)
  select pg_temp.context('sabre'),pg_temp.context(k)
  from unnest(array['teammate','quiet','leaving','former','designer']) k;
insert into public.client_memberships(client_id,user_id)
  values(pg_temp.context('solo'),pg_temp.context('solo-person'));
update public.profiles set removed_at=now() where id=pg_temp.context('former');

-- Schema.
select has_column('public','briefings','requested_by','A briefing records who asked for the work');
select has_column('public','publication_reviews','reviewed_by','A review decision records who made it');
select col_not_null('public','client_memberships','notify_all','Every membership carries a notification choice');
select is(
  (select column_default::text from information_schema.columns
    where table_schema='public' and table_name='client_memberships' and column_name='notify_all'),
  'false'::text,'Everyone starts with My requests');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('save_briefing','save_briefing_revision')),
  2,'The old save_briefing signatures are gone, so no overload is left behind');

-- The backfill: a briefing created by one of its client's people names a requester, and no
-- briefing ever names a studio or designer account.
select is(
  (select count(*)::int from public.briefings b
    where b.requested_by is null and exists(
      select 1 from public.client_memberships m join public.profiles p on p.id=m.user_id
      where m.client_id=b.client_id and m.user_id=b.created_by and p.role='client')),
  0,'Every briefing created by one of its client''s people names a requester');
select is(
  (select count(*)::int from public.briefings b join public.profiles p on p.id=b.requested_by
    where p.role<>'client'),
  0,'No briefing names a studio or designer account as its requester');

-- client_team: the client's own people and the studio see the active client people with their
-- emails; another client's person and a designer see nobody; removed people and designers never appear.
select pg_temp.act_as('sabre-person');
set local role authenticated;
select is(
  (select count(*)::int from public.client_team(pg_temp.context('sabre'))
    where user_id in (pg_temp.context('sabre-person'),pg_temp.context('teammate'),
      pg_temp.context('quiet'),pg_temp.context('leaving'))),
  4,'A SABRE person sees every active SABRE person');
select is(
  (select email from public.client_team(pg_temp.context('sabre')) where user_id=pg_temp.context('teammate')),
  'teammate@client-team.test','Teammates see each other''s sign-in email');
select is(
  (select count(*)::int from public.client_team(pg_temp.context('sabre'))
    where user_id in (pg_temp.context('former'),pg_temp.context('designer'))),
  0,'A removed person and a designer are never part of a team');
select pg_temp.act_as('acme-person');
select is_empty($$select 1 from public.client_team(pg_temp.context('sabre'))$$,
  'Another client''s person receives nobody');
select pg_temp.act_as('designer');
select is_empty($$select 1 from public.client_team(pg_temp.context('sabre'))$$,
  'A designer receives nobody');
select pg_temp.act_as('agency');
select is(
  (select display_name from public.client_team(pg_temp.context('sabre')) where user_id=pg_temp.context('teammate')),
  'Tess Teammate','The studio sees a client''s people');
reset role;

-- save_briefing for a client person: the first save names them, a teammate's later edit keeps
-- it, and a client person cannot name someone else.
select pg_temp.act_as('sabre-person');
set local role authenticated;
insert into client_team_context
  select 'first-briefing',public.save_briefing(pg_temp.context('sabre'),'social','Client team: first save');
select is((select requested_by from public.briefings where id=pg_temp.context('first-briefing')),
  pg_temp.context('sabre-person'),'The person who first saves a briefing becomes its requester');
select pg_temp.act_as('teammate');
select lives_ok($$select public.save_briefing(pg_temp.context('sabre'),'social','Client team: edited by a teammate',
    p_briefing_id:=pg_temp.context('first-briefing'),
    p_expected_updated_at:=(select updated_at from public.briefings where id=pg_temp.context('first-briefing')))$$,
  'A teammate edits the draft');
select is((select title from public.briefings where id=pg_temp.context('first-briefing')),
  'Client team: edited by a teammate','The teammate''s edit is saved');
select is((select requested_by from public.briefings where id=pg_temp.context('first-briefing')),
  pg_temp.context('sabre-person'),'A teammate''s later edit keeps the requester');
insert into client_team_context
  select 'teammate-briefing',public.save_briefing(pg_temp.context('sabre'),'social','Client team: naming someone else',
    p_requested_by:=pg_temp.context('sabre-person'));
select is((select requested_by from public.briefings where id=pg_temp.context('teammate-briefing')),
  pg_temp.context('teammate'),'A client person cannot name someone else as the requester');
reset role;

-- save_briefing for the studio: its choice is validated, a client with several people needs one,
-- a client with exactly one person gets that person, and a client with nobody stays empty.
select pg_temp.act_as('agency');
set local role authenticated;
insert into client_team_context
  select 'studio-briefing',public.save_briefing(pg_temp.context('sabre'),'social','Client team: filed by the studio',
    p_requested_by:=pg_temp.context('teammate'));
select throws_ok($$select public.save_briefing(pg_temp.context('sabre'),'social','Client team: nobody named')$$,
  'P0001','Choose who requested this briefing','The studio must name a requester when the client has several people');
select throws_ok($$select public.save_briefing(pg_temp.context('sabre'),'social','Client team: wrong client',
    p_requested_by:=pg_temp.context('acme-person'))$$,
  'P0001','Choose a person from this client as the requester','Another client''s person cannot be the requester');
select throws_ok($$select public.save_briefing(pg_temp.context('sabre'),'social','Client team: a designer',
    p_requested_by:=pg_temp.context('designer'))$$,
  'P0001','Choose a person from this client as the requester','A designer cannot be the requester, even with a membership row');
select throws_ok($$select public.save_briefing(pg_temp.context('sabre'),'social','Client team: removed',
    p_requested_by:=pg_temp.context('former'))$$,
  'P0001','Choose a person from this client as the requester','A removed person cannot be the requester');
select throws_ok($$select public.save_briefing(pg_temp.context('sabre'),'social','Client team: the studio',
    p_requested_by:=pg_temp.context('agency'))$$,
  'P0001','Choose a person from this client as the requester','The studio cannot name itself');
insert into client_team_context
  select 'solo-briefing',public.save_briefing(pg_temp.context('solo'),'social','Client team: one person');
insert into client_team_context
  select 'empty-briefing',public.save_briefing(pg_temp.context('empty'),'social','Client team: nobody yet');
reset role;
select is((select requested_by from public.briefings where id=pg_temp.context('studio-briefing')),
  pg_temp.context('teammate'),'The studio''s choice of requester is saved');
select is((select created_by from public.briefings where id=pg_temp.context('studio-briefing')),
  pg_temp.context('agency'),'The studio stays the briefing''s creator');
select is((select requested_by from public.briefings where id=pg_temp.context('solo-briefing')),
  pg_temp.context('solo-person'),'A client with exactly one person names that person');
select ok((select requested_by is null from public.briefings where id=pg_temp.context('empty-briefing')),
  'A briefing for a client with nobody has no requester');

-- The first client person to save a briefing the studio filed for nobody becomes its requester.
insert into public.client_memberships(client_id,user_id) values(pg_temp.context('empty'),pg_temp.context('newcomer'));
select pg_temp.act_as('newcomer');
set local role authenticated;
select lives_ok($$select public.save_briefing(pg_temp.context('empty'),'social','Client team: picked up',
    p_briefing_id:=pg_temp.context('empty-briefing'),
    p_expected_updated_at:=(select updated_at from public.briefings where id=pg_temp.context('empty-briefing')))$$,
  'A newly invited person saves the studio''s draft');
reset role;
select is((select requested_by from public.briefings where id=pg_temp.context('empty-briefing')),
  pg_temp.context('newcomer'),'The first client person to save it becomes its requester');

-- set_briefing_requester: the studio only, validated like its first choice, and audited.
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.set_briefing_requester(pg_temp.context('first-briefing'),pg_temp.context('quiet'))$$,
  'The studio changes a briefing''s requester');
select throws_ok($$select public.set_briefing_requester(pg_temp.context('first-briefing'),pg_temp.context('acme-person'))$$,
  'P0001','Choose a person from this client as the requester','The change is validated like the first choice');
select throws_ok($$select public.set_briefing_requester(pg_temp.context('first-briefing'),null)$$,
  'P0001','Choose a person from this client as the requester','The studio cannot clear the requester');
select pg_temp.act_as('sabre-person');
select throws_ok($$select public.set_briefing_requester(pg_temp.context('first-briefing'),pg_temp.context('sabre-person'))$$,
  '42501',null,'A client person cannot change the requester');
select pg_temp.act_as('designer');
select throws_ok($$select public.set_briefing_requester(pg_temp.context('first-briefing'),pg_temp.context('sabre-person'))$$,
  '42501',null,'A designer cannot change the requester');
reset role;
select is((select requested_by from public.briefings where id=pg_temp.context('first-briefing')),
  pg_temp.context('quiet'),'The changed requester is stored');
select isnt_empty($$select 1 from private.audit_events
    where event='briefing.requester_changed' and entity_id=pg_temp.context('first-briefing')$$,
  'Changing the requester is audited');

-- review_publication records who decided.
insert into public.projects(id,client_id,briefing_id,title,service_type)
  values(pg_temp.context('project'),pg_temp.context('sabre'),pg_temp.context('studio-briefing'),
    'Client team: reviewed project','social');
insert into public.deliverables(id,project_id,name,format,width,height,quantity,scope,sort_order)
  values(pg_temp.context('deliverable'),pg_temp.context('project'),'Campaign square','square',1080,1080,1,'original',0);
insert into public.published_versions(id,project_id,deliverable_id,version_number)
  values(pg_temp.context('publication'),pg_temp.context('project'),pg_temp.context('deliverable'),1);
insert into public.publication_reviews(publication_id,project_id)
  values(pg_temp.context('publication'),pg_temp.context('project'));
select pg_temp.act_as('teammate');
set local role authenticated;
select lives_ok($$select public.review_publication(pg_temp.context('publication'),'approved','')$$,
  'A teammate approves the version');
reset role;
select is((select reviewed_by from public.publication_reviews where publication_id=pg_temp.context('publication')),
  pg_temp.context('teammate'),'The review records the person who decided');
select ok((select reviewed_at is not null from public.publication_reviews where publication_id=pg_temp.context('publication')),
  'The review records when they decided');

-- set_client_notifications: only the person, only for a client they belong to.
select pg_temp.act_as('quiet');
set local role authenticated;
select lives_ok($$select public.set_client_notifications(pg_temp.context('sabre'),true)$$,
  'A person switches on all activity at their client');
select is((select notify_all from public.client_memberships
    where client_id=pg_temp.context('sabre') and user_id=pg_temp.context('quiet')),
  true,'A person reads their own choice back');
select lives_ok($$select public.set_client_notifications(pg_temp.context('sabre'),false)$$,
  'A person switches back to My requests');
select throws_ok($$select public.set_client_notifications(pg_temp.context('sabre'),null)$$,
  '22023',null,'A choice is required');
select throws_ok($$select public.set_client_notifications(pg_temp.context('acme'),true)$$,
  '42501',null,'A person cannot choose for a client they do not belong to');
select pg_temp.act_as('agency');
select throws_ok($$select public.set_client_notifications(pg_temp.context('sabre'),true)$$,
  '42501',null,'The studio cannot choose for a client''s people');
reset role;
select is((select notify_all from public.client_memberships
    where client_id=pg_temp.context('sabre') and user_id=pg_temp.context('quiet')),
  false,'The choice stays where the person left it');

-- Grants.
select ok(not has_function_privilege('anon','public.client_team(uuid)','execute'),
  'Anonymous callers cannot read a client''s people');
select ok(not has_function_privilege('anon','public.set_briefing_requester(uuid,uuid)','execute'),
  'Anonymous callers cannot change a requester');
select ok(not has_function_privilege('anon','public.set_client_notifications(uuid,boolean)','execute'),
  'Anonymous callers cannot change a notification choice');
select ok(has_function_privilege('authenticated',
    'public.save_briefing(uuid,text,text,uuid,text,text,jsonb,jsonb,date,integer,uuid,timestamptz,uuid)','execute'),
  'Signed-in callers can still save briefings');
select ok(has_function_privilege('authenticated',
    'public.save_briefing_revision(uuid,text,text,uuid,text,text,jsonb,jsonb,date,integer,uuid,timestamptz,uuid)','execute'),
  'Signed-in callers can still save briefing revisions');
select ok(not has_function_privilege('authenticated','private.is_active_client_person(uuid,uuid)','execute'),
  'The membership helper stays inside the database');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run (repository root): `supabase test db supabase/tests/database/client_team.test.sql`
(if the CLI rejects a path, run `supabase test db` and read this file's lines)
Expected: FAIL — `has_column … requested_by` and the `notify_all` checks fail, then the file stops
at the backfill check with `column b.requested_by does not exist`.

- [ ] **Step 3: Confirm the live definitions this migration copies**

Run (repository root, read-only):

```bash
for f in "public.save_briefing(uuid,text,text,uuid,text,text,jsonb,jsonb,date,integer,uuid,timestamptz)" \
         "public.save_briefing_revision(uuid,text,text,uuid,text,text,jsonb,jsonb,date,integer,uuid,timestamptz)" \
         "public.review_publication(uuid,text,text)"; do
  docker exec supabase_db_dawes-studios psql -U postgres -Atc "select pg_get_functiondef('$f'::regprocedure)"
done
```

Expected: `save_briefing` is the body of `202609200023_draft_conflict_response.sql` (the `PT409`
conflict), `save_briefing_revision` the body of `202609200022_atomic_draft_revision.sql`, and
`review_publication` the body of `202609200018_review_serialization.sql` — each reproduced in Step 4
with only the changes its comment names. If a live body differs, base Step 4 on the live body and
re-apply only those changes.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/202609250002_client_team.sql`:

```sql
-- Several people in one client: who asked for each briefing, who decided on each version, and each
-- person's notification choice. Spec: docs/superpowers/specs/2026-09-25-client-team-design.md.

alter table public.briefings
  add column requested_by uuid references public.profiles(id) on delete set null;
alter table public.publication_reviews
  add column reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.client_memberships
  add column notify_all boolean not null default false;

create index briefings_requested_by_idx on public.briefings(requested_by)
  where requested_by is not null;
create index publication_reviews_reviewed_by_idx on public.publication_reviews(reviewed_by)
  where reviewed_by is not null;

-- Existing briefings take their creator when that person is one of the client's people, and stay
-- empty otherwise. The two scope triggers re-validate every submitted briefing on any update; this
-- backfill changes no scope, so they pause for it instead of re-judging old rows against today's
-- catalog.
alter table public.briefings disable trigger validate_submitted_briefing_scope;
alter table public.briefings disable trigger validate_submitted_service_answers;
update public.briefings b set requested_by = b.created_by
where b.requested_by is null
  and exists (
    select 1 from public.client_memberships m
    join public.profiles p on p.id = m.user_id
    where m.client_id = b.client_id and m.user_id = b.created_by and p.role = 'client'
  );
alter table public.briefings enable trigger validate_submitted_briefing_scope;
alter table public.briefings enable trigger validate_submitted_service_answers;

-- One of a client's active people: a client-role member who has not been removed.
create function private.is_active_client_person(target_client uuid, target_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.client_memberships m
    join public.profiles p on p.id = m.user_id
    where m.client_id = target_client and m.user_id = target_user
      and p.role = 'client' and p.removed_at is null
  )
$$;
revoke all on function private.is_active_client_person(uuid, uuid) from public, anon, authenticated;

-- A client's active people with their sign-in emails, for the studio and for that client's own
-- people only; anyone else receives no rows. Profile and membership policies stay narrow: this is
-- the one widened read, and designers are never part of a team.
create function public.client_team(p_client_id uuid)
returns table (user_id uuid, display_name text, email text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, coalesce(u.email, '')::text
  from public.client_memberships m
  join public.profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  where m.client_id = p_client_id
    and p.role = 'client'
    and p.removed_at is null
    and (private.is_agency() or private.is_client_member(p_client_id))
  order by lower(p.display_name), p.id
$$;
revoke execute on function public.client_team(uuid) from public, anon;
grant execute on function public.client_team(uuid) to authenticated;

-- A person's own choice for one of their clients: false is My requests (the briefings they asked
-- for, and conversations they joined), true is every project at that client. The studio cannot set it.
create function public.set_client_notifications(p_client_id uuid, p_all boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_all is null then
    raise exception 'Choose which notifications to receive' using errcode = '22023';
  end if;
  if not private.is_client_member(p_client_id) then
    raise exception 'Client access required' using errcode = '42501';
  end if;
  update public.client_memberships set notify_all = p_all
  where client_id = p_client_id and user_id = auth.uid();
end $$;
revoke execute on function public.set_client_notifications(uuid, boolean) from public, anon;
grant execute on function public.set_client_notifications(uuid, boolean) to authenticated;

-- A new trailing argument would leave an overload behind, so both signatures are replaced.
drop function public.save_briefing_revision(uuid,text,text,uuid,text,text,jsonb,jsonb,date,integer,uuid,timestamptz);
drop function public.save_briefing(uuid,text,text,uuid,text,text,jsonb,jsonb,date,integer,uuid,timestamptz);

-- The body of 202609200023_draft_conflict_response.sql plus the requester. A client person's first
-- save names them and later saves by anyone at the client keep it; a client person's
-- p_requested_by is ignored. The studio names one of the client's active people; when the client
-- has exactly one, that person is the only possible answer and is filled in; with several, a
-- missing choice is refused. That check runs after the write, so a scope error (such as another
-- client's campaign) keeps its own code.
create function public.save_briefing(
  p_client_id uuid,
  p_service_type text,
  p_title text default '',
  p_campaign_id uuid default null,
  p_overview text default '',
  p_goals text default '',
  p_direction jsonb default '{}'::jsonb,
  p_deliverables jsonb default '[]'::jsonb,
  p_due_date date default null,
  p_estimated_credits integer default 1,
  p_briefing_id uuid default null,
  p_expected_updated_at timestamptz default null,
  p_requested_by uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  result_id uuid;
  existing public.briefings;
  studio boolean := private.is_agency();
  requester uuid;
  people integer;
begin
  if not (studio or private.is_client_member(p_client_id)) then
    raise exception 'Client access required' using errcode = '42501';
  end if;
  if studio and p_requested_by is not null
     and not private.is_active_client_person(p_client_id, p_requested_by) then
    raise exception 'Choose a person from this client as the requester' using errcode = 'P0001';
  end if;
  if p_briefing_id is not null then
    select * into existing from public.briefings
      where id = p_briefing_id and client_id = p_client_id for update;
    if not found then raise exception 'Briefing not found'; end if;
    if p_expected_updated_at is null or existing.updated_at <> p_expected_updated_at then
      raise exception 'This draft changed in another session. Reload before saving.' using errcode = 'PT409';
    end if;
    if existing.status <> 'draft' then raise exception 'Only draft briefings can be edited'; end if;
  end if;
  if studio then
    requester := coalesce(p_requested_by, existing.requested_by);
    if requester is null then
      select (array_agg(m.user_id))[1], count(*) into requester, people
        from public.client_memberships m
        join public.profiles p on p.id = m.user_id
        where m.client_id = p_client_id and p.role = 'client' and p.removed_at is null;
      if people <> 1 then requester := null; end if;
    end if;
  else
    requester := coalesce(existing.requested_by, auth.uid());
  end if;
  if p_briefing_id is not null then
    update public.briefings set service_type = p_service_type, title = p_title,
      campaign_id = p_campaign_id, overview = p_overview, goals = p_goals, direction = p_direction,
      requested_deliverables = p_deliverables, due_date = p_due_date,
      estimated_credits = p_estimated_credits, requested_by = requester,
      updated_at = clock_timestamp()
      where id = p_briefing_id;
    result_id := p_briefing_id;
  else
    insert into public.briefings(client_id, service_type, title, campaign_id, overview, goals,
      direction, requested_deliverables, due_date, estimated_credits, created_by, requested_by)
      values (p_client_id, p_service_type, p_title, p_campaign_id, p_overview, p_goals,
      p_direction, p_deliverables, p_due_date, p_estimated_credits, auth.uid(), requester)
      returning id into result_id;
  end if;
  if studio and requester is null and people > 0 then
    raise exception 'Choose who requested this briefing' using errcode = 'P0001';
  end if;
  return result_id;
end $$;
revoke execute on function public.save_briefing(uuid,text,text,uuid,text,text,jsonb,jsonb,date,integer,uuid,timestamptz,uuid) from public, anon;
grant execute on function public.save_briefing(uuid,text,text,uuid,text,text,jsonb,jsonb,date,integer,uuid,timestamptz,uuid) to authenticated;

-- The body of 202609200022_atomic_draft_revision.sql, passing the requester through.
create function public.save_briefing_revision(
  p_client_id uuid,
  p_service_type text,
  p_title text default '',
  p_campaign_id uuid default null,
  p_overview text default '',
  p_goals text default '',
  p_direction jsonb default '{}'::jsonb,
  p_deliverables jsonb default '[]'::jsonb,
  p_due_date date default null,
  p_estimated_credits integer default 1,
  p_briefing_id uuid default null,
  p_expected_updated_at timestamptz default null,
  p_requested_by uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result_id uuid; result_revision timestamptz;
begin
  result_id := public.save_briefing(p_client_id, p_service_type, p_title, p_campaign_id,
    p_overview, p_goals, p_direction, p_deliverables, p_due_date, p_estimated_credits,
    p_briefing_id, p_expected_updated_at, p_requested_by);
  select updated_at into result_revision from public.briefings where id = result_id;
  return jsonb_build_object('id', result_id, 'updated_at', result_revision);
end $$;
revoke execute on function public.save_briefing_revision(uuid,text,text,uuid,text,text,jsonb,jsonb,date,integer,uuid,timestamptz,uuid) from public, anon;
grant execute on function public.save_briefing_revision(uuid,text,text,uuid,text,text,jsonb,jsonb,date,integer,uuid,timestamptz,uuid) to authenticated;

-- The studio changes who a briefing's work is for, for example after the requester leaves: any
-- status, one of the client's active people, never empty. `updated_at` is left alone, so a
-- client's open draft does not read the change as a conflicting edit.
create function public.set_briefing_requester(p_briefing_id uuid, p_requested_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.briefings;
begin
  perform private.assert_agency();
  select * into target from public.briefings where id = p_briefing_id for update;
  if not found then raise exception 'Briefing not found'; end if;
  if not private.is_active_client_person(target.client_id, p_requested_by) then
    raise exception 'Choose a person from this client as the requester' using errcode = 'P0001';
  end if;
  if target.requested_by is not distinct from p_requested_by then return; end if;
  update public.briefings set requested_by = p_requested_by where id = target.id;
  perform private.audit('briefing.requester_changed', target.id,
    jsonb_build_object('requested_by', p_requested_by));
end $$;
revoke execute on function public.set_briefing_requester(uuid, uuid) from public, anon;
grant execute on function public.set_briefing_requester(uuid, uuid) to authenticated;

-- The body of 202609200018_review_serialization.sql plus `reviewed_by=auth.uid()`: the person
-- deciding. Same signature, so its grants are kept.
create or replace function public.review_publication(p_publication_id uuid, p_decision text, p_feedback text default '')
returns void language plpgsql security definer set search_path = '' as $$
 declare target_project uuid;target_client uuid;target_deliverable uuid;publication_number integer;existing public.publication_reviews;project_state public.project_status; begin
 select v.project_id,p.client_id,v.deliverable_id,v.version_number into target_project,target_client,target_deliverable,publication_number from public.published_versions v join public.projects p on p.id=v.project_id where v.id=p_publication_id;
 if not found or not private.is_client_member(target_client) then raise exception 'Client review access required' using errcode='42501'; end if;
 if p_decision not in ('approved','changes_requested') then raise exception 'Invalid review decision'; end if;
 p_feedback:=trim(coalesce(p_feedback,''));
 if p_decision='changes_requested' and p_feedback='' then raise exception 'Describe the requested changes'; end if;
 select status into project_state from public.projects where id=target_project for update;
 if exists(select 1 from public.published_versions where deliverable_id=target_deliverable and version_number>publication_number) then raise exception 'Review the latest published version'; end if;
 select * into existing from public.publication_reviews where publication_id=p_publication_id for update;
 if existing.status<>'pending' then
  if existing.status=p_decision and existing.feedback=p_feedback then return; end if;
  raise exception 'This publication already has a review decision';
 end if;
 if project_state='delivered' then raise exception 'Delivered projects cannot be reviewed'; end if;
 update public.publication_reviews set status=p_decision,feedback=p_feedback,reviewed_at=now(),reviewed_by=auth.uid() where publication_id=p_publication_id;
 update public.projects set status=case
  when exists(select 1 from public.published_versions v join public.publication_reviews r on r.publication_id=v.id where v.project_id=target_project and r.status='changes_requested' and v.version_number=(select max(v2.version_number) from public.published_versions v2 where v2.deliverable_id=v.deliverable_id)) then 'changes_requested'::public.project_status
  when exists(select 1 from public.deliverables d where d.project_id=target_project and not exists(select 1 from public.published_versions v join public.publication_reviews r on r.publication_id=v.id where v.deliverable_id=d.id and r.status='approved' and v.version_number=(select max(v2.version_number) from public.published_versions v2 where v2.deliverable_id=d.id))) then 'client_review'::public.project_status
  else 'approved'::public.project_status end,updated_at=now() where id=target_project;
 perform private.notify_agency(target_client,target_project,case when p_decision='approved' then 'Client approved a design' else 'Client requested changes' end,p_feedback);
 perform private.audit('publication.reviewed',p_publication_id,jsonb_build_object('decision',p_decision));
end $$;
```

- [ ] **Step 5: Apply the migration and regenerate the types**

Run (repository root): `supabase migration up`
Expected: applies `202609250002_client_team` with no error.

Run (repository root): `supabase gen types typescript --local > supabase/database.types.ts`
Expected: the diff adds `requested_by`, `reviewed_by` and `notify_all` (Row/Insert/Update and the
two new relationships), the `client_team`, `set_briefing_requester` and `set_client_notifications`
functions, and `p_requested_by?: string` to the `save_briefing` and `save_briefing_revision` Args —
nothing else.

Run (repository root, read-only):
`docker exec supabase_db_dawes-studios psql -U postgres -Atc "select count(*) filter (where requested_by is null), count(*) from public.briefings"`
Expected: the null count equals the number of briefings whose creator is not one of their client's
people (read it, do not assume it; the local data had 1 of 80 before this task).

- [ ] **Step 6: Give the two typed row literals their new columns**

In `apps/web/features/briefings/briefing-model.test.ts`, in the `briefings` row literal of "validates
JSON records at the database boundary", replace

```ts
      created_by: "person",
```

with

```ts
      created_by: "person",
      requested_by: null,
```

In `apps/web/features/projects/canvas-versions.test.ts`, replace

```ts
  reviewed_at: "2026-09-21T12:00:00.000Z",
});
```

with

```ts
  reviewed_at: "2026-09-21T12:00:00.000Z",
  reviewed_by: null,
});
```

Run: `npm run typecheck` — Expected: PASS.

- [ ] **Step 7: Seed new environments with requesters**

In `supabase/scripts/build_seed.py`, each of the three `insert('public.briefings', …)` calls ends
with `created_by=customer)`; change each ending to `created_by=customer,requested_by=customer)`.
Check: `grep -c "created_by=customer,requested_by=customer)" supabase/scripts/build_seed.py` → `3`.

Run (repository root): `python3 supabase/scripts/build_seed.py`
Expected: `Generated 10 clients and 25 projects; …`; `git diff --stat supabase/seed.sql` shows
`30 insertions(+), 30 deletions(-)`; `git diff supabase/seed.sql | grep '^+insert' | grep -vc 'insert into public.briefings'`
prints `0`; `git diff --quiet supabase/fixtures.json` exits 0. (The local database is not re-seeded;
the backfill already covers it.)

- [ ] **Step 8: Run the database tests to verify they pass**

Run (repository root): `supabase test db supabase/tests/database/client_team.test.sql`
Expected: PASS, every assertion `ok`.
Then `supabase test db` in full: only `access_and_workflows.test.sql` fails its six known overlay
assertions (2, 4, 9, 18, 32, 54); `authorization_matrix.test.sql` still gets `23503` for the
cross-client campaign.

- [ ] **Step 9: Check that the studio's existing briefing flows still work**

Run: `npx playwright test tests/e2e/production-workflow.spec.ts tests/e2e/briefing-modal.spec.ts --output=../outputs/pw-client-team-1`
Expected: all pass — the studio still files for SABRE and for the intake fixture client, each of
which has one person, whom `save_briefing` now records as the requester.

- [ ] **Step 10: Run the gate, write the report and commit**

Run: `npm run check` — Expected: PASS.
Write `docs/engineering/handoffs/2026-09-25-client-team-task-1.md` from the template.

```bash
git add supabase/migrations/202609250002_client_team.sql supabase/tests/database/client_team.test.sql supabase/database.types.ts supabase/scripts/build_seed.py supabase/seed.sql apps/web/features/briefings/briefing-model.test.ts apps/web/features/projects/canvas-versions.test.ts docs/engineering/handoffs/2026-09-25-client-team-task-1.md
git commit -m "feat(db): record who requested each briefing and who decided each review"
```

---

### Task 2: Notification routing and client removal in the database

**Files:**
- Create: `supabase/migrations/202609250003_client_notification_routing.sql`
- Modify: `supabase/tests/database/client_team.test.sql` (append before its last two lines)
- Modify: `supabase/database.types.ts` (regenerated)
- Create: `docs/engineering/handoffs/2026-09-25-client-team-task-2.md`

**Interfaces:**
- Consumes: Task 1's columns, `private.is_active_client_person`, `client_team`,
  `set_client_notifications`, and the test file's `client_team_context`, `pg_temp.context`,
  `pg_temp.act_as` and fixture people (`sabre-person`, `teammate`, `quiet`, `leaving`, `former`,
  the designer's stray SABRE membership).
- Produces: `private.notify_client(target_client uuid, target_project uuid, message_title text,
  message_body text default '')` — unchanged signature, new routing.
- Produces: `public.remove_client_member(p_client_id uuid, p_profile_id uuid) returns boolean` —
  `true` when the account is deactivated (now or by an earlier attempt), so the caller must block
  sign-in; `false` when only this membership was removed. Errors: `42501` (not the studio),
  `P0001 Target is not a client person`, `P0001 This person is not a member of this client`.
  TypeScript: `Database["public"]["Functions"]["remove_client_member"]["Returns"]` is `boolean`.

- [ ] **Step 1: Append the failing routing and removal tests**

In `supabase/tests/database/client_team.test.sql`, insert this block directly above the file's last
two lines (`select * from finish();` and `rollback;`):

```sql
-- ---------------------------------------------------------------------------------------------
-- Notification routing (private.notify_client) and removal (remove_client_member).
-- Blair belongs to SABRE and Acme. The routed project is the SABRE person's; the orphan project has
-- no briefing; Blair asked for the third.
-- ---------------------------------------------------------------------------------------------
insert into client_team_context values
  ('both',md5('client-team:both')::uuid),
  ('routed-briefing',md5('client-team:routed-briefing')::uuid),
  ('routed-project',md5('client-team:routed-project')::uuid),
  ('orphan-project',md5('client-team:orphan-project')::uuid),
  ('gone-briefing',md5('client-team:gone-briefing')::uuid),
  ('gone-project',md5('client-team:gone-project')::uuid);
insert into auth.users(id,email,raw_user_meta_data)
  values(pg_temp.context('both'),'both@client-team.test','{"display_name":"Blair Both"}');
insert into public.client_memberships(client_id,user_id) values
  (pg_temp.context('sabre'),pg_temp.context('both')),
  (pg_temp.context('acme'),pg_temp.context('both'));
insert into public.briefings(id,client_id,service_type,title,created_by,requested_by) values
  (pg_temp.context('routed-briefing'),pg_temp.context('sabre'),'social','Client team: routed',
    pg_temp.context('sabre-person'),pg_temp.context('sabre-person')),
  (pg_temp.context('gone-briefing'),pg_temp.context('sabre'),'social','Client team: requester leaves',
    pg_temp.context('both'),pg_temp.context('both'));
insert into public.projects(id,client_id,briefing_id,title,service_type) values
  (pg_temp.context('routed-project'),pg_temp.context('sabre'),pg_temp.context('routed-briefing'),
    'Client team: routed project','social'),
  (pg_temp.context('orphan-project'),pg_temp.context('sabre'),null,
    'Client team: project without a briefing','social'),
  (pg_temp.context('gone-project'),pg_temp.context('sabre'),pg_temp.context('gone-briefing'),
    'Client team: requester left','social');
-- Notifications written inside this transaction only: now() is the transaction's start time.
create function pg_temp.notified(p_key text,p_title text) returns integer language sql as $$
  select count(*)::int from public.notifications
  where user_id=pg_temp.context(p_key) and title=p_title and created_at>=now()
$$;
-- A SABRE update about one project, as the current JWT subject. Called with the role reset: the
-- function is private to the database.
create function pg_temp.notify(p_project text,p_title text) returns void language sql as $$
  select private.notify_client(pg_temp.context('sabre'),pg_temp.context(p_project),p_title,'')
$$;

-- 1. A project update reaches its requester, not the rest of the team.
select pg_temp.act_as('agency');
select pg_temp.notify('routed-project','Client team: requester only');
select is(pg_temp.notified('sabre-person','Client team: requester only'),1,'A project update reaches its requester');
select is(pg_temp.notified('teammate','Client team: requester only'),0,'A teammate who did not ask is not notified');

-- 2. Someone who switched on all activity hears about every project.
select pg_temp.act_as('teammate');
set local role authenticated;
select lives_ok($$select public.set_client_notifications(pg_temp.context('sabre'),true)$$,
  'Tess switches on all SABRE activity');
reset role;
select pg_temp.act_as('agency');
select pg_temp.notify('routed-project','Client team: all activity');
select is(pg_temp.notified('teammate','Client team: all activity'),1,'All activity reaches every project');
select is(pg_temp.notified('quiet','Client team: all activity'),0,'My requests does not');

-- 3. A studio reply in the client conversation also reaches the client people who wrote there.
select pg_temp.act_as('quiet');
set local role authenticated;
select lives_ok($$select public.post_comment(pg_temp.context('routed-project'),'client','A question from Quinn.')$$,
  'Quinn writes in the project''s client conversation');
select pg_temp.act_as('both');
select lives_ok($$select public.post_comment(pg_temp.context('routed-project'),'client','A note from Blair.')$$,
  'Blair writes there too');
select pg_temp.act_as('agency');
select lives_ok($$select public.post_comment(pg_temp.context('routed-project'),'client','The studio answers.')$$,
  'The studio replies');
reset role;
select is(pg_temp.notified('quiet','New message from Studio'),1,'A studio reply reaches a person who wrote in the conversation');
select is(pg_temp.notified('sabre-person','New message from Studio'),1,'It reaches the requester');
select is(pg_temp.notified('leaving','New message from Studio'),0,'It does not reach a teammate who never wrote there');

-- 4. A project with no briefing reaches every person; removed people and designers never.
select pg_temp.act_as('agency');
select pg_temp.notify('orphan-project','Client team: no briefing');
select is(
  (select sum(pg_temp.notified(k,'Client team: no briefing'))::int
    from unnest(array['sabre-person','teammate','quiet','leaving','both']) k),
  5,'A project with no requester reaches every person');
select is(pg_temp.notified('former','Client team: no briefing'),0,'A removed person is never notified');
select is(pg_temp.notified('designer','Client team: no briefing'),0,'A designer is never notified as a client person');

-- 5. Removing Blair, who also belongs to Acme, removes only the SABRE membership.
insert into public.notifications(user_id,client_id,title)
  values(pg_temp.context('both'),pg_temp.context('acme'),'Client team: Acme note');
select pg_temp.act_as('agency');
set local role authenticated;
select is(public.remove_client_member(pg_temp.context('sabre'),pg_temp.context('both')),false,
  'Removing someone who belongs to another client removes only this membership');
reset role;
select is((select count(*)::int from public.client_memberships where user_id=pg_temp.context('both')),1,
  'Blair keeps Acme');
select ok((select removed_at is null from public.profiles where id=pg_temp.context('both')),
  'Blair keeps their login');
select is(pg_temp.notified('both','Client team: no briefing'),0,'Their SABRE notifications are deleted');
select is(pg_temp.notified('both','Client team: Acme note'),1,'Their Acme notifications stay');

-- 6. The requester has left: every person is notified, and someone who wrote before leaving no
-- longer hears the studio's replies.
select pg_temp.act_as('agency');
select pg_temp.notify('gone-project','Client team: requester left');
select is(
  (select sum(pg_temp.notified(k,'Client team: requester left'))::int
    from unnest(array['sabre-person','teammate','quiet','leaving']) k),
  4,'When the requester has left, every person is notified');
select is(pg_temp.notified('both','Client team: requester left'),0,'The former requester is not');
set local role authenticated;
select lives_ok($$select public.post_comment(pg_temp.context('routed-project'),'client','Another answer.')$$,
  'The studio replies again');
reset role;
select is(pg_temp.notified('both','New message from Studio'),0,
  'Someone who wrote before leaving the client is not notified');

-- 7. A client-wide update (no project) reaches every person.
select pg_temp.act_as('agency');
select private.notify_client(pg_temp.context('sabre'),null,'Client team: client-wide','');
select is(
  (select sum(pg_temp.notified(k,'Client team: client-wide'))::int
    from unnest(array['sabre-person','teammate','quiet','leaving']) k),
  4,'A client-wide update reaches every person');

-- 8. The person who acted is never notified.
select pg_temp.act_as('sabre-person');
select pg_temp.notify('routed-project','Client team: own action');
select is(pg_temp.notified('sabre-person','Client team: own action'),0,'The actor is never notified');
select is(pg_temp.notified('teammate','Client team: own action'),1,'Others still are, as their choice says');

-- 9. remove_client_member: the studio only, a client person only, a member only.
select pg_temp.act_as('sabre-person');
set local role authenticated;
select throws_ok($$select public.remove_client_member(pg_temp.context('sabre'),pg_temp.context('leaving'))$$,
  '42501',null,'A client person cannot remove anyone');
select pg_temp.act_as('designer');
select throws_ok($$select public.remove_client_member(pg_temp.context('sabre'),pg_temp.context('leaving'))$$,
  '42501',null,'A designer cannot remove anyone');
select pg_temp.act_as('agency');
select throws_ok($$select public.remove_client_member(pg_temp.context('sabre'),pg_temp.context('designer'))$$,
  'P0001','Target is not a client person','A studio or designer account is not removed through a client');
select throws_ok($$select public.remove_client_member(pg_temp.context('acme'),pg_temp.context('leaving'))$$,
  'P0001','This person is not a member of this client','A person is removed only from a client they belong to');

-- 10. Riley's last client: the account is deactivated and waits for the route to block sign-in.
select is(public.remove_client_member(pg_temp.context('sabre'),pg_temp.context('leaving')),true,
  'Removing someone''s last client deactivates their account');
select is((select count(*)::int from public.client_team(pg_temp.context('sabre'))
    where user_id=pg_temp.context('leaving')),0,'They leave the team at once');
select is(public.remove_client_member(pg_temp.context('sabre'),pg_temp.context('leaving')),true,
  'A retry still asks the route to finish blocking sign-in');
reset role;
select ok((select removed_at is not null from public.profiles where id=pg_temp.context('leaving')),
  'The account is marked removed');
select is((select count(*)::int from public.notifications where user_id=pg_temp.context('leaving')),0,
  'Their notifications are deleted');
select is((select count(*)::int from public.client_memberships
    where client_id=pg_temp.context('sabre') and user_id=pg_temp.context('leaving')),1,
  'The membership stays as the record of the pending removal');
select is((select count(*)::int from private.audit_events
    where event='client_member.removed' and entity_id=pg_temp.context('leaving')),1,
  'A retry writes no second audit event');
select pg_temp.act_as('leaving');
set local role authenticated;
select is(private.is_client_member(pg_temp.context('sabre')),false,
  'A removed person''s existing token loses client access');
reset role;
select ok(not has_function_privilege('anon','public.remove_client_member(uuid,uuid)','execute'),
  'Anonymous callers cannot remove anyone');
```

- [ ] **Step 2: Run it to verify it fails**

Run (repository root): `supabase test db supabase/tests/database/client_team.test.sql`
Expected: FAIL — case 1's "A teammate who did not ask is not notified" fails (today every member is
notified), and the file stops at `function public.remove_client_member(uuid, uuid) does not exist`.

- [ ] **Step 3: Confirm the live definition being replaced**

Run (repository root, read-only):
`docker exec supabase_db_dawes-studios psql -U postgres -Atc "select pg_get_functiondef('private.notify_client(uuid,uuid,text,text)'::regprocedure)"`
Expected: the one-statement body of `202609200002_workflows.sql` (every membership except
`auth.uid()`). Its callers stay `accept_briefing`, `publish_version`, `mark_project_delivered`,
`post_comment` (with a project), and `fulfill_credit_request`, `reject_credit_request` (no project):
`grep -rln "private.notify_client" supabase/migrations` lists no other caller.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/202609250003_client_notification_routing.sql`:

```sql
-- Route a client's project notifications to the people concerned, and remove one person from one
-- client. Spec: docs/superpowers/specs/2026-09-25-client-team-design.md (sections 1 and 5).

-- The signature of 202609200002_workflows.sql is kept, so its six callers do not change:
-- accept_briefing, publish_version, mark_project_delivered and post_comment (with a project), and
-- fulfill_credit_request and reject_credit_request (client-wide, without one).
create or replace function private.notify_client(
  target_client uuid, target_project uuid, message_title text, message_body text default ''
) returns void language sql security definer set search_path = '' as $$
  with members as (
    -- The client's people: client-role members who have not been removed.
    select m.user_id, m.notify_all
    from public.client_memberships m
    join public.profiles p on p.id = m.user_id
    where m.client_id = target_client and p.role = 'client' and p.removed_at is null
  ),
  requester as (
    -- The project's requester (its briefing's), while they are still one of the client's people.
    select b.requested_by as user_id
    from public.projects pr
    join public.briefings b on b.id = pr.briefing_id
    where pr.id = target_project and b.requested_by in (select user_id from members)
  ),
  recipients as (
    -- Client-wide updates, and projects with no requester left, reach every person, as before.
    select user_id from members
    where target_project is null or not exists (select 1 from requester)
    union
    select user_id from requester
    union
    select user_id from members where notify_all
    union
    -- A studio reply in the client conversation (post_comment's fixed title) also reaches the
    -- client people who wrote in that project's conversation and are still at the client.
    select a.author_id
    from private.client_comment_authors a
    join public.client_comments c on c.id = a.comment_id
    where message_title = 'New message from Studio'
      and c.project_id = target_project
      and c.author_kind = 'client'
      and a.author_id in (select user_id from members)
  )
  insert into public.notifications(user_id, client_id, project_id, title, body)
  select user_id, target_client, target_project, message_title, message_body
  from recipients
  where user_id is distinct from auth.uid()
$$;

-- Removes one person from one client (the studio only, audited). Someone who still belongs to
-- another client loses only this membership and this client's notifications. Their last client
-- also deactivates the account the way remove_team_member does (removed_at, every notification
-- deleted) and keeps the membership row as the record of which client the pending removal belongs
-- to: removed_at already ends every access, and the People dialog lists the row with Finish removal
-- until /api/clients/[clientId]/members/[profileId]/remove has blocked sign-in. Returns true when
-- the account is deactivated, now or by an earlier attempt, which is when that route must finish.
create function public.remove_client_member(p_client_id uuid, p_profile_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target_role public.app_role; target_removed_at timestamptz;
begin
  -- Membership writes share the team-management transaction lock; recheck the caller after waiting.
  perform pg_catalog.pg_advisory_xact_lock(93721, 1);
  perform private.assert_agency();
  select role, removed_at into target_role, target_removed_at
    from public.profiles where id = p_profile_id;
  if target_role is distinct from 'client' then
    raise exception 'Target is not a client person' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.client_memberships
                 where client_id = p_client_id and user_id = p_profile_id) then
    raise exception 'This person is not a member of this client' using errcode = 'P0001';
  end if;
  -- A retry completes the Auth half without another audit event or changing the removal time.
  if target_removed_at is not null then return true; end if;
  if exists (select 1 from public.client_memberships
             where user_id = p_profile_id and client_id <> p_client_id) then
    delete from public.client_memberships where client_id = p_client_id and user_id = p_profile_id;
    delete from public.notifications where user_id = p_profile_id and client_id = p_client_id;
    perform private.audit('client_member.removed', p_profile_id,
      jsonb_build_object('client_id', p_client_id, 'deactivated', false));
    return false;
  end if;
  update public.profiles set removed_at = clock_timestamp() where id = p_profile_id;
  delete from public.notifications where user_id = p_profile_id;
  perform private.audit('client_member.removed', p_profile_id,
    jsonb_build_object('client_id', p_client_id, 'deactivated', true));
  return true;
end $$;
revoke execute on function public.remove_client_member(uuid, uuid) from public, anon;
grant execute on function public.remove_client_member(uuid, uuid) to authenticated;
```

- [ ] **Step 5: Apply the migration and regenerate the types**

Run (repository root): `supabase migration up` — Expected: applies
`202609250003_client_notification_routing` with no error.
Run (repository root): `supabase gen types typescript --local > supabase/database.types.ts`
Expected: the diff adds only `remove_client_member` (Args `p_client_id`, `p_profile_id`; Returns
`boolean`).

- [ ] **Step 6: Run the database tests to verify they pass**

Run (repository root): `supabase test db supabase/tests/database/client_team.test.sql`
Expected: PASS, every assertion `ok`. Then `supabase test db` in full: only the six known
`access_and_workflows.test.sql` failures.

- [ ] **Step 7: Check the notification workflows in a browser**

Run: `npx playwright test tests/e2e/production-workflow.spec.ts tests/e2e/project-feedback.spec.ts --output=../outputs/pw-client-team-2`
Expected: all pass — their projects' requester is the one SABRE person (or the fixture client has no
briefing and every person is notified), so each step still reaches the client.

- [ ] **Step 8: Run the gate, write the report and commit**

Run: `npm run check` — Expected: PASS.
Write `docs/engineering/handoffs/2026-09-25-client-team-task-2.md` from the template.

```bash
git add supabase/migrations/202609250003_client_notification_routing.sql supabase/tests/database/client_team.test.sql supabase/database.types.ts docs/engineering/handoffs/2026-09-25-client-team-task-2.md
git commit -m "feat(db): route client notifications to the requester and remove client people"
```

---

### Task 3: Client people data and naming rules

**Files:**
- Create: `apps/web/features/team/client-people.ts`
- Test: `apps/web/features/team/client-people.test.ts`
- Modify: `apps/web/features/team/team-data.ts`
- Test: `apps/web/features/team/team-data.test.ts`
- Create: `docs/engineering/handoffs/2026-09-25-client-team-task-3.md`

**Interfaces:**
- Consumes: Task 1's `client_team`, `set_client_notifications`, `client_memberships.notify_all`;
  Task 2's `remove_client_member` (through the route Task 4 adds).
- Produces (`client-people.ts`, pure):
  - `type ClientPerson = { user_id: string; display_name: string; email: string }`
  - `type ClientPeople = { team: ClientPerson[]; names: Record<string, string> }`
  - `personName(id: string | null | undefined, people: ClientPeople | undefined, viewerRole: string | undefined): string | null`
  - `requesterLabel(name: string | null): string | null`
  - `reviewDecisionLabel(status: string, name: string | null, date: string): string | null`
- Produces (`team-data.ts`):
  - `clientPeopleQueryKeys = { people: "client-people", notifications: "client-notification-choices" }`
  - `useClientPeople(clientId: string | undefined)` → query of `ClientPeople` (studio and client people only)
  - `usePendingClientRemovals(clientId: string)` → query of `{ id: string; display_name: string }[]` (studio only)
  - `useClientNotificationChoices()` → query of `{ client_id: string; notify_all: boolean }[]` (client people only)
  - `setClientNotifications(database, { clientId: string; all: boolean }): Promise<void>`
  - `removeClientMember(session: Session, { clientId: string; profileId: string }): Promise<void>` →
    `POST /api/clients/{clientId}/members/{profileId}/remove`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/features/team/client-people.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  personName,
  requesterLabel,
  reviewDecisionLabel,
  type ClientPeople,
} from "./client-people";

const ana = { user_id: "ana", display_name: "Ana Lima", email: "ana@sabre.test" };
const studioView: ClientPeople = { team: [ana], names: { ana: "Ana Lima", ben: "Ben Cole" } };
const clientView: ClientPeople = { team: [ana], names: {} };

describe("the name a viewer sees for a client person", () => {
  it("names an active person to the studio and to the client", () => {
    expect(personName("ana", studioView, "agency")).toBe("Ana Lima");
    expect(personName("ana", clientView, "client")).toBe("Ana Lima");
  });

  it("marks someone who left for the studio and never names them to the client", () => {
    expect(personName("ben", studioView, "agency")).toBe("Ben Cole (left)");
    expect(personName("ben", clientView, "client")).toBe("Former member");
  });

  it("shows nothing without a person, before the people load, or for an id the studio cannot name", () => {
    expect(personName(null, studioView, "agency")).toBeNull();
    expect(personName("ana", undefined, "client")).toBeNull();
    expect(personName("zed", studioView, "agency")).toBeNull();
  });

  it("never names anyone to a designer", () => {
    expect(personName("ana", studioView, "designer")).toBeNull();
    expect(personName("ben", studioView, "designer")).toBeNull();
  });
});

describe("the requester and review decision labels", () => {
  it("reads Requested by, or nothing", () => {
    expect(requesterLabel("Ana Lima")).toBe("Requested by Ana Lima");
    expect(requesterLabel(null)).toBeNull();
  });

  it("names who decided and when", () => {
    expect(reviewDecisionLabel("approved", "Ana Lima", "Sep 24")).toBe(
      "Approved by Ana Lima · Sep 24",
    );
    expect(reviewDecisionLabel("changes_requested", "Former member", "Sep 23")).toBe(
      "Changes requested by Former member · Sep 23",
    );
  });

  it("leaves undecided versions and unrecorded reviewers to today's wording", () => {
    expect(reviewDecisionLabel("pending", "Ana Lima", "Sep 24")).toBeNull();
    expect(reviewDecisionLabel("approved", null, "Sep 24")).toBeNull();
  });
});
```

In `apps/web/features/team/team-data.test.ts`, replace the first two lines

```ts
import { describe, expect, it, vi } from "vitest";
import { revokeInvitation, teamQueryKeys } from "./team-data";
```

with

```ts
import type { Session } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  removeClientMember,
  revokeInvitation,
  setClientNotifications,
  teamQueryKeys,
} from "./team-data";
```

replace

```ts
    [
      "revokeInvitation",
      (database) => revokeInvitation(database, { invitationId: "invitation-1" }),
    ],
  ];
```

with

```ts
    [
      "revokeInvitation",
      (database) => revokeInvitation(database, { invitationId: "invitation-1" }),
    ],
    [
      "setClientNotifications",
      (database) => setClientNotifications(database, { clientId: "client-1", all: false }),
    ],
  ];
```

and append at the end of the file:

```ts
describe("client people writes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("records a person's notification choice for one client", async () => {
    const { database, rpc } = stubDatabase(ok);
    await setClientNotifications(database, { clientId: "client-1", all: true });
    expect(rpc).toHaveBeenCalledWith("set_client_notifications", {
      p_client_id: "client-1",
      p_all: true,
    });
  });

  it("removes a client's person through the server route with the caller's token", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ removed: true, deactivated: false }));
    vi.stubGlobal("fetch", request);
    await removeClientMember({ access_token: "token-1" } as Session, {
      clientId: "client-1",
      profileId: "person-1",
    });
    expect(request).toHaveBeenCalledWith("/api/clients/client-1/members/person-1/remove", {
      method: "POST",
      headers: { Authorization: "Bearer token-1" },
    });
  });

  it("surfaces the route's own error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "Only the studio can remove a client's people." }, { status: 403 }),
        ),
    );
    await expect(
      removeClientMember({ access_token: "token-1" } as Session, {
        clientId: "client-1",
        profileId: "person-1",
      }),
    ).rejects.toThrow("Only the studio can remove a client's people.");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run features/team/client-people.test.ts features/team/team-data.test.ts`
Expected: FAIL — `./client-people` cannot be resolved, and `setClientNotifications` /
`removeClientMember` are not exported.

- [ ] **Step 3: Write the naming rules**

Create `apps/web/features/team/client-people.ts`:

```ts
/**
 * Who a client's people are, and the words a viewer reads for one of them on a briefing or a
 * review. Pure: `team-data.ts` reads the people, and the briefings, projects, reviews and settings
 * features render these labels, so every surface names a person the same way.
 */

/** One of a client's active people, as `client_team` returns them. */
export type ClientPerson = { user_id: string; display_name: string; email: string };

/**
 * A client's people for one viewer: the active team (the only list a client person ever receives)
 * and, for the studio alone, every client person's name by id, so someone who left can be named.
 */
export type ClientPeople = { team: ClientPerson[]; names: Record<string, string> };

/**
 * The name a viewer sees for the person recorded on a briefing or a review. An active member reads
 * by name to the studio and the client alike; someone who has left reads "<name> (left)" to the
 * studio and "Former member" to the client, which never receives a former member's name. Nothing
 * is shown when nobody is recorded, before the people load, or to a designer, who never sees who
 * asked or who decided.
 */
export function personName(
  id: string | null | undefined,
  people: ClientPeople | undefined,
  viewerRole: string | undefined,
): string | null {
  if (!id || !people || (viewerRole !== "agency" && viewerRole !== "client")) return null;
  const member = people.team.find((person) => person.user_id === id);
  if (member) return member.display_name;
  if (viewerRole === "client") return "Former member";
  const name = people.names[id];
  return name ? `${name} (left)` : null;
}

/** "Requested by <name>", or nothing when no name can be shown. */
export function requesterLabel(name: string | null): string | null {
  return name ? `Requested by ${name}` : null;
}

/**
 * "Approved by <name> · <date>" or "Changes requested by <name> · <date>" for a decided version, or
 * nothing: an undecided version, and one decided before reviewers were recorded, keep the wording
 * their surface already uses.
 */
export function reviewDecisionLabel(
  status: string,
  name: string | null,
  date: string,
): string | null {
  if (!name) return null;
  if (status === "approved") return `Approved by ${name} · ${date}`;
  if (status === "changes_requested") return `Changes requested by ${name} · ${date}`;
  return null;
}
```

- [ ] **Step 4: Add the people reads and writes**

In `apps/web/features/team/team-data.ts`, add after the existing imports:

```ts
import type { ClientPeople, ClientPerson } from "./client-people";
```

and append at the end of the file:

```ts
/**
 * The cache keys of a client's people, named one by one because their writers dirty different
 * subsets: removing someone changes `people` (the team and the pending-removal list both live under
 * that prefix), while a person's own notification choice changes only `notifications`.
 */
export const clientPeopleQueryKeys = {
  /** `useClientPeople` and `usePendingClientRemovals`. */
  people: "client-people",
  /** `useClientNotificationChoices`. */
  notifications: "client-notification-choices",
} as const;

/**
 * One client's people, for everyone allowed to see them: the active people with their emails
 * (`client_team`, which returns nothing to anyone outside the client and the studio) and, for the
 * studio only, every client-role profile's name, so a former member can still be named. Designers
 * never run it. The one read of a client's people for briefings, projects, reviews and settings.
 */
export function useClientPeople(clientId: string | undefined) {
  const { database, session, profile } = useAuth();
  const role = profile?.role;
  return useQuery({
    queryKey: [clientPeopleQueryKeys.people, session?.user.id, clientId],
    enabled: !!session && !!clientId && (role === "agency" || role === "client"),
    queryFn: async (): Promise<ClientPeople> => {
      const team = assertResult(
        await database.rpc("client_team", { p_client_id: clientId! }),
      ) as ClientPerson[];
      if (role !== "agency") return { team, names: {} };
      const everyone = assertResult(
        await database.from("profiles").select("id,display_name").eq("role", "client"),
      ) as { id: string; display_name: string }[];
      return {
        team,
        names: Object.fromEntries(everyone.map((person) => [person.id, person.display_name])),
      };
    },
  });
}

/**
 * The studio's list of people removed from this client whose sign-in block has not been confirmed:
 * their membership row stays until then (`remove_client_member`), so the People dialog can offer
 * Finish removal after a reload.
 */
export function usePendingClientRemovals(clientId: string) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: [clientPeopleQueryKeys.people, "pending-removals", session?.user.id, clientId],
    enabled: !!session && profile?.role === "agency",
    queryFn: async () => {
      const memberships = assertResult(
        await database.from("client_memberships").select("user_id").eq("client_id", clientId),
      ) as { user_id: string }[];
      if (!memberships.length) return [];
      return assertResult(
        await database
          .from("profiles")
          .select("id,display_name")
          .in(
            "id",
            memberships.map((membership) => membership.user_id),
          )
          .not("removed_at", "is", null)
          .is("removal_completed_at", null)
          .order("display_name"),
      ) as { id: string; display_name: string }[];
    },
  });
}

/** The signed-in client person's notification choice for each client they belong to. */
export function useClientNotificationChoices() {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: [clientPeopleQueryKeys.notifications, session?.user.id],
    enabled: !!session && profile?.role === "client",
    queryFn: async () =>
      assertResult(
        await database
          .from("client_memberships")
          .select("client_id,notify_all")
          .eq("user_id", session!.user.id),
      ) as { client_id: string; notify_all: boolean }[],
  });
}

export async function setClientNotifications(
  database: SupabaseDatabase,
  input: { clientId: string; all: boolean },
) {
  assertResult(
    await database.rpc("set_client_notifications", {
      p_client_id: input.clientId,
      p_all: input.all,
    }),
  );
}

/**
 * Like `removeTeamMember`, this does not take `database`: removing someone's last client also
 * blocks their sign-in, which needs the service-role key and therefore the server route in
 * `app/api/clients/[clientId]/members/[profileId]/remove/route.ts`.
 */
export async function removeClientMember(
  session: Session,
  input: { clientId: string; profileId: string },
) {
  const response = await fetch(
    `/api/clients/${input.clientId}/members/${input.profileId}/remove`,
    { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } },
  );
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? "This person could not be removed.");
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run features/team/client-people.test.ts features/team/team-data.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the gate, write the report and commit**

Run: `npx prettier --write features/team/client-people.ts features/team/client-people.test.ts features/team/team-data.ts features/team/team-data.test.ts`, then `npm run check` — Expected: PASS.
Write `docs/engineering/handoffs/2026-09-25-client-team-task-3.md` from the template.

```bash
git add apps/web/features/team/client-people.ts apps/web/features/team/client-people.test.ts apps/web/features/team/team-data.ts apps/web/features/team/team-data.test.ts docs/engineering/handoffs/2026-09-25-client-team-task-3.md
git commit -m "feat(team): read a client's people and name who asked or decided"
```

---

### Task 4: The studio's People dialog and the client removal route

**Files:**
- Create: `apps/web/app/api/clients/[clientId]/members/[profileId]/remove/route.ts`
- Test: `apps/web/features/team/client-member-removal-server.test.ts`
- Create: `apps/web/features/team/client-people-dialog.tsx`
- Test: `apps/web/features/team/client-people-dialog.test.tsx`
- Modify: `apps/web/features/team/team.css`
- Modify: `apps/web/app/globals.css` (`.settings-list-row p` wraps anywhere)
- Modify: `apps/web/features/settings/client-settings.tsx`
- Create: `docs/engineering/handoffs/2026-09-25-client-team-task-4.md`

**Interfaces:**
- Consumes: Task 2's `remove_client_member` (boolean); Task 3's `useClientPeople`,
  `usePendingClientRemovals`, `clientPeopleQueryKeys`, `removeClientMember`; the existing
  `useInvitations` (`team-data.ts`), `InvitePerson` (`team-page.tsx`), `Modal`, `FormError`,
  `SettingsSuccess`, `useDateFormat`, the `Invitation` shape (`settings-model.ts`).
- Produces: `POST /api/clients/{clientId}/members/{profileId}/remove` → `200 { removed: true,
  deactivated: boolean }`, `400` (invalid ids or the RPC's message), `401`, `403`, `502` (a failed
  Auth step, retryable), `503`. `ClientPeopleDialog({ clientId, clientName, onClose })`. CSS
  `.client-people` (team.css); the shared `.settings-list-row p` now wraps anywhere, so a long email
  never widens a phone's page (Task 5 relies on it).

- [ ] **Step 1: Write the failing route test**

Create `apps/web/features/team/client-member-removal-server.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/clients/[clientId]/members/[profileId]/remove/route";

const clientId = "11111111-2222-4333-8444-555555555555";
const personId = "01234567-89ab-cdef-0123-456789abcdef";
let role: "agency" | "client";
let deactivates: boolean;
let failBan: boolean;
let failCompletion: boolean;
let removed: boolean;
let banned: boolean;
let completed: boolean;
let calls: string[];

beforeEach(() => {
  role = "agency";
  deactivates = true;
  failBan = false;
  failCompletion = false;
  removed = false;
  banned = false;
  completed = false;
  calls = [];
  vi.stubEnv("APP_ORIGIN", "https://studio.example.test");
  vi.stubEnv("SUPABASE_INTERNAL_URL", "https://database.example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  // Exercise the real SDK and the route, replacing only their HTTP boundary.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      calls.push(`${request.method} ${url.pathname}`);
      if (url.pathname === "/auth/v1/user")
        return Response.json({ id: "caller", email: "caller@example.test" });
      if (url.pathname === "/rest/v1/profiles" && request.method === "GET") {
        expect(url.searchParams.get("removed_at")).toBe("is.null");
        return Response.json({ role });
      }
      if (url.pathname === "/rest/v1/rpc/remove_client_member") {
        expect(request.headers.get("authorization")).toBe("Bearer caller-token");
        expect(await request.json()).toEqual({ p_client_id: clientId, p_profile_id: personId });
        removed = true;
        return Response.json(deactivates);
      }
      if (url.pathname === `/auth/v1/admin/users/${personId}`) {
        expect(removed).toBe(true);
        expect(request.headers.get("authorization")).toBe("Bearer service-key");
        if (failBan) return Response.json({ msg: "Account service unavailable" }, { status: 400 });
        banned = true;
        return Response.json({ id: personId });
      }
      if (url.pathname === "/rest/v1/profiles" && request.method === "PATCH") {
        expect(banned).toBe(true);
        expect(url.searchParams.get("id")).toBe(`eq.${personId}`);
        expect(url.searchParams.get("removed_at")).toBe("not.is.null");
        if (failCompletion)
          return Response.json({ message: "Completion write unavailable" }, { status: 500 });
        completed = true;
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function remove(
  headers: Record<string, string> = {},
  ids: { clientId: string; profileId: string } = { clientId, profileId: personId },
) {
  return POST(
    new Request(
      `https://studio.example.test/api/clients/${ids.clientId}/members/${ids.profileId}/remove`,
      { method: "POST", headers: { authorization: "Bearer caller-token", ...headers } },
    ),
    { params: Promise.resolve(ids) },
  );
}

describe("client removal server", () => {
  it("blocks sign-in only after removing the person's last client", async () => {
    const response = await remove();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ removed: true, deactivated: true });
    expect({ removed, banned, completed }).toEqual({ removed: true, banned: true, completed: true });
  });

  it("leaves the account alone when the person still belongs to another client", async () => {
    deactivates = false;
    const response = await remove();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ removed: true, deactivated: false });
    expect(banned).toBe(false);
    expect(calls.some((call) => call.includes("/admin/"))).toBe(false);
  });

  it("leaves a durable pending removal when the sign-in block fails and can retry", async () => {
    failBan = true;
    const failed = await remove();
    expect(failed.status).toBe(502);
    expect((await failed.json()).error).toContain("Try again");
    expect({ removed, banned, completed }).toEqual({
      removed: true,
      banned: false,
      completed: false,
    });
    failBan = false;
    expect((await remove()).status).toBe(200);
    expect(completed).toBe(true);
  });

  it("does not report success until the completion marker is persisted", async () => {
    failCompletion = true;
    expect((await remove()).status).toBe(502);
    expect({ removed, banned, completed }).toEqual({ removed: true, banned: true, completed: false });
    failCompletion = false;
    expect((await remove()).status).toBe(200);
    expect(completed).toBe(true);
  });

  it("refuses anyone but the studio before any privileged operation", async () => {
    role = "client";
    expect((await remove()).status).toBe(403);
    expect(removed).toBe(false);
    expect(calls.some((call) => call.includes("/admin/") || call.includes("/rpc/"))).toBe(false);
  });

  it.each([
    ["foreign origin", { origin: "https://unrelated.example.test" }, { clientId, profileId: personId }, 403],
    ["missing session", { authorization: "" }, { clientId, profileId: personId }, 401],
    ["invalid client", {}, { clientId: "not-an-id", profileId: personId }, 400],
    ["invalid person", {}, { clientId, profileId: "not-an-id" }, 400],
  ] as const)("rejects %s before contacting the backend", async (_case, headers, ids, status) => {
    expect((await remove(headers, ids)).status).toBe(status);
    expect(calls).toEqual([]);
  });
});
```

Run: `npx vitest run features/team/client-member-removal-server.test.ts`
Expected: FAIL — the route module cannot be resolved.

- [ ] **Step 2: Write the route**

Create `apps/web/app/api/clients/[clientId]/members/[profileId]/remove/route.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@database";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/**
 * Removes one person from one client. It mirrors `app/api/team-members/[id]/remove/route.ts`,
 * including its order: `remove_client_member` runs first and ends the person's access to this
 * client. When that was their last client the RPC also deactivates the account (`removed_at`) and
 * answers `true`; only then does this route block future sign-ins with the service-role key and
 * record `removal_completed_at`. A failed second step answers 502 and leaves the person listed as a
 * pending removal in the People dialog (their membership row is kept until then); a retry repeats
 * every step, and the RPC returns early for an account it already deactivated. The two routes stay
 * separate files, as the spec asks for a mirror of the tested team route rather than a change to it.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ clientId: string; profileId: string }> },
) {
  const { clientId, profileId } = await params;
  if (!uuid.test(clientId) || !uuid.test(profileId))
    return Response.json({ error: "Select a valid person." }, { status: 400 });
  // A standalone Node.js server derives request.url from its listening address, so in a container
  // it reports the bind host instead of the browser origin. Trust the configured workspace origin,
  // matching the media service, and keep the request origin for a direct `next dev`/`next start`.
  const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  if (request.headers.get("origin") && request.headers.get("origin") !== origin)
    return Response.json({ error: "This request must come from your workspace." }, { status: 403 });
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return Response.json({ error: "Sign in before removing someone." }, { status: 401 });
  const url = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !serviceKey)
    return Response.json(
      { error: "Removal is not configured. Contact the workspace administrator." },
      { status: 503 },
    );
  const caller = createClient<Database>(url, publicKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authError,
  } = await caller.auth.getUser(token);
  if (authError || !user)
    return Response.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
  const { data: profile, error: profileError } = await caller
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .is("removed_at", null)
    .single();
  if (profileError || profile?.role !== "agency")
    return Response.json({ error: "Only the studio can remove a client's people." }, { status: 403 });
  const { data: deactivated, error: rpcError } = await caller.rpc("remove_client_member", {
    p_client_id: clientId,
    p_profile_id: profileId,
  });
  if (rpcError) return Response.json({ error: rpcError.message }, { status: 400 });
  if (!deactivated) return Response.json({ removed: true, deactivated: false });
  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: banError } = await admin.auth.admin.updateUserById(profileId, {
    ban_duration: "876000h",
  });
  if (banError)
    return Response.json(
      {
        error:
          "Access to this client was removed, but the account could not be blocked from signing in. Try again.",
      },
      { status: 502 },
    );
  const { error: completionError } = await admin
    .from("profiles")
    .update({ removal_completed_at: new Date().toISOString() })
    .eq("id", profileId)
    .not("removed_at", "is", null);
  if (completionError)
    return Response.json(
      { error: "The account is blocked, but removal could not be finalized. Try again." },
      { status: 502 },
    );
  return Response.json({ removed: true, deactivated: true });
}
```

Run: `npx vitest run features/team/client-member-removal-server.test.ts` — Expected: PASS (9 tests).

- [ ] **Step 3: Write the failing dialog test**

Create `apps/web/features/team/client-people-dialog.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  team: [] as { user_id: string; display_name: string; email: string }[],
  pending: [] as { id: string; display_name: string }[],
  remove: vi.fn(),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ session: { access_token: "token-1" }, profile: { role: "agency" } }),
}));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/workspace/workspace-data")>();
  return { ...actual, useDateFormat: () => actual.createDateFormatters("UTC") };
});
vi.mock("./team-page", () => ({
  InvitePerson: ({ clientId, onSent }: { clientId?: string; onSent: () => void }) => (
    <button onClick={onSent}>Send the {clientId} invitation</button>
  ),
}));
vi.mock("./team-data", () => ({
  clientPeopleQueryKeys: { people: "client-people", notifications: "client-notification-choices" },
  useClientPeople: () => ({
    data: { team: state.team, names: {} },
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
  usePendingClientRemovals: () => ({
    data: state.pending,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
  useInvitations: () => ({
    data: [
      { id: "i1", email: "new@sabre.test", role: "client", client_id: "sabre", status: "pending", expires_at: "2999-01-02T00:00:00Z", created_at: "2026-09-24T00:00:00Z" },
      { id: "i2", email: "late@sabre.test", role: "client", client_id: "sabre", status: "pending", expires_at: "2026-01-01T00:00:00Z", created_at: "2025-12-25T00:00:00Z" },
      { id: "i3", email: "other@acme.test", role: "client", client_id: "acme", status: "pending", expires_at: "2999-01-02T00:00:00Z", created_at: "2026-09-24T00:00:00Z" },
      { id: "i4", email: "done@sabre.test", role: "client", client_id: "sabre", status: "accepted", expires_at: "2999-01-02T00:00:00Z", created_at: "2026-09-20T00:00:00Z" },
    ],
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
  removeClientMember: state.remove,
}));

// jsdom has no native dialog/top-layer implementation; real focus isolation is covered in E2E.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  },
  close: {
    configurable: true,
    value() {
      this.removeAttribute("open");
    },
  },
});

import { ClientPeopleDialog } from "./client-people-dialog";

const ana = { user_id: "ana", display_name: "Ana Lima", email: "ana@sabre.test" };
const ben = { user_id: "ben", display_name: "Ben Cole", email: "ben@sabre.test" };

function renderDialog() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ClientPeopleDialog clientId="sabre" clientName="SABRE" onClose={vi.fn()} />
    </QueryClientProvider>,
  );
  return within(screen.getByRole("dialog", { name: "SABRE people" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  state.team = [ana, ben];
  state.pending = [];
  state.remove.mockResolvedValue(undefined);
});

describe("ClientPeopleDialog", () => {
  it("lists the client's people with their emails and only this client's pending invitations", () => {
    const dialog = renderDialog();
    expect(dialog.getByText("Ana Lima")).toBeInTheDocument();
    expect(dialog.getByText("ben@sabre.test")).toBeInTheDocument();
    expect(dialog.getByText("new@sabre.test")).toBeInTheDocument();
    expect(dialog.getByText("Invitation expires Jan 2")).toBeInTheDocument();
    for (const hidden of ["late@sabre.test", "other@acme.test", "done@sabre.test"])
      expect(dialog.queryByText(hidden)).not.toBeInTheDocument();
  });

  it("asks before removing someone and says what they lose", async () => {
    const user = userEvent.setup();
    const dialog = renderDialog();
    await user.click(dialog.getByRole("button", { name: "Remove Ben Cole" }));
    const confirm = screen.getByRole("dialog", { name: "Remove Ben Cole?" });
    expect(confirm).toHaveTextContent("Ben Cole loses access to SABRE.");
    expect(confirm).not.toHaveTextContent("will have nobody");
    await user.click(within(confirm).getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(state.remove).toHaveBeenCalledWith(
        { access_token: "token-1" },
        { clientId: "sabre", profileId: "ben" },
      ),
    );
    expect(await dialog.findByText("Ben Cole no longer has access to SABRE.")).toBeInTheDocument();
  });

  it("warns that removing the last person leaves the client with nobody", async () => {
    state.team = [ana];
    const user = userEvent.setup();
    const dialog = renderDialog();
    await user.click(dialog.getByRole("button", { name: "Remove Ana Lima" }));
    expect(screen.getByRole("dialog", { name: "Remove Ana Lima?" })).toHaveTextContent(
      "SABRE will have nobody who can sign in until someone is invited.",
    );
  });

  it("keeps a failed removal open with the reason, ready to try again", async () => {
    state.remove.mockRejectedValue(
      new Error(
        "Access to this client was removed, but the account could not be blocked from signing in. Try again.",
      ),
    );
    const user = userEvent.setup();
    const dialog = renderDialog();
    await user.click(dialog.getByRole("button", { name: "Remove Ben Cole" }));
    const confirm = screen.getByRole("dialog", { name: "Remove Ben Cole?" });
    await user.click(within(confirm).getByRole("button", { name: "Remove" }));
    expect(await within(confirm).findByRole("alert")).toHaveTextContent(
      "could not be blocked from signing in",
    );
    expect(within(confirm).getByRole("button", { name: "Remove" })).toBeEnabled();
  });

  it("lists a removal still waiting for its sign-in block, with Finish removal", async () => {
    state.pending = [{ id: "cy", display_name: "Cy Gone" }];
    const user = userEvent.setup();
    const dialog = renderDialog();
    expect(dialog.getByText("Access removed · Account block pending")).toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "Finish removal for Cy Gone" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Remove Cy Gone?" })).getByRole("button", {
        name: "Remove",
      }),
    );
    await waitFor(() =>
      expect(state.remove).toHaveBeenCalledWith(
        { access_token: "token-1" },
        { clientId: "sabre", profileId: "cy" },
      ),
    );
  });

  it("opens the existing invite form and confirms the sent invitation", async () => {
    const user = userEvent.setup();
    const dialog = renderDialog();
    await user.click(dialog.getByRole("button", { name: "Invite person" }));
    await user.click(screen.getByRole("button", { name: "Send the sabre invitation" }));
    expect(await dialog.findByText("Invitation email sent.")).toBeInTheDocument();
  });
});
```

Run: `npx vitest run features/team/client-people-dialog.test.tsx`
Expected: FAIL — `./client-people-dialog` cannot be resolved.

- [ ] **Step 4: Write the dialog**

Create `apps/web/features/team/client-people-dialog.tsx`:

```tsx
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { SettingsSuccess } from "@/features/settings/settings-success";
import { FormError } from "@/features/shared/form-error";
import { Modal } from "@/features/shared/modal";
import { useDateFormat } from "@/features/workspace/workspace-data";
import {
  clientPeopleQueryKeys,
  removeClientMember,
  useClientPeople,
  useInvitations,
  usePendingClientRemovals,
} from "./team-data";
import { InvitePerson } from "./team-page";
import "./team.css";

type Removal = { id: string; name: string; pending: boolean };

/**
 * Settings → Clients → People: the client's active people with Remove, its pending invitations
 * (read-only) and the existing invite form. Removing someone's last client also blocks their
 * sign-in, which only the server route can do; a removal whose second step failed stays listed as
 * pending, with Finish removal, even after a reload.
 */
export function ClientPeopleDialog({
  clientId,
  clientName,
  onClose,
}: {
  clientId: string;
  clientName: string;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const { formatDate } = useDateFormat();
  const people = useClientPeople(clientId);
  const pendingRemovals = usePendingClientRemovals(clientId);
  const invitations = useInvitations();
  // Read once: an invitation that expires while the dialog is open keeps its row until reopened.
  const [now] = useState(() => Date.now());
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState("");
  const [removing, setRemoving] = useState<Removal | null>(null);
  const remove = useMutation({
    mutationFn: async (target: Removal) =>
      removeClientMember(session!, { clientId, profileId: target.id }),
    onSuccess: (_result, target) => {
      setRemoving(null);
      setNotice(`${target.name} no longer has access to ${clientName}.`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [clientPeopleQueryKeys.people] }),
  });
  const team = people.data?.team ?? [];
  const invited = (invitations.data ?? []).filter(
    (item) =>
      item.role === "client" &&
      item.client_id === clientId &&
      item.status === "pending" &&
      new Date(item.expires_at).getTime() > now,
  );
  const askToRemove = (target: Removal) => {
    remove.reset();
    setNotice("");
    setRemoving(target);
  };
  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`${clientName} people`}
        description="Everyone who signs in to this client, each with their own account."
        size="lg"
      >
        <div className="client-people">
          {notice && <SettingsSuccess>{notice}</SettingsSuccess>}
          <section>
            <h3>People</h3>
            {people.isPending || pendingRemovals.isPending ? (
              <p role="status">Loading people…</p>
            ) : people.error || pendingRemovals.error ? (
              <FormError>
                People could not be loaded.{" "}
                <button
                  className="button quiet"
                  onClick={() => {
                    void people.refetch();
                    void pendingRemovals.refetch();
                  }}
                >
                  Try again
                </button>
              </FormError>
            ) : team.length || pendingRemovals.data?.length ? (
              <div className="settings-list">
                {team.map((person) => (
                  <div className="settings-list-row" key={person.user_id}>
                    <div>
                      <strong>{person.display_name}</strong>
                      <p>{person.email}</p>
                    </div>
                    <button
                      className="button quiet"
                      aria-label={`Remove ${person.display_name}`}
                      disabled={remove.isPending}
                      onClick={() =>
                        askToRemove({
                          id: person.user_id,
                          name: person.display_name,
                          pending: false,
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {pendingRemovals.data?.map((person) => (
                  <div className="settings-list-row" key={person.id}>
                    <div>
                      <strong>{person.display_name}</strong>
                      <p>Access removed · Account block pending</p>
                    </div>
                    <button
                      className="button quiet"
                      aria-label={`Finish removal for ${person.display_name}`}
                      disabled={remove.isPending}
                      onClick={() =>
                        askToRemove({ id: person.id, name: person.display_name, pending: true })
                      }
                    >
                      Finish removal
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="settings-note">Nobody can sign in to {clientName} yet.</p>
            )}
          </section>
          <section>
            <h3>Invited</h3>
            {invitations.isPending ? (
              <p role="status">Loading invitations…</p>
            ) : invitations.error ? (
              <FormError>
                Invitations could not be loaded.{" "}
                <button className="button quiet" onClick={() => void invitations.refetch()}>
                  Try again
                </button>
              </FormError>
            ) : invited.length ? (
              <div className="settings-list">
                {invited.map((item) => (
                  <div className="settings-list-row" key={item.id}>
                    <div>
                      <strong>{item.email}</strong>
                      <p>Invitation expires {formatDate(item.expires_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="settings-note">No pending invitations.</p>
            )}
          </section>
          <div className="settings-dialog-actions">
            <button
              className="button primary"
              onClick={() => {
                setNotice("");
                setInviting(true);
              }}
            >
              <Plus size={15} />
              Invite person
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        open={!!removing}
        title={removing ? `Remove ${removing.name}?` : "Remove this person?"}
        description={removing ? `${removing.name} loses access to ${clientName}.` : undefined}
        onClose={() => {
          if (!remove.isPending) setRemoving(null);
        }}
      >
        {removing && !removing.pending && team.length === 1 && (
          <p className="settings-note">
            {clientName} will have nobody who can sign in until someone is invited.
          </p>
        )}
        <div className="form-actions">
          <button className="button" onClick={() => setRemoving(null)} disabled={remove.isPending}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={() => removing && remove.mutate(removing)}
            disabled={remove.isPending}
          >
            {remove.isPending ? "Removing…" : "Remove"}
          </button>
        </div>
        {remove.error && <FormError>{remove.error.message}</FormError>}
      </Modal>
      {inviting && (
        <InvitePerson
          clientId={clientId}
          onClose={() => setInviting(false)}
          onSent={() => {
            setInviting(false);
            setNotice("Invitation email sent.");
          }}
        />
      )}
    </>
  );
}
```

Append to `apps/web/features/team/team.css`:

```css
/* Settings → Clients → People: the client's people, pending invitations, then Invite person. */
.client-people {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}
.client-people h3 {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
}
```

In `apps/web/app/globals.css`, the shared list row already lets its `strong` wrap anywhere; give its
paragraph the same rule, so an email (which has no spaces to break at) cannot widen a phone's page.
Replace

```css
.settings-list-row p {
  font-size: var(--text-base);
  color: var(--muted);
  line-height: 1.6;
  margin: 7px 0 0;
}
```

with

```css
.settings-list-row p {
  font-size: var(--text-base);
  color: var(--muted);
  line-height: 1.6;
  margin: 7px 0 0;
  overflow-wrap: anywhere;
}
```

Run: `npx vitest run features/team/client-people-dialog.test.tsx` — Expected: PASS (6 tests).

- [ ] **Step 5: Open the dialog from Settings → Clients**

In `apps/web/features/settings/client-settings.tsx`:

replace

```tsx
import { InvitePerson } from "@/features/team/team-page";
```

with

```tsx
import { ClientPeopleDialog } from "@/features/team/client-people-dialog";
```

replace

```tsx
  const [inviting, setInviting] = useState<string | null>(null);
```

with

```tsx
  const [peopleClient, setPeopleClient] = useState<Client | null>(null);
```

replace

```tsx
              <button className="button quiet" onClick={() => setInviting(client.id)}>
                Invite
              </button>
```

with

```tsx
              <button
                className="button quiet"
                aria-label={`${client.name} people`}
                onClick={() => setPeopleClient(client)}
              >
                People
              </button>
```

and replace

```tsx
      {inviting && (
        <InvitePerson
          clientId={inviting}
          onClose={() => setInviting(null)}
          onSent={() => {
            setInviting(null);
            setNotice("Invitation email sent.");
          }}
        />
      )}
```

with

```tsx
      {peopleClient && (
        <ClientPeopleDialog
          clientId={peopleClient.id}
          clientName={peopleClient.name}
          onClose={() => setPeopleClient(null)}
        />
      )}
```

Check: `grep -rn "\.from(\|\.rpc(\|\.storage\." features/team/*.tsx features/settings/client-settings.tsx` prints nothing.

- [ ] **Step 6: Run the gate, write the report and commit**

Run: `npx prettier --write "app/api/clients/[clientId]/members/[profileId]/remove/route.ts" features/team/client-member-removal-server.test.ts features/team/client-people-dialog.tsx features/team/client-people-dialog.test.tsx features/team/team.css app/globals.css features/settings/client-settings.tsx`, then `npm run check` — Expected: PASS
(including `features/team/team-removal-server.test.ts`, untouched, and the stylesheet and
invalidation boundary tests).
Run: `npx playwright test tests/e2e/team-management.spec.ts --output=../outputs/pw-client-team-4`
Expected: PASS (the team route and roster are unchanged).
Write `docs/engineering/handoffs/2026-09-25-client-team-task-4.md` from the template.

```bash
git add "apps/web/app/api/clients/[clientId]/members/[profileId]/remove/route.ts" apps/web/features/team/client-member-removal-server.test.ts apps/web/features/team/client-people-dialog.tsx apps/web/features/team/client-people-dialog.test.tsx apps/web/features/team/team.css apps/web/app/globals.css apps/web/features/settings/client-settings.tsx docs/engineering/handoffs/2026-09-25-client-team-task-4.md
git commit -m "feat(team): let the studio see, invite and remove a client's people"
```

---

### Task 5: The client's Team section and notification choice

**Files:**
- Create: `apps/web/features/settings/client-team-section.tsx`
- Test: `apps/web/features/settings/client-team-section.test.tsx`
- Modify: `apps/web/features/settings/settings.css`
- Modify: `apps/web/features/settings/account-settings.tsx`

The section lives in `features/settings` because it is one of Your account's `.settings-section`
blocks, a settings-only class; placing it in `features/team` would give that class a second
feature and, by the styling boundary, force it into `app/globals.css`. Its data stays in
`features/team/team-data.ts`, which owns client people and their memberships.
- Create: `docs/engineering/handoffs/2026-09-25-client-team-task-5.md`

**Interfaces:**
- Consumes: Task 3's `useClientPeople`, `useClientNotificationChoices`, `setClientNotifications`,
  `clientPeopleQueryKeys` (`@/features/team/team-data`); Task 4's wrapping `.settings-list-row p`;
  `useClients` and `Client` (`workspace-data.ts`); `.settings-section` (settings.css) and the shared
  `.settings-list-row`, `.status-badge` and `.segmented-control`.
- Produces: `ClientTeamSections()` — renders nothing unless the viewer is a client person; one
  `<section aria-labelledby>` named "`<client>` team" per client. CSS `.client-team`,
  `.client-team-notifications`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/features/settings/client-team-section.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "client" as "agency" | "client" | "designer",
  choices: [] as { client_id: string; notify_all: boolean }[],
  setNotifications: vi.fn(),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    database: { name: "database" },
    session: { user: { id: "ana" } },
    profile: { id: "ana", role: state.role },
  }),
}));
vi.mock("@/features/workspace/workspace-data", () => ({
  useClients: () => ({
    data: [
      { id: "sabre", name: "SABRE" },
      { id: "acme", name: "Acme" },
    ],
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/features/team/team-data", () => ({
  clientPeopleQueryKeys: { people: "client-people", notifications: "client-notification-choices" },
  useClientNotificationChoices: () => ({
    data: state.choices,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
  useClientPeople: (clientId: string) => ({
    data: {
      team:
        clientId === "sabre"
          ? [
              { user_id: "ana", display_name: "Ana Lima", email: "ana@sabre.test" },
              { user_id: "ben", display_name: "Ben Cole", email: "ben@sabre.test" },
            ]
          : [{ user_id: "ana", display_name: "Ana Lima", email: "ana@acme.test" }],
      names: {},
    },
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
  setClientNotifications: state.setNotifications,
}));

import { ClientTeamSections } from "./client-team-section";

function renderSections() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ClientTeamSections />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.role = "client";
  state.choices = [
    { client_id: "sabre", notify_all: false },
    { client_id: "acme", notify_all: true },
  ];
  state.setNotifications.mockResolvedValue(undefined);
});

describe("ClientTeamSections", () => {
  it("shows one Team section per client, with each teammate and the viewer marked You", () => {
    renderSections();
    const sabre = within(screen.getByRole("region", { name: "SABRE team" }));
    expect(sabre.getByText("Ben Cole")).toBeInTheDocument();
    expect(sabre.getByText("ben@sabre.test")).toBeInTheDocument();
    expect(sabre.getByText("You")).toBeInTheDocument();
    expect(sabre.getByText(/To add or remove someone, contact the studio\./)).toBeInTheDocument();
    const acme = within(screen.getByRole("region", { name: "Acme team" }));
    expect(acme.getByText("ana@acme.test")).toBeInTheDocument();
    expect(acme.queryByText("Ben Cole")).not.toBeInTheDocument();
  });

  it("keeps each client's notification choice separate", async () => {
    renderSections();
    const sabre = within(screen.getByRole("region", { name: "SABRE team" }));
    const acme = within(screen.getByRole("region", { name: "Acme team" }));
    expect(sabre.getByRole("button", { name: "My requests" })).toHaveAttribute("aria-pressed", "true");
    expect(acme.getByRole("button", { name: "All Acme activity" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.setup().click(sabre.getByRole("button", { name: "All SABRE activity" }));
    await waitFor(() =>
      expect(state.setNotifications).toHaveBeenCalledWith(
        { name: "database" },
        { clientId: "sabre", all: true },
      ),
    );
  });

  it("does not resend the choice already in place", async () => {
    renderSections();
    const sabre = within(screen.getByRole("region", { name: "SABRE team" }));
    await userEvent.setup().click(sabre.getByRole("button", { name: "My requests" }));
    expect(state.setNotifications).not.toHaveBeenCalled();
  });

  it.each(["agency", "designer"] as const)("renders nothing for a %s", (role) => {
    state.role = role;
    const { container } = renderSections();
    expect(container).toBeEmptyDOMElement();
  });
});
```

Run: `npx vitest run features/settings/client-team-section.test.tsx`
Expected: FAIL — `./client-team-section` cannot be resolved.

- [ ] **Step 2: Write the Team sections**

Create `apps/web/features/settings/client-team-section.tsx`:

```tsx
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { FormError } from "@/features/shared/form-error";
import { useClients, type Client } from "@/features/workspace/workspace-data";
import {
  clientPeopleQueryKeys,
  setClientNotifications,
  useClientNotificationChoices,
  useClientPeople,
} from "@/features/team/team-data";

/**
 * Settings → Your account, for a client person: one Team section for each client they belong to,
 * with that client's people and the person's own notification choice. The studio decides who is on
 * the team (Settings → Clients → People); the studio and designers never see these sections.
 */
export function ClientTeamSections() {
  const { profile } = useAuth();
  const clients = useClients();
  const choices = useClientNotificationChoices();
  if (profile?.role !== "client") return null;
  if (clients.isPending || choices.isPending) return <p role="status">Loading your team…</p>;
  if (clients.error || choices.error)
    return (
      <FormError>
        Your team could not be loaded.{" "}
        <button
          className="button quiet"
          onClick={() => {
            void clients.refetch();
            void choices.refetch();
          }}
        >
          Try again
        </button>
      </FormError>
    );
  return (
    <>
      {clients.data?.map((client) => (
        <ClientTeamSection
          key={client.id}
          client={client}
          notifyAll={
            choices.data?.find((choice) => choice.client_id === client.id)?.notify_all ?? false
          }
        />
      ))}
    </>
  );
}

function ClientTeamSection({ client, notifyAll }: { client: Client; notifyAll: boolean }) {
  const { database, session } = useAuth();
  const queryClient = useQueryClient();
  const headingId = useId();
  const people = useClientPeople(client.id);
  const choose = useMutation({
    mutationFn: async (all: boolean) =>
      setClientNotifications(database, { clientId: client.id, all }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [clientPeopleQueryKeys.notifications] }),
  });
  const pick = (all: boolean) => {
    if (all !== notifyAll && !choose.isPending) choose.mutate(all);
  };
  return (
    <section className="settings-section" aria-labelledby={headingId}>
      <div>
        <h2 id={headingId}>{client.name} team</h2>
        <p>
          Everyone at {client.name} who works with the studio. To add or remove someone, contact
          the studio.
        </p>
      </div>
      <div className="client-team">
        {people.isPending ? (
          <p role="status">Loading the team…</p>
        ) : people.error ? (
          <FormError>
            The team could not be loaded.{" "}
            <button className="button quiet" onClick={() => void people.refetch()}>
              Try again
            </button>
          </FormError>
        ) : (
          <div className="settings-list">
            {people.data?.team.map((person) => (
              <div className="settings-list-row" key={person.user_id}>
                <div>
                  <strong>{person.display_name}</strong>
                  <p>{person.email}</p>
                </div>
                {person.user_id === session?.user.id && (
                  <span className="status-badge">You</span>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="client-team-notifications">
          <strong>Notifications</strong>
          <div
            className="segmented-control"
            role="group"
            aria-label={`${client.name} notifications`}
          >
            <button
              type="button"
              aria-pressed={!notifyAll}
              disabled={choose.isPending}
              onClick={() => pick(false)}
            >
              My requests
            </button>
            <button
              type="button"
              aria-pressed={notifyAll}
              disabled={choose.isPending}
              onClick={() => pick(true)}
            >
              All {client.name} activity
            </button>
          </div>
          <p className="settings-note">
            {notifyAll
              ? `Every ${client.name} project notifies you.`
              : "The briefings you requested, and the conversations you joined, notify you."}
          </p>
          {choose.error && <FormError>{choose.error.message}</FormError>}
        </div>
      </div>
    </section>
  );
}
```

Append to `apps/web/features/settings/settings.css`:

```css
/* Settings → Your account, for a client person: the team, then the notification choice. */
.client-team {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  min-width: 0;
}
.client-team-notifications {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.client-team-notifications > strong {
  font-size: var(--text-lg);
  font-weight: 500;
}
/* "All <client> activity" can be long; on a phone the two choices wrap instead of overflowing. */
.client-team-notifications .segmented-control {
  flex-wrap: wrap;
  max-width: 100%;
  white-space: normal;
}
```

Run: `npx vitest run features/settings/client-team-section.test.tsx` — Expected: PASS (5 tests).

- [ ] **Step 3: Show the sections on Your account**

In `apps/web/features/settings/account-settings.tsx`, add to the imports:

```tsx
import { ClientTeamSections } from "./client-team-section";
```

and replace the end of the "Your profile" section and the start of the "Password" section

```tsx
        </form>
      </section>
      <section className="settings-section">
        <div>
          <h2>Password</h2>
```

with

```tsx
        </form>
      </section>
      <ClientTeamSections />
      <section className="settings-section">
        <div>
          <h2>Password</h2>
```

- [ ] **Step 4: Run the gate, write the report and commit**

Run: `npx prettier --write features/settings/client-team-section.tsx features/settings/client-team-section.test.tsx features/settings/settings.css features/settings/account-settings.tsx`, then `npm run check` — Expected: PASS.
Write `docs/engineering/handoffs/2026-09-25-client-team-task-5.md` from the template.

```bash
git add apps/web/features/settings/client-team-section.tsx apps/web/features/settings/client-team-section.test.tsx apps/web/features/settings/settings.css apps/web/features/settings/account-settings.tsx docs/engineering/handoffs/2026-09-25-client-team-task-5.md
git commit -m "feat(settings): show a client person their team and notification choice"
```

---

### Task 6: The studio names who requested a briefing

**Files:**
- Modify: `apps/web/features/briefings/briefing-model.ts`
- Test: `apps/web/features/briefings/briefing-model.test.ts`
- Modify: `apps/web/features/briefings/briefing-editor.tsx`
- Modify: `apps/web/features/briefings/briefing-editor-form.tsx`
- Test: `apps/web/features/briefings/briefing-editor-form.test.tsx` (create)
- Modify: `apps/web/features/briefings/briefing-editor-details.tsx`
- Create: `docs/engineering/handoffs/2026-09-25-client-team-task-6.md`

**Interfaces:**
- Consumes: Task 1's `save_briefing_revision(…, p_requested_by)` and its rules; Task 3's
  `useClientPeople`, `ClientPerson`.
- Produces (`briefing-model.ts`):
  - `Briefing.requested_by?: string | null`
  - `briefingPayload(clientId, draft, briefingId, estimatedCredits?, requestedBy?: string)` — adds
    `p_requested_by` only when `requestedBy` is non-empty
  - `initialRequester(requestedBy: string | null | undefined, people: { user_id: string }[]): string`
  - `requesterErrors(requestedBy: string, people: { user_id: string }[] | undefined): string[]` —
    `["Choose who requested this briefing."]` or `[]`
- Produces: `BriefingEditor` prop `people?: ClientPerson[]` (the studio only);
  `BriefingEditorDetails` prop `requester?: { people: ClientPerson[]; value: string; clientName:
  string; onChange: (id: string) => void }`.

- [ ] **Step 1: Write the failing model tests**

In `apps/web/features/briefings/briefing-model.test.ts`, add `initialRequester` and
`requesterErrors` to the existing `import { … } from "./briefing-model";` list, and append:

```ts
describe("the requester the studio names", () => {
  const people = [{ user_id: "ana" }, { user_id: "ben" }];

  it("opens on the briefing's own requester while they are still at the client", () => {
    expect(initialRequester("ben", people)).toBe("ben");
  });

  it("opens on the only person, and on nobody while the choice is open", () => {
    expect(initialRequester(null, [{ user_id: "ana" }])).toBe("ana");
    expect(initialRequester(undefined, people)).toBe("");
  });

  it("never reopens on someone who has left", () => {
    expect(initialRequester("zed", people)).toBe("");
    expect(initialRequester("zed", [{ user_id: "ana" }])).toBe("ana");
  });

  it("requires a choice among the client's people, and none when there are none", () => {
    expect(requesterErrors("", people)).toEqual(["Choose who requested this briefing."]);
    expect(requesterErrors("zed", people)).toEqual(["Choose who requested this briefing."]);
    expect(requesterErrors("ana", people)).toEqual([]);
    expect(requesterErrors("", [])).toEqual([]);
    expect(requesterErrors("", undefined)).toEqual([]);
  });

  it("sends the requester only when one is chosen", () => {
    const draft = initialDraft(undefined, {});
    expect(briefingPayload("client", draft, null, 3, "ana").p_requested_by).toBe("ana");
    expect(briefingPayload("client", draft, null, 3, "")).not.toHaveProperty("p_requested_by");
    expect(briefingPayload("client", draft, null)).not.toHaveProperty("p_requested_by");
  });
});
```

Run: `npx vitest run features/briefings/briefing-model.test.ts`
Expected: FAIL — `initialRequester` and `requesterErrors` are not exported.

- [ ] **Step 2: Write the model rules**

In `apps/web/features/briefings/briefing-model.ts`:

In `export type Briefing`, after `budget_note?: string | null;` add:

```ts
  /** The client person who asked for the work; absent from a designer's assigned-briefing read. */
  requested_by?: string | null;
```

Replace the signature and the last spread of `briefingPayload`:

```ts
export function briefingPayload(
  clientId: string,
  draft: BriefingDraft,
  briefingId: string | null,
  estimatedCredits?: number,
): Database["public"]["Functions"]["save_briefing"]["Args"] {
```

with

```ts
export function briefingPayload(
  clientId: string,
  draft: BriefingDraft,
  briefingId: string | null,
  estimatedCredits?: number,
  requestedBy?: string,
): Database["public"]["Functions"]["save_briefing"]["Args"] {
```

and

```ts
    ...(briefingId ? { p_briefing_id: briefingId } : {}),
  };
}
```

with

```ts
    ...(briefingId ? { p_briefing_id: briefingId } : {}),
    ...(requestedBy ? { p_requested_by: requestedBy } : {}),
  };
}

/**
 * The person the studio's Requested by picker opens on: the briefing's own requester while they are
 * still one of the client's people, otherwise the client's only person, otherwise nobody yet.
 * `save_briefing` applies the same one-person rule, so a former requester is never resent.
 */
export function initialRequester(
  requestedBy: string | null | undefined,
  people: { user_id: string }[],
): string {
  if (requestedBy && people.some((person) => person.user_id === requestedBy)) return requestedBy;
  return people.length === 1 ? people[0].user_id : "";
}

/**
 * The studio must name one of the client's people whenever the client has any; `save_briefing`
 * refuses a missing or foreign choice whatever the interface sends. A client person is never asked.
 */
export function requesterErrors(
  requestedBy: string,
  people: { user_id: string }[] | undefined,
): string[] {
  if (!people?.length || people.some((person) => person.user_id === requestedBy)) return [];
  return ["Choose who requested this briefing."];
}
```

Run: `npx vitest run features/briefings/briefing-model.test.ts` — Expected: PASS.

- [ ] **Step 3: Write the failing editor test**

Create `apps/web/features/briefings/briefing-editor-form.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientPerson } from "@/features/team/client-people";
import type { Briefing } from "./briefing-model";

const backend = vi.hoisted(() => ({ save: vi.fn(), submit: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: { name: "database" } }),
}));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/workspace/workspace-data")>()),
  useInvalidateNotifications: () => vi.fn(),
}));
vi.mock("./briefing-attachments", () => ({ BriefingAttachments: () => null }));
vi.mock("./briefing-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./briefing-data")>()),
  saveBriefingRevision: backend.save,
  submitBriefing: backend.submit,
}));

import { BriefingEditor } from "./briefing-editor-form";
import { services } from "./briefing-model";

const draft: Briefing = {
  id: "briefing-1",
  client_id: "client-1",
  campaign_id: null,
  title: "Autumn launch",
  service_type: "static-ad",
  status: "draft",
  overview: "",
  goals: "",
  direction: {},
  requested_deliverables: [],
  due_date: null,
  requested_by: null,
  created_at: "2026-09-20T00:00:00Z",
  updated_at: "2026-09-20T00:00:00Z",
};
const ana: ClientPerson = { user_id: "ana", display_name: "Ana Lima", email: "ana@sabre.test" };
const ben: ClientPerson = { user_id: "ben", display_name: "Ben Cole", email: "ben@sabre.test" };

function renderEditor(people?: ClientPerson[]) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BriefingEditor
        clientId="client-1"
        clientName="SABRE"
        briefing={draft}
        campaigns={[]}
        defaults={{}}
        serviceCatalog={services}
        people={people}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  backend.save.mockResolvedValue({ id: "briefing-1", updated_at: "2026-09-20T01:00:00Z" });
});

describe("the studio's Requested by", () => {
  it("asks the studio who requested the briefing before saving it", async () => {
    renderEditor([ana, ben]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Choose who requested this briefing.")).toBeInTheDocument();
    expect(backend.save).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Requested by" }), "ben");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(backend.save).toHaveBeenCalledTimes(1));
    expect(backend.save.mock.calls[0][1].payload).toMatchObject({
      p_briefing_id: "briefing-1",
      p_requested_by: "ben",
    });
  });

  it("opens on the client's only person", () => {
    renderEditor([ana]);
    expect(screen.getByRole("combobox", { name: "Requested by" })).toHaveValue("ana");
  });

  it("explains a client with nobody and saves without a requester", async () => {
    renderEditor([]);
    expect(
      screen.getByText("Nobody at SABRE has an account yet, so this briefing has no requester."),
    ).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(backend.save).toHaveBeenCalledTimes(1));
    expect(backend.save.mock.calls[0][1].payload).not.toHaveProperty("p_requested_by");
  });

  it("never asks a client person, who is always the requester of what they file", async () => {
    renderEditor();
    expect(screen.queryByRole("combobox", { name: "Requested by" })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(backend.save).toHaveBeenCalledTimes(1));
    expect(backend.save.mock.calls[0][1].payload).not.toHaveProperty("p_requested_by");
  });
});
```

Run: `npx vitest run features/briefings/briefing-editor-form.test.tsx`
Expected: FAIL — the editor still ignores `people`: there is no Requested by combobox and no
validation message.

- [ ] **Step 4: Add the picker to the Details step**

In `apps/web/features/briefings/briefing-editor-details.tsx`:

after `import { BriefingAttachments } from "./briefing-attachments";` add

```tsx
import type { ClientPerson } from "@/features/team/client-people";
```

replace

```tsx
  onSaveDraft,
  saving,
}: {
```

with

```tsx
  onSaveDraft,
  saving,
  requester,
}: {
```

replace

```tsx
  onSaveDraft: () => void;
  saving: boolean;
}) {
```

with

```tsx
  onSaveDraft: () => void;
  saving: boolean;
  /** The studio's Requested by picker; absent for a client person. */
  requester?: {
    people: ClientPerson[];
    value: string;
    clientName: string;
    onChange: (id: string) => void;
  };
}) {
```

and replace

```tsx
              placeholder="Give this idea a name"
            />
          </label>
          <div className="briefing-campaign-field">
```

with

```tsx
              placeholder="Give this idea a name"
            />
          </label>
          {requester &&
            (requester.people.length ? (
              <label>
                Requested by
                <select
                  value={requester.value}
                  onChange={(event) => requester.onChange(event.target.value)}
                >
                  <option value="">Choose a person</option>
                  {requester.people.map((person) => (
                    <option key={person.user_id} value={person.user_id}>
                      {person.display_name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="briefing-note">
                Nobody at {requester.clientName} has an account yet, so this briefing has no
                requester.
              </p>
            ))}
          <div className="briefing-campaign-field">
```

- [ ] **Step 5: Hold and validate the requester in the editor**

In `apps/web/features/briefings/briefing-editor-form.tsx`:

replace

```tsx
import {
  briefingPayload,
  estimateLabel,
  initialDraft,
  serviceEstimate,
  validateBriefing,
```

with

```tsx
import type { ClientPerson } from "@/features/team/client-people";
import {
  briefingPayload,
  estimateLabel,
  initialDraft,
  initialRequester,
  requesterErrors,
  serviceEstimate,
  validateBriefing,
```

replace

```tsx
  serviceCatalog,
  dialog,
}: {
  clientId: string;
  clientName: string;
  briefing?: Briefing;
  campaigns: Campaign[];
  defaults: BriefingDirection;
  serviceCatalog: ServiceDefinition[];
  dialog?: BriefingDialogOptions;
}) {
```

with

```tsx
  serviceCatalog,
  dialog,
  people,
}: {
  clientId: string;
  clientName: string;
  briefing?: Briefing;
  campaigns: Campaign[];
  defaults: BriefingDirection;
  serviceCatalog: ServiceDefinition[];
  dialog?: BriefingDialogOptions;
  /**
   * The client's people, for the studio's Requested by picker. A client person never gets it: they
   * are always the requester of what they file, and `save_briefing` ignores any other choice.
   */
  people?: ClientPerson[];
}) {
```

replace

```tsx
  const service = serviceCatalog.find((item) => item.id === draft.serviceId);
  const update = (patch: Partial<BriefingDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    if (errors.length) setErrors([]);
    setSaved(false);
    setDirty(true);
  };
```

with

```tsx
  const service = serviceCatalog.find((item) => item.id === draft.serviceId);
  const [requestedBy, setRequestedBy] = useState(() =>
    people ? initialRequester(briefing?.requested_by, people) : "",
  );
  /** Any edit clears an obsolete validation summary and the saved notice. */
  const touch = () => {
    if (errors.length) setErrors([]);
    setSaved(false);
    setDirty(true);
  };
  const update = (patch: Partial<BriefingDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    touch();
  };
  const chooseRequester = (id: string) => {
    setRequestedBy(id);
    touch();
  };
```

replace

```tsx
      const validation = submit ? validateBriefing(draft) : [];
```

with

```tsx
      const validation = [
        ...requesterErrors(requestedBy, people),
        ...(submit ? validateBriefing(draft) : []),
      ];
```

replace

```tsx
          savedId,
          serviceEstimate(service),
        ),
        expectedRevision,
```

with

```tsx
          savedId,
          serviceEstimate(service),
          requestedBy,
        ),
        expectedRevision,
```

replace

```tsx
  function review() {
    const validation = validateBriefing(draft);
```

with

```tsx
  function review() {
    const validation = [...requesterErrors(requestedBy, people), ...validateBriefing(draft)];
```

and replace

```tsx
          onSaveDraft={() => save.mutate(false)}
          saving={busy}
        />
```

with

```tsx
          onSaveDraft={() => save.mutate(false)}
          saving={busy}
          requester={
            people
              ? { people, value: requestedBy, clientName, onChange: chooseRequester }
              : undefined
          }
        />
```

- [ ] **Step 6: Load the client's people for the studio**

Replace `apps/web/features/briefings/briefing-editor.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { useAuth } from "@/features/auth/auth-provider";
import { useClientPeople } from "@/features/team/team-data";
import { useClients } from "@/features/workspace/workspace-data";
import { useBriefingBrand, useBriefings, useCampaigns, useServicePresets } from "./briefing-data";
import { brandDefaults, catalogWithPresets } from "./briefing-model";
import { BriefingEditor, type BriefingDialogOptions } from "./briefing-editor-form";
import "./briefings.css";
import { PageStatus } from "@/features/shared/page-status";
import { StudioManagedNotice } from "@/features/shared/studio-managed-notice";

/**
 * Resolves every prerequisite the editor needs — the client, an existing draft (when editing), the
 * campaign list, brand defaults, the service catalog with any preset overrides and, for the studio,
 * the client's people for Requested by — and gates on a designer session or an already-submitted
 * briefing before handing off to `BriefingEditor` (in `briefing-editor-form.tsx`), which owns the
 * actual multi-step form.
 */
export function BriefingEditorPage({
  clientId,
  briefingId,
  dialog,
}: {
  clientId: string;
  briefingId?: string;
  dialog?: BriefingDialogOptions;
}) {
  const { profile } = useAuth();
  const clients = useClients();
  const briefings = useBriefings(clientId);
  const campaigns = useCampaigns(clientId);
  const brand = useBriefingBrand(clientId);
  const presets = useServicePresets();
  const people = useClientPeople(clientId);
  // Only the studio names a requester; a client person is always the requester of what they file.
  const studio = profile?.role === "agency";
  if (profile?.role === "designer") return <StudioManagedNotice area="Briefings" />;
  if (
    !profile ||
    clients.isPending ||
    campaigns.isPending ||
    brand.isPending ||
    presets.isPending ||
    (briefingId && briefings.isPending) ||
    (studio && people.isPending)
  )
    return <PageStatus>Loading your briefing…</PageStatus>;
  const client = clients.data?.find((item) => item.id === clientId);
  const briefing = briefings.data?.find((item) => item.id === briefingId);
  if (
    !client ||
    campaigns.error ||
    brand.error ||
    presets.error ||
    briefings.error ||
    (studio && people.error) ||
    (briefingId && !briefing)
  )
    return (
      <div className="page-content">
        <h1>Briefing unavailable.</h1>
        <p>We could not load this briefing or its brand context.</p>
        <button
          className="button"
          onClick={() => {
            void clients.refetch();
            void campaigns.refetch();
            void brand.refetch();
            void presets.refetch();
            void briefings.refetch();
            void people.refetch();
          }}
        >
          Try again
        </button>
        <Link className="button quiet" href={`/clients/${clientId}/briefings`}>
          Back to briefings
        </Link>
      </div>
    );
  if (briefing && briefing.status !== "draft")
    return (
      <div className="page-content">
        <h1>This briefing has been submitted.</h1>
        <p>Your submitted scope is saved for review.</p>
        <Link href={`/clients/${clientId}/briefings/${briefing.id}`} className="button">
          View briefing
        </Link>
      </div>
    );
  return (
    <BriefingEditor
      key={briefingId ?? clientId}
      clientId={clientId}
      clientName={client.name}
      briefing={briefing}
      campaigns={campaigns.data ?? []}
      defaults={brandDefaults(brand.data ?? [])}
      serviceCatalog={catalogWithPresets(presets.data ?? [])}
      dialog={dialog}
      people={studio ? people.data?.team : undefined}
    />
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run features/briefings/briefing-model.test.ts features/briefings/briefing-editor-form.test.tsx`
Expected: PASS.

- [ ] **Step 8: Run the gate and the briefing flows**

Run: `npx prettier --write features/briefings/briefing-model.ts features/briefings/briefing-model.test.ts features/briefings/briefing-editor.tsx features/briefings/briefing-editor-form.tsx features/briefings/briefing-editor-form.test.tsx features/briefings/briefing-editor-details.tsx`, then `npm run check` — Expected: PASS.
Run: `npx playwright test tests/e2e/briefing-modal.spec.ts tests/e2e/intake-admin.spec.ts --output=../outputs/pw-client-team-6`
Expected: all pass — the intake fixture client has one person, so the studio's picker opens on them
and its validation summary is unchanged.

- [ ] **Step 9: Write the report and commit**

Write `docs/engineering/handoffs/2026-09-25-client-team-task-6.md` from the template.

```bash
git add apps/web/features/briefings/briefing-model.ts apps/web/features/briefings/briefing-model.test.ts apps/web/features/briefings/briefing-editor.tsx apps/web/features/briefings/briefing-editor-form.tsx apps/web/features/briefings/briefing-editor-form.test.tsx apps/web/features/briefings/briefing-editor-details.tsx docs/engineering/handoffs/2026-09-25-client-team-task-6.md
git commit -m "feat(briefings): let the studio name who requested a briefing"
```

---

### Task 7: Requested by on the list, the briefing page and the project, and the studio's change

**Files:**
- Modify: `apps/web/features/briefings/briefing-data.ts`
- Test: `apps/web/features/briefings/briefing-data.test.ts`
- Modify: `apps/web/features/briefings/briefings-page.tsx`
- Test: `apps/web/features/briefings/briefings-page.test.tsx` (create)
- Modify: `apps/web/features/briefings/briefing-detail.tsx`
- Test: `apps/web/features/briefings/briefing-detail.test.tsx` (replace)
- Modify: `apps/web/features/briefings/briefings.css`
- Modify: `apps/web/features/projects/project-details.tsx`
- Test: `apps/web/features/projects/project-details.test.tsx` (create)
- Create: `docs/engineering/handoffs/2026-09-25-client-team-task-7.md`

**Interfaces:**
- Consumes: Task 1's `briefings.requested_by`, `set_briefing_requester`; Task 3's `useClientPeople`,
  `personName`, `requesterLabel`, `ClientPerson`; Task 6's `Briefing.requested_by`,
  `initialRequester`.
- Produces (`briefing-data.ts`): `useBriefingRequester(briefingId: string | null)` → query of
  `string | null` (the studio and client people only; its key starts with
  `briefingQueryKeys.briefings`, so a briefing write refreshes it);
  `setBriefingRequester(database, { briefingId: string; requestedBy: string }): Promise<void>`.
- Produces (CSS): `.briefing-list-requester`, `.briefing-requester`.

- [ ] **Step 1: Write the failing data test**

In `apps/web/features/briefings/briefing-data.test.ts`, add `setBriefingRequester` to the
`import { … } from "./briefing-data";` list and append:

```ts
describe("requester writes", () => {
  it("changes who a briefing's work is for", async () => {
    const { database, rpc } = stubDatabase({ data: null, error: null });
    await setBriefingRequester(database, { briefingId: "briefing-1", requestedBy: "person-1" });
    expect(rpc).toHaveBeenCalledWith("set_briefing_requester", {
      p_briefing_id: "briefing-1",
      p_requested_by: "person-1",
    });
  });

  it("surfaces the database's refusal", async () => {
    const { database } = stubDatabase({
      data: null,
      error: { message: "Choose a person from this client as the requester" },
    });
    await expect(
      setBriefingRequester(database, { briefingId: "briefing-1", requestedBy: "person-2" }),
    ).rejects.toThrow("Choose a person from this client as the requester");
  });
});
```

Run: `npx vitest run features/briefings/briefing-data.test.ts`
Expected: FAIL — `setBriefingRequester` is not exported.

- [ ] **Step 2: Add the requester read and write**

In `apps/web/features/briefings/briefing-data.ts`, add after `useBriefingProject`:

```ts
/**
 * Who asked for the briefing a project came from, for that project's details. Designers never read
 * it: the gate skips the query, and `briefings` admits only the studio and the client's own people.
 */
export function useBriefingRequester(briefingId: string | null) {
  const { database, session, profile } = useAuth();
  return useQuery({
    queryKey: [briefingQueryKeys.briefings, "requester", session?.user.id, briefingId],
    enabled:
      !!session && !!briefingId && (profile?.role === "agency" || profile?.role === "client"),
    queryFn: async () =>
      (
        assertResult(
          await database
            .from("briefings")
            .select("requested_by")
            .eq("id", briefingId!)
            .maybeSingle(),
        ) as { requested_by: string | null } | null
      )?.requested_by ?? null,
  });
}
```

and add after `submitBriefing`:

```ts
/**
 * The studio changes who a briefing's work is for, for example after the requester leaves;
 * `set_briefing_requester` accepts only one of the client's active people.
 */
export async function setBriefingRequester(
  database: SupabaseDatabase,
  input: { briefingId: string; requestedBy: string },
) {
  assertResult(
    await database.rpc("set_briefing_requester", {
      p_briefing_id: input.briefingId,
      p_requested_by: input.requestedBy,
    }),
  );
}
```

Run: `npx vitest run features/briefings/briefing-data.test.ts` — Expected: PASS.

- [ ] **Step 3: Write the failing list test**

Create `apps/web/features/briefings/briefings-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Briefing } from "./briefing-model";

const state = vi.hoisted(() => ({
  role: "agency" as "agency" | "client" | "designer",
  briefings: [] as Briefing[],
}));
const query = (data: unknown) => ({ data, isPending: false, error: null, refetch: vi.fn() });
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ profile: { role: state.role } }),
}));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/workspace/workspace-data")>();
  return {
    ...actual,
    useClients: () => query([{ id: "c1", name: "SABRE" }]),
    useDateFormat: () => actual.createDateFormatters("UTC"),
  };
});
vi.mock("./briefing-data", () => ({
  useBriefings: () => query(state.briefings),
  useCampaigns: () => query([]),
}));
vi.mock("@/features/team/team-data", () => ({
  useClientPeople: () =>
    query(
      state.role === "designer"
        ? undefined
        : {
            team: [{ user_id: "ana", display_name: "Ana Lima", email: "ana@sabre.test" }],
            names: state.role === "agency" ? { ana: "Ana Lima", ben: "Ben Cole" } : {},
          },
    ),
}));

import { BriefingsPage } from "./briefings-page";

const briefing = (overrides: Partial<Briefing>): Briefing => ({
  id: "b1",
  client_id: "c1",
  campaign_id: null,
  title: "Autumn launch",
  service_type: "static-ad",
  status: "awaiting_review",
  overview: "",
  goals: "",
  direction: {},
  requested_deliverables: [],
  due_date: null,
  requested_by: "ana",
  created_at: "2026-09-20T00:00:00Z",
  updated_at: "2026-09-20T00:00:00Z",
  ...overrides,
});

beforeEach(() => {
  state.role = "agency";
  state.briefings = [
    briefing({}),
    briefing({ id: "b2", title: "Holiday poster", requested_by: "ben" }),
  ];
});

describe("BriefingsPage requester column", () => {
  it("names each requester for the studio, marking someone who left", () => {
    render(<BriefingsPage clientId="c1" />);
    expect(screen.getByText("Requested by Ana Lima")).toBeInTheDocument();
    expect(screen.getByText("Requested by Ben Cole (left)")).toBeInTheDocument();
  });

  it("shows a client a former member without their name", () => {
    state.role = "client";
    render(<BriefingsPage clientId="c1" />);
    expect(screen.getByText("Requested by Ana Lima")).toBeInTheDocument();
    expect(screen.getByText("Requested by Former member")).toBeInTheDocument();
    expect(screen.queryByText(/Ben Cole/)).not.toBeInTheDocument();
  });

  it("shows a designer no requester", () => {
    state.role = "designer";
    render(<BriefingsPage clientId="c1" />);
    expect(screen.getByText("Autumn launch")).toBeInTheDocument();
    expect(screen.queryByText(/Requested by/)).not.toBeInTheDocument();
  });
});
```

Run: `npx vitest run features/briefings/briefings-page.test.tsx`
Expected: FAIL — no "Requested by …" text.

- [ ] **Step 4: Add the Requested by column**

In `apps/web/features/briefings/briefings-page.tsx`, add to the imports:

```tsx
import { personName, requesterLabel } from "@/features/team/client-people";
import { useClientPeople } from "@/features/team/team-data";
```

after `const campaigns = useCampaigns(clientId);` add:

```tsx
  const people = useClientPeople(clientId);
```

and replace

```tsx
                  "Campaign not chosen"}
              </span>
```

with

```tsx
                  "Campaign not chosen"}
              </span>
              <span className="briefing-list-requester">
                {requesterLabel(personName(item.requested_by, people.data, profile?.role))}
              </span>
```

In `apps/web/features/briefings/briefings.css`, replace

```css
/* One line per briefing: title, campaign, service, status, due date. */
.briefing-list-row {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.2fr) 136px 56px 16px;
```

with

```css
/* One line per briefing: title, campaign, requester, service, status, due date. */
.briefing-list-row {
  display: grid;
  grid-template-columns:
    minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr)
    136px 56px 16px;
```

replace

```css
.briefing-list-campaign,
.briefing-list-service,
.briefing-list-date {
  overflow: hidden;
```

with

```css
.briefing-list-campaign,
.briefing-list-requester,
.briefing-list-service,
.briefing-list-date {
  overflow: hidden;
```

in the `@media (max-width: 1000px)` block replace

```css
  .briefing-list-service,
  .briefing-list-date {
    display: none;
  }
```

with

```css
  .briefing-list-requester,
  .briefing-list-service,
  .briefing-list-date {
    display: none;
  }
```

and after the rule `.briefing-list-row .status-badge { justify-self: start; }` add:

```css
/* "Requested by <name>" under a briefing's title, with the studio's Change beside it. */
.briefing-requester {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
}
```

Run: `npx vitest run features/briefings/briefings-page.test.tsx` — Expected: PASS.

- [ ] **Step 5: Write the failing briefing page test**

Replace `apps/web/features/briefings/briefing-detail.test.tsx` with:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientPeople } from "@/features/team/client-people";
import { BriefingDetail } from "./briefing-detail";
import type { Briefing } from "./briefing-model";

const ana = { user_id: "ana", display_name: "Ana Lima", email: "ana@sabre.test" };
const ben = { user_id: "ben", display_name: "Ben Cole", email: "ben@sabre.test" };
const fixture = vi.hoisted(() => ({
  briefing: null as Briefing | null,
  balance: 100,
  database: {},
  role: "agency" as "agency" | "client",
  people: undefined as ClientPeople | undefined,
  setRequester: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: fixture.database, profile: { id: "viewer-1", role: fixture.role } }),
}));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/workspace/workspace-data")>()),
  useDateFormat: () => ({ formatDate: () => "" }),
  useInvalidateWorkspace: () => vi.fn(),
  useInvalidateNotifications: () => vi.fn(),
}));
vi.mock("@/features/team/team-data", () => ({
  useClientPeople: () => ({ data: fixture.people, isPending: false, error: null }),
}));
vi.mock("./briefing-attachments", () => ({ BriefingAttachments: () => null }));
vi.mock("./briefing-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./briefing-data")>()),
  useBriefings: () => ({
    data: fixture.briefing ? [fixture.briefing] : [],
    isPending: false,
    error: null,
  }),
  useCampaigns: () => ({ data: [], isPending: false, error: null }),
  useBriefingProject: () => ({ data: null, isPending: false, error: null }),
  useBriefingCreditBalance: () => ({
    data: { balance: fixture.balance },
    isPending: false,
    error: null,
  }),
  confirmBriefingBudget: vi.fn(),
  acceptBriefing: vi.fn(),
  setBriefingRequester: fixture.setRequester,
}));

// jsdom has no native dialog/top-layer implementation; real focus isolation is covered in E2E.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  },
  close: {
    configurable: true,
    value() {
      this.removeAttribute("open");
    },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  fixture.role = "agency";
  fixture.people = { team: [ana, ben], names: { ana: "Ana Lima", ben: "Ben Cole", cy: "Cy Gone" } };
  fixture.setRequester.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

function baseBriefing(overrides: Partial<Briefing> = {}): Briefing {
  return {
    id: "briefing-1",
    client_id: "client-1",
    campaign_id: null,
    title: "Fixture briefing",
    service_type: "social",
    status: "awaiting_review",
    overview: "Overview",
    goals: "Goals",
    direction: {},
    requested_deliverables: [],
    due_date: null,
    estimated_credits: 3,
    confirmed_credits: null,
    budget_note: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function mountDetail() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <BriefingDetail clientId="client-1" briefingId="briefing-1" />
    </QueryClientProvider>,
  );
}

describe("BriefingDetail agency budget review — one primary action at a time", () => {
  it("shows only Confirm budget while the briefing has not been budget confirmed", async () => {
    fixture.briefing = baseBriefing({ status: "awaiting_review" });
    mountDetail();
    expect(await screen.findByRole("button", { name: "Confirm budget" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Accept & create project" }),
    ).not.toBeInTheDocument();
  });

  it("shows only Accept & create project once budget confirmed and unedited, with balance messaging and the credits link", async () => {
    fixture.briefing = baseBriefing({
      status: "budget_confirmed",
      confirmed_credits: 5,
      budget_note: "Approved scope.",
    });
    mountDetail();
    expect(await screen.findByRole("button", { name: "Accept & create project" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Confirm budget" })).not.toBeInTheDocument();
    expect(screen.getByText("5 credits · one project")).toBeVisible();
    expect(screen.getByRole("link", { name: "View credits" })).toBeVisible();
  });

  it("brings back only Confirm budget once a confirmed budget is edited, keeping the unsaved-changes note", async () => {
    const user = userEvent.setup();
    fixture.briefing = baseBriefing({
      status: "budget_confirmed",
      confirmed_credits: 5,
      budget_note: "Approved scope.",
    });
    mountDetail();
    const creditsField = await screen.findByRole("spinbutton", {
      name: "Approved project credits",
    });
    await user.clear(creditsField);
    await user.type(creditsField, "6");

    expect(screen.getByRole("button", { name: "Confirm budget" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Accept & create project" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/unsaved changes/i)).toBeVisible();
  });
});

describe("BriefingDetail requester", () => {
  it("names the requester and lets the studio change them", async () => {
    fixture.briefing = baseBriefing({ requested_by: "ana" });
    mountDetail();
    expect(screen.getByText("Requested by Ana Lima")).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Change who requested this briefing" }));
    const dialog = screen.getByRole("dialog", { name: "Who requested this briefing?" });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Requested by" }), "ben");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(fixture.setRequester).toHaveBeenCalledWith(fixture.database, {
        briefingId: "briefing-1",
        requestedBy: "ben",
      }),
    );
  });

  it("tells the studio when the requester has left", () => {
    fixture.briefing = baseBriefing({ requested_by: "cy" });
    mountDetail();
    expect(screen.getByText("Requested by Cy Gone (left)")).toBeVisible();
  });

  it("lets the studio choose a requester when none is recorded", () => {
    fixture.briefing = baseBriefing({ requested_by: null });
    mountDetail();
    expect(screen.getByText("No requester yet")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Choose who requested this briefing" }),
    ).toBeVisible();
  });

  it("shows a client the requester, a former member without a name, and no studio control", () => {
    fixture.role = "client";
    fixture.people = { team: [ana, ben], names: {} };
    fixture.briefing = baseBriefing({ requested_by: "cy" });
    mountDetail();
    expect(screen.getByText("Requested by Former member")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /who requested this briefing/ }),
    ).not.toBeInTheDocument();
  });
});
```

Run: `npx vitest run features/briefings/briefing-detail.test.tsx`
Expected: FAIL — the four requester tests find no "Requested by …" text; the three budget tests
still pass.

- [ ] **Step 6: Show and change the requester on the briefing page**

In `apps/web/features/briefings/briefing-detail.tsx`:

replace

```tsx
import {
  acceptBriefing,
  briefingQueryKeys,
  confirmBriefingBudget,
  useBriefingCreditBalance,
  useBriefingProject,
  useBriefings,
  useCampaigns,
} from "./briefing-data";
import {
  briefingStatusLabels,
  briefingStatusTones,
  initialDraft,
  type Briefing,
} from "./briefing-model";
```

with

```tsx
import { Modal } from "@/features/shared/modal";
import {
  personName,
  requesterLabel,
  type ClientPerson,
} from "@/features/team/client-people";
import { useClientPeople } from "@/features/team/team-data";
import {
  acceptBriefing,
  briefingQueryKeys,
  confirmBriefingBudget,
  setBriefingRequester,
  useBriefingCreditBalance,
  useBriefingProject,
  useBriefings,
  useCampaigns,
} from "./briefing-data";
import {
  briefingStatusLabels,
  briefingStatusTones,
  initialDraft,
  initialRequester,
  type Briefing,
} from "./briefing-model";
```

replace

```tsx
  const linked = useBriefingProject(briefingId);
  if (briefings.isPending || campaigns.isPending)
```

with

```tsx
  const linked = useBriefingProject(briefingId);
  const people = useClientPeople(clientId);
  const [changingRequester, setChangingRequester] = useState(false);
  if (briefings.isPending || campaigns.isPending)
```

replace

```tsx
  return (
    <div className="page-content briefing-detail">
      <header className="page-heading client-page-heading">
        <div className="page-title-row">
          <Link
            href={`/clients/${clientId}/briefings`}
            className="icon-button"
            aria-label="All briefings"
            title="All briefings"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1>{briefing.title || "Untitled briefing"}</h1>
        </div>
```

with

```tsx
  const requester = personName(briefing.requested_by, people.data, profile?.role);
  const canChangeRequester = profile?.role === "agency" && !!people.data?.team.length;
  const requesterLine =
    requesterLabel(requester) ?? (canChangeRequester ? "No requester yet" : null);
  return (
    <div className="page-content briefing-detail">
      <header className="page-heading client-page-heading">
        <div>
          <div className="page-title-row">
            <Link
              href={`/clients/${clientId}/briefings`}
              className="icon-button"
              aria-label="All briefings"
              title="All briefings"
            >
              <ArrowLeft size={16} />
            </Link>
            <h1>{briefing.title || "Untitled briefing"}</h1>
          </div>
          {requesterLine && (
            <p className="briefing-requester">
              <span>{requesterLine}</span>
              {canChangeRequester && (
                <button
                  className="button quiet small"
                  aria-label={`${requester ? "Change" : "Choose"} who requested this briefing`}
                  onClick={() => setChangingRequester(true)}
                >
                  {requester ? "Change" : "Choose"}
                </button>
              )}
            </p>
          )}
        </div>
```

replace the end of `BriefingDetail`'s returned markup

```tsx
          )}
        </aside>
      </div>
    </div>
  );
}

function BudgetReview({ briefing }: { briefing: Briefing }) {
```

with

```tsx
          )}
        </aside>
      </div>
      {changingRequester && people.data && (
        <RequesterDialog
          briefing={briefing}
          people={people.data.team}
          onClose={() => setChangingRequester(false)}
        />
      )}
    </div>
  );
}

/** The studio's choice of who a briefing's work is for; the database accepts only the client's people. */
function RequesterDialog({
  briefing,
  people,
  onClose,
}: {
  briefing: Briefing;
  people: ClientPerson[];
  onClose: () => void;
}) {
  const { database } = useAuth();
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState(() => initialRequester(briefing.requested_by, people));
  const save = useMutation({
    mutationFn: async () => {
      if (!choice) throw new Error("Choose who requested this briefing.");
      await setBriefingRequester(database, { briefingId: briefing.id, requestedBy: choice });
    },
    // Changing the requester rewrites the briefing row only.
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [briefingQueryKeys.briefings] });
      onClose();
    },
  });
  return (
    <Modal
      open
      title="Who requested this briefing?"
      description="Notifications about its project go to this person."
      onClose={() => {
        if (!save.isPending) onClose();
      }}
    >
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label>
          Requested by
          <select value={choice} onChange={(event) => setChoice(event.target.value)}>
            <option value="">Choose a person</option>
            {people.map((person) => (
              <option key={person.user_id} value={person.user_id}>
                {person.display_name}
              </option>
            ))}
          </select>
        </label>
        {save.error && <FormError>{save.error.message}</FormError>}
        <div className="form-actions">
          <button className="button" type="button" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BudgetReview({ briefing }: { briefing: Briefing }) {
```

Run: `npx vitest run features/briefings/briefing-detail.test.tsx` — Expected: PASS (7 tests).

- [ ] **Step 7: Write the failing project details test**

Create `apps/web/features/projects/project-details.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasVersion, TableRow } from "./project-data";

const state = vi.hoisted(() => ({
  role: "agency" as "agency" | "client" | "designer",
  requester: "ana" as string | null,
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: {}, profile: { id: "viewer-1", role: state.role } }),
}));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/workspace/workspace-data")>();
  return { ...actual, useDateFormat: () => actual.createDateFormatters("UTC") };
});
vi.mock("./project-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./project-data")>()),
  useProjectAssignments: () => ({
    data: { members: [], assigned: [] },
    error: null,
    refetch: vi.fn(),
  }),
  useInvalidateProject: () => vi.fn(),
}));
vi.mock("@/features/briefings/briefing-data", () => ({
  useBriefingRequester: () => ({ data: state.role === "designer" ? undefined : state.requester }),
}));
vi.mock("@/features/team/team-data", () => ({
  useClientPeople: () => ({
    data:
      state.role === "designer"
        ? undefined
        : {
            team: [{ user_id: "ana", display_name: "Ana Lima", email: "ana@sabre.test" }],
            names: state.role === "agency" ? { ana: "Ana Lima", ben: "Ben Cole" } : {},
          },
  }),
}));

import { ProjectDetails } from "./project-details";

const project = {
  id: "p1",
  client_id: "c1",
  briefing_id: "b1",
  campaign_id: null,
  title: "Campus Welcome",
  description: "",
  status: "client_review",
  service_type: "static-ad",
  start_date: null,
  due_date: null,
  created_at: "2026-09-20T00:00:00Z",
  updated_at: "2026-09-20T00:00:00Z",
} as unknown as TableRow<"projects">;
const deliverables = [
  { id: "d1", name: "Portrait Feed" },
] as unknown as TableRow<"deliverables">[];

function renderDetails(versions: CanvasVersion[] = []) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProjectDetails project={project} deliverables={deliverables} versions={versions} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.role = "agency";
  state.requester = "ana";
});

describe("ProjectDetails requester", () => {
  it("names who asked for the project", () => {
    renderDetails();
    expect(screen.getByText("Requested by")).toBeInTheDocument();
    expect(screen.getByText("Ana Lima")).toBeInTheDocument();
  });

  it("marks a requester who left: by name for the studio, as a former member for the client", () => {
    state.requester = "ben";
    renderDetails();
    expect(screen.getByText("Ben Cole (left)")).toBeInTheDocument();
  });

  it("never names a former requester to the client", () => {
    state.role = "client";
    state.requester = "ben";
    renderDetails();
    expect(screen.getByText("Former member")).toBeInTheDocument();
    expect(screen.queryByText(/Ben Cole/)).not.toBeInTheDocument();
  });

  it("shows a designer no requester", () => {
    state.role = "designer";
    renderDetails();
    expect(screen.queryByText("Requested by")).not.toBeInTheDocument();
  });
});
```

Run: `npx vitest run features/projects/project-details.test.tsx`
Expected: FAIL — no "Requested by" term (the designer test passes).

- [ ] **Step 8: Show the requester in the project's details**

In `apps/web/features/projects/project-details.tsx`, add to the imports:

```tsx
import { useBriefingRequester } from "@/features/briefings/briefing-data";
import { personName } from "@/features/team/client-people";
import { useClientPeople } from "@/features/team/team-data";
```

replace

```tsx
  const assignments = useProjectAssignments(project.id);
```

with

```tsx
  const assignments = useProjectAssignments(project.id);
  // Who asked for the work (and, below, who decided on each version): the studio and the client
  // only. Both reads are disabled for a designer, and `personName` names nobody to one.
  const people = useClientPeople(project.client_id);
  const requester = useBriefingRequester(project.briefing_id);
  const requesterName = personName(requester.data, people.data, profile?.role);
```

and replace

```tsx
          <dd>{project.service_type.replaceAll("-", " ")}</dd>
```

with

```tsx
          <dd>{project.service_type.replaceAll("-", " ")}</dd>
          {requesterName && (
            <>
              <dt>Requested by</dt>
              <dd>{requesterName}</dd>
            </>
          )}
```

Run: `npx vitest run features/projects/project-details.test.tsx` — Expected: PASS (4 tests).

- [ ] **Step 9: Run the gate and the briefing flows**

Run: `npx prettier --write features/briefings/briefing-data.ts features/briefings/briefing-data.test.ts features/briefings/briefings-page.tsx features/briefings/briefings-page.test.tsx features/briefings/briefing-detail.tsx features/briefings/briefing-detail.test.tsx features/briefings/briefings.css features/projects/project-details.tsx features/projects/project-details.test.tsx`, then `npm run check` — Expected: PASS.
Run: `npx playwright test tests/e2e/client-pages-layout.spec.ts tests/e2e/intake-admin.spec.ts --output=../outputs/pw-client-team-7`
Expected: all pass (the list keeps its one-line rows and the header its layout).

- [ ] **Step 10: Write the report and commit**

Write `docs/engineering/handoffs/2026-09-25-client-team-task-7.md` from the template.

```bash
git add apps/web/features/briefings/briefing-data.ts apps/web/features/briefings/briefing-data.test.ts apps/web/features/briefings/briefings-page.tsx apps/web/features/briefings/briefings-page.test.tsx apps/web/features/briefings/briefing-detail.tsx apps/web/features/briefings/briefing-detail.test.tsx apps/web/features/briefings/briefings.css apps/web/features/projects/project-details.tsx apps/web/features/projects/project-details.test.tsx docs/engineering/handoffs/2026-09-25-client-team-task-7.md
git commit -m "feat(briefings): show who requested a briefing and let the studio change it"
```

---

### Task 8: Approved by and Changes requested by

**Files:**
- Modify: `apps/web/features/reviews/review-data.ts`
- Modify: `apps/web/features/reviews/reviews-page.tsx`
- Test: `apps/web/features/reviews/reviews-page.test.tsx` (create)
- Modify: `apps/web/features/projects/project-data.ts`
- Test: `apps/web/features/projects/canvas-versions.test.ts`
- Modify: `apps/web/features/projects/project-details.tsx`
- Test: `apps/web/features/projects/project-details.test.tsx`
- Modify: `apps/web/features/overview/overview-model.test.ts` (its `ReviewRow` factory)
- Create: `docs/engineering/handoffs/2026-09-25-client-team-task-8.md`

**Interfaces:**
- Consumes: Task 1's `publication_reviews.reviewed_by`; Task 3's `useClientPeople`, `personName`,
  `reviewDecisionLabel`; Task 7's `project-details.test.tsx` mocks and `renderDetails`.
- Produces: `ReviewRow.reviewedBy: string | null` and `ReviewRow.reviewedAt: string | null`;
  `CanvasVersion.reviewedBy?: string | null` and `CanvasVersion.reviewedAt?: string | null`
  (absent on the internal channel).

- [ ] **Step 1: Write the failing tests**

In `apps/web/features/projects/canvas-versions.test.ts`, replace the review factory

```ts
const review = (publicationId: string): Row<"publication_reviews"> => ({
```

with

```ts
const review = (
  publicationId: string,
  reviewedBy: string | null = null,
): Row<"publication_reviews"> => ({
```

and in its body replace `  reviewed_by: null,` with `  reviewed_by: reviewedBy,`. Then add inside
`describe("canvas versions and their client review", …)`:

```ts
  it("carries who decided on a client-channel version, and when", () => {
    const [version] = toCanvasVersions([publishedVersion], [review(publishedVersion.id, "ana")], true);
    expect(version.reviewedBy).toBe("ana");
    expect(version.reviewedAt).toBe("2026-09-21T12:00:00.000Z");
  });

  it("never gives an internal version a reviewer, even on an id collision", () => {
    const [version] = toCanvasVersions([internalVersion], [review(internalVersion.id, "ana")], false);
    expect(version.reviewedBy).toBeUndefined();
    expect(version.reviewedAt).toBeUndefined();
  });
```

Append to `apps/web/features/projects/project-details.test.tsx`:

```tsx
describe("ProjectDetails version history", () => {
  const version = (overrides: Partial<CanvasVersion>): CanvasVersion => ({
    id: "v2",
    projectId: "p1",
    deliverableId: "d1",
    number: 2,
    note: "",
    status: "approved",
    date: "2026-09-20T00:00:00Z",
    ...overrides,
  });

  it("names who decided on a version and when", () => {
    renderDetails([version({ reviewedBy: "ana", reviewedAt: "2026-09-24T10:00:00Z" })]);
    expect(screen.getByText("Approved by Ana Lima · Sep 24")).toBeInTheDocument();
  });

  it("keeps today's wording for a decision recorded before reviewers were", () => {
    renderDetails([
      version({
        status: "changes_requested",
        date: "2026-09-18T00:00:00Z",
        reviewedBy: null,
        reviewedAt: "2026-09-19T00:00:00Z",
      }),
    ]);
    expect(screen.getByText("Sep 18 · Changes requested")).toBeInTheDocument();
  });

  it("tells the client a former member decided", () => {
    state.role = "client";
    renderDetails([
      version({
        status: "changes_requested",
        reviewedBy: "ben",
        reviewedAt: "2026-09-23T10:00:00Z",
      }),
    ]);
    expect(screen.getByText("Changes requested by Former member · Sep 23")).toBeInTheDocument();
  });
});
```

Create `apps/web/features/reviews/reviews-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewRow } from "./review-data";

const state = vi.hoisted(() => ({
  role: "agency" as "agency" | "client",
  rows: [] as ReviewRow[],
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ profile: { role: state.role } }),
}));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/workspace/workspace-data")>();
  return {
    ...actual,
    useClients: () => ({ data: [{ id: "c1", name: "SABRE" }], isPending: false }),
    useDateFormat: () => actual.createDateFormatters("UTC"),
  };
});
vi.mock("./review-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./review-data")>()),
  useReviews: () => ({ data: state.rows, isPending: false, error: null, refetch: vi.fn() }),
}));
vi.mock("@/features/team/team-data", () => ({
  useClientPeople: () => ({
    data: {
      team: [{ user_id: "ana", display_name: "Ana Lima", email: "ana@sabre.test" }],
      names: state.role === "agency" ? { ana: "Ana Lima", ben: "Ben Cole" } : {},
    },
  }),
}));

import { ReviewsPage } from "./reviews-page";

const row = (overrides: Partial<ReviewRow>): ReviewRow => ({
  id: "v1",
  projectId: "p1",
  title: "Campus Welcome",
  deliverable: "Portrait Feed",
  version: 2,
  status: "approved",
  date: "2026-09-20T00:00:00Z",
  note: "Second round.",
  internal: false,
  reviewedBy: "ana",
  reviewedAt: "2026-09-24T10:00:00Z",
  ...overrides,
});

beforeEach(() => {
  state.role = "agency";
  state.rows = [
    row({}),
    row({
      id: "v2",
      projectId: "p2",
      title: "Holiday Poster",
      status: "changes_requested",
      note: "First round.",
      reviewedBy: "ben",
      reviewedAt: "2026-09-23T10:00:00Z",
    }),
    row({ id: "v3", projectId: "p3", title: "Spring Sale", note: "Older round.", reviewedBy: null, reviewedAt: null }),
  ];
});

describe("ReviewsPage decisions", () => {
  it("names who decided and when, and keeps the release note in the tooltip", async () => {
    render(<ReviewsPage clientId="c1" />);
    expect(screen.getByText("Changes requested by Ben Cole (left) · Sep 23")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Approved" }));
    expect(screen.getByText("Approved by Ana Lima · Sep 24")).toHaveAttribute(
      "title",
      "Second round.",
    );
    expect(screen.getByText("Older round.")).toBeInTheDocument();
  });

  it("tells a client a former member decided", async () => {
    state.role = "client";
    render(<ReviewsPage clientId="c1" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "With the studio" }));
    expect(screen.getByText("Changes requested by Former member · Sep 23")).toBeInTheDocument();
  });
});
```

In `apps/web/features/overview/overview-model.test.ts`, in the `review()` factory, replace

```ts
    internal: false,
    ...overrides,
```

with

```ts
    internal: false,
    reviewedBy: null,
    reviewedAt: null,
    ...overrides,
```

Run: `npx vitest run features/projects/canvas-versions.test.ts features/projects/project-details.test.tsx features/reviews/reviews-page.test.tsx`
Expected: FAIL — `reviewedBy` is undefined on client-channel versions, and neither page shows a
decision line.

- [ ] **Step 2: Carry the reviewer through the reads**

In `apps/web/features/projects/project-data.ts`:

in `export type CanvasVersion`, after `feedback?: string;` add

```ts
  /** The client person who decided on a published version, and when; absent on the internal channel. */
  reviewedBy?: string | null;
  reviewedAt?: string | null;
```

replace

```ts
/** The three columns of a publication review the canvas reads. */
type CanvasReviewRow = Pick<
  TableRow<"publication_reviews">,
  "publication_id" | "status" | "feedback"
>;
```

with

```ts
/** The columns of a publication review the canvas reads. */
type CanvasReviewRow = Pick<
  TableRow<"publication_reviews">,
  "publication_id" | "status" | "feedback" | "reviewed_by" | "reviewed_at"
>;
```

and replace

```ts
      feedback: review?.feedback,
    };
```

with

```ts
      feedback: review?.feedback,
      reviewedBy: review?.reviewed_by,
      reviewedAt: review?.reviewed_at,
    };
```

In `apps/web/features/reviews/review-data.ts`:

in `export type ReviewRow`, after `internal: boolean;` add

```ts
  /** Who made the client's decision and when; null until decided, and on reviews decided before reviewers were recorded. */
  reviewedBy: string | null;
  reviewedAt: string | null;
```

replace

```ts
  publication_reviews?: { status: string } | null;
```

with

```ts
  publication_reviews?: {
    status: string;
    reviewed_by?: string | null;
    reviewed_at?: string | null;
  } | null;
```

replace

```ts
                "*,publication_reviews!publication_reviews_publication_id_fkey(status,feedback)",
```

with

```ts
                "*,publication_reviews!publication_reviews_publication_id_fkey(status,feedback,reviewed_by,reviewed_at)",
```

and replace

```ts
          internal: overrides.internal ?? internal,
        };
```

with

```ts
          internal: overrides.internal ?? internal,
          reviewedBy: version.publication_reviews?.reviewed_by ?? null,
          reviewedAt: version.publication_reviews?.reviewed_at ?? null,
        };
```

- [ ] **Step 3: Show the decision on the Reviews page**

In `apps/web/features/reviews/reviews-page.tsx`, add to the imports:

```tsx
import { personName, reviewDecisionLabel } from "@/features/team/client-people";
import { useClientPeople } from "@/features/team/team-data";
```

after `const data = useReviews(clientId);` add:

```tsx
  const people = useClientPeople(clientId);
```

and replace

```tsx
          {visible.map((row) => (
            <Link
              key={row.id}
              href={`/projects/${row.projectId}?channel=${row.internal ? "internal" : "client"}`}
              className="review-card"
            >
              <h2>{row.title}</h2>
              <span className="review-row-deliverable">
                {row.deliverable} · V{row.version}
              </span>
              <span className="review-row-note" title={row.note ?? undefined}>
                {row.note}
              </span>
```

with

```tsx
          {visible.map((row) => {
            // A decided version names who decided in the note column; its release note moves to
            // the tooltip. Older reviews without a recorded reviewer keep the note.
            const decision =
              row.reviewedBy && row.reviewedAt
                ? reviewDecisionLabel(
                    row.status,
                    personName(row.reviewedBy, people.data, profile?.role),
                    formatDate(row.reviewedAt),
                  )
                : null;
            return (
            <Link
              key={row.id}
              href={`/projects/${row.projectId}?channel=${row.internal ? "internal" : "client"}`}
              className="review-card"
            >
              <h2>{row.title}</h2>
              <span className="review-row-deliverable">
                {row.deliverable} · V{row.version}
              </span>
              <span className="review-row-note" title={row.note ?? undefined}>
                {decision ?? row.note}
              </span>
```

and close the new block by replacing

```tsx
              <ArrowUpRight size={16} />
            </Link>
          ))}
```

with

```tsx
              <ArrowUpRight size={16} />
            </Link>
            );
          })}
```

(`npx prettier --write` in Step 6 re-indents the block.)

- [ ] **Step 4: Show the decision in the project's version history**

In `apps/web/features/projects/project-details.tsx`, replace

```tsx
import { personName } from "@/features/team/client-people";
```

with

```tsx
import { personName, reviewDecisionLabel } from "@/features/team/client-people";
```

after the `requesterName` line (Task 7) add:

```tsx
  const decisionLine = (version: CanvasVersion) =>
    version.reviewedBy && version.reviewedAt
      ? reviewDecisionLabel(
          version.status,
          personName(version.reviewedBy, people.data, profile?.role),
          formatDate(version.reviewedAt),
        )
      : null;
```

and replace

```tsx
                  <span>
                    {formatDate(version.date)} · {versionStatusLabel(version.status)}
                  </span>
```

with

```tsx
                  <span>
                    {decisionLine(version) ??
                      `${formatDate(version.date)} · ${versionStatusLabel(version.status)}`}
                  </span>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run features/projects/canvas-versions.test.ts features/projects/project-details.test.tsx features/reviews/reviews-page.test.tsx features/reviews/review-status.test.ts features/overview`
Expected: PASS.

- [ ] **Step 6: Run the gate and the review flows**

Run: `npx prettier --write features/reviews/review-data.ts features/reviews/reviews-page.tsx features/reviews/reviews-page.test.tsx features/projects/project-data.ts features/projects/canvas-versions.test.ts features/projects/project-details.tsx features/projects/project-details.test.tsx features/overview/overview-model.test.ts`, then `npm run check` — Expected: PASS.
Run: `npx playwright test tests/e2e/project-feedback.spec.ts tests/e2e/overview.spec.ts --output=../outputs/pw-client-team-8`
Expected: all pass (the embedded review read now selects two more columns; the Overview is unchanged).

- [ ] **Step 7: Write the report and commit**

Write `docs/engineering/handoffs/2026-09-25-client-team-task-8.md` from the template.

```bash
git add apps/web/features/reviews/review-data.ts apps/web/features/reviews/reviews-page.tsx apps/web/features/reviews/reviews-page.test.tsx apps/web/features/projects/project-data.ts apps/web/features/projects/canvas-versions.test.ts apps/web/features/projects/project-details.tsx apps/web/features/projects/project-details.test.tsx apps/web/features/overview/overview-model.test.ts docs/engineering/handoffs/2026-09-25-client-team-task-8.md
git commit -m "feat(reviews): show who approved or requested changes"
```

---

### Task 9: Two people at one client, in a browser

**Files:**
- Modify: `apps/web/tests/e2e/project-fixture.ts`
- Create: `apps/web/tests/e2e/client-team.spec.ts`
- Create: `docs/engineering/handoffs/2026-09-25-client-team-task-9.md`

**Interfaces:**
- Consumes: every earlier task; `createTeamFixture` (`tests/e2e/team-fixture.ts`: `member("client")`
  creates `acceptance-team-<uuid>@dawes.local` named "Acceptance Team `<uuid>`" and deletes it, its
  audit events and notifications afterwards); `createProductionFixture`, `cleanupTestProject`
  (`tests/e2e/project-fixture.ts`); `credentials`, `localAdmin`, `localAgency`, `localCaller`,
  `signIn` (`tests/e2e/test-support.ts`).
- Produces: `createProductionFixture(agency, deliverables?, requestedBy?: string)` — the studio names
  `requestedBy` as the requester; without it `save_briefing` falls back to the client's only person.

- [ ] **Step 1: Let the production fixture name the requester**

In `apps/web/tests/e2e/project-fixture.ts`, replace

```ts
export async function createProductionFixture(
  agency: SupabaseClient<Database>,
  deliverables: FixtureDeliverable[] = defaultDeliverables,
) {
```

with

```ts
export async function createProductionFixture(
  agency: SupabaseClient<Database>,
  deliverables: FixtureDeliverable[] = defaultDeliverables,
  /** Required once SABRE has two or more people; with one, `save_briefing` names that person. */
  requestedBy?: string,
) {
```

and replace

```ts
      p_estimated_credits: 4,
    }),
  );
```

with

```ts
      p_estimated_credits: 4,
      ...(requestedBy ? { p_requested_by: requestedBy } : {}),
    }),
  );
```

- [ ] **Step 2: Write the browser test**

Create `apps/web/tests/e2e/client-team.spec.ts`:

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";
import { createTeamFixture, type TeamFixture } from "./team-fixture";
import { credentials, localAdmin, localAgency, localCaller, signIn } from "./test-support";

const test = base.extend<{ team: TeamFixture }>({
  team: async ({}, runWithFixture) => {
    const fixture = createTeamFixture();
    try {
      await runWithFixture(fixture);
    } finally {
      await fixture.cleanup();
    }
  },
});

function value<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("The client team check did not return a record.");
  return result.data as NonNullable<T>;
}

/** Whether the page fits its viewport without a horizontal scroll. */
function fitsWidth(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test("two people at one client act separately, and the product attributes and notifies each", async ({
  browser,
  team,
}) => {
  test.setTimeout(180_000);
  const sabre = value(await localAdmin.from("clients").select("id,name").eq("slug", "sabre").single());
  const requesterCaller = await localCaller(credentials.client);
  const requesterId = (await requesterCaller.auth.getUser()).data.user!.id;
  const requesterName = value(
    await localAdmin.from("profiles").select("display_name").eq("id", requesterId).single(),
  ).display_name;
  // A temporary second SABRE person; the team fixture deletes the account and everything it owns.
  const teammate = await team.member("client");
  expect(
    (await localAdmin.from("client_memberships").insert({ client_id: sabre.id, user_id: teammate.id }))
      .error,
  ).toBeNull();
  const agency = await localAgency();
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [teammatePage, requesterPage, studioPage] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  const onBehalfTitle = `Acceptance on behalf ${randomUUID().slice(0, 8)}`;
  let projectId: string | undefined;
  try {
    // The studio files the fixture's briefing for the SABRE person, who becomes its requester.
    const fixture = await createProductionFixture(agency, undefined, requesterId);
    projectId = fixture.projectId;
    const projectTitle = value(
      await localAdmin.from("projects").select("title").eq("id", fixture.projectId).single(),
    ).title;
    const deliverable = value(
      await agency.from("deliverables").select("id").eq("project_id", fixture.projectId).single(),
    );
    const publish = async (note: string) => {
      const version = value(
        await agency.rpc("create_design_version", { p_deliverable_id: deliverable.id, p_notes: "" }),
      );
      value(
        await agency.rpc("add_design", {
          p_version_id: version,
          p_title: "Direction A",
          p_content: { headline: "One client, two people.", background: "#f6f6f4", foreground: "#242424" },
        }),
      );
      return value(
        await agency.rpc("publish_version", { p_version_id: version, p_release_note: note, p_assets: {} }),
      );
    };
    const reviewNotices = async (userId: string) =>
      value(
        await localAdmin
          .from("notifications")
          .select("id")
          .eq("user_id", userId)
          .eq("project_id", fixture.projectId)
          .eq("title", "New designs ready for review"),
      ).length;

    // New designs reach the person who asked for them, not their teammate.
    await publish("First round for the client team check.");
    expect(await reviewNotices(requesterId)).toBe(1);
    expect(await reviewNotices(teammate.id)).toBe(0);

    // The teammate signs in as themselves, is greeted by name, sees the team and opts in.
    await signIn(teammatePage, teammate.email);
    await expect(teammatePage.getByRole("heading", { level: 1 })).toHaveText(
      `Welcome back, ${teammate.name.split(" ")[0]}`,
    );
    await teammatePage.goto("/settings/account");
    const teammateTeam = teammatePage.getByRole("region", { name: `${sabre.name} team`, exact: true });
    await expect(teammateTeam.getByText(requesterName, { exact: true })).toBeVisible();
    await expect(teammateTeam.getByText(teammate.name, { exact: true })).toBeVisible();
    await expect(teammateTeam.getByText("You", { exact: true })).toBeVisible();
    const designers = value(await localAdmin.from("profiles").select("display_name").eq("role", "designer"));
    for (const designer of designers) await expect(teammateTeam).not.toContainText(designer.display_name);
    const everything = teammateTeam.getByRole("button", {
      name: `All ${sabre.name} activity`,
      exact: true,
    });
    await everything.click();
    await expect(everything).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(
        async () =>
          value(
            await localAdmin
              .from("client_memberships")
              .select("notify_all")
              .eq("client_id", sabre.id)
              .eq("user_id", teammate.id)
              .single(),
          ).notify_all,
      )
      .toBe(true);
    expect((await new AxeBuilder({ page: teammatePage }).analyze()).violations).toEqual([]);
    await teammatePage.setViewportSize({ width: 390, height: 844 });
    await expect(teammateTeam.getByText(teammate.name, { exact: true })).toBeVisible();
    expect(await fitsWidth(teammatePage)).toBe(true);

    // With all activity on, the next round reaches the teammate as well.
    const second = await publish("Second round for the client team check.");
    expect(await reviewNotices(teammate.id)).toBe(1);
    expect(await reviewNotices(requesterId)).toBe(2);

    // The requester sees the teammate too and approves; the review names who decided.
    await signIn(requesterPage, credentials.client);
    await requesterPage.goto("/settings/account");
    await expect(
      requesterPage
        .getByRole("region", { name: `${sabre.name} team`, exact: true })
        .getByText(teammate.name, { exact: true }),
    ).toBeVisible();
    expect(
      (
        await requesterCaller.rpc("review_publication", {
          p_publication_id: second,
          p_decision: "approved",
          p_feedback: "",
        })
      ).error,
    ).toBeNull();
    await signIn(studioPage, credentials.agency);
    await studioPage.goto(`/clients/${sabre.id}/reviews`);
    await studioPage.getByRole("button", { name: "Approved", exact: true }).click();
    await expect(
      studioPage.locator(".review-card", { hasText: projectTitle }).locator(".review-row-note"),
    ).toContainText(`Approved by ${requesterName} ·`);

    // The studio files a briefing on behalf of the teammate: with two people it must choose.
    await studioPage.goto(`/clients/${sabre.id}/briefings/new`);
    await studioPage.getByRole("button", { name: /Digital Ad \(Static\)/ }).click();
    await studioPage.getByRole("button", { name: "Continue to details", exact: true }).click();
    await studioPage.getByRole("textbox", { name: "Project title", exact: true }).fill(onBehalfTitle);
    await studioPage.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(studioPage.locator(".briefing-validation")).toContainText(
      "Choose who requested this briefing.",
    );
    await studioPage
      .getByRole("combobox", { name: "Requested by", exact: true })
      .selectOption({ label: teammate.name });
    await studioPage.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            await localAdmin
              .from("briefings")
              .select("requested_by")
              .eq("client_id", sabre.id)
              .eq("title", onBehalfTitle)
              .maybeSingle()
          ).data?.requested_by,
      )
      .toBe(teammate.id);
    const filed = value(
      await localAdmin
        .from("briefings")
        .select("id")
        .eq("client_id", sabre.id)
        .eq("title", onBehalfTitle)
        .single(),
    );
    await studioPage.goto(`/clients/${sabre.id}/briefings/${filed.id}`);
    await expect(studioPage.getByText(`Requested by ${teammate.name}`, { exact: true })).toBeVisible();

    // The studio removes the teammate from SABRE: their login stops working and they read as left.
    await studioPage.goto("/settings/clients");
    await studioPage.getByRole("button", { name: `${sabre.name} people`, exact: true }).click();
    const people = studioPage.getByRole("dialog", { name: `${sabre.name} people`, exact: true });
    await expect(people.getByText(teammate.email, { exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page: studioPage }).analyze()).violations).toEqual([]);
    await studioPage.setViewportSize({ width: 390, height: 844 });
    expect(await fitsWidth(studioPage)).toBe(true);
    await studioPage.setViewportSize({ width: 1600, height: 1000 });
    await people.getByRole("button", { name: `Remove ${teammate.name}`, exact: true }).click();
    const confirm = studioPage.getByRole("dialog", { name: `Remove ${teammate.name}?`, exact: true });
    await expect(confirm).toContainText(`${teammate.name} loses access to ${sabre.name}.`);
    await confirm.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(confirm).not.toBeVisible();
    await expect(people.getByText(teammate.email, { exact: true })).toHaveCount(0);
    await expect
      .poll(
        async () =>
          value(
            await localAdmin
              .from("profiles")
              .select("removal_completed_at")
              .eq("id", teammate.id)
              .single(),
          ).removal_completed_at,
      )
      .not.toBeNull();
    await expect(localCaller(teammate.email)).rejects.toThrow(
      "Local acceptance authentication failed",
    );
    await studioPage.goto(`/clients/${sabre.id}/briefings/${filed.id}`);
    await expect(
      studioPage.getByText(`Requested by ${teammate.name} (left)`, { exact: true }),
    ).toBeVisible();
    await requesterPage.goto(`/clients/${sabre.id}/briefings/${filed.id}`);
    await expect(
      requesterPage.getByText("Requested by Former member", { exact: true }),
    ).toBeVisible();
  } finally {
    const filed = await localAdmin
      .from("briefings")
      .delete()
      .eq("client_id", sabre.id)
      .eq("title", onBehalfTitle);
    if (filed.error) throw filed.error;
    if (projectId) await cleanupTestProject(projectId);
    for (const context of contexts) await context.close();
  }
});
```

- [ ] **Step 3: Record the counts the test must leave unchanged**

Run (repository root, read-only):
`docker exec supabase_db_dawes-studios psql -U postgres -Atc "select (select count(*) from auth.users), (select count(*) from public.clients), (select count(*) from public.projects), (select count(*) from public.briefings where client_id=md5('dawes:client-org-8')::uuid), (select count(*) from public.client_memberships where client_id=md5('dawes:client-org-8')::uuid)"`
Keep the five numbers.

- [ ] **Step 4: Run it**

Run: `npx playwright test tests/e2e/client-team.spec.ts --output=../outputs/pw-client-team`
Expected: 1 passed. A failure means the product disagrees with the spec: fix the product code in its
owning task's files (never the expectation) and report it.

- [ ] **Step 5: Confirm the test cleaned up after itself**

Run the Step 3 query again. Expected: the same five numbers (the temporary person, their
membership, the fixture project and the on-behalf draft are all gone).

- [ ] **Step 6: Run the surrounding suites**

Run: `npx playwright test tests/e2e/team-management.spec.ts tests/e2e/briefing-modal.spec.ts tests/e2e/production-workflow.spec.ts tests/e2e/overview.spec.ts tests/e2e/console-errors.spec.ts --output=../outputs/pw-client-team-suites`
Expected: all pass.

- [ ] **Step 7: Run the gate, write the report and commit**

Run: `npx prettier --write tests/e2e/client-team.spec.ts tests/e2e/project-fixture.ts`, then
`npm run check` — Expected: PASS.
Write `docs/engineering/handoffs/2026-09-25-client-team-task-9.md` from the template.

```bash
git add apps/web/tests/e2e/client-team.spec.ts apps/web/tests/e2e/project-fixture.ts docs/engineering/handoffs/2026-09-25-client-team-task-9.md
git commit -m "test(team): check two people at one client in a browser"
```

---

### Task 10: Documentation

**Files:**
- Modify: `apps/web/features/team/README.md`, `apps/web/features/settings/README.md`,
  `apps/web/features/briefings/README.md`, `apps/web/features/reviews/README.md`,
  `apps/web/features/workspace/README.md`, `apps/web/features/projects/README.md`
- Modify: `docs/architecture/backend.md`, `docs/architecture/permissions.md`,
  `docs/architecture/data-access.md`, `docs/architecture/sitemap.md`,
  `docs/architecture/design-system.md`, `docs/architecture/acceptance-matrix.md`
- Create: `docs/engineering/handoffs/2026-09-25-client-team-task-10.md`

**Interfaces:**
- Consumes: the names, routes and wording of Tasks 1–9 exactly as committed. Before writing, check
  each claim against the code (`grep -rn "clientPeopleQueryKeys\|remove_client_member\|client_team" apps/web supabase/migrations`).

- [ ] **Step 1: Team README**

In `apps/web/features/team/README.md`, add this section directly above `## Styling boundary`:

```md
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
```

Add these rows to the table under `## Data access`, after the `removeTeamMember()` row, keeping the
table's column alignment (`npx prettier --write` realigns it):

```md
| `useClientPeople(clientId)` | `rpc("client_team", { p_client_id })`; for the studio also `profiles` `.select("id,display_name").eq("role", "client")` | Studio and client people only. The second read names people who have left. |
| `usePendingClientRemovals(clientId)` | `client_memberships` `.select("user_id").eq("client_id", …)`, then `profiles` `.select("id,display_name").in("id", …).not("removed_at", "is", null).is("removal_completed_at", null).order("display_name")` | Studio only. |
| `useClientNotificationChoices()` | `client_memberships` `.select("client_id,notify_all").eq("user_id", …)` | Client people only; the membership policy already admits a person's own rows. |
| `setClientNotifications()` | `rpc("set_client_notifications", { p_client_id, p_all })` | |
| `removeClientMember()` | `POST /api/clients/{clientId}/members/{profileId}/remove`, bearer token | Like `removeTeamMember`: blocking sign-in needs the service-role key. |
```

and after the paragraph beginning "`teamQueryKeys = ["studio-team", "invitations"]`" add:

```md
`clientPeopleQueryKeys` is a named-key record, because its writers dirty different subsets: a
removal refreshes `client-people` (the team and the pending-removal list), a person's notification
choice only `client-notification-choices`.
```

Under `## Styling boundary`, append to its first paragraph: "`.client-people` (the People dialog)
is team-only too; a long email wraps through the shared `.settings-list-row p` rule in
`app/globals.css`."

- [ ] **Step 2: Settings, briefings, reviews, workspace and projects READMEs**

`apps/web/features/settings/README.md`: in the `client-settings.tsx` bullet replace "opens scoped
invitation and campaign forms" with "opens the client's **People** dialog
(`features/team/client-people-dialog.tsx`: people, pending invitations, invite and remove) and
campaign forms"; at the end of the bullet that begins "`settings-page.tsx` provides the shared
navigation" add "For a client person, Your account also shows one Team section per client
(`client-team-section.tsx`, styled by `.client-team` and `.client-team-notifications` in
`settings.css`, reading its people and notification choice from `features/team/team-data.ts`)."

`apps/web/features/briefings/README.md`: add `useBriefingRequester` to the hooks and
`setBriefingRequester` to the writes named in the `briefing-data.ts` bullet; in the
`briefings-page.tsx` bullet replace "title, campaign, service and deliverable count, status and due
date" with "title, campaign, requester, service and deliverable count, status and due date" and
"below 1000 px the service and date columns drop" with "below 1000 px the requester, service and date
columns drop"; then add above `## Deviations from the data-access contract`:

```md
## Requested by

Every briefing records who asked for it in `requested_by`. A client person's first save names them
and later saves by anyone at the client keep it; a client person cannot name someone else. When the
studio files a briefing, Details asks **Requested by** among the client's active people
(`useClientPeople`), opening on the briefing's own requester while they are still at the client, or
on the client's only person (`initialRequester`). With two or more people the choice is required
(`requesterErrors`), and `save_briefing` applies the same rule whatever the interface sends; with
exactly one it records that person, and with nobody the briefing keeps no requester until the first
client person saves it. The list, the briefing page and the project's details read "Requested by
<name>"; someone who has left reads "<name> (left)" to the studio and "Former member" to the client
(`personName` in `features/team/client-people.ts`). The studio changes the requester from the
briefing page (`setBriefingRequester` → `set_briefing_requester`, which does not touch `updated_at`,
so a client's open draft never sees a conflict). Designers read neither.
```

`apps/web/features/reviews/README.md`: replace "same tables, same column selections, same filters
and ordering, same `refetchInterval`" with "same tables, filters, ordering and `refetchInterval`; its
embedded review now also selects `reviewed_by,reviewed_at`", then append:

```md
A decided version names who decided. The row's note column reads "Approved by <name> · <date>" or
"Changes requested by <name> · <date>" (the release note moves to its tooltip), from
`publication_reviews.reviewed_by`/`reviewed_at`, which `review_publication` records. Names come from
`useClientPeople`; a reviewer who left reads "<name> (left)" to the studio and "Former member" to
the client. Reviews decided before reviewers were recorded keep their note.
```

`apps/web/features/workspace/README.md`: append to `## Notification surfaces`:

```md
Who receives a client notification is decided in `private.notify_client`
(`supabase/migrations/202609250003_client_notification_routing.sql`): a project update reaches the
project's requester (its briefing's `requested_by`), everyone who chose **All <client> activity**
and, for a studio reply in the client conversation, the client people who wrote there. With no
requester left, or with no project (credit updates), it reaches every person at the client. The
actor and removed people never receive one.
```

`apps/web/features/projects/README.md`: after the sentence "Details retain real edit, assignment and
resource actions." (it wraps across lines 29–30) add "For the studio and the client, Details also
shows **Requested by** (the briefing's
requester, read by `useBriefingRequester`) and its version history names who decided ("Approved by
<name> · <date>"); designers see neither."

- [ ] **Step 3: Architecture documents**

`docs/architecture/backend.md`, in the Mutation RPC contract table: append `, p_requested_by=null`
(one of the client's active people, chosen by the studio; ignored for a client person, who is
always the requester of what they file; with exactly one person the studio's missing choice means
that person) to the `save_briefing` arguments; append "; records the deciding person in
`reviewed_by`" to `review_publication`; and add after `review_publication`:

```md
| `set_briefing_requester` (void) | `p_briefing_id`, `p_requested_by`; studio only; one of the briefing's client's active people; any status |
| `client_team` (rows of `user_id`, `display_name`, `email`) | `p_client_id`; the client's active client-role people, returned to the studio and that client's own people only |
| `set_client_notifications` (void) | `p_client_id`, `p_all`; the caller's own choice at one of their clients |
| `remove_client_member` (boolean) | `p_client_id`, `p_profile_id`; studio only; `true` when the account was deactivated and `/api/clients/{clientId}/members/{profileId}/remove` must block sign-in |
```

`docs/architecture/permissions.md`: add after `## Team removal` and its two paragraphs:

```md
## Client people

A client can have several people, each with their own login; permissions inside a client are the
same for everyone. Only the studio adds (by invitation) and removes them. `client_team(p_client_id)`
is the one widened read: the client's active client-role people with their sign-in emails, returned
to the studio and that client's own people and to nobody else. Profile and membership policies do
not widen, designers are never part of a team, and another client's people are never returned.
Briefings (`requested_by`) and review decisions (`reviewed_by`) store a person's id; a client names
them only through `client_team` and reads someone who left as "Former member", and designers read
neither column.

Removing someone from one client (`remove_client_member`, audited) deletes that membership and that
client's notifications for them; a person who still belongs to another client keeps their login.
Removing their last client sets `removed_at` like a team removal, so every role-based read ends at
once, existing tokens included, and `/api/clients/{clientId}/members/{profileId}/remove` then blocks
sign-in and sets `removal_completed_at`. Project notifications reach the project's requester, people
who chose all activity and, for a studio reply, the people who wrote in that conversation; the
actor and removed people never receive them.
```

`docs/architecture/data-access.md`, rule 5: after "`brandQueryKeys` (`brand-data.ts`) and
`briefingQueryKeys` (`briefing-data.ts`) are the worked examples." add "`clientPeopleQueryKeys`
(`team/team-data.ts`) is a third: removing someone dirties `people`, a person's notification choice
only `notifications`."

`docs/architecture/sitemap.md`: set the `/settings/clients` purpose to "Client list, new client
creation, and each client's **People** (people and emails, pending invitations, invite and remove)."
and the `/settings/account` purpose to "Display name and real Auth password changes; a client person
also sees one **Team** section per client (teammates, notification choice)."; in `## Credits and
administration` add "Removing a client's person goes through
`POST /api/clients/:clientId/members/:profileId/remove`, which also blocks sign-in when it was their
last client."

`docs/architecture/design-system.md`: add after the `### Welcome dashboards` section (before
`## Board and project canvas`):

```md
### Client people and attribution

Settings → Clients gives each client row a **People** button in place of Invite. Its `lg` dialog
stacks **People** (one `settings-list-row` per person: name, email, a quiet **Remove**), **Invited**
(email and "Invitation expires <date>", read-only) and a primary **Invite person** that opens the
existing invite dialog above it. Remove confirms in a second dialog — "Remove <name>?", "<name>
loses access to <client>." and, for the last person, "<client> will have nobody who can sign in
until someone is invited." A removal still blocking sign-in reads "Access removed · Account block
pending" with **Finish removal**.

Your account shows a client person one `settings-section` per client, "<client> team": the people
as rows (the viewer marked with a "You" badge), "To add or remove someone, contact the studio." and a
**Notifications** segmented control — **My requests** / **All <client> activity** — that wraps on a
phone. Emails wrap anywhere (the shared `.settings-list-row p` rule).

Attribution reads the same everywhere: "Requested by <name>" on the Briefings list (its own column,
dropped below 1000 px), under the briefing's title (with the studio's small quiet **Change**) and in
the project's details; "Approved by <name> · <date>" or "Changes requested by <name> · <date>" in
the Reviews note column and the project's version history. Someone who left reads "<name> (left)" to
the studio and "Former member" to the client; designers see neither.
```

`docs/architecture/acceptance-matrix.md`: add after the family C table (directly above
`## D. Shell, navigation, search, and board`):

```md
Product amendment (2026-09-25): the user asked for several people in one client. Each client person
has their own login; the studio manages them from Settings → Clients → People, and a client person
sees their own team on Your account. `client_team` returns a client's active client-role people to
the studio and that client's own people only, so C02 (no cross-client reads) and C03 (no designer
identity) keep holding: designers are never part of a team, and a client names a requester or
reviewer only through it. Briefings name their requester, review decisions their reviewer, and
project notifications reach the requester and anyone who chose all activity. Evidence:
`supabase/tests/database/client_team.test.sql` and `apps/web/tests/e2e/client-team.spec.ts`.
```

- [ ] **Step 4: Check and commit**

Run: `npx prettier --write features/team/README.md features/settings/README.md features/briefings/README.md features/reviews/README.md features/workspace/README.md features/projects/README.md`, then `npm run check` — Expected: PASS.
Check every path and name the new text cites exists:
`for p in apps/web/features/team/client-people-dialog.tsx apps/web/features/settings/client-team-section.tsx apps/web/features/team/client-people.ts "apps/web/app/api/clients/[clientId]/members/[profileId]/remove/route.ts" supabase/migrations/202609250003_client_notification_routing.sql supabase/tests/database/client_team.test.sql apps/web/tests/e2e/client-team.spec.ts; do test -e "$p" || echo "missing $p"; done` (repository root) — Expected: no output.
Write `docs/engineering/handoffs/2026-09-25-client-team-task-10.md` from the template.

```bash
git add apps/web/features/team/README.md apps/web/features/settings/README.md apps/web/features/briefings/README.md apps/web/features/reviews/README.md apps/web/features/workspace/README.md apps/web/features/projects/README.md docs/architecture/backend.md docs/architecture/permissions.md docs/architecture/data-access.md docs/architecture/sitemap.md docs/architecture/design-system.md docs/architecture/acceptance-matrix.md docs/engineering/handoffs/2026-09-25-client-team-task-10.md
git commit -m "docs(team): document client people, requesters and reviewers"
```

---

### Task 11: Visual audit, verification record and handoff (orchestrator)

- [ ] **Step 1: Capture.** With a throwaway Playwright script (password read from
  `supabase/.env.local`, never printed) and a temporary second SABRE person created and deleted
  exactly as `client-team.spec.ts` does, capture light and dark at 1440×900 and 390×844 into
  `outputs/client-team/`: Settings → Clients → People and its Remove confirmation (studio), Your
  account with the Team section (client), the Details step with Requested by (studio), the Briefings
  list and a briefing page (studio and client), a project's details, and Reviews (studio and client).
- [ ] **Step 2: Audit.** Alignment, spacing, contrast, long names and emails, the segmented control
  wrapping, both themes, the list columns at 1000/700 px, and that no designer name reaches a client
  page. Fix defects in their own commits, in the owning task's files.
- [ ] **Step 3: Verify.** `npm run check`; `supabase test db` (only the six known
  `access_and_workflows.test.sql` failures); Playwright `client-team team-management briefing-modal
  intake-admin production-workflow project-feedback overview client-navigation client-pages-layout
  console-errors notifications-popover theme` with a private `--output`; the five counts of Task 9
  Step 3 unchanged afterwards.
- [ ] **Step 4: Record.** `docs/verification/client-team-2026-09-25.md` with the checks and a few
  cited final images under `docs/verification/screenshots/client-team/`; link it from the family C
  amendment in `docs/architecture/acceptance-matrix.md`; update `docs/engineering/handoff.md` (100
  lines or fewer).
- [ ] **Step 5: Commit.** `docs(team): record the client team verification and update the handoff`.

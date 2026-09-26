# Miro Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a project's production loop in Miro. The agency registers named design boards, one
designer each. Designers send rounds. The agency shares project-level client versions, each with
its own client-board link. Clients approve or request changes and leave feedback. Nobody needs the
Versions canvas.

**Architecture:** Extend the existing version tables instead of adding a parallel system. Rounds
are `design_versions` rows with a `board_id` and no deliverable. Client versions are
`published_versions` rows with no deliverable. Reviews, comments, notifications and realtime are
reused. A new `design_boards` table and five RPCs carry the new rules. RLS closes the
designer-to-designer gap on `internal_comments`. On the web, a new `ProjectWorkspace` component
replaces the project body whenever the viewer's channel uses the workspace. It reuses the tool
bar, panels, comment panel, action dialog shell, Miro embed and review bar.

**Tech Stack:** Supabase Postgres (plpgsql, RLS, pgTAP via `supabase test db`), Next.js App Router,
React 19, TanStack Query, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-26-miro-workspace-design.md`

## Global Constraints

- English for all code, copy, comments, tests and docs. Chat to the user is in pt-BR.
- Supabase queries live only in `apps/web/features/projects/project-data.ts` (reads are
  `use<Thing>()` hooks; writes are `async (database, input)` functions). Validation, trimming,
  idempotency keys and retry state stay in the component. See `docs/architecture/data-access.md`.
- Feature styles go in `apps/web/features/projects/projects.css`. Nothing moves to `globals.css`.
- Every RPC is `security definer set search_path=''`. It parses Miro URLs in the database through
  `private.parse_miro_board_url`. Execute is revoked from `public, anon` and granted to
  `authenticated`.
- Never reset the local database. The SABRE overlay (10 clients, 68 projects, 50 SABRE) must
  survive. Apply migrations with `supabase migration up --local`, run from the repo root.
- Canonical seed counts stay 10 clients / 25 projects. No seed data is added.
- A designer never sees another designer (name, id, assignment, board, round or comment). A client
  never sees internal data.
- Each task ends with a passing gate and a Conventional Commit of that task's files only. Stage
  explicit paths. Never push. The commit trailer is
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- The gate is: `cd apps/web && npm run check`. For SQL tasks, also run `supabase test db` from the
  repo root.

## Spec corrections this plan makes (tell the user in the final report)

1. `review_publication` is **not** unchanged. It compares versions by `deliverable_id = …`, which
   never matches a null deliverable. Task 2 rewrites the comparison with `is not distinct from`
   and scopes it by project. A project-level review sets the project status directly.
2. There are **two** migrations, not one: `…0006` (boards, rounds, privacy) and `…0007` (sharing
   and review), so each task commits an applied migration.
3. Which view a channel shows is decided **per channel**. Working files uses the workspace when the
   project has a board or no per-deliverable version. Shared with client uses it when the project
   has a project-level client version or no per-deliverable publication. Otherwise that channel
   keeps today's Versions / Miro mode unchanged. This keeps existing projects (including the SABRE
   overlay and the `miro-version-links` e2e) working for clients and designers.
4. Direct client versions record their publisher and request key in a new private table,
   `private.miro_share_requests`, not only in the audit log. This is how their retries stay
   idempotent.

## Review Focus

1. A second designer on the same project, calling the API directly with a known round,
   comment or board id, must get nothing and must not be able to write. Task 1 pins this with RLS
   and trigger tests that use real ids.
2. The client reviewing an older project-level version after a newer one exists must be refused
   ("Review the latest published version"). Task 2 pins it.
3. A retried "Send to studio" or "Share" (double click, network retry) must not create two rounds
   or two versions. Tasks 1 and 2 pin this with same-key calls. Task 5 pins it with the dialog
   reusing its key.
4. A board whose designer was unassigned must disappear for that designer, and the agency must
   still be able to reassign it. Task 1 pins this.
5. A delivered project must refuse new rounds and new client versions with a readable message.
   Tasks 1 and 2 pin this.

---

## File structure

| Path | Responsibility |
|---|---|
| `supabase/migrations/202609260006_miro_workspace_boards.sql` (create) | `design_boards`, round columns on `design_versions`, privacy helpers, policies, trigger, `create_design_board`, `update_design_board`, `send_board_round`, realtime |
| `supabase/migrations/202609260007_miro_workspace_sharing.sql` (create) | nullable `published_versions.deliverable_id`, `private.miro_share_requests`, `share_miro_version`, `review_publication` rewrite |
| `supabase/tests/database/miro_workspace.test.sql` (create) | pgTAP for both migrations, self-contained fixture |
| `supabase/database.types.ts` (regenerate) | `npm run db:types` |
| `apps/web/features/projects/project-data.ts` (modify) | `CanvasVersion.deliverableId: string \| null`, `boardId`, `DesignBoard`, `useDesignBoards`, four writes |
| `apps/web/features/shared/version-row.ts` (modify) | `versionGroupKey`, `versionGroupFallback` |
| `apps/web/features/reviews/review-data.ts`, `apps/web/features/overview/overview-model.ts`, `apps/web/features/overview/overview-data.ts`, `apps/web/features/playground/playground-albums.ts`, `apps/web/features/projects/*` (modify) | null-deliverable fallout |
| `apps/web/features/projects/miro-workspace.ts` (create) | pure rules: channel mode, rounds, shared versions, picks, review eligibility, prefill |
| `apps/web/features/projects/project-action-board.tsx`, `project-action-round.tsx`, `project-action-share.tsx` (create) | the three dialogs |
| `apps/web/features/projects/project-action-dialog.tsx` (modify) | dispatch the new kinds, `projectActionKey` |
| `apps/web/features/projects/miro-workspace-bar.tsx` (create) | the workspace header bar and empty state |
| `apps/web/features/projects/miro-view.tsx` (modify) | extract `MiroEmbed` |
| `apps/web/features/projects/project-tool-bar.tsx` (modify) | optional Feedback button |
| `apps/web/features/projects/project-panel.tsx` (modify) | add `"feedback"` to `ProjectPanelKind` |
| `apps/web/features/projects/project-workspace.tsx` (create) | the workspace page body: bar, embed, review bar, panels, dialogs |
| `apps/web/features/projects/project-page.tsx` (modify) | choose workspace vs legacy per channel |
| `apps/web/features/projects/project-events.ts` (modify) | listen to `design_boards` |
| `apps/web/tests/e2e/project-fixture.ts` (modify) | clean up boards and share requests |
| `apps/web/tests/e2e/miro-workspace.spec.ts` (create) | round trip and privacy |
| docs (modify) | `apps/web/features/projects/README.md`, `docs/architecture/backend.md`, `docs/architecture/data-access.md` if it lists RPCs, `docs/engineering/handoff.md` |

---

### Task 1: Boards, rounds and designer privacy in the database

**Files:**
- Create: `supabase/migrations/202609260006_miro_workspace_boards.sql`
- Create: `supabase/tests/database/miro_workspace.test.sql`
- Regenerate: `supabase/database.types.ts`

**Interfaces:**
- Produces (SQL): `public.design_boards`; `design_versions.board_id uuid null`,
  `design_versions.request_key uuid null`, and `design_versions.deliverable_id` nullable;
  `private.can_see_board(uuid)`, `private.can_see_version(uuid)`,
  `private.is_agency_profile(uuid)`, `private.can_read_internal_comment(uuid, uuid)`;
  `public.create_design_board(p_project_id uuid, p_name text, p_url text, p_designer_id uuid) returns uuid`;
  `public.update_design_board(p_board_id uuid, p_name text, p_url text, p_designer_id uuid) returns void`;
  `public.send_board_round(p_board_id uuid, p_note text default '', p_frame_url text default null, p_idempotency_key uuid default null) returns uuid`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/database/miro_workspace.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- Self-contained fixture: an agency member, a client member, two designers on one project, and a
-- third designer who is not assigned. Nothing depends on the seed or the SABRE overlay.
create temporary table mw(key text primary key, value uuid);
grant all on mw to authenticated, service_role;
insert into mw values
  ('agency',md5('mw:agency')::uuid),('client',md5('mw:client')::uuid),
  ('designer-a',md5('mw:designer-a')::uuid),('designer-b',md5('mw:designer-b')::uuid),
  ('outsider',md5('mw:outsider')::uuid),('client-org',md5('mw:client-org')::uuid),
  ('project',md5('mw:project')::uuid),('delivered',md5('mw:delivered')::uuid);
create function pg_temp.k(p text) returns uuid language sql as $$ select value from mw where key=p $$;
create function pg_temp.act_as(p text) returns text language sql as $$
  select set_config('request.jwt.claim.sub',pg_temp.k(p)::text,true) $$;
create function pg_temp.remember(p text, v uuid) returns uuid language sql as $$
  insert into mw values(p,v) on conflict(key) do update set value=excluded.value returning value $$;

insert into auth.users(id,email,raw_user_meta_data) values
  (pg_temp.k('agency'),'mw-agency@fixture.local','{"display_name":"MW Agency"}'),
  (pg_temp.k('client'),'mw-client@fixture.local','{"display_name":"MW Client"}'),
  (pg_temp.k('designer-a'),'mw-a@fixture.local','{"display_name":"Designer Alpha"}'),
  (pg_temp.k('designer-b'),'mw-b@fixture.local','{"display_name":"Designer Beta"}'),
  (pg_temp.k('outsider'),'mw-o@fixture.local','{"display_name":"Designer Outside"}');
update public.profiles set role='agency' where id=pg_temp.k('agency');
update public.profiles set role='designer' where id in (pg_temp.k('designer-a'),pg_temp.k('designer-b'),pg_temp.k('outsider'));
insert into public.clients(id,name,slug) values (pg_temp.k('client-org'),'MW Client','mw-client');
insert into public.client_memberships(client_id,user_id) values (pg_temp.k('client-org'),pg_temp.k('client'));
insert into public.projects(id,client_id,title,service_type,status) values
  (pg_temp.k('project'),pg_temp.k('client-org'),'MW project','ai','in_progress'),
  (pg_temp.k('delivered'),pg_temp.k('client-org'),'MW delivered','ai','delivered');
insert into public.project_assignments(project_id,designer_id) values
  (pg_temp.k('project'),pg_temp.k('designer-a')),(pg_temp.k('project'),pg_temp.k('designer-b')),
  (pg_temp.k('delivered'),pg_temp.k('designer-a'));

select has_table('public','design_boards','Design boards have their own table');

-- Boards: the agency only, the designer must be assigned, names are unique per project.
select pg_temp.act_as('designer-a');
set local role authenticated;
select throws_ok($$select public.create_design_board(pg_temp.k('project'),'Alpha','https://miro.com/app/board/uXjVAlpha01=/',pg_temp.k('designer-a'))$$,
  '42501',null,'A designer cannot create a board');
reset role;
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select pg_temp.remember('board-a',public.create_design_board(pg_temp.k('project'),' Alpha board ','https://miro.com/app/board/uXjVAlpha01=/?moveToWidget=11',pg_temp.k('designer-a')))$$,
  'The agency creates a board for an assigned designer');
select lives_ok($$select pg_temp.remember('board-b',public.create_design_board(pg_temp.k('project'),'Beta board','https://miro.com/app/board/uXjVBeta001=/',pg_temp.k('designer-b')))$$,
  'The agency creates a second board for another designer');
select lives_ok($$select pg_temp.remember('board-delivered',public.create_design_board(pg_temp.k('delivered'),'Late board','https://miro.com/app/board/uXjVLate001=/',pg_temp.k('designer-a')))$$,
  'A delivered project can still hold a board');
select is((select name from public.design_boards where id=pg_temp.k('board-a')),'Alpha board','The name is trimmed');
select is((select widget_id from public.design_boards where id=pg_temp.k('board-a')),'11','The frame is kept');
select throws_ok($$select public.create_design_board(pg_temp.k('project'),'alpha BOARD','https://miro.com/app/board/uXjVAlpha01=/',pg_temp.k('designer-a'))$$,
  '23505',null,'Board names are unique per project, ignoring case');
select throws_ok($$select public.create_design_board(pg_temp.k('project'),'Outside','https://miro.com/app/board/uXjVOut0001=/',pg_temp.k('outsider'))$$,
  '22023',null,'The designer must be assigned to the project');
select throws_ok($$select public.create_design_board(pg_temp.k('project'),'   ','https://miro.com/app/board/uXjVOut0001=/',pg_temp.k('designer-a'))$$,
  '22023',null,'A board needs a name');
select throws_ok($$select public.create_design_board(pg_temp.k('project'),'Bad link','https://evil.example/app/board/uXjVOut0001=/',pg_temp.k('designer-a'))$$,
  '22023',null,'An invalid link is refused');
select is((select count(*)::int from public.design_boards where project_id=pg_temp.k('project')),2,'Refused boards wrote nothing');
reset role;

-- Board visibility: the agency sees all; each designer only their own; the client none.
select pg_temp.act_as('designer-a');
set local role authenticated;
select is((select array_agg(name order by name) from public.design_boards),array['Alpha board','Late board'],'Designer A sees only their boards');
reset role;
select pg_temp.act_as('designer-b');
set local role authenticated;
select is((select array_agg(name) from public.design_boards),array['Beta board'],'Designer B sees only their board');
reset role;
select pg_temp.act_as('client');
set local role authenticated;
select is((select count(*)::int from public.design_boards),0,'The client sees no board');
reset role;

-- Rounds: only the board's designer or the agency; numbered per board; idempotent; delivered refused.
select pg_temp.act_as('designer-b');
set local role authenticated;
select throws_ok($$select public.send_board_round(pg_temp.k('board-a'),'Not mine')$$,'42501',null,'Another designer cannot send from a board');
reset role;
select pg_temp.act_as('designer-a');
set local role authenticated;
select lives_ok($$select pg_temp.remember('round-a1',public.send_board_round(pg_temp.k('board-a'),' First pass ',null,md5('mw:key-a1')::uuid))$$,'The board''s designer sends a round');
select is(public.send_board_round(pg_temp.k('board-a'),' First pass ',null,md5('mw:key-a1')::uuid),pg_temp.k('round-a1'),'A retry with the same key returns the same round');
select lives_ok($$select pg_temp.remember('round-a2',public.send_board_round(pg_temp.k('board-a'),'',
  'https://miro.com/app/board/uXjVAlpha01=/?moveToWidget=22'))$$,'A second round with its own frame');
select throws_ok($$select public.send_board_round(pg_temp.k('board-a'),'x','https://evil.example/app/board/uXjVAlpha01=/')$$,
  '22023',null,'A round with an invalid frame link is refused');
select throws_ok($$select public.send_board_round(pg_temp.k('board-delivered'),'late')$$,'P0001','Delivered projects cannot receive new rounds','A delivered project refuses rounds');
reset role;
select is((select array_agg(version_number order by version_number) from public.design_versions where board_id=pg_temp.k('board-a')),array[1,2],'Rounds are numbered per board, once each');
select is((select notes from public.design_versions where id=pg_temp.k('round-a1')),'First pass','The note is trimmed');
select is((select status from public.design_versions where id=pg_temp.k('round-a1')),'submitted','A round is submitted');
select is((select deliverable_id from public.design_versions where id=pg_temp.k('round-a1')),null,'A round has no deliverable');
select is((select widget_id from public.design_version_miro_links where version_id=pg_temp.k('round-a1')),'11','A round without a frame link uses the board''s link');
select is((select widget_id from public.design_version_miro_links where version_id=pg_temp.k('round-a2')),'22','A round keeps its own frame');
select is((select status::text from public.projects where id=pg_temp.k('project')),'internal_review','Sending a round moves the project to internal review');
select ok(exists(select 1 from public.notifications n join public.profiles p on p.id=n.user_id where n.project_id=pg_temp.k('project') and p.id=pg_temp.k('agency') and n.title='Design ready for studio review'),'The agency is notified');
select throws_ok($$insert into public.design_versions(project_id,version_number,created_by) values(pg_temp.k('project'),9,pg_temp.k('agency'))$$,
  '23514',null,'A version needs exactly one of a deliverable or a board');

-- Round and link visibility: only the board's designer and the agency.
select pg_temp.act_as('designer-b');
set local role authenticated;
select is((select count(*)::int from public.design_versions where board_id=pg_temp.k('board-a')),0,'Designer B cannot read Designer A''s rounds');
select is((select count(*)::int from public.design_version_miro_links where version_id=pg_temp.k('round-a1')),0,'Designer B cannot read Designer A''s round links');
select throws_ok($$select public.set_version_miro_link(pg_temp.k('round-a1'),'https://miro.com/app/board/uXjVAlpha01=/')$$,'42501',null,'Designer B cannot relink Designer A''s round');
reset role;
select pg_temp.act_as('designer-a');
set local role authenticated;
select is((select count(*)::int from public.design_versions where board_id=pg_temp.k('board-a')),2,'Designer A reads their rounds');
select lives_ok($$select public.set_version_miro_link(pg_temp.k('round-a1'),'https://miro.com/app/board/uXjVAlpha01=/?moveToWidget=33')$$,'The board''s designer relinks their round');
reset role;

-- Internal comments: a designer never reads or touches another designer's comments.
select pg_temp.act_as('designer-a');
set local role authenticated;
select lives_ok($$select pg_temp.remember('comment-a-round',public.post_comment(pg_temp.k('project'),'internal','On my round',pg_temp.k('round-a1')))$$,'Designer A comments on their round');
select lives_ok($$select pg_temp.remember('comment-a-project',public.post_comment(pg_temp.k('project'),'internal','Project note from A'))$$,'Designer A comments on the project');
reset role;
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select pg_temp.remember('comment-agency',public.post_comment(pg_temp.k('project'),'internal','Studio note'))$$,'The agency comments on the project');
select is((select count(*)::int from public.internal_comments where project_id=pg_temp.k('project')),3,'The agency reads every internal comment');
reset role;
select pg_temp.act_as('designer-b');
set local role authenticated;
select is((select array_agg(body) from public.internal_comments where project_id=pg_temp.k('project')),array['Studio note'],'Designer B reads only studio comments and their own');
select is((select count(*)::int from public.internal_comments where author_id=pg_temp.k('designer-a')),0,'Designer A''s identity never reaches Designer B');
select throws_ok($$select public.post_comment(pg_temp.k('project'),'internal','Sneaky',pg_temp.k('round-a1'))$$,'42501',null,'Designer B cannot comment on Designer A''s round');
select throws_ok($$select public.resolve_comment(pg_temp.k('comment-a-project'),'internal',true)$$,'42501',null,'Designer B cannot resolve Designer A''s comment');
reset role;

-- Updating a board: agency only, reassigning moves visibility, unassignment hides it.
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.update_design_board(pg_temp.k('board-b'),'Beta renamed','https://miro.com/app/board/uXjVBeta002=/',pg_temp.k('designer-b'))$$,'The agency renames and relinks a board');
select is((select board_id from public.design_boards where id=pg_temp.k('board-b')),'uXjVBeta002=','The new link is stored');
reset role;
delete from public.project_assignments where project_id=pg_temp.k('project') and designer_id=pg_temp.k('designer-b');
select pg_temp.act_as('designer-b');
set local role authenticated;
select is((select count(*)::int from public.design_boards),0,'An unassigned designer loses their board');
reset role;
select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok($$select public.update_design_board(pg_temp.k('board-b'),'Beta renamed','https://miro.com/app/board/uXjVBeta002=/',pg_temp.k('designer-b'))$$,'22023',null,'A board cannot keep an unassigned designer');
select lives_ok($$select public.update_design_board(pg_temp.k('board-b'),'Beta renamed','https://miro.com/app/board/uXjVBeta002=/',pg_temp.k('designer-a'))$$,'The agency reassigns the board');
reset role;
select pg_temp.act_as('designer-a');
set local role authenticated;
select is((select count(*)::int from public.design_boards where project_id=pg_temp.k('project')),2,'The reassigned designer now sees it');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run from the repo root: `supabase test db`.
Expected: `miro_workspace.test.sql` fails at `has_table('public','design_boards'…)`. Every other
file still passes.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/202609260006_miro_workspace_boards.sql`:

```sql
-- Miro workspace, part 1: named internal design boards (one designer each), their rounds, and
-- the designer-to-designer privacy rule. A round is a design_versions row with a board and no
-- deliverable. See docs/superpowers/specs/2026-09-26-miro-workspace-design.md.

create table public.design_boards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  name text not null check (length(name) between 1 and 80 and name = btrim(name)),
  designer_id uuid not null references public.profiles,
  board_id text not null check (board_id ~ '^[A-Za-z0-9_=-]{6,64}$'),
  widget_id text check (widget_id ~ '^[0-9]{1,32}$'),
  created_by uuid not null references public.profiles,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id)
);
create unique index design_boards_name on public.design_boards(project_id, lower(name));
create index design_boards_designer on public.design_boards(designer_id);

alter table public.design_versions alter column deliverable_id drop not null;
alter table public.design_versions add column board_id uuid;
alter table public.design_versions add column request_key uuid;
alter table public.design_versions add constraint design_versions_board_fk
  foreign key (board_id, project_id) references public.design_boards(id, project_id);
alter table public.design_versions add constraint design_versions_one_parent
  check ((deliverable_id is null) <> (board_id is null));
create unique index design_versions_board_number on public.design_versions(board_id, version_number)
  where board_id is not null;
create unique index design_versions_request_key on public.design_versions(request_key)
  where request_key is not null;

-- Privacy helpers. Security definer so policies can consult boards and profiles the caller
-- cannot read directly.
create function private.can_see_board(target_board uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(private.is_agency() or exists(
    select 1 from public.design_boards b
    where b.id = target_board and b.designer_id = auth.uid() and private.can_produce(b.project_id)
  ), false)
$$;
-- A version is visible when it is not a round, or when its board is visible. Null (a comment on
-- no version) counts as visible.
create function private.can_see_version(target_version uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select v.board_id is null or private.can_see_board(v.board_id)
    from public.design_versions v where v.id = target_version), true)
$$;
create function private.is_agency_profile(target_profile uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id = target_profile and role = 'agency')
$$;
-- A designer reads an internal comment only when its version is visible and it was written by
-- themselves or by the studio: another designer's comment and identity never reach them.
create function private.can_read_internal_comment(target_version uuid, target_author uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_agency() or (private.can_see_version(target_version)
    and (target_author = auth.uid() or private.is_agency_profile(target_author)))
$$;
revoke all on function private.can_see_board(uuid), private.can_see_version(uuid),
  private.is_agency_profile(uuid), private.can_read_internal_comment(uuid, uuid)
  from public, anon, authenticated;

alter table public.design_boards enable row level security;
create policy design_boards_read on public.design_boards for select to authenticated
  using (private.can_see_board(id));
revoke all on public.design_boards from public, anon, authenticated;
grant select on public.design_boards to authenticated;
grant all on public.design_boards to service_role;

drop policy versions_read on public.design_versions;
create policy versions_read on public.design_versions for select to authenticated
  using (private.can_produce(project_id) and (board_id is null or private.can_see_board(board_id)));

drop policy design_version_miro_links_read on public.design_version_miro_links;
create policy design_version_miro_links_read on public.design_version_miro_links
  for select to authenticated using (private.can_produce(project_id) and private.can_see_version(version_id));

drop policy internal_comments_read on public.internal_comments;
create policy internal_comments_read on public.internal_comments for select to authenticated
  using (private.can_produce(project_id) and private.can_read_internal_comment(version_id, author_id));

-- post_comment and resolve_comment are security definer and check only project access. This
-- trigger adds the privacy rule to every write they (or anything else acting as a person) make.
create function private.guard_internal_comment_privacy() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or private.is_agency() then return new; end if;
  if not private.can_read_internal_comment(new.version_id,
      case when tg_op = 'INSERT' then auth.uid() else old.author_id end) then
    raise exception 'Comment access required' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger internal_comments_privacy before insert or update on public.internal_comments
  for each row execute function private.guard_internal_comment_privacy();

-- Round links: the board's designer may relink their own rounds; everything else stays agency-only.
create or replace function public.set_version_miro_link(p_version_id uuid, p_url text) returns void
language plpgsql security definer set search_path='' as $$
declare v_project uuid; v_board_ref uuid; v_board text; v_widget text;
begin
  select project_id, board_id into v_project, v_board_ref from public.design_versions where id = p_version_id;
  if not found then
    perform private.assert_agency();
    raise exception 'Version not found' using errcode = 'P0002';
  end if;
  if not (private.is_agency() or (v_board_ref is not null and private.can_see_board(v_board_ref))) then
    raise exception 'Agency access required' using errcode = '42501';
  end if;
  select board_id, widget_id into v_board, v_widget from private.parse_miro_board_url(p_url);
  insert into public.design_version_miro_links(version_id, project_id, board_id, widget_id, updated_by)
  values (p_version_id, v_project, v_board, v_widget, auth.uid())
  on conflict (version_id) do update
    set board_id = excluded.board_id, widget_id = excluded.widget_id,
        updated_by = excluded.updated_by, updated_at = now();
  perform private.audit('version.miro_link_set', v_project);
end $$;

create function public.create_design_board(p_project_id uuid, p_name text, p_url text, p_designer_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_name text := btrim(coalesce(p_name, '')); v_board text; v_widget text; result_id uuid;
begin
  perform private.assert_agency();
  if not exists(select 1 from public.projects where id = p_project_id) then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  if length(v_name) not between 1 and 80 then
    raise exception 'Name the board (up to 80 characters)' using errcode = '22023';
  end if;
  if not exists(select 1 from public.project_assignments where project_id = p_project_id and designer_id = p_designer_id) then
    raise exception 'Assign this designer to the project first' using errcode = '22023';
  end if;
  select board_id, widget_id into v_board, v_widget from private.parse_miro_board_url(p_url);
  begin
    insert into public.design_boards(project_id, name, designer_id, board_id, widget_id, created_by)
    values (p_project_id, v_name, p_designer_id, v_board, v_widget, auth.uid()) returning id into result_id;
  exception when unique_violation then
    raise exception 'A board with this name already exists in this project' using errcode = '23505';
  end;
  perform private.audit('design_board.created', result_id, jsonb_build_object('project', p_project_id));
  return result_id;
end $$;

create function public.update_design_board(p_board_id uuid, p_name text, p_url text, p_designer_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_name text := btrim(coalesce(p_name, '')); b public.design_boards; v_board text; v_widget text;
begin
  perform private.assert_agency();
  select * into b from public.design_boards where id = p_board_id for update;
  if not found then raise exception 'Board not found' using errcode = 'P0002'; end if;
  if length(v_name) not between 1 and 80 then
    raise exception 'Name the board (up to 80 characters)' using errcode = '22023';
  end if;
  if not exists(select 1 from public.project_assignments where project_id = b.project_id and designer_id = p_designer_id) then
    raise exception 'Assign this designer to the project first' using errcode = '22023';
  end if;
  select board_id, widget_id into v_board, v_widget from private.parse_miro_board_url(p_url);
  begin
    update public.design_boards set name = v_name, designer_id = p_designer_id, board_id = v_board,
      widget_id = v_widget, updated_at = now() where id = p_board_id;
  exception when unique_violation then
    raise exception 'A board with this name already exists in this project' using errcode = '23505';
  end;
  perform private.audit('design_board.updated', p_board_id, jsonb_build_object('project', b.project_id));
end $$;

create function public.send_board_round(p_board_id uuid, p_note text default '', p_frame_url text default null,
  p_idempotency_key uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare b public.design_boards; existing public.design_versions; v_board text; v_widget text;
  next_number integer; result_id uuid; target_client uuid;
begin
  select * into b from public.design_boards where id = p_board_id for update;
  if not found or not private.can_see_board(b.id) then
    raise exception 'Board access required' using errcode = '42501';
  end if;
  if p_idempotency_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
    select * into existing from public.design_versions where request_key = p_idempotency_key;
    if found then
      if existing.board_id is distinct from b.id then
        raise exception 'Idempotency key conflicts with a different round';
      end if;
      return existing.id;
    end if;
  end if;
  select client_id into target_client from public.projects where id = b.project_id for update;
  if exists(select 1 from public.projects where id = b.project_id and status = 'delivered') then
    raise exception 'Delivered projects cannot receive new rounds';
  end if;
  if nullif(btrim(coalesce(p_frame_url, '')), '') is null then
    v_board := b.board_id; v_widget := b.widget_id;
  else
    select board_id, widget_id into v_board, v_widget from private.parse_miro_board_url(p_frame_url);
  end if;
  select coalesce(max(version_number), 0) + 1 into next_number from public.design_versions where board_id = b.id;
  insert into public.design_versions(project_id, board_id, version_number, notes, status, created_by, request_key)
  values (b.project_id, b.id, next_number, btrim(coalesce(p_note, '')), 'submitted', auth.uid(), p_idempotency_key)
  returning id into result_id;
  insert into public.design_version_miro_links(version_id, project_id, board_id, widget_id, updated_by)
  values (result_id, b.project_id, v_board, v_widget, auth.uid());
  update public.projects set status = 'internal_review', updated_at = now() where id = b.project_id;
  perform private.notify_agency(target_client, b.project_id, 'Design ready for studio review', b.name);
  perform private.audit('round.sent', result_id, jsonb_build_object('board', b.id));
  return result_id;
end $$;

revoke execute on function public.create_design_board(uuid, text, text, uuid),
  public.update_design_board(uuid, text, text, uuid),
  public.send_board_round(uuid, text, text, uuid) from public, anon;
grant execute on function public.create_design_board(uuid, text, text, uuid),
  public.update_design_board(uuid, text, text, uuid),
  public.send_board_round(uuid, text, text, uuid) to authenticated;

alter publication supabase_realtime add table public.design_boards;
```

Before relying on the `set_version_miro_link` rewrite, open
`supabase/migrations/202609260001_miro_version_links.sql` and confirm that the original function
raised `42501` through `private.assert_agency()` for non-agency callers. The test at
`miro_version_links.test.sql` ("A designer cannot set a link") must still pass. A designer on a
per-deliverable version has `v_board_ref is null`, so they still get `42501`.

- [ ] **Step 4: Apply the migration and run the tests**

Run from the repo root:
`supabase migration up --local && supabase test db`
Expected: every file passes, including `miro_workspace.test.sql` and `miro_version_links.test.sql`.
If a designer-privacy assertion fails, fix the migration by writing a **new** migration file.
Never edit an applied one. Until this task is committed, you may instead run
`supabase migration down --local` and re-apply.

- [ ] **Step 5: Regenerate types and run the web gate**

Run from the repo root: `npm run db:types`. Then run `cd apps/web && npx tsc --noEmit -p .`.
Expected: type errors where `design_versions.deliverable_id` is now `string | null`. Leave them
for Task 3. Commit the migration, test and types now: the web gate is restored in Task 3, and this
task's gate is `supabase test db`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202609260006_miro_workspace_boards.sql supabase/tests/database/miro_workspace.test.sql supabase/database.types.ts
git commit -m "feat(db): add Miro design boards, rounds and designer privacy"
```

---

### Task 2: Sharing project-level client versions and reviewing them

**Files:**
- Create: `supabase/migrations/202609260007_miro_workspace_sharing.sql`
- Modify: `supabase/tests/database/miro_workspace.test.sql`. Append before `select * from finish();`.
- Regenerate: `supabase/database.types.ts`

**Interfaces:**
- Consumes: Task 1's boards, rounds and `mw` fixture keys (`round-a1`, `project`, `delivered`).
- Produces: `published_versions.deliverable_id` nullable;
  `public.share_miro_version(p_project_id uuid, p_url text, p_note text default '', p_source_round uuid default null, p_idempotency_key uuid default null) returns uuid`;
  `review_publication` handles project-level versions.

- [ ] **Step 1: Append the failing tests**

Insert before `select * from finish();` in `supabase/tests/database/miro_workspace.test.sql`:

```sql
-- Sharing: agency only; from a round or direct; idempotent; atomic on a bad link; delivered refused.
select pg_temp.act_as('designer-a');
set local role authenticated;
select throws_ok($$select public.share_miro_version(pg_temp.k('project'),'https://miro.com/app/board/uXjVClient1=/','x')$$,'42501',null,'A designer cannot share with the client');
reset role;
select pg_temp.act_as('agency');
set local role authenticated;
select throws_ok($$select public.share_miro_version(pg_temp.k('project'),'https://evil.example/app/board/uXjVClient1=/','x')$$,'22023',null,'An invalid client link is refused');
select is((select count(*)::int from public.published_versions where project_id=pg_temp.k('project')),0,'A refused share wrote nothing');
select lives_ok($$select pg_temp.remember('shared-1',public.share_miro_version(pg_temp.k('project'),'https://miro.com/app/board/uXjVClient1=/?moveToWidget=5',' First look ',pg_temp.k('round-a1'),md5('mw:share-1')::uuid))$$,'The agency shares a round');
select is(public.share_miro_version(pg_temp.k('project'),'https://miro.com/app/board/uXjVClient1=/?moveToWidget=5',' First look ',pg_temp.k('round-a1'),md5('mw:share-1')::uuid),pg_temp.k('shared-1'),'A retry returns the same version');
select throws_ok($$select public.share_miro_version(pg_temp.k('project'),'https://miro.com/app/board/uXjVClient1=/','other',null,md5('mw:share-1')::uuid)$$,'P0001','Idempotency key conflicts with a different version','A reused key for another share is refused');
select throws_ok($$select public.share_miro_version(pg_temp.k('delivered'),'https://miro.com/app/board/uXjVClient1=/','late')$$,'P0001','Delivered projects cannot publish new revisions','A delivered project refuses sharing');
reset role;
select is((select deliverable_id from public.published_versions where id=pg_temp.k('shared-1')),null,'A shared version belongs to the project, not a deliverable');
select is((select version_number from public.published_versions where id=pg_temp.k('shared-1')),1,'The first shared version is V1');
select is((select release_note from public.published_versions where id=pg_temp.k('shared-1')),'First look','The note is trimmed');
select is((select widget_id from public.publication_miro_links where publication_id=pg_temp.k('shared-1')),'5','The client link is stored');
select is((select status from public.publication_reviews where publication_id=pg_temp.k('shared-1')),'pending','A pending review opens');
select is((select internal_version_id from private.publication_sources where publication_id=pg_temp.k('shared-1')),pg_temp.k('round-a1'),'The source round is recorded');
select is((select status from public.design_versions where id=pg_temp.k('round-a1')),'reviewed','The round is marked shared');
select is((select status::text from public.projects where id=pg_temp.k('project')),'client_review','The project waits for the client');
select ok(exists(select 1 from public.notifications where client_id=pg_temp.k('client-org') and project_id=pg_temp.k('project') and title='New designs ready for review'),'The client is notified');

select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select pg_temp.remember('shared-2',public.share_miro_version(pg_temp.k('project'),'https://miro.com/app/board/uXjVClient1=/?moveToWidget=6','Second look'))$$,'The agency adds a version directly');
reset role;
select is((select version_number from public.published_versions where id=pg_temp.k('shared-2')),2,'Direct versions continue the project numbering');
select is((select count(*)::int from private.publication_sources where publication_id=pg_temp.k('shared-2')),0,'A direct version has no source round');
select is((select requested_by from private.miro_share_requests where publication_id=pg_temp.k('shared-2')),pg_temp.k('agency'),'The publisher of a direct version is recorded');

-- The client reads the versions and links but nothing internal.
select pg_temp.act_as('client');
set local role authenticated;
select is((select count(*)::int from public.published_versions where project_id=pg_temp.k('project')),2,'The client reads both shared versions');
select is((select count(*)::int from public.publication_miro_links where project_id=pg_temp.k('project')),2,'The client reads the client links');
select is((select count(*)::int from public.design_versions),0,'The client reads no round');
select is((select count(*)::int from public.design_boards),0,'The client reads no board');
-- Review: only the latest; a project-level decision sets the project status directly.
select throws_ok($$select public.review_publication(pg_temp.k('shared-1'),'approved')$$,'P0001','Review the latest published version','An older version cannot be reviewed');
select lives_ok($$select public.review_publication(pg_temp.k('shared-2'),'changes_requested','Warmer tones')$$,'The client requests changes on the latest');
reset role;
select is((select status::text from public.projects where id=pg_temp.k('project')),'changes_requested','Requested changes reach the project');
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select pg_temp.remember('shared-3',public.share_miro_version(pg_temp.k('project'),'https://miro.com/app/board/uXjVClient1=/?moveToWidget=7','Third look'))$$,'The agency shares the revision');
reset role;
select pg_temp.act_as('client');
set local role authenticated;
select lives_ok($$select public.review_publication(pg_temp.k('shared-3'),'approved')$$,'The client approves');
reset role;
select is((select status::text from public.projects where id=pg_temp.k('project')),'approved','Approval of the latest project-level version approves the project');
```

- [ ] **Step 2: Run to verify failure**

Run from the repo root: `supabase test db`.
Expected: `miro_workspace.test.sql` fails at the first `share_miro_version` call ("function does
not exist").

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/202609260007_miro_workspace_sharing.sql`. The `review_publication` body
below is the current one from `202609250002_client_team.sql`. Only the three marked comparisons
and the new project-level branch differ. Copy the rest verbatim.

```sql
-- Miro workspace, part 2: client versions that belong to the project (no deliverable), shared
-- from a round or directly, each with its own client-board link, and their review.

alter table public.published_versions alter column deliverable_id drop not null;
create unique index published_versions_project_number on public.published_versions(project_id, version_number)
  where deliverable_id is null;

-- Who shared a project-level version and with which retry key. A direct version has no
-- publication_sources row, so this is where its publisher lives.
create table private.miro_share_requests (
  request_key uuid primary key,
  publication_id uuid not null unique references public.published_versions on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  source_round uuid references public.design_versions,
  requested_by uuid not null references public.profiles,
  created_at timestamptz not null default now()
);

create function public.share_miro_version(p_project_id uuid, p_url text, p_note text default '',
  p_source_round uuid default null, p_idempotency_key uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_note text := btrim(coalesce(p_note, '')); v_board text; v_widget text; next_number integer;
  result_id uuid; target_client uuid; req private.miro_share_requests;
begin
  perform private.assert_agency();
  if p_idempotency_key is null then p_idempotency_key := gen_random_uuid(); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into req from private.miro_share_requests where request_key = p_idempotency_key;
  if found then
    if req.project_id <> p_project_id or req.source_round is distinct from p_source_round
       or (select release_note from public.published_versions where id = req.publication_id) <> v_note then
      raise exception 'Idempotency key conflicts with a different version';
    end if;
    return req.publication_id;
  end if;
  select board_id, widget_id into v_board, v_widget from private.parse_miro_board_url(p_url);
  select client_id into target_client from public.projects where id = p_project_id for update;
  if not found then raise exception 'Project not found' using errcode = 'P0002'; end if;
  if exists(select 1 from public.projects where id = p_project_id and status = 'delivered') then
    raise exception 'Delivered projects cannot publish new revisions';
  end if;
  if p_source_round is not null and not exists(
    select 1 from public.design_versions where id = p_source_round and project_id = p_project_id and board_id is not null
  ) then
    raise exception 'Round not found in this project' using errcode = 'P0002';
  end if;
  select coalesce(max(version_number), 0) + 1 into next_number
    from public.published_versions where project_id = p_project_id and deliverable_id is null;
  insert into public.published_versions(project_id, deliverable_id, version_number, release_note)
  values (p_project_id, null, next_number, v_note) returning id into result_id;
  insert into public.publication_miro_links(publication_id, project_id, board_id, widget_id, updated_by)
  values (result_id, p_project_id, v_board, v_widget, auth.uid());
  insert into public.publication_reviews(publication_id, project_id) values (result_id, p_project_id);
  if p_source_round is not null then
    insert into private.publication_sources(publication_id, internal_version_id, published_by, request_key, request_note)
    values (result_id, p_source_round, auth.uid(), p_idempotency_key, v_note);
    update public.design_versions set status = 'reviewed' where id = p_source_round;
  end if;
  insert into private.miro_share_requests(request_key, publication_id, project_id, source_round, requested_by)
  values (p_idempotency_key, result_id, p_project_id, p_source_round, auth.uid());
  update public.projects set status = 'client_review', updated_at = now() where id = p_project_id;
  perform private.notify_client(target_client, p_project_id, 'New designs ready for review', v_note);
  perform private.audit('version.published', result_id);
  return result_id;
end $$;
revoke execute on function public.share_miro_version(uuid, text, text, uuid, uuid) from public, anon;
grant execute on function public.share_miro_version(uuid, text, text, uuid, uuid) to authenticated;

create or replace function public.review_publication(p_publication_id uuid, p_decision text, p_feedback text default '')
returns void language plpgsql security definer set search_path = '' as $$
 declare target_project uuid;target_client uuid;target_deliverable uuid;publication_number integer;existing public.publication_reviews;project_state public.project_status; begin
 select v.project_id,p.client_id,v.deliverable_id,v.version_number into target_project,target_client,target_deliverable,publication_number from public.published_versions v join public.projects p on p.id=v.project_id where v.id=p_publication_id;
 if not found or not private.is_client_member(target_client) then raise exception 'Client review access required' using errcode='42501'; end if;
 if p_decision not in ('approved','changes_requested') then raise exception 'Invalid review decision'; end if;
 p_feedback:=trim(coalesce(p_feedback,''));
 if p_decision='changes_requested' and p_feedback='' then raise exception 'Describe the requested changes'; end if;
 select status into project_state from public.projects where id=target_project for update;
 -- changed: a project-level version (null deliverable) competes with the project's other project-level versions
 if exists(select 1 from public.published_versions where project_id=target_project and deliverable_id is not distinct from target_deliverable and version_number>publication_number) then raise exception 'Review the latest published version'; end if;
 select * into existing from public.publication_reviews where publication_id=p_publication_id for update;
 if existing.status<>'pending' then
  if existing.status=p_decision and existing.feedback=p_feedback then return; end if;
  raise exception 'This publication already has a review decision';
 end if;
 if project_state='delivered' then raise exception 'Delivered projects cannot be reviewed'; end if;
 update public.publication_reviews set status=p_decision,feedback=p_feedback,reviewed_at=now(),reviewed_by=auth.uid() where publication_id=p_publication_id;
 if target_deliverable is null then
  -- new: a project-level version stands for the whole project
  update public.projects set status=case when p_decision='approved' then 'approved'::public.project_status else 'changes_requested'::public.project_status end,updated_at=now() where id=target_project;
 else
 update public.projects set status=case
  -- changed: the latest version is found within the same project and deliverable
  when exists(select 1 from public.published_versions v join public.publication_reviews r on r.publication_id=v.id where v.project_id=target_project and v.deliverable_id is not null and r.status='changes_requested' and v.version_number=(select max(v2.version_number) from public.published_versions v2 where v2.project_id=v.project_id and v2.deliverable_id=v.deliverable_id)) then 'changes_requested'::public.project_status
  when exists(select 1 from public.deliverables d where d.project_id=target_project and not exists(select 1 from public.published_versions v join public.publication_reviews r on r.publication_id=v.id where v.deliverable_id=d.id and r.status='approved' and v.version_number=(select max(v2.version_number) from public.published_versions v2 where v2.deliverable_id=d.id))) then 'client_review'::public.project_status
  else 'approved'::public.project_status end,updated_at=now() where id=target_project;
 end if;
 perform private.notify_agency(target_client,target_project,case when p_decision='approved' then 'Client approved a design' else 'Client requested changes' end,p_feedback);
 perform private.audit('publication.reviewed',p_publication_id,jsonb_build_object('decision',p_decision));
end $$;
```

Before writing it, confirm with
`grep -l "function public.review_publication" supabase/migrations/*.sql | tail -1` that
`202609250002_client_team.sql` is still the latest definition. If a newer one exists, start from
that body instead.

- [ ] **Step 4: Apply and test**

Run from the repo root: `supabase migration up --local && supabase test db`.
Expected: all files pass, including `access_and_workflows.test.sql` and `authorization_matrix.test.sql`,
which exercise per-deliverable reviews.

- [ ] **Step 5: Regenerate types and commit**

Run: `npm run db:types`

```bash
git add supabase/migrations/202609260007_miro_workspace_sharing.sql supabase/tests/database/miro_workspace.test.sql supabase/database.types.ts
git commit -m "feat(db): share project-level Miro versions with the client and review them"
```

---

### Task 3: Data layer for boards, rounds and shared versions

**Files:**
- Modify: `apps/web/features/projects/project-data.ts`
- Modify: `apps/web/features/shared/version-row.ts`
- Modify: `apps/web/features/reviews/review-data.ts`, `apps/web/features/overview/overview-model.ts`,
  `apps/web/features/overview/overview-data.ts`, and any other file `tsc` flags
- Modify: `apps/web/features/projects/project-events.ts`
- Test: `apps/web/features/projects/canvas-versions.test.ts`, `apps/web/features/shared/version-row.test.ts` (create if absent)

**Interfaces:**
- Consumes: Tasks 1–2 RPC names and argument names exactly as written there.
- Produces (TypeScript, all exported from `project-data.ts`):
  - `CanvasVersion.deliverableId: string | null` and `CanvasVersion.boardId: string | null`
  - `type DesignBoard = { id: string; projectId: string; name: string; designerId: string; miro: MiroLink }`
  - `useDesignBoards(projectId: string, enabled: boolean)` → `UseQueryResult<DesignBoard[]>`
  - `createDesignBoard(database, { projectId, name, url, designerId }): Promise<string>`
  - `updateDesignBoard(database, { boardId, name, url, designerId }): Promise<void>`
  - `sendBoardRound(database, { boardId, note, frameUrl, idempotencyKey }): Promise<string>`
  - `shareMiroVersion(database, { projectId, url, note, sourceRoundId, idempotencyKey }): Promise<string>`
- Produces from `version-row.ts`: `versionGroupKey(row: { deliverable_id: string | null; board_id?: string | null; project_id: string }): string`

- [ ] **Step 1: Write failing tests**

Append to `apps/web/features/projects/canvas-versions.test.ts`:

```ts
describe("project-level versions", () => {
  it("maps a round's board and a shared version's missing deliverable", () => {
    const round = {
      id: "r1",
      project_id: "p",
      deliverable_id: null,
      board_id: "b1",
      version_number: 1,
      notes: "First pass",
      status: "submitted",
      created_at: "2026-09-26T12:00:00Z",
      created_by: "d",
      request_key: null,
    };
    const [version] = toCanvasVersions([round], [], false);
    expect(version.deliverableId).toBeNull();
    expect(version.boardId).toBe("b1");
  });
});
```

Create `apps/web/features/shared/version-row.test.ts`, or append to it if it exists:

```ts
import { describe, expect, it } from "vitest";
import { versionGroupKey } from "./version-row";

describe("versionGroupKey", () => {
  it("groups by deliverable, then board, then project", () => {
    expect(versionGroupKey({ deliverable_id: "d", board_id: null, project_id: "p" })).toBe("d");
    expect(versionGroupKey({ deliverable_id: null, board_id: "b", project_id: "p" })).toBe("board:b");
    expect(versionGroupKey({ deliverable_id: null, project_id: "p" })).toBe("project:p");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && npx vitest run features/projects/canvas-versions.test.ts features/shared/version-row.test.ts`
Expected: FAIL (`boardId` undefined; `versionGroupKey` not exported).

- [ ] **Step 3: Implement**

In `version-row.ts`, add:

```ts
/**
 * The group a version's history belongs to: its deliverable, or for the Miro workspace (no
 * deliverable) its design board, or the project itself for a shared client version.
 */
export function versionGroupKey(row: {
  deliverable_id: string | null;
  board_id?: string | null;
  project_id: string;
}): string {
  if (row.deliverable_id) return row.deliverable_id;
  if (row.board_id) return `board:${row.board_id}`;
  return `project:${row.project_id}`;
}
```

In `project-data.ts`:
- `CanvasVersion`: `deliverableId: string | null;` plus
  `/** The design board a Miro-workspace round belongs to; null elsewhere. */ boardId: string | null;`
- `toCanvasVersions`: `boardId: "board_id" in version ? version.board_id : null,`
- Add after `useProjectAssignments`:

```ts
export type DesignBoard = {
  id: string;
  projectId: string;
  name: string;
  designerId: string;
  miro: MiroLink;
};

/** The project's design boards the viewer may see: all for the agency, their own for a designer. */
export function useDesignBoards(projectId: string, enabled: boolean) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["project-detail", session?.user.id, projectId, "design-boards"],
    enabled: !!session && enabled,
    queryFn: async (): Promise<DesignBoard[]> =>
      assertResult(
        await database
          .from("design_boards")
          .select("id,project_id,name,designer_id,board_id,widget_id")
          .eq("project_id", projectId)
          .order("created_at"),
      ).map((row) => ({
        id: row.id,
        projectId: row.project_id,
        name: row.name,
        designerId: row.designer_id,
        miro: { boardId: row.board_id, widgetId: row.widget_id },
      })),
  });
}
```

- Add writes after `clearMiroLink`:

```ts
export async function createDesignBoard(
  database: SupabaseDatabase,
  input: { projectId: string; name: string; url: string; designerId: string },
) {
  return assertResult(
    await database.rpc("create_design_board", {
      p_project_id: input.projectId,
      p_name: input.name,
      p_url: input.url,
      p_designer_id: input.designerId,
    }),
  );
}

export async function updateDesignBoard(
  database: SupabaseDatabase,
  input: { boardId: string; name: string; url: string; designerId: string },
) {
  assertResult(
    await database.rpc("update_design_board", {
      p_board_id: input.boardId,
      p_name: input.name,
      p_url: input.url,
      p_designer_id: input.designerId,
    }),
  );
}

/** "Send to studio": the next round of a design board. */
export async function sendBoardRound(
  database: SupabaseDatabase,
  input: { boardId: string; note: string; frameUrl: string; idempotencyKey: string },
) {
  return assertResult(
    await database.rpc("send_board_round", {
      p_board_id: input.boardId,
      p_note: input.note,
      ...(input.frameUrl ? { p_frame_url: input.frameUrl } : {}),
      p_idempotency_key: input.idempotencyKey,
    }),
  );
}

/** Shares a project-level client version, from a round or directly. */
export async function shareMiroVersion(
  database: SupabaseDatabase,
  input: {
    projectId: string;
    url: string;
    note: string;
    sourceRoundId: string | null;
    idempotencyKey: string;
  },
) {
  return assertResult(
    await database.rpc("share_miro_version", {
      p_project_id: input.projectId,
      p_url: input.url,
      p_note: input.note,
      ...(input.sourceRoundId ? { p_source_round: input.sourceRoundId } : {}),
      p_idempotency_key: input.idempotencyKey,
    }),
  );
}
```

- In `project-events.ts`, add `"design_boards"` to the designer list and to the agency list.
- Run `npx tsc --noEmit -p .` and fix each error from the nullable deliverable:
  - `review-data.ts`: add `board_id` to the design_versions `select` string. Key `latest` by
    `versionGroupKey(version)`. Label a row with no deliverable
    `version.deliverable_id ? (deliverables.find(…)?.name ?? "Deliverable") : "Design board round"`
    on the internal side, and `"Shared version"` on the published side.
  - `overview-model.ts` / `overview-data.ts`: same pattern. Change `RawDesignerVersion.deliverable_id`
    to `string | null` and add `board_id: string | null`. Add `board_id` to the select string. Key
    by `versionGroupKey`. Label `"Design board round"`.
  - `features/projects/*` (`canvas-layout.ts`, `miro-mode.ts`, `bulk-drop-*`,
    `project-action-*`, `project-page.tsx`, `playground-albums.ts`): where code groups versions
    **by deliverable**, filter out `deliverableId === null` first
    (`versions.filter((version) => version.deliverableId !== null)`). The legacy canvas and legacy
    Miro mode never show workspace rows. Where a `string` is required, narrow with that filter
    rather than `!`.
- Every existing test that builds `CanvasVersion` objects keeps working when `boardId` is optional
  in object literals typed `as CanvasVersion`. If a literal is typed without a cast, add `boardId: null`.

- [ ] **Step 4: Run the gate**

Run: `cd apps/web && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/projects/project-data.ts apps/web/features/shared/version-row.ts apps/web/features/shared/version-row.test.ts apps/web/features/projects/canvas-versions.test.ts apps/web/features/projects/project-events.ts apps/web/features/reviews/review-data.ts apps/web/features/overview/overview-model.ts apps/web/features/overview/overview-data.ts
# plus every other file tsc made you touch, named explicitly
git commit -m "feat(projects): read design boards and project-level versions"
```

---

### Task 4: Workspace rules

**Files:**
- Create: `apps/web/features/projects/miro-workspace.ts`
- Test: `apps/web/features/projects/miro-workspace.test.ts`

**Interfaces:**
- Consumes: `CanvasVersion` and `DesignBoard` from Task 3.
- Produces:
  - `usesWorkspace(channel: ProjectChannel, input: { versions: CanvasVersion[]; boards: DesignBoard[] }): boolean`
  - `boardRounds(versions: CanvasVersion[], boardId: string): CanvasVersion[]` (newest first, linked only)
  - `sharedVersions(versions: CanvasVersion[]): CanvasVersion[]` (project-level, newest first, linked only)
  - `pickById<T extends { id: string }>(items: T[], id: string | null): T | null` (the requested item, else the first)
  - `canReviewShared(version: CanvasVersion, shared: CanvasVersion[], role: string | undefined, projectStatus: string): boolean`
  - `latestSharedLink(shared: CanvasVersion[]): MiroLink | null`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { CanvasVersion, DesignBoard } from "./project-data";
import {
  boardRounds,
  canReviewShared,
  latestSharedLink,
  pickById,
  sharedVersions,
  usesWorkspace,
} from "./miro-workspace";

const link = (widgetId: string) => ({ boardId: "uXjVBoard01=", widgetId });
function v(partial: Partial<CanvasVersion> & { id: string; number: number }): CanvasVersion {
  return {
    projectId: "p",
    deliverableId: null,
    boardId: null,
    note: "",
    status: "pending",
    date: `2026-09-${String(partial.number).padStart(2, "0")}`,
    miro: link(String(partial.number)),
    ...partial,
  };
}
const board: DesignBoard = { id: "b1", projectId: "p", name: "Alpha", designerId: "d", miro: link("0") };

describe("usesWorkspace", () => {
  it("uses the workspace on a channel with workspace data or no legacy versions", () => {
    expect(usesWorkspace("internal", { versions: [], boards: [] })).toBe(true);
    expect(usesWorkspace("internal", { versions: [v({ id: "x", number: 1, deliverableId: "d" })], boards: [] })).toBe(false);
    expect(usesWorkspace("internal", { versions: [v({ id: "x", number: 1, deliverableId: "d" })], boards: [board] })).toBe(true);
    expect(usesWorkspace("client", { versions: [v({ id: "x", number: 1, deliverableId: "d" })], boards: [] })).toBe(false);
    expect(usesWorkspace("client", { versions: [v({ id: "x", number: 1, deliverableId: "d" }), v({ id: "s", number: 1 })], boards: [] })).toBe(true);
  });
});

describe("boardRounds and sharedVersions", () => {
  const versions = [
    v({ id: "r1", number: 1, boardId: "b1", status: "submitted" }),
    v({ id: "r2", number: 2, boardId: "b1", status: "submitted" }),
    v({ id: "rx", number: 1, boardId: "b2" }),
    v({ id: "s1", number: 1 }),
    v({ id: "s2", number: 2 }),
    v({ id: "legacy", number: 3, deliverableId: "d" }),
  ];
  it("lists a board's rounds newest first", () => {
    expect(boardRounds(versions, "b1").map((item) => item.id)).toEqual(["r2", "r1"]);
  });
  it("lists project-level client versions newest first", () => {
    expect(sharedVersions(versions).map((item) => item.id)).toEqual(["s2", "s1"]);
  });
  it("picks the requested item or the first", () => {
    expect(pickById(sharedVersions(versions), "s1")?.id).toBe("s1");
    expect(pickById(sharedVersions(versions), "gone")?.id).toBe("s2");
    expect(pickById([], null)).toBeNull();
  });
  it("prefills from the newest shared link", () => {
    expect(latestSharedLink(sharedVersions(versions))).toEqual(link("2"));
    expect(latestSharedLink([])).toBeNull();
  });
});

describe("canReviewShared", () => {
  const shared = [v({ id: "s2", number: 2 }), v({ id: "s1", number: 1 })];
  it("lets a client decide only on the latest pending version before delivery", () => {
    expect(canReviewShared(shared[0], shared, "client", "client_review")).toBe(true);
    expect(canReviewShared(shared[1], shared, "client", "client_review")).toBe(false);
    expect(canReviewShared(shared[0], shared, "agency", "client_review")).toBe(false);
    expect(canReviewShared(shared[0], shared, "client", "delivered")).toBe(false);
    expect(canReviewShared({ ...shared[0], status: "approved" }, shared, "client", "approved")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && npx vitest run features/projects/miro-workspace.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
import type { MiroLink } from "./miro-links";
import type { CanvasVersion, DesignBoard, ProjectChannel } from "./project-data";

/**
 * The Miro workspace's rules. Rounds are internal versions with a design board; shared versions
 * are client versions with no deliverable. Per-deliverable versions belong to the legacy canvas.
 */
const newestFirst = (a: CanvasVersion, b: CanvasVersion) => b.number - a.number;

/**
 * Which body a channel shows. The workspace, once the channel has workspace data or nothing
 * legacy; otherwise the legacy canvas, so existing projects keep working unchanged.
 */
export function usesWorkspace(
  channel: ProjectChannel,
  input: { versions: CanvasVersion[]; boards: DesignBoard[] },
): boolean {
  const legacy = input.versions.some((version) => version.deliverableId !== null);
  const workspace =
    channel === "internal"
      ? input.boards.length > 0
      : input.versions.some((version) => version.deliverableId === null);
  return workspace || !legacy;
}

export function boardRounds(versions: CanvasVersion[], boardId: string): CanvasVersion[] {
  return versions.filter((version) => version.boardId === boardId && !!version.miro).sort(newestFirst);
}

export function sharedVersions(versions: CanvasVersion[]): CanvasVersion[] {
  return versions
    .filter((version) => version.deliverableId === null && version.boardId === null && !!version.miro)
    .sort(newestFirst);
}

export function pickById<T extends { id: string }>(items: T[], id: string | null): T | null {
  return items.find((item) => item.id === id) ?? items[0] ?? null;
}

/** A client decides on the latest shared version while it waits for them, until delivery. */
export function canReviewShared(
  version: CanvasVersion,
  shared: CanvasVersion[],
  role: string | undefined,
  projectStatus: string,
): boolean {
  return (
    role === "client" &&
    shared[0]?.id === version.id &&
    version.status === "pending" &&
    projectStatus !== "delivered"
  );
}

export function latestSharedLink(shared: CanvasVersion[]): MiroLink | null {
  return shared[0]?.miro ?? null;
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/web && npx vitest run features/projects/miro-workspace.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/projects/miro-workspace.ts apps/web/features/projects/miro-workspace.test.ts
git commit -m "feat(projects): add Miro workspace rules"
```

---

### Task 5: Board, round and share dialogs

**Files:**
- Create: `apps/web/features/projects/project-action-board.tsx`, `project-action-round.tsx`, `project-action-share.tsx`
- Modify: `apps/web/features/projects/project-action-dialog.tsx`
- Test: `apps/web/features/projects/project-action-workspace.test.tsx`

**Interfaces:**
- Consumes: Task 3 writes, `useProjectAssignments`, `MiroField` from `project-action-miro.tsx`,
  `ProjectActionShell`, `useCloseOnSuccess` and `useProjectActionClose` from `project-action-shell.tsx`,
  and `miroBoardUrl` and `parseMiroBoardUrl`, `miroUrlHint` from `miro-links.ts`.
- Produces:
  - `type BoardAction = { kind: "board"; projectId: string; board?: DesignBoard }`
  - `type RoundAction = { kind: "round"; board: DesignBoard }`
  - `type ShareAction = { kind: "share"; projectId: string; round: CanvasVersion | null; prefill: MiroLink | null }`
  - `ProjectAction` includes all three.
  - `projectActionKey(action: ProjectAction | null): string`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/features/projects/project-action-workspace.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectActionDialog, projectActionKey } from "./project-action-dialog";

const writes = vi.hoisted(() => ({
  createDesignBoard: vi.fn(),
  updateDesignBoard: vi.fn(),
  sendBoardRound: vi.fn(),
  shareMiroVersion: vi.fn(),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: {}, profile: { id: "agency", role: "agency" } }),
}));
vi.mock("./project-data", async (original) => ({
  ...(await original<typeof import("./project-data")>()),
  ...writes,
  useProjectAssignments: () => ({
    data: {
      members: [
        { id: "d1", display_name: "Alex Morgan" },
        { id: "d2", display_name: "Sam Lee" },
      ],
      assigned: ["d1"],
    },
    isPending: false,
  }),
  useInvalidateProject: () => vi.fn(),
}));
// jsdom has no native dialog/top-layer implementation; real focus isolation is covered in E2E.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value() { this.setAttribute("open", ""); } },
  close: { configurable: true, value() { this.removeAttribute("open"); } },
});
const wrap = (node: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
const board = {
  id: "b1",
  projectId: "p",
  name: "Alpha",
  designerId: "d1",
  miro: { boardId: "uXjVAlpha01=", widgetId: null },
};

beforeEach(() => Object.values(writes).forEach((write) => write.mockReset().mockResolvedValue("new-id")));

describe("board dialog", () => {
  it("creates a board for an assigned designer only", async () => {
    const user = userEvent.setup();
    wrap(<ProjectActionDialog action={{ kind: "board", projectId: "p" }} projectId="p" suspended={false} onOpenPlayground={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("option", { name: "Alex Morgan" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Sam Lee" })).toBeNull();
    await user.type(screen.getByLabelText("Board name"), "  Alpha  ");
    await user.type(screen.getByLabelText("Miro board"), "https://miro.com/app/board/uXjVAlpha01=/");
    await user.click(screen.getByRole("button", { name: "Add board" }));
    await waitFor(() =>
      expect(writes.createDesignBoard).toHaveBeenCalledWith({}, {
        projectId: "p",
        name: "Alpha",
        url: "https://miro.com/app/board/uXjVAlpha01=/",
        designerId: "d1",
      }),
    );
  });
  it("refuses a link that is not a Miro board before calling the server", async () => {
    const user = userEvent.setup();
    wrap(<ProjectActionDialog action={{ kind: "board", projectId: "p" }} projectId="p" suspended={false} onOpenPlayground={vi.fn()} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText("Board name"), "Alpha");
    await user.type(screen.getByLabelText("Miro board"), "https://example.com/x");
    await user.click(screen.getByRole("button", { name: "Add board" }));
    expect(await screen.findByText(/Paste a Miro board or frame link/)).toBeInTheDocument();
    expect(writes.createDesignBoard).not.toHaveBeenCalled();
  });
});

describe("round dialog", () => {
  it("reuses its idempotency key when a failed send is retried", async () => {
    const user = userEvent.setup();
    writes.sendBoardRound.mockRejectedValueOnce(new Error("Network down"));
    wrap(<ProjectActionDialog action={{ kind: "round", board }} projectId="p" suspended={false} onOpenPlayground={vi.fn()} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText("Note for the studio"), "Ready");
    await user.click(screen.getByRole("button", { name: "Send to studio" }));
    expect(await screen.findByText("Network down")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send to studio" }));
    await waitFor(() => expect(writes.sendBoardRound).toHaveBeenCalledTimes(2));
    const [first, second] = writes.sendBoardRound.mock.calls.map((call) => call[1]);
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(first).toMatchObject({ boardId: "b1", note: "Ready", frameUrl: "" });
  });
});

describe("share dialog", () => {
  it("prefills the latest client link and shares the round", async () => {
    const user = userEvent.setup();
    const round = { id: "r1", number: 2 } as never;
    wrap(<ProjectActionDialog action={{ kind: "share", projectId: "p", round, prefill: { boardId: "uXjVClient1=", widgetId: "5" } }} projectId="p" suspended={false} onOpenPlayground={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Client Miro board")).toHaveValue("https://miro.com/app/board/uXjVClient1=/?moveToWidget=5");
    await user.type(screen.getByLabelText("Note for the client"), "First look");
    await user.click(screen.getByRole("button", { name: "Share with client" }));
    await waitFor(() =>
      expect(writes.shareMiroVersion).toHaveBeenCalledWith({}, expect.objectContaining({
        projectId: "p",
        url: "https://miro.com/app/board/uXjVClient1=/?moveToWidget=5",
        note: "First look",
        sourceRoundId: "r1",
      })),
    );
  });
});

describe("projectActionKey", () => {
  it("keys every kind", () => {
    expect(projectActionKey(null)).toBe("closed");
    expect(projectActionKey({ kind: "board", projectId: "p" })).toBe("board:new");
    expect(projectActionKey({ kind: "round", board })).toBe("round:b1");
    expect(projectActionKey({ kind: "share", projectId: "p", round: null, prefill: null })).toBe("share:direct");
  });
});
```

Check `miroBoardUrl` in `miro-links.ts` before running. If it formats the URL differently from
`https://miro.com/app/board/<id>/?moveToWidget=<n>`, set the expected value in the share test to
exactly what `miroBoardUrl({ boardId: "uXjVClient1=", widgetId: "5" })` returns.

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && npx vitest run features/projects/project-action-workspace.test.tsx`
Expected: FAIL, `projectActionKey` not exported and the new kinds not handled.

- [ ] **Step 3: Implement the three dialogs**

`project-action-board.tsx`:

```tsx
"use client";

import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { createDesignBoard, updateDesignBoard, useProjectAssignments, type DesignBoard } from "./project-data";
import { miroBoardUrl, miroUrlHint, parseMiroBoardUrl } from "./miro-links";
import { ProjectActionShell, useCloseOnSuccess, useProjectActionClose } from "./project-action-shell";

export type BoardAction = { kind: "board"; projectId: string; board?: DesignBoard };

/** Adds or edits a design board: its name, its Miro link and the one designer who works on it. */
export function ProjectActionBoard({
  action,
  suspended,
  onClose,
}: {
  action: BoardAction;
  suspended: boolean;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const assignments = useProjectAssignments(action.projectId);
  const designers = (assignments.data?.members ?? []).filter((member) =>
    assignments.data?.assigned.includes(member.id),
  );
  const { closeOnSuccess } = useCloseOnSuccess(onClose);
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const value = (name: string) => String(form.get(name) ?? "").trim();
      const input = { name: value("name"), url: value("miro"), designerId: value("designer") };
      if (!parseMiroBoardUrl(input.url)) throw new Error(miroUrlHint);
      if (action.board) await updateDesignBoard(database, { boardId: action.board.id, ...input });
      else await createDesignBoard(database, { projectId: action.projectId, ...input });
    },
    onSuccess: closeOnSuccess,
  });
  const { closeError, closeDisabled, close } = useProjectActionClose({ onClose, pending: mutation.isPending });
  const submitLabel = action.board ? "Save board" : "Add board";
  return (
    <ProjectActionShell
      open={!suspended}
      title={action.board ? "Edit the design board." : "A design board."}
      closeDisabled={closeDisabled}
      onModalClose={() => void close()}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(new FormData(event.currentTarget));
      }}
      onCancelClick={() => void close()}
      cancelDisabled={closeDisabled}
      submitLabel={mutation.isPending ? "Saving…" : submitLabel}
      submitDisabled={mutation.isPending || designers.length === 0}
      error={
        closeError ||
        mutation.error?.message ||
        (assignments.data && designers.length === 0
          ? "Assign a designer to the project first."
          : undefined)
      }
    >
      <p>The designer works here; only you and that designer see this board.</p>
      <label>
        Board name
        <input name="name" required maxLength={80} defaultValue={action.board?.name ?? ""} />
      </label>
      <label>
        Miro board
        <input name="miro" required defaultValue={action.board ? miroBoardUrl(action.board.miro) : ""} />
      </label>
      <label>
        Designer
        <select name="designer" required defaultValue={action.board?.designerId ?? designers[0]?.id}>
          {designers.map((designer) => (
            <option key={designer.id} value={designer.id}>
              {designer.display_name}
            </option>
          ))}
        </select>
      </label>
    </ProjectActionShell>
  );
}
```

Before relying on it, check `miro-links.ts`. `parseMiroBoardUrl` must return `null` for a non-Miro
URL, and `miroUrlHint` must contain "Paste a Miro board or frame link". If the hint text differs,
change the test's regex to match it.

`project-action-round.tsx`:

```tsx
"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { sendBoardRound, type DesignBoard } from "./project-data";
import { miroUrlHint, parseMiroBoardUrl } from "./miro-links";
import { ProjectActionShell, useCloseOnSuccess, useProjectActionClose } from "./project-action-shell";

export type RoundAction = { kind: "round"; board: DesignBoard };

/** "Send to studio": the designer's next round of their board, with a note and an optional frame. */
export function ProjectActionRound({
  action,
  suspended,
  onClose,
}: {
  action: RoundAction;
  suspended: boolean;
  onClose: () => void;
}) {
  const { database } = useAuth();
  // One key per open dialog: a retry after a failure replays the same send.
  const idempotencyKey = useRef(crypto.randomUUID());
  const { closeOnSuccess } = useCloseOnSuccess(onClose);
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const value = (name: string) => String(form.get(name) ?? "").trim();
      const frameUrl = value("frame");
      if (frameUrl && !parseMiroBoardUrl(frameUrl)) throw new Error(miroUrlHint);
      await sendBoardRound(database, {
        boardId: action.board.id,
        note: value("note"),
        frameUrl,
        idempotencyKey: idempotencyKey.current,
      });
    },
    onSuccess: closeOnSuccess,
  });
  const { closeError, closeDisabled, close } = useProjectActionClose({ onClose, pending: mutation.isPending });
  return (
    <ProjectActionShell
      open={!suspended}
      title={`Send ${action.board.name} to the studio.`}
      closeDisabled={closeDisabled}
      onModalClose={() => void close()}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(new FormData(event.currentTarget));
      }}
      onCancelClick={() => void close()}
      cancelDisabled={closeDisabled}
      submitLabel={mutation.isPending ? "Sending…" : "Send to studio"}
      submitDisabled={mutation.isPending}
      error={closeError || mutation.error?.message}
    >
      <label>
        Note for the studio
        <textarea name="note" rows={3} placeholder="What should the studio look at?" />
      </label>
      <label>
        Frame link (optional)
        <input name="frame" placeholder="Leave empty to send the whole board" />
      </label>
    </ProjectActionShell>
  );
}
```

`project-action-share.tsx`:

```tsx
"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { shareMiroVersion, type CanvasVersion } from "./project-data";
import { miroBoardUrl, miroUrlHint, parseMiroBoardUrl, type MiroLink } from "./miro-links";
import { ProjectActionShell, useCloseOnSuccess, useProjectActionClose } from "./project-action-shell";

export type ShareAction = {
  kind: "share";
  projectId: string;
  /** The round being shared, or null for a version added directly in Shared with client. */
  round: CanvasVersion | null;
  prefill: MiroLink | null;
};

/** Shares a client version: the agency pastes the client board's link after copying the design. */
export function ProjectActionShare({
  action,
  suspended,
  onClose,
}: {
  action: ShareAction;
  suspended: boolean;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const idempotencyKey = useRef(crypto.randomUUID());
  const { closeOnSuccess } = useCloseOnSuccess(onClose);
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const value = (name: string) => String(form.get(name) ?? "").trim();
      const url = value("miro");
      if (!parseMiroBoardUrl(url)) throw new Error(miroUrlHint);
      await shareMiroVersion(database, {
        projectId: action.projectId,
        url,
        note: value("note"),
        sourceRoundId: action.round?.id ?? null,
        idempotencyKey: idempotencyKey.current,
      });
    },
    onSuccess: closeOnSuccess,
  });
  const { closeError, closeDisabled, close } = useProjectActionClose({ onClose, pending: mutation.isPending });
  return (
    <ProjectActionShell
      open={!suspended}
      title={action.round ? `Share round ${action.round.number} with the client.` : "A new client version."}
      closeDisabled={closeDisabled}
      onModalClose={() => void close()}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(new FormData(event.currentTarget));
      }}
      onCancelClick={() => void close()}
      cancelDisabled={closeDisabled}
      submitLabel={mutation.isPending ? "Sharing…" : "Share with client"}
      submitDisabled={mutation.isPending}
      error={closeError || mutation.error?.message}
    >
      <p>Copy the design into the client board in Miro first, then paste that board or frame here.</p>
      <label>
        Client Miro board
        <input name="miro" required defaultValue={action.prefill ? miroBoardUrl(action.prefill) : ""} />
      </label>
      <label>
        Note for the client
        <textarea name="note" rows={3} placeholder="What should the client look at?" />
      </label>
    </ProjectActionShell>
  );
}
```

In `project-action-dialog.tsx`, import the three components and their action types, extend
`ProjectAction` with `| BoardAction | RoundAction | ShareAction`, and add cases:

```tsx
    case "board":
      return <ProjectActionBoard action={action} suspended={suspended} onClose={onClose} />;
    case "round":
      return <ProjectActionRound action={action} suspended={suspended} onClose={onClose} />;
    case "share":
      return <ProjectActionShare action={action} suspended={suspended} onClose={onClose} />;
```

Add the key helper and use it in `project-page.tsx`, replacing the inline `key={action ? … : "closed"}`:

```tsx
/** A remount key per action target, so reopening an action starts from a fresh form. */
export function projectActionKey(action: ProjectAction | null): string {
  if (!action) return "closed";
  switch (action.kind) {
    case "board":
      return `board:${action.board?.id ?? "new"}`;
    case "round":
      return `round:${action.board.id}`;
    case "share":
      return `share:${action.round?.id ?? "direct"}`;
    case "version":
      return `version:${action.deliverableId}`;
    default:
      return `${action.kind}:${action.version.id}`;
  }
}
```

Update the header comment of `ProjectActionDialog` from "the other six" to "the other kinds".

- [ ] **Step 4: Run tests and gate**

Run: `cd apps/web && npx vitest run features/projects && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/projects/project-action-board.tsx apps/web/features/projects/project-action-round.tsx apps/web/features/projects/project-action-share.tsx apps/web/features/projects/project-action-dialog.tsx apps/web/features/projects/project-action-workspace.test.tsx apps/web/features/projects/project-page.tsx
git commit -m "feat(projects): add design board, round and share dialogs"
```

---

### Task 6: Workspace bar, embed and Feedback button

**Files:**
- Create: `apps/web/features/projects/miro-workspace-bar.tsx`
- Modify: `apps/web/features/projects/miro-view.tsx` (extract `MiroEmbed`), `project-tool-bar.tsx`, `project-panel.tsx`, `projects.css`
- Test: `apps/web/features/projects/miro-workspace-bar.test.tsx`, `apps/web/features/projects/project-tool-bar.test.tsx`

**Interfaces:**
- Consumes: `DesignBoard`, `CanvasVersion`, `ProjectChannel`, `versionStatusLabel`.
- Produces:
  - `MiroEmbed({ title, link, frameKey, strip }: { title: string; link: MiroLink; frameKey: string; strip?: ReactNode })`
  - `MiroWorkspaceBar(props: MiroWorkspaceBarProps)` with the props below
  - `ProjectToolBar` gains `feedback?: { open: boolean; onToggle: () => void }`
  - `ProjectPanelKind = "conversation" | "details" | "feedback"`

```ts
export type MiroWorkspaceBarProps = {
  back: ReactNode;
  title: string;
  channel: ProjectChannel;
  role: "agency" | "designer" | "client";
  viewerId: string;
  dueLabel: string;
  boards: DesignBoard[];
  board: DesignBoard | null;
  rounds: CanvasVersion[];
  round: CanvasVersion | null;
  shared: CanvasVersion[];
  version: CanvasVersion | null;
  onBoard: (id: string) => void;
  onRound: (id: string | null) => void;
  onVersion: (id: string) => void;
  onAddBoard: () => void;
  onEditBoard: () => void;
  onSendRound: () => void;
  onShareRound: () => void;
  onAddVersion: () => void;
  onEditLink: () => void;
  viewControl: ReactNode;
  menu: ReactNode;
};
```

- [ ] **Step 1: Write failing tests**

`miro-workspace-bar.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CanvasVersion } from "./project-data";
import { MiroWorkspaceBar, type MiroWorkspaceBarProps } from "./miro-workspace-bar";

const link = { boardId: "uXjVBoard01=", widgetId: null };
const boardA = { id: "a", projectId: "p", name: "Alpha", designerId: "d1", miro: link };
const boardB = { id: "b", projectId: "p", name: "Beta", designerId: "d2", miro: link };
const round = { id: "r1", number: 1, status: "submitted", miro: link, boardId: "a", deliverableId: null } as CanvasVersion;
const shared = { id: "s1", number: 1, status: "pending", miro: link, boardId: null, deliverableId: null } as CanvasVersion;
function props(overrides: Partial<MiroWorkspaceBarProps>): MiroWorkspaceBarProps {
  return {
    back: <button>Back</button>, title: "Campaign", channel: "internal", role: "agency", viewerId: "agency",
    dueLabel: "Due Sep 30", boards: [boardA, boardB], board: boardA, rounds: [round], round: null,
    shared: [shared], version: shared, onBoard: vi.fn(), onRound: vi.fn(), onVersion: vi.fn(),
    onAddBoard: vi.fn(), onEditBoard: vi.fn(), onSendRound: vi.fn(), onShareRound: vi.fn(),
    onAddVersion: vi.fn(), onEditLink: vi.fn(), viewControl: null, menu: null, ...overrides,
  };
}

describe("MiroWorkspaceBar in Working files", () => {
  it("lets the agency pick boards and rounds, add and edit boards, and share a round", async () => {
    const user = userEvent.setup();
    const onRound = vi.fn();
    const onShareRound = vi.fn();
    render(<MiroWorkspaceBar {...props({ round, onRound, onShareRound })} />);
    expect(screen.getByRole("combobox", { name: "Design board" })).toHaveValue("a");
    const rounds = screen.getByRole("group", { name: "Rounds" });
    await user.click(within(rounds).getByRole("button", { name: "Board" }));
    expect(onRound).toHaveBeenCalledWith(null);
    await user.click(screen.getByRole("button", { name: "Share with client" }));
    expect(onShareRound).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add design board" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send to studio" })).toBeNull();
  });
  it("gives the board's designer Send to studio and nothing of the agency's", () => {
    render(<MiroWorkspaceBar {...props({ role: "designer", viewerId: "d1", boards: [boardA] })} />);
    // One board needs no picker.
    expect(screen.queryByRole("combobox", { name: "Design board" })).toBeNull();
    expect(screen.getByRole("button", { name: "Send to studio" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share with client" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add design board" })).toBeNull();
  });
  it("hides Share with client until a round is shown", () => {
    render(<MiroWorkspaceBar {...props({ round: null })} />);
    expect(screen.queryByRole("button", { name: "Share with client" })).toBeNull();
  });
});

describe("MiroWorkspaceBar in Shared with client", () => {
  it("shows the versions, status and due date, and the agency's add button", () => {
    render(<MiroWorkspaceBar {...props({ channel: "client" })} />);
    expect(screen.getByRole("group", { name: "Client versions" })).toHaveTextContent("V1");
    expect(screen.getByText("In review")).toBeInTheDocument();
    expect(screen.getByText("Due Sep 30")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New client version" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Design board" })).toBeNull();
  });
  it("gives the client no agency controls", () => {
    render(<MiroWorkspaceBar {...props({ channel: "client", role: "client", viewerId: "c" })} />);
    expect(screen.queryByRole("button", { name: "New client version" })).toBeNull();
  });
});
```

Add to `project-tool-bar.test.tsx`:

```tsx
it("shows Feedback only when a workspace item is shown", async () => {
  const user = userEvent.setup();
  const onToggle = vi.fn();
  const { rerender } = render(<ProjectToolBar panel={null} onPanel={vi.fn()} disabled={false}>{null}</ProjectToolBar>);
  expect(screen.queryByRole("button", { name: "Feedback" })).toBeNull();
  rerender(<ProjectToolBar panel={null} onPanel={vi.fn()} disabled={false} feedback={{ open: false, onToggle }}>{null}</ProjectToolBar>);
  await user.click(screen.getByRole("button", { name: "Feedback" }));
  expect(onToggle).toHaveBeenCalled();
});
```

Match that test's imports to the file's existing ones (`render`, `screen`, `userEvent`, `vi`).

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && npx vitest run features/projects/miro-workspace-bar.test.tsx features/projects/project-tool-bar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`miro-view.tsx`: extract the embed and make `MiroView` use it:

```tsx
/** The Miro embed itself: a cropped live-embed iframe; `frameKey` reloads it on a new frame. */
export function MiroEmbed({
  title,
  link,
  frameKey,
  strip,
}: {
  title: string;
  link: MiroLink;
  frameKey: string;
  strip?: ReactNode;
}) {
  return (
    <section className="miro-view" aria-label="Miro board">
      {strip}
      <div className="miro-view-crop">
        <iframe
          key={frameKey}
          className="miro-view-frame"
          title={title}
          src={miroEmbedUrl(link)}
          allow="fullscreen; clipboard-read; clipboard-write"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </section>
  );
}
```

`MiroView` becomes
`<MiroEmbed title={`Miro board for ${miroVersionLabel(current, deliverables)}`} link={current.miro} frameKey={current.id} strip={strip} />`.
Keep the crop comment on `MiroEmbed`.

`miro-workspace-bar.tsx`:

```tsx
"use client";

import { ArrowUpRight, MoreHorizontal, Plus, Send, Share2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useDismissOnOutsideClick } from "@/features/shared/use-dismiss-on-outside-click";
import { versionStatusLabel } from "@/features/workspace/workspace-data";
import { miroBoardUrl } from "./miro-links";
import type { CanvasVersion, DesignBoard, ProjectChannel } from "./project-data";

export type MiroWorkspaceBarProps = {
  back: ReactNode;
  title: string;
  channel: ProjectChannel;
  role: "agency" | "designer" | "client";
  viewerId: string;
  dueLabel: string;
  boards: DesignBoard[];
  board: DesignBoard | null;
  rounds: CanvasVersion[];
  round: CanvasVersion | null;
  shared: CanvasVersion[];
  version: CanvasVersion | null;
  onBoard: (id: string) => void;
  onRound: (id: string | null) => void;
  onVersion: (id: string) => void;
  onAddBoard: () => void;
  onEditBoard: () => void;
  onSendRound: () => void;
  onShareRound: () => void;
  onAddVersion: () => void;
  onEditLink: () => void;
  viewControl: ReactNode;
  menu: ReactNode;
};

/**
 * The Miro workspace's header. In Working files: the design board, its rounds, and the actions of
 * whoever is looking (the board's designer sends a round; the agency shares it and manages boards).
 * In Shared with client: the client versions, their status and the due date. Nothing here names a
 * designer: a designer only ever receives their own boards.
 */
export function MiroWorkspaceBar(props: MiroWorkspaceBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRoot = useRef<HTMLDivElement>(null);
  useDismissOnOutsideClick(menuRoot, menuOpen, () => setMenuOpen(false));
  const agency = props.role === "agency";
  const internal = props.channel === "internal";
  const shown = internal ? (props.round?.miro ?? props.board?.miro) : props.version?.miro;
  const ownBoard = props.board?.designerId === props.viewerId;
  return (
    <div className="project-header miro-bar">
      {props.back}
      <h1 className="miro-bar-title" title={props.title}>
        <span>{props.title}</span>
      </h1>
      {internal ? (
        <>
          {props.boards.length > 1 && (
            <select
              className="miro-bar-board"
              aria-label="Design board"
              value={props.board?.id ?? ""}
              onChange={(event) => props.onBoard(event.target.value)}
            >
              {props.boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </select>
          )}
          {props.board && props.rounds.length > 0 && (
            <div className="segmented-control" role="group" aria-label="Rounds">
              <button
                className={props.round ? "" : "active"}
                aria-pressed={!props.round}
                onClick={() => props.onRound(null)}
              >
                Board
              </button>
              {[...props.rounds].reverse().map((round) => (
                <button
                  key={round.id}
                  className={props.round?.id === round.id ? "active" : ""}
                  aria-pressed={props.round?.id === round.id}
                  aria-label={`Round ${round.number}`}
                  onClick={() => props.onRound(round.id)}
                >
                  R{round.number}
                </button>
              ))}
            </div>
          )}
          {props.round && <span className="miro-bar-status">{versionStatusLabel(props.round.status)}</span>}
        </>
      ) : (
        <>
          {props.shared.length > 0 && (
            <div className="segmented-control" role="group" aria-label="Client versions">
              {[...props.shared].reverse().map((version) => (
                <button
                  key={version.id}
                  className={props.version?.id === version.id ? "active" : ""}
                  aria-pressed={props.version?.id === version.id}
                  onClick={() => props.onVersion(version.id)}
                >
                  V{version.number}
                </button>
              ))}
            </div>
          )}
          {agency && (
            <button className="icon-button" aria-label="New client version" title="New client version" onClick={props.onAddVersion}>
              <Plus size={16} />
            </button>
          )}
          {props.version && <span className="miro-bar-status">{versionStatusLabel(props.version.status)}</span>}
          <span className="miro-bar-due">{props.dueLabel}</span>
        </>
      )}
      <div className="miro-bar-actions">
        {props.viewControl}
        {internal && props.board && props.role === "designer" && ownBoard && (
          <button className="button" onClick={props.onSendRound}>
            <Send size={13} aria-hidden="true" />
            Send to studio
          </button>
        )}
        {internal && agency && props.round && (
          <button className="button" onClick={props.onShareRound}>
            <Share2 size={13} aria-hidden="true" />
            Share with client
          </button>
        )}
        {internal && agency && (
          <button className="icon-button" aria-label="Add design board" title="Add design board" onClick={props.onAddBoard}>
            <Plus size={16} />
          </button>
        )}
        {shown && (
          <a className="button" href={miroBoardUrl(shown)} target="_blank" rel="noopener noreferrer">
            Open in Miro
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        )}
        <div className="miro-bar-menu" ref={menuRoot} onKeyDown={(event) => { if (event.key === "Escape") setMenuOpen(false); }}>
          <button className="icon-button" aria-label="More" title="More" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div className="miro-bar-popover">
              {agency && internal && props.board && (
                <button className="button quiet" onClick={() => { setMenuOpen(false); props.onEditBoard(); }}>
                  Edit board
                </button>
              )}
              {agency && !internal && props.version && (
                <button className="button quiet" onClick={() => { setMenuOpen(false); props.onEditLink(); }}>
                  Edit Miro link
                </button>
              )}
              {props.menu}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

`project-panel.tsx`: `export type ProjectPanelKind = "conversation" | "details" | "feedback";`

`project-tool-bar.tsx`: add the optional prop and the button after Conversation (import
`MessageSquareText` from lucide-react):

```tsx
      {feedback && (
        <button
          type="button"
          className={`icon-button ${feedback.open ? "selected" : ""}`}
          disabled={disabled}
          aria-label="Feedback"
          title="Feedback"
          aria-expanded={feedback.open}
          onClick={feedback.onToggle}
        >
          <MessageSquareText size={20} />
        </button>
      )}
```

Add `feedback?: { open: boolean; onToggle: () => void };` to the props type and destructuring.
Update the component comment to "the side panels (and, in the Miro workspace, Feedback)".

`projects.css`: after the `.miro-bar .segmented-control button` rule add:

```css
.miro-bar-board {
  flex-shrink: 1;
  min-width: 0;
  max-width: 220px;
  padding: 4px 28px 4px 10px;
  font-size: var(--text-xs);
}
.miro-workspace-empty {
  position: absolute;
  inset: var(--project-chrome-height) 0 0;
  display: grid;
  place-content: center;
  gap: 12px;
  padding: 24px;
  color: var(--muted);
  text-align: center;
}
```

- [ ] **Step 4: Run tests and gate**

Run: `cd apps/web && npx vitest run features/projects && npm run check`
Expected: PASS. The existing `miro-view.test.tsx` still passes, because `MiroView`'s iframe title
and src are unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/projects/miro-workspace-bar.tsx apps/web/features/projects/miro-workspace-bar.test.tsx apps/web/features/projects/miro-view.tsx apps/web/features/projects/project-tool-bar.tsx apps/web/features/projects/project-tool-bar.test.tsx apps/web/features/projects/project-panel.tsx apps/web/features/projects/projects.css
git commit -m "feat(projects): add the Miro workspace bar and Feedback tool"
```

---

### Task 7: The workspace on the project page

**Files:**
- Create: `apps/web/features/projects/project-workspace.tsx`
- Modify: `apps/web/features/projects/project-page.tsx`

**Interfaces:**
- Consumes: everything above; `useProjectDetail`, `useDesignBoards`, `CanvasHeader`,
  `ProjectToolBar`, `ProjectPanel`, `CommentPanel`, `ProjectDetails`, `ProjectActionDialog`,
  `projectActionKey`, `MiroReviewBar`, `MiroEmbed`, `PlaygroundAssetStrip`, `PlaygroundBoard`,
  `useFoldSidebarWhile`, `useDateFormat`.
- Produces: `ProjectWorkspace({ projectId, channel, onChannel, data, boards, viewControl }: ProjectWorkspaceProps)`.

- [ ] **Step 1: Implement `project-workspace.tsx`**

```tsx
"use client";

import Link from "next/link";
import { ArrowLeft, Lightbulb } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useClients, useDateFormat } from "@/features/workspace/workspace-data";
import { useFoldSidebarWhile } from "@/features/workspace/app-shell";
import { CanvasHeader } from "@/features/workspace/canvas-header";
import { PlaygroundBoard } from "@/features/playground/playground-board";
import { PlaygroundAssetStrip } from "@/features/playground/playground-asset-strip";
import { ProjectCreditsChip } from "@/features/credits/project-credits-chip";
import { CommentPanel } from "./comment-panel";
import { ProjectDetails } from "./project-details";
import { ProjectPanel, type ProjectPanelKind } from "./project-panel";
import { ProjectToolBar } from "./project-tool-bar";
import { ProjectActionDialog, projectActionKey, type ProjectAction } from "./project-action-dialog";
import { MiroEmbed, MiroReviewBar } from "./miro-view";
import { MiroWorkspaceBar } from "./miro-workspace-bar";
import { boardRounds, canReviewShared, latestSharedLink, pickById, sharedVersions } from "./miro-workspace";
import type { DesignBoard, ProjectChannel, useProjectDetail } from "./project-data";

type ProjectData = NonNullable<ReturnType<typeof useProjectDetail>["data"]>;

/**
 * The project in the Miro workspace: the board, round or client version on Miro, with the
 * product's own controls around it. Replaces the Versions canvas for a channel that uses the
 * workspace (`usesWorkspace`); the legacy canvas stays in `project-page.tsx`.
 */
export function ProjectWorkspace({
  projectId,
  channel,
  onChannel,
  data,
  boards,
  viewControl,
}: {
  projectId: string;
  channel: ProjectChannel;
  onChannel: (channel: ProjectChannel) => void;
  data: ProjectData;
  boards: DesignBoard[];
  viewControl: ReactNode;
}) {
  const { profile } = useAuth();
  const clients = useClients();
  const { formatDate } = useDateFormat();
  const role = profile?.role ?? "client";
  const { project, versions, deliverables } = data;
  const [boardId, setBoardId] = useState<string | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [panel, setPanel] = useState<ProjectPanelKind | null>(null);
  const [action, setAction] = useState<ProjectAction | null>(null);
  const [assetStripOpen, setAssetStripOpen] = useState(false);
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [chrome, setChrome] = useState<HTMLDivElement | null>(null);
  const [chromeHeight, setChromeHeight] = useState(0);
  const playgroundTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!chrome) return;
    const observer = new ResizeObserver(() => setChromeHeight(chrome.offsetHeight + chrome.offsetTop));
    observer.observe(chrome);
    return () => observer.disconnect();
  }, [chrome]);

  const board = pickById(boards, boardId);
  const rounds = board ? boardRounds(versions, board.id) : [];
  const round = roundId ? (rounds.find((item) => item.id === roundId) ?? null) : null;
  const shared = sharedVersions(versions);
  const version = pickById(shared, versionId);
  const internal = channel === "internal";
  const shownLink = internal ? (round?.miro ?? board?.miro ?? null) : (version?.miro ?? null);
  const feedbackTarget = internal ? round : version;
  useFoldSidebarWhile(!!shownLink);

  const back = (
    <Link className="icon-button" href={`/clients/${project.client_id}/board`} aria-label="Back to board" title="Back to board">
      <ArrowLeft size={17} />
    </Link>
  );
  const channelControl = role === "agency" && (
    <div className="segmented-control" role="group" aria-label="Project channel">
      {(["internal", "client"] as const).map((option) => (
        <button
          key={option}
          className={channel === option ? "active" : ""}
          aria-pressed={channel === option}
          onClick={() => {
            setPanel(null);
            onChannel(option);
          }}
        >
          {option === "internal" ? "Working files" : "Shared with client"}
        </button>
      ))}
    </div>
  );
  const empty = internal
    ? role === "agency"
      ? { text: "No design board yet.", action: "Add a design board", onClick: () => setAction({ kind: "board", projectId }) }
      : { text: "The studio has not set up your board yet." }
    : role === "agency"
      ? { text: "Nothing shared yet. Share a round or add a version.", action: "New client version", onClick: () => setAction({ kind: "share", projectId, round: null, prefill: null }) }
      : { text: "Nothing shared yet. Your studio will share designs here." };

  return (
    <div className="project-page" style={{ "--project-chrome-height": `${chromeHeight}px` } as CSSProperties}>
      <div className="project-chrome" ref={setChrome}>
        {(() => {
          const client = clients.data?.find((item) => item.id === project.client_id);
          return client ? <CanvasHeader client={client} viewer={profile} /> : null;
        })()}
        <MiroWorkspaceBar
          back={back}
          title={project.title}
          channel={channel}
          role={role}
          viewerId={profile?.id ?? ""}
          dueLabel={project.due_date ? `Due ${formatDate(project.due_date)}` : "No due date"}
          boards={boards}
          board={board}
          rounds={rounds}
          round={round}
          shared={shared}
          version={version}
          onBoard={(id) => { setBoardId(id); setRoundId(null); }}
          onRound={setRoundId}
          onVersion={setVersionId}
          onAddBoard={() => setAction({ kind: "board", projectId })}
          onEditBoard={() => board && setAction({ kind: "board", projectId, board })}
          onSendRound={() => board && setAction({ kind: "round", board })}
          onShareRound={() => round && setAction({ kind: "share", projectId, round, prefill: null })}
          onAddVersion={() => setAction({ kind: "share", projectId, round: null, prefill: latestSharedLink(shared) })}
          onEditLink={() => version && setAction({ kind: "miro", version, channel: "client" })}
          viewControl={viewControl}
          menu={
            <>
              <ProjectCreditsChip projectId={projectId} viewer={profile} />
              {channelControl}
            </>
          }
        />
      </div>
      <div className="project-workspace">
        <div className="project-workspace-content" inert={playgroundOpen}>
          <div className="project-body">
            <div className="project-canvas">
              <ProjectToolBar
                panel={panel}
                onPanel={(next) => { setAssetStripOpen(false); setPanel(next); }}
                disabled={playgroundOpen}
                feedback={feedbackTarget ? { open: panel === "feedback", onToggle: () => setPanel(panel === "feedback" ? null : "feedback") } : undefined}
              >
                <button
                  className="icon-button"
                  ref={playgroundTrigger}
                  title="Playground"
                  aria-label="Playground"
                  aria-expanded={assetStripOpen}
                  disabled={playgroundOpen}
                  onClick={() => { setPanel(null); setAssetStripOpen((open) => !open); }}
                >
                  <Lightbulb size={18} />
                </button>
              </ProjectToolBar>
              {!internal && version && canReviewShared(version, shared, role, project.status) && (
                <MiroReviewBar
                  label={`V${version.number}`}
                  onDecide={(decision) => setAction({ kind: "review", version, decision })}
                />
              )}
              {shownLink ? (
                <MiroEmbed
                  title={internal ? `Miro board ${board?.name ?? ""}${round ? ` · Round ${round.number}` : ""}` : `Miro board · V${version?.number}`}
                  link={shownLink}
                  frameKey={internal ? `${board?.id}:${round?.id ?? "board"}` : (version?.id ?? "none")}
                  strip={
                    assetStripOpen ? (
                      <PlaygroundAssetStrip
                        clientId={project.client_id}
                        projectId={projectId}
                        onOpenPlayground={() => { setAssetStripOpen(false); setPlaygroundOpen(true); }}
                      />
                    ) : undefined
                  }
                />
              ) : (
                <div className="miro-workspace-empty">
                  <p>{empty.text}</p>
                  {"action" in empty && empty.action && (
                    <button className="button primary" onClick={empty.onClick}>
                      {empty.action}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {!playgroundOpen && panel && (
          <ProjectPanel key={panel} onClose={() => setPanel(null)}>
            {panel === "conversation" && <CommentPanel key={channel} projectId={projectId} channel={channel} onClose={() => setPanel(null)} />}
            {panel === "details" && <ProjectDetails project={project} deliverables={deliverables} versions={versions} onClose={() => setPanel(null)} />}
            {panel === "feedback" && feedbackTarget && (
              <CommentPanel
                key={`${channel}:${feedbackTarget.id}`}
                projectId={projectId}
                channel={channel}
                versionId={feedbackTarget.id}
                heading="Feedback"
                onClose={() => setPanel(null)}
              />
            )}
          </ProjectPanel>
        )}
        {playgroundOpen && (
          <PlaygroundBoard clientId={project.client_id} projectId={projectId} onClose={() => setPlaygroundOpen(false)} returnLabel="Back to project" />
        )}
      </div>
      <ProjectActionDialog
        key={projectActionKey(action)}
        action={action}
        projectId={projectId}
        suspended={false}
        onOpenPlayground={() => setPlaygroundOpen(true)}
        onClose={() => setAction(null)}
      />
    </div>
  );
}
```

While implementing, check each borrowed import path against `project-header.tsx` and
`project-page.tsx`:
- `CanvasHeader` from `@/features/workspace/canvas-header`;
- `ProjectCreditsChip` from `@/features/credits/project-credits-chip`;
- `useFoldSidebarWhile` from `@/features/workspace/app-shell`.

Use exactly the paths those files use. If `ProjectPanel`'s `onClose` is also used for focus
return in `project-page.tsx`, keep this simpler version: the workspace has no canvas trigger to
refocus.

- [ ] **Step 2: Switch the page**

In `project-page.tsx`, directly after `const data = useProjectDetail(projectId, channel);`:

```tsx
  const boards = useDesignBoards(projectId, profile?.role !== "client" && channel === "internal");
```

After the loading and error early returns (both must also wait for `boards.isPending` when that
query is enabled; add `|| (boards.fetchStatus !== "idle" && boards.isPending)` to the loading
condition), before `const { project, versions, designs, deliverables } = data.data;`:

First declare the state at the top of `ProjectPage`, with the other `useState` calls (hooks cannot
follow the early returns):

```tsx
  // The agency may step back to the Versions canvas on a project that still has legacy versions.
  const [legacyChosen, setLegacyChosen] = useState(false);
```

Then, after the early returns:

```tsx
  const workspace = usesWorkspace(channel, { versions: data.data.versions, boards: boards.data ?? [] });
  const legacyAvailable = data.data.versions.some((version) => version.deliverableId !== null);
```

Then:

```tsx
  if (workspace && !legacyChosen)
    return (
      <ProjectWorkspace
        projectId={projectId}
        channel={channel}
        onChannel={setAgencyChannel}
        data={data.data}
        boards={boards.data ?? []}
        viewControl={
          profile?.role === "agency" && legacyAvailable ? (
            <button className="button quiet" onClick={() => setLegacyChosen(true)}>
              Versions
            </button>
          ) : null
        }
      />
    );
```

In the legacy header's `viewControl` for the agency, when `usesWorkspace` is true, add a way back:
a `"Miro workspace"` quiet button calling `setLegacyChosen(false)`. Pass it into `ProjectHeader`
through a new optional `workspaceControl?: ReactNode` prop rendered next to `viewControl` in both
branches of `project-header.tsx`. Add the imports `useDesignBoards`, `usesWorkspace` and
`ProjectWorkspace`.

- [ ] **Step 3: Run the gate and the existing project e2e specs**

Run: `cd apps/web && npm run check`. Then run:
`npx playwright test tests/e2e/miro-version-links.spec.ts tests/e2e/project-feedback.spec.ts tests/e2e/production-workflow.spec.ts --output ../../outputs/pw-workspace --reporter=line`
Expected: PASS. Those projects have per-deliverable versions, so each channel stays on the legacy
body. A failure here means `usesWorkspace` is wrong for a legacy project. Fix the rule, not the
test.

- [ ] **Step 4: Commit**

```bash
git add apps/web/features/projects/project-workspace.tsx apps/web/features/projects/project-page.tsx apps/web/features/projects/project-header.tsx
git commit -m "feat(projects): open projects in the Miro workspace"
```

---

### Task 8: End-to-end round trip and privacy

**Files:**
- Modify: `apps/web/tests/e2e/project-fixture.ts` (cleanup)
- Create: `apps/web/tests/e2e/miro-workspace.spec.ts`

**Interfaces:**
- Consumes: `createProductionFixture`, `cleanupTestProject`, `credentials`, `signIn`,
  `localAgency`, `localCaller`, `localAdmin` from `./test-support` and `./project-fixture`.

- [ ] **Step 1: Extend cleanup**

In `cleanupTestProject`'s SQL, before `delete from public.design_versions …`, add:

```sql
delete from private.miro_share_requests where project_id in (select id from acceptance_target);
delete from public.publication_miro_links where project_id in (select id from acceptance_target);
delete from public.design_version_miro_links where project_id in (select id from acceptance_target);
```

After `delete from public.design_versions …`, add:
`delete from public.design_boards where project_id in (select id from acceptance_target);`
(`session_replication_role=replica` disables FK cascades, so every child is deleted explicitly.)

- [ ] **Step 2: Write the spec**

```ts
import { expect, test } from "@playwright/test";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";
import { credentials, localAdmin, localAgency, localCaller, signIn } from "./test-support";

// One acceptance project in SABRE with no versions, so both channels open on the Miro workspace.
// Designer A (the fixture's designer) owns a board; designer2 is also assigned, with a board of
// their own, and must never see anything of designer A's.
test.describe.configure({ mode: "serial" });
let projectId = "";
let designerA = "";
let designerB = "";

test.beforeAll(async () => {
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency, [
    { name: "Campaign square", format: "square", width: 1080, height: 1080 },
  ]);
  projectId = fixture.projectId;
  designerA = fixture.designerId;
  const second = await localAdmin.from("profiles").select("id").eq("role", "designer").neq("id", designerA).order("display_name").limit(1).single();
  designerB = second.data!.id;
  const assigned = await agency.rpc("assign_designer", { p_project_id: projectId, p_designer_id: designerB });
  expect(assigned.error).toBeNull();
  const boardB = await agency.rpc("create_design_board", {
    p_project_id: projectId,
    p_name: "Board for B",
    p_url: "https://miro.com/app/board/uXjVBoardB1=/",
    p_designer_id: designerB,
  });
  expect(boardB.error).toBeNull();
});

test.afterAll(async () => {
  if (projectId) await cleanupTestProject(projectId);
});

test("agency, designer and client complete a round trip in Miro", async ({ browser }) => {
  test.setTimeout(120_000);
  const studio = await (await browser.newContext()).newPage();
  await signIn(studio, credentials.agency);
  await studio.goto(`/projects/${projectId}`);
  // Working files has B's board; add A's.
  await studio.getByRole("button", { name: "Add design board" }).click();
  await studio.getByLabel("Board name").fill("Direction A");
  await studio.getByLabel("Miro board").fill("https://miro.com/app/board/uXjVBoardA1=/");
  const designerSelect = studio.getByLabel("Designer");
  await designerSelect.selectOption(designerA);
  await studio.getByRole("button", { name: "Add board" }).click();
  await expect(studio.getByRole("combobox", { name: "Design board" })).toHaveValue(/.+/);

  // The designer sends a round of their board.
  const designer = await (await browser.newContext()).newPage();
  const designerEmail = (await localAdmin.auth.admin.getUserById(designerA)).data.user!.email!;
  await signIn(designer, designerEmail);
  await designer.goto(`/projects/${projectId}`);
  // The designer has one board, so there is no picker.
  await expect(designer.getByRole("combobox", { name: "Design board" })).toHaveCount(0);
  await designer.getByRole("button", { name: "Send to studio" }).click();
  await designer.getByLabel("Note for the studio").fill("Ready for a look");
  await designer.getByRole("dialog").getByRole("button", { name: "Send to studio" }).click();
  await expect(designer.getByRole("group", { name: "Rounds" })).toContainText("R1");

  // The agency shares round 1 with a client link.
  await studio.reload();
  await studio.getByRole("combobox", { name: "Design board" }).selectOption({ label: "Direction A" });
  await studio.getByRole("button", { name: "Round 1" }).click();
  await studio.getByRole("button", { name: "Share with client" }).click();
  await studio.getByLabel("Client Miro board").fill("https://miro.com/app/board/uXjVClient1=/?moveToWidget=5");
  await studio.getByLabel("Note for the client").fill("First look");
  await studio.getByRole("dialog").getByRole("button", { name: "Share with client" }).click();
  await expect(studio.getByRole("dialog")).toHaveCount(0);

  // The client requests changes, the agency adds V2 directly, the client approves.
  const client = await (await browser.newContext()).newPage();
  await signIn(client, credentials.client);
  await client.goto(`/projects/${projectId}`);
  await expect(client.getByRole("group", { name: "Client versions" })).toContainText("V1");
  await expect(client.locator("iframe.miro-view-frame")).toHaveAttribute("src", /uXjVClient1/);
  await expect(client.locator('iframe[src*="uXjVBoardA1"]')).toHaveCount(0);
  await client.getByRole("button", { name: "Request changes" }).click();
  await client.getByRole("dialog").getByRole("textbox").fill("Warmer tones");
  await client.getByRole("dialog").getByRole("button", { name: /Request changes|Send/ }).click();
  await expect(client.getByRole("dialog")).toHaveCount(0);

  await studio.getByRole("button", { name: "More" }).click();
  await studio.getByRole("button", { name: "Shared with client" }).click();
  await studio.getByRole("button", { name: "New client version" }).click();
  await expect(studio.getByLabel("Client Miro board")).toHaveValue(/uXjVClient1/);
  await studio.getByLabel("Note for the client").fill("Warmer tones applied");
  await studio.getByRole("dialog").getByRole("button", { name: "Share with client" }).click();
  await expect(studio.getByRole("group", { name: "Client versions" })).toContainText("V2");

  await client.reload();
  await client.getByRole("button", { name: "Approve" }).click();
  await client.getByRole("dialog").getByRole("button", { name: /Approve/ }).click();
  await expect
    .poll(async () => (await localAdmin.from("projects").select("status").eq("id", projectId).single()).data?.status)
    .toBe("approved");
});

test("a designer never sees another designer's board, rounds or comments", async ({ page }) => {
  const designerBClient = await localCaller(credentials.designer2);
  const boards = await designerBClient.from("design_boards").select("name").eq("project_id", projectId);
  expect(boards.data?.map((board) => board.name)).toEqual(["Board for B"]);
  const rounds = await designerBClient.from("design_versions").select("id").eq("project_id", projectId).not("board_id", "is", null);
  expect(rounds.data).toEqual([]);
  const comments = await designerBClient.from("internal_comments").select("author_id").eq("project_id", projectId);
  expect((comments.data ?? []).some((comment) => comment.author_id === designerA)).toBe(false);
  await signIn(page, credentials.designer2);
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByText("Direction A")).toHaveCount(0);
  await expect(page.locator("iframe.miro-view-frame")).toHaveAttribute("src", /uXjVBoardB1/);
});
```

Two points to settle while writing the spec:
- **Which account is designer B.** `credentials.designer2` must be the second designer
  `createProductionFixture` did not pick. Check with `localAdmin.from("profiles")` ordering. If
  `designer2@dawes.local` is designer A instead, swap the roles: assign `credentials.designer`'s
  profile as B and sign designer A in with `designer2`.
- **The review dialog.** Read `project-action-review.tsx` to find its textbox label and submit
  button names. Replace the `/Request changes|Send/` and `/Approve/` regexes with the exact names.

- [ ] **Step 3: Run the spec**

Run: `cd apps/web && npx playwright test tests/e2e/miro-workspace.spec.ts --output ../../outputs/pw-workspace --reporter=line`
Expected: 2 passed. Take one screenshot per role in Working files and Shared with client into
`../../outputs/`. Read them for the visual audit: alignment, spacing, and no designer name on
another designer's or the client's screens.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/e2e/project-fixture.ts apps/web/tests/e2e/miro-workspace.spec.ts
git commit -m "test(e2e): cover the Miro workspace round trip and designer privacy"
```

---

### Task 9: Documentation and handoff

**Files:**
- Modify: `apps/web/features/projects/README.md`, `docs/architecture/backend.md`,
  `docs/architecture/data-access.md` (only if it lists RPCs or hooks by name),
  `docs/engineering/handoff.md`

- [ ] **Step 1: Update docs**

- `features/projects/README.md`: add a "Miro workspace" section. It covers boards, rounds, shared
  versions, which roles see what, the per-channel `usesWorkspace` rule, the dialogs, the Feedback
  panel, the agency's Versions escape hatch, and designer privacy. Point to the spec.
- `docs/architecture/backend.md`: document `design_boards`, the round and project-level version
  columns, the five RPCs, `private.miro_share_requests`, the privacy helpers and trigger, and the
  `review_publication` change.
- `docs/engineering/handoff.md`: add one "Done" entry, with commits, and the next action. Keep the
  file ≤ 100 lines by moving the oldest "Done" paragraph to `docs/engineering/history/handoff-2026-09-26.md`.
- Verify each path and command you mention exists (`ls`, `grep`).

- [ ] **Step 2: Final gate**

Run: `supabase test db` from the repo root, then `cd apps/web && npm run check`, then
`npx playwright test tests/e2e/miro-workspace.spec.ts tests/e2e/miro-version-links.spec.ts --output ../../outputs/pw-workspace --reporter=line`.
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/features/projects/README.md docs/architecture/backend.md docs/engineering/handoff.md docs/engineering/history/handoff-2026-09-26.md
# plus docs/architecture/data-access.md if changed
git commit -m "docs: document the Miro workspace"
```

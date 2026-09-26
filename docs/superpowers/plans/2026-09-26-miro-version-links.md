# Miro Version Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the agency attach a Miro frame link to each project version (a client board on published versions, an internal board on internal versions) and let the right audience open it in a full-screen panel inside the project.

**Architecture:** Two new tables, one per channel, read under the same RLS rule as the versions they annotate and written only through agency RPCs that parse the URL in the database. The project detail read attaches each version's link; the version card shows **View on Miro** and, for the agency, a link action that opens a small dialog. The Playground's full-screen top-layer lifecycle moves to `features/shared/` and backs both Playground and the new Miro panel.

**Tech Stack:** Supabase Postgres (plpgsql, RLS, pgTAP), Next.js 16 App Router, React 19, TanStack Query 5, xyflow 12, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-26-miro-version-links-design.md`

## Global Constraints

- All code, identifiers, copy, comments, tests and docs in English.
- Only the agency writes links (`private.assert_agency()`); client links read under `private.can_client_channel(project_id)`, internal links under `private.can_produce(project_id)`.
- `publish_version`, `published_versions` and `published_designs` are not modified.
- The raw pasted URL is never stored and never used as an iframe `src`; embed and open URLs are built from `board_id` / `widget_id`.
- Accepted URL: `https://miro.com/app/board/<boardId>/` (optionally `www.`), optional query containing `moveToWidget=<digits>`; anything else raises `22023`.
- A client link prefills only from an earlier publication of the same deliverable; an internal link only from an earlier internal version of the same deliverable. Never across channels.
- Supabase queries live only in `features/projects/project-data.ts`; the shared layer lives in `features/shared/` because it has two consumers.
- Migration number after `202609250003`: use `202609260001`.
- Regenerate `supabase/database.types.ts` with `npm run db:types` (stdout only) so the other session's columns stay.
- Never reset or re-seed Supabase; never restart the dev server on `:3003`. Stage explicit paths only.
- Do not edit `docs/architecture/*`, the settings/team/briefings/reviews/workspace READMEs or `docs/engineering/handoff.md` until the client-team session releases them (message it first).

## Review Focus

1. A pasted frame link with extra query values (`?share_link_id=…&moveToWidget=…`) or a URL-encoded board id (`%3D`) is accepted and yields the same board and frame. Pinned in Task 1 (pgTAP) and Task 2 (unit).
2. A publish whose link save fails leaves the version shared, says so, and the same Share button retries only the link (publish is idempotent without a key). Pinned in Task 6.
3. An invalid link in the publish dialog is refused before anything is published. Pinned in Task 6.
4. Saving the Miro dialog with an empty field removes the link rather than erroring. Pinned in Task 6.
5. The agency on the client channel manages the publication link, and on the internal channel the internal link — never the other. Pinned in Task 3 (`setMiroLink` routes by channel) and Task 6.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/202609260001_miro_version_links.sql` (create) | Tables, RLS, URL parser, four agency RPCs |
| `supabase/tests/database/miro_version_links.test.sql` (create) | Read isolation, write authority, URL rules |
| `supabase/database.types.ts` (regenerate) | Generated types |
| `apps/web/features/projects/miro-links.ts` (create) | Pure parse / build helpers, `MiroLink` type |
| `apps/web/features/projects/miro-links.test.ts` (create) | Unit tests for the helpers |
| `apps/web/features/projects/project-data.ts` (modify) | Links on `CanvasVersion`, `useLatestMiroLink`, `setMiroLink`, `clearMiroLink`, `publishVersion` returns the id |
| `apps/web/features/projects/canvas-versions.test.ts`, `project-data.test.ts` (modify) | Tests for the above |
| `apps/web/features/shared/use-fullscreen-layer.ts` (create, moved) | Top-layer dialog open/close lifecycle |
| `apps/web/features/playground/use-playground-close-lifecycle.ts` (delete) | Replaced by the shared hook |
| `apps/web/app/globals.css`, `apps/web/features/playground/playground.css` (modify) | `.fullscreen-layer` moves to globals |
| `apps/web/features/projects/miro-board-panel.tsx` (+ test) (create) | Full-screen Miro panel |
| `apps/web/next.config.ts`, `apps/web/lib/next-config.test.ts` (modify) | `frame-src https://miro.com` |
| `apps/web/features/projects/project-action-dialog.tsx` (+ test) (modify) | Publish field, `miro` action |
| `apps/web/features/projects/project-nodes.tsx`, `project-page.tsx`, `projects.css` (modify) | Button, menu entry, panel state |
| `apps/web/tests/e2e/miro-version-links.spec.ts` (create) | Role flows in the browser |
| READMEs (modify) | Projects, Playground, shared |

---

### Task 1: Database tables, parser and RPCs

**Files:**
- Create: `supabase/migrations/202609260001_miro_version_links.sql`
- Create: `supabase/tests/database/miro_version_links.test.sql`
- Regenerate: `supabase/database.types.ts`

**Interfaces:**
- Produces: tables `public.publication_miro_links(publication_id, project_id, board_id, widget_id, updated_by, updated_at)` and `public.design_version_miro_links(version_id, project_id, board_id, widget_id, updated_by, updated_at)`; RPCs `set_publication_miro_link(p_publication_id uuid, p_url text) returns void`, `clear_publication_miro_link(p_publication_id uuid) returns void`, `set_version_miro_link(p_version_id uuid, p_url text) returns void`, `clear_version_miro_link(p_version_id uuid) returns void`.

- [ ] **Step 1: Write the failing pgTAP test**

`supabase/tests/database/miro_version_links.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- One rolled-back transaction over the seeded SABRE landing page: its publication, its V2
-- internal version, the designer assigned to it, and a designer who is not.
create temporary table miro_context(key text primary key,value uuid);
grant all on miro_context to authenticated;
insert into miro_context values
  ('agency',md5('dawes:agency')::uuid),
  ('client',md5('dawes:client-8')::uuid),
  ('project',md5('dawes:project-sabre-campaign-landing-page')::uuid),
  ('publication',md5('dawes:publication-sabre-campaign-landing-page')::uuid),
  ('version',md5('dawes:version-sabre-campaign-landing-page-2')::uuid);
insert into miro_context
  select 'assigned',designer_id from public.project_assignments
  where project_id=md5('dawes:project-sabre-campaign-landing-page')::uuid limit 1;
insert into miro_context
  select 'outsider',p.id from public.profiles p
  where p.role='designer' and p.removed_at is null and not exists(
    select 1 from public.project_assignments a
    where a.designer_id=p.id and a.project_id=md5('dawes:project-sabre-campaign-landing-page')::uuid)
  limit 1;
create function pg_temp.context(p_key text) returns uuid language sql as $$
  select value from miro_context where key=p_key
$$;
create function pg_temp.act_as(p_key text) returns text language sql as $$
  select set_config('request.jwt.claim.sub',pg_temp.context(p_key)::text,true)
$$;

select has_table('public','publication_miro_links','Client-board links have their own table');
select has_table('public','design_version_miro_links','Internal-board links have their own table');
select is((select count(*)::int from miro_context where value is not null),7,'Every fixture role resolved');

-- The parser.
select is((select board_id from private.parse_miro_board_url('https://miro.com/app/board/uXjVKabc123=/')),
  'uXjVKabc123=','A board link yields its board');
select is((select widget_id from private.parse_miro_board_url('https://miro.com/app/board/uXjVKabc123=/')),
  null,'A board link has no frame');
select is((select widget_id from private.parse_miro_board_url(
  'https://miro.com/app/board/uXjVKabc123=/?share_link_id=42&moveToWidget=3458764512345678901&cot=14')),
  '3458764512345678901','A frame link among other query values yields its frame');
select is((select board_id from private.parse_miro_board_url('https://www.miro.com/app/board/uXjVKabc123%3D/')),
  'uXjVKabc123=','An encoded board id is decoded');
select throws_ok($$select private.parse_miro_board_url('http://miro.com/app/board/uXjVKabc123=/')$$,
  '22023',null,'Plain HTTP is refused');
select throws_ok($$select private.parse_miro_board_url('https://evil.example/app/board/uXjVKabc123=/')$$,
  '22023',null,'Another host is refused');
select throws_ok($$select private.parse_miro_board_url('https://miro.com.evil.example/app/board/uXjVKabc123=/')$$,
  '22023',null,'A look-alike host is refused');
select throws_ok($$select private.parse_miro_board_url('https://miro.com/app/board/uXjVKabc123=/?moveToWidget=abc')$$,
  '22023',null,'A non-numeric frame id is refused');
select throws_ok($$select private.parse_miro_board_url(null)$$,'22023',null,'An empty link is refused');

-- Writes: the agency only.
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.set_publication_miro_link(pg_temp.context('publication'),
  'https://miro.com/app/board/uXjVClient01=/?moveToWidget=111')$$,'The agency links a publication');
select lives_ok($$select public.set_publication_miro_link(pg_temp.context('publication'),
  'https://miro.com/app/board/uXjVClient01=/?moveToWidget=222')$$,'Setting again replaces the link');
select lives_ok($$select public.set_version_miro_link(pg_temp.context('version'),
  'https://miro.com/app/board/uXjVStudio1=/?moveToWidget=333')$$,'The agency links an internal version');
select is((select count(*)::int from public.publication_miro_links where publication_id=pg_temp.context('publication')),
  1,'One row per publication');
select is((select widget_id from public.publication_miro_links where publication_id=pg_temp.context('publication')),
  '222','The latest link wins');
reset role;

select pg_temp.act_as('client');
set local role authenticated;
select is((select board_id from public.publication_miro_links where publication_id=pg_temp.context('publication')),
  'uXjVClient01=','The client reads its client-board link');
select is((select count(*)::int from public.design_version_miro_links),0,'The client never reads internal links');
select throws_ok($$select public.set_publication_miro_link(pg_temp.context('publication'),
  'https://miro.com/app/board/uXjVClient01=/')$$,'42501',null,'The client cannot set a link');
select throws_ok($$select public.clear_publication_miro_link(pg_temp.context('publication'))$$,
  '42501',null,'The client cannot clear a link');
select throws_ok($$insert into public.publication_miro_links(publication_id,project_id,board_id,updated_by)
  values(pg_temp.context('publication'),pg_temp.context('project'),'uXjVForged1=',pg_temp.context('client'))$$,
  '42501',null,'Nobody writes the table directly');
reset role;

select pg_temp.act_as('assigned');
set local role authenticated;
select is((select board_id from public.design_version_miro_links where version_id=pg_temp.context('version')),
  'uXjVStudio1=','An assigned designer reads the internal link');
select is((select count(*)::int from public.publication_miro_links),0,'A designer never reads client links');
select throws_ok($$select public.set_version_miro_link(pg_temp.context('version'),
  'https://miro.com/app/board/uXjVStudio1=/')$$,'42501',null,'A designer cannot set a link');
reset role;

select pg_temp.act_as('outsider');
set local role authenticated;
select is((select count(*)::int from public.design_version_miro_links),0,'An unassigned designer reads no internal link');
reset role;

-- Clearing, and clearing twice.
select pg_temp.act_as('agency');
set local role authenticated;
select lives_ok($$select public.clear_publication_miro_link(pg_temp.context('publication'))$$,'The agency clears a link');
select lives_ok($$select public.clear_publication_miro_link(pg_temp.context('publication'))$$,'Clearing a missing link is not an error');
select lives_ok($$select public.clear_version_miro_link(pg_temp.context('version'))$$,'The agency clears an internal link');
select is((select count(*)::int from public.publication_miro_links where publication_id=pg_temp.context('publication')),
  0,'The publication link is gone');
select throws_ok($$select public.set_version_miro_link(gen_random_uuid(),'https://miro.com/app/board/uXjVStudio1=/')$$,
  'P0002',null,'An unknown version is reported');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run db:test -- supabase/tests/database/miro_version_links.test.sql`
Expected: FAIL (`has_table` false, then errors for the missing functions).

- [ ] **Step 3: Write the migration**

`supabase/migrations/202609260001_miro_version_links.sql`:

```sql
-- Miro frame links on versions. One table per channel, so the client board and the internal board
-- never meet under one filter: each reads under the same rule as the versions it annotates, and
-- neither touches the immutable publication snapshot. Only the agency writes, through the RPCs
-- below, which parse the pasted URL here so no raw URL is stored.
create table public.publication_miro_links (
  publication_id uuid primary key,
  project_id uuid not null,
  board_id text not null check (board_id ~ '^[A-Za-z0-9_=-]{6,64}$'),
  widget_id text check (widget_id ~ '^[0-9]{1,32}$'),
  updated_by uuid not null references public.profiles,
  updated_at timestamptz not null default now(),
  foreign key (publication_id, project_id)
    references public.published_versions (id, project_id) on delete cascade
);
create index publication_miro_links_project on public.publication_miro_links(project_id);

create table public.design_version_miro_links (
  version_id uuid primary key,
  project_id uuid not null,
  board_id text not null check (board_id ~ '^[A-Za-z0-9_=-]{6,64}$'),
  widget_id text check (widget_id ~ '^[0-9]{1,32}$'),
  updated_by uuid not null references public.profiles,
  updated_at timestamptz not null default now(),
  foreign key (version_id, project_id)
    references public.design_versions (id, project_id) on delete cascade
);
create index design_version_miro_links_project on public.design_version_miro_links(project_id);

alter table public.publication_miro_links enable row level security;
alter table public.design_version_miro_links enable row level security;
create policy publication_miro_links_read on public.publication_miro_links
  for select to authenticated using (private.can_client_channel(project_id));
create policy design_version_miro_links_read on public.design_version_miro_links
  for select to authenticated using (private.can_produce(project_id));
revoke all on public.publication_miro_links, public.design_version_miro_links from public, anon, authenticated;
grant select on public.publication_miro_links, public.design_version_miro_links to authenticated;
grant all on public.publication_miro_links, public.design_version_miro_links to service_role;

-- `https://miro.com/app/board/<board>/` with an optional query that may carry
-- `moveToWidget=<frame>`. Miro board ids often end in `=`, which some copies encode as `%3D`.
create function private.parse_miro_board_url(p_url text, out board_id text, out widget_id text)
language plpgsql immutable set search_path='' as $$
declare parts text[];
begin
  parts := regexp_match(btrim(coalesce(p_url, '')),
    '^https://(?:www\.)?miro\.com/app/board/([A-Za-z0-9_=%-]{6,80})/?(\?[^#[:space:]]*)?(#[^[:space:]]*)?$');
  if parts is null then
    raise exception 'Paste a Miro board or frame link (https://miro.com/app/board/…)' using errcode = '22023';
  end if;
  board_id := replace(parts[1], '%3D', '=');
  if board_id !~ '^[A-Za-z0-9_=-]{6,64}$' then
    raise exception 'This Miro board link is not valid' using errcode = '22023';
  end if;
  widget_id := (regexp_match(coalesce(parts[2], ''), '[?&]moveToWidget=([^&]*)'))[1];
  if widget_id is not null and widget_id !~ '^[0-9]{1,32}$' then
    raise exception 'This Miro frame link is not valid' using errcode = '22023';
  end if;
end $$;

create function public.set_publication_miro_link(p_publication_id uuid, p_url text) returns void
language plpgsql security definer set search_path='' as $$
declare v_project uuid; v_board text; v_widget text;
begin
  perform private.assert_agency();
  select project_id into v_project from public.published_versions where id = p_publication_id;
  if not found then raise exception 'Publication not found' using errcode = 'P0002'; end if;
  select board_id, widget_id into v_board, v_widget from private.parse_miro_board_url(p_url);
  insert into public.publication_miro_links(publication_id, project_id, board_id, widget_id, updated_by)
  values (p_publication_id, v_project, v_board, v_widget, auth.uid())
  on conflict (publication_id) do update
    set board_id = excluded.board_id, widget_id = excluded.widget_id,
        updated_by = excluded.updated_by, updated_at = now();
  perform private.audit('publication.miro_link_set', v_project);
end $$;

create function public.clear_publication_miro_link(p_publication_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_project uuid;
begin
  perform private.assert_agency();
  delete from public.publication_miro_links where publication_id = p_publication_id
    returning project_id into v_project;
  if v_project is not null then perform private.audit('publication.miro_link_cleared', v_project); end if;
end $$;

create function public.set_version_miro_link(p_version_id uuid, p_url text) returns void
language plpgsql security definer set search_path='' as $$
declare v_project uuid; v_board text; v_widget text;
begin
  perform private.assert_agency();
  select project_id into v_project from public.design_versions where id = p_version_id;
  if not found then raise exception 'Version not found' using errcode = 'P0002'; end if;
  select board_id, widget_id into v_board, v_widget from private.parse_miro_board_url(p_url);
  insert into public.design_version_miro_links(version_id, project_id, board_id, widget_id, updated_by)
  values (p_version_id, v_project, v_board, v_widget, auth.uid())
  on conflict (version_id) do update
    set board_id = excluded.board_id, widget_id = excluded.widget_id,
        updated_by = excluded.updated_by, updated_at = now();
  perform private.audit('version.miro_link_set', v_project);
end $$;

create function public.clear_version_miro_link(p_version_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_project uuid;
begin
  perform private.assert_agency();
  delete from public.design_version_miro_links where version_id = p_version_id
    returning project_id into v_project;
  if v_project is not null then perform private.audit('version.miro_link_cleared', v_project); end if;
end $$;

revoke all on function private.parse_miro_board_url(text) from public, anon, authenticated;
revoke execute on function public.set_publication_miro_link(uuid, text), public.clear_publication_miro_link(uuid),
  public.set_version_miro_link(uuid, text), public.clear_version_miro_link(uuid) from public, anon;
grant execute on function public.set_publication_miro_link(uuid, text), public.clear_publication_miro_link(uuid),
  public.set_version_miro_link(uuid, text), public.clear_version_miro_link(uuid) to authenticated;
```

Before writing, confirm the helper signatures this relies on still hold on the live database:

```bash
docker exec supabase_db_dawes-studios psql -U postgres -Atc "select pg_get_function_identity_arguments('private.audit'::regproc), pg_get_function_identity_arguments('private.can_produce'::regproc), pg_get_function_identity_arguments('private.can_client_channel'::regproc)"
```

Expected: `action text, target uuid` (or equivalent two arguments), `target_project uuid`, `target_project uuid`. If `private.audit` takes different arguments, match the live signature.

- [ ] **Step 4: Apply the migration without resetting**

Run: `docker exec -i supabase_db_dawes-studios psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/202609260001_miro_version_links.sql && docker exec supabase_db_dawes-studios psql -U postgres -c "insert into supabase_migrations.schema_migrations(version,name) values ('202609260001','miro_version_links')"`
Expected: `CREATE TABLE` … `GRANT`, then `INSERT 0 1`.

- [ ] **Step 5: Run the test and watch it pass**

Run: `npm run db:test -- supabase/tests/database/miro_version_links.test.sql`
Expected: PASS, every assertion `ok`.

- [ ] **Step 6: Run the whole database suite**

Run: `npm run db:test`
Expected: PASS (the new tables change no existing count).

- [ ] **Step 7: Regenerate types**

Run: `npm run db:types` then `git diff --stat supabase/database.types.ts`
Expected: only additions for the two tables and four functions; the client-team columns (`requested_by`, `reviewed_by`, `notify_all`) are still present.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/202609260001_miro_version_links.sql supabase/tests/database/miro_version_links.test.sql supabase/database.types.ts
git commit -m "feat(db): store agency-set Miro frame links per version and channel"
```

---

### Task 2: URL helpers

**Files:**
- Create: `apps/web/features/projects/miro-links.ts`
- Test: `apps/web/features/projects/miro-links.test.ts`

**Interfaces:**
- Produces: `type MiroLink = { boardId: string; widgetId: string | null }`; `parseMiroBoardUrl(url: string): MiroLink | null`; `miroEmbedUrl(link: MiroLink): string`; `miroBoardUrl(link: MiroLink): string`; `const miroUrlHint: string`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { miroBoardUrl, miroEmbedUrl, parseMiroBoardUrl } from "./miro-links";

describe("parseMiroBoardUrl", () => {
  it("reads a board link", () => {
    expect(parseMiroBoardUrl("https://miro.com/app/board/uXjVKabc123=/")).toEqual({
      boardId: "uXjVKabc123=",
      widgetId: null,
    });
  });

  it("reads a frame link among other query values", () => {
    expect(
      parseMiroBoardUrl(
        " https://miro.com/app/board/uXjVKabc123=/?share_link_id=42&moveToWidget=3458764512345678901&cot=14 ",
      ),
    ).toEqual({ boardId: "uXjVKabc123=", widgetId: "3458764512345678901" });
  });

  it("decodes an encoded board id and accepts www", () => {
    expect(parseMiroBoardUrl("https://www.miro.com/app/board/uXjVKabc123%3D/")).toEqual({
      boardId: "uXjVKabc123=",
      widgetId: null,
    });
  });

  it.each([
    "",
    "http://miro.com/app/board/uXjVKabc123=/",
    "https://evil.example/app/board/uXjVKabc123=/",
    "https://miro.com.evil.example/app/board/uXjVKabc123=/",
    "https://miro.com/app/board/uXjVKabc123=/?moveToWidget=abc",
    "javascript:alert(1)",
  ])("refuses %s", (url) => {
    expect(parseMiroBoardUrl(url)).toBeNull();
  });
});

describe("Miro URLs built from stored ids", () => {
  it("embeds a frame", () => {
    expect(miroEmbedUrl({ boardId: "uXjVKabc123=", widgetId: "345" })).toBe(
      "https://miro.com/app/live-embed/uXjVKabc123%3D/?moveToWidget=345",
    );
  });

  it("embeds a whole board", () => {
    expect(miroEmbedUrl({ boardId: "uXjVKabc123=", widgetId: null })).toBe(
      "https://miro.com/app/live-embed/uXjVKabc123%3D/",
    );
  });

  it("opens the frame in Miro", () => {
    expect(miroBoardUrl({ boardId: "uXjVKabc123=", widgetId: "345" })).toBe(
      "https://miro.com/app/board/uXjVKabc123%3D/?moveToWidget=345",
    );
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm --prefix apps/web exec vitest run features/projects/miro-links.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
/**
 * Miro frame links: the form's pre-check and the URLs the product builds from stored ids.
 *
 * The database parses the pasted URL again (`private.parse_miro_board_url`) and is the authority;
 * this copy only lets the dialog refuse a bad link before anything is sent. The iframe and the
 * "Open in Miro" link are always rebuilt from `boardId` / `widgetId`, never from a pasted URL.
 */
export type MiroLink = { boardId: string; widgetId: string | null };

export const miroUrlHint = "Paste a Miro board or frame link (https://miro.com/app/board/…).";

const boardUrl =
  /^https:\/\/(?:www\.)?miro\.com\/app\/board\/([A-Za-z0-9_=%-]{6,80})\/?(\?[^#\s]*)?(#\S*)?$/;

export function parseMiroBoardUrl(url: string): MiroLink | null {
  const parts = boardUrl.exec(url.trim());
  if (!parts) return null;
  const boardId = parts[1].replaceAll("%3D", "=");
  if (!/^[A-Za-z0-9_=-]{6,64}$/.test(boardId)) return null;
  const widgetId = /[?&]moveToWidget=([^&]*)/.exec(parts[2] ?? "")?.[1] ?? null;
  if (widgetId !== null && !/^[0-9]{1,32}$/.test(widgetId)) return null;
  return { boardId, widgetId };
}

function build(path: "live-embed" | "board", link: MiroLink) {
  const base = `https://miro.com/app/${path}/${encodeURIComponent(link.boardId)}/`;
  return link.widgetId ? `${base}?moveToWidget=${link.widgetId}` : base;
}

export const miroEmbedUrl = (link: MiroLink) => build("live-embed", link);
export const miroBoardUrl = (link: MiroLink) => build("board", link);
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm --prefix apps/web exec vitest run features/projects/miro-links.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/projects/miro-links.ts apps/web/features/projects/miro-links.test.ts
git commit -m "feat(projects): parse Miro frame links and build embed URLs"
```

---

### Task 3: Data access

**Files:**
- Modify: `apps/web/features/projects/project-data.ts`
- Test: `apps/web/features/projects/canvas-versions.test.ts`, `apps/web/features/projects/project-data.test.ts`

**Interfaces:**
- Consumes: `MiroLink` from `./miro-links`; the Task 1 tables and RPCs.
- Produces:
  - `CanvasVersion.miro?: MiroLink | null`
  - `type MiroLinkRow = { versionId: string; boardId: string; widgetId: string | null }`
  - `toCanvasVersions(versions, reviews, clientChannel, links?: MiroLinkRow[])`
  - `latestMiroLink(versions: { id: string; number: number }[], links: MiroLinkRow[], excludeId?: string): MiroLink | null`
  - `useLatestMiroLink(deliverableId: string, channel: ProjectChannel, options: { excludeId?: string; enabled?: boolean })` → query of `MiroLink | null`
  - `setMiroLink(database, { channel: ProjectChannel; versionId: string; url: string }): Promise<void>`
  - `clearMiroLink(database, { channel: ProjectChannel; versionId: string }): Promise<void>`
  - `publishVersion(...)` now returns `Promise<string>` (the publication id).

- [ ] **Step 1: Write failing tests**

Append to `canvas-versions.test.ts` (reuse its existing `publishedVersion` / `internalVersion` fixtures):

```ts
describe("Miro links on canvas versions", () => {
  it("attaches the link whose version id matches", () => {
    const [version] = toCanvasVersions([publishedVersion], [], true, [
      { versionId: publishedVersion.id, boardId: "uXjVKabc123=", widgetId: "345" },
    ]);
    expect(version.miro).toEqual({ boardId: "uXjVKabc123=", widgetId: "345" });
  });

  it("leaves a version without a link at null", () => {
    const [version] = toCanvasVersions([internalVersion], [], false, [
      { versionId: "another", boardId: "uXjVKabc123=", widgetId: null },
    ]);
    expect(version.miro).toBeNull();
  });
});

describe("latestMiroLink", () => {
  const links = [
    { versionId: "v1", boardId: "uXjVBoard01=", widgetId: "1" },
    { versionId: "v2", boardId: "uXjVBoard01=", widgetId: "2" },
  ];
  const versions = [
    { id: "v1", number: 1 },
    { id: "v2", number: 2 },
    { id: "v3", number: 3 },
  ];

  it("takes the newest version that has a link", () => {
    expect(latestMiroLink(versions, links)).toEqual({ boardId: "uXjVBoard01=", widgetId: "2" });
  });

  it("skips the version being edited", () => {
    expect(latestMiroLink(versions, links, "v2")).toEqual({
      boardId: "uXjVBoard01=",
      widgetId: "1",
    });
  });

  it("is null when no version has a link", () => {
    expect(latestMiroLink(versions, [])).toBeNull();
  });
});
```

Update the import line to `import { latestMiroLink, toCanvasVersions } from "./project-data";`.

Append to `project-data.test.ts` (add `clearMiroLink`, `setMiroLink` to its import list):

```ts
describe("Miro link writes", () => {
  it("sets a publication link on the client channel", async () => {
    const { database, rpc } = stubDatabase(ok);
    await setMiroLink(database, { channel: "client", versionId: "pub-1", url: "https://miro.com/app/board/uXjVKabc123=/" });
    expect(rpc).toHaveBeenCalledWith("set_publication_miro_link", {
      p_publication_id: "pub-1",
      p_url: "https://miro.com/app/board/uXjVKabc123=/",
    });
  });

  it("sets an internal link on the internal channel", async () => {
    const { database, rpc } = stubDatabase(ok);
    await setMiroLink(database, { channel: "internal", versionId: "v-1", url: "https://miro.com/app/board/uXjVKabc123=/" });
    expect(rpc).toHaveBeenCalledWith("set_version_miro_link", {
      p_version_id: "v-1",
      p_url: "https://miro.com/app/board/uXjVKabc123=/",
    });
  });

  it("clears by channel", async () => {
    const { database, rpc } = stubDatabase(ok);
    await clearMiroLink(database, { channel: "client", versionId: "pub-1" });
    await clearMiroLink(database, { channel: "internal", versionId: "v-1" });
    expect(rpc).toHaveBeenCalledWith("clear_publication_miro_link", { p_publication_id: "pub-1" });
    expect(rpc).toHaveBeenCalledWith("clear_version_miro_link", { p_version_id: "v-1" });
  });

  it("publishing returns the publication id", async () => {
    const { database } = stubDatabase({ data: "pub-9", error: null });
    await expect(
      publishVersion(database, { versionId: "version-1", releaseNote: "", assets: {} }),
    ).resolves.toBe("pub-9");
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm --prefix apps/web exec vitest run features/projects/canvas-versions.test.ts features/projects/project-data.test.ts`
Expected: FAIL (`latestMiroLink`, `setMiroLink`, `clearMiroLink` not exported; `miro` undefined).

- [ ] **Step 3: Implement in `project-data.ts`**

Add the import: `import type { MiroLink } from "./miro-links";`

Extend `CanvasVersion` with:

```ts
  /** The Miro frame this version points at, on the viewer's channel; null when none is set. */
  miro?: MiroLink | null;
```

Add, above `toCanvasVersions`:

```ts
/** A version's Miro link as either channel's table returns it, keyed by that channel's version id. */
export type MiroLinkRow = { versionId: string; boardId: string; widgetId: string | null };
```

Change `toCanvasVersions` to take `links: MiroLinkRow[] = []` as a fourth parameter and add to the returned object:

```ts
      miro: (() => {
        const link = links.find((entry) => entry.versionId === version.id);
        return link ? { boardId: link.boardId, widgetId: link.widgetId } : null;
      })(),
```

Add after `toCanvasVersions`:

```ts
/** The newest version's link among `versions`, skipping `excludeId`: what a new link prefills from. */
export function latestMiroLink(
  versions: { id: string; number: number }[],
  links: MiroLinkRow[],
  excludeId?: string,
): MiroLink | null {
  const newestFirst = [...versions].sort((a, b) => b.number - a.number);
  for (const version of newestFirst) {
    if (version.id === excludeId) continue;
    const link = links.find((entry) => entry.versionId === version.id);
    if (link) return { boardId: link.boardId, widgetId: link.widgetId };
  }
  return null;
}

/**
 * Each channel keeps its links in its own table under its own read rule. Reading one channel's
 * table for the other's versions is never done: the client board and the internal board stay apart.
 */
async function readMiroLinks(
  database: SupabaseDatabase,
  channel: ProjectChannel,
  filter: { projectId: string } | { versionIds: string[] },
): Promise<MiroLinkRow[]> {
  if (channel === "client") {
    const query = database.from("publication_miro_links").select("publication_id, board_id, widget_id");
    const result = await ("projectId" in filter
      ? query.eq("project_id", filter.projectId)
      : query.in("publication_id", filter.versionIds));
    return assertResult(result).map((row) => ({
      versionId: row.publication_id,
      boardId: row.board_id,
      widgetId: row.widget_id,
    }));
  }
  const query = database.from("design_version_miro_links").select("version_id, board_id, widget_id");
  const result = await ("projectId" in filter
    ? query.eq("project_id", filter.projectId)
    : query.in("version_id", filter.versionIds));
  return assertResult(result).map((row) => ({
    versionId: row.version_id,
    boardId: row.board_id,
    widgetId: row.widget_id,
  }));
}
```

In `useProjectDetail`'s `queryFn`, after the `Promise.all` and the two error checks, replace the `toCanvasVersions` line with:

```ts
      const miroLinks = await readMiroLinks(database, clientChannel ? "client" : "internal", {
        projectId,
      });
      const versions = toCanvasVersions(
        versionResult.data,
        reviewResult.data ?? [],
        clientChannel,
        miroLinks,
      );
```

Add the prefill read after `useProjectDetail`:

```ts
/**
 * The link a new Miro link prefills from: the newest earlier version of the same deliverable, on
 * the same channel. Keyed under `project-detail` so every project write refreshes it.
 */
export function useLatestMiroLink(
  deliverableId: string,
  channel: ProjectChannel,
  options: { excludeId?: string; enabled?: boolean } = {},
) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["project-detail", session?.user.id, "miro-latest", deliverableId, channel, options.excludeId],
    enabled: !!session && !!deliverableId && (options.enabled ?? true),
    queryFn: async () => {
      const table = channel === "client" ? "published_versions" : "design_versions";
      const versions = assertResult(
        await database.from(table).select("id, version_number").eq("deliverable_id", deliverableId),
      ).map((row) => ({ id: row.id, number: row.version_number }));
      if (!versions.length) return null;
      const links = await readMiroLinks(database, channel, {
        versionIds: versions.map((version) => version.id),
      });
      return latestMiroLink(versions, links, options.excludeId);
    },
  });
}
```

Change `publishVersion` to return the id:

```ts
export async function publishVersion(
  database: SupabaseDatabase,
  input: { versionId: string; releaseNote: string; assets: Record<string, string> },
): Promise<string> {
  return assertResult(
    await database.rpc("publish_version", {
      // (keep the existing arguments and comment unchanged)
    }),
  );
}
```

Add the writes after `reviewPublication`:

```ts
/** Sets a version's Miro link on one channel; the agency-only RPC parses and validates the URL. */
export async function setMiroLink(
  database: SupabaseDatabase,
  input: { channel: ProjectChannel; versionId: string; url: string },
) {
  assertResult(
    input.channel === "client"
      ? await database.rpc("set_publication_miro_link", {
          p_publication_id: input.versionId,
          p_url: input.url,
        })
      : await database.rpc("set_version_miro_link", {
          p_version_id: input.versionId,
          p_url: input.url,
        }),
  );
}

export async function clearMiroLink(
  database: SupabaseDatabase,
  input: { channel: ProjectChannel; versionId: string },
) {
  assertResult(
    input.channel === "client"
      ? await database.rpc("clear_publication_miro_link", { p_publication_id: input.versionId })
      : await database.rpc("clear_version_miro_link", { p_version_id: input.versionId }),
  );
}
```

If `assertResult`'s return type does not already yield `string` for `publish_version`, check `apps/web/lib/supabase.ts` and cast only at this call site with a short comment.

- [ ] **Step 4: Run and watch them pass**

Run: `npm --prefix apps/web exec vitest run features/projects/canvas-versions.test.ts features/projects/project-data.test.ts`
Expected: PASS. The existing `publishVersion` test still passes (its `ok` result returns `[]`, ignored there).

- [ ] **Step 5: Typecheck**

Run: `npm --prefix apps/web run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/projects/project-data.ts apps/web/features/projects/canvas-versions.test.ts apps/web/features/projects/project-data.test.ts
git commit -m "feat(projects): read and write Miro links per version and channel"
```

---

### Task 4: Shared full-screen layer

**Files:**
- Create: `apps/web/features/shared/use-fullscreen-layer.ts` (moved from `features/playground/use-playground-close-lifecycle.ts`)
- Delete: `apps/web/features/playground/use-playground-close-lifecycle.ts`
- Modify: `apps/web/features/playground/playground-board.tsx`, `apps/web/features/playground/use-playground-navigation-guard.ts`, `apps/web/features/playground/playground.css`, `apps/web/app/globals.css`, `apps/web/features/playground/playground-board.test.tsx`, `apps/web/features/shared/README.md`, `apps/web/features/playground/README.md`

**Interfaces:**
- Produces: `type FullscreenLayerPhase = "entering" | "active" | "exiting"`; `useFullscreenLayer({ onClose }): { layer: RefObject<HTMLDialogElement>; heading: RefObject<HTMLHeadingElement>; phase; beginExit(): void; handleAnimationEnd(event): void }`; CSS class `.fullscreen-layer` with keyframes `fullscreen-layer-enter` / `fullscreen-layer-exit`.

- [ ] **Step 1: Update the Playground test to the new animation names (failing)**

In `playground-board.test.tsx`, replace every `"playground-layer-enter"` with `"fullscreen-layer-enter"` and every `"playground-layer-exit"` with `"fullscreen-layer-exit"`.

Run: `npm --prefix apps/web exec vitest run features/playground/playground-board.test.tsx`
Expected: FAIL (the old hook still listens for the old names).

- [ ] **Step 2: Move the hook**

`git mv apps/web/features/playground/use-playground-close-lifecycle.ts apps/web/features/shared/use-fullscreen-layer.ts`, then in the moved file:
- rename `PlaygroundClosePhase` → `FullscreenLayerPhase`, `usePlaygroundCloseLifecycle` → `useFullscreenLayer`;
- change `"playground-layer-exit"` → `"fullscreen-layer-exit"` and `"playground-layer-enter"` → `"fullscreen-layer-enter"`;
- rewrite the doc comment's first sentence to: `A full-screen native dialog's open/close lifecycle, shared by Playground and the project's Miro panel:`; keep the rest.

In `playground-board.tsx`: `import { useFullscreenLayer } from "@/features/shared/use-fullscreen-layer";`, call `useFullscreenLayer(...)` where `usePlaygroundCloseLifecycle(...)` was, and set the dialog's `className="fullscreen-layer playground-board"`.

In `use-playground-navigation-guard.ts`: `import type { FullscreenLayerPhase } from "@/features/shared/use-fullscreen-layer";` and use it for `phase`.

- [ ] **Step 3: Move the shared CSS**

Cut from `playground.css` the frame rules (the `.playground-board` positioning block's layout/background properties, `::backdrop`, the two `[data-phase]` rules, both keyframes and the reduced-motion block) and add to `globals.css` in the shared-primitives area:

```css
/* A full-screen native dialog that rises from the bottom edge (Playground, the project's Miro
   panel). `features/shared/use-fullscreen-layer.ts` drives `data-phase`. */
.fullscreen-layer {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100dvh;
  max-width: none;
  max-height: none;
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: var(--surface);
  color: var(--foreground);
  overflow: hidden;
}
.fullscreen-layer::backdrop {
  background: transparent;
}
.fullscreen-layer[data-phase="entering"] {
  animation: fullscreen-layer-enter 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.fullscreen-layer[data-phase="exiting"] {
  animation: fullscreen-layer-exit 180ms ease-in both;
  pointer-events: none;
}
@keyframes fullscreen-layer-enter {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
@keyframes fullscreen-layer-exit {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(100%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .fullscreen-layer[data-phase] {
    animation: none;
  }
}
```

`playground.css` keeps only `.playground-board { --playground-accent: …; --playground-on-accent: …; }` from that block.

- [ ] **Step 4: Run the Playground and stylesheet tests**

Run: `npm --prefix apps/web exec vitest run features/playground features/shared/stylesheet-boundary.test.ts`
Expected: PASS.

- [ ] **Step 5: Document**

`features/shared/README.md`: add a `### Full-screen layer` entry — `useFullscreenLayer` (`use-fullscreen-layer.ts`) and `.fullscreen-layer` in `app/globals.css`; consumers `playground/playground-board` and `projects/miro-board-panel`; one paragraph restating the lifecycle (top layer, scroll lock, heading focus, 300 ms fallback timer, reduced motion).
`features/playground/README.md`: replace the `use-playground-close-lifecycle.ts` mention with `the shared useFullscreenLayer (features/shared/use-fullscreen-layer.ts)`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/shared/use-fullscreen-layer.ts apps/web/features/playground/use-playground-close-lifecycle.ts apps/web/features/playground/playground-board.tsx apps/web/features/playground/use-playground-navigation-guard.ts apps/web/features/playground/playground.css apps/web/app/globals.css apps/web/features/playground/playground-board.test.tsx apps/web/features/shared/README.md apps/web/features/playground/README.md
git commit -m "refactor(shared): share the full-screen layer lifecycle beyond Playground"
```

---

### Task 5: Miro panel and Content-Security-Policy

**Files:**
- Create: `apps/web/features/projects/miro-board-panel.tsx`, `apps/web/features/projects/miro-board-panel.test.tsx`
- Modify: `apps/web/features/projects/projects.css`, `apps/web/next.config.ts`, `apps/web/lib/next-config.test.ts`

**Interfaces:**
- Consumes: `useFullscreenLayer` (Task 4), `MiroLink`, `miroEmbedUrl`, `miroBoardUrl` (Task 2).
- Produces: `MiroBoardPanel({ link, title, onClose }: { link: MiroLink; title: string; onClose: () => void })`.

- [ ] **Step 1: Write the failing tests**

`miro-board-panel.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MiroBoardPanel } from "./miro-board-panel";

beforeAll(() => {
  // jsdom has no top layer; real focus isolation is covered in E2E.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value() { this.setAttribute("open", ""); } },
    close: { configurable: true, value() { this.removeAttribute("open"); } },
  });
  window.matchMedia ??= (() => ({ matches: true })) as never;
});

const link = { boardId: "uXjVKabc123=", widgetId: "345" };

describe("MiroBoardPanel", () => {
  it("embeds the stored frame and offers it in Miro", () => {
    render(<MiroBoardPanel link={link} title="Key visual · V3" onClose={() => {}} />);
    expect(screen.getByTitle("Miro board for Key visual · V3")).toHaveAttribute(
      "src",
      "https://miro.com/app/live-embed/uXjVKabc123%3D/?moveToWidget=345",
    );
    expect(screen.getByRole("link", { name: /Open in Miro/ })).toHaveAttribute(
      "href",
      "https://miro.com/app/board/uXjVKabc123%3D/?moveToWidget=345",
    );
    expect(screen.getByRole("heading", { name: "Key visual · V3" })).toBeInTheDocument();
  });

  it("closes through Back to project", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<MiroBoardPanel link={link} title="Key visual · V3" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Back to project/ }));
    await act(async () => vi.runAllTimers());
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
```

In `lib/next-config.test.ts`, change `expect(csp).toContain("frame-src 'none'");` to `expect(csp).toContain("frame-src https://miro.com");`.

- [ ] **Step 2: Run and watch them fail**

Run: `npm --prefix apps/web exec vitest run features/projects/miro-board-panel.test.tsx lib/next-config.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the panel**

```tsx
"use client";

import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useId } from "react";
import { useFullscreenLayer } from "@/features/shared/use-fullscreen-layer";
import { miroBoardUrl, miroEmbedUrl, type MiroLink } from "./miro-links";

/**
 * A version's Miro frame, full screen over the project. The iframe source is rebuilt from the
 * stored ids; "Open in Miro" stays visible because the embed can fail to sign in (third-party
 * cookies) and the viewer still needs a way through.
 */
export function MiroBoardPanel({
  link,
  title,
  onClose,
}: {
  link: MiroLink;
  title: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const { layer, heading, phase, beginExit, handleAnimationEnd } = useFullscreenLayer({ onClose });
  return (
    <dialog
      ref={layer}
      className="fullscreen-layer miro-board-panel"
      data-phase={phase}
      inert={phase === "exiting"}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        beginExit();
      }}
      onAnimationEnd={handleAnimationEnd}
    >
      <div className="miro-board-shell">
        <header className="miro-board-header">
          <button type="button" className="button quiet" onClick={beginExit}>
            <ArrowLeft size={14} aria-hidden="true" />
            Back to project
          </button>
          <h2 ref={heading} id={titleId} tabIndex={-1}>
            {title}
          </h2>
          <a
            className="button quiet"
            href={miroBoardUrl(link)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Miro
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </header>
        <iframe
          className="miro-board-frame"
          title={`Miro board for ${title}`}
          src={miroEmbedUrl(link)}
          allow="fullscreen; clipboard-read; clipboard-write"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </dialog>
  );
}
```

Append to `projects.css`:

```css
.miro-board-shell {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.miro-board-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-shrink: 0;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
}
.miro-board-header h2 {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: var(--text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.miro-board-frame {
  flex: 1;
  width: 100%;
  min-height: 0;
  border: 0;
}
```

In `next.config.ts`, change `["frame-src", ["'none'"]],` to:

```ts
    // Only Miro's live embed may be framed: the project's Miro panel builds its source from
    // stored board and frame ids. Everything else stays unframeable.
    ["frame-src", ["https://miro.com"]],
```

- [ ] **Step 4: Run and watch them pass**

Run: `npm --prefix apps/web exec vitest run features/projects/miro-board-panel.test.tsx lib/next-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/projects/miro-board-panel.tsx apps/web/features/projects/miro-board-panel.test.tsx apps/web/features/projects/projects.css apps/web/next.config.ts apps/web/lib/next-config.test.ts
git commit -m "feat(projects): open a version's Miro frame in a full-screen panel"
```

---

### Task 6: Wire the dialog, the version card and the page

**Files:**
- Modify: `apps/web/features/projects/project-action-dialog.tsx`, `apps/web/features/projects/project-action-dialog.test.tsx`, `apps/web/features/projects/project-nodes.tsx`, `apps/web/features/projects/project-page.tsx`, `apps/web/features/projects/projects.css`

**Interfaces:**
- Consumes: `setMiroLink`, `clearMiroLink`, `useLatestMiroLink`, `publishVersion` (Task 3); `parseMiroBoardUrl`, `miroBoardUrl`, `miroUrlHint` (Task 2); `MiroBoardPanel` (Task 5).
- Produces: `ProjectAction` gains `{ kind: "miro"; version: CanvasVersion; channel: ProjectChannel }`; `VersionNode` data gains `canManageMiro: boolean` and `openMiro?: () => void`.

- [ ] **Step 1: Write the failing dialog tests**

In `project-action-dialog.test.tsx`, add to the `projectData` mock: `setMiroLink: vi.fn()`, `clearMiroLink: vi.fn()`, `useLatestMiroLink: vi.fn()`. In `beforeEach`, add:

```ts
  projectData.useLatestMiroLink.mockReturnValue({ isPending: false, data: null });
  projectData.publishVersion.mockResolvedValue("pub-1");
  projectData.setMiroLink.mockResolvedValue(undefined);
  projectData.clearMiroLink.mockResolvedValue(undefined);
  mediaClient.preparePublicationAssets.mockResolvedValue({});
  mediaClient.discardPreparedAssets.mockResolvedValue(undefined);
```

Then:

```ts
const publishedVersion = { ...version, id: "pub-1", deliverableId: "d-1", number: 3 } as CanvasVersion;

describe("Miro links", () => {
  it("prefills the publish field from the previous publication", () => {
    projectData.useLatestMiroLink.mockReturnValue({
      isPending: false,
      data: { boardId: "uXjVKabc123=", widgetId: "7" },
    });
    renderDialog({ kind: "publish", version: { ...version, deliverableId: "d-1" } as CanvasVersion });
    expect(projectData.useLatestMiroLink).toHaveBeenCalledWith("d-1", "client", { enabled: true });
    expect(screen.getByLabelText(/Miro frame/)).toHaveValue(
      "https://miro.com/app/board/uXjVKabc123%3D/?moveToWidget=7",
    );
  });

  it("refuses an invalid link before publishing", async () => {
    renderDialog({ kind: "publish", version });
    fireEvent.change(screen.getByLabelText(/Miro frame/), { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Share version" }));
    expect(await screen.findByText(/Paste a Miro board or frame link/)).toBeInTheDocument();
    expect(projectData.publishVersion).not.toHaveBeenCalled();
  });

  it("saves the link on the new publication", async () => {
    const { onClose } = renderDialog({ kind: "publish", version });
    fireEvent.change(screen.getByLabelText(/Miro frame/), {
      target: { value: "https://miro.com/app/board/uXjVKabc123=/?moveToWidget=9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Share version" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(projectData.setMiroLink).toHaveBeenCalledWith(expect.anything(), {
      channel: "client",
      versionId: "pub-1",
      url: "https://miro.com/app/board/uXjVKabc123=/?moveToWidget=9",
    });
  });

  it("reports a shared version whose link was not saved", async () => {
    projectData.setMiroLink.mockRejectedValue(new Error("network down"));
    const { onClose } = renderDialog({ kind: "publish", version });
    fireEvent.change(screen.getByLabelText(/Miro frame/), {
      target: { value: "https://miro.com/app/board/uXjVKabc123=/" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Share version" }));
    expect(await screen.findByText(/was shared, but the Miro link was not saved/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes the link when the field is saved empty", async () => {
    const { onClose } = renderDialog({
      kind: "miro",
      version: { ...publishedVersion, miro: { boardId: "uXjVKabc123=", widgetId: null } },
      channel: "client",
    });
    fireEvent.change(screen.getByLabelText(/Miro frame/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(projectData.clearMiroLink).toHaveBeenCalledWith(expect.anything(), {
      channel: "client",
      versionId: "pub-1",
    });
  });

  it("sets an internal link on the internal channel", async () => {
    const { onClose } = renderDialog({ kind: "miro", version, channel: "internal" });
    fireEvent.change(screen.getByLabelText(/Miro frame/), {
      target: { value: "https://miro.com/app/board/uXjVStudio1=/" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(projectData.setMiroLink).toHaveBeenCalledWith(expect.anything(), {
      channel: "internal",
      versionId: "version-1",
      url: "https://miro.com/app/board/uXjVStudio1=/",
    });
  });
});
```

Run: `npm --prefix apps/web exec vitest run features/projects/project-action-dialog.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Implement the dialog**

In `project-action-dialog.tsx`:

Imports: add `clearMiroLink`, `setMiroLink`, `useLatestMiroLink`, `type ProjectChannel` from `./project-data`, and `import { miroBoardUrl, miroUrlHint, parseMiroBoardUrl } from "./miro-links";`.

Types and copy:

```ts
export type ProjectAction =
  | { kind: "version"; deliverableId: string; sourceVersionId?: string }
  | { kind: "design" | "publish" | "submit" | "review"; version: CanvasVersion }
  | { kind: "edit-design"; version: CanvasVersion; design: CanvasDesign }
  | { kind: "miro"; version: CanvasVersion; channel: ProjectChannel };
```

Add `miro: "Link a Miro frame.",` to `titles`, and `miro: "Save link",` to the submit label map.

Inside the component, before `useMutation`:

```ts
  // What a new Miro link starts from: a client link only from an earlier publication, an internal
  // link only from an earlier internal version. The hook runs on every render; `enabled` scopes it.
  const miroChannel: ProjectChannel = action?.kind === "miro" ? action.channel : "client";
  const miroTarget =
    action?.kind === "publish" || action?.kind === "miro" ? action.version : null;
  const latestMiro = useLatestMiroLink(
    miroTarget?.deliverableId ?? "",
    miroChannel,
    action?.kind === "miro"
      ? { excludeId: action.version.id, enabled: !action.version.miro }
      : { enabled: action?.kind === "publish" },
  );
  const miroPrefill =
    action?.kind === "miro" && action.version.miro
      ? miroBoardUrl(action.version.miro)
      : latestMiro.data
        ? miroBoardUrl(latestMiro.data)
        : "";
```

In `mutationFn`, replace the `publish` branch body with:

```ts
      } else if (action.kind === "publish") {
        const miroUrl = value("miro");
        if (miroUrl && !parseMiroBoardUrl(miroUrl)) throw new Error(miroUrlHint);
        const assets = await preparePublicationAssets(database, mediaUrl, action.version.id);
        let publicationId: string;
        try {
          publicationId = await publishVersion(database, {
            versionId: action.version.id,
            releaseNote: value("note"),
            assets,
          });
        } finally {
          // Referenced files are retained; the server also expires abandoned preparations.
          await discardPreparedAssets(database, mediaUrl, Object.values(assets)).catch(
            () => undefined,
          );
        }
        if (miroUrl) {
          try {
            await setMiroLink(database, { channel: "client", versionId: publicationId, url: miroUrl });
          } catch (error) {
            // Publishing without a key is idempotent, so sharing again returns this same
            // publication and retries only the link.
            await invalidate();
            throw new Error(
              `V${action.version.number} was shared, but the Miro link was not saved (${
                error instanceof Error ? error.message : "unknown error"
              }). Share again to retry the link.`,
            );
          }
        }
      } else if (action.kind === "miro") {
        const miroUrl = value("miro");
        if (!miroUrl) await clearMiroLink(database, { channel: action.channel, versionId: action.version.id });
        else {
          if (!parseMiroBoardUrl(miroUrl)) throw new Error(miroUrlHint);
          await setMiroLink(database, { channel: action.channel, versionId: action.version.id, url: miroUrl });
        }
```

Add a small field component at the bottom of the file:

```tsx
/**
 * The Miro link input; remounted once its prefill arrives so `defaultValue` takes it. It is a text
 * input, not `type="url"`, so the dialog's own message (not the browser's) explains a bad link.
 */
function MiroField({ prefill, loading, hint }: { prefill: string; loading: boolean; hint: string }) {
  return (
    <label>
      Miro frame (optional)
      <input
        key={loading ? "loading" : prefill}
        name="miro"
        type="text"
        inputMode="url"
        defaultValue={prefill}
        disabled={loading}
        placeholder="https://miro.com/app/board/…/?moveToWidget=…"
      />
      <small className="field-hint">{hint}</small>
    </label>
  );
}
```

In the `publish` markup, after the note `<label>`:

```tsx
                <MiroField
                  prefill={miroPrefill}
                  loading={latestMiro.isPending && latestMiro.fetchStatus !== "idle"}
                  hint="The client opens this frame from the version. Copy the frame's link in Miro."
                />
```

Add the `miro` markup after the `review` block:

```tsx
            {action.kind === "miro" && (
              <>
                <p>
                  {action.channel === "client"
                    ? "The client opens this frame from the shared version."
                    : "Assigned designers open this frame from the version. The client never sees it."}
                </p>
                <MiroField
                  prefill={miroPrefill}
                  loading={latestMiro.isPending && latestMiro.fetchStatus !== "idle"}
                  hint="Leave empty to remove the link."
                />
              </>
            )}
```

If `.field-hint` does not exist in `globals.css` / `forms.css`, use the existing hint class the forms already use (search `forms.css` for `hint`); do not add a new global class.

In the `key` of `<ProjectActionDialog>` in `project-page.tsx` nothing changes: `miro` actions carry `version`.

- [ ] **Step 3: Run the dialog tests**

Run: `npm --prefix apps/web exec vitest run features/projects/project-action-dialog.test.tsx`
Expected: PASS, including every existing test.

- [ ] **Step 4: Wire the version card**

In `project-nodes.tsx`: import `Link2, Presentation` from `lucide-react`; add to `VersionNode` data:

```ts
    /** The agency sets this channel's Miro link from the card. */
    canManageMiro: boolean;
    /** Present only when this version has a Miro link on the viewer's channel. */
    openMiro?: () => void;
```

After the comments `<button>` in `VersionCard`, add:

```tsx
        {(data.openMiro || data.canManageMiro) && (
          <div className="version-miro">
            {data.openMiro && (
              <button className="version-miro-open nodrag" onClick={data.openMiro}>
                <Presentation size={14} aria-hidden="true" />
                View on Miro
              </button>
            )}
            {data.canManageMiro && (
              <button
                className="icon-button nodrag"
                aria-label={`${data.version.miro ? "Change" : "Add"} Miro link for version ${data.version.number}`}
                title={data.version.miro ? "Change Miro link" : "Add Miro link"}
                onClick={() =>
                  data.action({ kind: "miro", version: data.version, channel: data.channel })
                }
              >
                <Link2 size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
```

Append to `projects.css`:

```css
.version-miro {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px 0 0;
}
.version-miro-open {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 14px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: var(--text-xs);
  text-align: left;
  cursor: pointer;
}
.version-miro-open:hover {
  color: var(--foreground);
}
```

- [ ] **Step 5: Wire the page**

In `project-page.tsx`: `import { MiroBoardPanel } from "./miro-board-panel";`. Next to the Playground state:

```ts
  const [miroVersion, setMiroVersion] = useState<CanvasVersion | null>(null);
```

In the version node `data`:

```ts
        canManageMiro: profile?.role === "agency",
        openMiro: version.miro ? () => setMiroVersion(version) : undefined,
```

After the `{playgroundOpen && (…)}` block:

```tsx
        {miroVersion?.miro && (
          <MiroBoardPanel
            link={miroVersion.miro}
            title={`${deliverables.find((entry) => entry.id === miroVersion.deliverableId)?.name ?? "Version"} · V${miroVersion.number}`}
            onClose={() => setMiroVersion(null)}
          />
        )}
```

(`deliverables` is the name already used for the bulk-drop dialog prop in this file; if it is scoped differently, use the same source that prop reads.)

When the agency switches channel, close the panel: in the existing channel-switch handler that calls `setAgencyChannel`, also call `setMiroVersion(null)`.

- [ ] **Step 6: Run the project feature tests and the gate**

Run: `npm --prefix apps/web exec vitest run features/projects features/playground` then `npm run check`
Expected: PASS. If `check` fails only in files this task did not touch, message the client-team session before acting.

- [ ] **Step 7: Commit**

```bash
git add apps/web/features/projects/project-action-dialog.tsx apps/web/features/projects/project-action-dialog.test.tsx apps/web/features/projects/project-nodes.tsx apps/web/features/projects/project-page.tsx apps/web/features/projects/projects.css
git commit -m "feat(projects): link Miro frames from versions and the publish dialog"
```

---

### Task 7: Browser flows, visual check and documentation

**Files:**
- Create: `apps/web/tests/e2e/miro-version-links.spec.ts`
- Modify: `apps/web/features/projects/README.md`; `docs/architecture/*` only after the client-team session releases it
- Create: `docs/verification/miro-version-links-2026-09-26.md`, `docs/engineering/handoffs/2026-09-26-miro-version-links.md`

**Interfaces:**
- Consumes: `localAgency`, `localCaller`, `credentials`, `signIn`, `localAdmin` from `./test-support`.

- [ ] **Step 1: Write the spec**

The seeded SABRE landing page (`md5('dawes:project-sabre-campaign-landing-page')` =
`15e2d399-e215-9707-9499-96b455c83adf`) has two publications and is assigned to
`designer@dawes.local` (`credentials.designer`); `designer2@dawes.local` is not assigned to it.
The project route is `/projects/:projectId` (`apps/web/app/(workspace)/projects/[projectId]/page.tsx`).

```ts
import { expect, test } from "@playwright/test";
import { credentials, localAdmin, localAgency, signIn } from "./test-support";

// The seeded SABRE landing page: its latest publication gets a client-board link and its latest
// internal version an internal-board link, both removed afterwards. The embed itself is not
// loaded (no dependency on Miro's network); the iframe source and the role gating are asserted.
const projectId = "15e2d399-e215-9707-9499-96b455c83adf";
const clientBoard = "https://miro.com/app/board/uXjVClientE2E=/?moveToWidget=111";
const studioBoard = "https://miro.com/app/board/uXjVStudioE2E=/?moveToWidget=222";
let publicationId = "";
let versionId = "";

async function latestId(table: "published_versions" | "design_versions") {
  const result = await localAdmin
    .from(table)
    .select("id")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();
  if (result.error) throw new Error(result.error.message);
  return result.data.id;
}

test.beforeAll(async () => {
  publicationId = await latestId("published_versions");
  versionId = await latestId("design_versions");
  const agency = await localAgency();
  for (const result of [
    await agency.rpc("set_publication_miro_link", {
      p_publication_id: publicationId,
      p_url: clientBoard,
    }),
    await agency.rpc("set_version_miro_link", { p_version_id: versionId, p_url: studioBoard }),
  ])
    if (result.error) throw new Error(result.error.message);
});

test.afterAll(async () => {
  const agency = await localAgency();
  await agency.rpc("clear_publication_miro_link", { p_publication_id: publicationId });
  await agency.rpc("clear_version_miro_link", { p_version_id: versionId });
});

test("the client opens the client board and never the internal one", async ({ page }) => {
  await signIn(page, credentials.client);
  await page.goto(`/projects/${projectId}`);
  await page.getByRole("button", { name: "View on Miro" }).first().click();
  const frame = page.locator("iframe.miro-board-frame");
  await expect(frame).toHaveAttribute("src", /live-embed\/uXjVClientE2E%3D\/\?moveToWidget=111/);
  await expect(page.getByRole("link", { name: /Open in Miro/ })).toHaveAttribute("target", "_blank");
  await expect(page.locator('iframe[src*="uXjVStudioE2E"]')).toHaveCount(0);
  await page.getByRole("button", { name: /Back to project/ }).click();
  await expect(frame).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Miro link for version/ })).toHaveCount(0);
});

test("the assigned designer opens only the internal board", async ({ page }) => {
  await signIn(page, credentials.designer);
  await page.goto(`/projects/${projectId}`);
  await page.getByRole("button", { name: "View on Miro" }).first().click();
  await expect(page.locator("iframe.miro-board-frame")).toHaveAttribute("src", /uXjVStudioE2E/);
  await expect(page.locator('iframe[src*="uXjVClientE2E"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Miro link for version/ })).toHaveCount(0);
});

test("the agency manages the link on each channel", async ({ page }) => {
  await signIn(page, credentials.agency);
  await page.goto(`/projects/${projectId}`);
  await expect(
    page.getByRole("button", { name: /Change Miro link for version/ }).first(),
  ).toBeVisible();
  await page.goto(`/projects/${projectId}?channel=client`);
  await page.getByRole("button", { name: "View on Miro" }).first().click();
  await expect(page.locator("iframe.miro-board-frame")).toHaveAttribute("src", /uXjVClientE2E/);
});
```

- [ ] **Step 2: Run the spec and the CSP spec**

Run: `npm --prefix apps/web exec playwright test tests/e2e/miro-version-links.spec.ts tests/e2e/content-security-policy.spec.ts --output outputs/playwright-miro`
Expected: PASS.

- [ ] **Step 3: Manual embed check**

With a real Miro board the user supplies (ask for one view-by-link board), set it on a publication through the UI and open the panel in Chrome and Safari. Record in the verification record: loads signed in, loads signed out, Safari behaviour, and that **Open in Miro** reaches the frame. If the live embed needs extra `allow` values or parameters, change only `miro-board-panel.tsx` / `miro-links.ts` and their tests.

- [ ] **Step 4: Visual check**

Capture the version card (agency, client, designer), the publish dialog with the field, and the open panel in light and dark at 1440 px and 390 px into `outputs/miro/`. Check alignment with the comments button, truncation of long titles, and that nothing overflows at 390 px. Commit only the final images the verification record cites.

- [ ] **Step 5: Documentation**

`apps/web/features/projects/README.md`: a **Miro frame links** section covering the two tables and audiences, agency-only writes, the publish field and prefill rules, the card button and link action, the panel and its fallback, and the `frame-src` exception.
Message the client-team session to ask whether `docs/architecture/*` is free; when it is, add the two tables to the channel permission description and `frame-src https://miro.com` to the Content-Security-Policy description. If it is not free before this task closes, record the pending edit in this task's handoff report.

- [ ] **Step 6: Reports**

Write `docs/verification/miro-version-links-2026-09-26.md` (checks executed with results, manual embed findings, screenshots cited) and `docs/engineering/handoffs/2026-09-26-miro-version-links.md` (the 30-line template). Update `docs/engineering/handoff.md` only once the client-team session has released it.

- [ ] **Step 7: Gate and commit**

Run: `npm run check && npm run db:test`
Expected: PASS.

```bash
git add apps/web/tests/e2e/miro-version-links.spec.ts apps/web/features/projects/README.md docs/verification/miro-version-links-2026-09-26.md docs/engineering/handoffs/2026-09-26-miro-version-links.md
git commit -m "test(projects): verify Miro frame links by role and document them"
```

# Project Cover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The agency sets a sanitized project cover in Project details and controls whether the
client sees it. Board cards show the cover first. New projects never open the Versions canvas.

**Architecture:**
- A new private `project-covers` bucket holds only PNGs that the trusted media worker re-encodes
  and attests.
- A `project_covers` table carries per-row client visibility.
- Three agency-only RPCs set, change visibility of and clear a cover.
- The media worker gains `/covers/prepare` and `/covers/clear`.
- The web reads the cover next to the existing thumbnail and in Project details.
- `usesWorkspace` plus a "has legacy versions" check stops new projects from rendering
  `ProjectVersionsCanvas`.

**Tech Stack:** Supabase Postgres (plpgsql, RLS, storage policies, pgTAP), the Node media worker
(`apps/media/src`, node:test), Next.js/React 19/TanStack Query (Vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-09-27-project-cover-design.md`

## Global Constraints

- **Language:** English only in code, copy, tests and docs. Chat with the user is in pt-BR.
- **Data access:** Supabase queries live only in `features/<feature>/<feature>-data.ts`.
  Validation, trimming and retry state stay in components.
- **RPCs:** every RPC is `security definer set search_path=''`, revokes execute from
  `public, anon` and grants it to `authenticated`.
- **Migrations:** never run `supabase migration down` or `supabase db reset`. Apply only with
  `supabase migration up --local` from the repo root, and fix an applied migration forward with a
  new one. The next free numbers are `202609270001`, `202609270002`, and so on.
- **Local data:** the SABRE overlay (10 clients, 68 projects) must survive. No seed data is added.
- **Privacy:** a client never receives internal data or a cover that is not `client_visible`. A
  designer never sees another designer.
- **Commits:** each task ends with a passing gate and a Conventional Commit of its files. Stage
  explicit paths, never push, and end the message with the trailer
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Gates:**
  - SQL: `supabase test db`. Only `access_and_workflows` 2,4,9,18,32,54 may fail; they are
    SABRE-overlay counts.
  - Web: `cd apps/web && npm run check`.
  - Media: `cd apps/media && npm test`.

## Review Focus

1. **Visibility off:** a client whose cover is hidden must get neither the row nor a signed URL
   for the object. Task 1 tests the row and storage policies directly.
2. **Replacing a cover:** the old object must be deleted and no orphan may remain when the RPC
   fails after the upload. Task 2 tests both paths.
3. **Unattested paths:** an agency caller passing a path that is unattested, or attested for
   another project, is refused. Task 1 covers this.
4. **Mixed card:** on a legacy project with both a cover and legacy art, the cover wins for the
   agency, and for the client only when visible. Otherwise the client sees legacy published art,
   never internal art. Task 4 covers this.
5. **Existing links:** a new project opened with an old `?view=versions` link must show the
   workspace and not crash. Task 5 covers this.

---

### Task 1: Database — bucket, table, attestation and RPCs

**Files:** create `supabase/migrations/202609270001_project_covers.sql` and
`supabase/tests/database/project_covers.test.sql`, then regenerate `supabase/database.types.ts`.

**Produces:**
- `public.project_covers(project_id uuid pk, storage_path text unique, client_visible boolean, updated_by uuid, updated_at timestamptz)`
- `set_project_cover(p_project_id uuid, p_storage_path text, p_client_visible boolean default false) returns text`
- `set_project_cover_visibility(p_project_id uuid, p_client_visible boolean) returns void`
- `clear_project_cover(p_project_id uuid) returns text`
- the `project-covers` bucket and its read policy
- the `register_sanitized_asset` branch for that bucket

- [ ] **Step 1:** Write `project_covers.test.sql`. Model it on the self-contained fixture style of
  `supabase/tests/database/miro_workspace.test.sql`: an agency, a client member, an assigned
  designer, one project. Insert objects straight into `storage.objects` and attestations into
  `private.sanitized_assets` as the connecting role, the way `production_integrity.test.sql` does.
  Assert:
  1. the agency sets a cover and gets `null` back;
  2. replacing it returns the previous path;
  3. designers and clients calling any RPC get `42501`;
  4. a path with no `project-covers` attestation, or one attested for another project or by
     another user, is refused with `22023`;
  5. the client reads 0 rows while hidden, reads the row after
     `set_project_cover_visibility(true)`, and never reads `updated_by` (42501 on selecting it);
  6. the designer always reads the row;
  7. under the storage read policy, the client can select the object only while visible, and the
     designer always;
  8. `clear_project_cover` returns the path and removes the row;
  9. `register_sanitized_asset` (called as `service_role`) accepts `project-covers` + `image/png`
     and refuses `image/jpeg` for that bucket.
- [ ] **Step 2:** Run `supabase test db`. The new file is expected to fail.
- [ ] **Step 3:** Write the migration:
  - `insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('project-covers','project-covers',false,10485760,array['image/png'])`.
  - A storage select policy `project_covers_storage_read` on `storage.objects` for
    `bucket_id='project-covers'` that passes when a `public.project_covers` row with
    `storage_path=name` satisfies `private.can_produce(project_id) or (client_visible and private.can_client_channel(project_id))`.
    Wrap the check in a security definer helper `private.can_read_project_cover(text)` so RLS on
    the table does not recurse. There is no insert policy: only the service role writes.
  - The table, with RLS enabled. Its select policy uses the same condition. Revoke all from
    `public, anon, authenticated`, then grant select on every column except `updated_by` to
    `authenticated`, as in `202609260011_author_column_privileges.sql`. Grant all to
    `service_role`.
  - `create or replace` of `public.register_sanitized_asset`. Copy the latest body verbatim (find
    it with `grep -l "function public.register_sanitized_asset" supabase/migrations/*.sql | tail -1`)
    and add one line after the `delivery-files` line:
    `if p_bucket_id='project-covers' and (p_mime_type<>'image/png' or p_source_design_id is not null) then raise exception 'Unsupported sanitized cover' using errcode='22023'; end if;`
    Keep its grants.
  - `set_project_cover`:
    1. `private.assert_agency()`;
    2. the project must exist (P0002);
    3. the path must satisfy `private.storage_scope(p_storage_path)=p_project_id` and have a
       matching `private.sanitized_assets` row (`bucket_id='project-covers'`, same project,
       `prepared_by=auth.uid()`, `not discard_requested`), otherwise raise 22023
       'Prepare the cover through the media service';
    4. lock the existing row `for update`, remember its old path, upsert, audit
       `'project.cover_set'`, and return the old path (null when there was none, or when it equals
       the new one).
  - `set_project_cover_visibility`: agency only, updates the row (P0002 when none), audits.
  - `clear_project_cover`: agency only, deletes the row and returns its path (null when none),
    audits.
  - Grants as in the global constraints.
- [ ] **Step 4:** Run `supabase migration up --local` and then `supabase test db`. Only the
  baseline may fail.
- [ ] **Step 5:** Run `npm run db:types` and commit
  `feat(db): add sanitized project covers with client visibility`.

### Task 2: Media worker — `/covers/prepare` and `/covers/clear`

**Files:** modify `apps/media/src/server.js`, `apps/media/src/server.test.js` and
`apps/media/README.md`.

**Consumes:** the Task 1 RPCs.

- [ ] **Step 1:** Add failing tests in `server.test.js`, following the existing
  `/deliveries/prepare` tests and their `calls` recorder with mocked upstream routes:
  1. a PNG, JPEG or WebP body is sanitized to PNG and saved under `project-covers/<projectId>/…`;
  2. `register_sanitized_asset` is called with `p_bucket_id: 'project-covers'`;
  3. `set_project_cover` is called with the **caller's** token and `p_client_visible` taken from
     a `visible=true|false` query parameter (default `false`);
  4. the previous path it returns is deleted from `project-covers`;
  5. an RPC failure deletes the new object and returns the RPC's status;
  6. an unsupported type gets 415, and a missing or unknown project gets 404;
  7. `/covers/clear?projectId=` calls `clear_project_cover` with the caller's token and deletes
     the returned path, returning `{ cleared: true|false }`.
- [ ] **Step 2:** Implement. Add both paths to the allowed-route list at `server.js:93`. Both use
  `backend.authenticate(token)`, which is agency-only, like deliveries. Reuse `sanitizeDelivery`
  for images (read its type handling). If it returns a non-PNG for PNG/JPEG/WebP, add a small
  `sanitizeCover` in `sanitize.js` that always re-encodes to PNG with the same pipeline, and unit
  test it in `sanitize.test.js`. Save with `backend.saveSanitized(projectId, 'project-covers', …)`
  and delete with the existing `backend.discard(bucket, path)`.
- [ ] **Step 3:** Run `cd apps/media && npm test`; it must pass. Update the README endpoint list.
  If the media service runs in Docker (`docker ps | grep media`), rebuild or restart it as its
  README says, so later tasks hit the new routes. Say in the report how you did it.
- [ ] **Step 4:** Commit `feat(media): prepare and clear sanitized project covers`.

### Task 3: Web data and Project details cover block

**Files:**
- modify `apps/web/features/projects/project-data.ts` (add `useProjectCover`,
  `setProjectCoverVisibility`);
- modify `apps/web/features/projects/media-client.ts` (add `prepareProjectCover` and
  `clearProjectCover`, with tests in `media-client.test.ts`);
- create `apps/web/features/projects/project-cover.tsx` (the Cover block) and its test;
- modify `project-details.tsx` (render the block), `projects.css` and the README.

**Produces:**
- `useProjectCover(projectId)` → `{ storagePath, clientVisible, url } | null`. The signed URL
  comes from the `project-covers` bucket, following `useDesignAssetUrl`'s signing and refresh
  pattern.
- `setProjectCoverVisibility(database, { projectId, visible })`.
- `prepareProjectCover(database, mediaUrl, projectId, file, visible)` → `{ path }`.
- `clearProjectCover(database, mediaUrl, projectId)`.

- [ ] **Step 1:** Write failing tests. The Cover block shows by role:
  - **agency:** Set/Replace (hidden file input behind a button, accept `image/png,image/jpeg,image/webp`),
    a "Visible to the client" switch, and Remove with a confirm;
  - **designer:** read-only preview;
  - **client:** preview only when readable; the block is absent otherwise.

  Errors come from the media/RPC message. Invalidate `project-detail` and `projects` after every
  write, so board cards refresh.
- [ ] **Step 2:** Implement, following the existing media-client request helper
  (`requestMedia`), the upload size/type messages, and `ProjectDetails`' section markup. Styles go
  in `projects.css`.
- [ ] **Step 3:** Run `npm run check`, then commit `feat(projects): set a project cover from
  Project details`.

### Task 4: Board card uses the cover first

**Files:** modify `apps/web/features/board/board-data.ts` (a batched cover read by project IDs:
rows the viewer can read, plus signed URLs from `project-covers`) and
`apps/web/features/board/project-thumbnail.tsx` (the choice), plus their tests and the board
README.

- [ ] **Step 1:** Write failing tests for the artwork choice:
  - when a readable cover exists, it wins for every role, and the card's version label is empty
    (a cover is not a version);
  - otherwise today's rule applies unchanged;
  - a client never gets internal art. Keep the existing `project-thumbnail` tests passing.
- [ ] **Step 2:** Implement. Keep the "image and label come from one selection" invariant
  described at the top of `project-thumbnail.tsx`.
- [ ] **Step 3:** Run `npm run check`, then commit `feat(board): show the project cover on board
  cards`.

### Task 5: Versions only for existing projects

**Files:** modify `apps/web/features/projects/project-page.tsx` (and `miro-workspace.ts` if the
rule lives better there, with tests), plus every e2e spec that opens a fresh fixture project with
`?view=versions`. Find them with
`rg -l "view=versions" apps/web/tests/e2e`.

- [ ] **Step 1:** Write a failing unit test: a project without legacy versions renders
  `ProjectWorkspace` even with `?view=versions` and even when `legacyChosen` would be set. The
  agency's Versions button is absent there. Projects with legacy versions are unchanged.
- [ ] **Step 2:** Implement. `legacyRequested` and `legacyChosen` apply only when `legacyAvailable`.
- [ ] **Step 3:** In each affected spec, before navigating, create one per-deliverable version
  through the API as the agency or the assigned designer. Use `create_design_version` with the
  fixture's deliverable id; `project-fixture.ts` returns a `projectId`, and the deliverable comes
  from a `deliverables` query. Add a small helper in `tests/e2e/project-fixture.ts`, e.g.
  `seedLegacyVersion(projectId)`. Keep `?view=versions` only where the spec also relies on it.
  Do not weaken any canonical assertion.
- [ ] **Step 4:** Run `npm run check` and every edited spec with Playwright
  (`--output ../../outputs/pw-cover-t5 --reporter=line`); all must pass. Commit
  `feat(projects): keep Versions for projects that already have versions`.

### Task 6: E2E and docs

**Files:** create `apps/web/tests/e2e/project-cover.spec.ts`; modify `docs/architecture/backend.md`
(the bucket list, the table, RPCs and media routes), `docs/engineering/handoff.md` (≤ 100 lines),
and the projects and board READMEs if they are not yet accurate.

- [ ] **Step 1:** Write the spec on a `createProductionFixture` project (with `cleanupTestProject`;
  extend its SQL to delete `public.project_covers` rows for the project and to remove
  `project-covers/<projectId>/*` objects, just as it removes the other buckets):
  1. the agency opens the project, opens Project details and sets a cover from a PNG fixture file
     in `apps/web/tests/e2e/fixtures` (reuse an existing PNG);
  2. the agency's board card shows the cover image;
  3. the client's board card does not show it (and the client's network never fetches a
     `project-covers` object, following the network-recording pattern in `miro-workspace.spec.ts`);
  4. the agency switches Visible to the client on, and the client's card shows it;
  5. the assigned designer sees it;
  6. the agency replaces the cover, and the old object is gone from storage (check with
     `localAdmin.storage.from('project-covers').list(projectId)`);
  7. Remove clears it everywhere.
- [ ] **Step 2:** Run the spec twice; it must pass both times. Then run `supabase test db` and
  `npm run check`.
- [ ] **Step 3:** Update the docs, then commit
  `test(e2e): cover the project cover by role` and `docs: document project covers`.

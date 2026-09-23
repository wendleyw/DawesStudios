# Video Upload Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make video design uploads cancellable at any moment, resumable after a reload or dropped
connection, recoverable from a processing failure without re-uploading, and self-cleaning of raw
and orphaned files older than 24 hours.

**Architecture:** A new migration adds `source_path` provenance to video attestations plus two
service_role-only RPCs (an idempotent-retry lookup and a stale-video-upload sweep). The media
service gains disconnect-safe abort handling, HTTP status classes for 422/503/504/410, an
idempotent retry path, and a `POST /designs/discard-raw` route; its hourly sweep adopts the new
RPC. The browser's `artwork-files.ts` gains a project/user-scoped tus fingerprint, resume via
`findPreviousUploads`, an `AbortSignal`-driven cancel path, and one automatic retry with error
classification; `project-action-dialog.tsx` wires that into a single context-aware Cancel button
and the dialog's visible states.

**Tech Stack:** PostgreSQL/plpgsql + pgTAP (Supabase CLI), Node.js 22 + vitest (`apps/media`),
Next.js/TypeScript + vitest + Testing Library (`apps/web`), tus-js-client, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-23-video-upload-lifecycle-design.md`

## Global Constraints

- Accepted formats stay MP4/WebM only; the 1 GiB ceiling (`VIDEO_MAX_BYTES`) and the 300 s
  (`LIMITS.videoProcessMs`) / 30 s (`LIMITS.videoProbeMs`) processing budgets are unchanged.
- Retention window is exactly 24 hours for interrupted transfers, raw files, and orphaned
  processed outputs.
- Exactly one Cancel control, active during both the transfer and processing phases.
- Exactly one automatic retry for a transient processing failure; a permanently invalid file is
  never retried.
- No project-level list of interrupted uploads and no server-side attempt-records table (rejected
  option B in the spec).
- No resume across browsers or devices; resume state lives only in the chosen browser's storage.
- No change to accepted formats, permissions, scratch space, attestation mechanics, metadata
  sanitization, or image uploads.
- English for all identifiers, comments, docstrings, tests, log/error messages and docs
  (`CLAUDE.md` Language Policy); chat-facing progress updates in Brazilian Portuguese are outside
  this plan document itself, which is a project artifact and stays in English throughout.
- Supabase queries live only in `<feature>-data.ts`, except the four documented exceptions in
  `docs/architecture/data-access.md`, one of which is `features/projects/artwork-files.ts` itself
  — this plan extends that existing, documented exception rather than creating a new one.
- Write functions are plain `async (database, input)`; validation, trimming, idempotency-key
  generation and retry/abort state stay in the component (`project-action-dialog.tsx`), not in
  `artwork-files.ts` or `media-client.ts` (`docs/architecture/data-access.md` rules 3–4).
- The migration file takes the next free number after the latest migration present in
  `supabase/migrations/` **at implementation time** — verify with `ls supabase/migrations | tail`
  before creating the file. At research time the latest was
  `202609230012_client_logo_raster.sql`, so this plan names the new file
  `202609230013_video_upload_lifecycle.sql`, but the implementer must re-check first.

## Review Focus

- Choosing a *different* file after a reload must start a brand-new upload rather than resuming a
  stale upload for a different file — the fingerprint must fail to match on name/size/lastModified,
  not merely on project/user. Pinned in Task 6's fingerprint tests.
- A resumed upload whose stored `objectName` metadata is missing or does not look like a raw video
  path must fall back to a fresh upload instead of throwing and stranding the person on a dead
  dialog. Pinned in Task 6.
- Cancel arriving in the narrow window after the transfer has finished but before the processing
  call is known to have started must still discard the raw file rather than leaving an orphan —
  and, symmetrically, a cancel that arrives too late to stop a successful processing response must
  not let the dialog register a design the person just cancelled. Pinned in Task 6 and Task 7.
- A second "Try processing again" click while the first retry is still in flight must not fire a
  concurrent duplicate request — the submit control disables while `mutation.isPending`. Pinned in
  Task 7.
- The stale sweep must never remove a raw upload or an orphaned output that is younger than 24
  hours, including at the boundary, and must never remove an orphaned output a design still
  references even once it is old enough. Pinned in Task 1 (pgTAP) and Task 5 (media unit test).

---

## Facts corrected during research

Two of the "facts already mapped" in the task brief do not match the code and are corrected here
so later tasks do not repeat the error:

1. **`private.sanitized_assets` does have a `created_at` column.** It is declared in
   `supabase/migrations/202609200008_trusted_media.sql:8`
   (`created_at timestamptz not null default now()`), and `list_stale_sanitized_assets`
   (`202609200013_recoverable_asset_cleanup.sql:80`) already filters on `s.created_at` directly.
   The spec's stated reason for using `storage.objects.created_at` instead
   ("`private.sanitized_assets` has no timestamp of its own") is therefore inaccurate for the
   *attested-output* half of the new sweep. Task 1 still follows the spec's literal instruction —
   join `storage.objects.created_at` for both the raw and the attested-output branches of
   `list_stale_video_uploads` — because a raw `.raw` object has no attestation row at all and thus
   no `sanitized_assets.created_at` to read, so joining `storage.objects` uniformly for both
   branches is simpler to reason about than mixing two different timestamp sources across one
   `union all`. This is a considered choice, not an unresolved contradiction, but it is a real
   correction to the mapped fact and worth flagging to the reader.
2. **`apps/media`'s test files run on vitest, not the `node:test` runner.** `apps/media/package.json`
   declares `"test": "vitest run"` and `sanitize.test.js`/`server.test.js`/`supabase.test.js` all
   import from `'vitest'`. All new/modified media tests in this plan use `describe/it/expect` from
   `'vitest'`.

One further correction, found while designing Task 1: `register_sanitized_video`'s current
six-argument signature cannot gain a `p_source_path` parameter via `create or replace function`
the way `202609210007`'s `register_sanitized_asset` change did — that migration kept an *identical*
argument list (only the body changed), which is what let `create or replace` preserve the
function's OID. Adding a new parameter changes the signature, so `create or replace function` with
the new seven-argument list would **create a second, overloaded function** and leave the original
six-argument one (and its own grants) dangling. Task 1's migration explicitly `drop function`s the
old signature first.

---

### Task 1: Migration — `source_path` provenance, idempotent-retry lookup, and the internal-assets stale sweep

**Files:**
- Create: `supabase/migrations/202609230013_video_upload_lifecycle.sql` (verify the number first —
  see Global Constraints)
- Create: `supabase/tests/database/video_upload_lifecycle.test.sql`

**Interfaces:**
- Consumes: `private.sanitized_assets(bucket_id, storage_path, project_id, sha256, mime_type,
  file_size, prepared_by, source_design_id, source_path, created_at)` (existing table,
  `202609200008_trusted_media.sql:2-9`); `private.storage_scope(text)` and
  `private.opaque_storage_path(text)` (existing helpers); `public.designs.internal_asset_path`
  (existing column); `storage.objects(bucket_id, name, created_at, metadata)` (existing Supabase
  Storage schema).
- Produces (consumed by Task 2, Task 3, Task 5):
  - `public.register_sanitized_video(p_project_id uuid, p_storage_path text, p_sha256 text,
    p_mime_type text, p_file_size bigint, p_prepared_by uuid, p_source_path text default null)
    returns void` — replaces the existing six-argument function (which is dropped).
  - `public.find_sanitized_video_by_source(p_project_id uuid, p_source_path text) returns
    table(storage_path text, mime_type text)` — service_role only; returns at most one row, the
    most recent attested `internal-assets` output whose `source_path` equals `p_source_path` and
    whose `created_at` is within the last 24 hours; empty otherwise.
  - `public.list_stale_video_uploads() returns table(bucket_id text, storage_path text, attested
    boolean)` — service_role only; lists (a) `.raw` objects in `internal-assets` older than 24
    hours (`attested = false`), and (b) attested `internal-assets` outputs older than 24 hours that
    no `designs.internal_asset_path` references (`attested = true`).

**Before writing Step 3's migration**, confirm the spec's own precondition for case (b):
`designs.internal_asset_path` must be the only column that can reference a video object stored in
`internal-assets`. Run:

```bash
grep -rn "internal-assets\|internal_asset_path" supabase/migrations/*.sql | grep -i "references\|foreign key\|storage_path\|asset_path" 
```

and independently confirm by reading `202609200002_workflows.sql` (or wherever `public.designs` is
defined) and every table created after it, that no column besides `designs.internal_asset_path`
stores a path into the `internal-assets` bucket for a video object (`private.sanitized_assets`
itself is not a concern here — it is what `list_stale_video_uploads` already queries, not a second
referencing table). If another such column exists, add its own `not exists(...)` clause to case
(b) in Step 3's `list_stale_video_uploads` body, alongside the existing `designs` check, before
this task is considered complete.

- [ ] **Step 1: Write the failing pgTAP file**

```sql
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(11);

-- Video upload lifecycle: `register_sanitized_video` now records `source_path`, and two new
-- service_role-only functions support the retry-idempotency and cleanup halves of the design
-- (docs/superpowers/specs/2026-09-23-video-upload-lifecycle-design.md). Reuses the seeded SABRE
-- "Campaign Landing Page" project/design fixtures the same way
-- video_provenance_attestation.test.sql does; this file's own begin;/rollback; keeps its
-- mutations from being seen by, or seeing, theirs.

select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;

insert into storage.objects(bucket_id,name,metadata)
values('internal-assets',
       md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-output-1')::uuid::text||'.mp4',
       '{"size":4194304}');

-- 1. register_sanitized_video records the raw path it was produced from.
select lives_ok($$
  select public.register_sanitized_video(
    md5('dawes:project-sabre-campaign-landing-page')::uuid,
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-output-1')::uuid::text||'.mp4',
    repeat('c',64), 'video/mp4', 4194304,
    md5('dawes:agency')::uuid,
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-1')::uuid::text||'.raw')
$$, 'register_sanitized_video accepts a source_path argument');

select is(
  (select source_path from private.sanitized_assets
    where bucket_id='internal-assets'
      and storage_path=md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-output-1')::uuid::text||'.mp4'),
  md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-1')::uuid::text||'.raw',
  'the attestation carries the exact raw path it was produced from'
);

reset role;

-- 2. Only service_role may execute the two new functions.
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select throws_ok($$ select public.list_stale_video_uploads() $$, '42501', 'Trusted media service required', 'an authenticated session cannot list stale video uploads');
select throws_ok($$
  select public.find_sanitized_video_by_source(
    md5('dawes:project-sabre-campaign-landing-page')::uuid,
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-1')::uuid::text||'.raw')
$$, '42501', 'Trusted media service required', 'an authenticated session cannot look up a sanitized video by source');
reset role;

select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;

-- 3. find_sanitized_video_by_source finds the fresh attestation by its exact source_path.
select results_eq($$
  select storage_path, mime_type from public.find_sanitized_video_by_source(
    md5('dawes:project-sabre-campaign-landing-page')::uuid,
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-1')::uuid::text||'.raw')
$$, $$
  select md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-output-1')::uuid::text||'.mp4', 'video/mp4'
$$, 'a fresh attestation is found by its exact source_path');

-- 4. A different source_path finds nothing.
select is(
  (select count(*)::int from public.find_sanitized_video_by_source(
    md5('dawes:project-sabre-campaign-landing-page')::uuid,
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:some-other-raw')::uuid::text||'.raw')),
  0, 'an unrelated source_path finds nothing'
);

-- 5. Backdate the attestation past 24 hours: the idempotent lookup must stop finding it.
update private.sanitized_assets set created_at = now() - interval '25 hours'
 where bucket_id='internal-assets'
   and storage_path=md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-output-1')::uuid::text||'.mp4';
select is(
  (select count(*)::int from public.find_sanitized_video_by_source(
    md5('dawes:project-sabre-campaign-landing-page')::uuid,
    md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-1')::uuid::text||'.raw')),
  0, 'an attestation older than 24 hours is no longer offered for idempotent retry'
);

-- 6. The same backdated, unreferenced attestation is exactly what the stale sweep must list, with
-- attested=true.
select ok(
  exists(select 1 from public.list_stale_video_uploads() stale
          where stale.bucket_id='internal-assets'
            and stale.storage_path=md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-output-1')::uuid::text||'.mp4'
            and stale.attested),
  'a stale, unreferenced attested output is listed with attested=true'
);

-- 7. A design referencing that same object excludes it, even once it is old enough.
update public.designs set internal_asset_path=md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-output-1')::uuid::text||'.mp4'
 where id=md5('dawes:design-sabre-campaign-landing-page-2-0')::uuid;
select ok(
  not exists(select 1 from public.list_stale_video_uploads() stale
              where stale.storage_path=md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-output-1')::uuid::text||'.mp4'),
  'an attested output a design still references is never listed as stale'
);
update public.designs set internal_asset_path=null
 where id=md5('dawes:design-sabre-campaign-landing-page-2-0')::uuid;

-- 8. A raw .raw object with no attestation row at all: old enough is listed with attested=false;
-- young is not listed.
insert into storage.objects(bucket_id,name,metadata)
values('internal-assets',
       md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-old')::uuid::text||'.raw',
       '{"size":1048576}');
update storage.objects set created_at = now() - interval '25 hours'
 where bucket_id='internal-assets' and name=md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-old')::uuid::text||'.raw';
insert into storage.objects(bucket_id,name,metadata)
values('internal-assets',
       md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-fresh')::uuid::text||'.raw',
       '{"size":1048576}');

select ok(
  exists(select 1 from public.list_stale_video_uploads() stale
          where stale.storage_path=md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-old')::uuid::text||'.raw'
            and not stale.attested),
  'a raw upload older than 24 hours is listed with attested=false'
);
select ok(
  not exists(select 1 from public.list_stale_video_uploads() stale
              where stale.storage_path=md5('dawes:project-sabre-campaign-landing-page')::uuid::text||'/'||md5('dawes:lifecycle-raw-fresh')::uuid::text||'.raw'),
  'a raw upload younger than 24 hours is never listed'
);

reset role;
select * from finish();
rollback;
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm run db:test`
Expected: FAIL — `function public.register_sanitized_video(uuid, text, text, text, bigint, uuid,
text) does not exist` (or an equivalent "function does not exist" error for
`list_stale_video_uploads`/`find_sanitized_video_by_source`), because the migration below has not
been written yet.

- [ ] **Step 3: Write the migration**

```sql
-- Video upload lifecycle: source_path provenance for retry idempotency, and a service_role-only
-- sweep for internal-assets objects the existing list_stale_sanitized_assets deliberately
-- excludes (see 202609210007's comment on that exclusion). Raw .raw uploads never get an
-- attestation row at all, and an attested internal video is provenance with "no TTL" by that same
-- comment -- so cleaning either one needs its own path, scoped to internal-assets only, rather
-- than widening the existing sweep's meaning.
-- docs/superpowers/specs/2026-09-23-video-upload-lifecycle-design.md

-- 1. register_sanitized_video gains p_source_path, so a later retry can find the exact output a
-- given raw upload already produced. The parameter list changes, so this cannot be a same-
-- signature create or replace the way 202609210007 kept for register_sanitized_asset -- the old
-- six-argument overload is dropped explicitly, rather than left behind as dead, still-granted
-- surface nothing calls.
drop function public.register_sanitized_video(uuid,text,text,text,bigint,uuid);
create function public.register_sanitized_video(
  p_project_id uuid, p_storage_path text, p_sha256 text, p_mime_type text,
  p_file_size bigint, p_prepared_by uuid, p_source_path text default null
) returns void language plpgsql security definer set search_path='' as $$
 begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted media service required' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_prepared_by and role in ('agency','designer')) then raise exception 'Production preparation identity required'; end if;
 if p_mime_type not in ('video/mp4','video/webm') then raise exception 'Unsupported sanitized video type'; end if;
 if private.storage_scope(p_storage_path)<>p_project_id or not private.opaque_storage_path(p_storage_path) then raise exception 'Invalid sanitized storage path'; end if;
 if p_source_path is not null and (private.storage_scope(p_source_path)<>p_project_id or not private.opaque_storage_path(p_source_path)) then raise exception 'Invalid source storage path'; end if;
 if not exists(select 1 from storage.objects where bucket_id='internal-assets' and name=p_storage_path and (metadata->>'size')::bigint=p_file_size) then raise exception 'Sanitized object is missing or its size differs'; end if;
 if exists(select 1 from private.sanitized_assets s where s.bucket_id='internal-assets' and s.storage_path=p_storage_path) then
  if exists(select 1 from private.sanitized_assets s where s.bucket_id='internal-assets' and s.storage_path=p_storage_path and s.sha256=p_sha256 and s.file_size=p_file_size and s.mime_type=p_mime_type and s.prepared_by=p_prepared_by and s.source_path is not distinct from p_source_path) then return; end if;
  raise exception 'Sanitized asset registration conflicts with existing bytes';
 end if;
 insert into private.sanitized_assets(bucket_id,storage_path,project_id,sha256,mime_type,file_size,prepared_by,source_design_id,source_path)
   values('internal-assets',p_storage_path,p_project_id,p_sha256,p_mime_type,p_file_size,p_prepared_by,null,p_source_path);
 end
$$;
revoke all on function public.register_sanitized_video(uuid,text,text,text,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.register_sanitized_video(uuid,text,text,text,bigint,uuid,text) to service_role;

-- 2. The idempotent-retry lookup. `private` is not exposed to PostgREST (supabase/config.toml
-- exposes public alone), so the media service -- which only ever speaks REST/RPC, never a direct
-- Postgres connection -- needs a function to ask "has this exact raw path already produced an
-- attested output?" the same way it already needs one to write that attestation.
create function public.find_sanitized_video_by_source(p_project_id uuid, p_source_path text) returns table(storage_path text, mime_type text) language plpgsql security definer set search_path='' as $$
 begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted media service required' using errcode='42501'; end if;
 return query select s.storage_path, s.mime_type from private.sanitized_assets s
   where s.bucket_id='internal-assets' and s.project_id=p_project_id and s.source_path=p_source_path
     and s.created_at>now()-interval '24 hours'
   order by s.created_at desc limit 1;
 end
$$;
revoke all on function public.find_sanitized_video_by_source(uuid,text) from public,anon,authenticated;
grant execute on function public.find_sanitized_video_by_source(uuid,text) to service_role;

-- 3. The cleanup sweep for internal-assets: raw .raw uploads (never attested, aged off
-- storage.objects.created_at since they have no attestation row to carry their own timestamp) and
-- attested outputs no design references any more. `attested` tells the caller which discard path
-- applies -- a raw object was never part of the attestation lifecycle, so routing it through
-- discard_sanitized_asset/finalize_asset_discard would be two guaranteed no-op RPC calls per file,
-- not a correctness requirement.
create function public.list_stale_video_uploads() returns table(bucket_id text, storage_path text, attested boolean) language plpgsql security definer set search_path='' as $$
 begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted media service required' using errcode='42501'; end if;
 return query
   select stale.bucket_id, stale.storage_path, stale.attested from (
     select 'internal-assets'::text as bucket_id, o.name as storage_path, false as attested, o.created_at as staleness
       from storage.objects o
      where o.bucket_id='internal-assets' and o.name like '%.raw' and o.created_at<now()-interval '24 hours'
     union all
     select s.bucket_id, s.storage_path, true, o.created_at
       from private.sanitized_assets s
       join storage.objects o on o.bucket_id=s.bucket_id and o.name=s.storage_path
      where s.bucket_id='internal-assets' and o.created_at<now()-interval '24 hours'
        and not exists(select 1 from public.designs d where d.internal_asset_path=s.storage_path)
   ) stale order by stale.staleness limit 100;
 end
$$;
revoke all on function public.list_stale_video_uploads() from public,anon,authenticated;
grant execute on function public.list_stale_video_uploads() to service_role;
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm run db:test`
Expected: `video_upload_lifecycle.test.sql` reports `11/11` passed, and every pre-existing pgTAP file
still passes (in particular `video_provenance_attestation.test.sql`,
`video_asset_registration.test.sql` and `video_storage.test.sql`, since this migration touches
`register_sanitized_video`, a function those files also exercise). The canonical-count file stays
expected-failing under the SABRE overlay per `CLAUDE.md` and
`supabase/demo/sabre/README.md` — that is a pre-existing, documented condition, not a regression
from this task.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202609230013_video_upload_lifecycle.sql supabase/tests/database/video_upload_lifecycle.test.sql
git commit -m "feat(db): record video source_path and add the internal-assets stale-upload sweep"
```

---

### Task 2: Media — error classes (422/503/504) and the idempotent retry lookup

**Files:**
- Modify: `apps/media/src/sanitize.js:115-202` (`runMediaTool`, `sanitizeVideo`; extract
  `probeVideo`)
- Modify: `apps/media/src/supabase.js:27-40` (`request`), `apps/media/src/supabase.js:84-97`
  (`downloadToFile`, `uploadFile`), `apps/media/src/supabase.js:181-189`
  (`registerSanitizedVideo`), `apps/media/src/supabase.js:205` (`createBackend` return object)
- Modify: `apps/media/src/server.js:147-210` (`/designs/sanitize-video` handler)
- Test: `apps/media/src/sanitize.test.js`, `apps/media/src/supabase.test.js`,
  `apps/media/src/server.test.js`

**Interfaces:**
- Consumes: `public.find_sanitized_video_by_source(uuid, text)` (Task 1).
- Produces (consumed by Task 3, Task 5):
  - `sanitize.js`: `export async function probeVideo(inputPath, mimeType, signal) →
    Promise<{durationSeconds, width, height}>`; `sanitizeVideo(inputPath, outputPath, mimeType,
    maxBytes = LIMITS.videoBytes, signal)` (adds the trailing `signal` parameter; return shape
    unchanged).
  - `supabase.js`: `request(path, { ..., signal, passthroughStatuses = [] })` (two new options);
    `downloadToFile(path, projectId, token, destination, signal)`; `uploadFile(bucket, path,
    filePath, mimeType, signal)`; `registerSanitizedVideo(projectId, path, uploaded, mimeType,
    userId, sourcePath)` (adds `sourcePath`, passed through as `p_source_path`); new
    `findSanitizedVideoBySource(projectId, sourcePath, token) → Promise<{storage_path, mime_type}
    | null>`.
  - `server.js`: content ffprobe/ffmpeg failures now respond `422` (and, in Task 3, trigger a raw
    discard); a missing raw object responds `410`; download/upload/storage failures respond `503`;
    a timeout responds `504`. The success/attestation/discard call order from the existing
    happy-path test is unchanged.

- [ ] **Step 1: Write the failing tests for `probeVideo` and the 422 status**

Add to `apps/media/src/sanitize.test.js`, inside `describe('sanitizeVideo', ...)`:

```js
  it('returns 422 for a file whose container does not match its declared type', async () => {
    const input = join(dir, 'liar.mp4');
    await writeFile(input, Buffer.from('this is not a video'));
    await expect(sanitizeVideo(input, join(dir, 'out.mp4'), 'video/mp4')).rejects.toMatchObject({ status: 422 });
  });

  it('exposes probeVideo so a caller can re-probe an already-sanitized file without re-running ffmpeg', async () => {
    const input = resolve(import.meta.dirname, 'fixtures/tagged.mp4');
    const probe = await probeVideo(input, 'video/mp4');
    expect(probe.width).toBe(320);
    expect(probe.height).toBe(240);
    expect(probe.durationSeconds).toBeGreaterThan(1.5);
  });
```

Add the import: change the `sanitize.js` import line to also pull in `probeVideo`:

```js
import { LIMITS, MediaError, probeVideo, sanitizeDelivery, sanitizePdf, sanitizeRaster, sanitizeVideo } from './sanitize.js';
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd apps/media && npx vitest run sanitize.test.js`
Expected: FAIL — `probeVideo is not defined` (no such export yet), and the 422 test fails because
the existing code throws with the default status `400`, not `422`.

- [ ] **Step 3: Extract `probeVideo` and add status codes**

In `apps/media/src/sanitize.js`, replace `runMediaTool` and `sanitizeVideo`:

```js
async function runMediaTool(tool, args, timeoutMs, failure, failureStatus = 400, signal) {
  try {
    return await execFileAsync(tool, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024, env: { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C' }, windowsHide: true, signal });
  } catch { throw new MediaError(failure, failureStatus); }
}

const videoCodecs = Object.freeze({ 'video/mp4': ['h264'], 'video/webm': ['vp8', 'vp9', 'av1'] });

/**
 * Reads a video's codec, dimensions and duration without touching its bytes beyond the container
 * headers. Split out of `sanitizeVideo` so the idempotent-retry path (server.js) can re-derive the
 * response's `{durationSeconds, width, height}` for an already-sanitized object without running
 * ffmpeg again -- "without running ffmpeg again" is the literal requirement; ffprobe still runs,
 * bounded by the same LIMITS.videoProbeMs budget either way.
 *
 * ffprobe failing to read the container, or the container missing the dimensions/duration a player
 * needs, is content ffmpeg or ffprobe rejects -- it can never succeed on retry -- so both return
 * 422. A codec that does not match the declared MIME type is the type check, and stays 415.
 */
export async function probeVideo(inputPath, mimeType, signal) {
  const codecs = videoCodecs[mimeType];
  if (!codecs) throw new MediaError('Upload an MP4 or WebM video.', 415);
  const { stdout } = await runMediaTool('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height', '-show_entries', 'format=duration',
    '-of', 'json', inputPath,
  ], LIMITS.videoProbeMs, 'The video could not be read.', 422, signal);
  const probe = JSON.parse(stdout);
  const stream = probe.streams?.[0];
  if (!stream || !codecs.includes(stream.codec_name))
    throw new MediaError('The file is not a playable MP4 or WebM video.', 415);
  const width = Number(stream.width);
  const height = Number(stream.height);
  const durationSeconds = Number(probe.format?.duration);
  if (!width || !height || !Number.isFinite(durationSeconds))
    throw new MediaError('The video is missing the dimensions or duration a player needs.', 422);
  return { durationSeconds, width, height };
}

export async function sanitizeVideo(inputPath, outputPath, mimeType, maxBytes = LIMITS.videoBytes, signal) {
  const { size } = await stat(inputPath);
  if (!size || size > maxBytes)
    throw new MediaError('Videos must be between 1 byte and 1 gigabyte.', 413);
  const probe = await probeVideo(inputPath, mimeType, signal);

  const args = [
    '-v', 'error', '-nostdin', '-y', '-i', inputPath,
    '-map_metadata', '-1', '-map_metadata:s', '-1', '-map_chapters', '-1', '-c', 'copy',
  ];
  if (mimeType === 'video/mp4') args.push('-movflags', '+faststart');
  args.push(outputPath);

  try {
    await runMediaTool('ffmpeg', args, LIMITS.videoProcessMs, 'The video could not be safely regenerated.', 422, signal);
  } catch (error) {
    await unlink(outputPath).catch(unlinkError => { if (unlinkError.code !== 'ENOENT') throw unlinkError; });
    throw error;
  }
  return probe;
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd apps/media && npx vitest run sanitize.test.js`
Expected: PASS, including the three pre-existing `sanitizeVideo` tests (none of them assert an
exact status code or check-ordering, so the reordering of the mimeType/codec check into
`probeVideo` is safe — verified by reading those tests before this change).

- [ ] **Step 5: Write the failing tests for `request`'s `passthroughStatuses` and `signal`**

Add to `apps/media/src/supabase.test.js` (follow the file's existing `createBackend`/fetch-stub
pattern — read the top of the file for the exact stub shape before writing this):

```js
  it('preserves a passthrough status instead of collapsing it to 502', async () => {
    globalThis.fetch = async () => new Response('not found', { status: 404 });
    const backend = createBackend({ supabaseUrl: 'http://supabase.test', anonKey: 'anon', serviceKey: 'service' });
    await expect(backend.downloadToFile(
      `${projectId}/${md5Uuid('missing')}.raw`, projectId, 'token', '/dev/null',
    )).rejects.toMatchObject({ status: 404 });
  });
```

(This test lives in the same `describe` block that already exercises `downloadToFile`/`uploadFile`
— reuse that block's existing `projectId`/`md5Uuid` helpers rather than redefining them.)

- [ ] **Step 6: Run the test and verify it fails**

Run: `cd apps/media && npx vitest run supabase.test.js`
Expected: FAIL — the current `request()` collapses every non-401/403 failure to `502`, so the
rejection's `status` is `502`, not `404`.

- [ ] **Step 7: Add `passthroughStatuses` and `signal` to `request`, `downloadToFile`, `uploadFile`**

In `apps/media/src/supabase.js`, replace the `request` function and the two video-transfer
functions:

```js
  async function request(path, { token, method = 'GET', data, binary, mimeType, duplex, timeoutMs = 30_000, signal, passthroughStatuses = [] } = {}) {
    const response = await fetch(root + path, {
      method,
      signal: signal ? AbortSignal.any([AbortSignal.timeout(timeoutMs), signal]) : AbortSignal.timeout(timeoutMs),
      redirect: 'error',
      headers: { apikey: config.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': mimeType ?? 'application/json' },
      body: binary ?? (data === undefined ? undefined : JSON.stringify(data)),
      ...(duplex ? { duplex } : {}),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (passthroughStatuses.includes(response.status)) throw new MediaError('The storage object was not found.', response.status);
      throw new MediaError(response.status === 401 || response.status === 403 ? 'Access denied.' : 'The storage operation could not be completed.', response.status === 401 || response.status === 403 ? response.status : 502);
    }
    return response;
  }
```

```js
  async function downloadToFile(path, projectId, token, destination, signal) {
    if (!VIDEO_ASSET_PATH.test(path) || path.split('/')[0] !== projectId) throw new MediaError('Asset path must belong to the project.');
    const response = await request(`/storage/v1/object/authenticated/internal-assets/${path}`, { token, timeoutMs: LIMITS.videoProcessMs, signal, passthroughStatuses: [404] });
    const contentLength = Number(response.headers.get('content-length'));
    if (!contentLength || contentLength > LIMITS.videoBytes) { await response.body?.cancel().catch(() => {}); throw new MediaError('Source exceeds the file-size limit.', 413); }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
  }
```

In `uploadFile`, add `signal` as a fifth parameter and thread it into the one `request(...)` call
inside it: change `async function uploadFile(bucket, path, filePath, mimeType) {` to
`async function uploadFile(bucket, path, filePath, mimeType, signal) {`, and change the `request`
call's options object from `{ method: 'POST', token: config.serviceKey, binary: body, mimeType,
duplex: 'half', timeoutMs: LIMITS.videoProcessMs }` to `{ method: 'POST', token: config.serviceKey,
binary: body, mimeType, duplex: 'half', timeoutMs: LIMITS.videoProcessMs, signal }`. No other line
in `uploadFile` changes.

- [ ] **Step 8: Run the test and verify it passes**

Run: `cd apps/media && npx vitest run supabase.test.js`
Expected: PASS, including every pre-existing test in the file (`passthroughStatuses` defaults to
`[]`, so every caller that does not opt in keeps today's collapsing behavior unchanged).

- [ ] **Step 9: Write the failing test for `registerSanitizedVideo`'s new `sourcePath` argument and `findSanitizedVideoBySource`**

Add to `apps/media/src/supabase.test.js`:

```js
  it('passes source_path through to register_sanitized_video', async () => {
    const calls = [];
    globalThis.fetch = async (input, init = {}) => {
      calls.push({ url: typeof input === 'string' ? input : input.url, body: init.body });
      return new Response('null', { status: 200 });
    };
    const backend = createBackend({ supabaseUrl: 'http://supabase.test', anonKey: 'anon', serviceKey: 'service' });
    await backend.registerSanitizedVideo(projectId, `${projectId}/clean.mp4`, { sha256: 'a'.repeat(64), fileSize: 10 }, 'video/mp4', 'user-1', `${projectId}/raw.raw`);
    const rpcCall = calls.find(call => call.url.endsWith('/rest/v1/rpc/register_sanitized_video'));
    expect(JSON.parse(rpcCall.body).p_source_path).toBe(`${projectId}/raw.raw`);
  });

  it('finds an attested video by its source_path', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify([{ storage_path: `${projectId}/clean.mp4`, mime_type: 'video/mp4' }]), { status: 200 });
    const backend = createBackend({ supabaseUrl: 'http://supabase.test', anonKey: 'anon', serviceKey: 'service' });
    const found = await backend.findSanitizedVideoBySource(projectId, `${projectId}/raw.raw`, 'token');
    expect(found).toEqual({ storage_path: `${projectId}/clean.mp4`, mime_type: 'video/mp4' });
  });

  it('returns null when no attested video matches the source_path', async () => {
    globalThis.fetch = async () => new Response('[]', { status: 200 });
    const backend = createBackend({ supabaseUrl: 'http://supabase.test', anonKey: 'anon', serviceKey: 'service' });
    expect(await backend.findSanitizedVideoBySource(projectId, `${projectId}/raw.raw`, 'token')).toBeNull();
  });

  it('returns null rather than throwing when the RPC response body is a bare null', async () => {
    // The generic `POST /rest/v1/rpc/` stub every other test in server.test.js's sanitize-video
    // suite already relies on responds `jsonResponse(200, null)` for RPCs that return void. This
    // function calls a `returns table(...)` RPC through that same generic path whenever a test does
    // not stub it specifically, so it must tolerate a null body rather than crash on `rows[0]`.
    globalThis.fetch = async () => new Response('null', { status: 200 });
    const backend = createBackend({ supabaseUrl: 'http://supabase.test', anonKey: 'anon', serviceKey: 'service' });
    expect(await backend.findSanitizedVideoBySource(projectId, `${projectId}/raw.raw`, 'token')).toBeNull();
  });
```

- [ ] **Step 10: Run the tests and verify they fail**

Run: `cd apps/media && npx vitest run supabase.test.js`
Expected: FAIL — `registerSanitizedVideo` does not accept a sixth argument yet, and
`backend.findSanitizedVideoBySource` is not a function.

- [ ] **Step 11: Add `sourcePath` and `findSanitizedVideoBySource`**

In `apps/media/src/supabase.js`, replace `registerSanitizedVideo` and add
`findSanitizedVideoBySource`, then add both to `createBackend`'s return object:

```js
  async function registerSanitizedVideo(projectId, path, uploaded, mimeType, userId, sourcePath) {
    try {
      await rpc('register_sanitized_video', {
        p_project_id: projectId, p_storage_path: path, p_sha256: uploaded.sha256,
        p_mime_type: mimeType, p_file_size: uploaded.fileSize, p_prepared_by: userId,
        p_source_path: sourcePath ?? null,
      }, config.serviceKey);
      return path;
    } catch (error) { await discard('internal-assets', path); throw error; }
  }
  async function findSanitizedVideoBySource(projectId, sourcePath, token) {
    const rows = await rpc('find_sanitized_video_by_source', { p_project_id: projectId, p_source_path: sourcePath }, token);
    return Array.isArray(rows) ? (rows[0] ?? null) : null;
  }
```

```js
  return { json, rpc, identify, authenticate, canProduce, downloadInternal, downloadToFile, uploadFile, saveSanitized, registerCopied, registerSanitizedVideo, findSanitizedVideoBySource, discard, discardPrepared, cleanStaleAssets };
```

(`discardRaw` and `cleanStaleVideoUploads` are added to this same return object in Task 4 and Task
5 respectively — do not add them here.)

- [ ] **Step 12: Run the tests and verify they pass**

Run: `cd apps/media && npx vitest run supabase.test.js`
Expected: PASS.

- [ ] **Step 13: Write the failing server-level tests for 422/503/504/410 and the idempotent retry**

Add to `apps/media/src/server.test.js`, inside `describe('once the project and the raw upload are
accepted', ...)` (reuse `baseRoutes()`, `stubSupabase`, `post`, exactly as the existing tests in
that block do):

```js
    it('returns 422 and discards the raw upload for content ffprobe rejects', async () => {
      const routes = baseRoutes();
      let discardedPaths = [];
      stubSupabase(new Proxy(routes, {
        get(target, key) {
          if (key in target) return target[key];
          if (key === `GET /storage/v1/object/authenticated/internal-assets/${rawPath}`) return () => new Response(Buffer.from('not a video'), { status: 200, headers: { 'content-length': '11' } });
          if (typeof key === 'string' && key.startsWith(`POST /rest/v1/rpc/`)) return () => jsonResponse(200, null);
          if (typeof key === 'string' && key.startsWith(`DELETE /storage/v1/object/internal-assets`)) {
            return (url, init) => { discardedPaths.push(JSON.parse(init.body).prefixes); return jsonResponse(200, {}); };
          }
          return undefined;
        },
      }));
      const response = await post('/designs/sanitize-video', { projectId, rawPath, mimeType: 'video/mp4' });
      expect(response.status).toBe(422);
      expect(discardedPaths.flat()).toContain(rawPath);
    });

    it('returns 410 for a raw upload that no longer exists in storage', async () => {
      const routes = baseRoutes();
      stubSupabase({
        ...routes,
        [`GET /storage/v1/object/authenticated/internal-assets/${rawPath}`]: () => new Response('not found', { status: 404 }),
      });
      const response = await post('/designs/sanitize-video', { projectId, rawPath, mimeType: 'video/mp4' });
      expect(response.status).toBe(410);
    });

    it('returns the existing attested output without re-running ffmpeg when one is found for this source_path', async () => {
      const routes = baseRoutes();
      const cleanPath = `${projectId}/${md5Uuid('already-clean')}.mp4`;
      let ffmpegRequested = false;
      stubSupabase(new Proxy(routes, {
        get(target, key) {
          if (key in target) return target[key];
          if (key === 'POST /rest/v1/rpc/find_sanitized_video_by_source') return () => jsonResponse(200, [{ storage_path: cleanPath, mime_type: 'video/mp4' }]);
          if (key === `GET /storage/v1/object/authenticated/internal-assets/${cleanPath}`) return () => new Response(rawBytes, { status: 200, headers: { 'content-length': String(rawBytes.length) } });
          if (typeof key === 'string' && key.startsWith(`POST /storage/v1/object/internal-assets/${projectId}/`)) { ffmpegRequested = true; return () => jsonResponse(200, {}); }
          if (typeof key === 'string' && key.startsWith(`POST /rest/v1/rpc/`)) return () => jsonResponse(200, null);
          if (typeof key === 'string' && key.startsWith(`DELETE /storage/v1/object/internal-assets`)) return () => jsonResponse(200, {});
          return undefined;
        },
      }));
      const response = await post('/designs/sanitize-video', { projectId, rawPath, mimeType: 'video/mp4' });
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.path).toBe(cleanPath);
      expect(typeof body.durationSeconds).toBe('number');
      // No fresh clean object was ever uploaded: the existing attestation's path was returned
      // as-is, proving ffmpeg did not run a second time.
      expect(ffmpegRequested).toBe(false);
      expect(calls.some(call => call.method === 'POST' && call.path === '/rest/v1/rpc/register_sanitized_video')).toBe(false);
    });
```

- [ ] **Step 14: Run the tests and verify they fail**

Run: `cd apps/media && npx vitest run server.test.js`
Expected: FAIL on all three — the route does not yet call `find_sanitized_video_by_source`, does
not remap a 404 download to 410, and does not discard the raw file on a 422.

- [ ] **Step 15: Wire the idempotent lookup and status classification into the route**

In `apps/media/src/server.js`, add near the top (after the `RAW_VIDEO_PATH` declaration):

```js
function remapTransportFailure(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return new MediaError('The media service timed out. Try again.', 504);
  if (error instanceof MediaError && error.status === 502) return new MediaError('The media service could not reach storage. Try again.', 503);
  return error;
}
async function downloadRawOrDie(backend, rawPath, projectId, token, destination, signal) {
  try {
    await backend.downloadToFile(rawPath, projectId, token, destination, signal);
  } catch (error) {
    if (error instanceof MediaError && error.status === 404) throw new MediaError('The raw upload has expired. Choose the file again.', 410);
    throw remapTransportFailure(error);
  }
}
```

Replace the body of the `if (url.pathname === '/designs/sanitize-video')` block (everything from
after the `canProduce`/project-existence checks through the closing `}` before the
`const projectId = validId(...)` line that starts the delivery route) with:

```js
        const extension = mimeType === 'video/mp4' ? 'mp4' : 'webm';
        const directory = await mkdtemp(join(tmpdir(), 'dawes-video-'));
        try {
          const existing = await backend.findSanitizedVideoBySource(projectId, rawPath, token);
          if (existing) {
            const probeInput = join(directory, `probe.${extension}`);
            await downloadRawOrDie(backend, existing.storage_path, projectId, token, probeInput);
            const probe = await probeVideo(probeInput, existing.mime_type);
            try { await backend.discard('internal-assets', rawPath); } catch {
              process.stderr.write(`Raw video discard failed for ${rawPath}; a duplicate remains in internal-assets.\n`);
            }
            return send(200, { path: existing.storage_path, ...probe });
          }

          const input = join(directory, `in.${extension}`);
          const output = join(directory, `out.${extension}`);
          await downloadRawOrDie(backend, rawPath, projectId, token, input);
          let probe;
          try {
            probe = await sanitizeVideo(input, output, mimeType);
          } catch (error) {
            if (error instanceof MediaError && error.status === 422) {
              await backend.discard('internal-assets', rawPath).catch(() => {});
            }
            throw error;
          }
          const path = `${projectId}/${randomUUID()}.${extension}`;
          let uploaded;
          try {
            uploaded = await backend.uploadFile('internal-assets', path, output, mimeType);
          } catch (error) {
            await backend.discard('internal-assets', path).catch(() => {});
            throw remapTransportFailure(error);
          }
          await backend.registerSanitizedVideo(projectId, path, uploaded, mimeType, userId, rawPath);
          try {
            await backend.discard('internal-assets', rawPath);
          } catch {
            process.stderr.write(`Raw video discard failed for ${rawPath}; a duplicate remains in internal-assets.\n`);
          }
          return send(200, { path, ...probe });
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
```

Update the import line to add `probeVideo`:

```js
import { LIMITS, MediaError, probeVideo, sanitizeDelivery, sanitizeRaster, sanitizeVideo } from './sanitize.js';
```

(The `AbortController`/`request.on('close', ...)` wiring that threads a `signal` into
`downloadRawOrDie`, `probeVideo` and `sanitizeVideo` is Task 3's job, not this task's — this step
intentionally calls them with no `signal` yet, matching the existing behavior for everything except
status codes.)

- [ ] **Step 16: Run the tests and verify they pass**

Run: `cd apps/media && npx vitest run server.test.js`
Expected: PASS, including every pre-existing test in `describe('POST /designs/sanitize-video', ...)`
— in particular the happy-path test's assertion on call ordering (upload → register →
discard-raw), which this rewrite preserves exactly.

- [ ] **Step 17: Commit**

```bash
git add apps/media/src/sanitize.js apps/media/src/supabase.js apps/media/src/server.js apps/media/src/sanitize.test.js apps/media/src/supabase.test.js apps/media/src/server.test.js
git commit -m "feat(media): classify sanitize-video failures as 422/503/504/410 and add idempotent retry"
```

---

### Task 3: Media — disconnect abort (keep the raw file, kill ffmpeg, drop partial output)

**Files:**
- Modify: `apps/media/src/server.js` (the `/designs/sanitize-video` block from Task 2)
- Test: `apps/media/src/server.test.js`, `apps/media/src/sanitize.test.js`

**Interfaces:**
- Consumes: `probeVideo(inputPath, mimeType, signal)`, `sanitizeVideo(..., signal)`,
  `downloadToFile(..., signal)`, `uploadFile(..., signal)` (Task 2 — all already accept a trailing
  `signal`; this task is the first to actually pass one).
- Produces: no new exported names. The route now creates one `AbortController` per request, tied to
  the client connection, and threads its `signal` through every `backend`/`sanitizeVideo` call in
  the block.

- [ ] **Step 1: Write the failing unit test for signal propagation in `sanitizeVideo`**

Add to `apps/media/src/sanitize.test.js`, inside `describe('sanitizeVideo', ...)`:

```js
  it('aborts the ffmpeg remux and removes any partial output when the signal fires', async () => {
    const input = resolve(import.meta.dirname, 'fixtures/tagged.mp4');
    const output = join(dir, 'clean.mp4');
    const controller = new AbortController();
    controller.abort();
    await expect(sanitizeVideo(input, output, 'video/mp4', undefined, controller.signal)).rejects.toThrow();
    expect(await exists(output)).toBe(false);
  });
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd apps/media && npx vitest run sanitize.test.js`
Expected: FAIL — `sanitizeVideo` accepts a `signal` parameter (added in Task 2) but never forwards
it to `probeVideo`'s own `runMediaTool` call for the ffprobe step, so an already-aborted signal is
silently ignored and the remux runs to completion instead of rejecting.

Note: Task 2 already threads `signal` into `sanitizeVideo`'s own `runMediaTool('ffmpeg', ...)` call
and into `probeVideo`'s parameter list — if Step 2 unexpectedly passes already, inspect whether
`probeVideo`'s `runMediaTool('ffprobe', ...)` call is actually forwarding `signal` (the last
positional argument); this is the one spot Task 2 could have left disconnected, since `probeVideo`
runs before the ffmpeg step and an abort during the (much shorter) probe must reject the same way.

- [ ] **Step 3: Confirm (or fix) the signal forwarding**

Verify `apps/media/src/sanitize.js`'s `probeVideo` passes `signal` as the sixth argument to its
`runMediaTool('ffprobe', ...)` call, and `sanitizeVideo`'s `runMediaTool('ffmpeg', ...)` call passes
`signal` as its sixth argument. Both were written this way in Task 2, Step 3; if the file matches
that step exactly, no change is needed here. `child_process.execFile`'s `signal` option (used
inside `runMediaTool`'s `execFileAsync` call) sends `SIGTERM` to the child process automatically
when the signal aborts — this is Node's own behavior, not code this task adds — which is the actual
mechanism that "kills ffmpeg."

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd apps/media && npx vitest run sanitize.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing server-level test for "disconnect keeps the raw file"**

Add to `apps/media/src/server.test.js`, inside `describe('once the project and the raw upload are
accepted', ...)`:

```js
    it('keeps the raw file and registers nothing when the client disconnects mid-download', async () => {
      const routes = baseRoutes();
      let releaseDownload;
      const downloadStarted = new Promise(resolve => { releaseDownload = resolve; });
      stubSupabase(new Proxy(routes, {
        get(target, key) {
          if (key === `GET /storage/v1/object/authenticated/internal-assets/${rawPath}`) {
            return async () => {
              releaseDownload();
              // Never resolves on its own within the test's lifetime; the client-side abort below
              // is what ends the request, the same way a real dropped connection would.
              await new Promise(() => {});
            };
          }
          if (key in target) return target[key];
          return undefined;
        },
      }));
      const controller = new AbortController();
      const request = fetch(`${baseUrl}/designs/sanitize-video`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, rawPath, mimeType: 'video/mp4' }),
        signal: controller.signal,
      });
      await downloadStarted;
      controller.abort();
      await expect(request).rejects.toThrow();
      // Nothing about the raw upload's lifecycle ran: no discard, no attestation, no clean upload.
      expect(calls.some(call => call.method === 'POST' && call.path === '/rest/v1/rpc/discard_sanitized_asset')).toBe(false);
      expect(calls.some(call => call.method === 'POST' && call.path === '/rest/v1/rpc/register_sanitized_video')).toBe(false);
      expect(calls.some(call => call.method === 'POST' && call.path.startsWith('/storage/v1/object/internal-assets/'))).toBe(false);
    });
```

- [ ] **Step 6: Run the test and verify it fails**

Run: `cd apps/media && npx vitest run server.test.js`
Expected: FAIL — the server has no `AbortController` tied to the request's `'close'` event yet, so
the in-flight `downloadToFile` call is never actually aborted server-side (the test may hang until
its own timeout, or the assertions may simply be reachable with stray calls recorded).

- [ ] **Step 7: Wire the per-request `AbortController`**

In `apps/media/src/server.js`, inside the `if (url.pathname === '/designs/sanitize-video')` block,
immediately after the existing project-existence check (`if (projects.length !== 1) throw new
MediaError('Project not found.', 404);`) and before `const extension = ...`, add:

```js
        // A disconnect is not a cancel: the raw upload stays, so the automatic retry (web layer)
        // can reuse it. This controller only aborts the in-flight download/probe/remux/upload; it
        // never triggers the raw object's discard.
        const controller = new AbortController();
        request.on('close', () => { if (!responded) controller.abort(); });
```

Then update every call this block makes to `downloadRawOrDie`, `probeVideo`, `sanitizeVideo` and
`backend.uploadFile` to pass `controller.signal` as their trailing argument, e.g.
`await downloadRawOrDie(backend, existing.storage_path, projectId, token, probeInput,
controller.signal);`, `await probeVideo(probeInput, existing.mime_type, controller.signal);`,
`await downloadRawOrDie(backend, rawPath, projectId, token, input, controller.signal);`,
`probe = await sanitizeVideo(input, output, mimeType, undefined, controller.signal);`, and
`uploaded = await backend.uploadFile('internal-assets', path, output, mimeType,
controller.signal);`.

`downloadRawOrDie` itself (Task 2) also needs a trailing `signal` parameter forwarded into its own
`backend.downloadToFile` call — update its signature to `async function downloadRawOrDie(backend,
rawPath, projectId, token, destination, signal)` and its body's `downloadToFile` call to pass
`signal` as the fifth argument.

Finally, add the `responded` flag the listener above reads, by changing the shared `send` helper
near the top of the request handler from:

```js
    const send = (status, data) => { if (!response.destroyed) { response.statusCode = status; response.end(JSON.stringify(data)); } };
```

to:

```js
    let responded = false;
    const send = (status, data) => { responded = true; if (!response.destroyed) { response.statusCode = status; response.end(JSON.stringify(data)); } };
```

- [ ] **Step 8: Run the test and verify it passes**

Run: `cd apps/media && npx vitest run server.test.js`
Expected: PASS, including every pre-existing test (the `responded` flag is set on every response
send, which is a strict superset of the previous behavior, so no other route's tests are affected).

- [ ] **Step 9: Commit**

```bash
git add apps/media/src/server.js apps/media/src/sanitize.test.js apps/media/src/server.test.js
git commit -m "feat(media): abort in-flight sanitize-video work on client disconnect, keeping the raw file"
```

---

### Task 4: Media — `POST /designs/discard-raw`

**Files:**
- Modify: `apps/media/src/server.js:1-90` (route allow-list, identity branch), plus a new block
  inside the request handler
- Modify: `apps/media/src/supabase.js` (`createBackend`'s return object)
- Test: `apps/media/src/server.test.js`, `apps/media/src/supabase.test.js`

**Interfaces:**
- Consumes: `RAW_VIDEO_PATH`, `backend.canProduce`, `backend.identify` (all existing, from
  `server.js`); the existing `discard(bucket, path)` (`supabase.js`) internals.
- Produces (consumed by Task 6): `POST /designs/discard-raw` accepts JSON `{ projectId, rawPath }`,
  requires the same authorization as `/designs/sanitize-video` (agency, or a designer assigned to
  the project), and returns `200 { "discarded": true }` whether or not the object existed. New
  `supabase.js` function `discardRaw(bucket, path) → Promise<void>` — a Storage-only delete with no
  attestation-table interaction, since a raw object was never attested.

- [ ] **Step 1: Write the failing tests**

Add to `apps/media/src/supabase.test.js`:

```js
  it('deletes a raw object from storage without touching the attestation RPCs', async () => {
    const calls = [];
    globalThis.fetch = async (input, init = {}) => {
      calls.push({ url: typeof input === 'string' ? input : input.url, method: init.method ?? 'GET' });
      return new Response('{}', { status: 200 });
    };
    const backend = createBackend({ supabaseUrl: 'http://supabase.test', anonKey: 'anon', serviceKey: 'service' });
    await backend.discardRaw('internal-assets', `${projectId}/raw.raw`);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].url).toContain('/storage/v1/object/internal-assets');
  });
```

Add to `apps/media/src/server.test.js`, as a new top-level `describe`, after `describe('POST
/designs/sanitize-video', ...)`:

```js
describe('POST /designs/discard-raw', () => {
  const config = { supabaseUrl: 'http://supabase.test', anonKey: 'anon-key', serviceKey: 'service-key', appOrigin: 'http://localhost:3003' };
  const agencyUserId = md5Uuid('dawes:agency');
  const projectId = md5Uuid('dawes:project-1');
  let server, baseUrl, realFetch, calls;

  beforeAll(async () => {
    realFetch = globalThis.fetch;
    server = createMediaServer(config);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => { globalThis.fetch = realFetch; await new Promise(resolve => server.close(resolve)); });
  afterEach(() => { globalThis.fetch = realFetch; calls = undefined; });

  function stubSupabase(routes) {
    calls = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (!url.startsWith(config.supabaseUrl)) return realFetch(input, init);
      const method = init.method ?? 'GET';
      const path = url.slice(config.supabaseUrl.length).split('?')[0];
      calls.push({ method, path });
      const handler = routes[`${method} ${path}`] ?? routes[path];
      if (!handler) throw new Error(`Unstubbed Supabase call: ${method} ${path}`);
      return handler(url, init);
    };
  }
  function jsonResponse(status, body) { return new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
  function post(body) {
    return fetch(`${baseUrl}/designs/discard-raw`, {
      method: 'POST', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  }

  it('deletes the named raw object once production access is confirmed', async () => {
    const rawPath = `${projectId}/${md5Uuid('raw-object')}.raw`;
    let deletedPrefixes;
    stubSupabase({
      'GET /auth/v1/user': () => jsonResponse(200, { id: agencyUserId }),
      'GET /rest/v1/profiles': () => jsonResponse(200, [{ id: agencyUserId, role: 'agency' }]),
      [`DELETE /storage/v1/object/internal-assets`]: (url, init) => { deletedPrefixes = JSON.parse(init.body).prefixes; return jsonResponse(200, {}); },
    });
    const response = await post({ projectId, rawPath });
    expect(response.status).toBe(200);
    expect((await response.json()).discarded).toBe(true);
    expect(deletedPrefixes).toEqual([rawPath]);
  });

  it('succeeds when the raw object is already gone, so a repeated cancel is safe', async () => {
    const rawPath = `${projectId}/${md5Uuid('already-gone')}.raw`;
    stubSupabase({
      'GET /auth/v1/user': () => jsonResponse(200, { id: agencyUserId }),
      'GET /rest/v1/profiles': () => jsonResponse(200, [{ id: agencyUserId, role: 'agency' }]),
      [`DELETE /storage/v1/object/internal-assets`]: () => jsonResponse(200, {}),
    });
    const response = await post({ projectId, rawPath });
    expect(response.status).toBe(200);
  });

  it('refuses a rawPath outside the named project', async () => {
    stubSupabase({
      'GET /auth/v1/user': () => jsonResponse(200, { id: agencyUserId }),
      'GET /rest/v1/profiles': () => jsonResponse(200, [{ id: agencyUserId, role: 'agency' }]),
    });
    const response = await post({ projectId, rawPath: `${md5Uuid('dawes:project-2')}/${md5Uuid('x')}.raw` });
    expect(response.status).toBe(400);
  });

  it('refuses a designer with no assignment on the project', async () => {
    const designerUserId = md5Uuid('dawes:designer-1');
    stubSupabase({
      'GET /auth/v1/user': () => jsonResponse(200, { id: designerUserId }),
      'GET /rest/v1/profiles': () => jsonResponse(200, [{ id: designerUserId, role: 'designer' }]),
      'GET /rest/v1/project_assignments': () => jsonResponse(200, []),
    });
    const response = await post({ projectId, rawPath: `${projectId}/${md5Uuid('x')}.raw` });
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd apps/media && npx vitest run supabase.test.js server.test.js`
Expected: FAIL — `backend.discardRaw` is not a function, and `POST /designs/discard-raw` returns
`404 Endpoint not found.` (it is not in the route allow-list yet).

- [ ] **Step 3: Add `discardRaw` and the new route**

In `apps/media/src/supabase.js`, add near `discard`:

```js
  async function discardRaw(bucket, path) {
    await request(`/storage/v1/object/${bucket}`, { method: 'DELETE', token: config.serviceKey, data: { prefixes: [path] } });
  }
```

Add it to `createBackend`'s return object (from Task 2's list):

```js
  return { json, rpc, identify, authenticate, canProduce, downloadInternal, downloadToFile, uploadFile, saveSanitized, registerCopied, registerSanitizedVideo, findSanitizedVideoBySource, discard, discardRaw, discardPrepared, cleanStaleAssets };
```

In `apps/media/src/server.js`, add `/designs/discard-raw` to the route allow-list (the array in the
`if (request.method !== 'POST' || !['/publications/prepare', '/deliveries/prepare',
'/assets/discard', '/designs/sanitize-video'].includes(url.pathname))` line — add
`'/designs/discard-raw'` to that array), and add it to the identity branch (the line reading `if
(url.pathname === '/designs/sanitize-video') ({ id: userId, role: callerRole } = await
backend.identify(token)); else userId = await backend.authenticate(token);` — change the condition
to `if (url.pathname === '/designs/sanitize-video' || url.pathname === '/designs/discard-raw')`).

Then add a new route block, placed immediately before the existing `if (url.pathname ===
'/designs/sanitize-video')` block:

```js
      if (url.pathname === '/designs/discard-raw') {
        const { projectId, rawPath } = parseJson(await readBody(request, 16 * 1024));
        validId(projectId);
        if (!RAW_VIDEO_PATH.test(rawPath) || rawPath.split('/')[0] !== projectId)
          throw new MediaError('Asset path must belong to the project.');
        if (!(await backend.canProduce(token, userId, callerRole, projectId)))
          throw new MediaError('Production access required.', 403);
        await backend.discardRaw('internal-assets', rawPath);
        return send(200, { discarded: true });
      }
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd apps/media && npx vitest run supabase.test.js server.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/media/src/server.js apps/media/src/supabase.js apps/media/src/server.test.js apps/media/src/supabase.test.js
git commit -m "feat(media): add POST /designs/discard-raw for explicit cancel-during-processing cleanup"
```

---

### Task 5: Media — hourly sweep adopts `list_stale_video_uploads`

**Files:**
- Modify: `apps/media/src/supabase.js` (`createBackend`'s return object)
- Modify: `apps/media/src/server.js:233-237` (the `cleanup` interval)
- Test: `apps/media/src/supabase.test.js`, `apps/media/src/server.test.js`

**Interfaces:**
- Consumes: `public.list_stale_video_uploads()` (Task 1); `discard(bucket, path)` and
  `discardRaw(bucket, path)` (existing / Task 4).
- Produces: `supabase.js`'s `cleanStaleVideoUploads() → Promise<PromiseSettledResult[]>`, added to
  `createBackend`'s return object; `server.js`'s hourly `cleanup` (and its startup run) now also
  calls it.

- [ ] **Step 1: Write the failing test**

Add to `apps/media/src/supabase.test.js`:

```js
  it('discards an attested stale output through the full attestation-aware path, and a raw upload through a plain storage delete', async () => {
    const calls = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      calls.push({ url, method: init.method ?? 'GET' });
      if (url.endsWith('/rest/v1/rpc/list_stale_video_uploads')) {
        return new Response(JSON.stringify([
          { bucket_id: 'internal-assets', storage_path: `${projectId}/attested.mp4`, attested: true },
          { bucket_id: 'internal-assets', storage_path: `${projectId}/raw.raw`, attested: false },
        ]), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };
    const backend = createBackend({ supabaseUrl: 'http://supabase.test', anonKey: 'anon', serviceKey: 'service' });
    await backend.cleanStaleVideoUploads();
    expect(calls.some(call => call.url.endsWith('/rest/v1/rpc/discard_sanitized_asset'))).toBe(true);
    const deletes = calls.filter(call => call.method === 'DELETE' && call.url.includes('/storage/v1/object/internal-assets'));
    expect(deletes).toHaveLength(2);
  });
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd apps/media && npx vitest run supabase.test.js`
Expected: FAIL — `backend.cleanStaleVideoUploads` is not a function.

- [ ] **Step 3: Implement `cleanStaleVideoUploads` and wire the hourly sweep**

In `apps/media/src/supabase.js`, add near `cleanStaleAssets`:

```js
  async function cleanStaleVideoUploads() {
    const stale = await rpc('list_stale_video_uploads', {}, config.serviceKey);
    return Promise.allSettled(stale.map(item =>
      item.attested ? discard(item.bucket_id, item.storage_path) : discardRaw(item.bucket_id, item.storage_path),
    ));
  }
```

Add it to `createBackend`'s return object (the final list for this feature):

```js
  return { json, rpc, identify, authenticate, canProduce, downloadInternal, downloadToFile, uploadFile, saveSanitized, registerCopied, registerSanitizedVideo, findSanitizedVideoBySource, discard, discardRaw, discardPrepared, cleanStaleAssets, cleanStaleVideoUploads };
```

In `apps/media/src/server.js`, replace the cleanup wiring (currently `const cleanup =
setInterval(() => { backend.cleanStaleAssets().catch(cleanupFailed); }, 60 * 60 * 1000);
cleanup.unref(); server.on('close', () => clearInterval(cleanup)); backend.cleanStaleAssets().catch(cleanupFailed);`)
with:

```js
  const cleanup = setInterval(() => {
    backend.cleanStaleAssets().catch(cleanupFailed);
    backend.cleanStaleVideoUploads().catch(cleanupFailed);
  }, 60 * 60 * 1000);
  cleanup.unref();
  server.on('close', () => clearInterval(cleanup));
  backend.cleanStaleAssets().catch(cleanupFailed);
  backend.cleanStaleVideoUploads().catch(cleanupFailed);
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd apps/media && npx vitest run supabase.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full media suite**

Run: `cd apps/media && npm test`
Expected: every test across `sanitize.test.js`, `server.test.js` and `supabase.test.js` passes —
this is the first point where Tasks 2–5 have all landed together.

- [ ] **Step 6: Commit**

```bash
git add apps/media/src/supabase.js apps/media/src/server.js apps/media/src/supabase.test.js
git commit -m "feat(media): sweep stale raw uploads and orphaned internal-assets outputs hourly"
```

---

### Task 6: Web — scoped fingerprint, resume, abort, and retry classification in `artwork-files.ts`

**Files:**
- Modify: `apps/web/features/projects/media-client.ts` (add `MediaRequestError`; `requestMedia`
  throws it; `sanitizeVideoAsset` and `discardRawAsset` gain a `signal`/exist)
- Modify: `apps/web/features/projects/artwork-files.ts:1-202` (rewrite `uploadResumable`, rewrite
  `uploadDesignAsset`, add `videoFingerprint`, `classifyUploadError`, `UploadCancelledError`,
  `UploadExpiredError`, `discardRawUpload`)
- Test: `apps/web/features/projects/media-client.test.ts`,
  `apps/web/features/projects/artwork-files.test.ts`

**Interfaces:**
- Consumes: `POST /designs/discard-raw` (Task 4); tus-js-client's `Upload.findPreviousUploads()`,
  `Upload.resumeFromPreviousUpload(previousUpload)`, `Upload.abort(shouldTerminate)`, the
  `fingerprint` and `onError` options (`node_modules/tus-js-client/lib/index.d.ts`).
- Produces (consumed by Task 7):
  - `media-client.ts`: `export class MediaRequestError extends Error { readonly status: number }`;
    `sanitizeVideoAsset(database, mediaUrl, input, signal?) → Promise<{path, durationSeconds,
    width, height}>` (adds trailing `signal`); `export async function discardRawAsset(database,
    mediaUrl, input: {projectId: string; rawPath: string}) → Promise<void>` (POSTs
    `/designs/discard-raw`).
  - `artwork-files.ts`: `export function videoFingerprint(userId: string, projectId: string, file:
    File): string`; `export class UploadCancelledError extends Error`; `export class
    UploadExpiredError extends Error`; `export type UploadErrorKind = "cancelled" | "expired" |
    "transient" | "permanent"`; `export function classifyUploadError(error: unknown):
    UploadErrorKind`; `export type UploadDesignAssetOptions = { onProgress?: (fraction: number) =>
    void; onRawPath?: (rawPath: string) => void; onResuming?: () => void; signal?: AbortSignal }`
    (`onResuming` fires, synchronously before the transfer starts, only when `findPreviousUploads`
    found a matching previous attempt — this is what lets the dialog show **Continuing from N%**
    instead of **Sending N%**); `export async function
    uploadDesignAsset(database, mediaUrl, projectId, file, options?: UploadDesignAssetOptions):
    Promise<string>` (return type unchanged; the 5th positional `onProgress` parameter is replaced
    by this options bag — the single production call site is rewritten in Task 7); `export async
    function discardRawUpload(database, mediaUrl, input: {projectId: string; rawPath: string}):
    Promise<void>` (thin re-export of `discardRawAsset`, kept in this module so
    `project-action-dialog.tsx` imports upload-lifecycle functions from one place, matching how it
    already imports `discardUnreferencedArtwork`/`uploadDesignAsset` from here).

- [ ] **Step 1: Write the failing test for `MediaRequestError`**

Add to `apps/web/features/projects/media-client.test.ts`:

```ts
import { MediaRequestError } from "./media-client";

describe("MediaRequestError", () => {
  it("carries the HTTP status a caller needs to classify the failure", () => {
    const error = new MediaRequestError("Upload an MP4 or WebM video.", 415);
    expect(error.status).toBe(415);
    expect(error.message).toBe("Upload an MP4 or WebM video.");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd apps/web && npx vitest run features/projects/media-client.test.ts`
Expected: FAIL — `MediaRequestError` is not exported from `./media-client`.

- [ ] **Step 3: Add `MediaRequestError`, thread it through `requestMedia`, and add `signal`/`discardRawAsset`**

In `apps/web/features/projects/media-client.ts`, add near the top (after the existing schema
declarations):

```ts
/** Carries the media service's HTTP status, so a caller can classify a processing failure as
 * transient, permanent or expired without re-parsing the response body. */
export class MediaRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MediaRequestError";
  }
}
```

Change `requestMedia`'s signature and body (the `!response.ok` branch and the `signal` construction):

```ts
async function requestMedia<T>(
  database: SupabaseClient<Database>,
  mediaUrl: string,
  path: string,
  body: BodyInit,
  contentType: string,
  schema: z.ZodType<T>,
  {
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
  }: { headers?: Record<string, string>; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  if (!mediaUrl) throw new Error("File preparation is unavailable. Please contact the studio.");
  const {
    data: { session },
    error: sessionError,
  } = await database.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) throw new Error("Sign in again to prepare this file.");
  const response = await fetch(`${mediaUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: {
      ...headers,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": contentType,
    },
    body,
    signal: signal ? AbortSignal.any([AbortSignal.timeout(timeoutMs), signal]) : AbortSignal.timeout(timeoutMs),
  });
  const result: unknown = await response.json();
  if (!response.ok) throw new MediaRequestError(mediaErrorMessage(response.status, result), response.status);
  const validated = schema.safeParse(result);
  if (!validated.success)
    throw new Error("The file service returned an incomplete response. Please try again.");
  return validated.data;
}
```

Change `sanitizeVideoAsset` to accept and forward a trailing `signal`:

```ts
export async function sanitizeVideoAsset(
  database: SupabaseClient<Database>,
  mediaUrl: string,
  input: { projectId: string; rawPath: string; mimeType: string },
  signal?: AbortSignal,
) {
  return requestMedia(
    database,
    mediaUrl,
    "/designs/sanitize-video",
    JSON.stringify(input),
    "application/json",
    sanitizedVideoSchema,
    { timeoutMs: VIDEO_SANITIZE_TIMEOUT_MS, signal },
  );
}
```

Add `discardRawAsset` near `discardPreparedAssets`:

```ts
const discardRawSchema = z.object({ discarded: z.boolean() });

export async function discardRawAsset(
  database: SupabaseClient<Database>,
  mediaUrl: string,
  input: { projectId: string; rawPath: string },
): Promise<void> {
  await requestMedia(
    database,
    mediaUrl,
    "/designs/discard-raw",
    JSON.stringify(input),
    "application/json",
    discardRawSchema,
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd apps/web && npx vitest run features/projects/media-client.test.ts`
Expected: PASS, including every pre-existing test in the file (`MediaRequestError extends Error`,
so any existing `.message`-only assertion on a thrown error from this module is unaffected).

- [ ] **Step 5: Write the failing tests for `videoFingerprint` and `classifyUploadError`**

Add to `apps/web/features/projects/artwork-files.test.ts` (near the top, after the existing
imports):

```ts
import {
  classifyUploadError,
  discardRawUpload,
  UploadCancelledError,
  UploadExpiredError,
  videoFingerprint,
} from "./artwork-files";
import { MediaRequestError } from "./media-client";

describe("videoFingerprint", () => {
  const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });

  it("scopes the fingerprint to the user, the project and the file's own identity", () => {
    const fingerprint = videoFingerprint("user-1", "project-1", file);
    expect(fingerprint).toBe(`dawes-video:user-1:project-1:clip.mp4:4:${file.lastModified}`);
  });

  it("differs for a different project, so the same file never resumes another project's upload", () => {
    expect(videoFingerprint("user-1", "project-1", file)).not.toBe(
      videoFingerprint("user-1", "project-2", file),
    );
  });

  it("differs for a different user, so the same file never resumes another user's upload", () => {
    expect(videoFingerprint("user-1", "project-1", file)).not.toBe(
      videoFingerprint("user-2", "project-1", file),
    );
  });

  it("differs for a different file chosen for the same project", () => {
    const other = new File([new Uint8Array(5)], "other.mp4", { type: "video/mp4" });
    expect(videoFingerprint("user-1", "project-1", file)).not.toBe(
      videoFingerprint("user-1", "project-1", other),
    );
  });
});

describe("classifyUploadError", () => {
  it("classifies a cancelled upload as cancelled, never retried", () => {
    expect(classifyUploadError(new UploadCancelledError())).toBe("cancelled");
  });
  it("classifies an expired upload as expired", () => {
    expect(classifyUploadError(new UploadExpiredError())).toBe("expired");
    expect(classifyUploadError(new MediaRequestError("gone", 410))).toBe("expired");
  });
  it("classifies a processing-phase abort (a raw AbortError from the aborted fetch) as cancelled, not transient", () => {
    // Cancel during the transfer phase rejects with UploadCancelledError directly (see
    // uploadResumable's onAbort handler), but cancel during processing aborts
    // sanitizeVideoAsset's fetch, which rejects with a plain DOMException named "AbortError" —
    // there is no MediaRequestError to inspect, since the request never got a response. Both
    // phases must still classify as "cancelled", not fall through to the transient default,
    // or a deliberate cancel would show "Try processing again" instead of "Upload cancelled".
    expect(classifyUploadError(new DOMException("The operation was aborted.", "AbortError"))).toBe("cancelled");
  });
  it("classifies a genuine fetch-level timeout (AbortSignal.timeout firing) as transient, not cancelled", () => {
    expect(classifyUploadError(new DOMException("The operation timed out.", "TimeoutError"))).toBe("transient");
  });
  it("classifies network-level, timeout, 408, 429 and 5xx failures as transient", () => {
    expect(classifyUploadError(new TypeError("Failed to fetch"))).toBe("transient");
    expect(classifyUploadError(new MediaRequestError("timeout", 408))).toBe("transient");
    expect(classifyUploadError(new MediaRequestError("busy", 429))).toBe("transient");
    expect(classifyUploadError(new MediaRequestError("unavailable", 503))).toBe("transient");
    expect(classifyUploadError(new MediaRequestError("timeout", 504))).toBe("transient");
  });
  it("classifies 415 and 422 as permanent, never retried", () => {
    expect(classifyUploadError(new MediaRequestError("wrong type", 415))).toBe("permanent");
    expect(classifyUploadError(new MediaRequestError("invalid content", 422))).toBe("permanent");
  });
});
```

- [ ] **Step 6: Run the tests and verify they fail**

Run: `cd apps/web && npx vitest run features/projects/artwork-files.test.ts`
Expected: FAIL — none of `videoFingerprint`, `classifyUploadError`, `UploadCancelledError`,
`UploadExpiredError`, `discardRawUpload` are exported from `./artwork-files` yet.

- [ ] **Step 7: Add the error classes, `videoFingerprint`, `classifyUploadError`, `discardRawUpload`**

In `apps/web/features/projects/artwork-files.ts`, change the import line to add `sanitizeVideoAsset`
alongside the two new media-client exports:

```ts
import { discardRawAsset, MediaRequestError, sanitizeVideoAsset } from "./media-client";
```

Add, after the module doc comment and before `sanitizeArtwork`:

```ts
/** The tus fingerprint used for a video's resumable transfer, scoped so the same file never
 * resumes another project's or another user's upload. */
export function videoFingerprint(userId: string, projectId: string, file: File): string {
  return `dawes-video:${userId}:${projectId}:${file.name}:${file.size}:${file.lastModified}`;
}

/** Thrown when a person cancels an upload deliberately, so callers can tell it apart from a real
 * failure and skip both the automatic retry and any "please try again" messaging. */
export class UploadCancelledError extends Error {
  constructor() {
    super("Upload cancelled.");
    this.name = "UploadCancelledError";
  }
}

/** Thrown when the resumable upload URL a previous attempt created is gone — the 24-hour Supabase
 * resumable window (or, in production, the R2 lifecycle rule) has passed. */
export class UploadExpiredError extends Error {
  constructor() {
    super("The upload expired; choose the file again.");
    this.name = "UploadExpiredError";
  }
}

export type UploadErrorKind = "cancelled" | "expired" | "transient" | "permanent";

/** Classifies a failure from the upload/processing path. A network-level rejection that never
 * reached the media service (a dropped connection, `AbortSignal.timeout` firing) carries no HTTP
 * status of its own and is treated the same as a 5xx: both deserve the one automatic retry. */
export function classifyUploadError(error: unknown): UploadErrorKind {
  if (error instanceof UploadCancelledError) return "cancelled";
  if (error instanceof UploadExpiredError) return "expired";
  // A cancel during the processing phase aborts `sanitizeVideoAsset`'s fetch directly (there is no
  // wrapping error class the way `uploadResumable`'s own abort handling provides for the transfer
  // phase), so the rejection is a plain DOMException named "AbortError". `AbortSignal.timeout`
  // firing on its own (a genuine timeout, not a deliberate cancel) is named "TimeoutError" instead
  // and must stay transient, which is why this checks the exact name rather than any DOMException.
  if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
  if (error instanceof MediaRequestError) {
    if (error.status === 410) return "expired";
    if (error.status === 408 || error.status === 429 || error.status >= 500) return "transient";
    return "permanent";
  }
  return "transient";
}

/** Deletes a raw upload the person cancelled mid-processing. Deleting an already-missing raw file
 * succeeds, so a repeated cancel is safe. */
export async function discardRawUpload(
  database: SupabaseDatabase,
  mediaUrl: string,
  input: { projectId: string; rawPath: string },
): Promise<void> {
  await discardRawAsset(database, mediaUrl, input);
}
```

- [ ] **Step 8: Run the tests and verify they pass**

Run: `cd apps/web && npx vitest run features/projects/artwork-files.test.ts`
Expected: PASS for the six new `describe` blocks. The pre-existing `uploadDesignAsset` tests in
this file still reference the old `uploadResumable` shape and are expected to still be **failing**
or broken at this point — Steps 9–14 rewrite them.

- [ ] **Step 9: Write the failing tests for resume and abort**

Replace `apps/web/features/projects/artwork-files.test.ts`'s existing `MockUploadOptions` type,
`stubSessionDatabase` helper, and every test inside `describe("uploadDesignAsset", ...)` with the
following (the `discardUnreferencedArtwork` describe block above it, and the two size/type-ceiling
tests that never reach `tus.Upload`, are unchanged and stay as they are):

```ts
type PreviousUpload = { size: number | null; metadata: Record<string, string>; creationTime: string; urlStorageKey: string; uploadUrl: string | null; parallelUploadUrls: string[] | null };
type MockUploadOptions = {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
  onProgress?: (sent: number, total: number) => void;
  onBeforeRequest?: (request: { setHeader: (name: string, value: string) => void }) => Promise<void>;
  fingerprint?: () => Promise<string>;
  headers?: Record<string, string>;
  metadata?: Record<string, string>;
  endpoint?: string;
  chunkSize?: number;
};
type MockUpload = { start: () => void; abort: (terminate?: boolean) => Promise<void>; findPreviousUploads: () => Promise<PreviousUpload[]>; resumeFromPreviousUpload: (previous: PreviousUpload) => void };

/** Builds the mocked `tus.Upload` instance every test below configures. `previousUploads` stands
 * in for what `findPreviousUploads` would return from browser storage; `onFinish` fires after a
 * (possibly resumed) upload's `start()` is called, mirroring a real transfer's async completion. */
function mockUpload(options: {
  previousUploads?: PreviousUpload[];
  onFinish?: (options: MockUploadOptions, resumed: PreviousUpload | undefined) => void;
} = {}) {
  let capturedOptions: MockUploadOptions | undefined;
  let resumed: PreviousUpload | undefined;
  tusUploadMock.mockImplementation(function (_file: File, uploadOptions: MockUploadOptions) {
    capturedOptions = uploadOptions;
    const instance: MockUpload = {
      start: () => options.onFinish?.(uploadOptions, resumed),
      abort: async () => { uploadOptions.onError?.(new Error("aborted")); },
      findPreviousUploads: async () => options.previousUploads ?? [],
      resumeFromPreviousUpload: (previous) => { resumed = previous; },
    };
    return instance;
  });
  return { capturedOptions: () => capturedOptions };
}

describe("uploadDesignAsset", () => {
  beforeEach(() => {
    tusUploadMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("refuses a video over the ceiling before any network call", async () => {
    const database = { storage: { from: () => { throw new Error("must not upload"); } } };
    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    Object.defineProperty(file, "size", { value: VIDEO_MAX_BYTES + 1 });
    await expect(
      uploadDesignAsset(database as never, "http://media.test", projectId, file),
    ).rejects.toThrow(/no larger than/);
    expect(tusUploadMock).not.toHaveBeenCalled();
  });

  it("refuses a video format a browser cannot play", async () => {
    const database = { storage: { from: () => { throw new Error("must not upload"); } } };
    const file = new File([new Uint8Array(4)], "clip.mov", { type: "video/quicktime" });
    await expect(
      uploadDesignAsset(database as never, "http://media.test", projectId, file),
    ).rejects.toThrow(/MP4|WebM/);
    expect(tusUploadMock).not.toHaveBeenCalled();
  });

  it("sends an image down the canvas path, untouched by the video branch", () => {
    const file = new File([new Uint8Array(4)], "art.png", { type: "image/png" });
    expect(isVideoUpload(file.type)).toBe(false);
  });

  function stubSessionDatabase(token: string | null = "token-abc", userId: string | null = "user-1") {
    const getSession = vi.fn().mockResolvedValue({
      data: { session: token ? { access_token: token, user: { id: userId } } : null },
      error: null,
    });
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    const bucket = vi.fn().mockReturnValue({ remove });
    return { database: { auth: { getSession }, storage: { from: bucket } } as never, getSession, bucket, remove };
  }

  it("refuses a video upload when the session has no access token, before starting any transfer", async () => {
    const stub = stubSessionDatabase(null);
    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    await expect(
      uploadDesignAsset(stub.database, "http://media.test", projectId, file),
    ).rejects.toThrow(/sign-in is no longer valid/);
    expect(tusUploadMock).not.toHaveBeenCalled();
  });

  it("builds a fresh raw path and sends it to the sanitiser when no previous upload exists", async () => {
    const stub = stubSessionDatabase();
    let sanitizeBody: { projectId: string; rawPath: string; mimeType: string } | undefined;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      sanitizeBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ path: "clean-project/clean.mp4", durationSeconds: 12, width: 1920, height: 1080 }) };
    }));
    const { capturedOptions } = mockUpload({ onFinish: (options) => options.onSuccess?.() });

    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    const rawPaths: string[] = [];
    const path = await uploadDesignAsset(stub.database, "http://media.test", projectId, file, {
      onRawPath: (value) => rawPaths.push(value),
    });

    expect(path).toBe("clean-project/clean.mp4");
    const rawPath = capturedOptions()?.metadata?.objectName ?? "";
    expect(rawPath).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.raw$/);
    expect(rawPath.split("/")[0]).toBe(projectId);
    expect(capturedOptions()?.metadata?.bucketName).toBe("internal-assets");
    expect(capturedOptions()?.chunkSize).toBe(6 * 1024 * 1024);
    expect(await capturedOptions()?.fingerprint?.()).toBe(videoFingerprint("user-1", projectId, file));
    expect(sanitizeBody).toEqual({ projectId, rawPath, mimeType: "video/mp4" });
    expect(rawPaths).toEqual([rawPath]);
  });

  it("resumes from a previous upload's stored objectName instead of a new uuid", async () => {
    const stub = stubSessionDatabase();
    const previousRawPath = `${projectId}/${"a".repeat(8)}-previous.raw`;
    let sanitizeBody: { rawPath: string } | undefined;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      sanitizeBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ path: "clean-project/clean.mp4", durationSeconds: 1, width: 1, height: 1 }) };
    }));
    mockUpload({
      previousUploads: [{ size: 4, metadata: { objectName: previousRawPath, bucketName: "internal-assets", contentType: "video/mp4" }, creationTime: "", urlStorageKey: "key-1", uploadUrl: "https://supabase.test/upload/1", parallelUploadUrls: null }],
      onFinish: (options) => options.onSuccess?.(),
    });

    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    let resumingFired = false;
    const path = await uploadDesignAsset(stub.database, "http://media.test", projectId, file, {
      onResuming: () => { resumingFired = true; },
    });

    expect(path).toBe("clean-project/clean.mp4");
    expect(sanitizeBody?.rawPath).toBe(previousRawPath);
    expect(resumingFired).toBe(true);
  });

  it("never fires onResuming for a fresh transfer with no previous upload", async () => {
    const stub = stubSessionDatabase();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ path: "clean-project/clean.mp4", durationSeconds: 1, width: 1, height: 1 }) }));
    mockUpload({ onFinish: (options) => options.onSuccess?.() });

    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    let resumingFired = false;
    await uploadDesignAsset(stub.database, "http://media.test", projectId, file, {
      onResuming: () => { resumingFired = true; },
    });

    expect(resumingFired).toBe(false);
  });

  it("falls back to a fresh upload when a previous upload's metadata is missing or does not look like a raw video path", async () => {
    const stub = stubSessionDatabase();
    let sanitizeBody: { rawPath: string } | undefined;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      sanitizeBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ path: "clean-project/clean.mp4", durationSeconds: 1, width: 1, height: 1 }) };
    }));
    mockUpload({
      previousUploads: [{ size: 4, metadata: {}, creationTime: "", urlStorageKey: "key-1", uploadUrl: "https://supabase.test/upload/1", parallelUploadUrls: null }],
      onFinish: (options) => options.onSuccess?.(),
    });

    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    await uploadDesignAsset(stub.database, "http://media.test", projectId, file);

    expect(sanitizeBody?.rawPath).toMatch(new RegExp(`^${projectId}/[0-9a-f-]{36}\\.raw$`));
  });

  it("rejects with UploadCancelledError and calls upload.abort(true) when the signal aborts during transfer", async () => {
    const stub = stubSessionDatabase();
    let abortedWithTerminate: boolean | undefined;
    tusUploadMock.mockImplementation(function (_file: File, options: MockUploadOptions) {
      return {
        start: () => {},
        abort: async (terminate?: boolean) => { abortedWithTerminate = terminate; options.onError?.(new Error("aborted")); },
        findPreviousUploads: async () => [],
        resumeFromPreviousUpload: () => {},
      } satisfies MockUpload;
    });
    const controller = new AbortController();
    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    const promise = uploadDesignAsset(stub.database, "http://media.test", projectId, file, { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toBeInstanceOf(UploadCancelledError);
    expect(abortedWithTerminate).toBe(true);
  });

  it("rejects with UploadExpiredError when the resumable upload URL is gone (a 404/410 from the tus endpoint)", async () => {
    const stub = stubSessionDatabase();
    mockUpload({
      onFinish: (options) => options.onError?.({
        name: "DetailedError",
        message: "tus: unexpected response",
        originalResponse: { getStatus: () => 410 },
      }),
    });
    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    await expect(
      uploadDesignAsset(stub.database, "http://media.test", projectId, file),
    ).rejects.toBeInstanceOf(UploadExpiredError);
  });

  it("retries a transient processing failure once automatically, with the same raw path, and succeeds", async () => {
    const stub = stubSessionDatabase();
    mockUpload({ onFinish: (options) => options.onSuccess?.() });
    let attempt = 0;
    const bodies: string[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      bodies.push(init.body);
      attempt += 1;
      if (attempt === 1) return { ok: false, status: 503, json: async () => ({ error: "Media processing is busy." }) };
      return { ok: true, json: async () => ({ path: "clean-project/clean.mp4", durationSeconds: 1, width: 1, height: 1 }) };
    }));
    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    const path = await uploadDesignAsset(stub.database, "http://media.test", projectId, file);
    expect(path).toBe("clean-project/clean.mp4");
    expect(attempt).toBe(2);
    expect(JSON.parse(bodies[0]).rawPath).toBe(JSON.parse(bodies[1]).rawPath);
  });

  it("gives up after one automatic retry, surfacing the second transient failure", async () => {
    const stub = stubSessionDatabase();
    mockUpload({ onFinish: (options) => options.onSuccess?.() });
    let attempt = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      attempt += 1;
      return { ok: false, status: 503, json: async () => ({ error: "Media processing is busy." }) };
    }));
    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    await expect(
      uploadDesignAsset(stub.database, "http://media.test", projectId, file),
    ).rejects.toThrow("Media processing is busy.");
    expect(attempt).toBe(2);
  });

  it("never retries a permanent (422) processing failure", async () => {
    const stub = stubSessionDatabase();
    mockUpload({ onFinish: (options) => options.onSuccess?.() });
    let attempt = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      attempt += 1;
      return { ok: false, status: 422, json: async () => ({ error: "The video could not be read." }) };
    }));
    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    await expect(
      uploadDesignAsset(stub.database, "http://media.test", projectId, file),
    ).rejects.toThrow("The video could not be read.");
    expect(attempt).toBe(1);
  });
});

describe("discardRawUpload", () => {
  it("posts the project and raw path to the media service", async () => {
    const stub = stubSessionDatabase();
    let sent: unknown;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      sent = JSON.parse(init.body);
      return { ok: true, json: async () => ({ discarded: true }) };
    }));
    await discardRawUpload(stub.database, "http://media.test", { projectId, rawPath: `${projectId}/x.raw` });
    expect(sent).toEqual({ projectId, rawPath: `${projectId}/x.raw` });
  });
});
```

(`stubSessionDatabase` moves inside `describe("uploadDesignAsset", ...)` and gains a `userId`
parameter used by `videoFingerprint`; the top-level one that the old file defined is removed. The
`discardRawUpload` describe block reuses the version defined inside `uploadDesignAsset`'s scope, so
factor `stubSessionDatabase` out to file scope, above `describe("uploadDesignAsset", ...)`, instead
of nesting it — both describes then call the same file-scope helper.)

- [ ] **Step 10: Run the tests and verify they fail**

Run: `cd apps/web && npx vitest run features/projects/artwork-files.test.ts`
Expected: FAIL — `uploadResumable`'s current implementation takes a fixed `path` argument, never
calls `findPreviousUploads`, has no `fingerprint` option, and does not accept or honor a `signal`.

- [ ] **Step 11: Rewrite `uploadResumable` and `uploadDesignAsset`**

In `apps/web/features/projects/artwork-files.ts`, replace `uploadResumable` and `uploadDesignAsset`
in full:

```ts
/**
 * Uploads through Supabase's TUS endpoint, resuming a previous attempt for the same file when one
 * exists. The fingerprint scopes resume to this exact user, project, file name, size and
 * modification time, so the same file never resumes another project's or another user's upload,
 * and a different file for the same project never resumes this one's transfer.
 *
 * Chunks are 6 MB because the storage service requires exactly that size for every chunk but the
 * last, and it must not be made configurable.
 */
async function uploadResumable(
  database: SupabaseDatabase,
  bucket: string,
  projectId: string,
  file: File,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
  onResuming?: () => void,
): Promise<string> {
  async function currentSession(): Promise<{ token: string; userId: string }> {
    const { data, error } = await database.auth.getSession();
    if (error) throw new Error(error.message);
    const token = data.session?.access_token;
    const userId = data.session?.user?.id;
    if (!token || !userId)
      throw new Error("Your sign-in is no longer valid. Sign out, sign in again, and retry.");
    return { token, userId };
  }

  if (signal?.aborted) throw new UploadCancelledError();
  const { userId } = await currentSession();
  const fingerprint = videoFingerprint(userId, projectId, file);
  const freshPath = `${projectId}/${crypto.randomUUID()}.raw`;

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      run();
    };
    let objectName = freshPath;
    const upload = new tus.Upload(file, {
      endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
      headers: { "x-upsert": "false" },
      onBeforeRequest: async (request) => {
        const { token } = await currentSession();
        request.setHeader("authorization", `Bearer ${token}`);
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: { bucketName: bucket, objectName: freshPath, contentType: file.type },
      fingerprint: async () => fingerprint,
      onError: (error) => {
        const status = (error as { originalResponse?: { getStatus(): number } }).originalResponse?.getStatus();
        finish(() => reject(status === 404 || status === 410 ? new UploadExpiredError() : error));
      },
      onProgress: (sent, total) => onProgress?.(total ? sent / total : 0),
      onSuccess: () => finish(() => resolve(objectName)),
    });
    const onAbort = () => {
      finish(() => reject(new UploadCancelledError()));
      void upload.abort(true);
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    void (async () => {
      try {
        const previousUploads = await upload.findPreviousUploads();
        const previous = previousUploads.find((candidate) => {
          const candidateObjectName = candidate.metadata.objectName;
          return (
            typeof candidateObjectName === "string" &&
            candidateObjectName.startsWith(`${projectId}/`) &&
            candidateObjectName.endsWith(".raw")
          );
        });
        if (previous) {
          objectName = previous.metadata.objectName;
          upload.resumeFromPreviousUpload(previous);
          onResuming?.();
        }
        if (signal?.aborted) return;
        upload.start();
      } catch (error) {
        finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      }
    })();
  });
}

/** A transient processing failure is retried once automatically, with the same raw path. Invalid
 * content, an authorization refusal or an expired raw file are never retried. */
async function sanitizeWithOneRetry(
  database: SupabaseDatabase,
  mediaUrl: string,
  input: { projectId: string; rawPath: string; mimeType: string },
  signal?: AbortSignal,
) {
  try {
    return await sanitizeVideoAsset(database, mediaUrl, input, signal);
  } catch (error) {
    if (classifyUploadError(error) !== "transient") throw error;
    return await sanitizeVideoAsset(database, mediaUrl, input, signal);
  }
}

export type UploadDesignAssetOptions = {
  onProgress?: (fraction: number) => void;
  onRawPath?: (rawPath: string) => void;
  /** Fires once, before the transfer starts, only when a previous attempt for this exact
   * fingerprint was found and is being resumed — never for a fresh transfer. */
  onResuming?: () => void;
  signal?: AbortSignal;
};

/**
 * Uploads a design asset, choosing the path its type requires. See the module doc comment for why
 * images and video take different paths.
 *
 * For video, `options.onRawPath` fires once, right when the transfer finishes and processing is
 * about to start — the exact moment a caller needs to know the raw path, since a cancel before
 * that point only needs to abort the transfer (`options.signal`), while a cancel from that point on
 * also needs to discard the raw file explicitly (`discardRawUpload`).
 */
export async function uploadDesignAsset(
  database: SupabaseDatabase,
  mediaUrl: string,
  projectId: string,
  file: File,
  options: UploadDesignAssetOptions = {},
): Promise<string> {
  if (!file.type.startsWith("video/")) return uploadArtwork(database, projectId, file);

  if (!isVideoUpload(file.type)) throw new Error(uploadTypeMessage(videoUploadMimes));
  if (file.size > VIDEO_MAX_BYTES) throw new Error(uploadSizeMessage(VIDEO_MAX_BYTES));

  const rawPath = await uploadResumable(
    database,
    "internal-assets",
    projectId,
    file,
    options.onProgress,
    options.signal,
    options.onResuming,
  );
  options.onRawPath?.(rawPath);
  try {
    const sanitized = await sanitizeWithOneRetry(
      database,
      mediaUrl,
      { projectId, rawPath, mimeType: file.type },
      options.signal,
    );
    return sanitized.path;
  } catch (error) {
    if (!(error instanceof UploadCancelledError))
      console.error(
        `Video sanitisation failed; the raw upload remains at internal-assets/${rawPath} until the 24-hour sweep removes it, or a "Try processing again" retry reuses it.`,
        error,
      );
    throw error;
  }
}
```

- [ ] **Step 12: Run the tests and verify they pass**

Run: `cd apps/web && npx vitest run features/projects/artwork-files.test.ts`
Expected: PASS for every test in the file.

- [ ] **Step 13: Run the full web unit suite and typecheck**

Run: `cd apps/web && npx vitest run features/projects && npm run typecheck`
Expected: PASS. `project-action-dialog.tsx` still calls `uploadDesignAsset` with a 5th positional
`onProgress` argument at this point, which now means "assign it to the `options` parameter
position" — TypeScript will report a type error there (`onProgress` is a function, not
`UploadDesignAssetOptions`), which is expected and is exactly what Task 7 fixes next. Confirm the
typecheck failure is limited to that one call site in `project-action-dialog.tsx`.

- [ ] **Step 14: Commit**

```bash
git add apps/web/features/projects/media-client.ts apps/web/features/projects/artwork-files.ts apps/web/features/projects/media-client.test.ts apps/web/features/projects/artwork-files.test.ts
git commit -m "feat(web): scoped resumable video fingerprint, abort, and one automatic processing retry"
```

---

### Task 7: Web — dialog states and the single Cancel

**Files:**
- Modify: `apps/web/features/projects/project-action-dialog.tsx` (full rewrite of the upload-related
  state, `close`, `mutationFn`'s design branch, and the design-kind render block)
- Test: Create `apps/web/features/projects/project-action-dialog.test.tsx`

**Interfaces:**
- Consumes (from Task 6): `uploadDesignAsset(database, mediaUrl, projectId, file, {onProgress,
  onRawPath, onResuming, signal})`, `discardRawUpload(database, mediaUrl, {projectId, rawPath})`,
  `classifyUploadError(error)`, `UploadCancelledError`; (from `media-client.ts`, Task 6)
  `sanitizeVideoAsset(database, mediaUrl, input, signal)` for the manual "Try processing again"
  resubmit.
- Produces: no new exported names — this task only changes `ProjectActionDialog`'s internal
  behavior and rendering.

Design decision this task records: **Cancel behaves differently depending on whether an upload is
active.** With no upload in flight (the pre-existing case — a version/publish/submit/review action,
or a design action before any file is chosen), Cancel still closes the dialog via `onClose()`,
unchanged. While a video upload is transferring or processing, Cancel aborts it, best-effort
discards the raw file if one is known yet, and returns the dialog to its file-selection step
**without closing it**, showing "Upload cancelled." This is the only reading consistent with the
spec's states list, which shows "Upload cancelled" as a *dialog state* (implying the dialog is still
mounted to show it) and with `CLAUDE.md`'s instruction that "toast-only actions are not production
implementations" — there is no toast mechanism in this codebase to show a message after the dialog
has already closed. The Modal's own X/Escape close path is treated as a true close in every case
(abort + best-effort raw discard, then `onClose()`), since Escape/X conventionally means "get me
out," while the in-form Cancel button means "stop this and let me try something else."

- [ ] **Step 1: Write the failing dialog tests**

Create `apps/web/features/projects/project-action-dialog.test.tsx`:

```tsx
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasVersion } from "./project-data";

const auth = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/features/auth/auth-provider", () => auth);

const projectData = vi.hoisted(() => ({
  addDesign: vi.fn(),
  createDesignVersion: vi.fn(),
  findDesignByAsset: vi.fn().mockResolvedValue([]),
  findUnchangedDesign: vi.fn().mockResolvedValue([]),
  publishVersion: vi.fn(),
  reviewPublication: vi.fn(),
  submitDesignVersion: vi.fn(),
  updateDesignContent: vi.fn(),
  updateWorkingDesign: vi.fn(),
  useInvalidateProject: () => vi.fn(),
}));
vi.mock("./project-data", () => projectData);

const artworkFiles = vi.hoisted(() => ({
  discardUnreferencedArtwork: vi.fn(),
  uploadDesignAsset: vi.fn(),
  discardRawUpload: vi.fn().mockResolvedValue(undefined),
  classifyUploadError: vi.fn(),
  UploadCancelledError: class UploadCancelledError extends Error {},
}));
vi.mock("./artwork-files", () => artworkFiles);

const mediaClient = vi.hoisted(() => ({
  discardPreparedAssets: vi.fn(),
  preparePublicationAssets: vi.fn(),
  sanitizeVideoAsset: vi.fn(),
}));
vi.mock("./media-client", () => mediaClient);

const { ProjectActionDialog } = await import("./project-action-dialog");

function renderDialog(version: CanvasVersion) {
  const client = new QueryClient();
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ProjectActionDialog
        action={{ kind: "design", version }}
        projectId="project-1"
        suspended={false}
        onOpenPlayground={() => {}}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return { onClose };
}

const version: CanvasVersion = { id: "version-1", number: 1, status: "draft", designs: [], notes: "" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  auth.useAuth.mockReturnValue({ database: {}, mediaUrl: "http://media.test" });
  artworkFiles.classifyUploadError.mockImplementation((error: unknown) =>
    error instanceof artworkFiles.UploadCancelledError ? "cancelled" : "transient",
  );
});

function selectVideoFile() {
  const input = screen.getByLabelText(/design file/i) as HTMLInputElement;
  const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
  fireEvent.change(input, { target: { files: [file] } });
  return input;
}

describe("cancel during an active video upload", () => {
  it("aborts the transfer, discards no raw file yet, and stays open showing Upload cancelled", async () => {
    let capturedSignal: AbortSignal | undefined;
    artworkFiles.uploadDesignAsset.mockImplementation(
      (_db: unknown, _url: string, _projectId: string, _file: File, options: { signal?: AbortSignal }) => {
        capturedSignal = options.signal;
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => reject(new artworkFiles.UploadCancelledError()));
        });
      },
    );
    renderDialog(version);
    selectVideoFile();
    fireEvent.click(screen.getByRole("button", { name: /add design/i }));
    await waitFor(() => expect(artworkFiles.uploadDesignAsset).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.getByText(/upload cancelled/i)).toBeInTheDocument());
    expect(capturedSignal?.aborted).toBe(true);
    expect(artworkFiles.discardRawUpload).not.toHaveBeenCalled();
    expect(projectData.addDesign).not.toHaveBeenCalled();
  });

  it("discards the raw file when cancel arrives during processing", async () => {
    artworkFiles.uploadDesignAsset.mockImplementation(
      (_db: unknown, _url: string, _projectId: string, _file: File, options: { onRawPath?: (path: string) => void; signal?: AbortSignal }) => {
        options.onRawPath?.("project-1/raw-1.raw");
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => reject(new artworkFiles.UploadCancelledError()));
        });
      },
    );
    renderDialog(version);
    selectVideoFile();
    fireEvent.click(screen.getByRole("button", { name: /add design/i }));
    await waitFor(() => expect(artworkFiles.uploadDesignAsset).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() =>
      expect(artworkFiles.discardRawUpload).toHaveBeenCalledWith({}, "http://media.test", {
        projectId: "project-1",
        rawPath: "project-1/raw-1.raw",
      }),
    );
    expect(projectData.addDesign).not.toHaveBeenCalled();
  });
});

describe("closing without an active upload", () => {
  it("still closes the dialog immediately, unchanged from before this feature", async () => {
    const { onClose } = renderDialog(version);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe("resuming a previous transfer", () => {
  it("shows Continuing from once onResuming fires, distinct from Sending", async () => {
    artworkFiles.uploadDesignAsset.mockImplementation(
      (_db: unknown, _url: string, _projectId: string, _file: File, options: { onResuming?: () => void; onProgress?: (fraction: number) => void }) => {
        options.onResuming?.();
        options.onProgress?.(0.4);
        return new Promise(() => {});
      },
    );
    renderDialog(version);
    selectVideoFile();
    fireEvent.click(screen.getByRole("button", { name: /add design/i }));
    // The submit button's own label also switches to "Continuing from N%" while pending, so this
    // scopes to the progress paragraph's <span> specifically rather than matching both elements.
    await waitFor(() =>
      expect(screen.getByText(/continuing from 40%/i, { selector: "span" })).toBeInTheDocument(),
    );
  });

  it("shows Sending, not Continuing from, when no previous upload is resumed", async () => {
    artworkFiles.uploadDesignAsset.mockImplementation(
      (_db: unknown, _url: string, _projectId: string, _file: File, options: { onProgress?: (fraction: number) => void }) => {
        options.onProgress?.(0.4);
        return new Promise(() => {});
      },
    );
    renderDialog(version);
    selectVideoFile();
    fireEvent.click(screen.getByRole("button", { name: /add design/i }));
    await waitFor(() =>
      expect(screen.getByText(/sending 40%/i, { selector: "span" })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/continuing from/i)).not.toBeInTheDocument();
  });
});

describe("a permanent processing failure", () => {
  it("does not silently reprocess the same raw path on resubmit, and offers no retry label", async () => {
    artworkFiles.classifyUploadError.mockReturnValue("permanent");
    artworkFiles.uploadDesignAsset.mockImplementation(
      (_db: unknown, _url: string, _projectId: string, _file: File, options: { onRawPath?: (path: string) => void }) => {
        options.onRawPath?.("project-1/raw-1.raw");
        return Promise.reject(new Error("The file is not a playable MP4 or WebM video."));
      },
    );
    renderDialog(version);
    selectVideoFile();
    fireEvent.click(screen.getByRole("button", { name: /add design/i }));
    await waitFor(() => expect(screen.getByText(/not a playable/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /try processing again/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^add design$/i })).toBeInTheDocument();

    // A resubmit without choosing a new file must go through uploadDesignAsset again (a full,
    // fresh attempt), never straight to sanitizeVideoAsset with the stale raw path — that fast
    // path is reserved for a classified-transient failure only.
    artworkFiles.uploadDesignAsset.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /^add design$/i }));
    await waitFor(() => expect(artworkFiles.uploadDesignAsset).toHaveBeenCalled());
    expect(mediaClient.sanitizeVideoAsset).not.toHaveBeenCalled();
  });
});

describe("Try processing again", () => {
  it("relabels the submit control after the automatic retry is exhausted, and resubmitting skips the transfer", async () => {
    artworkFiles.classifyUploadError.mockReturnValue("transient");
    artworkFiles.uploadDesignAsset.mockImplementation(
      (_db: unknown, _url: string, _projectId: string, _file: File, options: { onRawPath?: (path: string) => void }) => {
        options.onRawPath?.("project-1/raw-1.raw");
        return Promise.reject(new Error("Media processing is busy."));
      },
    );
    renderDialog(version);
    selectVideoFile();
    fireEvent.click(screen.getByRole("button", { name: /add design/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /try processing again/i })).toBeInTheDocument());

    mediaClient.sanitizeVideoAsset.mockResolvedValue({ path: "clean-project/clean.mp4", durationSeconds: 1, width: 1, height: 1 });
    fireEvent.click(screen.getByRole("button", { name: /try processing again/i }));
    await waitFor(() => expect(mediaClient.sanitizeVideoAsset).toHaveBeenCalled());
    expect(artworkFiles.uploadDesignAsset).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd apps/web && npx vitest run features/projects/project-action-dialog.test.tsx`
Expected: FAIL — the current `ProjectActionDialog` blocks Cancel while `mutation.isPending`, never
calls `discardRawUpload`, never shows "Upload cancelled" or "Try processing again", and calls
`uploadDesignAsset` with a positional `onProgress` argument the mocks above do not expect in that
position.

- [ ] **Step 3: Rewrite `project-action-dialog.tsx`**

Change the import block (add the new names, keep `discardUnreferencedArtwork`/`uploadDesignAsset`,
add `sanitizeVideoAsset`):

```tsx
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import {
  classifyUploadError,
  discardRawUpload,
  discardUnreferencedArtwork,
  uploadDesignAsset,
  UploadCancelledError,
} from "./artwork-files";
import { discardPreparedAssets, preparePublicationAssets, sanitizeVideoAsset } from "./media-client";
```

Replace the block from `const [stagedArtwork, setStagedArtwork] = useState...` through the end of
the `close()` function (currently lines ~60-93) with:

```tsx
  const { database, mediaUrl } = useAuth();
  const invalidate = useInvalidateProject();
  const [stagedArtwork, setStagedArtwork] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState("");
  const [returningFromPlayground, setReturningFromPlayground] = useState(false);
  const playgroundTrigger = useRef<HTMLButtonElement>(null);
  // `null` means no upload is in flight for this attempt; once an upload begins it's set to 0 and
  // tracks `uploadDesignAsset`'s `onProgress` fraction up to 1.
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const rawPathRef = useRef<string | null>(null);
  const videoInputRef = useRef<{ projectId: string; rawPath: string; mimeType: string } | null>(null);
  // Distinguishes "Sending N%" from "Continuing from N%" — set only by `onResuming`, which
  // `uploadDesignAsset` calls when `findPreviousUploads` found a matching previous attempt.
  const [continuing, setContinuing] = useState(false);
  const uploading = uploadProgress !== null && (mutation.isPending as boolean);

  function cancelUpload() {
    controllerRef.current?.abort();
    const rawPath = rawPathRef.current;
    rawPathRef.current = null;
    videoInputRef.current = null;
    setContinuing(false);
    if (rawPath) void discardRawUpload(database, mediaUrl, { projectId, rawPath }).catch(() => {});
  }

  async function close() {
    if (closing) return;
    controllerRef.current?.abort();
    const rawPath = rawPathRef.current;
    setClosing(true);
    setCloseError("");
    try {
      if (rawPath) await discardRawUpload(database, mediaUrl, { projectId, rawPath }).catch(() => {});
      if (stagedArtwork) await discardUnreferencedArtwork(database, stagedArtwork);
      setUploadProgress(null);
      setContinuing(false);
      onClose();
    } catch {
      setCloseError("The unfinished upload could not be removed. Please try closing again.");
    } finally {
      setClosing(false);
    }
  }
```

(The declaration order above forward-references `mutation`, which is declared a few lines below by
the existing `const mutation = useMutation({...})` — move the `uploading`/`cancelUpload`/`close`
block to **after** the `mutation` declaration instead, so `mutation.isPending` is already in scope;
everything else in this step is unchanged.)

Replace the `beforeunload` effect's dependency reasoning is unchanged, but add a second effect
right after it that resets upload progress once a cancelled mutation settles:

```tsx
  useEffect(() => {
    if (mutation.error instanceof UploadCancelledError) setUploadProgress(null);
  }, [mutation.error]);
```

Inside `mutationFn`, replace the design/edit-design branch's upload step (currently the block
starting `const file = form.get("artwork"); let path = stagedArtwork; if (!path && file
instanceof File && file.size) {...}`) with:

```tsx
        const file = form.get("artwork");
        let path = stagedArtwork;
        if (!path && file instanceof File && file.size) {
          const isVideo = file.type.startsWith("video/");
          // Only reprocess the stored raw file without a fresh transfer when the previous attempt
          // is the exact "Try processing again" state — a transient failure that already exhausted
          // its automatic retry. A permanent (415/422) failure must not silently reprocess the same
          // doomed content: it keeps the "Add design" label, and a resubmit takes the full upload
          // path below, which requires the person to have chosen a file (the same one fails again
          // with the same message, or a newly chosen one starts clean).
          const retryable =
            isVideo &&
            !!rawPathRef.current &&
            !!videoInputRef.current &&
            !!mutation.error &&
            classifyUploadError(mutation.error) === "transient";
          if (isVideo) setUploadProgress(retryable ? 1 : 0);
          if (retryable) {
            const controller = new AbortController();
            controllerRef.current = controller;
            const sanitized = await sanitizeVideoAsset(database, mediaUrl, videoInputRef.current!, controller.signal);
            path = sanitized.path;
          } else {
            if (isVideo) {
              rawPathRef.current = null;
              videoInputRef.current = null;
              setContinuing(false);
            }
            const controller = new AbortController();
            controllerRef.current = controller;
            path = await uploadDesignAsset(database, mediaUrl, projectId, file, {
              onProgress: isVideo ? setUploadProgress : undefined,
              onResuming: isVideo ? () => setContinuing(true) : undefined,
              onRawPath: isVideo
                ? (value) => {
                    rawPathRef.current = value;
                    videoInputRef.current = { projectId, rawPath: value, mimeType: file.type };
                  }
                : undefined,
              signal: controller.signal,
            });
          }
          if (controllerRef.current?.signal.aborted) throw new UploadCancelledError();
          rawPathRef.current = null;
        }
```

Change `onSuccess` to also clear the retry refs on a real success:

```tsx
    onSuccess: async () => {
      setUploadProgress(null);
      setContinuing(false);
      videoInputRef.current = null;
      await invalidate();
      onClose();
    },
```

In the render, change the file input to clear stale retry state on a fresh selection:

```tsx
                <label>
                  Design file
                  <input
                    name="artwork"
                    type="file"
                    disabled={!!stagedArtwork || mutation.isPending}
                    accept={designUploadMimes.join(",")}
                    onChange={() => {
                      rawPathRef.current = null;
                      videoInputRef.current = null;
                      setContinuing(false);
                      if (mutation.error) mutation.reset();
                    }}
                  />
                  <small>
                    {uploadTypesLabel(designUploadMimes)}. Images up to{" "}
                    {uploadLimitMb(ARTWORK_MAX_BYTES)} MB, video up to{" "}
                    {uploadLimitMb(VIDEO_MAX_BYTES)} MB.
                  </small>
                </label>
```

Change the progress paragraph's text from a bare percentage to the spec's two distinct states.
Replace:

```tsx
                    <span>
                      {sanitizing ? "Processing…" : `${Math.round(uploadProgress * 100)}%`}
                    </span>
```

with:

```tsx
                    <span>
                      {sanitizing
                        ? "Processing…"
                        : `${continuing ? "Continuing from" : "Sending"} ${Math.round(uploadProgress * 100)}%`}
                    </span>
```

Add the sanitizing/notice derivations right above the `return (`, replacing the existing single
`sanitizing` line:

```tsx
  const sanitizing = mutation.isPending && uploadProgress === 1;
  const uploadErrorKind = mutation.error ? classifyUploadError(mutation.error) : null;
```

Replace the `{uploadProgress !== null && (...)}` progress block's sibling error/notice rendering —
change the existing `{(mutation.error || closeError) && (<FormError>...)}` block to:

```tsx
                {uploadErrorKind === "cancelled" && (
                  <p className="upload-progress" aria-live="polite">
                    Upload cancelled.
                  </p>
                )}
                {uploadErrorKind === "expired" && (
                  <p className="upload-progress" role="alert">
                    The upload expired; choose the file again.
                  </p>
                )}
                {((mutation.error && uploadErrorKind !== "cancelled" && uploadErrorKind !== "expired") ||
                  closeError) && <FormError>{closeError || mutation.error?.message}</FormError>}
```

Change the Cancel button:

```tsx
              <button
                className="button"
                type="button"
                onClick={() => (uploading ? cancelUpload() : void close())}
                disabled={closing}
              >
                Cancel
              </button>
```

Change the submit button's label expression:

```tsx
              <button className="button primary" type="submit" disabled={mutation.isPending}>
                {mutation.isPending
                  ? sanitizing
                    ? "Processing…"
                    : uploadProgress !== null
                      ? `${continuing ? "Continuing from" : "Sending"} ${Math.round(uploadProgress * 100)}%`
                      : "Saving…"
                  : uploadErrorKind === "transient"
                    ? "Try processing again"
                    : {
                        version: "Create version",
                        design: "Add design",
                        "edit-design": "Save working design",
                        publish: "Share version",
                        submit: "Send to studio",
                        review: "Send review",
                      }[action.kind]}
              </button>
```

Change the `Modal`'s `closeDisabled` prop from `mutation.isPending || closing` to `closing`, and its
`onClose` stays `() => void close()` (a true close, per the design decision above).

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd apps/web && npx vitest run features/projects/project-action-dialog.test.tsx`
Expected: PASS for all four scenarios.

- [ ] **Step 5: Run the full web check**

Run: `cd apps/web && npm run check`
Expected: PASS — typecheck, eslint, prettier and every vitest suite, including
`features/projects/artwork-files.test.ts`, `features/projects/media-client.test.ts` and the new
`features/projects/project-action-dialog.test.tsx`.

- [ ] **Step 6: Verify the data-access boundary**

Run: `grep -c '\.from(\|\.rpc(\|\.storage\.' apps/web/features/projects/*.tsx`
Expected: `0` for every `.tsx` file, including `project-action-dialog.tsx` — it calls
`uploadDesignAsset`, `discardRawUpload`, `discardUnreferencedArtwork` and `sanitizeVideoAsset`, all
of which live in `artwork-files.ts`/`media-client.ts`, never issuing a Supabase call itself.

- [ ] **Step 7: Commit**

```bash
git add apps/web/features/projects/project-action-dialog.tsx apps/web/features/projects/project-action-dialog.test.tsx
git commit -m "feat(web): make Cancel abort/discard mid-upload and add the Try processing again retry"
```

---

### Task 8: Browser (Playwright) — the spec's four verification scenarios

**Files:**
- Modify: `apps/web/tests/e2e/video-designs.spec.ts` (add new `test(...)` blocks; reuse
  `createProductionFixture`/`cleanupTestProject` from `./project-fixture` and `localAgency`/`signIn`
  from `./test-support`, exactly as the existing test in this file already does)

**Interfaces:**
- Consumes: `createProductionFixture(agency)`, `cleanupTestProject(projectId)`
  (`apps/web/tests/e2e/project-fixture.ts`); `localAgency()`, `signIn(page, email)`
  (`apps/web/tests/e2e/test-support.ts`); the fixture clip at
  `apps/web/tests/fixtures/campaign-clip.mp4` (already used by the existing test in this file).
- Produces: no new exported names.

- [ ] **Step 1: Write the four scenarios**

Add to `apps/web/tests/e2e/video-designs.spec.ts`, after the existing `test(...)` block:

```ts
test("cancelling mid-transfer on a throttled connection leaves no design and no stored object", async ({ page }) => {
  test.setTimeout(60_000);
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  try {
    await signIn(page, credentials.agency);
    await page.goto(`/projects/${fixture.projectId}`);
    // Throttle the resumable-upload endpoint so the transfer is still running when Cancel is
    // clicked, and capture the raw object's path from the tus creation request's own
    // Upload-Metadata header (`objectName <base64>`, comma-separated from `bucketName`/
    // `contentType`) so this test can assert the object itself is gone, not only the design row.
    let rawPath: string | undefined;
    await page.route("**/storage/v1/upload/resumable/**", async (route) => {
      const metadata = route.request().headers()["upload-metadata"];
      if (metadata && !rawPath) {
        const entry = metadata.split(",").map((part) => part.trim()).find((part) => part.startsWith("objectName "));
        if (entry) rawPath = Buffer.from(entry.slice("objectName ".length), "base64").toString("utf8");
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });
    await page.getByRole("button", { name: "Add design" }).first().click();
    await page.getByLabel("Design name").fill("Cancelled upload");
    await page.getByLabel("Design file").setInputFiles(clip);
    await page.getByRole("button", { name: /add design/i }).click();
    await expect(page.getByText(/sending/i)).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText(/upload cancelled/i)).toBeVisible();

    const designs = await readRowsEventually(
      () => agency.from("designs").select("id").eq("version_id", fixture.versionId).eq("title", "Cancelled upload"),
      0,
    );
    expect(designs).toHaveLength(0);
    expect(rawPath, "the tus creation request must have been observed for this assertion to be meaningful").toBeTruthy();
    if (rawPath) {
      const [projectDirectory, objectName] = rawPath.split("/");
      const listing = await agency.storage.from("internal-assets").list(projectDirectory);
      expect(listing.error).toBeNull();
      expect(listing.data?.some((entry) => entry.name === objectName)).toBe(false);
    }
  } finally {
    await cleanupTestProject(fixture.projectId);
  }
});

test("reloading mid-transfer and choosing the same file resumes and shows Continuing from", async ({ page }) => {
  test.setTimeout(90_000);
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  try {
    await signIn(page, credentials.agency);
    await page.goto(`/projects/${fixture.projectId}`);
    await page.route("**/storage/v1/upload/resumable/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    await page.getByRole("button", { name: "Add design" }).first().click();
    await page.getByLabel("Design name").fill("Resumed upload");
    await page.getByLabel("Design file").setInputFiles(clip);
    await page.getByRole("button", { name: /add design/i }).click();
    await expect(page.getByText(/sending/i)).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: "Add design" }).first().click();
    await page.getByLabel("Design name").fill("Resumed upload");
    await page.getByLabel("Design file").setInputFiles(clip);
    await expect(page.getByText(/continuing from/i)).toBeVisible({ timeout: 15_000 });
  } finally {
    await cleanupTestProject(fixture.projectId);
  }
});

test("a forced 503 on the first processing call recovers automatically", async ({ page }) => {
  test.setTimeout(60_000);
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  try {
    await signIn(page, credentials.agency);
    await page.goto(`/projects/${fixture.projectId}`);
    let calls = 0;
    await page.route("**/designs/sanitize-video", async (route) => {
      calls += 1;
      if (calls === 1) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Media processing is busy." }) });
      return route.continue();
    });
    await page.getByRole("button", { name: "Add design" }).first().click();
    await page.getByLabel("Design name").fill("Auto-recovered upload");
    await page.getByLabel("Design file").setInputFiles(clip);
    await page.getByRole("button", { name: /add design/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 30_000 });
    expect(calls).toBe(2);

    const designs = await readRowsEventually(
      () => agency.from("designs").select("id").eq("version_id", fixture.versionId).eq("title", "Auto-recovered upload"),
      1,
    );
    expect(designs).toHaveLength(1);
  } finally {
    await cleanupTestProject(fixture.projectId);
  }
});

test("two forced processing failures show Try processing again, which succeeds without a second transfer", async ({ page }) => {
  test.setTimeout(60_000);
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  try {
    await signIn(page, credentials.agency);
    await page.goto(`/projects/${fixture.projectId}`);
    let sanitizeCalls = 0;
    let transferCalls = 0;
    await page.route("**/storage/v1/upload/resumable/**", async (route) => {
      transferCalls += 1;
      await route.continue();
    });
    await page.route("**/designs/sanitize-video", async (route) => {
      sanitizeCalls += 1;
      if (sanitizeCalls <= 2) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Media processing is busy." }) });
      return route.continue();
    });
    await page.getByRole("button", { name: "Add design" }).first().click();
    await page.getByLabel("Design name").fill("Manually retried upload");
    await page.getByLabel("Design file").setInputFiles(clip);
    await page.getByRole("button", { name: /add design/i }).click();
    const retry = page.getByRole("button", { name: /try processing again/i });
    await expect(retry).toBeVisible({ timeout: 30_000 });
    expect(sanitizeCalls).toBe(2);
    const transferCallsBeforeRetry = transferCalls;

    await retry.click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 30_000 });
    expect(sanitizeCalls).toBe(3);
    expect(transferCalls).toBe(transferCallsBeforeRetry);

    const designs = await readRowsEventually(
      () => agency.from("designs").select("id").eq("version_id", fixture.versionId).eq("title", "Manually retried upload"),
      1,
    );
    expect(designs).toHaveLength(1);
  } finally {
    await cleanupTestProject(fixture.projectId);
  }
});
```

`fixture.versionId` must exist on the object `createProductionFixture` returns — read
`apps/web/tests/e2e/project-fixture.ts` in full before writing this step, and if the fixture
returns the working version id under a different property name, use that name instead (the
existing test in this file already reads some field off `fixture` to navigate to the project; match
its actual shape rather than the name assumed here).

- [ ] **Step 2: Run the new scenarios and verify they fail**

Run: `cd apps/web && npx playwright test tests/e2e/video-designs.spec.ts --reporter=line`
Expected: FAIL against the pre-Task-6/7 code (no Cancel-while-uploading, no resume, no automatic or
manual retry). Run this against the branch state **before** Tasks 6–7 land, if executing tasks out
of TDD order across the whole plan is impractical; otherwise, since Tasks 6–7 are already complete
by the time this task starts, run it once now expecting **pass**, and treat a failure as a signal
that Task 6 or 7 has a defect to fix before continuing, per
`superpowers:systematic-debugging` rather than by weakening this test.

- [ ] **Step 3: Fix forward or confirm pass**

Run: `cd apps/web && npx playwright test tests/e2e/video-designs.spec.ts --reporter=line`
Expected: PASS, 5 passed (the original multi-role test plus these four). Then run the full suite:

Run: `cd apps/web && npx playwright test --reporter=line`
Expected: every spec passes, count increased by 4 over the pre-task baseline.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/e2e/video-designs.spec.ts
git commit -m "test(e2e): cover cancel, resume, automatic retry and manual retry for video uploads"
```

---

### Task 9: Documentation — READMEs, production guide, acceptance matrix, verification record

**Files:**
- Modify: `apps/web/features/projects/README.md`
- Modify: `apps/media/README.md`
- Modify: `docs/operations/production.md`
- Modify: `docs/architecture/acceptance-matrix.md`
- Create: `docs/verification/video-upload-lifecycle-2026-09-23.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Update `apps/web/features/projects/README.md`**

In the paragraph beginning "`uploadDesignAsset` is the single entry point `project-action-dialog.tsx`
calls for a design file..." (the paragraph documenting the video upload path), add a sentence after
the existing description of `uploadResumable`/`sanitizeVideoAsset`, along these lines: the resumable
transfer is fingerprinted per user, project and file so choosing the same file again after a reload
or a dropped connection resumes it; a single Cancel aborts the transfer or the processing call and,
during processing, deletes the raw upload through the media service; a transient processing failure
is retried once automatically and a second failure offers "Try processing again" without
re-uploading; and raw uploads and orphaned processed outputs older than 24 hours are removed by the
media service's hourly sweep. Cross-reference `docs/superpowers/specs/2026-09-23-video-upload-lifecycle-design.md`
for the full design. Verify this paragraph's current wording first (it may have shifted since this
plan's research pass) and integrate the addition into the existing prose rather than appending a
disconnected new paragraph.

- [ ] **Step 2: Update `apps/media/README.md`**

In the `POST /designs/sanitize-video` bullet under `## API`, add: a disconnect during processing
aborts the in-flight work but keeps the raw object; content ffprobe/ffmpeg rejects returns `422`
and deletes the raw object; a missing raw object with no attested output returns `410`; download,
storage and upload failures return `503`, and a timeout returns `504`; and before processing, the
service looks for an existing attested output produced from the same raw path within the last 24
hours and returns it without re-running ffmpeg. Add a new bullet for `POST /designs/discard-raw`,
mirroring the existing bullets' style: accepts JSON `{ "projectId", "rawPath" }`, applies the same
authorization and path validation as `/designs/sanitize-video`, and returns `{ "discarded": true }`
whether or not the object existed. In the "Byte handling and limits" section's cleanup paragraph,
add a sentence noting the hourly sweep also removes stale raw uploads and orphaned internal-assets
outputs older than 24 hours via `list_stale_video_uploads`, distinct from the existing prepared/
delivery sweep. Update the "Tests and image" section's test-file bullet to mention the new
discard-raw, idempotent-retry, disconnect-abort and status-classification coverage in
`server.test.js`/`supabase.test.js`/`sanitize.test.js`, and refresh the stated test counts by
actually running `npm --prefix apps/media test` and reading its output rather than incrementing the
old numbers by guess.

- [ ] **Step 3: Update `docs/operations/production.md`**

In the "5. Release checklist" section, add a new numbered item after the existing item 6 ("A video
larger than 50 MB uploads, publishes and plays for a client..."), stating: cancelling a video upload
mid-transfer and mid-processing leaves no design and no stored object; reloading mid-transfer and
choosing the same file resumes it; a forced transient processing failure recovers automatically or
via "Try processing again"; and raw uploads and orphaned outputs older than 24 hours are removed
automatically. Cross-reference the new Playwright scenarios in `video-designs.spec.ts` (Task 8) as
the evidence for this checklist item, the same way item 6 already implicitly relies on that file's
existing test.

- [ ] **Step 4: Update `docs/architecture/acceptance-matrix.md`**

Locate the F18 row (video design review) and append a dated addendum sentence to its evidence
column, in the same style the I06 row already uses for its own "Re-assessed"/"Repaired" additions:
state that the video upload lifecycle (cancel, resume, retry, cleanup) was implemented and verified
on 2026-09-23 per `docs/superpowers/specs/2026-09-23-video-upload-lifecycle-design.md` and the new
Playwright scenarios in `video-designs.spec.ts`, with a pointer to the verification record created
in Step 5. Do not rewrite or remove any of F18's existing verified content — this is an addendum,
not a replacement, matching how every other dated update in this file is recorded.

- [ ] **Step 5: Create the verification record**

Create `docs/verification/video-upload-lifecycle-2026-09-23.md` recording, with real command output
gathered by actually running each command (not fabricated numbers): the pgTAP result for
`video_upload_lifecycle.test.sql` (Task 1); `npm --prefix apps/media test`'s full pass count (Tasks
2–5); `npm run check`'s full pass count from `apps/web` (Tasks 6–7); the Playwright run count for
`video-designs.spec.ts` and the full suite (Task 8); and the `grep -c
'\.from(\|\.rpc(\|\.storage\.' apps/web/features/projects/*.tsx` data-access check (all zero).
State plainly which of the spec's four success criteria (Cancel, Resume, Retry, Cleanup) each check
actually demonstrates, and record the two known risks from the spec's Risks section as still open
at the scope this plan closes: TUS termination support on a real backend is exercised only insofar
as the Playwright cancel scenario records which path (server termination vs. 24-hour expiry)
actually happened, and R2's incomplete-multipart-upload lifecycle rule is proven only on a real R2
staging run, consistent with the existing "MinIO cannot reproduce R2's tagging limit" caveat already
in `docs/operations/production.md`.

- [ ] **Step 6: Run the full gate**

Run, from the repository root: `npm run check && npm --prefix apps/media test && npm run db:test &&
npx playwright test tests/e2e/video-designs.spec.ts --reporter=line`
Expected: everything passes except the canonical-count pgTAP assertion, which stays
expected-failing under the SABRE overlay per `CLAUDE.md` and `supabase/demo/sabre/README.md` — this
is the spec's own stated Gate, reproduced here verbatim.

- [ ] **Step 7: Commit**

```bash
git add apps/web/features/projects/README.md apps/media/README.md docs/operations/production.md docs/architecture/acceptance-matrix.md docs/verification/video-upload-lifecycle-2026-09-23.md
git commit -m "docs: record the video upload lifecycle design, API surface and verification evidence"
```

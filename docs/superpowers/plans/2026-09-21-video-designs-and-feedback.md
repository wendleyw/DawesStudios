# Video Designs and Time-Coded Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A design can be a video, and a reviewer can pin a comment to a point on a frame at a moment in time — for clients as well as internally.

**Architecture:** Video is a `designs` row whose `internal_asset_path` points at a video object, so it inherits versions, publication, role isolation and `design_id`-keyed pins. The browser uploads the raw file straight to storage with a resumable upload, then asks `apps/media` to strip metadata with an `ffmpeg` stream-copy remux and write a clean object. Publication copies the already-clean object rather than processing at publish time.

**Tech Stack:** Postgres 15 + pgTAP, Supabase Storage, Node 24 (`apps/media`, `sharp`, `ffmpeg`), Next.js 16 App Router, React 19, TanStack Query, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-21-video-designs-and-feedback-design.md`

## Global Constraints

- **Language:** English for all code, comments, tests, docs, commit messages. Brazilian Portuguese only in direct chat.
- **Data access:** Supabase queries live only in `features/<feature>/<feature>-data.ts`. Reads are `use<Thing>()` hooks; writes are plain `async (database, input)` functions. Zero inline queries in components — a repo-wide check asserts this.
- **Styling boundary:** feature rules go in `features/<feature>/<feature>.css`. `features/shared/stylesheet-boundary.test.ts` fails if a selector appears in two feature stylesheets.
- **Cache keys:** invalidate only the key your write dirties, composed from the owner's exported record. Do **not** use `useInvalidateProject()` for a comment write — it covers `["project-detail", "projects", "comments", "notifications"]` and a comment dirties only `comments`.
- **Negative authorization tests must re-read the stored value after the attempt.** `authenticated` holds column-level `UPDATE` grants on ten tables, so a forbidden `UPDATE` answers `204` with zero rows changed, not `42501`. A status-code-only assertion records a false "allowed".
- **Size ceiling:** 1 GB for video (`1024 * 1024 * 1024`). Stated reason: remux time and storage cost — **not** decode memory, because no decode happens.
- **Accepted video formats:** `video/mp4` and `video/webm` only. No transcoding.
- **Never collapse per-path ceilings** in `upload-rules.ts`. `ARTWORK_MAX_BYTES` (25 MB) is load-bearing and separate.
- **Run before every commit:** `npm run check` from `apps/web`. Migrations additionally need `npm run db:test` from the repo root.

---

### Task 1: Pin time in the data model

**Files:**
- Create: `supabase/migrations/202609210001_video_pins.sql`
- Test: `supabase/tests/database/video_pins.test.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `internal_comments.pin_t numeric`, `client_comments.pin_t numeric`, and `public.post_comment(p_project_id uuid, p_channel text, p_body text, p_version_id uuid, p_design_id uuid, p_pin_x numeric, p_pin_y numeric, p_pin_t numeric)` — `p_pin_t` appended last with `default null`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/database/video_pins.test.sql`:

```sql
begin;
select plan(5);

set local role postgres;
select set_config('request.jwt.claims', json_build_object('sub', md5('dawes:designer-1')::uuid, 'role', 'authenticated')::text, true);
set local role authenticated;

-- A pin carrying time and position is accepted.
select lives_ok($$
  select public.post_comment(
    md5('dawes:project-1')::uuid, 'internal', 'Fix the logo entrance',
    md5('dawes:version-1-1')::uuid, md5('dawes:design-1-1-0')::uuid, 0.4, 0.6, 12.5)
$$, 'a pin with time and position is accepted');

select is(
  (select pin_t from public.internal_comments where body = 'Fix the logo entrance'),
  12.5::numeric, 'pin_t is stored as given');

-- Time without coordinates is a half-pin and has no rendering.
select throws_ok($$
  select public.post_comment(
    md5('dawes:project-1')::uuid, 'internal', 'Time only',
    md5('dawes:version-1-1')::uuid, md5('dawes:design-1-1-0')::uuid, null, null, 3.0)
$$, '23514', null, 'pin_t without coordinates is rejected');

-- Negative time is not a position in any video.
select throws_ok($$
  select public.post_comment(
    md5('dawes:project-1')::uuid, 'internal', 'Negative time',
    md5('dawes:version-1-1')::uuid, md5('dawes:design-1-1-0')::uuid, 0.4, 0.6, -1.0)
$$, '23514', null, 'negative pin_t is rejected');

-- Every existing caller omits the argument and still works.
select lives_ok($$
  select public.post_comment(
    md5('dawes:project-1')::uuid, 'internal', 'No pin at all', null, null)
$$, 'the pre-existing seven-argument call still resolves');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run db:test`
Expected: FAIL — `post_comment` has no eighth parameter, so the eight-argument calls raise `42883 function does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/202609210001_video_pins.sql`:

```sql
-- A pin on a video needs a moment as well as a point. `pin_t` is seconds from the start of the
-- media, not a normalised fraction: a fraction would silently change meaning if the same design
-- were ever replaced by a clip of a different length, and the player reports `currentTime` in
-- seconds anyway.
alter table public.internal_comments add column pin_t numeric;
alter table public.client_comments add column pin_t numeric;

-- The pin rule gains time without loosening what it already guaranteed. A pin still requires a
-- design and normalised coordinates; `pin_t` is optional and non-negative, and may only appear
-- alongside coordinates. Time without a point is refused deliberately — the product pins a place
-- in a frame at a moment, and a half-pin has nothing to draw.
alter table public.internal_comments drop constraint internal_comments_check1;
alter table public.internal_comments add constraint internal_comments_pin_check check(
  (pin_x is null and pin_y is null and pin_t is null)
  or (design_id is not null
      and pin_x between 0 and 1 and pin_y between 0 and 1
      and (pin_t is null or pin_t >= 0)));

alter table public.client_comments drop constraint client_comments_check1;
alter table public.client_comments add constraint client_comments_pin_check check(
  (pin_x is null and pin_y is null and pin_t is null)
  or (design_id is not null
      and pin_x between 0 and 1 and pin_y between 0 and 1
      and (pin_t is null or pin_t >= 0)));

-- `p_pin_t` is appended last with a default so that every existing seven-argument call site keeps
-- resolving to this function unchanged.
create or replace function public.post_comment(p_project_id uuid,p_channel text,p_body text,p_version_id uuid default null,p_design_id uuid default null,p_pin_x numeric default null,p_pin_y numeric default null,p_pin_t numeric default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare result_id uuid; target_client uuid; sender_name text; begin
 select client_id into target_client from public.projects where id=p_project_id;
 if p_channel='internal' then
  if not private.can_produce(p_project_id) then raise exception 'Internal channel access required' using errcode='42501'; end if;
  insert into public.internal_comments(project_id,version_id,design_id,author_id,body,pin_x,pin_y,pin_t) values(p_project_id,p_version_id,p_design_id,auth.uid(),trim(p_body),p_pin_x,p_pin_y,p_pin_t) returning id into result_id;
  if private.is_agency() then insert into public.notifications(user_id,client_id,project_id,title) select designer_id,target_client,p_project_id,'New studio message' from public.project_assignments where project_id=p_project_id; else perform private.notify_agency(target_client,p_project_id,'New internal message'); end if;
 elsif p_channel='client' then
  if not private.can_client_channel(p_project_id) then raise exception 'Client channel access required' using errcode='42501'; end if;
  select case when private.is_agency() then 'Studio' else display_name end into sender_name from public.profiles where id=auth.uid();
  insert into public.client_comments(project_id,publication_id,design_id,author_label,author_kind,body,pin_x,pin_y,pin_t) values(p_project_id,p_version_id,p_design_id,sender_name,case when private.is_agency() then 'studio' else 'client' end,trim(p_body),p_pin_x,p_pin_y,p_pin_t) returning id into result_id;
  insert into private.client_comment_authors(comment_id,author_id) values(result_id,auth.uid());
  if private.is_agency() then perform private.notify_client(target_client,p_project_id,'New message from Studio'); else perform private.notify_agency(target_client,p_project_id,'New client message'); end if;
 else raise exception 'Invalid comment channel'; end if;
 return result_id;
end $$;
```

**Before running:** confirm the real constraint names. Run
`psql "$DATABASE_URL" -c "\d public.internal_comments"` (or use Supabase Studio at
`http://127.0.0.1:55423`) and read the `Check constraints:` block. Postgres names unnamed
check constraints `<table>_check`, `<table>_check1`, `<table>_check2` … in declaration
order. `internal_comments` declares two unnamed checks after the column-level ones — the
`design_id is null or version_id is not null` rule and the pin rule — so the pin rule is
very likely `_check1`, but **verify rather than assume**; dropping the wrong one silently
removes a different guarantee.

- [ ] **Step 4: Apply and run the test to verify it passes**

Run: `npm run db:reset && npm run db:test`
Expected: PASS — 5/5 in `video_pins.test.sql`, and every pre-existing file still green (133 assertions before this task's 5).

- [ ] **Step 5: Regenerate the database types**

Run: `npm run db:types`
Expected: `supabase/database.types.ts` gains `pin_t` on both comment tables and `p_pin_t` on the `post_comment` argument type.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202609210001_video_pins.sql supabase/tests/database/video_pins.test.sql supabase/database.types.ts
git commit -m "feat(comments): pin a comment to a moment as well as a point"
```

---

### Task 2: Storage capacity for video

**Files:**
- Create: `supabase/migrations/202609210002_video_storage.sql`
- Modify: `supabase/config.toml:112`
- Test: `supabase/tests/database/video_storage.test.sql`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `internal-assets` and `published-assets` at `file_size_limit = 1073741824` with `video/mp4` and `video/webm` in `allowed_mime_types`; `private.opaque_storage_path()` accepting `mp4`, `webm` and `raw`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/database/video_storage.test.sql`:

```sql
begin;
select plan(6);

select is((select file_size_limit from storage.buckets where id = 'internal-assets'),
          1073741824::bigint, 'internal-assets holds a gigabyte');
select is((select file_size_limit from storage.buckets where id = 'published-assets'),
          1073741824::bigint, 'published-assets holds a gigabyte');

select ok((select allowed_mime_types from storage.buckets where id = 'internal-assets')
          @> array['video/mp4','video/webm'], 'internal-assets accepts web video');
select ok((select allowed_mime_types from storage.buckets where id = 'published-assets')
          @> array['video/mp4','video/webm'], 'published-assets accepts web video');

-- Brand assets and deliveries are not design surfaces and must not have widened.
select is((select file_size_limit from storage.buckets where id = 'brand-assets'),
          52428800::bigint, 'brand-assets is untouched');

select ok(private.opaque_storage_path(
            md5('a')::uuid::text || '/' || md5('b')::uuid::text || '.mp4'),
          'an mp4 object path is opaque-valid');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run db:test`
Expected: FAIL — the buckets still report `52428800`, and `opaque_storage_path` rejects `.mp4`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/202609210002_video_storage.sql`:

```sql
-- Video is a design, so only the two design buckets widen. `brand-assets` and `delivery-files`
-- keep their 50 MiB ceiling: a logo and a delivery file are not video surfaces, and widening a
-- bucket costs nothing to write but everything to narrow again once objects exist.
--
-- One gigabyte covers ten minutes of 1080p H.264 at roughly 13 Mbit/s. The ceiling's reason is
-- remux time and storage cost. It is deliberately NOT the image reason: nothing decodes a video
-- frame here, so browser memory does not bound it.
update storage.buckets
   set file_size_limit = 1073741824,
       allowed_mime_types = allowed_mime_types || array['video/mp4','video/webm']
 where id in ('internal-assets','published-assets');

-- `.raw` names the object a resumable upload lands on before the media service has stripped its
-- metadata. It exists for the duration of one sanitisation and is deleted once the clean object
-- is written. No signed-URL read path serves it; it is here so the path passes the opacity rule
-- while it exists.
create or replace function private.opaque_storage_path(path text) returns boolean language sql immutable set search_path='' as $$
 select path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|pdf|svg|zip|mp4|webm|raw)$'
$$;
```

- [ ] **Step 4: Raise the global storage ceiling**

A bucket's `file_size_limit` cannot exceed the storage service's global limit, so the
migration alone is not enough. In `supabase/config.toml`, line 112:

```toml
# Was: file_size_limit = "50MiB"
# One gigabyte, to match the two design buckets. A bucket limit above this value is silently
# capped by the storage service, so the two must be raised together.
file_size_limit = "1GiB"
```

- [ ] **Step 5: Restart the stack and run the test to verify it passes**

Run: `npm run db:stop && npm run db:start && npm run db:reset && npm run db:test`
Expected: PASS — 6/6 in `video_storage.test.sql`, every other file still green.

A restart is required because `config.toml` is read at container start. The seeded data
survives `db:start`; `db:reset` is what reloads it, and it is run here because the
migration changed.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202609210002_video_storage.sql supabase/config.toml supabase/tests/database/video_storage.test.sql
git commit -m "feat(storage): accept web video up to a gigabyte on the design buckets"
```

---

### Task 3: The client-side video upload contract

**Files:**
- Modify: `apps/web/features/shared/upload-rules.ts`
- Test: `apps/web/features/shared/upload-rules.test.ts`

**Interfaces:**
- Consumes: the bucket limits from Task 2 (the test parses the migration SQL).
- Produces: `VIDEO_MAX_BYTES`, `videoUploadMimes`, `designUploadMimes`, and `video/mp4`/`video/webm` entries in `uploadExtensions` and `mimeLabels`.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/features/shared/upload-rules.test.ts`:

```ts
describe("video", () => {
  it("matches the design buckets' raised ceiling in the migration", () => {
    const sql = readFileSync(
      resolve(import.meta.dirname, "../../../../supabase/migrations/202609210002_video_storage.sql"),
      "utf8",
    );
    const limit = sql.match(/file_size_limit = (\d+)/)?.[1];
    expect(Number(limit)).toBe(VIDEO_MAX_BYTES);
  });

  it("keeps the artwork ceiling far below the video one", () => {
    expect(ARTWORK_MAX_BYTES).toBeLessThan(VIDEO_MAX_BYTES);
  });

  it("offers image and video together on the design path", () => {
    expect(designUploadMimes).toContain("image/png");
    expect(designUploadMimes).toContain("video/mp4");
    expect(designUploadMimes).toContain("video/webm");
  });

  it("names video types in prose a person can read", () => {
    expect(uploadTypesLabel(videoUploadMimes)).toBe("MP4, or WebM");
  });
});
```

Add `VIDEO_MAX_BYTES`, `designUploadMimes` and `videoUploadMimes` to the file's existing
import from `./upload-rules`. If `readFileSync` and `resolve` are not already imported at
the top of the test file, add `import { readFileSync } from "node:fs";` and
`import { resolve } from "node:path";`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run features/shared/upload-rules.test.ts`
Expected: FAIL — `VIDEO_MAX_BYTES is not exported`.

- [ ] **Step 3: Extend the module**

In `apps/web/features/shared/upload-rules.ts`, add after `ARTWORK_MAX_BYTES`:

```ts
/**
 * The design path accepts video up to a gigabyte, matching `internal-assets` and
 * `published-assets` after `supabase/migrations/202609210002_video_storage.sql`.
 *
 * The reason for this ceiling is **remux time and storage cost**, and deliberately not the
 * reason behind `ARTWORK_MAX_BYTES`. Nothing decodes a video frame in the browser: the file is
 * uploaded as-is and `apps/media` strips its metadata with a stream copy. There is no bitmap to
 * allocate, so browser memory does not bound this number. A gigabyte covers ten minutes of
 * 1080p H.264 at roughly 13 Mbit/s.
 *
 * Do not collapse this into `BUCKET_MAX_BYTES` or `ARTWORK_MAX_BYTES`. The three ceilings answer
 * three different questions.
 */
export const VIDEO_MAX_BYTES = 1024 * 1024 * 1024;
```

Add to `uploadExtensions`:

```ts
  "video/mp4": ["mp4"],
  "video/webm": ["webm"],
```

Add to `mimeLabels`:

```ts
  "video/mp4": "MP4",
  "video/webm": "WebM",
```

Add after `brandUploadMimes`:

```ts
/**
 * Web-playable video only. The product accepts what a browser can play without transcoding: a
 * `.mov` or ProRes file is refused rather than converted, because converting it would mean an
 * ffmpeg re-encode, a queue, and processing state in the interface for a case a designer can
 * resolve at export time.
 */
export const videoUploadMimes = [
  "video/mp4",
  "video/webm",
] as const satisfies readonly UploadMime[];

/**
 * What the design uploader accepts: an image to compose or a video to review. The two carry
 * different ceilings and different preparation paths, so `uploadDesignAsset` branches on the
 * file's type rather than treating this as one homogeneous list.
 */
export const designUploadMimes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "video/webm",
] as const satisfies readonly UploadMime[];

/** Whether a file's declared type takes the video path rather than the image one. */
export function isVideoUpload(mime: string): boolean {
  const allowed: readonly string[] = videoUploadMimes;
  return allowed.includes(mime);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run features/shared/upload-rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole check**

Run: `cd apps/web && npm run check`
Expected: all green. `standardUploadMimes` and `brandUploadMimes` are unchanged, so no
existing uploader gains video.

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/shared/upload-rules.ts apps/web/features/shared/upload-rules.test.ts
git commit -m "feat(uploads): declare the video ceiling and allow-list"
```

---

### Task 4: Strip video metadata in the media service

**Files:**
- Modify: `apps/media/src/sanitize.js`
- Modify: `apps/media/Dockerfile:2`
- Test: `apps/media/src/sanitize.test.js`
- Create: `apps/media/src/fixtures/tagged.mp4` (generated, see Step 1)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `sanitizeVideo(inputPath, outputPath, mimeType)` → `Promise<{ durationSeconds: number, width: number, height: number }>`, throwing `MediaError` on refusal. `LIMITS` gains `videoBytes` and `videoProcessMs`.

- [ ] **Step 1: Generate a fixture that actually carries metadata**

The assertion is that the output has none — not that input and output differ. So the
input must demonstrably carry metadata first.

```bash
cd apps/media/src && mkdir -p fixtures
ffmpeg -f lavfi -i testsrc=duration=2:size=320x240:rate=15 \
  -c:v libx264 -pix_fmt yuv420p \
  -metadata title="Internal working title" \
  -metadata comment="GPS 51.5074,-0.1278" \
  -metadata artist="Camera Model X200" \
  fixtures/tagged.mp4
ffprobe -v error -show_entries format_tags fixtures/tagged.mp4
```

Expected from `ffprobe`: a `[FORMAT]` block listing `TAG:title`, `TAG:comment` and
`TAG:artist`. If it is empty the fixture is useless — the test would pass against a file
that never had metadata.

- [ ] **Step 2: Write the failing test**

Append to `apps/media/src/sanitize.test.js`:

```js
import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

async function tagsOf(path) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format_tags', '-of', 'json', path]);
  return JSON.parse(stdout).format?.tags ?? {};
}

describe('sanitizeVideo', () => {
  let dir;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'video-test-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('removes every container tag the source carried', async () => {
    const input = resolve(import.meta.dirname, 'fixtures/tagged.mp4');
    expect(Object.keys(await tagsOf(input)).length).toBeGreaterThan(0);

    const output = join(dir, 'clean.mp4');
    const probe = await sanitizeVideo(input, output, 'video/mp4');

    const tags = await tagsOf(output);
    for (const key of ['title', 'comment', 'artist']) expect(tags[key]).toBeUndefined();
    expect(probe.width).toBe(320);
    expect(probe.height).toBe(240);
    expect(probe.durationSeconds).toBeGreaterThan(1.5);
  });

  it('refuses a file whose container does not match its declared type', async () => {
    const input = join(dir, 'liar.mp4');
    await writeFile(input, Buffer.from('this is not a video'));
    await expect(sanitizeVideo(input, join(dir, 'out.mp4'), 'video/mp4')).rejects.toThrow(MediaError);
  });

  it('refuses a file over the video ceiling', async () => {
    const input = join(dir, 'huge.mp4');
    await writeFile(input, Buffer.alloc(16));
    const original = LIMITS.videoBytes;
    try {
      Object.defineProperty(LIMITS, 'videoBytes', { value: 8, configurable: true });
      await expect(sanitizeVideo(input, join(dir, 'out.mp4'), 'video/mp4')).rejects.toThrow(/gigabyte|larger/i);
    } finally {
      Object.defineProperty(LIMITS, 'videoBytes', { value: original, configurable: true });
    }
  });
});
```

Add `sanitizeVideo` to the file's existing import from `./sanitize.js`. `LIMITS` is frozen
with `Object.freeze`, which is why the third test uses `Object.defineProperty` rather than
assignment; if that proves awkward, unfreeze `LIMITS` is **not** the answer — instead pass
the ceiling as an optional third argument defaulting to `LIMITS.videoBytes` and assert on
that. Either shape is acceptable; pick one and keep it.

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/media && npx vitest run src/sanitize.test.js`
Expected: FAIL — `sanitizeVideo is not exported`.

- [ ] **Step 4: Add ffmpeg to the image**

In `apps/media/Dockerfile`, line 2:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
```

- [ ] **Step 5: Implement sanitizeVideo**

In `apps/media/src/sanitize.js`, extend `LIMITS` and add the function. Keep the existing
`LIMITS` entries exactly as they are and append:

```js
// Video is bounded by remux time and storage cost, not by memory: a stream copy never decodes a
// frame. The image `processMs` is far too short for a gigabyte, so video carries its own.
videoBytes: 1024 * 1024 * 1024, videoProcessMs: 300_000,
```

Then, beside `runPdfTool`:

```js
async function runMediaTool(tool, args, timeoutMs, failure) {
  try {
    return await execFileAsync(tool, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024, env: { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C' }, windowsHide: true });
  } catch { throw new MediaError(failure); }
}

const videoCodecs = Object.freeze({ 'video/mp4': ['h264'], 'video/webm': ['vp8', 'vp9', 'av1'] });

/**
 * Strips every container tag from a web-playable video and writes a clean copy.
 *
 * This is a **remux, not a transcode**: `-c copy` moves the existing streams into a fresh
 * container, so it is bounded by disk rather than CPU and a gigabyte takes seconds. The product
 * accepts only formats a browser plays, which is what makes that possible.
 *
 * Metadata removal is the point. Images get it as a side effect of the canvas re-encode in the
 * browser and again from `sanitizeRaster`; video has no browser-side equivalent, and the client
 * snapshot is immutable, so whatever rides along cannot be withdrawn later.
 */
export async function sanitizeVideo(inputPath, outputPath, mimeType) {
  const codecs = videoCodecs[mimeType];
  if (!codecs) throw new MediaError('Upload an MP4 or WebM video.', 415);

  const { size } = await stat(inputPath);
  if (!size || size > LIMITS.videoBytes)
    throw new MediaError('Videos must be between 1 byte and 1 gigabyte.', 413);

  // Probe before touching the file: a container that does not hold what its type claims is
  // refused rather than remuxed into something that still will not play.
  const { stdout } = await runMediaTool('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height', '-show_entries', 'format=duration',
    '-of', 'json', inputPath,
  ], LIMITS.videoProcessMs, 'The video could not be read.');

  const probe = JSON.parse(stdout);
  const stream = probe.streams?.[0];
  if (!stream || !codecs.includes(stream.codec_name))
    throw new MediaError('The file is not a playable MP4 or WebM video.', 415);
  const width = Number(stream.width);
  const height = Number(stream.height);
  const durationSeconds = Number(probe.format?.duration);
  if (!width || !height || !Number.isFinite(durationSeconds))
    throw new MediaError('The video is missing the dimensions or duration a player needs.');

  const args = [
    '-v', 'error', '-nostdin', '-y', '-i', inputPath,
    '-map_metadata', '-1', '-map_chapters', '-1', '-c', 'copy',
  ];
  // faststart moves the index to the front so playback can begin before the whole file arrives.
  // It is an MP4 container feature; WebM is already streamable.
  if (mimeType === 'video/mp4') args.push('-movflags', '+faststart');
  args.push(outputPath);

  await runMediaTool('ffmpeg', args, LIMITS.videoProcessMs, 'The video could not be safely regenerated.');
  return { durationSeconds, width, height };
}
```

Add `stat` to the existing `node:fs/promises` import at the top of the file.

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/media && npx vitest run src/sanitize.test.js`
Expected: PASS. Requires `ffmpeg` on the host — install with `brew install ffmpeg` if the
probe helper cannot run locally.

- [ ] **Step 7: Rebuild the image and confirm ffmpeg is present**

```bash
docker compose build media
docker compose run --rm --entrypoint sh media -c "ffmpeg -version | head -1 && ffprobe -version | head -1"
```

Expected: both report a version.

- [ ] **Step 8: Commit**

```bash
git add apps/media/src/sanitize.js apps/media/src/sanitize.test.js apps/media/src/fixtures/tagged.mp4 apps/media/Dockerfile
git commit -m "feat(media): strip video metadata with a stream-copy remux"
```

---

### Task 5: The sanitise endpoint

**Files:**
- Modify: `apps/media/src/server.js`
- Modify: `apps/media/src/supabase.js`
- Test: `apps/media/src/server.test.js`

**Interfaces:**
- Consumes: `sanitizeVideo` from Task 4.
- Produces: `POST /designs/sanitize-video` taking `{ projectId, rawPath, mimeType }` and returning `{ path, durationSeconds, width, height }`. Adds `downloadToFile(path, projectId, token, destination)` and `uploadFile(bucket, path, filePath, mimeType)` to the backend.

- [ ] **Step 1: Write the failing test**

Append to `apps/media/src/server.test.js`, following the request-shaping helpers already in
that file:

```js
describe('POST /designs/sanitize-video', () => {
  it('refuses a raw path outside the named project', async () => {
    const response = await post('/designs/sanitize-video', {
      projectId: md5Uuid('dawes:project-1'),
      rawPath: `${md5Uuid('dawes:project-2')}/${md5Uuid('x')}.raw`,
      mimeType: 'video/mp4',
    });
    expect(response.status).toBe(400);
  });

  it('refuses a mime type outside the video allow-list', async () => {
    const response = await post('/designs/sanitize-video', {
      projectId: md5Uuid('dawes:project-1'),
      rawPath: `${md5Uuid('dawes:project-1')}/${md5Uuid('x')}.raw`,
      mimeType: 'video/quicktime',
    });
    expect(response.status).toBe(415);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/media && npx vitest run src/server.test.js`
Expected: FAIL — the route does not exist, so both return 404.

- [ ] **Step 3: Add the backend file helpers**

In `apps/media/src/supabase.js`, beside `downloadInternal` and `saveSanitized`:

```js
  // Video is handled as files on disk rather than buffers. `downloadInternal` returns bytes,
  // which is right for a 40-megapixel image and wrong for a gigabyte of video.
  async function downloadToFile(path, projectId, token, destination) {
    if (path.split('/')[0] !== projectId) throw new MediaError('Asset path must belong to the project.');
    const response = await request(`/storage/v1/object/internal-assets/${path}`, { token, binary: true });
    await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
  }

  async function uploadFile(bucket, path, filePath, mimeType) {
    const body = Readable.toWeb(createReadStream(filePath));
    await request(`/storage/v1/object/${bucket}/${path}`, { method: 'POST', data: body, mimeType, duplex: 'half' });
  }
```

Add to that file's imports: `import { createReadStream, createWriteStream } from 'node:fs';`,
`import { Readable } from 'node:stream';`, `import { pipeline } from 'node:stream/promises';`.
Export both new functions from `createBackend`'s returned object alongside the existing
ones.

- [ ] **Step 4: Add the route**

In `apps/media/src/server.js`, beside the `/publications/prepare` branch:

```js
      if (url.pathname === '/designs/sanitize-video') {
        const { projectId, rawPath, mimeType } = parseJson(await readBody(request, 16 * 1024));
        validId(projectId);
        if (!['video/mp4', 'video/webm'].includes(mimeType))
          throw new MediaError('Upload an MP4 or WebM video.', 415);
        if (rawPath.split('/')[0] !== projectId)
          throw new MediaError('Asset path must belong to the project.');

        // Production access is the same gate `add_design` applies, checked here so the service
        // never processes a file for someone who could not attach it to a design anyway.
        const projects = await backend.json(`/rest/v1/projects?id=eq.${projectId}&select=id`, { token });
        if (projects.length !== 1) throw new MediaError('Project not found.', 404);

        const extension = mimeType === 'video/mp4' ? 'mp4' : 'webm';
        const directory = await mkdtemp(join(tmpdir(), 'dawes-video-'));
        try {
          const input = join(directory, `in.${extension}`);
          const output = join(directory, `out.${extension}`);
          await backend.downloadToFile(rawPath, projectId, token, input);
          const probe = await sanitizeVideo(input, output, mimeType);
          const path = `${projectId}/${randomUUID()}.${extension}`;
          await backend.uploadFile('internal-assets', path, output, mimeType);
          // The raw object has served its purpose the moment the clean one exists.
          await backend.discard('internal-assets', rawPath);
          return send(200, { path, ...probe });
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      }
```

Add the imports this needs at the top of `server.js`: `mkdtemp` and `rm` from
`node:fs/promises`, `tmpdir` from `node:os`, `join` from `node:path`, `randomUUID` from
`node:crypto`, and `sanitizeVideo` from `./sanitize.js`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/media && npm test`
Expected: PASS — the two new assertions plus the 14 that already existed.

- [ ] **Step 6: Commit**

```bash
git add apps/media/src/server.js apps/media/src/supabase.js apps/media/src/server.test.js
git commit -m "feat(media): sanitise an uploaded video object in place"
```

---

### Task 6: Upload a video from the browser

**Files:**
- Modify: `apps/web/features/projects/artwork-files.ts`
- Modify: `apps/web/features/projects/media-client.ts`
- Test: `apps/web/features/projects/artwork-files.test.ts`

**Interfaces:**
- Consumes: `isVideoUpload`, `VIDEO_MAX_BYTES`, `videoUploadMimes` (Task 3); `POST /designs/sanitize-video` (Task 5).
- Produces: `uploadDesignAsset(database, mediaUrl, projectId, file, onProgress?)` → `Promise<string>` (the stored path), and `sanitizeVideoAsset(database, mediaUrl, input)` in `media-client.ts`.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/features/projects/artwork-files.test.ts`:

```ts
describe("uploadDesignAsset", () => {
  it("refuses a video over the ceiling before any network call", async () => {
    const database = { storage: { from: () => { throw new Error("must not upload"); } } };
    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    Object.defineProperty(file, "size", { value: VIDEO_MAX_BYTES + 1 });
    await expect(
      uploadDesignAsset(database as never, "http://media.test", projectId, file),
    ).rejects.toThrow(/no larger than/);
  });

  it("refuses a video format a browser cannot play", async () => {
    const database = { storage: { from: () => { throw new Error("must not upload"); } } };
    const file = new File([new Uint8Array(4)], "clip.mov", { type: "video/quicktime" });
    await expect(
      uploadDesignAsset(database as never, "http://media.test", projectId, file),
    ).rejects.toThrow(/MP4|WebM/);
  });

  it("sends an image down the canvas path, untouched by the video branch", async () => {
    // The existing image test in this file already covers the happy path; this one only asserts
    // that adding video did not divert it.
    const file = new File([new Uint8Array(4)], "art.png", { type: "image/png" });
    expect(isVideoUpload(file.type)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run features/projects/artwork-files.test.ts`
Expected: FAIL — `uploadDesignAsset is not exported`.

- [ ] **Step 3: Add the media-service call**

In `apps/web/features/projects/media-client.ts`, beside `preparePublicationAssets`:

```ts
export const sanitizedVideoSchema = z.object({
  path: z.string().min(1),
  durationSeconds: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export async function sanitizeVideoAsset(
  database: SupabaseClient<Database>,
  mediaUrl: string,
  input: { projectId: string; rawPath: string; mimeType: string },
) {
  return requestMedia(
    database,
    mediaUrl,
    "/designs/sanitize-video",
    JSON.stringify(input),
    "application/json",
    sanitizedVideoSchema,
  );
}
```

- [ ] **Step 4: Add the upload branch**

In `apps/web/features/projects/artwork-files.ts`, keep `uploadArtwork` exactly as it is and
add:

```ts
/**
 * Uploads a design asset, choosing the path its type requires.
 *
 * An image is prepared in the browser: `sanitizeArtwork` re-encodes it through a canvas, which
 * discards its metadata as a side effect and is why every stored image is already clean.
 *
 * A video cannot take that path — a canvas does not decode video — so it goes to storage as-is
 * under a `.raw` name and `apps/media` remuxes it into a clean object. Two objects exist only for
 * the length of one sanitisation; the service deletes the raw one.
 *
 * The upload is resumable because a gigabyte over a single POST has no way to recover from a
 * dropped connection, and losing a ten-minute transfer to one network blip is not acceptable.
 */
export async function uploadDesignAsset(
  database: SupabaseDatabase,
  mediaUrl: string,
  projectId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  if (!isVideoUpload(file.type)) return uploadArtwork(database, projectId, file);

  if (!(videoUploadMimes as readonly string[]).includes(file.type))
    throw new Error(uploadTypeMessage(videoUploadMimes));
  if (file.size > VIDEO_MAX_BYTES) throw new Error(uploadSizeMessage(VIDEO_MAX_BYTES));

  const rawPath = `${projectId}/${crypto.randomUUID()}.raw`;
  await uploadResumable(database, "internal-assets", rawPath, file, onProgress);
  const sanitized = await sanitizeVideoAsset(database, mediaUrl, {
    projectId,
    rawPath,
    mimeType: file.type,
  });
  return sanitized.path;
}
```

Add `uploadResumable` to the same module. Supabase's resumable endpoint speaks TUS, which
needs a client: `npm install tus-js-client --workspace apps/web`. The installed
`@supabase/storage-js` (2.116.0) exposes `createSignedUploadUrl` and `uploadToSignedUrl`,
but both are single POSTs with no resume and no progress, which is what this exists to
avoid.

```ts
import * as tus from "tus-js-client";

/**
 * Uploads through Supabase's TUS endpoint, which resumes after a dropped connection.
 *
 * A gigabyte over a single POST has no recovery: one network blip discards a ten-minute
 * transfer with nothing to show for it. Chunks are 6 MB because the storage service requires
 * exactly that size for every chunk but the last, and it must not be made configurable.
 */
async function uploadResumable(
  database: SupabaseDatabase,
  bucket: string,
  path: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const { data } = await database.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your sign-in is no longer valid. Sign out, sign in again, and retry.");

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
      headers: { authorization: `Bearer ${token}`, "x-upsert": "false" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: { bucketName: bucket, objectName: path, contentType: file.type },
      onError: reject,
      onProgress: (sent, total) => onProgress?.(total ? sent / total : 0),
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}
```

There is deliberately no fallback to a single POST. A silent fallback would reintroduce
exactly the fragility this replaces, and would do it invisibly.

Add to the module's imports from `@/features/shared/upload-rules`: `isVideoUpload`,
`videoUploadMimes`, `VIDEO_MAX_BYTES`, `uploadTypeMessage`, `uploadSizeMessage`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run features/projects/artwork-files.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/projects/artwork-files.ts apps/web/features/projects/media-client.ts apps/web/features/projects/artwork-files.test.ts
git commit -m "feat(projects): upload a design video and have it sanitised"
```

---

### Task 7: Offer video in the design dialog

**Files:**
- Modify: `apps/web/features/projects/project-action-dialog.tsx:125-131,207-215`
- Test: `apps/web/features/projects/project-action-dialog.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `uploadDesignAsset` (Task 6), `designUploadMimes` (Task 3).
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

```tsx
it("offers video alongside image on the design form", () => {
  render(<ProjectActionDialog action={{ kind: "design", version }} projectId={projectId} onClose={() => {}} />);
  const input = screen.getByLabelText(/artwork file/i);
  expect(input).toHaveAttribute("accept", expect.stringContaining("video/mp4"));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run features/projects/project-action-dialog.test.tsx`
Expected: FAIL — `accept` is `"image/png,image/jpeg,image/webp"`.

- [ ] **Step 3: Change the call site and the field**

Replace the `uploadArtwork` call in `mutationFn` with:

```ts
            ? await uploadDesignAsset(database, mediaUrl, projectId, file, setUploadProgress)
```

Add `const [uploadProgress, setUploadProgress] = useState<number | null>(null);` beside the
dialog's other state, and reset it to `null` in `onSuccess` and in `close()`.

Replace the file field's `accept` and help text:

```tsx
                  accept={designUploadMimes.join(",")}
                />
                <small>
                  {uploadTypesLabel(designUploadMimes)}. Images up to{" "}
                  {uploadLimitMb(ARTWORK_MAX_BYTES)} MB, video up to {uploadLimitMb(VIDEO_MAX_BYTES)} MB.
                </small>
```

Render progress while a video uploads, because a gigabyte with no feedback reads as a
hang:

```tsx
              {uploadProgress !== null && (
                <progress value={uploadProgress} max={1} aria-label="Upload progress" />
              )}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run features/projects/project-action-dialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the whole check and commit**

```bash
cd apps/web && npm run check && cd ..
git add apps/web/features/projects/project-action-dialog.tsx apps/web/features/projects/project-action-dialog.test.tsx
git commit -m "feat(projects): offer video in the add-design dialog"
```

---

### Task 8: Carry pin time through the client write path

**Files:**
- Modify: `apps/web/features/projects/comment-draft.ts:7`
- Modify: `apps/web/features/projects/project-data.ts:338-360`
- Test: `apps/web/features/projects/project-data.test.ts`

**Interfaces:**
- Consumes: `post_comment`'s `p_pin_t` (Task 1).
- Produces: `PendingPin = { x: number; y: number; t?: number }`; `postComment`'s `pin` input accepts an optional `t`.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/features/projects/project-data.test.ts`, matching the RPC-assertion
style already used there:

```ts
it("passes pin time to post_comment when the pin carries one", async () => {
  const { database, calls } = recordingDatabase();
  await postComment(database, {
    projectId,
    channel: "internal",
    body: "Logo lands too late",
    designId,
    pin: { x: 0.4, y: 0.6, t: 12.5 },
  });
  expect(calls[0].args).toMatchObject({ p_pin_x: 0.4, p_pin_y: 0.6, p_pin_t: 12.5 });
});

it("sends a null pin time for a still image", async () => {
  const { database, calls } = recordingDatabase();
  await postComment(database, {
    projectId,
    channel: "internal",
    body: "Crop tighter",
    designId,
    pin: { x: 0.4, y: 0.6 },
  });
  expect(calls[0].args.p_pin_t).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run features/projects/project-data.test.ts`
Expected: FAIL — `p_pin_t` is absent from the recorded arguments.

- [ ] **Step 3: Widen the types and pass the value**

In `comment-draft.ts`:

```ts
/** A pin is a point on the artwork, and on video also a moment in it, in seconds. */
export type PendingPin = { x: number; y: number; t?: number };
```

In `project-data.ts`, widen `postComment`'s input to
`pin?: { x: number; y: number; t?: number } | null` and add to the RPC arguments:

```ts
      p_pin_t: input.pin?.t ?? null,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run features/projects/project-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/projects/comment-draft.ts apps/web/features/projects/project-data.ts apps/web/features/projects/project-data.test.ts
git commit -m "feat(comments): carry pin time from the draft to the write"
```

---

### Task 9: Play the video and pin it

**Files:**
- Modify: `apps/web/features/projects/design-viewer.tsx:20-85`
- Modify: `apps/web/features/projects/artwork.tsx`
- Modify: `apps/web/features/projects/projects.css`
- Create: `apps/web/features/projects/video-pins.ts`
- Test: `apps/web/features/projects/video-pins.test.ts`

**Interfaces:**
- Consumes: `PendingPin` with `t` (Task 8).
- Produces, all in `video-pins.ts`: `isVideoAsset(path: string | null): boolean`,
  `visiblePins<T extends { pinT: number | null }>(pins: T[], currentTime: number, window?: number): T[]`,
  and `formatTimecode(seconds: number): string`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/features/projects/video-pins.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isVideoAsset, visiblePins } from "./video-pins";

describe("isVideoAsset", () => {
  it("recognises the two stored video extensions", () => {
    expect(isVideoAsset("p/a.mp4")).toBe(true);
    expect(isVideoAsset("p/a.webm")).toBe(true);
  });
  it("treats images and a missing path as not video", () => {
    expect(isVideoAsset("p/a.png")).toBe(false);
    expect(isVideoAsset(null)).toBe(false);
  });
});

describe("visiblePins", () => {
  const pins = [{ pinT: 2 }, { pinT: 10 }, { pinT: null }];

  it("shows only pins near the playhead", () => {
    expect(visiblePins(pins, 2.4)).toEqual([{ pinT: 2 }]);
  });

  it("shows a pin with no time at every moment, because a still has none", () => {
    expect(visiblePins(pins, 100)).toEqual([{ pinT: null }]);
  });

  it("uses a symmetric window around the playhead", () => {
    expect(visiblePins([{ pinT: 5 }], 6.4, 1.5)).toEqual([{ pinT: 5 }]);
    expect(visiblePins([{ pinT: 5 }], 6.6, 1.5)).toEqual([]);
  });
});

describe("formatTimecode", () => {
  it("reads as minutes and seconds", () => {
    expect(formatTimecode(0)).toBe("0:00");
    expect(formatTimecode(9.4)).toBe("0:09");
    expect(formatTimecode(65)).toBe("1:05");
    expect(formatTimecode(600)).toBe("10:00");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run features/projects/video-pins.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the module**

Create `apps/web/features/projects/video-pins.ts`:

```ts
/**
 * What distinguishes a video design from an image one, and which of its pins belong on screen.
 *
 * The kind is read from the stored path's extension rather than from a column. `apps/media`
 * names every sanitised object after the type it verified, so the extension is derived from a
 * probe of the real container, not from what a browser claimed at upload.
 */

const videoExtensions = ["mp4", "webm"];

export function isVideoAsset(path: string | null): boolean {
  if (!path) return false;
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return videoExtensions.includes(extension);
}

/** A pin's moment as a person reads it: `1:05`. Seconds are floored, never rounded up. */
export function formatTimecode(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * The pins to draw over the frame at `currentTime`.
 *
 * Without a window every comment in a ten-minute video would render at once and the overlay
 * would be unreadable. A pin with no time belongs to a still image and is always shown; the
 * window is a display concern and is deliberately not stored.
 */
export function visiblePins<T extends { pinT: number | null }>(
  pins: T[],
  currentTime: number,
  window = 0.5,
): T[] {
  return pins.filter((pin) => pin.pinT === null || Math.abs(pin.pinT - currentTime) <= window);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run features/projects/video-pins.test.ts`
Expected: PASS.

- [ ] **Step 5: Render the player**

In `artwork.tsx`, branch on the stored path and render a player instead of an image. The
signed URL is the same one the image path already resolves:

```tsx
  if (isVideoAsset(design.assetPath)) {
    return (
      <video
        ref={videoRef}
        className="artwork-video"
        src={url}
        controls
        preload="metadata"
        playsInline
        onTimeUpdate={(event) => onTimeUpdate?.(event.currentTarget.currentTime)}
      />
    );
  }
```

In `design-viewer.tsx`, hold the playhead and the element, and pause before pinning:

```tsx
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const isVideo = isVideoAsset(design.assetPath);

  function placePin(x: number, y: number) {
    if (!isVideo) return setPendingPin({ x, y });
    // Pausing first is not a nicety. On a playing video the frame under the click is gone by
    // the time the pin is stored, so the coordinate would describe a frame nobody chose.
    videoRef.current?.pause();
    setPendingPin({ x, y, t: videoRef.current?.currentTime ?? 0 });
  }
```

Filter the drawn pins through the new helper, so a ten-minute video does not render every
comment at once:

```tsx
  const shown = isVideo ? visiblePins(comments, currentTime) : comments;
```

Render one marker per timed comment on a track beneath the player. Clicking a marker seeks
and selects:

```tsx
  {isVideo && duration > 0 && (
    <div className="video-pin-track" role="list" aria-label="Comments in time">
      {comments
        .filter((comment) => comment.pinT !== null)
        .map((comment, index) => (
          <button
            key={comment.id}
            role="listitem"
            className="video-pin-marker"
            style={{ left: `${(comment.pinT! / duration) * 100}%` }}
            aria-label={`Comment at ${formatTimecode(comment.pinT!)}: ${comment.body.slice(0, 60)}`}
            onClick={() => {
              if (videoRef.current) videoRef.current.currentTime = comment.pinT!;
              setSelectedComment(comment.id);
            }}
          />
        ))}
    </div>
  )}
```

`formatTimecode(seconds)` renders `m:ss` for the accessible name — a marker whose only
label is a pixel position is unusable without sight. Put it in `video-pins.ts` beside the
other two helpers and give it its own test case.

- [ ] **Step 6: Style the markers**

Add the marker and track rules to `apps/web/features/projects/projects.css` — **not**
`globals.css`. `features/shared/stylesheet-boundary.test.ts` fails if a selector appears in
two feature stylesheets, so use a `video-`prefixed namespace owned by this feature. Use the
`--text-*` and spacing tokens from `:root` rather than hard-coded values.

- [ ] **Step 7: Run the whole check and commit**

```bash
cd apps/web && npm run check && cd ..
git add apps/web/features/projects/
git commit -m "feat(projects): play video designs and pin comments in time"
```

---

### Task 10: Publish a video to the client

**Files:**
- Modify: `apps/media/src/server.js` (the `/publications/prepare` branch)
- Modify: `apps/media/src/supabase.js`
- Test: `apps/media/src/server.test.js`

**Interfaces:**
- Consumes: `downloadToFile` and `uploadFile` (Task 5); `isVideoAsset`'s rule, restated
  server-side.
- Produces: no new route. `/publications/prepare` handles a video design by copying rather
  than re-processing.

**Why this task exists.** `/publications/prepare` currently calls `sanitizeRaster(input)`
on **every** design in the version, unconditionally. `sanitizeRaster` is `sharp`, which
cannot decode an MP4 — so without this task, publishing any version containing a video
fails outright and the client never receives it. This is the task that makes the spec's
"publication copies the already-clean object" true rather than aspirational.

- [ ] **Step 1: Write the failing test**

Append to `apps/media/src/server.test.js`:

```js
it('copies a video design to the client bucket instead of re-processing it', async () => {
  // A version holding one video design. The stub backend records what the route asked for.
  const calls = stubVersionWithDesigns([
    { id: designId, internal_asset_path: `${projectId}/${assetUuid}.mp4` },
  ]);
  const response = await post('/publications/prepare', { versionId });

  expect(response.status).toBe(200);
  expect(calls.sanitizeRaster).not.toHaveBeenCalled();
  expect(calls.uploadFile).toHaveBeenCalledWith(
    'published-assets', expect.stringMatching(/\.mp4$/), expect.any(String), 'video/mp4',
  );
});
```

Shape `stubVersionWithDesigns` to match the stubbing helpers already in this file rather
than inventing a second style — read the existing `/publications/prepare` tests first and
follow them.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/media && npx vitest run src/server.test.js`
Expected: FAIL — the route calls `sanitizeRaster` on the `.mp4` and rejects it as an
invalid image.

- [ ] **Step 3: Branch the publication loop**

In `apps/media/src/server.js`, inside the `for (const design of designs)` loop, replace the
single `sanitizeRaster` call with a branch on the stored extension:

```js
            if (!design.internal_asset_path) continue;
            const extension = design.internal_asset_path.split('.').pop().toLowerCase();
            if (['mp4', 'webm'].includes(extension)) {
              // Video was stripped of its metadata on the way in, by `/designs/sanitize-video`.
              // There is nothing left to remove, and re-running a remux here would put every
              // video in the version through one synchronous request — up to twenty gigabytes
              // on a single publish click.
              const mimeType = extension === 'mp4' ? 'video/mp4' : 'video/webm';
              const directory = await mkdtemp(join(tmpdir(), 'dawes-publish-'));
              try {
                const local = join(directory, `asset.${extension}`);
                await backend.downloadToFile(design.internal_asset_path, projectId, token, local);
                const target = `${projectId}/${randomUUID()}.${extension}`;
                await backend.uploadFile('published-assets', target, local, mimeType);
                assets[design.id] = await backend.registerCopied(
                  projectId, 'published-assets', target, local, mimeType, userId,
                  { designId: design.id, path: design.internal_asset_path },
                );
              } finally {
                await rm(directory, { recursive: true, force: true });
              }
              continue;
            }
            const input = await backend.downloadInternal(design.internal_asset_path, projectId, token);
            assets[design.id] = await backend.saveSanitized(projectId, 'published-assets', await sanitizeRaster(input), userId, { designId: design.id, path: design.internal_asset_path });
```

- [ ] **Step 4: Add the registration helper**

`saveSanitized` both uploads bytes and registers the object. Video is already uploaded by
`uploadFile`, so it needs the registration half on its own. In
`apps/media/src/supabase.js`, add `registerCopied` next to `saveSanitized`.

**Read `saveSanitized`'s body first and mirror its registration call exactly** — the same
`register_sanitized_asset` RPC, the same argument names and order, the same checksum
derivation. It takes a project, a bucket, a path, a checksum, a mime type, a byte size, a
user, a design id and a source path; the pgTAP suite asserts that a client publication can
only reference a registered asset, so an object that skips or mis-shapes this registration
is invisible to the client even though the bytes are in the bucket.

The only difference from `saveSanitized` is where the checksum and size come from: stream
the file from disk through `node:crypto`'s `createHash('sha256')` rather than hashing a
buffer, because the file may be a gigabyte.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/media && npm test`
Expected: PASS — the new assertion and every pre-existing one.

- [ ] **Step 6: Verify the whole publication path against the database**

Run: `npm run db:test` from the repo root.
Expected: PASS — in particular `trusted_media_and_catalog`, which proves that an agency
cannot bypass the sanitising worker and that only a registered asset enters a client
publication. If `registerCopied` is wrong, that file is where it shows.

- [ ] **Step 7: Commit**

```bash
git add apps/media/src/server.js apps/media/src/supabase.js apps/media/src/server.test.js
git commit -m "feat(media): publish a video by copying the already-clean object"
```

---

### Task 11: Prove it end to end

**Files:**
- Create: `apps/web/tests/e2e/video-designs.spec.ts`
- Create: `apps/web/tests/fixtures/campaign-clip.mp4`
- Modify: `docs/architecture/design-system.md`, `docs/architecture/domain.md`, `apps/web/features/projects/README.md`, `docs/architecture/acceptance-matrix.md`

**Interfaces:**
- Consumes: everything above.
- Produces: browser evidence and updated documentation.

- [ ] **Step 1: Generate a small fixture**

```bash
cd apps/web/tests/fixtures
ffmpeg -f lavfi -i testsrc=duration=4:size=640x360:rate=24 -c:v libx264 -pix_fmt yuv420p campaign-clip.mp4
```

Keep it small. The gigabyte ceiling is a product limit, not a fixture size — a large
fixture would slow every run for no additional proof.

- [ ] **Step 2: Write the journey**

Create `apps/web/tests/e2e/video-designs.spec.ts` covering, in one signed-in journey per
role: a designer adds a video design to a version and pins a comment at a timestamp; the
agency publishes the version; the client opens it, sees the video, sees **no** internal
comment, and adds their own pin.

Assert the client's isolation by inspecting the REST payload, not the rendered page — a
UI check proves only what was drawn.

- [ ] **Step 3: Run it**

Run: `cd apps/web && npx playwright test tests/e2e/video-designs.spec.ts --reporter=line`
Expected: PASS.

- [ ] **Step 4: Run every suite against a rebuilt container**

```bash
docker compose build web media && docker compose up -d web media
cd apps/web && npm run check && npx playwright test --reporter=line
cd ../media && npm test
cd ../.. && npm run db:test
```

Expected: all green. **Rebuild before measuring** — this project has twice recorded
evidence gathered against a container image older than the source.

- [ ] **Step 5: Update the documentation**

- `docs/architecture/domain.md` — a design may be a video; `pin_t`.
- `apps/web/features/projects/README.md` — the two upload paths and why they differ.
- `docs/architecture/design-system.md` — the player and marker track.
- `docs/architecture/acceptance-matrix.md` — the new rows and their evidence.

Documentation maintenance is part of the change, not a follow-up. If anything here
contradicts what was built, correct it rather than leaving both.

- [ ] **Step 6: Commit**

```bash
git add apps/web/tests docs
git commit -m "test(projects): prove the video design journey across all three roles"
```

---

## Notes for the executor

**Coordination.** Another Claude session has been working in this repository all day. Before
writing in `apps/web/features/**` or `supabase/**`, check `ListAgents` and message
`dawesstudios-7c` if it is active. It names explicit paths when staging and never uses
`git add -A`; do the same.

**Line numbers go stale.** Every file reference here was accurate when written. Two line
ranges handed between sessions today were already wrong by the time they were read. Locate
code by its text, not by its line.

**The container is not the dev server.** `localhost:3003` is served by
`dawes-studios-app-web-1` from a baked image, not by `next dev`. A code change is invisible
there until the image is rebuilt.

# Video designs and time-coded feedback

Status: design, awaiting review. Author: Claude Code, 2026-09-21.

## What this adds

A design can be a video as well as an image, and a reviewer can attach a comment to a
point on a frame at a moment in the video. Clients see published videos and comment on
them exactly as they do on images today.

## Decisions taken before this design

These were settled with the product owner and are inputs, not open questions.

| Decision | Choice | Consequence |
| --- | --- | --- |
| Where video lives | A row in `designs`, with `internal_asset_path` pointing at a video | Inherits versions, publication, role isolation and `design_id`-keyed pins |
| Source | Uploaded file, not an external link | Bucket, MIME and storage-path rules all change |
| Pin shape | Time **and** position | `pin_x`/`pin_y` are kept; `pin_t` is added |
| Accepted formats | Web-playable only (MP4/H.264, WebM) | No transcoding — metadata stripping is a stream-copy remux |
| Duration limit | None | The byte ceiling bounds duration indirectly |
| Size ceiling | 1 GB | Covers 10 minutes of 1080p H.264 at up to ~13 Mbps |
| Client access | Clients see and comment on video | Source metadata must be stripped before publication |

## The constraint that shapes everything

`CLAUDE.md` requires that clients never receive **source metadata**. The client snapshot
is immutable, so anything that reaches it cannot be withdrawn.

Images satisfy this today by accident of implementation. `sanitizeArtwork` decodes to a
bitmap and re-encodes through a canvas, which necessarily discards EXIF — location,
device, timestamps, embedded thumbnails. `sanitizeRaster` in `apps/media` then does it
again server-side, deliberately this time.

A canvas cannot decode video, so video has no browser-side equivalent. Stripping has to
happen server-side, and that decides where in the lifecycle it happens.

### Strip at upload, not at publication

`/publications/prepare` currently loops over **up to 20 designs in one synchronous
request**, buffering each asset in memory. With video that becomes up to 20 GB through a
single HTTP request. It does not work, and no timeout makes it work.

So video is sanitized when it is uploaded, and publication copies the already-clean
object. This mirrors the image path rather than departing from it: images are stripped at
upload too, client-side, and the publication pass is a second defence. Video moves that
first pass from the browser to the media service because only the server can do it.

The cost lands where a person already expects to wait — during a 1 GB upload — instead of
being deferred to a single publish click that would have to carry every video at once.

## Architecture

```
 browser                     apps/media                    Postgres / Storage
 ───────                     ──────────                    ──────────────────
 pick file
 validate type + size  ──►
 resumable upload      ──────────────────────────────────► internal-assets/<project>/<uuid>.raw
 request sanitise      ──►  download raw
                            ffmpeg -map_metadata -1 -c copy
                            probe container                 
                            upload clean          ─────────► internal-assets/<project>/<uuid>.mp4
                            delete raw            ─────────► (raw object removed)
                       ◄──  { path, durationSeconds, width, height }
 addDesign(path)       ──────────────────────────────────► designs row
```

Publication then downloads the clean internal object and copies it to `published-assets`
without re-processing, because it was stripped on the way in.

### Why a two-object upload

A 1 GB file cannot be posted to the media service as a request body — `readBody` buffers,
and the service would hold the whole file in memory. Instead the browser uploads directly
to storage with a resumable upload, and the media service works object-to-object with
temp files on disk. The raw object is deleted once the clean one is written.

The raw object is written with a `.raw` extension, which `private.opaque_storage_path()`
must accept but which no signed-URL read path will serve. It exists for at most the
duration of one sanitisation.

## Data model

### Migration: `202609210001_video_designs.sql`

**Pin time.** One column on each comment table, and the existing constraint relaxed to
admit it:

```sql
alter table public.internal_comments add column pin_t numeric;
alter table public.client_comments  add column pin_t numeric;
```

The current check is:

```sql
check((pin_x is null and pin_y is null)
      or (design_id is not null and pin_x between 0 and 1 and pin_y between 0 and 1))
```

It becomes: a pin still requires `design_id` and normalised `pin_x`/`pin_y`; `pin_t` is
optional, non-negative, and may only be present when `pin_x`/`pin_y` are. A comment with
`pin_t` and no coordinates is rejected — we chose time *and* position, and a half-pin has
no rendering.

**`post_comment` gains `p_pin_t numeric default null`**, appended last so existing callers
are unaffected. The function passes it through unchanged.

**Buckets.** `internal-assets` and `published-assets` go to 1 GB and gain `video/mp4` and
`video/webm`. `brand-assets` and `delivery-files` are untouched — video is a design, not a
brand asset or a delivery file.

**`private.opaque_storage_path()`** accepts `mp4`, `webm` and `raw` alongside the current
extensions.

**`supabase/config.toml`** raises the global `file_size_limit` from `50MiB` to `1GiB`. A
bucket limit cannot exceed the global one, so the migration alone is insufficient. This
requires a stack restart.

### What is deliberately not added

No `kind` or `media_type` column on `designs`. The extension of `internal_asset_path`
already distinguishes video from image, every read path already loads that column, and a
second source of truth would be one more thing to keep consistent. If a future
requirement needs to filter by kind in SQL, that is the moment to add it.

## Media service

`sanitizeVideo(inputPath, outputPath)` in `apps/media/src/sanitize.js`, following the
established contract: `MediaError` for refusals, a timeout, a scrubbed environment.

- `ffmpeg` is added to the image via `apt-get`, exactly as `poppler-utils` is today.
- The remux is `-map_metadata -1 -map_chapters -1 -c copy`, plus `-movflags +faststart`
  for MP4 so the player can start before the whole file arrives.
- `ffprobe` validates that the container really holds the codec the MIME type claimed
  before any of this — a file named `.mp4` carrying something else is refused.
- `LIMITS` gains `videoBytes: 1024 * 1024 * 1024` and `videoProcessMs`. The 30-second
  image timeout is too short for a gigabyte remux; the video timeout is separate and its
  reason is recorded beside it.
- Work happens through `mkdtemp` temp files. Nothing streams through a Buffer.

`upload-rules.ts` gains `VIDEO_MAX_BYTES` with its stated reason — **remux time and
storage cost**, not decode memory, because no decode happens. The module's existing
instruction not to collapse per-path ceilings covers it.

## Client

**Upload.** `uploadArtwork` branches on file type. Images keep the canvas path unchanged.
Video takes a resumable upload, then calls the media service, then registers the returned
clean path. Progress is shown; a 1 GB upload without a progress indicator reads as a hang.

**Player.** A `<video>` element inside the design viewer, with the existing pin overlay
reused for `pin_x`/`pin_y` and a marker per comment on the scrubber. Clicking a marker
seeks. Placing a pin pauses, captures `currentTime` as `pin_t` and the click coordinates
as `pin_x`/`pin_y`.

Pins are shown only within a tolerance window around the current time, otherwise every
comment in the video renders at once. The window is a display concern, not stored.

**Status tones.** If sanitisation introduces a visible state, it maps to a tone in
`features/shared/status-tone.ts`; an unmapped enum value fails `npm run check`.

## Authorization

Nothing new conceptually — `pin_t` rides the channel separation that already exists. But
the tests must account for a trap found during the security pass:

> `authenticated` holds column-level `UPDATE` grants on ten tables, so a forbidden
> cross-tenant `UPDATE` answers `204` with zero rows changed rather than `42501`. A
> status-code-only negative test records a false "allowed".

**Every negative authorization test in this work re-reads the stored value after the
attempt.** The response code is not evidence.

Specifically to verify: a client cannot read `internal_comments` on a video; a designer
cannot read `client_comments`; a client cannot reach an unpublished video's internal
object; a signed URL for a published video does not expose the internal path.

## Testing

| Layer | What it proves |
| --- | --- |
| pgTAP | The relaxed pin constraint accepts time+position and rejects a `pin_t`-only pin; `post_comment` stores `pin_t`; channel isolation holds for video comments, verified by re-reading |
| `apps/media` unit | `sanitizeVideo` strips metadata — assert against a fixture with known EXIF/GPS; a mislabelled container is refused; the timeout fires |
| Web unit | Upload branching by type; pin time-window filtering; `VIDEO_MAX_BYTES` asserted against the migration's bucket limit, as `upload-rules.test.ts` already does by parsing the SQL |
| Browser | Designer uploads a video, pins a comment at a timestamp, publishes; client sees the video, sees no internal comment, adds their own pin |

The fixture for the metadata test must carry real metadata, and the assertion is that the
output has none — not that the input differed from the output.

## Risks

**A 1 GB upload over a poor connection.** Resumable uploads mitigate but do not remove
this. If it proves painful in practice, the next lever is client-side compression before
upload, which is a separate piece of work and is not in this design.

**`ffmpeg` in the image.** It is a large dependency with a wide CVE surface. It runs
through the existing hardened `execFileAsync` wrapper — timeout, bounded buffer, scrubbed
environment — and only ever on an object already in our own storage.

**Storage growth.** Twenty-five seeded projects with video at up to 1 GB each is a
different storage profile from today's. The deterministic acceptance baseline should keep
its video fixtures small; the ceiling is a product limit, not a fixture size.

## Out of scope

Transcoding, thumbnail/poster generation, captions, client-side compression, and any
`kind` column on `designs`. Each is a separate decision if it becomes a requirement.

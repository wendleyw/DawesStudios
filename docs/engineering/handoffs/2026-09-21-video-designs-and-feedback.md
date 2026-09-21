# Video designs and time-coded feedback (orchestrated plan, 11 tasks)

- Updated at: 2026-09-21T20:15:00-04:00
- Reporting agent and tool: orchestrator / Claude Code, session `dawesstudios-70`
- State: implemented, reviewed and merged. Verified by unit, pgTAP and browser suites against containers rebuilt from the merged source. One disclosed, unreproduced intermittent remains open as Observation F-5.
- Objective: a design may be a video as well as an image, and a reviewer may pin a comment to a point on a frame at a moment in time. Clients see published videos and comment on them as they do on images.
- Owned paths: `supabase/migrations/2026092100{01,02,04,06,07}`, `supabase/tests/database/video_*`, `apps/media/src/`, `apps/media/Dockerfile`, `compose.yaml`, `apps/web/features/projects/`, `apps/web/features/shared/upload-rules*`, `apps/web/tests/e2e/video-designs.spec.ts`
- Dependencies: `docs/superpowers/specs/2026-09-21-video-designs-and-feedback-design.md`; `docs/superpowers/plans/2026-09-21-video-designs-and-feedback.md`
- Merged as `9749862` into `main`; branch `feature/video-designs-and-feedback` at `ff6e7d3`, 37 commits

## Verification actually executed

Against images `dawes-studios-web:local` `7785031eef22` and `dawes-studios-media:local`
`8c968c456e9d`, rebuilt from the merged source:

| Suite | Result |
| --- | --- |
| `apps/web` `npm run check` | 484 tests, 36 files |
| `apps/media` `npm test` | 34 tests, 2 files |
| `npm run db:test` | 196 assertions, 11 files |
| `npm run test:e2e` | 26 passed |

Every result was measured against an image newer than the code it tests. This is stated
because the project has twice recorded evidence gathered against a stale image.

## The property the feature rests on

Clients must never receive source metadata, and the published snapshot is immutable, so
nothing that reaches it can be withdrawn. Images satisfy this by side effect: the browser
re-encodes them through a canvas, which discards EXIF, and `sanitizeRaster` does it again at
publication. A canvas cannot decode video, so video is stripped server-side at upload by an
ffmpeg stream-copy remux, and publication copies the already-clean object.

**Publication requires an attestation rather than assuming one.** `/designs/sanitize-video`
registers the clean internal object in `private.sanitized_assets`, and
`register_sanitized_asset` refuses to copy a video into `published-assets` without that row.
The check is provenance, not inspection: the only way to pass it is to have run the pipeline.

## Open items, in priority order

### Would not ship a second video feature without these

1. **The client-side idempotency key does not survive a remount.** `comment-panel.tsx` holds
   the key in a ref keyed on the payload, so a retry of the same content reuses it and the
   replay converges. But the ref dies with the component. Someone whose write fails, who then
   closes the dialog or navigates away and returns to retype the same comment, gets a **new**
   key — and if the original write had in fact committed, they now have two comments. That is
   the exact failure `202609210002` exists to prevent, surviving in the one path the client
   guard does not cover. The server is sound; the client's memory is the gap. Deriving the key
   from the payload content rather than minting a UUID per attempt would close it.
   **This is the weak case in the replay hardening, and it is the one that matters for I05.**
2. **No upload cancellation.** `tus.Upload.abort(true)` exists and terminates server-side. The
   work spans three files: a cancel handle out of `uploadResumable`, propagation through
   `uploadDesignAsset`, and a branch in the dialog's `close()`. Today a person is held in the
   dialog for the duration of the upload, with only a `beforeunload` warning if they close the
   tab. Re-scope against the real ceiling before building it.
3. **Two uploads take the media service down for up to fifteen minutes.** `server.js` refuses
   at `active >= 2`. Before video, every operation was bounded near thirty seconds; a video
   slot can now be held far longer, and the caller who gets the 429 has already spent the
   whole upload before being told.

### Real, bounded, not urgent

4. **The video orphan cannot be cleaned by the path that cleans image orphans.**
   `discardUnreferencedArtwork` calls `storage.remove`, and `internal_storage_delete` requires
   `owner_id = auth.uid()`. The clean object was written with the service key, so the designer
   does not own it. Closing the dialog after a staged-but-unattached video either leaves the
   orphan or blocks the close with an error. Neither branch is tested.
5. **A sanitise failure leaves the raw object with nothing to sweep it.** Deliberate — losing
   the transfer is worse than leaving an orphan — but no sweep exists, and `console.error` is
   not operator-visible because this repository has no logging sink. If a server-side sweep is
   ever built, it should special-case the service's 415: that refusal is deterministic and the
   object is safely deletable, which the client cannot know because the status code is
   flattened into a string before it reaches the caller.
6. **`.video-pin-marker` is 8×8 px.** These are click-to-seek controls that cluster on a
   timeline, below WCAG 2.2 SC 2.5.8's 24 px target size, and the spacing exception is
   unlikely to hold.
7. **Observation F-5**, recorded in `docs/verification/acceptance-family-f.md`: one
   `video-designs.spec.ts` run failed after the retry helper was already in place, its
   diagnostics were lost, and it did not recur in 60 subsequent runs across separate
   processes with artifacts preserved. F18 is labelled *Verified with a tracked open flake*
   rather than Verified.

### Accepted trades, recorded so they are not mistaken for oversights

8. **Video signed URLs live an hour**, against 300 seconds for images, so a ten-minute video
   is not interrupted by a refetch reminting the URL and restarting playback. This widens a
   bearer credential twelvefold to solve a UI problem; the narrower fix — not refetching while
   the element holds a live source — was available. Thumbnails share the hook, so a list view
   mints hour-long URLs per video tile.
9. **`LIMITS.videoProcessMs` bounds four things**: the download, the remux, the upload, and —
   restated as an arithmetic in `media-client.ts` — the client's deadline. `videoProbeMs` was
   split out for exactly this reason; the rest was left.
10. **The scratch volume's capacity cannot be asserted in a unit test.**
    `media-scratch.test.ts` binds `compose.yaml`'s shape to `VIDEO_MAX_BYTES`, but the actual
    free space is a manual `df -h` release step. `supabase/config.toml`'s storage limit and
    `sanitize.js`'s `videoBytes` remain comment-only, bound to nothing.

## Questions for whoever owns `supabase/scripts/` and `compose.yaml`

- **`media-scratch` ownership is conditionally correct.** The Dockerfile pre-creates
  `/scratch` owned by `node`, and Docker populates an **empty** named volume from the image
  path, so the fix self-heals today. It does **not** self-heal for a volume that pre-exists
  and is non-empty — that case gives `EACCES` even with the fixed image. Unreachable from the
  current state, because no pre-fix image had a `/scratch`. Worth a deployment note.
- **A merge moves the manifest but not the installed tree.** The first `npm run check` after
  this merge failed on `tus-js-client` — the dependency was in `package.json` and the lockfile
  and absent from `node_modules`. It failed loudly, which is the good case; the bad case is a
  check passing against a stale dependency.
- **Defect I-1 is conditional, not permanent.** `npm run db:start` exits non-zero only after
  `db:artwork:photos` has run and before the next full reset — a reset wipes the photographs
  and the fixture bytes become deterministic again. A green `db:start` does not prove the
  defect is fixed; it may only mean nobody has re-run the artwork script.

## The defect class this work kept finding

Seven distinct instances, all the same shape: **something that reads as a check and is not.**

- A comment claiming a protection the code cannot deliver — the bucket guard that promised to
  fail when a limit was raised, and could not see an `UPDATE` statement at all.
- A one-time `revoke execute ... from public, anon` that reads like a policy. Every function
  created since has been executable by `PUBLIC` and `anon`; `post_comment` was one, verified
  live before it was closed.
- A test that cannot fail for the reason it names. Two in this plan: an idempotency assertion
  that called the function once, and a retry assertion that hand-fed the same key twice.
- A universal claim over an empty set. The attestation invariant needed a companion assertion
  that the filtered set is non-empty, or a future seed change would make it pass on nothing.
- A value repeated with nothing saying whether it is one decision or several. `52428800` in
  four migrations governing three different things; two of them were raised and two
  deliberately left.
- Two regexes that were identical and correctly diverged, so the divergence is invisible to
  anyone who remembers them as twins. The danger there is not a missed update but a
  **correct-looking deletion** of something load-bearing.
- Evidence measured against the wrong image, in both directions. A stale image produces a
  false red, which somebody chases. A different branch produces a false green, which nobody
  re-checks.

## Next required action

`I05` is where this work meets the acceptance evidence. Item 1 above is the case to probe from
the product side: retry after a failed comment write **within** the dialog converges correctly;
retry after a remount does not.

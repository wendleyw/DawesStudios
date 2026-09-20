# Fixture artwork rendered at the true size of its format

- Updated at: 2026-09-20T18:20:00Z
- Reporting agent and tool: Delegated fixture-media agent / Claude Code
- State: verified (fixture scripts, regenerated dataset and stored bytes); the Playwright suite was deliberately not run and stays with the orchestrator
- Objective: render every fixture image at the real pixel size of the format its deliverable was ordered in, so a square deliverable is 1080x1080 and a portrait feed 1080x1350 on the board and inside the project, without moving any row count or storage object count
- Owned paths: `supabase/scripts/fixture_media.py`, `supabase/scripts/provision_local_auth.py`, `supabase/scripts/verify_seed.py`, `supabase/scripts/build_seed.py`, `supabase/seed.sql`, `supabase/fixtures.json`, this report
- Dependencies: local Docker Supabase on `127.0.0.1:55421`, `public.format_catalog` and `docs/ref/00-guia/CATALOGO-DE-SERVICOS.json` (read only)
- Acceptance criteria: every stored artwork PNG declares its format's size in its own IHDR header; the eight-table baseline and the 108 storage objects are unchanged; the internal/published metadata distinction survives; `verify_seed.py` and `supabase test db` pass

## Completed work and changed files

`supabase/scripts/fixture_media.py`

- `png_card(index, width, height, *, internal=False)` now takes the canvas as two required positional
  arguments. There is no default size left in the module, so no caller can fall back to 640x480 by
  omission.
- The card composition moved from hard-coded pixel bounds to `CARD_LAYOUT`, five rectangles expressed as
  fractions of the canvas. At 640x480 those fractions round back to exactly the previous bounds, which
  was checked by decompressing both renderings and comparing the raw scanlines: identical for indices 1,
  7 and 22. Only the canvas changed, not the artwork.
- The renderer no longer walks pixels. Each row is painted as flat runs with slice assignment, rows that
  repeat are built once and reused, and rows are streamed into a `zlib.compressobj` instead of joining a
  full raw buffer, so a 1080x1920 canvas never materialises its ~6 MB of RGB at once.
- `format_pixel_size(definition)` is the single place that decides a canvas, and it is exported for the
  generator and the verifier. Three documented rules cover the formats that carry no pixel size:
  - **Print (mm): render at 150 DPI.** `a4` becomes 1240x1754, `a5` 874x1240, `letter` 1276x1648,
    `custom-mm` 1240x1754. 150 DPI was chosen because it is proportionally exact, readable on screen,
    not press weight, and because it is already the project's print-proof resolution: the seeded
    `Print Flyer` brand template is 1240x1754, which is A4 at 150 DPI.
  - **Fluid (px width, no height): render 3:4 portrait.** `desktop` 1440x1920, `email` 600x800,
    `article` 1200x1600, `mobile` 390x520. The declared width is real, so it is kept; the height is the
    first screen of a layout that keeps scrolling past it, which is why it is taller than it is wide.
  - **No dimensions at all: render 1080x1080.** `brand-kit`, `guidelines`, `research`, `shot-list`,
    `direction`, `dieline` and `custom` are document or kit deliverables with no canvas. A square at the
    1080 baseline shared with the smallest fixed digital format claims no shape the deliverable was
    never ordered in, and it is stated as `FORMAT_FREE_SIZE`, not inherited by accident.
- `png_pixel_size(content)` reads width and height back out of a PNG's IHDR header, so a check can read
  what a file actually is rather than what a manifest asked for.
- `MARK_SIZE` names the 640x480 of the client brand mark. The mark deliberately keeps that size: it is a
  logo, it belongs to no deliverable and therefore to no format, and its SVG, PNG and PDF siblings must
  stay the same artwork as each other. `monogram_pdf` now derives its MediaBox from `MARK_SIZE` instead
  of repeating the numbers.

`supabase/scripts/build_seed.py`

- Imports `format_pixel_size` and resolves the leading deliverable's format into
  `artwork_width, artwork_height` beside the existing `format_spec` lookup.
- Every `working_assets` manifest entry now carries `width` and `height` next to its `index`, so the
  manifest states the canvas and the provisioning step no longer has to guess one.
- Every brand *product reference* entry carries `width`/`height` too, set to `FORMAT_FREE_SIZE`: a brand
  reference belongs to no deliverable, so it resolves through the same documented no-format rule. The
  brand mark entries (`mark`, `mark-png`, `mark-pdf`) and the guidelines PDF are untouched.
- `seed.sql` is byte-identical before and after this task (73 added / 73 removed lines in the working
  tree, all of them from the preceding schedules task), and two consecutive runs of the generator
  produce the same SHA-256. Only `fixtures.json` grew, by the new dimension keys.

`supabase/scripts/provision_local_auth.py`

- The three `png_card` call sites pass `asset['width'], asset['height']` from the manifest: the brand
  product reference, the internal working copy and the sanitized published copy.

`supabase/scripts/verify_seed.py`

- Builds the expected canvas independently, from `format_catalog` joined through
  `designs → design_versions → deliverables`, and asserts three things per artwork file: the manifest's
  declared size equals that expected canvas, the downloaded bytes equal a re-render at that size, and
  the size read from the downloaded file's own IHDR header equals the expected canvas. The last check is
  the one that cannot be satisfied by a manifest that lies.
- Brand product references are checked against `FORMAT_FREE_SIZE` the same way.
- The evidence JSON gained `artwork_pixel_sizes_match_deliverable_format` and
  `distinct_artwork_pixel_sizes` (7 under the current dataset).

## Decisions and interface changes

- `png_card`'s signature changed. Every caller in the repository is inside this task's owned paths, and
  `supabase/tests/concurrent_workflows_test.py` imports only `simple_pdf`, so no consumer outside these
  scripts is affected. `provision_logo_exports.py` touches only `mark-png`/`mark-pdf` rows and needed no
  change.
- The three format rules above are product decisions about fixture data, not schema changes. No
  migration, no table, no column and no storage path moved.
- Cost was measured rather than assumed, because the brief warned about it. Rendering 95.9 megapixels
  across the 67 cards of a full dataset now takes **0.61 s**, against **1.73 s** for the 15.1 megapixels
  of the old 640x480 cards: about 180x less work per megapixel. Nothing had to be given up to get true
  dimensions — the flat-run renderer paid for the larger canvases several times over.
- Interface request for the orchestrator (two shared documentation files, deliberately not edited here
  because they are outside this task's ownership):
  - `docs/operations/README.md`, the paragraph describing the fixture dataset, should state that the 22
    private production images and 15 published copies are rendered at the pixel size of their
    deliverable's format, with print formats at 150 DPI and format-free deliverables at 1080x1080.
  - `docs/architecture/backend.md`, the `verify_seed.py` bullet, should mention that the verifier now
    also reads each artwork file's IHDR header and checks it against `format_catalog`.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| Eight-table baseline + storage count via `psql`, before any edit | local, 2026-09-20 | clients 10, projects 20, notifications 12, design_versions 33, designs 38, campaigns 10, briefings 23, Auth users 13, storage objects 108 | terminal |
| `time python3 supabase/scripts/provision_local_auth.py`, before any edit | local | `4.443 s` total, 2.46 s user | terminal |
| Render benchmark of the previous fixed-size card (49 cards, 640x480) | local | 1.73 s, 15.1 megapixels, 132,511 PNG bytes | terminal |
| Raw-scanline comparison, new renderer vs previous card at 640x480, indices 1/7/22 | local | Pixel-identical in all three cases | terminal |
| Render benchmark at true format sizes (67 cards of a full dataset) | local | 0.61 s, 95.9 megapixels, 737,441 PNG bytes | terminal |
| `python3 supabase/scripts/build_seed.py`, run twice | local | `Generated 10 clients and 20 projects`; `seed.sql` SHA-256 `d83a4907…60362c` both times | terminal |
| `git diff --numstat supabase/seed.sql` | local | `73 73` — unchanged by this task | terminal |
| `python3 supabase/scripts/local_stack.py reset --confirm-local-data-loss` | local | `Provisioned 13 Auth accounts, 70 brand files, 22 internal working files, 15 published copies and the delivery fixture`; 32.1 s total | terminal |
| `time python3 supabase/scripts/provision_local_auth.py`, after reset | local | `2.532 s` total, 0.78 s user — faster than the 4.443 s before | terminal |
| `python3 supabase/scripts/verify_seed.py` | local, after reset | PASS, 2.21 s — 108 verified downloads, `artwork_pixel_sizes_match_deliverable_format` true, `distinct_artwork_pixel_sizes` 7, `projects_with_internal_artwork` 17, `projects_with_published_artwork` 11 | terminal |
| `npm run db:test` | local | `All tests successful. Files=5, Tests=133 … Result: PASS` | terminal |
| Eight-table baseline + storage count re-queried after the reset and `db:test` | local | Identical to the before row: 10 / 20 / 12 / 33 / 38 / 10 / 23 / 13, storage objects 108 (brand 70, internal 22, published 15, delivery 1) | terminal |
| IHDR read back from Storage for 24 objects across 15 format rules | local | Every header matches its format: a4 1240x1754, brand-kit 1080x1080, custom 1080x1080, desktop 1440x1920, dieline 1080x1080, direction 1080x1080, email 600x800, feed 1080x1350, guidelines 1080x1080, infographic 1080x1920, reel 1080x1920, shot-list 1080x1080, slides 1920x1080, square 1080x1080, brand product reference 1080x1080 | terminal |
| IHDR read back for **all** 37 artwork objects plus 3 brand product references | local | 0 mismatches out of 40 downloads | terminal |
| Internal/published metadata distinction re-checked against stored bytes | local | 22/22 internal copies carry the tEXt `Author` chunk, 15/15 published copies carry none | terminal |
| Stored object sizes per bucket | local | internal-assets 258,092 B (largest 19,120), published-assets 167,017 B (largest 16,170), brand-assets 329,182 B — the whole fixture is under 0.8 MB | terminal |
| `npm run check --prefix apps/web` | local | **FAIL at `format:check`**, for a reason outside this task — see risks | terminal |
| `npm run test --prefix apps/web` | local | `Test Files 12 passed (12) / Tests 246 passed (246)` | terminal |

Not run, deliberately: the Playwright browser suite (owned by the orchestrator), `verify_local.py`,
`supabase/tests/concurrent_workflows_test.py` and the media integration suite.

## Remaining risks and next action

- `npm run check --prefix apps/web` exits 1. `typecheck` passes, `lint` reports 0 errors (2 pre-existing
  warnings), and the failure is `format:check` rejecting `apps/web/features/projects/canvas-layout.test.ts`,
  an untracked file belonging to another worker under `apps/`, which this task must not write. Because
  `check` is a `&&` chain, `npm run test` never ran inside it, so it was run separately and passed with
  246 tests. The fix is `npm run format --prefix apps/web` by whoever owns that file.
- The reset time before the change was not measured in this session, so the 32.1 s reset has no
  before-figure to compare against; the provisioning step, which is the part this task changed, does have
  one (4.443 s → 2.532 s).
- Byte equality of fixtures still depends on the local zlib build, exactly as it did before: the
  compressor is now driven incrementally rather than in one call, which is deterministic on one machine
  but not a cross-version guarantee. `fixture_object` compares SHA-256 and fails loudly if it ever drifts.
- The board and project canvas now receive images with aspect ratios from 600x800 to 1920x1080. Whether
  every card and viewer frames a 1:1.78 landscape and a 1:1.33 portrait equally well is a UI question for
  the `apps/web` owner, not a fixture question.
- Next concrete action for the orchestrator: re-run the browser evidence against the reset stack to see
  the true-size artwork in the board cards and the project canvas, and fold the two documentation lines
  listed above into its documentation pass.

## Ownership at handoff

All owned paths are released. No background process was left running by this task. The local stack is up
(API 55421, media 55430) with the regenerated fixture applied and verified. No file under `apps/`,
`supabase/migrations/` or `docs/architecture/acceptance-matrix.md` was written.

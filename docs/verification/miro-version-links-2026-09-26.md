# Miro version links — browser flows and visual check

Date: 2026-09-26. Owner: Claude (Task 7). Runtime: existing Next.js dev server at
`http://localhost:3003`, local Supabase stack; neither was started, stopped or reset.

## Delivered behavior verified

- The seeded SABRE landing page (`15e2d399-e215-9707-9499-96b455c83adf`) gets a temporary
  client-channel link on its latest publication and an internal-channel link on its latest
  internal version, both set through `set_publication_miro_link` / `set_version_miro_link` and
  cleared through the matching `clear_*` RPCs in the spec's `afterAll`.
- A client session opens **View on Miro** and reaches only the client board
  (`live-embed/uXjVClientE2E%3D/?moveToWidget=111`); the internal board's iframe never mounts;
  **Open in Miro** is `target="_blank"`; **Back to project** unmounts the panel and no
  "Miro link for version" manage control is ever offered to the client.
- An assigned designer session opens only the internal board; the client board never mounts; no
  manage control is offered (only the agency has `canManageMiro`).
- An agency session sees **Change Miro link for version N** in the internal (Working files)
  channel, and after switching to `?channel=client` opens the client board from the same version.

## Checks executed

| Check | Result |
| --- | --- |
| `npx playwright test tests/e2e/miro-version-links.spec.ts tests/e2e/content-security-policy.spec.ts --output ../../outputs/playwright-miro` (from `apps/web`) | 4/4 passed |
| Cleanup read via `docker exec supabase_db_dawes-studios psql` on `publication_miro_links` / `design_version_miro_links` for the SABRE landing page | 0 rows in each table after the run — `afterAll` removed both links |
| `npm run check` (repo root, before commit) | see commit log; run once, results below |
| One-off Playwright capture of the open `MiroBoardPanel` as the client, against the same running `:3003` server (not committed as a spec file) | pass; screenshots below |
| Cleanup read via `docker exec supabase_db_dawes-studios psql` on `publication_miro_links` for the SABRE landing page after the fix-wave capture | 0 rows — the temporary link was removed |

## Manual embed check (Step 3)

Pending — needs a real view-by-link Miro board from the user. Not performed in this session; no
board was supplied. The iframe `src` is asserted against the rebuilt `live-embed` URL only; the
embed's own sign-in behavior, Safari rendering and Chrome/Safari **Open in Miro** reachability with
a real board remain unverified.

## Visual check (Step 4)

The following committed screenshots are preserved in
[`screenshots/miro-version-links/`](screenshots/miro-version-links/). They were moved byte-for-byte
from `outputs/miro/` during the 2026-09-27 repository cleanup so working captures can remain ignored:

- `agency-card-1440-light.png`, `agency-card-1440-dark.png`, `agency-card-390-light.png` — the
  version card baseline (agency, Working files) at 1440 px and 390 px, light and dark.
- `agency-card-with-link-manage-1440-light.png` — a version whose channel carries a link: **View on
  Miro** and the `Link2` manage icon button sit in one row, both at the row's 36 px height, aligned
  the same way as `.version-comments` above it (7 px icon/text gap, 14 px left padding); no overlap
  or wrapping.
- `client-card-with-link-1440-light.png` — the client sees the same **View on Miro** row, muted
  text, no manage icon.
- `designer-card-with-link-1440-light.png` — the assigned designer sees **View on Miro** only, no
  manage icon, confirming `canManageMiro` gating visually as well as by role.
- `publish-dialog-1440-light.png`, `publish-dialog-390-light.png` — the **Miro frame (optional)**
  field under the client note, prefilled from the deliverable's existing client-channel link; at
  390 px the dialog, field and buttons stay within the viewport with no overflow or clipped text.
- `miro-panel-1440-light.png`, `miro-panel-1440-dark.png`, `miro-panel-390-light.png`,
  `miro-panel-390-dark.png` (2026-09-26, fix wave) — the open `MiroBoardPanel` as the client, on a
  temporary client-channel link set on the same SABRE landing page and cleared afterwards. See the
  "Open panel" entry below for what these confirm.

Observations:

- **Alignment with the comments button:** confirmed above; the Miro row reuses the same row height,
  padding and font size as the comment shortcut, so both read as one aligned column of small tools.
- **Long-title truncation:** no seeded deliverable name is long enough to visibly truncate. Verified
  by source inspection instead: `.miro-board-header h2` sets `overflow: hidden; text-overflow:
  ellipsis; white-space: nowrap;` with `flex: 1; min-width: 0`, which truncates a long
  `deliverable · V<n>` title rather than wrapping or pushing **Open in Miro** offscreen.
- **390 px overflow:** none observed on the version card or the publish dialog; the canvas
  auto-fits (70% zoom) and the dialog's field/buttons stay inside the 390 px frame.
- **Dark theme:** both the version card and the publish dialog re-theme correctly (background,
  border, muted/foreground text) with no unstyled or low-contrast element.
- **Open panel (2026-09-26, fix wave):** the dev server was restarted with a fresh CSS cache and
  now serves `.fullscreen-layer` (confirmed by fetching the served chunk directly — `position:
  fixed; inset: 0; width: 100vw; height: 100dvh` are all present). Re-captured as the client at
  1440 px and 390 px, light and dark (`miro-panel-1440-light.png`, `miro-panel-1440-dark.png`,
  `miro-panel-390-light.png`, `miro-panel-390-dark.png`): the panel now fills the full viewport in
  every capture, with **Back to project**, the truncating `deliverable · V<number>` title (shown
  truncated to `Desk…` at 390 px) and **Open in Miro** all on one row that does not overflow or
  wrap at 390 px. Focus lands on the heading on open (asserted, not just observed); pressing Escape
  with focus outside the iframe (on the heading) closes the panel and returns focus to the **View
  on Miro** button that opened it (asserted via `toBeFocused()`). The embed itself renders blank in
  this environment (no real Miro session/board), which matches the expectation that a sign-in or
  error page from Miro's own iframe is out of scope here; the frame, header and both header actions
  are what this check covers. Opening the Playground once afterward confirmed it is still full
  screen too, ruling out a regression shared with `MiroBoardPanel` through `use-fullscreen-layer.ts`.
  The earlier undersized-panel finding (Turbopack serving a stale `globals.css` missing
  `.fullscreen-layer`) is resolved by the cache refresh and no longer applies.

## Owned paths touched

`apps/web/tests/e2e/miro-version-links.spec.ts`, `apps/web/features/projects/README.md`, this file,
`docs/engineering/handoffs/2026-09-26-miro-task-7.md`, and the screenshots listed above.

Fix-wave update (2026-09-26): `apps/web/features/projects/project-action-dialog.tsx`,
`apps/web/features/projects/project-action-dialog.test.tsx`, this file, the four `miro-panel-*.png`
screenshots, and `docs/engineering/handoffs/2026-09-26-miro-final-fixes.md`.

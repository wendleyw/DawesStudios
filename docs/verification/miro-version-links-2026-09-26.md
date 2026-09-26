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

## Manual embed check (Step 3)

Pending — needs a real view-by-link Miro board from the user. Not performed in this session; no
board was supplied. The iframe `src` is asserted against the rebuilt `live-embed` URL only; the
embed's own sign-in behavior, Safari rendering and Chrome/Safari **Open in Miro** reachability with
a real board remain unverified.

## Visual check (Step 4)

Screenshots in the git-ignored `outputs/miro/`; the following are committed because this record
cites them:

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
- **The open Miro panel (`MiroBoardPanel`) itself could not be verified visually in this session.**
  The panel opened and its header/iframe elements were present with the right classes and `src`,
  but the panel's `<dialog class="fullscreen-layer miro-board-panel">` rendered as a small
  (~460×211 px) box instead of covering the viewport. Root cause traced (via
  `getComputedStyle`/`getBoundingClientRect`, an inline-style override that restored full-screen
  sizing immediately, and a fetch of the served CSS chunks) to the running dev server's CSS bundle:
  the served stylesheet is missing the `.fullscreen-layer` rule entirely, while `app/globals.css`
  on disk has it (lines ~1170-1218) and every other class used by this feature (`.version-card`,
  `.version-miro-open`, `.miro-board-header`, `.miro-board-frame`, …) *is* present in the served
  bundle. This matches the known Turbopack disk-cache issue already recorded in
  `docs/engineering/handoff.md` ("Turbopack's disk cache has missed `globals.css` edits before").
  This is an environment/staleness issue in the long-running dev server, not a defect in
  `miro-board-panel.tsx` or `projects.css`, and `PlaygroundBoard`'s own `fullscreen-layer` dialog
  reproduces the identical undersized box on the same server, which is further evidence this
  predates this task and is server-cache-scoped rather than Miro-panel-specific. No product file
  was changed to chase this; panel screenshots were taken but are not committed or cited above
  because they would misrepresent the shipped behavior. **Next action:** clear
  `apps/web/.next/dev/cache` and restart the dev server on the same port, then re-capture the panel
  at 1440/390, light/dark, before trusting a full-screen visual check of it.

## Owned paths touched

`apps/web/tests/e2e/miro-version-links.spec.ts`, `apps/web/features/projects/README.md`, this file,
`docs/engineering/handoffs/2026-09-26-miro-task-7.md`, and the screenshots listed above.

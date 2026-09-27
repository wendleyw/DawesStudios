# Retire Versions: the product runs on the Miro workspace

Date: 2026-09-27. Status: decisions approved in conversation; written-spec review pending.
Builds on [the Miro workspace](2026-09-26-miro-workspace-design.md) and
[project covers](2026-09-27-project-cover-design.md). Supersedes the "Versions only for existing
projects" section of the cover spec.

## Intent

The studio designs in Miro and uses Miro as the working store. The legacy **Versions** feature is
removed from the product. It consists of per-deliverable versions, uploaded designs, image pins,
sanitized publication copies and the canvas that shows them.

After this change:
- every project, old or new, runs on the Miro workspace (design boards, rounds and client
  versions), with a cover, final files and a Google Drive backup link;
- there is no code path, table or route that exists only for Versions.

### Decisions taken with the user

- **Old data:** delete it all; everything is test data. Legacy per-deliverable versions, uploaded
  designs, publication copies, image pins and their storage objects are removed. Projects,
  briefings, deliverables (as requested scope), credits, comments without a design, covers,
  project assets and delivery files stay.
- **Seed and demo:** rebuild both in the Miro model. The canonical seed keeps 10 clients and
  25 projects; the SABRE overlay keeps 50 SABRE projects, 10 clients and 68 in total. Both create
  design boards, rounds and client versions with sample Miro links, plus covers made from the
  current demo art.
- **Files (Brand Hub → Files):** keeps working files (`project_assets`) and final delivery files.
  The "shared designs" list, which read uploaded publication copies, goes away. Brand Hub Assets
  is unchanged.
- **Google Drive backup:** one link per project, set by the agency, visible to the agency and the
  client. It is only a link; nothing syncs.
- **Rules:** the acceptance rules in CLAUDE.md and AGENTS.md are rewritten for the Miro model.

## What is removed

- **Web** (`apps/web/features/projects`):
  - the Versions canvas: `project-versions-canvas.tsx`, `canvas-layout.ts`, `project-nodes.tsx`,
    `project-canvas-view.tsx`;
  - the design viewer and image/video pins: `design-viewer.tsx`, `video-pins.ts`,
    `video-player*`;
  - uploads: `artwork-files.ts`, `artwork*.tsx`, `bulk-drop-*`;
  - the design, version, publish and submit dialogs: `project-action-design*.tsx`,
    `project-action-version.tsx`, `project-action-publish.tsx`, `project-action-submit.tsx`;
  - the legacy per-deliverable Miro mode: `miro-mode.ts` and `MiroBar` / `MiroView` in
    `miro-view.tsx`;
  - "Earlier versions", `?view=versions`, and the legacy header parts of `project-header.tsx`;
  - the design-scoped parts of `comment-panel.tsx` / `comment-draft.ts`, meaning pins and
    `designId`;
  - every test that exists only for these.

  The implementer confirms each file with `rg` before deleting it. A file that is also used by
  the workspace is adapted, not deleted. `ProjectPage` renders `ProjectWorkspace` only.
- **Media worker:**
  - routes: `/publications/prepare`, `/designs/sanitize-video`, `/designs/discard-raw`, and
    `/assets/discard` if only publications use it;
  - their helpers in `supabase.js` and `media-client.ts`, with tests.
  - `/deliveries/prepare` and `/covers/*` stay.
- **Database** (one forward migration, plus data deletion):
  - delete the legacy rows: `design_versions` and `published_versions` with a deliverable, their
    `designs` / `published_designs`, their Miro links, `publication_sources` / `publication_reviews`
    for them, `private.sanitized_assets` for design and publication copies, comments that carry a
    `design_id`, and the notifications and audit rows that only point at them;
  - drop the tables `designs` and `published_designs`, and the columns `deliverable_id` on both
    version tables and `design_id` / `pin_x` / `pin_y` / `pin_t` on both comment tables;
  - drop the RPCs `add_design`, `update_design` / working-design edits, `create_design_version`,
    `submit_design_version`, `publish_version`, the video attestation RPCs used only by designs,
    and any storage policy that exists only for design objects;
  - simplify these to the Miro shape:
    - `design_versions` now requires `board_id` (the one-parent check goes);
    - `published_versions` is always project-level;
    - `review_publication` loses the deliverable branch;
    - `post_comment` / `resolve_comment` lose the design and pin parameters;
    - privacy helpers and triggers no longer consider deliverables;
    - realtime publications stop listing dropped tables;
  - storage: the bytes of deleted design and publication objects are removed by a guarded
    service-role cleanup script run once locally (the migration cannot delete Storage bytes).
    The `published-assets` bucket is dropped if nothing else uses it. `internal-assets` stays,
    because `project_assets` uses it.
- **Seed and demo:**
  - `supabase/seed.sql` / `build_seed.py` / `verify_seed.py` stop generating designs and
    publications;
  - `sabre_demo.py` and its extras stop calling the removed RPCs.
- **E2E:** delete the specs that only test Versions flows (production-workflow, video-designs,
  video-loading, bulk-image-drop, project-recovery, and the design/pin parts of project-feedback,
  project-creation-cards, playground and others). Rewrite what still matters on the Miro model
  (comments per channel, credits, navigation).

## What changes or is added

- **Board cards:** cover, otherwise placeholder. The legacy-art fallback goes away.
- **Overview and Reviews:** rows are rounds (studio) and client versions (client), labelled by
  board name / "Round N" and "V N". "Deliverable" labels go away. Reviews lists rounds waiting for
  studio review, and client versions waiting for, or decided by, the client.
- **Files:** working files and final files per campaign/project, plus the Drive icon.
- **Playground albums:** the album built from project designs goes away. Brand Hub albums stay.
- **Google Drive link:**
  - `projects.drive_url` (nullable), validated as `https://drive.google.com/...` by a new
    agency-only RPC `set_project_drive_link(p_project_id, p_url)`; an empty URL clears it;
  - a Google Drive icon link (opens in a new tab) in the Miro workspace bar's More menu and in
    Files beside that project, visible to the agency and the client;
  - "Add / Edit Drive link" in Project details for the agency.
- **Seed and demo in the Miro model:**
  - every project gets design boards (one per assigned designer), 1–2 rounds and 0–2 client
    versions whose statuses match its current status;
  - sample Miro links on a demo board id (`uXjV…` placeholders are acceptable: the embed simply
    shows Miro's own "not found");
  - covers from the existing demo art, uploaded through the media worker so they are attested,
    and visible to the client for projects that have a client version;
  - a Drive link on some projects.
  - Counts stay: seed 10 clients / 25 projects; SABRE overlay 50 SABRE / 68 total.
- **CLAUDE.md and AGENTS.md** (kept identical): replace the design-pin, uploaded-snapshot and
  per-deliverable V1/V2 requirements with the Miro model:
  - the studio publishes an immutable client version (link + note), and only the agency shares;
  - the internal and client comment channels stay separate;
  - a designer never sees another designer;
  - covers are sanitized and client-visible only when marked;
  - final files are delivered through Files;
  - the acceptance baseline (10 clients / 25 projects) describes boards, rounds and client
    versions instead of production images and published copies.
- **Docs:** projects, board, assets, playground, reviews and overview READMEs;
  `docs/architecture/backend.md`; `docs/architecture/data-access.md` if it names removed hooks;
  the design-system doc sections about the Versions canvas; `supabase/demo/sabre/README.md`;
  `docs/operations/README.md` seed counts; the handoff.

## Testing

- **pgTAP:** all suites updated for the dropped tables and columns. New assertions:
  - no deliverable-version path exists;
  - `set_project_drive_link` is agency-only and validates the host;
  - clients read `drive_url`.
- **Unit:** every remaining test passes; removed features' tests are removed with them.
- **E2E:** the Miro round trip (`miro-workspace.spec.ts`), covers (`project-cover.spec.ts`, from
  the cover plan's Task 6) and Drive link visibility by role. The full suite passes apart from the
  documented canonical-count assertions, which are updated to the rebuilt seed and must pass on a
  freshly reset canonical database.
- A fresh `local_stack.py reset --confirm-local-data-loss`, run only with the user's approval,
  followed by the SABRE `apply`, must produce the stated counts and a working demo. It is run once
  at the end, as the acceptance check.

## Phases (each shippable on its own)

1. **Remove the legacy UI and the web and media code paths.** Every project renders
   `ProjectWorkspace`, and the consumers are adapted. The database is untouched, so old data is
   simply unused.
2. **Database:** delete the data, drop tables, columns and RPCs, simplify functions, run the
   storage cleanup script, and regenerate types.
3. **Seed and SABRE demo** rebuilt in the Miro model, with verifiers and the canonical-count
   assertions updated.
4. **Google Drive link.**
5. **CLAUDE.md / AGENTS.md** rules and all docs. The full e2e suite and the one approved fresh
   reset run as the final acceptance.

## Out of scope

- Syncing with Google Drive or Miro APIs.
- Migrating any old data (it is test data and is deleted).

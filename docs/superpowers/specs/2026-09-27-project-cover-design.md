# Project cover, and Versions only for existing projects

Date: 2026-09-27. Status: approved in conversation; written-spec review pending.
Builds on [the Miro workspace](2026-09-26-miro-workspace-design.md).

## Intent

Projects now run in the Miro workspace and carry no uploaded designs. A board card therefore needs
a cover that does not come from Versions. At the same time, Versions retires for new projects: it
stays only for projects that already have per-deliverable versions.

Success means three things:
- the agency sets a cover on any project from Project details and chooses whether the client sees
  it;
- board cards show that cover by role;
- a new project can never open the Versions canvas, while existing projects keep working unchanged.

### Decisions taken with the user

- **Uploaded cover.** The agency uploads an image in Project details, can replace or remove it,
  and marks it visible to the client or not.
- **History.** Versions stays for projects that already have per-deliverable versions
  ("only new projects" retire it). Their history stays where it is.

## Cover

### Storage and trust

- A new private bucket, `project-covers`, holds PNG only, up to 10 MiB. Every object is a
  sanitized re-encode written by the trusted media worker. A browser never uploads into it
  directly.
- `private.register_sanitized_asset` accepts `p_bucket_id = 'project-covers'` with mime
  `image/png` and no source design. The existing rules for `published-assets`, `delivery-files` and
  `internal-assets` are unchanged.
- The media worker adds `POST /covers/prepare?projectId=<uuid>`. It accepts a PNG, JPEG or WebP
  body and the caller's bearer token, and then:
  1. sanitizes the image to PNG, the way delivery images are sanitized;
  2. saves it with `saveSanitized(projectId, 'project-covers', …)`, which attests it;
  3. calls `set_project_cover` with the caller's token, so the database enforces who may set a
     cover;
  4. discards the previous cover path that call returns. If the RPC fails, it discards the new
     object.

### Data

- `public.project_covers` has these columns: `project_id` (primary key, references projects on
  delete cascade), `storage_path` (unique), `client_visible` (boolean, default false),
  `updated_by` and `updated_at`.
- Column privileges follow the `0011` pattern: `updated_by` is not readable by `authenticated`.
- **Row read:**
  - `private.can_produce(project_id)` reads every row;
  - `private.can_client_channel(project_id) and client_visible` reads the rest.
  - There is no direct write; the RPCs below are the only writers.
- **Storage read on `project-covers`:** the same two conditions, applied to the row whose
  `storage_path = name`.
- **RPCs** (security definer, `search_path=''`, agency only):
  - `set_project_cover(p_project_id, p_storage_path, p_client_visible default false) → text`
    requires an attestation row with bucket `project-covers`, the same project and
    `prepared_by = auth.uid()`. It upserts the row and returns the previous `storage_path`, or
    null.
  - `set_project_cover_visibility(p_project_id, p_client_visible)` changes visibility only.
  - `clear_project_cover(p_project_id) → text` deletes the row and returns its path. The web then
    asks the media worker (`/assets/discard`) to delete the object.
- Every RPC writes an audit event. None of them notifies anyone.

### Web

- **Project details** gets a Cover block for every role.
  - The agency sees **Set cover** or **Replace cover** (a file input: PNG, JPEG or WebP), a
    **Visible to the client** switch, and **Remove cover**.
  - Designers see the cover. Clients see it only when it is visible.
- **Board card artwork** (`features/board/project-thumbnail.tsx`):
  - the project cover, when one is readable by this viewer, wins;
  - otherwise the card keeps today's rule (legacy design or published art, by role);
  - otherwise the placeholder.
- The data read lives in `features/projects/project-data.ts` (`useProjectCover`) and, for the
  board, in `features/board/board-data.ts`, next to the thumbnail read, as a batched read by
  project IDs with signed URLs.
- `apps/web/features/projects/media-client.ts` gains `prepareProjectCover(database, mediaUrl,
  projectId, file)`.

## Versions only for existing projects

- A project whose versions include none with a deliverable ("no legacy versions") never renders
  `ProjectVersionsCanvas`. `?view=versions` is ignored there, and the agency's Versions button
  does not appear.
- Projects with legacy versions behave exactly as today.
- E2E specs that exercise the legacy canvas on a fresh fixture project first create one
  per-deliverable version through the API (`create_design_version`). The project then counts as
  legacy, and the spec keeps covering those flows.

## Testing

- **pgTAP:**
  - the agency sets, replaces, hides and clears a cover;
  - designers and clients cannot call the RPCs;
  - a client reads the row and the object only while `client_visible`;
  - designers read both;
  - an unattested or foreign path is refused;
  - `updated_by` is not readable;
  - `register_sanitized_asset` accepts `project-covers` PNG only.
- **Media unit test:** `/covers/prepare` sanitizes, attests, calls the RPC with the user token,
  discards the previous path, and cleans up when the RPC fails.
- **Web unit tests:** the Cover block by role, the cover-first thumbnail choice, and that the
  Versions canvas is never chosen for a project without legacy versions.
- **E2E:** the agency sets a cover. The client does not see it on the board until the agency marks
  it visible, then does. A designer sees it. Replacing the cover removes the old object.

## Out of scope

- Cropping or positioning the cover.
- Covers generated from Miro.
- Removing Versions code or data.

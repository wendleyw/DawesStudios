# Miro workspace: boards, rounds and shared versions

Date: 2026-09-26. Status: approved design, awaiting written-spec review.
Builds on [Miro mode](2026-09-26-miro-mode-design.md) and
[Miro version links](2026-09-26-miro-version-links-design.md).

## Intent

The studio designs in Miro. The project page should run the whole production loop around the Miro
embed and the product's own controls, instead of the Versions canvas of uploaded designs. Versions
stays in the code and remains reachable by the agency, so it can be hidden later without loss.

Success: a designer, the agency and a client complete a project round trip (designer board ->
studio -> client -> approval) without opening the Versions view, uploading a design, or leaving the
product except to work inside Miro itself.

### Decisions taken with the user

- The Miro frame is the design. Uploaded designs are no longer part of a round; final files keep
  using the existing delivery files.
- The internal (Working files) and client (Shared with client) sides use **different Miro boards**.
  The agency copies the design from an internal board into the client board by hand in Miro.
- Working files holds **design boards**: each has a name, a Miro link and exactly one designer,
  chosen from the project's assigned designers. A project may have several.
- The designer's **Send to studio** creates a **round** of their board (Round 1, 2...), with an
  optional note and frame link, and notifies the agency.
- Client versions (V1, V2...) are **per project**, not per deliverable. Each has its own client
  board link. The agency creates one either from a round (**Share with client**) or directly in
  Shared with client (**+**), with no internal source.
- Feedback lives in the product, per round (internal) and per client version (client), not in
  Miro comments.
- The Versions/Miro switch remains for the agency only. Designers and clients see Miro only.

## Concepts and flow

**Design board** (internal): `name`, Miro board/frame link, `designer`. Registered by the agency.
Only the agency and that board's designer can see it.

**Round** (internal): one "Send to studio" of a board. Numbered per board. Carries an optional
note and an optional frame link (defaults to the board's link). Status `submitted`, then
`reviewed` once shared with the client.

**Client version** (Shared with client): numbered per project. Carries the client board link and a
note for the client. It is created by the agency from a round or directly. Publishing it notifies
the client, opens a pending review (Approve / Request changes) and moves the project to
`client_review`, exactly as publishing does today.

### Designer

1. Sees their own boards in Working files, by name, embedded.
2. Works in Miro. Talks to the studio in the round's internal Feedback.
3. **Send to studio**: an optional note and frame link. Creates the next round and notifies the
   agency. The project moves to `internal_review`, as `submit_design_version` does today.

### Agency

- Working files: **Add design board** (name, link, designer), **Edit board** (name, link,
  designer), all boards and rounds, internal Feedback, **Share with client** on a round (client
  board link prefilled with the latest client link, plus a note).
- Shared with client: **+ New version** directly (client board link and note), **Edit Miro link**
  on a client version, client Feedback, the channel switch.
- An empty project (no board, no client version) shows "Add a design board" in Working files and
  "Nothing shared yet. Share a round or add a version." in Shared with client.
- The Versions/Miro switch, for projects that still have uploaded-design versions.

### Client

- Shared with client only: client versions, **Approve / Request changes**, the version's Feedback.
- "Nothing shared yet" when no client version exists.
- Never receives an internal board, a round, a designer's identity or internal feedback.

## Data model (approach A: extend the existing version tables)

One migration. Existing per-deliverable versions and their data are untouched.

- New `public.design_boards`: `id`, `project_id`, `name` (1-80 characters, unique per project),
  `designer_id` (must be assigned to the project), `board_id`, `widget_id` (validated as today's
  Miro links), `created_by`, `created_at`, `updated_at`.
- `public.design_versions`: `deliverable_id` becomes nullable; add a nullable `board_id` referencing
  `design_boards`. Check: exactly one of `deliverable_id` and `board_id` is set. A round is a row
  with `board_id`. Unique `(board_id, version_number)`. The existing
  `unique(deliverable_id, version_number)` is unaffected because rows with a null value do not
  collide. A round's frame link uses the existing `design_version_miro_links` row.
- `public.published_versions`: `deliverable_id` becomes nullable. A project-level client version
  has none. Add a partial unique index on `(project_id, version_number)` where `deliverable_id is
  null`. The client link uses the existing `publication_miro_links` row. A version shared from a
  round records its source in `private.publication_sources`, as today. A direct version has no
  source row, and its publisher is recorded in the audit log.
- Reviews (`publication_reviews`), comments (`internal_comments.version_id`,
  `client_comments.publication_id`) and notifications need no schema change.

### Row-level security

- `design_boards`: readable by the agency and by that board's designer. There is no client access.
  Writes go only through RPCs.
- `design_versions` rounds (rows with `board_id`): the read policy narrows from `can_produce` to
  the agency, or to the designer of that board. Per-deliverable rows keep `can_produce`.
- `internal_comments` on a round follow the round's visibility.
- `design_version_miro_links` on a round follow the round's visibility.
- Client-side tables keep `can_client_channel`. A project-level client version exposes no board,
  round or designer data.

### RPCs (security definer, `search_path=''`, parse Miro URLs in the database)

- `create_design_board(project, name, url, designer)` and `update_design_board(board, name, url,
  designer)`: agency only. The designer must be assigned to the project.
- `send_board_round(board, note, frame_url default null, idempotency_key)`: only the board's
  designer, or the agency. Creates the next round (status `submitted`) and its frame link, moves
  the project to `internal_review` and notifies the agency. A retry with the same key returns the
  same round.
- `share_miro_version(project, client_url, note, source_round default null, idempotency_key)`:
  agency only. Rejects delivered projects. In one transaction it creates the next project-level
  client version, its link, its pending review and, when given, its source row. It marks the round
  `reviewed`, moves the project to `client_review` and notifies the client. A retry with the same
  key returns the same version. An invalid link is rejected before anything is written.
- The existing `set_version_miro_link` / `set_publication_miro_link` edit round and client links.
  `set_version_miro_link` on a round also accepts that board's designer.
- `review_publication` works unchanged on project-level client versions. It is verified by tests,
  not assumed.

## Interface

- `ProjectHeader` in Miro mode: the Miro bar shows, by channel:
  - Working files: a **board picker** (board names), a **round picker** (Round 1, 2...) when the
    board has rounds, Open in Miro, and actions by role: **Send to studio** (the designer, on their
    own board), and **Share with client** and **Edit board** (the agency).
  - Shared with client: the **version picker** (V1, V2...), **+** (the agency), the status, the due
    date, Open in Miro, and **Edit Miro link** in More (the agency).
- The embed shows the round's frame, or the board when no round is selected, in Working files; it
  shows the client version's link in Shared with client.
- The tool bar gains **Feedback**, which opens the comment panel scoped to the shown round or
  client version on the current channel. It reuses the existing comment panel.
- The existing `MiroReviewBar` serves project-level client versions.
- Projects open in Miro for every role. For the agency, the Versions switch is shown only when the
  project has per-deliverable versions.
- Dialogs follow `ProjectActionShell`, like today's Miro and version dialogs.

## Error handling

- Invalid Miro links: the database message is shown in the dialog. Nothing is written.
- A designer removed from the project loses access to their boards through RLS. The agency
  reassigns the board with Edit board.
- A delivered project refuses new rounds and client versions with a clear message.
- Retried submits reuse the dialog's idempotency key, as publishing does today.

## Testing

- pgTAP covers each RPC's permissions (agency, the board's designer, another designer, the
  client), atomicity (nothing written on an invalid link), idempotency, delivered projects, RLS
  (another designer cannot read a board or its rounds; the client cannot read internal data), and
  `review_publication` on project-level versions.
- Unit tests cover the Miro bar's controls by role and channel, the dialogs, and the empty states.
- E2E runs the full round trip on a fixture client: the agency adds a board for a designer, the
  designer sends a round, the agency shares it with a client link, the client requests changes,
  then approves a second version. Each role sees only its own side. The client-visible payload
  holds no internal identifiers.
- The canonical seed counts and the SABRE overlay are unchanged. No seed data is added.

## Out of scope

- Removing the Versions view or per-deliverable versions.
- Syncing anything with Miro's API (copying frames, reading comments). Copying stays manual.
- Pins on the Miro embed (cross-origin).
- Migrating existing projects' links into boards.

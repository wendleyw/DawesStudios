# Production collaboration

The application has one studio and isolated client workspaces. Routes compose feature modules; Supabase owns identity, permissions, project state, comments, credits and files. TanStack Query caches authorized reads. xyflow owns viewport interaction and renders database records; dragging a board card persists only its position and cannot change workflow status.

## From request to delivery

1. A client or agency creates a briefing with an explicitly selected campaign. Service scope, format variations, brand defaults and overrides are preserved in the draft. Submission is free.
2. Agency confirms a quote and accepts the briefing. One database transaction checks available credits, creates the project/deliverables and records one debit. Repeated or concurrent acceptance returns the same project.
3. Agency assigns a creative partner and plans project dates. The designer sees only assigned work and safe briefing/brand direction. Agency can revoke access. The client receives neither assignment nor internal author records.
4. Agency or assigned designer creates working versions/designs, uploads artwork and discusses it privately. General conversation and design pins have separate scopes. Unsent comments remain scoped to user, project, channel and design in the query cache; signing out clears them.
5. Designer submits work to the studio. Only agency can publish a client revision. Uploaded artwork passes through the trusted media service before a database command records a sanitized, immutable client snapshot. Later internal edits do not mutate its records or file bytes.
6. The client reviews the latest published revision, requests changes with feedback or approves it. A new revision preserves prior feedback and comments. Stale or conflicting decisions cannot overwrite a later review.
7. Agency adds real final files to an approved project through the media service and completes delivery. The client can download authorized files. Replays are idempotent and premature delivery is rejected.

## Interaction and recovery

- Board Canvas, Kanban, List and Timeline are projections of the same projects. Filters combine search, campaign and status. Timeline navigates two-week periods, with expandable unscheduled work. Kanban communicates workflow status without offering unrestricted status dragging.
- One shared campaign dialog serves the board and briefing wizard. One project details inspector contains date editing, assignment, briefing, Brand Hub, files and version history. Secondary controls disappear while the design viewer is active.
- Date/property editing captures the database revision when the editor opens. A conflicting write leaves the user's input visible, refreshes current data and requires reopening the editor before retrying. Reopening resets fields to the latest saved values.
- Failed artwork registration retains the uploaded object for retry instead of uploading another file. Cancel removes an unregistered object; cleanup errors retain the dialog with recovery instructions. Trusted publication preparation also has a discard endpoint and delayed cleanup for abandoned objects.
- Project comments and publications use authorized realtime subscriptions. The publication broadcasts inserts and updates only; deletions cannot bypass row-level scope through realtime events. Query invalidation also refreshes board counts and notifications.
- Private image previews use short-lived signed URLs and bypass public image optimization caches. The viewer refreshes the URL and offers a retry when the preview fails. Previously downloaded files and unexpired signed capabilities cannot be retroactively erased by assignment revocation.
- Share links point to authenticated project routes. They preserve the destination through login and do not grant public access. Clipboard failure exposes selectable text in the shared dialog.

## Verification

The browser suites under `apps/web/tests/e2e` exercise real Auth, database commands and Storage. The production journey compares immutable published records and SHA-256 file hashes after an internal edit. Recovery tests inject failed HTTP writes and inspect final object/record counts. Canonical traversal reconciles all 25 projects across agency, ten clients and both designers, recording navigation timings and runtime errors.

Database tests separately verify forbidden payloads, parent integrity, locking, retries and concurrent transitions. The [acceptance matrix](acceptance-matrix.md) and evidence under `docs/verification` record which checks actually passed. Local production containers and a configured local mailbox are not a claim of public DNS/TLS deployment, paid billing or external SMTP delivery.

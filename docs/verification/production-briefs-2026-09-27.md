# Private production briefs — 2026-09-27

The agency now prepares separate production instructions for each design board. The designer
receives only what the agency explicitly sends; the original client request, contracted quantities
and original attachments are no longer accessible to designers. This supersedes the earlier
sanitized client-brief projection, including the designer reading in the prior context UX evidence.

## Implemented behavior

- Working files → Project details → Production → Prepare/Edit production brief.
- Editable internal title, service, overview, goals, direction/service answers, named deliverables,
  formats/dimensions, quantities, original/adaptation scope, named HTTPS references and deadline.
  The agency can explicitly copy client text into the editor as a starting point, then rewrite it.
  Attachments, requester identity and budget/source metadata are not copied.
- Save draft is agency-only. Send to designer releases a snapshot for that board, changes its
  internal deadline and creates one activity notification. Later drafts preserve the release.
- The designer's Briefing inspector and Briefings index show released instructions only. Existing
  boards without a release show a waiting state; no client brief was automatically copied/sent.
- The client's original request, project deadline and credit debit remain intact. More production
  concepts do not create contracted outputs, credit debits or client versions. Selection and copying
  to the client board remain manual in Miro; sending a production brief changes no workflow status.
- A save captures the revision when the editor opens, including across background refreshes.
  A stale save is refused without losing the edited text. Retries reuse the same request key.
- The editor uses the shared native dialog, persistent spaced actions and a mobile action layout.
  The text-only designer panel is keyboard-scrollable; switching to the client channel restores
  Overview instead of leaving an empty Production panel.

## Backend boundary

Forward migrations `202609280001_production_briefs.sql` and
`202609280002_production_brief_validation.sql` were applied with `supabase migration up --local`.
Draft/released tables have separate RLS; clients and other assigned designers receive no rows.
The RPC requires an agency session, locks the board/project, rejects delivered/stale edits,
validates payload size, dimensions, quantities, internal deadline and HTTPS reference links,
and stores idempotent request records privately. Released access follows current board assignment.

Original briefings, deliverables and attachment metadata/Storage reads are denied to designers.
`get_assigned_briefings` remains compatible but returns no rows. `visible_projects()` filters
current project access and masks the original copied description for designers. Direct/nested
`projects.description` reads are denied; narrow public project columns retain their RLS.
Agency/client list/detail reads use the projection and retain their authorized description.
Previously issued signed attachment URLs retain their existing expiry limitation.

## Executed checks

- `npm --prefix apps/web run check`: type generation/TypeScript, ESLint, Prettier and
  **132 files / 1,289 tests pass**. Includes draft/release rendering, stale-editor preservation,
  client-channel switching, private copy conversion and unsafe reference/quantity validation.
- `supabase test db supabase/tests/database/production_briefs.test.sql
  supabase/tests/database/production_integrity.test.sql supabase/tests/database/miro_workspace.test.sql
  supabase/tests/database/authorization_matrix.test.sql`: **4 files / 197 assertions pass**.
  Role denial, current assignment, stale edits, idempotent retries, private later drafts, deadline
  bounds, original scope preservation and one correctly addressed notification are checked.
- `supabase db lint --local`: no errors. The deliberately empty compatibility endpoint reports
  unused argument/output warnings; no other function warnings were returned.
- `python3 supabase/tests/http_auth_storage_test.py`: **9 tests pass** through real Auth/REST/Storage.
- Chromium: `production-brief.spec.ts` and the two named `workspace-actions.spec.ts` cases
  **project details detect…** and **one click selects…**: **3 workflows pass**. The production
  workflow was run again after the final action-spacing adjustment and passed.
- The real production journey creates a temporary accepted project/board, copies and rewrites
  client scope, requests three internal options, saves/reloads/edits/sends, logs in as its designer,
  follows the index link and rejects a direct original-brief URL. Client/other-designer API reads
  return no internal instructions; original client row/credit ledger remain equal before/after.
- Editor at **1512×900 and 390×844**, designer inspector at **1512×900, 390×844 and 320×740**:
  **5 scoped Axe scans**, all with zero violations; no document horizontal overflow. Desktop and
  mobile captures were visually inspected for alignment, hierarchy, scrolling and control spacing.
- `python3 supabase/scripts/backup_local.py --check-only`: **122 foreign-key relationships pass**.
  Final counts: **10 clients / 68 projects / 50 SABRE**, zero production draft/release fixtures.
  The original canonical seed assertions remain exactly **10 clients / 25 projects**.
- Documentation links, checkpoint/report line limits and `git diff --check` pass.

The expanded workspace run also reached the canonical board-count assertion expecting seven
seeded SABRE projects plus one fixture; it failed against the preserved 50-project demo overlay.
That assertion was not weakened. The two other workspace cases passed after updating their
project read contract and opening the existing Manage project disclosure before assignment actions.
The full canonical/browser matrix was not rerun. The legacy disposable-restore concurrency and
serial intake suites have compatible read expectations updated but were not executed in this task.

Miro requests were blocked in isolated browser checks. External Miro sign-in/editing/sharing,
external reference permissions and production deployment are not verified here. References use
named links; this change does not introduce a separate production-file upload system.
Working logs/captures are in ignored `outputs/production-brief-*`. No reset, push or deployment.

## Final inspected captures

- [Agency editor, desktop](screenshots/production-brief-2026-09-27-editor-desktop.png)
- [Agency editor, mobile](screenshots/production-brief-2026-09-27-editor-mobile.png)
- [Designer instructions, desktop](screenshots/production-brief-2026-09-27-designer-desktop.png)
- [Designer instructions, mobile](screenshots/production-brief-2026-09-27-designer-mobile.png)

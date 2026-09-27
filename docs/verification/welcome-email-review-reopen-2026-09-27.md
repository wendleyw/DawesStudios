# Welcome Email Journey — local review test

On 2026-09-27 the user requested returning SABRE's **Welcome Email Journey** to **In review**.
This is a local fixture adjustment, not a new application workflow or a canonical seed change.

- Project: `9034e683-06a3-4ff7-be90-e17085e1e92e`.
- Existing V1: `0e11121f-5114-4990-9f9e-ee9b46d7dbaa`.
- Observed before: project `delivered`; V1 review `approved`.
- Applied atomically: project `client_review`, `delivered_at = null`; V1 review `pending`,
  with feedback cleared and reviewer/timestamp unset so the client can decide again.
- Saved the former review and project in a private `project.reopened_for_local_test` audit event.
- Saved before/after snapshots in the ignored, mode-0600 file
  `supabase/.local/manual-adjustments/welcome-email-review-20260927T201808Z.json`.
  The original SABRE `state.json` checkpoint was not changed.

Verification executed in this session:

- Snapshot comparison passed: only the target project, its review and one new audit event changed.
  Existing versions, Miro links, comments, credits, assignments, delivery files and Storage inventory
  were preserved. Counts remain 10 clients / 68 projects / 50 SABRE projects.
- Authenticated agency/client API reads passed: project in review, the same V1 pending and its
  Miro link present. The project's one final file remains stored but is hidden and download-denied
  to the client while the project is reopened.
- The SABRE HTTP audit passed its first 41 checks and downloaded the visible files, then failed
  its final fixed expectation of 10 released delivery files. Reopening this delivered project
  intentionally leaves 9. The assertion was preserved; the full audit is not recorded as passing.
- A separate check matched every visible delivery ID to projects currently delivered and verified
  all 9 downloads, plus denial of the reopened project's file. This task's targeted gate passed.

Next action: refresh the local application and repeat the client review. Future overlay removal
must account for this adjustment and later testing; do not bypass the existing rollback guards.

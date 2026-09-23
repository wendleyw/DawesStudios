# Playground and board widgets verification

Date: 2026-09-23. Owner: Codex orchestrator. Status: implemented and verified for the requested feature.

## Delivered behavior

- All three roles have a persistent Playground above accessible client and project/design boards. Each client/project has separate agency, designer and client canvases, enforced by database and Storage policies.
- The canvas supports notes, image/document bundles, previews, downloads, pan/zoom, group selection, drag, resize and keyboard position/size editing. Closing preserves the underlying board. Opening from the design upload/edit dialog leaves that form mounted, including its selected file.
- Saves use stable item IDs and revision guards. Lost responses can be retried without duplicate items. Conflicting edits/removals preserve the local draft and offer explicit recovery. Refreshed canonical data supersedes committed local overlays, including remote deletion.
- Timeline and Kanban are independent widgets, both visible by default. Each viewer can show both, either or neither; preferences persist separately per viewer/client. Canvas and List use the same widget components.

Implementation and boundaries are described in the [feature specification](../architecture/playground-and-board-widgets.md), [Playground README](../../apps/web/features/playground/README.md), [board README](../../apps/web/features/board/README.md), and [project README](../../apps/web/features/projects/README.md).

## Current-session verification

All results here are from this feature task, distinct from the earlier Team/startup evidence. No reset, commit or public deployment was performed. The existing uncommitted work was preserved.

| Check | Actual result |
| --- | --- |
| `npm run check` | PASS: 558 tests / 45 files, route type generation, TypeScript and formatting. ESLint has zero errors and one pre-existing `board-canvas-controls.tsx` hook dependency warning. |
| `docker compose --env-file .env.production up -d --build --wait web` | PASS: production Next.js build and healthy rebuilt web container, final image configuration `6782abd0fb5002f695d7513f5277688e29c1c68943bf96c15d40dcce4ca79107`. |
| `npm run db:test` | PASS: 316 assertions / 15 files, including the real anonymous denied-call checks. |
| `supabase db lint --local --schema public,private` | PASS: no application schema errors. Unrestricted lint also reports existing pgTAP extension diagnostics; it is not an empty global report. |
| `python3 supabase/tests/playground_storage_http_test.py` | PASS: 6 tests with real PNG/text/PDF/DOCX bytes for all three roles, private reads/signing, concurrent conflict, overwrite refusal and cleanup recovery. Repeated after the cold restart: all 6 passed again, including anonymous denial. |
| `python3 supabase/tests/http_auth_storage_test.py` | PASS: 9 existing Auth/Storage boundary tests. |
| `npm --prefix apps/media test` | PASS: 34 tests / 2 files. |
| `npm --prefix apps/media run test:integration` | PASS: 15 checks; temporary resources removed and seeded design path restored. |
| `npm run test:e2e` | PASS: all 49 Chromium browser tests in one uninterrupted final run, 2.8 minutes, against the final rebuilt image. |
| Documentation and handoff audit | PASS: 278 relative file links across 15 affected documents resolve; `AGENTS.md` and `CLAUDE.md` are identical; `git diff --check` passes. The original matrix remains 110 Verified / 111, plus the eight separately verified feature checks. |

The [final backend report](../engineering/handoffs/2026-09-23-playground-backend-final.md) records exact results, extension-lint limitations, fixture isolation and cleanup. UI/model regressions cover concurrent deletion recovery, automatic query reconciliation, mobile reframing and preservation of unsaved edits. The [independent review](../engineering/handoffs/2026-09-23-playground-independent-review.md) records findings and their resolution separately from browser proof.

## Corrections driven by verification

- Controlled widget checkboxes needed synchronous pending state in their change event; the mutation observer's later notification caused clicks to briefly revert. Failed requests restore the confirmed layout and retry the same choice.
- A textarea inside its implicit label changed Playwright's exact label text after a saved value was rendered. An explicit label association keeps the field name independent of its content.
- Stale removals originally offered a futile retry instead of conflict recovery. They now allow loading the canonical item or abandoning the rejected removal. Automatic reads also supersede saved overlays after remote deletion while preserving unsaved drafts.
- Mobile resizing originally left the selected note outside the canvas. Real browser/store inspection showed controlled nodes could retain `nodesInitialized=false` despite explicit dimensions. Responsive framing now uses those dimensions and pan/zoom readiness directly; typed text does not trigger reframing.
- The same underlying measurement assumption affected the pre-existing project canvas: refetch recreated nodes with CSS sizes but no top-level xyflow dimensions. Trace evidence proved the final upload and asset reads succeeded while its node had `visibility:hidden`. Deliverable/version nodes now carry their already-computed width/height explicitly.
- The empty-artwork placeholder failed AA contrast because whole-element opacity diluted the text color. Removing that opacity restored contrast without changing the content or layout.
- Actual concurrent HTTP edits exposed PostgREST retrying SQLSTATE `40001`; business conflicts now use immediate `PT409`/HTTP 409. Anonymous denied calls also exposed the scoped local image defect documented in the operations runbook.

## Browser acceptance and visual audit

The new suites, `apps/web/tests/e2e/playground.spec.ts` and `board-widgets.spec.ts`, contribute 12 scenarios to the final 49-test run. They use guarded temporary client/project fixtures and clean their database and Storage resources. The full suite also passed the existing production, Team, intake, Brand, video, all-ten-workspace, console and accessibility flows. An earlier run was 47/49: its real hidden-project-node defect was fixed, and the mobile Escape test was corrected to await **All changes saved**, rather than treating a disabled Save button during an active request as completion. Both focused regressions passed before the final full run.

| Feature acceptance check | Evidence and result |
| --- | --- |
| 1. Three roles, client/project entry points, backend scope isolation | Three browser role journeys, 51 Playground database assertions and real three-role HTTP files. Cross-role/tenant, removed-member and revoked-assignment access are denied. PASS. |
| 2. Real bundles, previews, downloads and reload | Browser drops two PNGs and a text document, reopens/reloads, downloads the document through the UI and verifies bytes/private access. HTTP additionally exercises PDF/DOCX and all roles. PASS. |
| 3. Notes, geometry, removal, retry and conflicts | Browser mouse drag/resize, keyboard geometry, tombstones, interrupted file cleanup, lost-response replay, stale edit/removal recovery; unit coverage includes automatic remote deletion and retained unsaved drafts. PASS. |
| 4. Return to intact upload and finish production write | The same form retains title and selected PNG, then creates exactly one real design that remains visible on the project canvas. PASS. |
| 5. Independent saved widgets | Agency/client exercise both/either/neither plus reload; separate viewer/workspace choices and failed-save rollback/retry persist correctly. Database ownership/access policies add 27 assertions. PASS. |
| 6. Source, backend, real browser and visual checks | Gates above passed. Desktop/mobile screenshots were inspected; axe reports no violations on the new surfaces and page/dialog overflow stays within 1 px. PASS. |
| 7. Preserved baseline and maintained docs | Final baseline is 10 clients, 25 projects, 13 Auth users and 117 files. Zero temporary Playground boards/items/files or preferences remain. Documentation and shared checkpoint updated. PASS. |
| 8. Awake workstation during work | Existing `caffeinate` process and sleep assertions verified; permanent power settings unchanged. PASS. |

Manual inspection covered [Playground desktop](screenshots/playground-1600.png), [Playground mobile](screenshots/playground-390.png), agency and client widgets at [1600 px](screenshots/board-widgets-agency-1600.png) / [390 px](screenshots/board-widgets-client-390.png), the [seeded SABRE board](screenshots/design-board-canvas-1600.png), and [mobile project actions](screenshots/design-project-390.png). The selected note is now fully inside the mobile canvas; the automated visibility assertion requires more than 95% intersection. The mobile inspector successfully saves edited text and restores trigger focus on Escape. Widget scrolling stays inside each frame, header controls remain reachable, and typography, alignment and spacing remain consistent with the existing application. The canvas overview supports zoom; List keeps planning content at reading size on phones.

The [final baseline snapshot](playground-baseline-2026-09-23.json) confirms SABRE has seven projects and each of the other nine clients has two. Original Team changes, source references and studio configuration were preserved. No temporary diagnostic test remains.

## Runtime preservation

`python3 supabase/tests/startup_preservation_test.py exercise /tmp/dawes-playground-startup-original-20260923.json --output docs/operations/playground-startup-evidence.json` passed after the final schema and startup changes. Warm start, stop and cold start preserved all **35 public tables and 117 stored-file hashes**, including a deliberately noncanonical internal image. The original image was restored and the complete baseline rechecked. The fixture remained **10 clients / 25 projects**. See the separate [feature startup evidence](../operations/playground-startup-evidence.json); the older Team artifact was preserved.

The existing `caffeinate -ims -t 172800` process (PID 36758) remained active during the task. Permanent power settings were not changed.

## Operational limits

- Playground is role collaboration, separate from production assets and immutable client publication. It does not automatically publish brainstorm files.
- Open canvases refresh persisted changes every 60 seconds and on explicit refresh. Revision conflicts prevent silent overwrite; this feature does not claim live cursors or simultaneous text editing.
- Files are private, capped at 25 MiB, and restricted to the documented image/document MIME allowlist. Signed preview links last ten minutes; download links last one minute. Issued bearer links expire normally after access revocation.
- Deleted files are retried on reopen/refresh. Unclaimed uploads older than 24 hours are cleaned lazily when their uploader opens/refreshes the authorized board, up to 100 per query. There is no background global retention service.
- The local PostgreSQL image needs the narrowly scoped permission-error hint workaround in the [operations runbook](../operations/README.md#local-permission-error-compatibility). ACLs and RLS remain enforced.
- This feature's completion does not close the older whole-product J10 audit, video follow-ups, production hosting/TLS or outbound SMTP configuration.

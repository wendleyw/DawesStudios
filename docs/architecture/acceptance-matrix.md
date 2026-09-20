# Acceptance matrix

Status: **individual rows and the evidence ledger record verified scope and outstanding checks**. This file defines the evidence needed to finish the user's goal; its existence does not prove the application works. A requirement becomes Verified only after its actual implementation, representative data, and relevant checks have been inspected. Attach reproducible evidence before changing a status.

The goal is a clean, scalable Creative Canvas using xyflow and Docker-hosted Supabase, fully exercised with exactly **10 clients and 25 projects**, including comments, credits, production/review/delivery workflows, followed by a complete review of alignment, logic, spacing, minimalism, and duplication. The user requested agents that report to an orchestrator; integration and completion decisions belong to that orchestrator.

## How to use this matrix

The [711 reference captures](../ref/manifest.json), representing 499 base states, are an inventory and design reference. They are **not** a requirement to reproduce 711 screenshots, 499 UI states, identical modal counts, or a pixel-for-pixel prototype. The current product direction is minimal, lightweight, and modern. Consolidate duplicate views and controls while preserving meaningful tasks, role boundaries, and durable data.

For each row, record the implementation location and evidence artifact/command/result. Evidence must match the assertion: a build cannot prove permissions, a count query cannot prove twenty workflows, and one screenshot cannot prove responsiveness. If a legitimate simplification changes a reference interaction, explain how the final behavior preserves the user's task. Do not mark an omitted feature Verified by renaming it an adaptation.

| Evidence type | What it can prove |
|---|---|
| Domain test | Validation, state transitions, mapping and arithmetic when exercised with meaningful boundary inputs. |
| Database/API integration | Tenant authorization, persistence, transactions, idempotency, concurrency, file policies and actual query results. |
| Browser journey | Real authenticated person can perform the intended task through the UI and see durable results. |
| Visual/accessibility review | Rendered layout, hierarchy, focus/keyboard behavior, readability, spacing, overflow and intentional simplification. |
| Operational check | Repeatable Docker/backend/app startup, migrations, seed, health, restart, backups/restoration and environment configuration. |

## A. Orchestration, structure, and documentation

| ID | Requirement and expected result | Required evidence | Status |
|---|---|---|---|
| A01 | Working agents report scope, decisions, files changed, tests, blockers, and unresolved risks to the orchestrator; no competing architecture or duplicated ownership. | Current project agent guidance plus actual integration handoff. | Unverified |
| A02 | Domain modules separate identity, clients, briefings, production, publication/comments, brand, credits, and administration; shared primitives have real consumers. | Code/dependency review; no giant application controller or circular feature dependency. | Unverified |
| A03 | English UI, errors, test fixtures, code, artifacts and documentation; only direct chat uses pt-BR. | Review all new product text and representative rendered content. | Unverified |
| A04 | README/setup, architecture and operational documentation match actual paths, commands, environment and behavior; shared AGENTS.md/CLAUDE.md guidance matches. | Run documented commands; link/path check; instruction diff. | Unverified |
| A05 | Orchestrator combines specialist changes, verifies interfaces, resolves conflicting decisions, and records unresolved acceptance items honestly. | Integration diff/review and updated matrix evidence. | Unverified |

## B. Canonical ten-client, twenty-project scenario

This is the required repeatable acceptance dataset, not a claim that a seed currently exists. Use deterministic IDs and synthetic contact identities. Keep canonical seed IDs separate from ephemeral integration-test resources. Ten client names follow the existing reference; all new content is English.

| Client | Project service 1 | Project service 2 | Required scenario |
|---|---|---|---|
| Acme | `ai` | `blog` | Two distinct requests and project deliverables. |
| Harbor & Pine | `guidelines` | `specialty` | Document and non-dimensional/print scope. |
| Kestrel Outdoor | `production` | `direction` | Production resources and direction brief. |
| Northfield Bank | `deck` | `animated-ad` | Multi-slide/document and motion scope. |
| Otto & Sons | `static-ad` | `email-hero` | Multiple digital formats and reusable brand direction. |
| Pelagic | `email` | `gif` | Fluid email layout and duration-dependent questions. |
| Rune Fitness | `print` | `reel` | Print dimensions and video variations. |
| SABRE | `branding` | `social` | Complete brand data and a detailed multi-version review journey. |
| Sablefish Provisions | `web` | `whitepaper` | Desktop/mobile deliverables and long document content. |
| Vela Skincare | `youtube` | `other` | Long video and agency-defined custom quote. |

| ID | Requirement and expected result | Required evidence | Status |
|---|---|---|---|
| B01 | Canonical dataset has exactly 10 active clients and exactly 25 projects — two per client and seven for SABRE; every project belongs to the correct campaign/client/workspace. | `canonical-workspaces.spec.ts` opened all ten workspaces and twenty-five projects against their records with scoped navigation; direct count queries returned 10 clients, 25 projects and zero projects whose campaign parent disagrees with their client, and `verify_seed.py` matched the fixture manifest row for row afterwards. | Verified — 2026-09-20 web run on the 25-project dataset |
| B02 | All 20 service types occur across the 25 projects; their accepted briefings preserve actual service-specific answers and deliverables. | Join project/briefing/catalog records; inspect payloads rather than titles alone. | Verified — backend evidence ledger |
| B03 | Every project has an accepted briefing, confirmed quote, one project debit, valid deliverables and dates, realistic English direction, and meaningful scoped comments. | Relational assertions for every project, including debit uniqueness and channel ownership. | Verified — backend evidence ledger |
| B04 | All seven lifecycle states exist across the dataset: planned, in_progress, internal_review, client_review, changes_requested, approved, delivered. | Status distribution and corresponding version/review/delivery invariants. | Unverified |
| B05 | At least four projects exercise multiple deliverables, V1/V2 and multiple designs in one version; published projects reference immutable assets. | Stored graph assertions plus representative canvas/carousel browser checks. | Unverified |
| B06 | Both channels have representative project/design comments; pins, unread notifications, pending reviews, approved work and real delivery files exist. Every client can inspect meaningful activity. | Persisted record checks and per-role browser read-through. | Unverified |
| B07 | Every client has Brand Hub context and a reconcilable credit ledger; seed balances reflect opening allocations, project debits and any explicit additions. | All-client balance reconciliation; spot-check report/CSV against the ledger. | Unverified |
| B08 | Seed is repeatable and data survives browser reload and Docker/backend restart. Re-running the supported seed process does not duplicate projects, users or debits. | Two seed runs, reload/restart checks and count/hash comparison. | Unverified |
| B09 | Agency opens all 25 projects, each client opens its own, and designers open their assignments; unauthorized cross-client/assignment attempts fail. | Browser or API-driven table of all 25 results plus negative cases. | Verified — backend evidence ledger |
| B10 | Mutation tests operate in isolated fixtures or restore their changes; the final showcased dataset returns to exactly 10 clients and 25 projects. | Seven tables counted immediately before and after a full browser run on 2026-09-20, after SABRE took the reference package's own workspace: clients 10, projects 25, notifications 15, design_versions 41, designs 46, campaigns 12 and briefings 30, identical on both sides, with zero projects whose campaign parent disagrees with their client. The earlier count on the 20-project dataset (projects 20, notifications 12, design_versions 33, designs 38, campaigns 10, briefings 23, Auth users 13) is superseded, not contradicted: the same check on a different baseline. The earlier figures recorded here (notifications 11, design_versions 35, designs 41) were taken from a database that had accumulated rows across sessions, not from a documented reset; they never described a pristine seed. The numbers above are from `python3 supabase/scripts/local_stack.py reset --confirm-local-data-loss`, so a drift check now compares against a state that can actually be recreated. The earlier evidence counted clients and projects only, which is why `realtime_boundary_test.mjs` had been leaving two notifications per run undetected; its cleanup matched a marker the notification rows never carried. | Verified — 2026-09-20 before/after count on the 25-project dataset |

## C. Authentication and authorization

| ID | Requirement and expected result | Required evidence | Status |
|---|---|---|---|
| C01 | Authenticated sessions, sign-out and protected deep links work; unauthenticated requests cannot read private application data. | Real sign-in/out browser journey and unauthenticated API/storage requests. | Unverified |
| C02 | Client A cannot read or mutate Client B's clients, projects, briefs, assets, brand, credits, drafts, notifications or conversations by substituting IDs. | Direct API/database policy checks for every resource family. | Unverified |
| C03 | Client payloads never include designer identity/avatar/email/assignment, internal author IDs, unpublished data or internal-channel messages. | Inspect API responses, nested relations, browser network/cache, search, CSV and events. | Unverified |
| C04 | Assigned Designer A has only assigned project access; Designer B cannot access that project; revocation removes new access. | Direct read/write/subscription/file checks before and after reassignment. | Unverified |
| C05 | Designer cannot access client-channel comments, client credits, client contact details, client approval commands or administrative data. | Negative API/RLS checks and rendered navigation inspection. | Unverified |
| C06 | Role/author/client/channel fields in requests cannot elevate privileges or move a resource across tenant boundaries. | Forged payloads and invalid parent combinations; confirm no records changed. | Unverified |
| C07 | Private asset access follows project/publication scope; guessed object keys and stale authorization cannot expose internal or other-client files. | Real storage download/upload/signed-access tests, including metadata. | Unverified |
| C08 | Template drafts are owner-scoped even between users with the same client or agency role. | Two-user draft read/update tests; no accidental agency override. | Verified — backend evidence ledger |
| C09 | Realtime, search and notifications use the same scope rules as normal reads; counts/titles/events cannot leak hidden resources. | Two simultaneous scoped sessions and captured unauthorized subscription/search results. | Unverified |
| C10 | Agency administrative capabilities are enforced by backend commands; normal client/designer requests cannot edit roles, grants, workspace, clients or presets. | Direct mutation requests with low-privilege credentials. | Verified — backend evidence ledger |
| C11 | Within this single-studio installation, parent relationships cannot combine one client's campaign/briefing/project with another client's assets, deliverables, publications or pins. | Invalid cross-client parent-ID combinations against database constraints and API commands; no changed records. | Unverified |
| C12 | Client-facing text/files render safely and private secrets stay off the frontend; no demo role selector supplies production authority. | Injection cases, browser bundle/config inspection and authentication review. | Unverified |

## D. Shell, navigation, search, and board

| ID | Requirement and expected result | Required evidence | Status |
|---|---|---|---|
| D01 | Agency has studio overview, Client lands on its board, Designer has My work; allowed navigation differs consistently by role. | Three authenticated browser sessions and deep-link checks. | Unverified |
| D02 | Sidebar/client navigation, active states, collapse/expand and responsive navigation preserve selected context. | Keyboard and pointer navigation; reload/back/forward/context change. | Unverified |
| D03 | Global Search supports shortcut, scoped results, selected-result navigation, no results and safe error recovery. | Search known/unknown terms as all roles; keyboard journey. | Unverified |
| D04 | Notifications reflect actual recipient events and unread/read state, open authorized destinations, and survive reload. | Perform source mutation, inspect event, mark read, reload and recheck. | Unverified |
| D05 | Board uses xyflow for campaigns/projects, supports pan/select/zoom/fit and opens the right project without accidental drag/click conflicts. | Runtime component inspection and interaction/browser evidence. | Unverified |
| D06 | Timeline period navigation, Today, Kanban and List show consistent scoped projects; planning collapses without losing data. | Cross-view record/date/status comparison and interactive check. | Unverified |
| D07 | Search/status filters combine correctly, clear predictably, and show a useful no-results state. | Known fixture queries; clear filters and context-switch regression. | Unverified |
| D08 | Agency creates a campaign with validated name/dates and sees an empty campaign; client campaign creation works within briefing scope. | Persisted create journey and invalid dates/cross-client rejection. | Unverified |
| D09 | New project enters a real briefing flow; campaign context is explicitly confirmed, never inherited silently from a previous brief. | Create two briefs under different contexts and inspect stored campaigns. | Unverified |
| D10 | Kanban/status changes respect role and workflow prerequisites; moving cards cannot forge approval, publication or delivery. | Allowed and forbidden transitions via UI and direct command. | Unverified |

## E. Briefings and catalog

The [catalog](../ref/00-guia/CATALOGO-DE-SERVICOS.json) contains 20 `types` and 25 `formats`. Run the catalog assertions for every entry and all declared question options, not only the default Short Video / Reel path. A single declarative wizard should handle these combinations without twenty bespoke screens.

| ID | Requirement and expected result | Required evidence | Status |
|---|---|---|---|
| E01 | Type displays all 20 services with the correct estimate/timing or custom-estimate state and allowed formats. | U + Intake 1/4: all 20 service cards rendered; all service/format combinations submitted and read back; preset estimate change observed in the wizard. | Verified |
| E02 | All 25 formats preserve unit, fixed/fluid/non-dimensional behavior and valid dimension defaults. | U: all 25 formats exercise valid defaults and missing, zero, negative, and fractional dimensions; incompatible service/format rejection also covered. Intake 4 persists every allowed format. | Verified |
| E03 | Type → Details → Review, back/edit/change type and Save draft preserve the intended data; changed type reconciles incompatible fields clearly. | Intake 1: change service removes incompatible formats; save/reload/review retains scope; two browser editors reject a stale save while retaining unsaved text. | Verified |
| E04 | Campaign choose/search/no results/create flow requires explicit selection; title and campaign/client parent are validated. | Intake 1: blank campaign rejection, no-result search, explicit creation/selection, persisted title/client/campaign. DB suite covers invalid parent scope. | Verified |
| E05 | Format badges add/remove named deliverables; same-format variations, dimensions, positive quantity and Original/Adaptation scope persist. | Intake 1: add/remove formats, same-format named variation with quantity two and adaptation scope; saved payload, detail and exported breakdown inspected. | Verified |
| E06 | Overview, goals, optional detailed direction and all service-specific questions/options persist and appear in Review. | Intake 4: all 20 services submit through authenticated RPCs with every allowed format and service answer, then compare stored JSON. Intake 1 covers project direction and goals. | Verified |
| E07 | Brand defaults are from the selected client; explicit project overrides and restore-defaults work without editing canonical brand data. | Intake 1: client Brand Hub audience defaults, project override, restore-default action, submitted override, and unchanged canonical brand record. | Verified |
| E08 | Optional date/files work; unsupported/oversized attachments are rejected; remove/retry behavior is clear and actual files persist. | Intake 1: real PNG upload/download/remove/re-upload and reload; unsupported file rejected. U covers empty/oversized/type mismatch; DB storage policies independently enforce constraints. | Verified |
| E09 | Submitting creates an awaiting-review record and notification with no project/debit; duplicate submission does not duplicate the request. | Intake 1/4: free authenticated submissions and no project/debit. Concurrency suite: eight submission attempts produce one effect and one notification. | Verified |
| E10 | Agency confirms an integer credit total with required explanation; client sees quote/status but cannot accept as agency. | Intake 1: required adjustment explanation, integer quote, client quote/accept denial, confirmed scope and accepted project link. | Verified |
| E11 | Acceptance creates one project and one debit atomically; insufficient balance makes no partial project or charge. | Intake 1 + DB suite: 101-credit quote against balance 100 creates no project/debit; valid acceptance creates one project and nine-credit debit. | Verified |
| E12 | Concurrent/repeated acceptance has exactly one successful effect and preserves original accepted scope. | Concurrency suite: eight initial acceptance requests return one project/debit. Intake 1 repeats acceptance concurrently and confirms unchanged balance and unique records. | Verified |
| E13 | Briefing All/Draft/Awaiting review/In progress filters and draft/accepted detail links reflect persisted state. | Intake 4: 22 all, 20 awaiting review, one draft and one accepted record; draft resume and accepted project navigation checked. | Verified |

## F. Project canvas, conversation, review, and delivery

| ID | Requirement and expected result | Required evidence | Status |
|---|---|---|---|
| F01 | Project uses xyflow, groups deliverables by format with ordered versions/designs, and filters correctly. | Multi-deliverable/V1/V2 fixture rendering and node/record comparison. | Unverified |
| F02 | Selecting a version/design opens its canvas reviewer; carousel stays in that version; Back restores the overview. | Two-version/two-design browser journey and stable selected IDs. | Unverified |
| F03 | Properties, briefing, brand, deliverables, files and activity are reachable without duplicated competing controls; fields obey role visibility. | Three-role inspector review and persisted allowed changes. | Unverified |
| F04 | Assignment and dates save durably; assignment is absent from client payloads and read-only to designers. | Persist/reload and direct negative mutation/read checks. | Unverified |
| F05 | Agency/assigned designer upload a real design and create a new version with notes; previous versions and file content remain intact. | File and version records before/after, reload, immutable content comparison. | Unverified |
| F06 | Agency can switch client/internal channels; Client and Designer see only their channel; each scoped draft is restored or cleared appropriately. | Three concurrent sessions, unsent drafts, design/channel switches and response inspection. | Unverified |
| F07 | General project and design-specific comments save with authenticated authors and arrive in the correct channel after reload/realtime update. | Send/read/reload in each authorized role; forged author/channel rejection. | Unverified |
| F08 | Pins support place/cancel/send/select; selected pin highlights its comment; normalized positions remain aligned during pan/zoom/resize. | Boundary-coordinate domain tests and visual browser checks at multiple zooms. | Unverified |
| F09 | Comment/pin scope includes project, version/publication, design and channel; navigation and carousel never show another design's pins. | Multi-design/version/channel fixture assertions and interactive regression. | Unverified |
| F10 | Designer submits internally to agency; the event does not publish to Client or expose the internal message. | Submission records, Client session before/after and scoped notification checks. | Unverified |
| F11 | Only Agency publishes an immutable sanitized snapshot for client review; internal editing after publication leaves published data/bytes unchanged. | Publish, hash/snapshot, mutate internal design, compare client view and asset hashes. | Unverified |
| F12 | Not-shared-yet state shows useful project context but no internal designs; later publication appears after refresh/event. | Client session before/after first publication. | Unverified |
| F13 | Client approves or requests changes on the exact published revision; request includes feedback and goes to agency; repeated/stale decisions are controlled. | Real review journey plus concurrent/replay/stale-publication integration cases. | Unverified |
| F14 | Agency communicates requested changes internally, creates/publishes V2, and retains V1 comments/review history. | Full cross-role revision journey and immutable V1 comparison. | Unverified |
| F15 | Waiting/Approved review views show the correct pending/approved/delivered records and links for the role. | Review-list checks across seeded states and after a decision. | Unverified |
| F16 | Agency delivers approved work with real authorized files; Client can download it; premature/repeated/unauthorized delivery cannot corrupt state. | Download content verification and transition/idempotency checks. | Unverified |
| F17 | Share/Copy link resolves to an authorized client project context; clipboard-denied fallback works; link does not grant unintended public access. | Copied-link open as authorized/unauthorized person and clipboard fallback. | Unverified |

## G. Brand Hub and assets

Use a consistent shell and shared detail/editor primitives. Distinct data capabilities below do not require separate bespoke component trees or a fixed number of modal screenshots.

| ID | Requirement and expected result | Required evidence | Status |
|---|---|---|---|
| G01 | All ten Brand Hub sections are reachable with client-correct content; Agency edits persist; Client/Designer canonical edits are denied. | Three-role section traversal and direct read/write tests. | Unverified |
| G02 | Overview identity/audience/tone/rules, reference guidelines and brand defaults feed the briefing correctly. | Save/reload/briefing reuse journey and client isolation. | Unverified |
| G03 | Logos supports meaningful variants, SVG/PNG/PDF availability and usage details; selected downloads/reference files actually exist. | `brand-canvas-final.spec.ts` confirms SVG, PNG and PDF records for the client, reads the logo usage and approved-variations guidance, follows the library link, and downloads the PNG and PDF, asserting real bytes by PNG signature and `%PDF-` header. All ten clients hold the three variants. | Verified — 2026-09-20 web run |
| G04 | Colors supports valid HEX/RGB data and copy HEX/RGB/CSS/Tailwind; invalid edits are rejected. | Conversion/validation checks and real clipboard/fallback behavior. | Unverified |
| G05 | Typography shows hierarchy and custom sample text, supports font source reference, and saves allowed edits. | Rendered sample, link validation and persistence check. | Unverified |
| G06 | Visual Style offers reference detail and clear use/avoid direction; authorized edits persist. | Browser read/edit/reload journey. | Unverified |
| G07 | Product Library supports multiple products and Assets/Specs/Rules without cross-product mixups. | Read at least three distinct products and compare tab data. | Unverified |
| G08 | Brand Assets search/categories/clear filters/details/copy reference work; Agency can add a resource with valid category/format/use guidance. | `brand-canvas-final.spec.ts` exercises search, category filter, the no-results state, Clear filters, the detail dialog and a copied reference that reopens the asset on reload. `brand-accessibility.spec.ts` uploads a real agency asset and downloads its bytes; `brand-guidance.spec.ts` covers client/designer write rejection. | Verified — 2026-09-20 web run |
| G09 | Template categories expose the seven reference template types through a shared editor; create/edit/resume personal drafts supports name/headline/body/CTA/preview/zoom. | Table-driven coverage of seven template definitions plus browser persistence journey. | Unverified |
| G10 | Template drafts do not create projects, reviews, publications or credit entries; another user cannot read them; missing draft has useful recovery. | Before/after record counts, two-user API test and missing-link browser check. | Unverified |
| G11 | Copy & Messaging preserves reusable blocks, terminology and rules; copy/edit/save behavior works and respects scope. | Save/read/copy representative blocks and role checks. | Unverified |
| G12 | AI Brand Instructions produces current client context with Use/Never rules and manual-copy fallback; it does not pretend to invoke an unconfigured AI provider. | Context content comparison, clipboard failure and network inspection. | Unverified |
| G13 | Project Assets All/Approved library reflects actual files and current role scope; Agency/assigned Designer upload correctly; Client receives published assets only. | Upload and cross-role library/file access checks. | Unverified |
| G14 | Unsupported preview formats use clear download/reference behavior; failed/abandoned uploads are not advertised as completed designs. | Real file-type and interrupted-upload cases. | Unverified |

## H. Credits and administration

| ID | Requirement and expected result | Required evidence | Status |
|---|---|---|---|
| H01 | Balance, used credits and activity reconcile to immutable ledger entries for all ten clients. | Seed evidence reconciles every client ledger/account; Intake 1 compares displayed and persisted balances after acceptance, request fulfillment, and adjustment. | Verified |
| H02 | Activity search/type, report period/campaign/project filters, empty state and deliverable breakdown use the correct records and quote explanation. | U + Intake 1: combined project/campaign/period/activity filters, no-results search, restored activity, quote reason and deliverable detail. | Verified |
| H03 | CSV exports the selected authorized report with all reference columns, accurate rows, escaped text and spreadsheet formula protection. | U + Intake 1: real filtered download has nine report columns and one selected project row, quote explanation, deliverable breakdown and exact debit; U covers escaping and formula injection. | Verified |
| H04 | Plan details and 25/50/100 credit choices communicate actual behavior; client request does not self-grant balance. | Intake 1: real 25-credit request persists pending with unchanged balance; declared 25/50/100 packages and no-payment copy match the authorized request contract. | Verified |
| H05 | Authorized allocation/fulfillment posts one positive entry with reason/reference; duplicate fulfillment has no additional effect and client forgery is denied. | Intake 1 + concurrency suite: agency fulfillment and same-key allocation each have one ledger effect; replay returns the original result; client fulfillment forgery and conflicting adjustment payload fail. | Verified |
| H06 | Concurrent acceptance/allocation cannot overdraw or lose ledger updates; corrections preserve history with compensating entries. | Concurrency suite: competing full-balance acceptances, eight fulfillments, eight same-key allocations, compensating correction, and simultaneous acceptance/allocation all reconcile without lost updates. | Verified |
| H07 | Workspace name/timezone settings save and affect relevant date presentation; invalid values fail clearly. | Intake 2: name/timezone persist; notification timestamp changes from 6:30 PM UTC to 2:30 PM New York; invalid timezone fails without overwriting the saved value. | Verified |
| H08 | Team invitation creates a real scoped invitation; local mail capture or configured delivery is inspectable; expiry/replay/role escalation are rejected. | Intake 3: local SMTP invitation, scoped acceptance, replay rejection, sender/origin denial and failed existing-account email revocation. Authorization SQL adds expired/wrong-email/fabricated token and unchanged-role assertions. | Verified |
| H09 | New client validation and creation persist, initialize an account and empty brand workspace, and show a useful empty board. | Intake 6: invalid client slug rejected; valid client/industry and 25-credit opening allocation persist; empty board opens and reloads; isolated client is removed afterward. | Verified |
| H10 | Presets reflect actual catalog/default behavior; changes do not silently alter accepted project scope or quotes. | Intake 2: preset revision changes the new-wizard estimate; accepted quote remains nine credits; client preset mutation denied and original defaults restored. | Verified |
| H11 | Account/help actions are accurate; preview/reset controls, if present, are confined to their documented safe purpose. | Intake 3 verifies profile update, recovery email, password change and subsequent login. Help dialog and production preview/reset exposure still need the orchestrator's final read-only walkthrough. | Unverified |

## Intake and administration evidence

Evidence for sections E and H was executed on 2026-09-20. These scoped results do not replace the final production-container, complete-suite, and canonical-dataset checks owned by the orchestrator.

- **U:** 85 focused tests passed across the [briefing model](../../apps/web/features/briefings/briefing-model.test.ts), attachment policy, credit report model, and account validation: `npm run test -- features/briefings/briefing-model.test.ts features/briefings/briefing-attachments.test.ts features/credits/credit-model.test.ts features/settings/settings-model.test.ts` from `apps/web`.
- **Intake 1–6:** [Authenticated browser suite](../../apps/web/tests/e2e/intake-admin.spec.ts), six tests passed in 16.1 seconds: `npm run test:e2e -- tests/e2e/intake-admin.spec.ts --output /tmp/dawes-intake-results`. Cases run against real Auth, PostgreSQL, Storage, and local SMTP. Their order is intake/credits; workspace/presets; invitation/recovery; all-service submissions/filters; designer-safe direction; client creation. The two-editor conflict and rendered timezone checks are included. Example captures: [briefing review](../verification/screenshots/intake-briefing-review.png), [credits](../verification/screenshots/intake-credit-report.png), [account](../verification/screenshots/intake-account-settings.png), [designer briefing](../verification/screenshots/intake-designer-briefing.png).
- **DB suite:** backend agent reported 116 passing assertions across the existing database tests, plus 13 passing [authorization assertions](../../supabase/tests/database/authorization_matrix.test.sql) for expired/wrong-email tokens, role boundaries, client creation, and owner-isolated drafts. `supabase db lint --local` was clean. The final combined rerun after fixture reset remains an operational gate.
- **Concurrency suite:** backend agent executed [real simultaneous HTTP workflows](../../supabase/tests/concurrent_workflows_test.py) against disposable fixtures. Evidence includes initial acceptance, submit retries, overdraft competition, credit fulfillment/allocation races, compensating correction, and atomic draft revision conflicts. The backend uses HTTP 409 for an old draft revision so the API returns the conflict immediately.
- **Seed evidence:** [verified canonical dataset](../operations/seed-evidence.json) records all-client ledger reconciliation, 10 clients/25 projects, all 20 services/25 formats, and 116 real file downloads. It was regenerated on 2026-09-20 after SABRE took the reference package's own workspace, and it passed again unchanged after the full browser suite.

Intentional adaptations preserve the task: campaign creation is one shared goal/date dialog used by Board and Briefings; credit fulfillment retries return the original allocation instead of duplicating it; new clients start with an editable empty brand workspace; report dates remain explicitly UTC while notification timestamps follow the saved studio timezone. The safe designer briefing RPC excludes author and budget fields. An interrupted process can require guarded cleanup of its acceptance fixtures; the normal suite cleanup and final count check are both required.

## I. Reliability and production preparation

| ID | Requirement and expected result | Required evidence | Status |
|---|---|---|---|
| I01 | Documented Docker Supabase stack and app start reproducibly with validated environment values, migrations and health checks. | Clean documented startup and service health output. | Unverified |
| I02 | Production app build, type/lint checks, relevant domain/integration/browser tests all pass; no runtime console errors in exercised journeys. | Actual command results and browser logs. | Unverified |
| I03 | Persisted data and uploaded files survive restart; a documented backup/restore procedure is exercised on isolated data. | Restart and isolated restoration evidence with record/file comparison. | Verified — backend evidence ledger |
| I04 | Loading, empty, offline/transport failure, permission loss and unavailable-resource states are distinct and offer correct recovery. | Network interruption, missing ID, revoked membership and retry browser cases. | Unverified |
| I05 | Forms/comments/uploads handle pending state and failed writes without false success or duplicate actions; recoverable input is retained. | Interrupted/delayed/error requests, retry and final database inspection. | Unverified |
| I06 | Slow/conflicting edits cannot silently overwrite newer data; multi-record workflows preserve transactional consistency. | Concurrent draft/property update and workflow rollback cases. | Unverified |
| I07 | The twenty-project dataset remains responsive in board, search, reviewer and reports; context changes do not leak stale records or drafts. | Browser performance trace and repeated role/client navigation on the canonical dataset. | Unverified |
| I08 | Operational configuration distinguishes test fixtures/simulated fulfillment/local invitation mail from actual production services. No missing production dependency is claimed as complete. | Environment/runbook review and real configured-service checks where applicable. | Verified — backend evidence ledger |

## J. Final alignment, logic, spacing, minimalism, and duplication review

Run this review after functional/security issues are fixed, then rerun affected functional tests for any resulting changes. Inspect representative full pages, long content, empty/error states and the most complex project across all three roles. Use the [brand asset](../../brand/brianna-dawes-studios.webp) and [design system](design-system.md) as current visual guidance.

| ID | Requirement and expected result | Required evidence | Status |
|---|---|---|---|
| J01 | Shell/page/canvas/inspector alignment follows consistent grid and spacing; no overlapping controls or accidental horizontal overflow. | Rendered review at 1600 × 1000, smaller desktop, tablet and mobile widths. | Unverified |
| J02 | Heading, field, table, card and modal spacing is consistent; long names/comments/briefs wrap or truncate intentionally without hiding essential content. | Long-data screenshots and interactive inspection. | Unverified |
| J03 | Product is minimal and modern: one clear primary action per task, concise English copy, restrained hierarchy and no decorative dashboard clutter. | Final comparative design review with intentional adaptations documented. | Unverified |
| J04 | Logic and terminology agree across board, project, brief, review, brand and credits; status/count/balance/date labels reflect the same records. | Cross-screen reconciliation after real mutations. | Unverified |
| J05 | Duplicate UI actions, redundant sections, duplicate data adapters and repeated business rules are consolidated without removing useful actions. | UI walkthrough plus code/dependency review. | Unverified |
| J06 | Keyboard, visible focus, dialog focus return, labels, contrast, accessible controls and reduced-motion behavior support real task completion. | Automated accessibility check plus keyboard-only core journey. | Unverified |
| J07 | Canvas pan/zoom, design pins and comments remain visually aligned and usable when sidebar/inspector resize or viewport changes. | `brand-canvas-final.spec.ts` measures a persisted pin against its stored normalized coordinate after zoom in, zoom out, sidebar collapse/expand and fit view at 1600, 1024, 768 and 390 px, requiring under 0.5 % drift, and selects its comment at each width. | Verified — 2026-09-20 web run |
| J08 | Branding renders sharply with correct proportions; typography/colors/spacing tokens are reused consistently and no unapproved decorative assets appear. | Asset/render review and token usage inspection. | Unverified |
| J09 | Empty/error/confirmation/loading surfaces follow the same component language and avoid duplicate toast/dialog noise. | State sampler and comparison across domains. | Unverified |
| J10 | Final dataset has 10 clients/25 projects and no open failed requirement; release statement lists actual verification and any real operational limitation. | Final matrix audit, count reconciliation and orchestrator sign-off. | Unverified |

## Reference inventory and intentional adaptations

Deployment scope is one agency/studio with isolated client workspaces. A multi-agency SaaS tenancy layer was not requested and is not an acceptance requirement. Earlier wording about a second studio tenant has been corrected to test the actual required cross-client isolation and parent integrity. This clarification does not waive any client or designer access boundary.

| Reference area | Source | Product capability coverage | Intentional adaptation |
|---|---|---|---|
| Role separation | [Permissions guide](../ref/00-guia/PERFIS-E-PERMISSOES.md) | C01–C12; all role-specific actions | Backend identity, policies and safe projections replace local role filters. |
| Global surfaces | [Agency home](../ref/01-agencia/01-home-e-globais/README.md), [Client home](../ref/02-cliente/01-home-e-globais/README.md), [Designer home](../ref/03-designer/01-home-e-globais/README.md) | D01–D04, H11 | One shared shell with authorized navigation; remove wireframe marketing and duplicate controls. |
| Boards | [Board](../ref/01-agencia/02-board/README.md), [Other clients](../ref/01-agencia/10-outros-clientes/README.md) | B01–B10, D05–D10 | Shared xyflow/data model across clients; consolidate equivalent filtered/scroll states. |
| Project/reviewer | [Agency](../ref/01-agencia/03-projeto/README.md), [Client](../ref/02-cliente/03-projeto/README.md), [Designer](../ref/03-designer/03-projeto/README.md) | F01–F17 | Shared reviewer and coherent inspector; real persistence/files; safe workflow transitions. |
| Briefings | [Flow guide](../ref/00-guia/MAPA-DE-FLUXOS.md), [Catalog](../ref/00-guia/CATALOGO-DE-SERVICOS.json) | E01–E13 | Declarative wizard; service-specific data through shared fields; no repeated introductory chrome. |
| Asset library | [Assets](../ref/01-agencia/05-assets/README.md) | G13–G14 | Real private files and supported previews replace placeholder upload toasts. |
| Reviews | [Reviews](../ref/01-agencia/06-reviews/README.md) | F10–F16 | Distinguish agency readiness from client approval; avoid forged client decisions. |
| Brand Hub | [Brand flow](../ref/00-guia/MAPA-DE-FLUXOS.md) and ten section READMEs under each role | G01–G12 | Keep ten information capabilities; reuse detail/editor patterns and consolidate repeated views. |
| Credits | [Credits](../ref/01-agencia/08-creditos/README.md), [CSV](../ref/01-agencia/08-creditos/exemplo-exportacao.csv) | E10–E12, H01–H06 | Real ledger and authorized requests/allocations replace client self-granted preview credits. |
| Administration | [Settings](../ref/01-agencia/09-configuracoes/README.md) | H07–H11 | Actual persisted changes/invitations; safe development-only reset. |
| Unavailable states | [State catalog](../ref/TELAS.md) | I04–I06, J09 | Persistent drafts replace session expiry; genuine missing/revoked resources retain recovery behavior. |
| Visual system | [Captured viewport](../ref/00-guia/CAPTURA.json), [Brand](../../brand/brianna-dawes-studios.webp) | J01–J10 | Minimal modern product; representative responsive review rather than exact capture replication. |

## Evidence ledger

Partial implementation evidence is recorded below. The requirement rows remain Unverified until the full assertion, including authenticated integration/browser behavior where required, has supporting evidence.

| Requirement IDs | Implementation location | Verification command/artifact | Result and date | Remaining issue |
|---|---|---|---|---|
| E01–E07, G14, H02–H03 (partial) | `apps/web/features/briefings`, `apps/web/features/credits` | `npm run test -- features/briefings/briefing-model.test.ts features/briefings/briefing-attachments.test.ts features/credits/credit-model.test.ts features/settings/settings-model.test.ts` from `apps/web` | 85 focused tests passed on 2026-09-20; catalog/validation/attachment policy/filter/CSV/account behavior | Unit checks are complemented by the scoped Intake/DB evidence above; final integrated production verification remains required. |
| A02–A04, I02 (partial) | Briefing/credit features and routes | `npm run typecheck`; targeted ESLint for both features and route directories | Typecheck and targeted lint passed on 2026-09-20 | Full integrated build and visual/functional acceptance remain with the orchestrator. |

Do not consider this goal complete while any current requirement is Unverified, failed, only indirectly supported, or missing the data needed to exercise it. A deliberate scope change must come from the user or be recorded as a task-preserving implementation adaptation; successful narrow tests cannot erase broader requirements.

## Backend acceptance handoff — 2026-09-20

The source local stack was reset through the documented lifecycle command after all mutation journeys stopped. The complete [backend run](../operations/backend-evidence.json) passed: 133 PostgreSQL assertions, clean SQL lint, nine real Auth/Storage tests, four simultaneous Realtime subscriptions, seven media behavior tests, 15 real media HTTP checks, no known production dependency advisories, and the final all-client [seed verification](../operations/seed-evidence.json). The source finishes with exactly 10 clients and 25 projects. The backend run quoted above predates the SABRE dataset change of 2026-09-20 and has not been repeated against it; the seed verification in that list has. The browser suite has: it passes 25 of 25 against the current dataset, after the media origin allowlist, the identifier validation and the delivery target defect described in [the handoff](../engineering/handoff.md) were fixed — the `production-workflow.spec.ts` failure previously recorded here as environmental. [Concurrency evidence](../operations/concurrency-evidence.json) is from the separate disposable backend and does not change the showcased dataset.

| IDs | Backend evidence and actual result | Scope remaining for integrated acceptance |
| --- | --- | --- |
| B01–B03 | `verify_seed.py` reconciles exact canonical IDs/two projects per client, accepted briefing/client/campaign parents, all 20 service-specific question payloads, confirmed quotes, date order, one debit per project and all-client ledger sums. Every project now has a scoped client conversation; production examples also have internal comments. | B01 UI list reconciliation belongs to the final browser suite. B02/B03 data requirements are verified. |
| B04–B06 | All seven stored statuses exist; four projects have multiple deliverables with V1/V2, multiple-design versions, distinct publication IDs, pinned client feedback, pending/approved/change-requested reviews and a real delivered PDF. The final scenario includes 59 verified file downloads, including four private-working/clean-publication pairs. | Representative multi-deliverable canvas/carousel and per-role rendered activity checks belong to the final browser suite. |
| B07 | Ten client Brand Hubs, 30 product records, 70 templates, 50 real brand files and exact ledger reconciliation. | Report/CSV-to-ledger browser evidence is owned by the credits feature. |
| B08 | The disposable stack was reset and provisioned repeatedly; the supported source lifecycle reset then passed final canonical assertions. The isolated restore drill verified Auth, records and actual file bytes after container restart. | Browser reload and final application-container restart evidence remains with the orchestrator. |
| B09 | The all-client verifier signs in all ten clients and both designers plus agency; exact project sets match memberships/assignments. Foreign project queries, unauthorized production reads and assignment revocation are denied in HTTP/SQL tests. | Verified through the explicitly permitted API-driven path. |
| B10 | Concurrent mutations are hard-restricted to the disposable port-55521 stack. Source integration tests clean their temporary objects/accounts/comments; final source seed verification reports exact 10/20. | Superseded by the eight-table before/after count in section B: counting only clients and projects hid a realtime-test cleanup filter that never matched the rows it created. Count the tables a suite writes, not the two the requirement names. |
| C01 | Real password sign-in resolves protected roles; anonymous REST/RPC requests are rejected. | Browser sign-out/protected deep-link results are owned by the web journey. |
| C02, C06, C11 | SQL/HTTP test role spoofing, cross-client queries for every resource family, representative forbidden writes, invalid campaign parents, project/published-design pin parents, scoped asset metadata and privileged-command denial. Database grants and composite constraints preserve parent integrity independently of UI filtering. | Cross-resource UI cache/navigation inspection complements the backend checks. |
| C03, C05 | Wildcard client API reads contain no assignments/internal designs/internal comments/designer UUIDs; published content is allowlisted. Designers cannot select raw budget-bearing briefings, credit ledger or client comments; assigned brief projection omits costs and authors. Real raster/PDF output excludes source metadata. | Browser network/cache, CSV, search and rendered-navigation review remain with the relevant web owners. |
| C04, C07 | SQL assignment revocation removes project/design/brief access; real Storage tests deny client internal downloads/signing and foreign delivery access. Ten client sessions download only authorized branded/publication/delivery fixtures. | Final assignment/file/subscription browser journey supplies the integrated revocation behavior. |
| C08 | `authorization_matrix.test.sql` adds a second same-client member within a rollback transaction and proves that neither that member nor agency can read another person's personal draft; unauthorized update changes zero rows. | Verified. |
| C09 | Four real authenticated subscriptions receive exactly their allowed internal/client INSERTs; foreign client receives no events. DELETE/TRUNCATE events are disabled at publication configuration because deleted-row events lack equivalent SELECT RLS. Foreign-recipient notification queries return no rows. | Search/navigation behavior is verified by the web suite. |
| C10 | Direct low-role workspace, preset, invitation, credit and client-creation commands fail. Signup metadata cannot set agency role. Expired, wrong-email and fabricated invitation tokens reject without changing the profile. | Verified backend administrative boundary; actual mail/recovery journeys are recorded by identity administration. |
| C12 | The trusted worker accepts caller JWTs and checks real Auth/protected profile; credentials remain in ignored server-only environment files. Structured content has no raw HTML execution path and client byte metadata is regenerated. | Frontend bundle/config/injection review is owned by the orchestrator. |
| I01 | Documented `local_stack.py reset --confirm-local-data-loss` completed migrations, Auth/file provisioning and health checks. The hardened Docker media image passed actual PNG/PDF/Auth/Storage integration on port55431. | Final root web/Compose health evidence completes the app-container assertion. This local CLI stack is not a public self-hosted production deployment. |
| I03 | [Restore evidence](../operations/restore-evidence.json) proves a separate initialized stack restored database/Auth/Storage, matched original 10/20 counts, authenticated agency/client, retained client RLS and downloaded the real PDF with matching SHA-256. GNU tar preserves required Storage xattrs. | Verified backup/restore and backend persistence; app restart evidence is separate. |
| I06 | Concurrent HTTP tests prove one-effect acceptance, overdraft rollback, serialized allocations/fulfillment, immutable conflicting review handling and delivery/publication exclusion. Atomic draft revision RPC returns one save and one immediate409 for competing editors; project timestamps reject stale updates. | Backend transaction/edit checks verified; the two-editor browser journey is recorded by the briefing owner. |
| I08 | [Operations runbook](../operations/README.md) separates CLI fixtures/captured email/credit allocation from the required production Docker deployment, TLS, SMTP, secrets, persistent storage, backups and monitoring. No external deployment/payment/video-sanitization capability is claimed. | Verified operational scope and documented remaining deployment values. |

The final integrated matrix should combine this ledger with the web owners' browser, visual and application-container evidence; backend-only results do not prove visual or interactive assertions.

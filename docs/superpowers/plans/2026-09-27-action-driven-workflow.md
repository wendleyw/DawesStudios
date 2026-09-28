# Action-driven workflow implementation plan

State: planned; no runtime work in this planning task. Baseline: `cb9f767`.
[Design and accepted decisions](../specs/2026-09-27-action-driven-workflow-design.md).
Owner: primary Codex orchestrator, following [agent orchestration](../../engineering/agent-orchestration.md).
The phases below are dependency-ordered work packages, not independent deployments.

## Current baseline and verified gaps

| Area | Current implementation | Required change |
| --- | --- | --- |
| Acceptance | `accept_briefing` omits status; table default is Planned | Explicit In progress; preserve one project/debit under retries |
| Production brief | Private draft/released content, per-board send and activity | Add authoritative work requests and revision handoffs |
| Submission | `send_board_round` writes project internal_review | Change only its board obligation; preserve public review/approval |
| Publication | One project-level V and at most one source round | Explicit multiple source attribution/completion; no ready gate |
| Designer action | Latest round draft/missing; Home also uses project feedback | Derive both from current released work request |
| Feedback response | Remains open until a newer publication | Persist successful agency handoff receipt |
| Pause / closed direction | No corresponding persisted workflow controls | Separate project/board activity with server enforcement |
| Action bars | Client bottom bar; designer/agency primary actions in header | One contextual bottom action bar per workspace |

Source anchors: [review bar](../../../apps/web/features/projects/miro-view.tsx),
[header actions](../../../apps/web/features/projects/miro-workspace-bar.tsx),
[project data](../../../apps/web/features/projects/project-data.ts),
[production editor](../../../apps/web/features/projects/production-brief-editor.tsx),
[review inference](../../../apps/web/features/reviews/review-data.ts),
[acceptance](../../../supabase/migrations/202609270006_monthly_credits_single_count.sql),
[submission](../../../supabase/migrations/202609260013_miro_workspace_polish.sql),
[publication](../../../supabase/migrations/202609270007_retire_versions_schema.sql),
[action view](../../../supabase/migrations/202609270020_action_board_labels.sql), and
[production brief release](../../../supabase/migrations/202609280001_production_briefs.sql).

## Ownership and boundaries

- Orchestrator owns schema/API decisions, integration, `supabase/database.types.ts`, shared docs,
  `AGENTS.md`/`CLAUDE.md`, checkpoint, final audit and explicit-path commits. Preserve `D login.png`.
- Backend implementation owns new migrations and colocated database/HTTP tests; it reports API
  contracts before frontend work depends on them. No production database reset or down migration.
- Frontend project implementation owns `features/projects/` and its unit tests, using the existing
  `project-data.ts` for database calls. New candidate files: `project-workflow.ts`,
  `project-workflow-bar.tsx`, and `project-action-handoff.tsx`, with colocated tests.
- Queue/surface integration follows the same state contract in `features/workspace/`, `overview/`,
  `reviews/`, `board/` and `assets/`. Database calls remain in each feature's `*-data.ts`.
- Keep workflow UI inside projects; do not promote it to shared solely because roles differ.
  Project-specific CSS stays in `projects.css`; existing genuinely shared primitive styles stay shared.
- When delegating, use the bounded project agents, disjoint owned paths, a unique <=30-line report,
  and at most three active agents. Independent review does not authorize release.

## Phase 1 — Database contracts and safe migration

- [ ] Produce a read-only inventory of project phases, latest reviews, board rounds, actual released
  production briefs, current source constraints and direct grants. Identify ambiguous legacy rows.
- [ ] Add project/board activity, work-request history/current-request uniqueness, expected workflow
  revisions, private handoff receipts and multi-round publication sources as defined by the design.
- [ ] Write forward backfill/constraints preserving IDs, sources, billing and all real data. Never
  auto-release client scope or manufacture historical instruction content/notifications.
- [ ] Make project status public-only: normalize legacy internal review correctly, add a guard against
  future internal project states, and extend role-safe reads/filters/Realtime coverage.
- [ ] Define a single authorized workflow projection for current requests, labels and eligible actions.
  Keep private source links out of designer-readable request rows and every client response.
- [ ] Generate database types and prepare client read adapters together. Do not apply an enforcement
  migration to a running application whose callers still require the retired contract.
- [ ] Sequence additive expansion, reader/RPC/form adaptation, then coordinated backfill/enforcement.
  Apply forward changes with `supabase migration up --local`; finish by probing old/new endpoints,
  schema-cache refresh and regenerated types. No permissive compatibility path survives cutover.

Evidence: schema/permission tests, conflict inventory and reconciliation, before/after ID/count/FK
checks, unchanged delivered artifacts and unchanged credit ledger; no new activity from backfill.

## Phase 2 — Atomic workflow commands

- [ ] Acceptance explicitly creates In progress; retain balance locks, 12-month choice and retry safety.
- [ ] Integrate production-brief release with initial/revision/reactivation requests; preserve private
  drafts and stale-editor text. Releasing instructions alone does not create a client version.
- [ ] Add agency handoff with board decisions (continue / close / omitted unchanged), expected board
  revisions, per-board directions, private source review identity and one idempotent batch receipt.
  Require a continued board with valid instructions; empty/close-only sends do not resolve feedback.
  Standalone closure remains independent; agency self-handled feedback resolves on the next publication.
- [ ] Update submission to require the correct current request and active board/project, and never
  mutate public phase. Preserve round/frame validation and independent R numbers.
- [ ] Update publication to accept explicit source rounds, preserve previous source associations,
  close only included current submissions, increment V once, and notify clients once per recipient.
- [ ] Guard latest-version decisions/delivery and explicit replacement of a pending/approved V;
  stale tabs cannot approve an old V or deliver after a newer unapproved publication.
  Publication checks the expected latest V ID and review decision/revision. A new client decision
  invalidates an open replacement confirmation, preserves its draft and requires fresh confirmation.
- [ ] Add guarded metadata+activity save and explicit board closure/reactivation. Closed boards keep
  authorized read history; reactivation requires fresh released work. Backlog suspends advancement.
- [ ] Make reassignment close the old request atomically and require a fresh release to the new
  assignment generation. Preserve agency history, prevent automatic task/instruction transfer, and
  scope designer reads of requests/rounds/releases to their current assignment generation.
- [ ] Apply consistent locks and replay/authorization checks to every old/new entry point. Review
  current board-first locking and direct update grants; no legacy signature may bypass a guard.

Evidence: SQL role tests, direct HTTP negative tests, payload-conflict retries and parallel requests.
Use target-owned fixtures with cleanup. Do not run the legacy `concurrent_workflows_test.py` as proof:
it targets the older fixed restore clone and still calls removed version functions. Add a current
Miro workflow concurrency suite with explicit local target validation and fixture ownership.

## Phase 3 — Contextual buttons and forms

- [ ] Build one contextual bottom bar reusing the client's current appearance, named board/version
  and accessible controls. Remove duplicate send/share controls from the Miro header.
- [ ] Agency Working files: Send to designer for initial instructions; Request changes / Share with
  client for submitted rounds. No Mark ready, Ready for client, or internal Approve button.
- [ ] Designer: Send to studio for open own work; waiting state after submission; closed/backlog
  explanation when unavailable. No separate Start work step.
- [ ] Agency Shared with client: publish presentation, handle feedback, prepare delivery. Opening
  publication preparation does not publish; the explicit confirmation uses the client Miro link.
- [ ] Agency handoff form: show board/designer identity, separate instructions, explicit continue or
  no-further-work choice. Summarize recipients/closures before sending; omission never closes a board.
- [ ] Client: preserve Request changes / Approve and required-feedback confirmation, current-V guards
  and accessible failure states. No internal identity or stage appears in the DOM or fetched data.
- [ ] Edit project: Active / Backlog and Save details; reject Delivered-to-Backlog. Edit board exposes
  reactivation in a secondary context, preserving instructions/history and requiring a fresh send.
- [ ] Files: Prepare delivery is navigation; Delivery file is preparation; Complete delivery is the
  guarded terminal action. Keep real-file and latest-approval requirements.
- [ ] Use returned current capabilities for display; preserve form drafts on stale/failed mutations,
  retry the same payload with its key, and invalidate affected caches after confirmed changes.

Evidence: colocated component tests plus real agency/designer/client browser journeys. Inspect
320/390px mobile and 1512/1600px desktop, keyboard focus, long labels, bottom-toolbar spacing,
responsive overflow and Axe findings. Save working screenshots in ignored `outputs/` only.

## Phase 4 — Queues, notifications and all project views

- [ ] Replace action-notification predicates with the authoritative work request/handoff state.
  Designer revision tasks, agency handoff completion and direction closure must agree with Home.
- [ ] Keep Activity separate: read/unread never resolves work; retries, refresh and resume never
  duplicate old events. Release/close notifications contain only the recipient's authorized context.
- [ ] Rework review/overview logic that derives designer turns from the global project phase.
  One board's activity cannot re-label another designer's work or historical versions.
- [ ] Apply Backlog activity filtering consistently to Home, Board/List/Canvas/Kanban/Timeline/Calendar,
  Reviews and action counts. Keep paused projects discoverable and history available.
- [ ] Preserve current state on page reload, deep links, role switch, realtime reconnect and poll
  fallback. Invalidate work requests, boards, production briefs, public projects, reviews and queues.
- [ ] Verify clients never see Studio review in labels, available filters, counts or network payloads.

Evidence: cross-surface browser assertions and API assertions; action disappearance/reappearance
under pause, role removal, reassignment and closure. Workflow email through Resend is a separate
implementation; this scope uses existing in-app event delivery.

## Phase 5 — Integrated acceptance and documentation

- [ ] Run the matrix below; investigate failures instead of weakening expectations.
- [ ] Update feature READMEs and architecture domain/backend/permissions/design-system/workflow/action
  docs to the implemented contract. Update both root instruction files if guidance changes.
- [ ] Record actual commands/counts, runtime checks, captures and remaining environment limitations.
  Retire the pending labels only after the corresponding behavior is verified.
- [ ] Run the full web gate and relevant database/HTTP/browser suites; inspect the diff, maintain a
  <=100-line checkpoint, and make Conventional Commits containing only task-owned files.
- [ ] Keep production release separate: no push/deployment; external Miro permissions, SMTP,
  DNS/TLS, recovery and hosted CI remain their existing release gates.

## Acceptance matrix for this change

| ID | Scenario | Required evidence |
| --- | --- | --- |
| W01 | Accept briefing repeatedly/concurrently | One In progress project, one debit, no duplicate start event |
| W02 | Draft instructions then send | Draft invisible; send releases once and creates only that designer's task |
| W03 | A and B work independently | A submits/receives revisions without changing B or the client's pending V |
| W04 | Internal revision before any V | R increases only on submission; client stays In progress; no V/debit created |
| W05 | V1 changes → curated handoff → V2 | V1 decision retained; agency task clears after handoff; correct designer task; V2 pending |
| W06 | Continue A, close B | A receives work, B receives closure and no task/send; history retained; client sees no selection |
| W07 | Send only to A, omit B | B remains unchanged; omitted and explicitly closed produce different results |
| W08 | Reactivate B | Agency releases fresh instructions; old requests/rounds remain historical |
| W09 | Multi-round publication / retained material | One V; only included current requests complete; old round references cannot close newer work |
| W10 | Backlog at production/review/changes/approval | Preserved state, blocked API advances, hidden active tasks, resume restores current obligations |
| W11 | Client review already pending | Internal submissions/closures cannot change public In review; only explicit publication/review can |
| W12 | Approval, replacement and delivery | Latest approval + real files required; replacement invalidates delivery eligibility, not old history |
| W13 | Role and transport isolation | Wrong client/designer/removed user, direct/nested REST, RPC and Realtime deny private data/actions |
| W14 | Race and stale editor | Pause/send, close/submit, reassign/handoff, review/publish and publish/deliver leave no partial state; changed review invalidates replacement confirmation |
| W15 | Interrupted response and retry | Same request returns same receipt/IDs; changed payload conflicts; no duplicate notification/debit |
| W16 | Persistence and visual behavior | Reload, role switch, deep link, keyboard/mobile, no duplicate bars, queue/Home agreement |
| W17 | Existing data and baselines | Actual migrations preserve live10/68/50 and FK integrity; canonical checks stay10/25 |
| W18 | Reassign open/submitted work | Old task closes, new owner awaits fresh release; old/new designer REST/RPC/Realtime history boundaries hold |
| W19 | Empty handoff / agency handles feedback | Empty/close-only send refuses with no side effects; direct agency V2 resolves feedback without designer tasks/events |

## Verification commands and target rules

These are future implementation checks, not claims executed by this planning task:

```bash
supabase migration up --local
npm run check
supabase test db
python3 supabase/tests/http_auth_storage_test.py
python3 supabase/scripts/backup_local.py --check-only
npm --prefix apps/web run test:e2e -- --project=chromium tests/e2e/production-brief.spec.ts tests/e2e/miro-workspace.spec.ts tests/e2e/action-notifications.spec.ts
```

Add `supabase/tests/database/project_workflow.test.sql`,
`supabase/tests/project_workflow_concurrency_test.py`, and
`apps/web/tests/e2e/project-workflow.spec.ts` for W01–W19. These files do not exist yet; add their
specific commands when implemented. Add pause/closure assertions to existing authorization and
delivery suites rather than claiming browser coverage proves server enforcement.

`http_auth_storage_test.py` validates the existing local API55421 target. New mutation fixtures must
name/clean only their own records and never consume the user's Gmail invitation. Preserve the older
restore clone and the stopped canonical staging dataset; do not provision/reseed either to make a
test pass. Canonical-count tests need the separately controlled canonical environment, not the SABRE
overlay. Evidence from one environment does not satisfy the other, and no reset is authorized here.

## First implementation slice

Begin with Phase 1's read-only migration inventory and the W01/W03/W11 invariants, then deliver the
smallest integrated backend+reader change that starts accepted work In progress and stops internal
submissions from overwriting public review. Add request/handoff semantics before enabling the new
revision/closure buttons. No UI control should ship before its authoritative command and tests.

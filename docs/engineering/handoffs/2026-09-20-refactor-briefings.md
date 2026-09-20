# Refactor the briefings feature onto the data-access contract (Task 11)

- Updated at: 2026-09-20T19:35:00-03:00
- Reporting agent and tool: Task 11 delegated worker / Claude Code (Claude Opus 5, 1M context)
- State: implemented and tested; verified by type check, lint, format, unit tests, and the required `intake-admin` Playwright spec against the live dev server on port 3003
- Objective: relocate the 14 measured inline Supabase call sites in `apps/web/features/briefings/` (8 in `briefing-attachments.tsx`, 4 in `briefing-detail.tsx`, 2 in `briefing-editor.tsx`) onto the data-access contract, add unit tests for the extracted functions, adopt the shared primitives where locally duplicated, report (not edit) the `globals.css` boundary, split the oversized `briefing-editor.tsx`, and remove dead code — all without changing behavior, with particular care for the budget-acceptance path
- Owned paths: `apps/web/features/briefings/`, `.superpowers/sdd/2026-09-20-repository-structural-refactor/task-11-report.md`, and this report
- Dependencies: `docs/architecture/data-access.md`; the `features/credits`, `features/board`, `features/brand` and `features/projects` exemplars (`project-data.test.ts`'s stubbed-Proxy pattern specifically)
- Acceptance criteria: `npm run check` passes with no test file modified (`briefing-model.test.ts`, `briefing-attachments.test.ts` untouched); `grep -rn '\.from(\|\.rpc(\|\.storage\.' apps/web/features/briefings --include='*.tsx' | grep -v 'Array\.from('` returns no output; each relocated query/RPC/storage call keeps its table/bucket, columns, filters, argument object and error handling; each extracted write has a unit test naming its exact table/bucket/procedure and argument object plus a database-error-surfacing case; `intake-admin` passes unmodified
- Commit: `8e604b77e9eb6d1212b4985bb5474de457c5ca73` (relocation, tests, split, README), followed by `e3952f1d72173eeb6cd84334277b9cee32a11265` (prettier-formatting-only fix to the README) — both on `refactor/repository-structure`

## Completed work and changed files

All 14 measured call sites are relocated. `grep -rn '\.from(\|\.rpc(\|\.storage\.' apps/web/features/briefings --include='*.tsx' | grep -v 'Array\.from('` now returns no output.

| File | Change |
| --- | --- |
| `apps/web/features/briefings/briefing-data.ts` (76 → 283 lines) | Added `useBriefingProject`, `useBriefingCreditBalance`, `useBriefingAttachments` (read hooks); `confirmBriefingBudget`, `acceptBriefing`, `saveBriefingRevision`, `submitBriefing`, `uploadBriefingAttachmentFile`, `addBriefingAttachment`, `removeBriefingAttachmentFile`, `removeBriefingAttachment` (writes); `findBriefingAttachmentByPath`, `downloadBriefingAttachmentFile` (reads that cannot be hooks) |
| `apps/web/features/briefings/briefing-data.test.ts` (new, 264 lines) | 21 unit tests: exact table/bucket/procedure, exact argument object, database-error-message surfacing per write, and the raw-result (non-throwing) behavior of `findBriefingAttachmentByPath` |
| `apps/web/features/briefings/briefing-attachments.tsx` (182 → 160 lines) | 8 call sites removed |
| `apps/web/features/briefings/briefing-detail.tsx` (275 → 249 lines) | 4 call sites removed |
| `apps/web/features/briefings/briefing-editor.tsx` (658 → 100 lines) | 2 call sites removed; now holds only `BriefingEditorPage` (data gating) |
| `apps/web/features/briefings/briefing-editor-form.tsx` (new, 288 lines) | `BriefingEditor`, the three-step form and its `save` mutation |
| `apps/web/features/briefings/briefing-editor-details.tsx` (new, 342 lines) | `BriefingEditorDetails`, the "Details" step's four form sections |
| `apps/web/features/briefings/README.md` | Documents the migration, three recorded deviations, the clean CSS-boundary finding, and the executed verification |

Untouched, as instructed: `briefing-model.ts` and `briefing-model.test.ts` (the safety net),
`briefing-attachments.test.ts` (the other safety net — still passes unmodified), `briefing-summary.tsx`,
`briefings-page.tsx`, `briefings.css`, `service-catalog.json`, `app/globals.css`, and the two
`docs/superpowers/` files belonging to the concurrent session. Full 14-row call-site table with
source/destination/confirmation is in `.superpowers/sdd/2026-09-20-repository-structural-refactor/task-11-report.md`.

## Decisions and interface changes

- **Budget-acceptance path preserved exactly.** `confirmBriefingBudget` (`confirm_briefing_budget`)
  and `acceptBriefing` (`accept_briefing`) — the two backend calls behind budget confirmation and
  acceptance — were relocated with their exact RPC name and argument object. Neither carried an
  idempotency-key argument before this move, nor gained one; the atomic
  project-creation-plus-credit-debit transaction, insufficient-balance rejection and idempotency
  under a repeated accept all remain entirely inside `accept_briefing` on the backend. The
  `intake-admin` spec's first test exercises this path end to end and passed unmodified.
- **Two reads that cannot be hooks** (contract rule 2): `findBriefingAttachmentByPath` — called from
  the upload mutation's catch branch, to decide whether a retried upload's row already committed —
  and `downloadBriefingAttachmentFile` — called from the download mutation, which exists only to
  trigger a browser save. `findBriefingAttachmentByPath` is a further, documented deviation from even
  that shape: it returns the raw `{data, error}` instead of throwing via `assertResult`, because the
  calling code inspects `.error`/`.data` directly and silently falls through to rethrow the
  *original* upload error rather than the select's — a pre-existing branch this relocation preserves
  rather than "corrects." Recorded above the functions in `briefing-data.ts` and in the feature
  `README.md`.
- **`useBriefingCreditBalance` shares another feature's cache key and carries no `enabled` gate** —
  exactly how `BudgetReview` issued this query before the move. This is a pre-existing quirk
  (narrower `select` sharing a `credit-account` cache key with `features/credits`'s wider one),
  preserved rather than fixed, flagged in both reports as a latent-risk follow-up candidate.
- **No `briefingQueryKeys` / `useInvalidateBriefings()` helper added.** Before this task, the
  feature's mutations already invalidated different, deliberately scoped key sets (attachment
  upload/remove: only `briefing-attachments`; confirm-budget: only `briefings`; save/submit:
  `briefings` + `notifications`; accept: `briefings` + `projects` + `credit-account` +
  `credit-ledger` + `notifications`). Consolidating into one helper invalidated uniformly, as
  `credits`/`projects` do, would make every mutation refresh caches it doesn't refresh today — a
  behavior change out of scope for this pass. Each `invalidateQueries` call stays inline in its
  component, unchanged. No consumer outside `features/briefings/` is affected either way.
- **File split by responsibility, not line count.** `briefing-editor.tsx` (658 lines, the largest
  component in the repository per the brief) is now three files, each under 350 lines:
  `briefing-editor.tsx` (page/data-gating wrapper), `briefing-editor-form.tsx` (the stepper + save
  mutation), `briefing-editor-details.tsx` (the Details step's markup, by far the largest single
  step). The two route files that import `BriefingEditorPage` from `briefing-editor.tsx` needed no
  change.
- **Shared primitives:** `FormError`/`PageStatus` were already adopted at every matching call site
  before this task. Three sites intentionally still don't use a primitive (a `role="alert"` list
  container `FormError` can't express; a pre-existing `form-error` paragraph that lacks
  `role="alert"`, which converting would add — an accessibility-attribute change the mandate
  forbids; and inline `role="status"` texts that aren't full-page loads, where `PageStatus` would add
  an unwanted `page-content` wrapper). None were changed; all three are named in both reports.
- **CSS boundary: none remaining.** Every `briefing-*` class lives only in `briefings.css`; the one
  shared class the feature's markup uses (`status-badge`) is defined in `globals.css` and consumed by
  five other features, confirmed by grep. `globals.css` was not edited.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npm run typecheck` | `apps/web`, this session | Pass | Terminal output, this session |
| `./node_modules/.bin/eslint features/briefings 'app/(workspace)/clients/[clientId]/briefings'` | `apps/web`, this session | 0 errors, 0 warnings | Terminal output, this session |
| `npm run format:check` | `apps/web`, this session | Pass (after a follow-up commit fixed one README formatting issue) | Terminal output, this session |
| `grep -rn '\.from(\|\.rpc(\|\.storage\.' features/briefings --include='*.tsx' \| grep -v 'Array\.from('` | `apps/web`, this session | No output | Terminal output, this session |
| `npm run check` | `apps/web`, this session | 21 test files / 358 tests pass (was 20/337 before this task); 2 pre-existing lint warnings in `features/board`, unrelated | Terminal output, this session |
| `npm --prefix apps/web run test:e2e -- intake-admin` | Live dev server on port 3003, this session | **6 passed (15.5s)** — full output in the task-11 report | Terminal output, this session; full text also in `.superpowers/sdd/2026-09-20-repository-structural-refactor/task-11-report.md` |

Dev server and Docker were not touched, per instructions. The Playwright run regenerated four
screenshots under `docs/verification/screenshots/`; left uncommitted/unmodified as instructed.

## Remaining risks and next action

- **Risk, pre-existing, not introduced here:** `useBriefingCreditBalance` and `features/credits`'s
  `useCreditAccount` write to the same `["credit-account", userId, clientId]` cache key with
  different `select` columns. No property either consumer currently reads is lost today, but the
  overlap is fragile and worth a dedicated follow-up if the orchestrator wants it addressed —
  intentionally not fixed in this behavior-preserving pass.
- **Not addressed, not required by this task:** the per-mutation invalidation-key differences
  described above (decision 4). Unifying them is a deliberate behavior change and should be its own
  scoped task with its own review.
- **Next required action:** none outstanding for Task 11 — `npm run check` and the required
  `intake-admin` suite both pass on `e3952f1d72173eeb6cd84334277b9cee32a11265`. Ready for the
  orchestrator's wave-2 checkpoint / next feature assignment.

## Ownership at handoff

All paths under `apps/web/features/briefings/` are released back to the orchestrator; no background
process or watcher was left running by this task (the dev server on port 3003 was already running
before this task started and was left as-is, not started or owned by this task). No other writer is
active in this feature's paths. Recipient: the orchestrator running the repository structural
refactor, for wave-2 continuation.

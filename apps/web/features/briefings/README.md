# Briefings

The listing, detail and directly opened editor use the shared floating client navigation/profile
and a full-width white title/action card on the plain page background. Listing filters sit inside that
card. Detail shows the briefing title once; its summary keeps a screen-reader heading for the
Deliverables and Creative direction hierarchy. The direct editor has a back link and one New/Edit
briefing heading; intercepted modals retain their compact dialog layout. Editor review scrolling
targets the editor within the shell's main scrolling region.

This feature implements the client/agency service request flow against the caller's authenticated Supabase session. Designers can read only accepted briefings for their assigned projects through the safe `get_assigned_briefings` projection; raw briefing records and financial fields remain unavailable.

- `service-catalog.json` contains the 20 service types and 25 formats copied from the reference catalog, with English product data and no prototype implementation dependency.
- `briefing-model.ts` defines draft validation, catalog helpers, a validated JSON decoder, brand defaults, and the typed briefing RPC payload. New drafts have no implicit campaign.
- `briefing-data.ts` owns every Supabase read and write for the feature, as [the data-access contract](../../../../docs/architecture/data-access.md) requires: `use<Thing>()` hooks for briefings, campaigns, brand context, service presets, the project linked from an accepted briefing, a briefing's requester (`useBriefingRequester`), the agency's credit-balance read and a briefing's attachments; plain `async (database, input)` functions for every write (`confirmBriefingBudget`, `acceptBriefing`, `saveBriefingRevision`, `submitBriefing`, `setBriefingRequester`, the attachment upload/register/remove/download calls); and the two reads that cannot be hooks because they run inside a mutation (`findBriefingAttachmentByPath`, `downloadBriefingAttachmentFile`). It uses a separate validated designer decoder for the safe assigned projection.
- `briefings-page.tsx` lists drafts, pending reviews and accepted briefs, one line per briefing: title, campaign, requester, service and deliverable count, status and due date. The status column has a fixed width so the columns align across rows; below 1000 px the requester, service and date columns drop, and below 700 px the campaign moves under the title. `briefing-editor.tsx` resolves the client, draft, campaigns, brand defaults and service catalog, then hands off to `briefing-editor-form.tsx`'s `BriefingEditor`, which runs the Service/Details/Review steps and the save mutation; the Details step's markup is `briefing-editor-details.tsx`'s `BriefingEditorDetails`, split out because it was the largest single piece of what had been the largest component in the repository. `briefing-detail.tsx` exposes agency budget confirmation and atomic acceptance through backend RPCs. Every tab orders briefings by due date, latest first, with undated ones last (`byDueDate` in `briefing-model.ts`).
- `briefing-attachments.tsx` uploads real private PNG/JPG/WebP/PDF files, enforces a 50 MiB client-side limit, registers them with the backend, and supports authorized download/removal. A draft must be saved before files can be attached. Backend policies independently enforce access and file constraints. The database additionally caps a briefing at 50 deliverables, 20 attachments, a 65536-byte `direction`, a 200-character title and 10,000-character overview/goals/budget note, and a client at 100 draft briefings — backstops normal use never approaches; see [the backend architecture](../../../../docs/architecture/backend.md#briefing-attachments-and-credit-requests).
- `briefing-summary.tsx` renders the saved scope without exposing internal project assignments. Creative direction is a description list whose terms are the editor's own field labels (**Overview**, **Goals**, the direction fields and the service's questions), so no value appears without its name.

Routes live under `app/(workspace)/clients/[clientId]/briefings/`. Feature styles are local to `briefings.css`, and it holds no selector this feature owns alone that has leaked into `app/globals.css` — every `briefing-*` class is defined only in `briefings.css`, and the one shared class this feature's markup uses (`status-badge`) is defined in `globals.css` and consumed by five other features, not just this one. Shared dialogs use the common Modal component; `FormError` and `PageStatus` are used at every loading- and error-state call site that matches their shape (see the deviations below for the few that do not). Authoritative state is stored in Supabase and read through TanStack Query. Form state contains only the in-progress draft; it does not grant permissions or create credits locally.

## Guided form

The Service step keeps all 20 services in one searchable catalog with a category filter, compact descriptions and estimate/timing labels. The selected service remains visible above the results when a filter hides its card. Save draft appears after a service is selected; sending the request remains free.

Details starts with the project title and an explicit campaign choice or creation. Campaign search is secondary and expands on demand. Creative direction and the service questions precede formats, so clients describe their request before specifying production details. Brand Hub defaults are explained and optional overrides stay collapsed. Each deliverable shows its standard size, name, quantity and plain-language Design approach choices. Size settings expand for custom/modified dimensions; standard preset sizes remain populated while collapsed. These labels still save the existing original/adaptation values.

Incomplete submission focuses a visible validation summary instead of leaving errors above the scroll position. Editing clears that obsolete summary; the next review validates the complete draft again. Unsaved requests show a Save draft to add files action beside the attachment explanation. The same validation, draft revision, attachment and billing rules apply to the modal and the direct page. See the [current UI verification](../../../../docs/verification/board-header-and-briefing-2026-09-23.md).

## New briefing modal

In-app links to `/clients/:clientId/briefings/new` use the workspace `@modal` interception route.
`new-briefing-modal.tsx` renders the existing editor in the shared accessible dialog, leaving the
underlying page and board view mounted. Direct visits and reloads still render the full editor page.
Draft saves remain inside the modal so attachments and editing can continue; successful submission
shows a confirmation and Done returns to the previous page. Close/Escape/backdrop ask before
discarding unsaved edits and refuse closure during saving or attachment writes. Browser history
navigation retains native routing behavior; it is not an unsaved-draft guard.

The same service, campaign, validation, revision and backend permission rules apply to both
presentations. New campaign opens its existing dialog. The modal hides duplicate page chrome,
contains its scrolling, and adapts to narrow screens. The editor reports dirty/busy state to its
dialog through props; no second form store or data-access layer is introduced.

The modal uses the shared dialog's `xl` size (up to 1200 px) so a client sees most of each step
without scrolling. The client's name, the Service / Details / Review steps and Save draft share
one header row. From 1100 px wide the Service step puts its question beside the search and shows
four compact columns of services (three from 721 px); Details places the project's story (Project
basics, then Tell us what you have in mind) beside what it needs (What do you need?, then Timing &
files); Review puts the summary beside the files and estimate. The `.briefing-form-column` and
`.briefing-review-side` groups carry that split and are `display: contents` everywhere else, so the
full-page editor and narrow screens keep their single column and the reading order never changes.

Saving an incomplete draft is allowed after choosing a service. Submission requires a campaign, title, overview, at least one valid deliverable and the service-specific answers. Fixed formats require width/height, fluid formats width, and non-dimensional formats neither. Named variations preserve their own quantity and Original/Adaptation scope. Estimates apply to the service and are not multiplied by format badges. Current service presets override only the estimate and delivery timing, while questions and formats remain canonical. Saving stores the preset revision; accepted project quotes are not recalculated. Optional RPC arguments are omitted when empty, using the SQL function's nullable defaults to clear optional draft fields. The editor calls `save_briefing_revision`, captures the loaded revision with its local draft, and receives the saved ID/revision atomically. A second editor with an older revision receives a conflict; its unsaved text is preserved. Background query refreshes do not advance that local revision.

The agency confirms an integer project budget. An adjustment or custom service requires a note in the interface. Acceptance calls the backend transaction; the interface does not create a project or ledger entry separately. Backend rejection of insufficient balance and repeated acceptance is surfaced directly. Budget acceptance is two backend calls, both relocated verbatim into `briefing-data.ts`: `confirmBriefingBudget` (`confirm_briefing_budget`) records the approved figure and its note, and `acceptBriefing` (`accept_briefing`) performs the atomic project-creation-plus-credit-debit transaction, rejects insufficient balance and stays idempotent under a repeat call — all enforced inside that one procedure, not by anything either function or its caller adds. Neither call carried an idempotency-key argument before this move, and neither gained one.

The agency's "Project budget" panel (`BudgetReview` in `briefing-detail.tsx`) shows one primary action at a time instead of both buttons at once. While the briefing is not `budget_confirmed`, or while the form has unsaved edits (its credits/note differ from the confirmed values), only "Confirm budget" appears. Once it is `budget_confirmed` and unedited, "Confirm budget" hides and only "Accept & create project" appears, with the existing balance messaging and "View credits" link. Editing any field brings "Confirm budget" back immediately, since visibility is derived from the same `unconfirmedEdit` comparison that already drove the unsaved-changes note and the Accept button's disabled state; no copy, disabled/pending logic or accessibility semantics changed, only which button renders.

`accept_briefing` inserts the new project's `start_date` explicitly as the workspace's local calendar day (`workspace_settings.timezone`, defaulting to UTC), clamped down to `due_date` when the due date has already passed. This replaces relying on the `start_date` column's `current_date` default, which is evaluated in the database session's UTC timezone: from the studio's evening onward that default was already tomorrow while a same-day `due_date` was still today, and a past-due briefing could never be accepted at all, both because `start_date` could end up later than `due_date` (`project_dates_valid`, `supabase/migrations/202609200015_designer_brief_and_project_integrity.sql`). See `supabase/migrations/202609230013_studio_local_acceptance_dates.sql` and `supabase/tests/database/briefing_acceptance_dates.test.sql`.

## Requested by

Every briefing records who asked for it in `requested_by`. A client person's first save names them
and later saves by anyone at the client keep it; a client person cannot name someone else. When the
studio files a briefing, Details asks **Requested by** among the client's active people
(`useClientPeople`), opening on the briefing's own requester while they are still at the client, or
on the client's only person (`initialRequester`). With two or more people the choice is required
(`requesterErrors`), and `save_briefing` applies the same rule whatever the interface sends; with
exactly one it records that person, and with nobody the briefing keeps no requester until the first
client person saves it. The list, the briefing page and the project's details read "Requested by
<name>"; someone who has left reads "<name> (left)" to the studio and "Former member" to the client
(`personName` in `features/team/client-people.ts`). The studio changes the requester from the
briefing page (`setBriefingRequester` → `set_briefing_requester`, which does not touch `updated_at`,
so a client's open draft never sees a conflict). Designers read neither.

## Deviations from the data-access contract

Four call sites in this feature do not follow the contract's usual shape, each for a reason recorded here and, more briefly, above the code itself.

- **`useBriefingCreditBalance` shares another feature's cache key and carries no `enabled` gate.** It reads `credit_accounts.balance` under the `credit-account` query key that `features/credits/credit-data.ts`'s `useCreditAccount` also writes under (with a narrower column selection), and — unlike every other hook in `briefing-data.ts` — is not gated on `!!session`. Both are exactly how `BudgetReview` in `briefing-detail.tsx` issued this query before this move. This is a pre-existing quirk (a narrower `select` sharing a cache key with a wider one is a latent risk worth a follow-up, tracked but not fixed here), preserved rather than corrected, because this pass is behavior-preserving only.
- **`findBriefingAttachmentByPath` returns the raw `{ data, error }` result instead of `assertResult(...)`.** Every other relocated read-in-a-mutation in the codebase (`findBrandAssetById`, `findUnchangedDesign`, `findDesignByAsset`) throws through `assertResult`. This one cannot: the calling code in `briefing-attachments.tsx`'s upload retry inspects `.error` and `.data` directly, and when the select itself errors, silently falls through to rethrow the _original upload error_ rather than the select's — a deliberate existing branch this relocation preserves rather than "corrects" to the usual shape.
- **`briefingQueryKeys` is a named-key record and there is no `useInvalidateBriefings()`.** The feature's mutations invalidate different, deliberately scoped subsets — attachment upload/remove touch only `briefing-attachments`; confirming a budget touches only `briefings`; saving a draft touches `briefings` and `notifications`; accepting a briefing touches `briefings`, `projects`, `credit-account`, `credit-ledger` and `notifications`, most of them keys this feature does not own. A single aggregate helper called from every `onSuccess` — the shape `credits` and `projects` use — would make each of those mutations refresh caches it does not refresh today, which no test in this repository catches. The keys are therefore declared once, as `briefingQueryKeys` in `briefing-data.ts`, and each call site composes only its own subset from that record, per [rule 5 of the contract](../../../../docs/architecture/data-access.md). See `board-data.ts`'s own comment above `moveProjectPosition` for the same reasoning applied to a single write.

  `briefingQueryKeys` holds three keys: `briefings`, `attachments` and `brand`. The last one, `briefing-brand`, is here rather than in `brand/brand-data.ts` because `useBriefingBrand` is the only hook that reads it — a key is owned by the feature whose reads it serves, not by the feature whose rows a write changes. `brand/section-editor.tsx` imports `briefingQueryKeys` to invalidate it after a brand-section save, which is the one cross-feature composition in the codebase, recorded at that call site.

  The keys this feature invalidates but does not own each stay with their owner: `notifications` through `workspace-data.ts`'s `useInvalidateNotifications()` (its set is exactly `["notifications"]`, so the helper is non-widening) and `projects` through `useInvalidateWorkspace()` (exactly `["projects"]`). `credit-account` and `credit-ledger` are the one exception, below.

- **`briefing-detail.tsx` keeps `credit-account` and `credit-ledger` as explicit literals.** `credits/credit-data.ts` exports those two keys only as part of `creditQueryKeys`, which also covers `credit-requests` and `notifications`. Accepting a briefing never touched `credit-requests`, so routing through `useInvalidateCredits()` would widen this call site. The two keys therefore stay spelled out, allowlisted by name in `features/shared/invalidation-boundary.test.ts`, with the reason recorded both at the call site and above `creditQueryKeys`.

## Verification

Executed for the data-access migration of this feature:

- `npm run check` from `apps/web`: typecheck, eslint, prettier and the unit suites. 21 files / 358 tests pass (20 files / 337 tests before this migration, plus the new `briefing-data.test.ts`). The two lint warnings it reports are pre-existing and belong to `features/board`.
- `grep -rn '\.from(\|\.rpc(\|\.storage\.' features/briefings --include='*.tsx' | grep -v 'Array\.from('` returns no output, confirming no component in this feature issues a query, procedure call or storage call directly.
- `npm --prefix apps/web run test:e2e -- intake-admin`: all 6 specs pass, covering briefing intake, attachments, free submission, budget confirmation, acceptance and credit reconciliation — the flows this migration's relocated calls serve.
- `npm run test -- features/briefings/briefing-model.test.ts features/briefings/briefing-attachments.test.ts features/briefings/briefing-data.test.ts`
- `npm run typecheck`
- `./node_modules/.bin/eslint features/briefings 'app/(workspace)/clients/[clientId]/briefings'`

Executed for the 2026-09-23 studio-local acceptance date and one-primary-budget-button fixes:

- `npm run db:test` from the repo root: `supabase/tests/database/briefing_acceptance_dates.test.sql` (new) passes in full, proving, inside a rolled-back transaction with the workspace timezone set to `Etc/GMT+12`, that accepting a budget-confirmed briefing due on that zone's local today creates a project whose `start_date` equals that local date, that a past-due briefing is accepted with `start_date=due_date`, and that exactly one project and one debit are created per acceptance. `access_and_workflows.test.sql` fails its usual 6 assertions under the local SABRE overlay (pre-existing, unrelated to this change); every other suite passes.
- `cd apps/web && npx vitest run features/briefings`: `briefing-detail.test.tsx` (new) proves exactly one of "Confirm budget" / "Accept & create project" renders in each of the three states (not yet confirmed, confirmed with unsaved edits, confirmed and unedited); all 4 files / 94 tests in this feature pass.
- `npm run typecheck`, `npm run lint`, `npx prettier --check app features`
- `npx playwright test tests/e2e/intake-admin.spec.ts --workers=1 --reporter=line`: all 6 specs pass against the local dev server, including the scenario that submits, confirms a budget and accepts a briefing end to end.

`briefing-data.test.ts` covers every relocated write's exact table/bucket/procedure name and argument object, and one database-error-surfacing case per function, following the stubbed-Proxy pattern in `features/projects/project-data.test.ts` and `features/brand/brand-data.test.ts`. `briefing-model.test.ts` covers all catalog services/formats, required and invalid answers, dates, quantities, explicit campaign selection, service-level estimates and JSON decoding; `briefing-attachments.test.ts` covers file policy. These unit tests do not prove RLS or real storage transport; that is what the `intake-admin` Playwright suite above and the orchestrator's database suites in the [acceptance matrix](../../../../docs/architecture/acceptance-matrix.md) are for.

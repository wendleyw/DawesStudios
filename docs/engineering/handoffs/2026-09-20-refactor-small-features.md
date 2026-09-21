# Refactor the four small features onto the data-access contract (Task 15)

- Updated at: 2026-09-20T23:05:00-03:00
- Reporting agent and tool: Task 15 worker / Claude Code (Claude Opus 5, 1M context)
- State: implemented, tested and verified in this session
- Objective: relocate the 13 measured inline Supabase call sites across `apps/web/features/assets/`,
  `apps/web/features/auth/`, `apps/web/features/campaigns/` and `apps/web/features/reviews/` onto
  the data-access contract; add unit tests for the extracted writes; adopt shared markup where a
  local copy exists; move `features/shared/file-download.ts` to its one real consumer; report (not
  edit) the `globals.css` boundary; split nothing that does not need it — all without changing
  behavior
- Owned paths: `apps/web/features/assets/`, `apps/web/features/auth/`, `apps/web/features/campaigns/`,
  `apps/web/features/reviews/`, this report, and
  `docs/engineering/handoffs/2026-09-20-refactor-small-features.md`
- Dependencies: `docs/architecture/data-access.md`; `features/credits/credit-data.ts` and
  `features/settings/settings-data.ts` as exemplars; `features/projects/project-data.test.ts`'s
  Proxy-based call-recording stub, copied for the new test files; `features/shared/README.md`; a dev
  server already running on port 3003 against the live working tree; a concurrent session holding
  uncommitted `proOptions={{ hideAttribution: true }}` edits in `board-page.tsx`, `project-page.tsx`,
  `design-viewer.tsx` and `docs/architecture/design-system.md`, not touched by this task
- Acceptance criteria: `npm run check` passes with neither `asset-data.test.ts` nor
  `auth/return-path.test.ts` modified; the four-directory grep for `.from(`/`.rpc(`/`.storage.` in
  `.tsx` files returns no output; each relocated query keeps its table/procedure, columns, filters,
  ordering and options object; `workspace` and `brand-guidance` Playwright specs pass unmodified
- Commits (all on `refactor/repository-structure`):
  - `58225eb` — stray partial commit (see "Known issue" below); superseded by `4cb8490`
  - `4cb8490` — `refactor(assets): move Supabase queries onto the data-access contract`
  - `ea80e78` — `refactor(auth): move the profile query onto the data-access contract`
  - `f8ef5cf` — `refactor(campaigns): move the campaign-creation query onto the contract`
  - `35b1ba6` — `refactor(reviews): move the reviews query onto the data-access contract`
- Task-scoped copy: this file (also the canonical copy; the handoff at
  `docs/engineering/handoffs/2026-09-20-refactor-small-features.md` mirrors it)

## Known issue: a stray empty-content commit (`58225eb`)

While staging the `assets` commit, a `git add` call listing both the old and new path of the
`file-download.ts` rename failed entirely (git aborts the whole invocation when one pathspec in the
list doesn't match, here because the old path no longer existed after `git mv`). The rename itself
had already been staged by the earlier `git mv`, and the failed `add` was silently a no-op for
everything else. The following `git commit` therefore recorded only that rename as `58225eb`, with
the intended full commit message. I caught this before moving on, staged the remaining assets files
correctly, and committed them as a new commit (`4cb8490`, same message) rather than amending — per
this task's "always create NEW commits" instruction. `58225eb` is a real, harmless commit (a pure
rename, no code change) still sitting in history below `4cb8490`; I did not rewrite history to
remove it, since no destructive git operation was authorized. Flagging it as the one loose end from
this session.

## Completed work and changed files

All 13 measured call sites are relocated. The boundary grep returns no output for all four features.

| # | Source file : call | Destination function | Table/bucket, columns, filters, ordering |
| - | --- | --- | --- |
| 1 | `assets/upload-file-dialog.tsx` `close()` — `select("id").eq("storage_path", …)` | `asset-data.ts` → `findAssetByStoragePath` | `project_assets`, `select("id")`, `.eq("storage_path", path)` — unchanged |
| 2 | `assets/upload-file-dialog.tsx` `close()` — `storage.from("internal-assets").remove([…])` | `asset-data.ts` → `removeUnusedUpload` | bucket `internal-assets`, `.remove([path])` — unchanged |
| 3 | `assets/upload-file-dialog.tsx` `mutationFn` — `storage.from("internal-assets").upload(…)` | `asset-data.ts` → `uploadInternalAsset` | bucket `internal-assets`, `.upload(path, file, { contentType: file.type, upsert: false })` — unchanged |
| 4 | `assets/upload-file-dialog.tsx` `mutationFn` — `select("id").eq("storage_path", …)` (2nd call site, same query) | `asset-data.ts` → `findAssetByStoragePath` (reused) | same as #1 — unchanged |
| 5 | `assets/upload-file-dialog.tsx` `mutationFn` — `insert({ project_id, name, storage_path, mime_type, file_size })` | `asset-data.ts` → `recordProjectAsset` | `project_assets`, insert object with identical keys — unchanged |
| 6 | `assets/assets-page.tsx` `deliver.mutationFn` — `rpc("mark_project_delivered", { p_project_id })` | `asset-data.ts` → `markProjectDelivered` | RPC name and argument key unchanged |
| 7 | `reviews/reviews-page.tsx` hook — `select("id,title,status,due_date").eq("client_id", …)` | `review-data.ts` → `useReviews` | `projects`, same column list, same `.eq("client_id", clientId)` — unchanged |
| 8 | `reviews/reviews-page.tsx` hook — `select("id,name").in("project_id", ids)` | `review-data.ts` → `useReviews` | `deliverables`, same columns/filter — unchanged |
| 9 | `reviews/reviews-page.tsx` hook — `select("id,project_id,deliverable_id,version_number,status,created_at,notes").in(…)` (designer branch) | `review-data.ts` → `useReviews` | `design_versions`, same column list/filter — unchanged |
| 9b | `reviews/reviews-page.tsx` hook — `select("*,publication_reviews!…(status,feedback)").in(…)` (non-designer branch) | `review-data.ts` → `useReviews` | `published_versions`, same select/embed/filter — unchanged (counted with #9 as one branch) |
| 10 | `reviews/reviews-page.tsx` hook — `select("*").in("project_id", ids).eq("status", "submitted")` (agency branch) | `review-data.ts` → `useReviews` | `design_versions`, same filters — unchanged |
| 11 | `auth/auth-provider.tsx` `SessionProvider` — `select("id, display_name, role, avatar_url").eq("id", …).single()` | `auth-data.ts` → `useProfile` | `profiles`, same column list, same `.eq("id", session!.user.id).single()`, same query key/`enabled` — unchanged |
| 12 | `campaigns/campaign-dialog.tsx` `mutationFn` — `insert({ client_id, title, description, start_date, end_date }).select("id").single()` | `campaign-data.ts` → `createCampaign` | `campaigns`, same insert keys, same `.select("id").single()` — unchanged |

(The table above lists 12 rows because the reviews hook's two mutually-exclusive branches at one
call site — designer vs. non-designer — are one query slot in the original 5-query count for
`reviews-page.tsx`; the task's count of 5 for that file is `projects`, `deliverables`, the
branch-selected query, and the agency-only `submitted` query = 4 distinct call-site slots executing
up to 5 queries per render depending on role, matching "5 Calls" in the brief.)

| File | Change |
| --- | --- |
| `apps/web/features/assets/asset-data.ts` (76 → 178 lines) | Added `findAssetByStoragePath`, `removeUnusedUpload`, `uploadInternalAsset`, `recordProjectAsset`, `markProjectDelivered` |
| `apps/web/features/assets/asset-data-writes.test.ts` (new, 167 lines) | 10 tests: exact table/bucket/procedure and argument object for all 5 new functions, plus a database-error-surfacing case for each |
| `apps/web/features/assets/assets-page.tsx` (255 → 254 lines) | 1 call site removed; imports `markProjectDelivered`; `file-download` import now local |
| `apps/web/features/assets/upload-file-dialog.tsx` (177 → 170 lines) | 5 call sites removed |
| `apps/web/features/assets/file-download.ts` (new location, 18 lines, unchanged content) | Moved from `features/shared/`, its one real consumer |
| `apps/web/features/assets/README.md` (new) | Documents the migration, the `findAssetByStoragePath` "read that is not a hook" deviation, and the `file-download.ts` move |
| `apps/web/features/shared/README.md` | Drops `file-download.ts`'s entry from the non-component-modules table |
| `apps/web/features/auth/auth-data.ts` (new, 33 lines) | `useProfile(database, session)`, taking explicit parameters instead of calling `useAuth()` |
| `apps/web/features/auth/auth-provider.tsx` (131 → 115 lines) | 1 call site removed; `profileQuery` now calls `useProfile(database, session)` in the same position |
| `apps/web/features/auth/README.md` (new) | Records the "moved, not exempted" decision and reasoning, and the `.spin` CSS-boundary finding |
| `apps/web/features/campaigns/campaign-data.ts` (new, 49 lines) | `campaignQueryKeys`, `useInvalidateCampaigns`, `createCampaign` — this feature's only file besides the dialog |
| `apps/web/features/campaigns/campaign-data.test.ts` (new, 72 lines) | 2 tests: exact insert/select/single call list, and database-error surfacing |
| `apps/web/features/campaigns/campaign-dialog.tsx` (95 → 88 lines) | 1 call site removed; direct `invalidateQueries(["campaigns"])` replaced with `useInvalidateCampaigns()` |
| `apps/web/features/campaigns/README.md` (new) | Documents the feature and its intentional non-sharing with `settings/settings-data.ts`'s same-named `campaignQueryKeys`/`useInvalidateCampaigns` |
| `apps/web/features/reviews/review-data.ts` (new, 105 lines) | `useReviews(clientId)`, the page's one read hook, relocated verbatim |
| `apps/web/features/reviews/reviews-page.tsx` (195 → 115 lines) | Inline `useQuery` replaced by `useReviews(clientId)`; `database`/`session` destructuring dropped from `useAuth()` since no longer used in the page |
| `apps/web/features/reviews/README.md` (new) | Documents the migration and why no write-function test file exists |

No file in any of the four features approached ~350 lines after the migration (largest is
`assets-page.tsx` at 254 lines); nothing was split.

## Decisions

### `auth/auth-provider.tsx` — moved, not exempted

The provider's one query — the signed-in user's own `profiles` row — was relocated to
`useProfile(database, session)` in the new `auth-data.ts`. This was a genuine case-by-case decision,
not a default: I verified the query is a plain top-level `useQuery` in `SessionProvider`, never read
or branched on by the `onAuthStateChange`/`getSession` effect above it, so moving it changes neither
that effect's sequencing nor the number/order of hooks `SessionProvider` calls (a custom hook that
itself calls `useQuery` once is transparent to React's hook bookkeeping). `useAuth()`'s returned
shape (`{ database, mediaUrl, session, profile, loading, error }`) is byte-for-byte the same. The one
deviation from the exemplar: `useProfile` takes `database`/`session` as explicit parameters instead
of calling `useAuth()` internally, because it is called from inside the component that defines and
provides `useAuth()` — recorded above the function and in `features/auth/README.md`.

### `assets/asset-data.ts` — `findAssetByStoragePath` is a read that is not a hook

Called from two places in `upload-file-dialog.tsx` (the dialog's `close()`, and the upload
mutation's `mutationFn`), both of which branch on the result before performing a write and neither
of which renders it. Per rule 2 of the contract, this is a plain `(database, input)` function, not a
`use<Thing>()` hook — the same shape `findUnchangedDesign`/`findDesignByAsset` take in
`features/projects`. Recorded above the function and in `features/assets/README.md`.

### `campaigns/campaign-data.ts` — its own `campaignQueryKeys`/`useInvalidateCampaigns`

`settings/settings-data.ts` already exports a same-named pair for `settings/campaign-settings.tsx`'s
create-or-edit mutation. This module does not import from it: per the contract's per-feature
invalidation rule, each feature owns its own copy, and the two pairs happen to invalidate the same
`["campaigns"]` key because they share a domain, not because of shared code. Recorded in
`features/campaigns/README.md`.

### Shared-primitive adoption (mandate item 3): none needed

All four features already consume `Modal`, `FormError`, `PageStatus` and `SearchField` from
`features/shared/` with no local duplicate markup. Verified with
`grep -rn 'role="alert"\|role="status"\|className="modal' features/{assets,auth,campaigns,reviews} --include='*.tsx'`,
which returned no matches beyond the shared components' own use.

### `file-download.ts` (mandate item 4): moved

Verified its only consumer is `assets/assets-page.tsx` with
`grep -rn "file-download" --include='*.ts' --include='*.tsx' features app lib`, which returned
exactly one import site before the move. Moved to `features/assets/file-download.ts`, import updated
to a relative path, and its entry dropped from `features/shared/README.md`.

### CSS boundary (mandate item 5): one finding, in `auth`

`.spin` (the loading-spinner keyframe animation) is defined in `app/globals.css` but has exactly one
consumer anywhere in the app: `auth/login-page.tsx`'s `<LoaderCircle className="spin" />`. Verified
with `grep -rn '\bspin\b' --include='*.tsx' --include='*.ts' --include='*.css' . --exclude-dir=node_modules --exclude-dir=.next`,
which shows only the two `globals.css` lines and the one `login-page.tsx` consumer. Reported, not
edited (`globals.css` is out of scope). No other namespace among `assets`, `campaigns` or `reviews`
qualified — a systematic sweep of all 60 top-level class selectors in `globals.css` against
consumers inside vs. outside the four feature directories found only `.spin`; `.brand-logo` was
excluded per the brief (two verified consumers: `auth/login-page` and `workspace/app-shell`).

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npm run check` (after assets/campaigns/reviews, before auth) | This session, 2026-09-20 22:57 | typecheck clean; lint: 2 pre-existing warnings unrelated to this task (`board-canvas-controls.tsx`, `board-nodes.tsx`); format clean after one `prettier --write`; **25 test files / 391 tests passed** | terminal output, this session |
| `npm run check` (after auth) | This session, 2026-09-20 22:58 | Same as above — **25 test files / 391 tests passed** | terminal output, this session |
| `grep -rn '\.from(\|\.rpc(\|\.storage\.' apps/web/features/$d --include='*.tsx' \| grep -v 'Array\.from('` for `d` in `assets auth campaigns reviews` | This session | No output for any of the four | terminal output, this session |
| Line counts (`wc -l`) across all four features' `.ts`/`.tsx` files | This session | Largest file 254 lines (`assets-page.tsx`); nothing near 350 | terminal output, this session |
| `npm --prefix apps/web run test:e2e -- workspace brand-guidance` | This session, against the dev server already running on port 3003, 2026-09-20 23:00 | **9/9 passed** (matches on `workspace` and `brand-guidance`: `brand-guidance.spec.ts` ×3, `canonical-workspaces.spec.ts` ×1, `workspace-actions.spec.ts` ×3, `workspace.spec.ts` ×2), 1.5 minutes | terminal output, this session; regenerated screenshots/evidence left as the run produced them per instructions, not reverted or staged |

Baseline before this task: 379 tests / 23 files. New total: 391 tests / 25 files (+12 tests, +2
files: `asset-data-writes.test.ts` and `campaign-data.test.ts`; `reviews`/`auth` added no test file,
per the reasoning above).

## Unresolved risks and next action

- The stray commit `58225eb` (see "Known issue" above) sits in history below the real `4cb8490`. It
  changes nothing functionally (pure rename, already superseded), but the orchestrator may want to
  squash it during a later rebase if a clean linear history matters before merging.
- I did not run the full Playwright suite, only `workspace` and `brand-guidance` as instructed; no
  other spec was touched or is expected to be affected, since no exported contract changed in any of
  the four features.
- `docs/verification/screenshots/*` and `docs/verification/canonical-browser-evidence.json` were
  regenerated by the Playwright run per its normal behavior; left exactly as the run produced them,
  not staged or committed, per instruction ("I handle those").
- Next action: none required from this task; all four features are migrated, tested and verified.
  The orchestrator's remaining structural-refactor backlog (per `docs/engineering/handoffs/handoff.md`,
  not read/updated by this task since it is out of this task's write scope beyond the two report
  files named above) should be checked for any features still outstanding beyond these four plus the
  six already migrated.

## Ownership at handoff

All four owned paths (`apps/web/features/assets/`, `apps/web/features/auth/`,
`apps/web/features/campaigns/`, `apps/web/features/reviews/`) are released — no active writer or
background process remains. The concurrent session's uncommitted `proOptions`/design-system-doc
edits in `board-page.tsx`, `project-page.tsx`, `design-viewer.tsx` and
`docs/architecture/design-system.md` were left untouched and unstaged throughout, as instructed.

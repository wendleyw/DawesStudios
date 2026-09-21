# Refactor the settings feature onto the data-access contract (Task 12)

- Updated at: 2026-09-20T22:35:00-03:00
- Reporting agent and tool: Task 12 finishing worker / Claude Code (Claude Opus 5, 1M context)
- State: implemented by a previous agent; verified and landed by this agent — type check, lint, format, unit tests and the `intake-admin` Playwright spec all executed in this session and all passing
- Objective: relocate the 11 inline Supabase call sites in `apps/web/features/settings/` onto the data-access contract, add unit tests for the extracted writes, adopt or create the right level of shared markup, report (not edit) the `globals.css` boundary, and split nothing that does not need splitting — all without changing behavior
- Owned paths: `apps/web/features/settings/`, this report, and `.superpowers/sdd/2026-09-20-repository-structural-refactor/task-12-report.md` (the identical task-scoped copy)
- Dependencies: `docs/architecture/data-access.md`; the `features/credits`, `features/projects` and `features/briefings` exemplars (`project-data.test.ts`'s Proxy call-recording stub specifically); a dev server already running on port 3003 against the live working tree
- Acceptance criteria: `npm run check` passes with no test file modified; `grep -rn '\.from(\|\.rpc(\|\.storage\.' apps/web/features/settings --include='*.tsx' | grep -v 'Array\.from('` returns no output; each relocated query keeps its table/procedure, columns, filters, ordering and argument object; `intake-admin` passes unmodified
- Commit: `d5b87a944d39b48f9f464a1896343fcdb0efef50` on `refactor/repository-structure`
- Task-scoped copy: `.superpowers/sdd/2026-09-20-repository-structural-refactor/task-12-report.md`

## Authorship

**The implementation in this commit was written by a previous delegated agent, which was interrupted
mid-task by an API rate limit — not by any failure in its work.** Its changes sat uncommitted in the
working tree. This agent read the whole of that work, fixed the one outstanding defect blocking
verification (a Prettier formatting violation in `apps/web/features/settings/README.md`), executed
the full verification suite and the `intake-admin` Playwright spec itself, and committed the result.
The design decisions recorded under "Decisions" below are the previous agent's; this agent's
contribution is the formatting fix, the verification evidence, the commit, and these two reports.

## Completed work and changed files

All 11 measured call sites are relocated. The boundary grep returns no output.

| File                                                                | Change                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/features/settings/settings-data.ts` (new, 295 lines)      | Read hooks `useTeamMembers`, `useInvitations`; writes `revokeInvitation`, `saveClient`, `saveCampaign`, `saveServicePreset`, `saveWorkspaceSettings`, `updateProfile`, `acceptInvitation`; six `<domain>QueryKeys` constants and six `useInvalidate<Domain>()` hooks |
| `apps/web/features/settings/settings-data.test.ts` (new, 292 lines) | 18 tests: exact table/procedure and argument object per write, plus a database-error-surfacing case for all nine writes via `it.each`                                                                                                                                |
| `apps/web/features/settings/settings-success.tsx` (new, 19 lines)   | `SettingsSuccess`, the feature-local success paragraph used at all 8 call sites                                                                                                                                                                                      |
| `apps/web/features/settings/team-settings.tsx` (293 → 278)          | 3 call sites removed; 3 `["invitations"]` invalidations collapsed onto `useInvalidateTeam()`                                                                                                                                                                         |
| `apps/web/features/settings/client-settings.tsx` (240 → 233)        | 2 call sites removed                                                                                                                                                                                                                                                 |
| `apps/web/features/settings/campaign-settings.tsx` (180 → 165)      | 2 call sites removed                                                                                                                                                                                                                                                 |
| `apps/web/features/settings/account-settings.tsx` (139 → 127)       | 1 call site removed                                                                                                                                                                                                                                                  |
| `apps/web/features/settings/preset-settings.tsx` (200 → 194)        | 1 call site removed                                                                                                                                                                                                                                                  |
| `apps/web/features/settings/workspace-settings.tsx` (103 → 93)      | 1 call site removed                                                                                                                                                                                                                                                  |
| `apps/web/features/settings/invitation-acceptance.tsx` (158)        | 1 call site removed (the RPC only)                                                                                                                                                                                                                                   |
| `apps/web/features/settings/account-recovery.tsx` (153)             | No query to move; 2 success paragraphs adopted `SettingsSuccess`                                                                                                                                                                                                     |
| `apps/web/features/settings/README.md`                              | Documents the migration, the six-domain decision, `SettingsSuccess`, the clean CSS boundary, and the executed verification                                                                                                                                           |

Untouched, as required: `settings-model.ts` and `settings-model.test.ts` (the safety net),
`settings-page.tsx`, `settings.css`, `apps/web/app/globals.css`,
`apps/web/app/api/invitations/route.ts`, and the two `docs/superpowers/` files belonging to the
concurrent session.

## The 11 relocated call sites

Built by reading `git diff b4b6084 -- apps/web/features/settings/` line by line. "Unchanged"
means the table or procedure name, the `.select()` column list, every filter, the ordering clause,
the argument object and the `assertResult(...)` error surfacing are byte-identical to the
pre-migration code; only the call site moved.

| #   | Source file and call site                                         | Destination in `settings-data.ts`     | Table/procedure, columns, filters, ordering — unchanged?                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `team-settings.tsx` — `members` `useQuery`                        | `useTeamMembers()`                    | `profiles`; `.select("id,display_name,role,avatar_url")`; `.in("role", ["agency","designer"])`; `.order("display_name")`; query key `["studio-team", session?.user.id]` — **all unchanged**, including the `as Profile[]` cast                                                     |
| 2   | `team-settings.tsx` — `invitations` `useQuery`                    | `useInvitations()`                    | `invitations`; `.select("*")`; no filter; `.order("created_at", { ascending: false })`; query key `["invitations", session?.user.id]` — **all unchanged**, including the `as Invitation[]` cast                                                                                    |
| 3   | `team-settings.tsx` — `revoke` mutation                           | `revokeInvitation()`                  | `rpc("revoke_invitation", { p_invitation_id })` — **unchanged**                                                                                                                                                                                                                    |
| 4   | `client-settings.tsx` — `save` mutation, `if (client)` branch     | `saveClient({ mode: "update", … })`   | `clients`; `.update({ name, industry, website, description })`; `.eq("id", client.id)`; `.select("id").single()` — **unchanged**; the `.trim()` calls stay at the component call site                                                                                              |
| 5   | `client-settings.tsx` — `save` mutation, `else` branch            | `saveClient({ mode: "create", … })`   | `rpc("create_client", { p_name, p_slug, p_industry, p_initial_credits })` — **unchanged**; the credit-integer and slug validations stay in the component and still run before the call                                                                                             |
| 6   | `campaign-settings.tsx` — `save` mutation, `if (campaign)` branch | `saveCampaign({ mode: "update", … })` | `campaigns`; `.update({ title, description, start_date, end_date })`; `.eq("id", campaign.id)`; `.eq("client_id", clientId)` **in that order**; `.select("id").single()` — **unchanged**                                                                                           |
| 7   | `campaign-settings.tsx` — `save` mutation, `else` branch          | `saveCampaign({ mode: "create", … })` | `campaigns`; `.insert({ …payload, client_id })` with the same four payload keys plus `client_id`; `.select("id").single()` — **unchanged**                                                                                                                                         |
| 8   | `account-settings.tsx` — `saveProfile` mutation                   | `updateProfile()`                     | `profiles`; `.update({ display_name })`; `.eq("id", session!.user.id)`; `.select("id").single()` — **unchanged**                                                                                                                                                                   |
| 9   | `preset-settings.tsx` — `save` mutation                           | `saveServicePreset()`                 | `rpc("save_service_preset", { p_service_type, p_min_credits, p_max_credits, p_due_days })` — **unchanged**; still _returns_ the revision number, which `onSuccess(revision)` still consumes                                                                                        |
| 10  | `workspace-settings.tsx` — `save` mutation                        | `saveWorkspaceSettings()`             | `rpc("update_workspace_settings", { p_studio_name, p_timezone })` — **unchanged**                                                                                                                                                                                                  |
| 11  | `invitation-acceptance.tsx` — `accept` mutation, RPC portion      | `acceptInvitation()`                  | `rpc("accept_invitation", { p_token })` — **unchanged**; the preceding `database.auth.updateUser({ password })` in the same mutation deliberately stays in the component (Supabase Auth, not a `.from(`/`.rpc(`/`.storage.` query), and the ordering of the two calls is preserved |

Invalidation targets are also unchanged one-for-one: `["invitations"]` (3 sites) → `useInvalidateTeam()`,
`["clients"]` → `useInvalidateClients()`, `["campaigns"]` → `useInvalidateCampaigns()`,
`["service-presets"]` → `useInvalidatePresets()`, `["workspace-settings"]` → `useInvalidateWorkspace()`,
`["profile"]` → `useInvalidateAccount()`. `invitation-acceptance.tsx`'s deliberate blanket
`queryClient.invalidateQueries()` on successful acceptance was left exactly as it was.

## Decisions (the previous agent's, reviewed and accepted by this agent)

- **Six domain-scoped key/invalidate pairs instead of one feature-wide pair.** `credit-data.ts` and
  `project-data.ts` each export a single `…QueryKeys` / `useInvalidate…()` pair, but those features
  are one page. Settings is six independent tabs. A single shared pair invalidated by every mutation
  would make saving a preset refetch the client list and the team roster — a behavior change. The
  six-way split is what preserves the pre-migration invalidation set exactly. **Judgment: correct**,
  and the only shape here that is behavior-preserving.
- **`saveClient` and `saveCampaign` take a discriminated `mode: "update" | "create"`** rather than
  being split into four exported functions, mirroring the single `if/else` mutation call site each
  came from. **Judgment: correct** — two exports per domain would have had no independent caller.
- **`acceptInvitation` extracts only the RPC**, leaving `database.auth.updateUser({ password })` in
  the component. **Judgment: correct** — Auth is outside the contract's `.from(`/`.rpc(`/`.storage.`
  scope, and the boundary grep agrees.
- **`SettingsSuccess` is feature-local, not shared.** An earlier task evaluated this markup for
  `features/shared/` and rejected it _because_ all its call sites are in one feature. That reasoning
  argues against `features/shared/`, not against factoring at all: within this feature the markup
  repeats at 8 sites with only the message varying — the same shape that justified the shared
  `FormError`. **Judgment: correct call.** Verified reproduction: the component emits
  `<p className="settings-success" role="status">{children}</p>`, identical class name and identical
  `role="status"` accessibility attribute to all 8 previous sites; the only textual difference is
  JSX attribute order at one site (`account-recovery.tsx` previously wrote `role` before
  `className`), which does not affect the rendered DOM. The `.settings-success` rule lives in
  `features/settings/settings.css` and was not touched.
- **Nothing was split.** The largest file in the feature was `team-settings.tsx` at 293 lines,
  comfortably under the ~350-line threshold, and it _shrank_ to 278. `settings-data.ts` at 295 lines
  and `settings-data.test.ts` at 292 are likewise under the threshold. **Judgment: correct** — no
  unnecessary split occurred.
- **`app/globals.css` reported, not edited.** `grep -n "settings" apps/web/app/globals.css` returns
  nothing; every global class this feature consumes (`button`, `primary`, `quiet`, `form-error`,
  `page-content`, `page-heading`, `eyebrow`, `status-badge`) has at least one consumer in another
  feature. `status-badge` looked single-feature at the bare-class level but its state variants are
  used by board, briefings, credits, projects and workspace. **Judgment: correct**, and `git status`
  confirms `globals.css` is unmodified.
- **`app/api/invitations/route.ts` untouched.** This is the repository's only API route and is
  outside the write scope. `git status` never listed it. `invitation-acceptance.tsx`'s change is a
  pure client-side extraction of one RPC and depends on nothing in that route; the separately
  recorded origin-derivation defect in that endpoint is untouched and unaffected, and the
  `intake-admin` spec's invitation-delivery and sender-access cases still pass against it.

## Checks actually executed

| Command or scenario                                                                                              | Environment and time                                                           | Observed result                                                                                                                                                                                                                                                                                                      | Evidence                      |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `npx prettier --write apps/web/features/settings/README.md`                                                      | repo root, 2026-09-20 22:31 -03:00                                             | Reformatted; the single blocker cleared                                                                                                                                                                                                                                                                              | working tree                  |
| `npm run check` (typegen + `tsc --noEmit` + eslint + `prettier --check` + vitest)                                | repo root, 2026-09-20 22:31 -03:00                                             | **Pass.** 0 type errors; 0 lint errors, 2 warnings, both pre-existing in `features/board/` (`board-canvas-controls.tsx` exhaustive-deps, `board-nodes.tsx` unused `ArrowLeft`); formatting clean; **22 test files / 376 tests passed** (358 pre-existing baseline + 18 new in `settings-data.test.ts`)               | terminal output, this session |
| `grep -rn '\.from(\|\.rpc(\|\.storage\.' apps/web/features/settings --include='*.tsx' \| grep -v 'Array\.from('` | repo root, 2026-09-20 22:32 -03:00                                             | **No output** — no component in the feature issues a Supabase query directly                                                                                                                                                                                                                                         | terminal output, this session |
| `npm --prefix apps/web run test:e2e -- intake-admin`                                                             | live dev server on port 3003 serving the working tree, 2026-09-20 22:33 -03:00 | **6 passed (15.8s)**, spec unmodified — including "persists workspace and preset edits without changing accepted budgets" (1.8s), "delivers real scoped invitation and recovery emails and enforces sender access" (4.1s), and "creates a validated client workspace with opening credits and an empty board" (1.3s) | terminal output, this session |
| `npm run check` re-run after the commit hooks (`gitleaks`, lint-staged `eslint --fix` + `prettier --write`)      | repo root, 2026-09-20 22:32 -03:00                                             | **Pass**, 22 files / 376 tests — the hooks changed nothing that broke verification                                                                                                                                                                                                                                   | terminal output, this session |
| `git log` trailer audit on `d5b87a9`                                                                             | repo root                                                                      | `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` present                                                                                                                                                                                                                                         | `git log -1`                  |

No test file was modified to make anything pass. `settings-model.test.ts` is byte-unchanged and still
passes.

## Remaining risks and next action

- **No behavioral coverage for the six `useInvalidate…` hooks or the two read hooks.** The unit suite
  covers the write functions; the hooks are exercised only indirectly, through the `intake-admin`
  spec's workspace, preset, client-creation and invitation paths. The team-roster and
  invitation-history reads (call sites 1 and 2) have no unit test at all — they are React Query hooks,
  matching how the other features' read hooks are covered in this refactor, and the spec loads both
  screens. Risk accepted, consistent with Tasks 10 and 11.
- **Four regenerated screenshots under `docs/verification/screenshots/` are deliberately left
  uncommitted and unstaged**: `intake-account-settings.png`, `intake-briefing-review.png`,
  `intake-credit-report.png`, `intake-designer-briefing.png`. They are a by-product of running
  `intake-admin` (both by the previous agent and again by this one) and belong to the orchestrator's
  wave checkpoint, not to this task.
- **Pre-existing, out of scope:** the two `features/board/` lint warnings, and the earlier commit
  `e3952f1` which is missing the `Co-Authored-By` trailer. Neither was introduced here and history
  was not rewritten.
- **Next required action:** the orchestrator integrates `d5b87a9`, decides what to do with the four
  regenerated screenshots at the wave checkpoint, and dispatches the next feature in the refactor
  wave. No follow-up work is outstanding inside `apps/web/features/settings/`.

## Ownership at handoff

`apps/web/features/settings/` is released — committed, clean, no uncommitted edits under it. The dev
server on port 3003 and the Docker Supabase stack were left running and untouched, as instructed.
`docs/superpowers/specs/2026-09-20-studio-team-design.md` and
`docs/superpowers/plans/2026-09-20-studio-team.md` belong to a concurrent session and were not read
or modified. Intended recipient: the orchestrator.

# Audit fixes — J04 terminology and logic (batch 2)

- Updated at: 2026-09-21T05:15:00Z
- Reporting agent and tool: Claude (Claude Code)
- State: implemented and verified locally (unit suite + production build + signed-in browser pass);
  the Playwright suite was **not** run — see "Remaining risks".
- Objective: Fix all seventeen findings in `docs/verification/audit-j03-j04-j08-j09.md` section
  **J04**, applying the orchestrator's vocabulary decisions, which go further than the audit's own
  recommendation in two places (see "Decisions"). J03 minimalism, J08 tokens, J09 state surfaces and
  J05 duplication are out of scope (later batches).
- Owned paths: `apps/web/features/**` (the files listed per finding below), `apps/web/app/error.tsx`,
  `apps/web/app/not-found.tsx`, `apps/web/features/workspace/workspace-format.test.ts` (new),
  `apps/web/features/workspace/README.md`, `docs/architecture/design-system.md`,
  `docs/architecture/sitemap.md`, `docs/architecture/domain.md`, this report.
- Dependencies: `docs/verification/audit-j03-j04-j08-j09.md` (source findings); batch 1 (`dc9248d`)
  already on `main`; the already-running local Supabase.
- Acceptance criteria: `npm run check` passes; the retired terms return no user-facing grep hit; the
  10-client/25-project fixture is intact; no existing test file modified.

## Completed work and changed files — one row per finding

| Finding | What it was | What changed | How the old term was verified gone |
| --- | --- | --- | --- |
| **J04-1** (High) | Version status rendered as the raw enum through `replaceAll("_", " ")` at three sites, two under `text-transform: capitalize`, so one state read `Changes requested` / `Changes Requested` / `changes requested`; `submitted`, `reviewed`, `pending` had no label at all | Added `VersionStatus`, `versionStatusLabels` and `versionStatusLabel()` beside `statusLabels` in `workspace-data.ts`, covering **all six** values the two tables allow (`design_versions`: draft/submitted/reviewed; `publication_reviews`: pending/approved/changes_requested). Applied at `project-nodes.tsx:44`, `reviews-page.tsx:104`, `project-details.tsx:177`. Deleted `text-transform: capitalize` from `projects.css` (`.version-state`) and `reviews.css` (`.review-date`) | `grep -rn 'status.replaceAll' apps/web/features` → none. `grep -rn "capitalize" apps/web/features/*/*.css apps/web/app/globals.css` → none. Browser: the canvas card for a submitted version now reads **Studio review**, the same words as the project badge above it |
| **J04-2** (High) | "Workspace" named both a client organisation and the studio's own account, one click apart | Client: nav section `WORKSPACES`→`CLIENTS`, search result type `"Workspace"`→`"Client"`, home tile and section heading→`Clients`, home table column `WORKSPACE`→`CLIENT`, client-role profile label `Client workspace`→`Client`, `settings/client-settings.tsx` heading→`Clients`, team-settings invite field `Client workspace`→`Client`, board/assets error copy `This workspace is unavailable`→`This client is unavailable`. Studio: Settings tab `Workspace`→`Studio`, `Workspace settings could not be loaded`→`Studio settings…`, `Workspace updated.`→`Studio updated.`, section copy "for your workspace"→"for the studio", account-tab eyebrow `YOUR WORKSPACE`→`YOUR ACCOUNT` | `grep -rn '"Workspace"\|WORKSPACES' apps/web/features --include='*.tsx'` → none. Browser: sidebar reads **CLIENTS**, settings tab reads **Studio** |
| **J04-3** (High) | The studio timezone persisted but exactly one render honoured it; everything else hard-coded UTC or used the browser zone | Added `createDateFormatters(timeZone)` + `useDateFormat()` to `workspace-data.ts`; **every** user-facing date now goes through it. See the full list below | `grep -rn "Intl.DateTimeFormat" apps/web/features apps/web/app` → only `workspace-data.ts` itself and `board/timeline-model.ts` (calendar-day grid, documented) |
| **J04-4** | A row badged `Budget confirmed` sat inside a tab called `Awaiting review` | Briefings tab relabelled `With the studio` — the wording `briefing-detail.tsx:115` already uses for that pair of states. The filter predicate is unchanged | `grep -rn "Awaiting review" apps/web/features` → only `briefingStatusLabels.awaiting_review`, which is the badge for that one status |
| **J04-5** | Five ad-hoc date formats for the same kind of value | One formatter set: `formatDate` (`Sep 21`), `formatDateLong` (`Sep 21, 2026`), `formatDateTime` (`Sep 21, 2026, 11:00 PM`), `formatMonth` (`September 2026`), `formatWeekdayDate` (`Monday, September 21`). All six ad-hoc `Intl.DateTimeFormat` constructions deleted. The briefing due date now reads `Sep 21` on both the summary and the list (it read `September 21, 2026` on one of them) | grep above |
| **J04-6** | `120 credits` on one screen, `120 cr` on another | The four `cr` figures in the budget-review `<dl>` (`briefing-detail.tsx:223–235`) now read `credits` | `grep -rnE "\} cr[<) ]" apps/web/features` → none |
| **J04-7** | One destination, five names | `Open workspace` → `Back to your work` on `app/error.tsx`, `app/not-found.tsx` and `settings/account-recovery.tsx`; not-found body copy no longer says "Return to your workspace". The role-dependent nav label stands on its own, and the home `h1` for a client now matches its nav label (`Home`) instead of adding a sixth name | `grep -rn "Open workspace\|Open your workspace" apps/web` → none |
| **J04-8** | The same person was called three things in one aside | `Creative partner` retired: `project-details.tsx` heading→`Designer`, modal title→`Assign a designer`; shell profile role label→`Designer`; `team-settings.tsx` roster and invitation rows→`Designer` | `grep -rn "Creative partner\|creative partner" apps/web --include='*.tsx'` → none |
| **J04-9** | Four nouns for a produced file | The `/assets` route is **Files** on its nav entry, its `h1` (`Project assets.`→`Files.`), its error heading (already `Files unavailable.`) and its inbound link (`Files & delivery`→`Files`). The produced image is **design**: `No artwork yet`→`No design yet`, `Artwork file`→`Design file`, `Navigate artwork`→`Navigate designs`, `Feedback pinned to artwork`→`Feedback pinned to a design`, `Reference artwork`→`Reference design`, `SVG artwork`→`SVG asset` (a Brand Hub library item), `Scrollable template artwork`→`Scrollable template preview`. Deliverable, asset, working file and design were **not** merged | `grep -rni "artwork" apps/web/features apps/web/app --include='*.tsx'` → only internal identifiers (`artworkFor`, `ProjectArtwork`, `--artwork-height`, the storage/DB path helpers) and the comments describing them; no rendered string |
| **J04-10** | Global search described a briefing with a raw enum | `useWorkspaceSearch` now maps the briefing description through `briefingStatusLabels` | included in the J04-1 grep |
| **J04-11** | The canvas card's accessible name said "in planning", an action the board no longer performs | `board-nodes.tsx` now uses `openLabel(data.project.title)`, the same name the Kanban card and timeline bar use; the stale comment above it was corrected | `grep -rn "in planning" apps/web/features` → none |
| **J04-12** | `formatDate`'s empty label was hard-wired to "No due date", so a review or file date would have printed it | Every formatter takes `emptyLabel` (default `No date`); the seven due-date call sites pass `"No due date"` explicitly, the start date passes `"To be planned"`, the briefing summary passes its own sentence. Rendered output at each existing site is unchanged | `workspace-format.test.ts` asserts the default, the override and the invalid-date path |
| **J04-13** | The home card said "5 active projects" where the board said "7 projects" | The home client card now names the missing figure: `1 active project · 1 delivered` (the suffix appears only when a client has delivered work). The board's count is unchanged, because it counts exactly what it draws | Browser: Northfield Bank reads **1 active project · 1 delivered** |
| **J04-14** | Credit-request status was a hand-written ternary at the call site | `creditRequestStatusLabels` added to `credit-model.ts` beside `creditKindLabels`; `credits-page.tsx` reads it | `grep -rn '"fulfilled" ?' apps/web/features` → none |
| **J04-15** | `Brand Hub` and `brand hub` in the same file | `Opening the Brand Hub…`, `Brand Hub unavailable.` | `grep -rn "brand hub" apps/web/features --include='*.tsx'` → none |
| **J04-16** | `Back to briefings` and `All briefings` for one link in one file | Both are `All briefings` | `grep -rn "Back to briefings" apps/web` → none |
| **J04-17** | The agency review filter said `With client`; the badge on those rows says `In review` | Filter relabelled `In review` | `grep -rn "With client" apps/web/features` → none. Browser: filter and row status now read the same words |

## J04-3 — every date render, and the zone it now uses

The rule: **an instant** (a timestamp) is rendered in the studio's timezone; **a calendar date**
(`YYYY-MM-DD` — a due date, a start date, a campaign boundary) is rendered in UTC, because it names a
day rather than a moment and shifting it into a western zone would move a due date to the day before.
`createDateFormatters` decides per value, so no call site has to know.

| Render | Before | Now |
| --- | --- | --- |
| `board-nodes.tsx:201` project card due date | UTC | calendar date → UTC (unchanged) |
| `board-nodes.tsx:155` campaign date range | UTC | calendar date → UTC (unchanged) |
| `board-page.tsx:419` board list due date | UTC | calendar date → UTC (unchanged) |
| `board-kanban.tsx:72`/`:76` card and accessible name | UTC | calendar date → UTC (unchanged) |
| `project-page.tsx:176` project header due date | UTC | calendar date → UTC (unchanged) |
| `project-details.tsx:107`/`:109` start and due date | UTC | calendar date → UTC (unchanged) |
| `briefings-page.tsx:116` briefing list due date | UTC | calendar date → UTC (unchanged) |
| `briefing-summary.tsx:77` briefing due date | UTC, `dateStyle: "long"` | calendar date → UTC, now `Sep 21` instead of `September 21, 2026` |
| `home-page.tsx:138` needs-attention due date | UTC | calendar date → UTC (unchanged) |
| `home-page.tsx:44` today's date chip | **browser zone** | **studio zone** |
| `project-details.tsx:177` version history date | UTC | **studio zone** (instant) |
| `reviews-page.tsx:104` review date | UTC | **studio zone** (instant) |
| `assets-page.tsx:184` file date | UTC | **studio zone** (instant) |
| `comment-panel.tsx:118` comment timestamp | **browser zone** | **studio zone** (instant) |
| `credits-page.tsx:321` ledger row date | UTC | **studio zone** (instant), same `Sep 21, 2026` shape |
| `credits-page.tsx:243` ledger month filter | UTC | calendar date → UTC (unchanged) |
| `notifications-page.tsx:69` notification timestamp | studio zone (the one that already worked) | studio zone, now through the shared formatter |
| `board/timeline-model.ts` column headings, period label, bar tooltip/accessible name | UTC | **UTC, deliberately kept** — every value here is a grid day or a start/due date sliced to `YYYY-MM-DD`; a comment now records why |

The local studio setting is `America/New_York`, so the five instants above now render in New York
time rather than UTC. That is the finding's point: the setting is real, or it should not exist.

## Decisions and interface changes

- **Two decisions go beyond the audit's recommendation, by instruction.** The audit proposed keeping
  "Workspace" for a client and renaming only the Settings tab; the orchestrator's decision is to
  retire "workspace" as a user-facing noun for a client entirely, because the narrower fix resolves
  the collision but leaves a client with two names. Likewise the audit proposed keeping "Creative
  partner" as the outward-facing term; the decision is "Designer", the word already used by the
  field, the button and the role badge.
- **`features/workspace/` keeps its directory name** — it is the application shell, not a client
  record. "Workspace" therefore survives in shell chrome only: the navigation landmark
  (`aria-label="Workspace navigation"`, which `brand-accessibility.spec.ts` depends on), the shell's
  loading and connection states (`Opening your workspace…`, `Workspace unavailable`), the global
  search field label (`Search your workspace`, which two specs depend on) and the `YOUR CREATIVE
  WORKSPACE` / `YOUR WORKSPACE` slogan eyebrows that J03-3 will delete. None of these names a client
  or the studio account.
- **The `/settings/workspace` URL was left alone.** The tab is labelled `Studio`; the route segment
  is not user-facing copy, and `intake-admin.spec.ts` navigates to it directly.
- **`versionStatusLabels` values** were chosen to be the same vocabulary as `statusLabels`:
  `submitted`→`Studio review` (= `statusLabels.internal_review`), `pending`→`In review`
  (= `statusLabels.client_review`), `approved`/`changes_requested` identical to the project labels,
  `draft`→`In progress`, `reviewed`→`Shared with client` (the words the publish action already uses).
- **J04-13** took the audit's second option (name the delivered figure on the home card) rather than
  the first (say "active" on the board), because the board's count includes delivered projects and
  calling it "active" would have made it untrue.
- No J03, J08, J09 or J05 change is in this diff. `app/globals.css` was not touched at all.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npm run check` | Local, 2026-09-21 ~05:08 UTC | Pass — typecheck, lint (the same 2 pre-existing warnings, 0 errors), format:check clean, vitest **412 passed / 28 files** (405/27 before, plus the 7 new tests). No existing test failed | Command output in session |
| `npm run build` | Local, 2026-09-21 ~05:09 UTC | Pass; all 27 routes compiled | Command output in session |
| Signed-in browser pass (agency) | Local `next start` on :3006 against the running Supabase, then stopped | Home: `Clients` tile and heading, `Monday, September 21`, `1 active project · 1 delivered`. Project canvas: version reads `Studio review` beside the project badge `Studio review` (was the bare token `submitted`). Reviews: filter `In review` and row `Sep 20 · In review` in sentence case. Files: `Files.` heading, `Working file` / `Delivery file`. Settings: tab `Studio`, `Studio details` | Playwright MCP accessibility snapshots in session |
| Vocabulary greps, one per row of the decision table | Local | Every retired term returns no user-facing hit | The per-finding table above |
| New unit tests | Local | 7 passed: `versionStatusLabels` covers exactly the six database-allowed values and agrees with `statusLabels`; instants render in the studio zone, calendar dates in UTC; empty-label behaviour | `apps/web/features/workspace/workspace-format.test.ts` |
| Fixture integrity | Local, via the signed-in home page and the seed file | **10 clients**, 24 active + 1 delivered = **25 projects**; `supabase/seed.sql` still has exactly 10 `clients` and 25 `projects` inserts. No SQL, seed or migration file was touched | Home overview; `grep -c "^insert into public.clients \|^insert into public.projects " supabase/seed.sql` |

## Remaining risks and next action

- **Four Playwright specs assert copy this batch renamed and will fail until their selectors are
  updated. No test file was modified, as instructed.** They are, with the exact replacement:
  - `tests/e2e/workspace.spec.ts:8` — heading `Client workspaces` → `Clients`
  - `tests/e2e/intake-admin.spec.ts:445` and `:462` — `Workspace updated.` → `Studio updated.`
  - `tests/e2e/intake-admin.spec.ts:759` — button `Awaiting review` → `With the studio`
  - `tests/e2e/production-workflow.spec.ts:24`, `tests/e2e/project-recovery.spec.ts:35`, `:41`, `:62`
    — `getByLabel("Artwork file")` → `getByLabel("Design file")`
- **No spec asserts a rendered date string** (the only date selectors are `getByLabel("Due date")` /
  `"Target due date"` on `<input type="date">`, which the timezone change does not affect), so the
  J04-3 behaviour change is not expected to break the suite. That is a source reading, not a run: the
  e2e suite was not executed here.
- The `:3003` container still serves a pre-batch-1 build and was not touched; Docker was not touched.
- Out of scope and deliberately left: the slogan eyebrows (J03-3), the loading-verb drift (J09-4),
  the duplicated `FormError` on the credits and briefings error pages (J09-2, the briefings one now
  says "this client" instead of "this workspace", but keeps its structure), tokens (J08) and
  duplication (J05).

## Ownership at handoff

All owned paths are complete and released. No background process was left running (the verification
`next dev` on :3005 and `next start` on :3006 were both stopped). No test file, SQL file, seed,
migration or `app/globals.css` rule was modified.

# Audit fixes — J03 minimalism and J09 state surfaces (batch 3)

- Updated at: 2026-09-21T05:45:00Z
- Reporting agent and tool: Claude (Claude Code)
- State: implemented and verified locally (`npm run check` + a signed-in browser pass against a
  throwaway `next dev` on port 3010). The Playwright suite was **not** run — see
  "Remaining risks", which names two specs that will need a dialog step.
- Commit: `e868ded` (code and architecture/feature documentation), plus this report.
- Objective: fix the five **J03** and five **J09** findings in
  `docs/verification/audit-j03-j04-j08-j09.md`, applying the orchestrator's decisions where they go
  further than the audit's own recommendation. J08 tokens and J05 duplication are later batches and
  were deliberately left alone.
- Owned paths: `apps/web/app/globals.css`, `apps/web/features/**` (files listed per finding),
  `apps/web/features/{workspace,settings,shared}/README.md`,
  `docs/architecture/design-system.md`, this report.
- Dependencies: batches 1 and 2 (`dc9248d`, `27d54c7`, `ac99cd3`) already on `main`; the running
  local Supabase stack. The container on `http://localhost:3003` was **not** touched, rebuilt or
  restarted, and Docker was not modified.
- Acceptance criteria: `npm run check` passes at 412 tests / 28 files; no existing test file
  modified; the deterministic fixture stays at 10 clients and 25 projects.

## One row per finding

| Finding | What it was | What changed | How it was verified |
| --- | --- | --- | --- |
| **J03-1** | `Working file` and `Complete delivery` both rendered `button primary` on `/assets`, simultaneously whenever `canDeliver` was true — precisely when the page matters most | `assets-page.tsx` — `Working file` is now `className={canDeliver ? "button" : "button primary"}`, so the delivery callout owns the one dominant action while it is up | Read the branch; **not** driven in the browser, because the seeded dataset holds zero rows in `delivery_files`, so `canDeliver` cannot be true against it. The default (no callout) state was seen live: `Working file` is still the page's primary |
| **J03-2** | The topbar stand-down was written for `.board-page` alone, so six sibling routes inside a client workspace kept a sticky full-width 64px bar holding nothing but the bell, directly above their own heading | `app-shell.tsx` adds `client-workspace` to `.workspace` whenever the route resolves to a client (`/clients/:id/*`, and `/projects/:id` through `useProjectClient`); `workspace.css` keys the stand-down on that class instead of `:has(.board-page)`. Each of those pages now renders `NotificationsBell` in its **own** header row, the way the board already did, with the new `page-bell` class; `globals.css` hides `page-bell` below 901px, where the topbar returns (it holds the only way into the navigation drawer) and carries the bell again. The board's private `@media (max-width: 900px)` copy of that rule was deleted in favour of the shared one. `NotificationsBell` gained an optional `className`. `.page-actions` is the shared wrapper for a header row that has other actions beside the bell; it becomes `display: contents` below 901px so the heading stacks exactly as before. `.project-page` now sizes against `--topbar-height` instead of a literal `64px`, which the stand-down would otherwise have left 64px short | Browser at 1440px on all six routes plus the board: `.workspace > .topbar` computes `display: none`, `--topbar-height` is `0px`, and the `page-bell` is visible at the right of each page's own header row. At 880px on `/assets` and `/reviews`: the topbar is back with its bell, `page-bell` is `display: none`, `.page-actions` is `display: contents`, exactly one bell is visible, and `document.documentElement.scrollWidth <= innerWidth`. `/home` (not a client workspace) keeps its bar, studio identity and bell |
| **J03-3** | Fifteen decorative eyebrows sat above an `h1` that already named the page | Deleted at `assets-page`, `reviews-page`, `brand-page`, `home-page`, `search-page`, `notifications-page`, `settings-page` (the dynamic `YOUR ACCOUNT`/`STUDIO ADMINISTRATION` one), `project-details`, `brand-sections` (×3), `invitation-acceptance` (×2) and `account-recovery` (×2). The two rules that existed only to position a slogan — `.page-heading .eyebrow` and `.brand-overview-hero > .eyebrow` — went with them | `grep -rn 'className="eyebrow"' apps/web/features` now returns only value labels: `{file.category}`, `{result.type}`, `{asset.category}`, `{item.category}`, `{data.format}`, `{campaignName(...)}`, `Available balance`, `Project credits used`, `Selected service`, `PRODUCT NN`, `PRIVATE DRAFT`, `{clientName}`, the typography card labels, and the two login-page lines the audit did not list. Browser: `/assets` and `/home` open on their `h1` |
| **J03-4** | `Save profile` and `Update password` both rendered `button primary` on the account screen | `account-settings.tsx` — `Update password` is a plain `button`; the page opens on profile details | `grep -n "button primary" features/settings/account-settings.tsx` → one hit |
| **J03-5** | **Rejected — nothing changed.** The audit called it inconsistent that `Try again` is `button primary` on `app/error.tsx` and a plain `button` in fourteen in-page panels | No change. On a full-page error screen `Try again` is the only action available, so it carries the page; in a panel beside working content it is secondary to what the page already offers. Flattening the two would delete a useful distinction rather than a drift. Recorded here so the next reader does not "fix" it | n/a |
| **J09-1** | Five empty-state languages, two showing identical copy: the board's Canvas notice (`.empty-state` **with** `Clear filters`) and its List row (`.board-list-empty`, **no** button) — so a viewer with an active filter and no results lost the only way back by switching view | `board-page.tsx` list view now renders `empty-state board-list-empty` with the same two headings, the same two paragraphs and the same `Clear filters` button; `.board-list-empty` shrinks to the one override it needs (no border/background, because the table already draws a frame around it). `credits-page.tsx`'s `.credit-note` empty row and `comment-panel.tsx`'s `.comment-empty` become `.empty-state`. `.kanban-empty` and `.version-empty` take a new shared `.empty-state-compact` modifier in `globals.css` and keep only their own slot geometry. `.credit-note` itself stays: `credit-actions.tsx` still uses it as a form hint | Browser: List view with `Status = Delivered` shows the dashed empty state, the heading, the paragraph **and** `Clear filters`; clicking it restores all seven SABRE projects. Kanban's empty columns render the compact modifier (1px dashed, `--radius-lg`, 11px, `min-height: 84px`). `.version-empty` keeps its exact `408 × 144` box. `.comment-empty` renders the shared frame in the 275px conversation panel. A client with no credit requests shows one `.empty-state` and zero `.credit-note` |
| **J09-2** | `/credits` and `/briefings` stated one failure twice — once as the `h1`, once through `FormError`, whose `role="alert"` announced it to a screen reader a second time. The briefings copy also said "this workspace" under a heading saying "Briefings" | Both now use a plain explanatory `<p>`, matching the five sibling routes. Briefings reads `These briefings are unavailable or you do not have access.` (batch 2 had already replaced "workspace" with "client"; this makes the subject the briefings themselves). The now-unused `FormError` import was removed from `briefings-page.tsx` | `grep -n "FormError" features/briefings/briefings-page.tsx` → none; `features/credits/credits-page.tsx` keeps it for the export error and the request-list error, which are genuine alerts |
| **J09-3** | The product's only `window.confirm` (`draft-editor.tsx`) against 15 `Modal` consumers, while the genuinely destructive actions had no confirmation at all | One rule now: an action that destroys data confirms, in the product's own dialog. `draft-editor.tsx` — leaving a dirty draft opens a `Modal` (`Keep editing` / `Leave without saving`) and navigates with `router.push`. `project-details.tsx` — removing a designer opens `Remove this designer?`; the panel's duplicate `FormError` moved into the dialog that now owns the action. `briefing-attachments.tsx` — removing an attachment opens `Remove this attachment?`, naming the file. `briefing-editor-details.tsx` — removing a deliverable opens `Remove this deliverable?`, naming it | Browser: all four dialogs open, name their target and cancel cleanly. Confirmed `Leave without saving` navigates to the templates route and leaves the stored draft name unchanged; confirmed `Remove deliverable` drops the row from an unsaved draft; cancelled the designer removal and re-read `.assignment-section` to confirm the assignment survived. `grep -rn "window.confirm" apps/web` → none |
| **J09-4** | Six verbs for one loading state, with `Gathering files…` and `Finding your brand files…` naming the same operation on two routes | Route loads now open with `Loading …`: `Loading settings…`, `Loading the board…`, `Loading the project…`, `Loading your workspace…`, `Loading the Brand Hub…`, `Loading your draft…`, `Loading your briefing…`, `Loading files…`, `Loading reviews…` (the four already saying `Loading …` are unchanged). `brand-assets.tsx` now says `Loading brand files…`, the same operation phrased the same way as the files route. The softer phrasings that describe a check rather than a fetch were kept: `Checking your invitation…`, `Checking your session…`, `Checking balance…`, and the search page's `Looking through your workspace…`, which is a search rather than a route load | `grep -rn "PageStatus>" apps/web/features` → every route load starts with `Loading` |
| **J09-5** | `PageStatus` and `.centered-state` both meant "this route is loading"; `app-shell.tsx` said `Opening your workspace…` in one layout while `home-page.tsx` said `Gathering your workspace…` in the other, on consecutive frames of one navigation | The shell's loading branch renders `<main className="main-content"><PageStatus>Loading your workspace…</PageStatus></main>`, so the shell's wait and the first route's wait are the same component, the same layout and the same words. `.centered-state` was **not** moved into the shared layer — `features/shared/README.md` records it as rejected for wrapping arbitrary children, and that reasoning stands — it keeps the pre-shell surfaces (`app/login`, `app/auth/invite`, `app/auth/recovery`, `app/error`, `app/not-found`, `auth-provider`) and the shell's own failure state. The `<main>` landmark is preserved, so the loading frame is still inside a landmark | Read the rendered branch; the shared README's rejected-candidates entry was corrected (it said "3 call sites"; there are 7) and its `PageStatus` entry now names the `app-shell` consumer and the copy rule |

## Documentation updated in the same change

- `docs/architecture/design-system.md` — the "Workspace topbar" paragraph described
  `.workspace:has(.board-page)`, which no longer exists; it now describes the `client-workspace`
  keying and the `page-bell` / `page-actions` contract. Added a paragraph stating the empty-state,
  compact-modifier, `Loading …` and state-the-failure-once rules, and one stating that an action
  which destroys data confirms through `Modal` and that `window.confirm` is not used.
- `apps/web/features/workspace/README.md` — new section documenting the stand-down, since this
  feature owns `.topbar` and `workspace.css`.
- `apps/web/features/shared/README.md` — `PageStatus` consumers and copy rule; `centered-state`
  rejected-candidate entry corrected and scoped.
- `apps/web/features/settings/README.md` — removed `eyebrow` from the list of `globals.css` classes
  that feature consumes; it no longer does.

## Checks actually executed

| Check | Result |
| --- | --- |
| `npm run check` (typecheck + eslint + prettier + vitest) | **Pass** — 412 tests / 28 files, formatting clean, 0 lint errors. The 2 lint **warnings** (`board-canvas-controls.tsx` exhaustive-deps, `board-nodes.tsx` unused `ArrowLeft`) are pre-existing on `ac99cd3` and in files this batch did not touch |
| Signed-in browser pass, `next dev` on port 3010, stopped afterwards | Agency and client roles; the six J03-2 routes plus board, project, briefing editor, briefing detail and draft editor at 1440px; `/assets` and `/reviews` at 880px; `/home` as the control |
| Fixture counts, read from the local Postgres after the pass | `10 clients, 25 projects` — unchanged. `briefing_attachments` is still 0; the template draft edited during the dialog check is byte-identical |
| Playwright | **Not run.** The container on `:3003` predates this batch by instruction, and rebuilding it was out of scope |

## Remaining risks — two Playwright specs will need a dialog step

The J09-3 confirmations change two flows that existing specs drive as one click. **Neither spec was
modified**, per instruction; the orchestrator decides whether the confirmation or the spec is right.

1. `apps/web/tests/e2e/workspace-actions.spec.ts:205` —
   `page.getByRole("button", { name: /Remove .+ from project/ }).click()` then expects
   `Not assigned yet` immediately. It will now need to confirm `Remove designer` in the dialog first.
2. `apps/web/tests/e2e/intake-admin.spec.ts:162` —
   `page.getByRole("button", { name: "Remove launch-reference.png", exact: true }).click()` then
   expects the attachment gone. It will now need to confirm `Remove file`.

A third site, `intake-admin.spec.ts:112`
(`Remove Instagram Reels / Variation 3`), is also affected and needs a `Remove deliverable`
confirmation. **This one carries a judgement the orchestrator should make**: the audit describes
`briefing-editor-details.tsx:147` as "removes a file on one click", but it does not — it removes a
**deliverable row from the unsaved local draft**, discarding whatever was typed into it. It was given
a confirmation because the instruction named that exact location and the rule is "an action that
destroys data confirms"; if a draft row is judged not to be data, this is the one of the four to drop.

`design-audit.spec.ts:111` (`Remove pending pin`) was **not** given a confirmation: it removes an
unplaced pin from a draft comment, which is an editing gesture rather than a destructive action.

## Left deliberately untouched

- **J03-5** — rejected on the merits; see the row above.
- **J08 (tokens) and J05 (duplication)** — later batches. Noticed and not touched: the
  `border-radius: 10px` on `.kanban-empty` disappeared only because that rule was replaced by the
  shared modifier, and `.project-page`'s literal `64px` changed only because the stand-down would
  otherwise have mis-sized the page. Nothing else token-shaped was altered.
- The React Flow attribution rules around `app/globals.css:734-743` — another session owns that.
- `apps/web/features/workspace/README.md`'s historical "App shell caution" section — it records what
  an earlier task found and decided, not a claim about the current tree.
- No test file was modified; no test was deleted. No new test was added: every finding in this batch
  is markup, copy or CSS, which the unit suite does not reach, and the e2e suite is the
  orchestrator's to run.

## Next required action

The orchestrator runs the Playwright suite against a container rebuilt from `e868ded`, then decides
on the three confirmation/spec conflicts above (and specifically on whether a draft deliverable row
should confirm). After that, batches for J08 and J05 remain.

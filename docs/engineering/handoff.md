# Codex / Claude continuation checkpoint

Updated: 2026-09-20 (final fix wave). Maintainer: the active orchestrator.

## Final fix wave — repository structural refactor, closed

Applied after the final whole-branch review, as the last code change before handover. Full report:
[`.superpowers/sdd/2026-09-20-repository-structural-refactor/final-fix-report.md`](../../.superpowers/sdd/2026-09-20-repository-structural-refactor/final-fix-report.md).

- **Fix 1**: `briefing-detail.tsx`'s and `assets-page.tsx`'s inline invalidation arrays now call the
  owning features' helpers (`useInvalidateWorkspace()`, `useInvalidateNotifications()`) wherever the
  helper's key set matched exactly. `credit-account`/`credit-ledger` stayed explicit inline rather
  than going through `useInvalidateCredits()`, because that helper also covers `credit-requests` —
  using it would have widened the invalidation, so it was not used, per the brief's own rule.
- **Fix 2**: `settings/settings-data.ts`'s `useInvalidateWorkspace()`/`workspaceQueryKeys` renamed to
  `useInvalidateWorkspaceSettings()`/`workspaceSettingsQueryKeys` to remove the naming collision with
  `workspace/workspace-data.ts`'s unrelated, disjoint-cache hook of the same old name. Only consumer
  (`workspace-settings.tsx`) updated; `workspace-data.ts` untouched.
- **Fix 3**: `.project-origin`/`.project-symbol` (single consumer: `workspace/home-page.tsx`) moved
  verbatim, same relative order, from `globals.css` into `workspace/workspace.css`.
- **Fix 4**: `.workspace-status` (zero `.tsx` consumers, re-verified) deleted from `globals.css`.
- **Fix 5**: `design-system.md`'s `.sidebar-collapse` justification corrected — the 640px
  `.icon-button` cascade-order claim doesn't hold because `.sidebar-collapse` is already hidden at
  900px, a superset range. The rule stays in `globals.css` for the real reason: a grouped dual-class
  selector sharing an element with the `.icon-button` primitive.

Verification, all run this session: `npm run check` — **391 tests / 25 files**, unchanged.
`grep -rn '\.from(\|\.rpc(\|\.storage\.' apps/web/features --include='*.tsx' | grep -v
'Array\.from('` — empty. `npm --prefix apps/web run test:e2e -- design-audit brand-accessibility
workspace-actions intake-admin` against the already-running rebuilt container on port 3003 (not
restarted, not touched) — **14/14 pass**. `docs/verification/design-audit.json` diff against the
committed version is `capturedAt` only — every measured figure byte-identical, confirming the CSS
moves didn't change the cascade. The regenerated `design-audit.json` and screenshot PNGs were left as
the run produced them and are **not** staged or committed, per instruction.

No unresolved risk from this wave. Next action: none required; ready for handover.

## Ownership and purpose

- Current writer: **Claude Code, from 2026-09-20T09:51Z**, owning `apps/web`, `compose.yaml`, `supabase/`, and the verification/acceptance documentation. Task: reconcile the tree, establish a real functional baseline, and continue the remaining acceptance work.
- Transfer condition was met before this session wrote to shared integration files. The outgoing Codex run (process 47025, started 03:39) was observed still creating `apps/web/features/workspace/topbar-tools.tsx` and `client-identity.tsx` at 05:48; the user stopped it and it exited at 05:51:33. Its in-progress topbar/identity refactor was preserved, not reverted, and `npm run check` passes on the combined tree.
- Earlier transfer condition, retained for history: the outgoing Codex run and any workers editing the same paths have stopped. The incoming orchestrator records its name, time, and task here before writing.
- Only `/root` appeared in the current conversation's agent listing. The user named `/root/product_architecture`, `/root/design_reference`, and `/root/backend_foundation`, but their original threads and final reports are unavailable in this conversation. This does not establish whether unrelated sessions are still active.
- This checkpoint reconstructs project context from files on disk. It is not an export of the earlier agent conversations. No new product implementation or release is authorized by the acknowledgement itself.
- Git history starts at the `main` baseline commit recorded on 2026-09-20, which captured the implementation exactly as it stood. Work after that point is reviewable with `git diff` and `git log`. The baseline was committed with `--no-verify` after a manual `gitleaks` scan, because the repository-wide Prettier gap would otherwise have rewritten unrelated files. That gap is now closed: the tree is formatted, `format:check` runs inside `npm run check`, and later commits no longer need `--no-verify`. Re-anchor any `eslint-disable-next-line` you add — reformatting moves the element it points at, which silently turns the directive into a no-op and lets the rule fire again.

## Objective that must survive the tool switch

Finish the existing Creative Canvas application for Dawes Studios, with real persistence and complete agency/client/designer workflows. Continue the [implementation plan](../architecture/implementation-plan.md) and [acceptance matrix](../architecture/acceptance-matrix.md). The product remains in progress. As of 2026-09-20 09:55Z the matrix holds 41 Verified and 75 Unverified rows; see the state section below.

The root instructions and linked architecture/setup guides establish these decisions:

- Standard Next.js App Router and Node.js server in `apps/web`; xyflow for board/project canvases; Supabase in Docker for Auth, PostgreSQL, Storage and realtime; trusted publication/delivery processing in `apps/media`.
- Backend-enforced tenant and role isolation. Client payloads exclude designer identity, assignments, internal comments, source metadata and unpublished artifacts. Only the agency publishes immutable client snapshots.
- Free briefing submission; atomic, idempotent budget acceptance creates one project and one debit, rejecting insufficient balance. Explicit campaign selection and private owner-scoped template drafts remain required.
- Deterministic acceptance baseline: exactly 10 clients and 25 projects, realistic related data, all required workflows and final visual/accessibility review. A successful build is insufficient.
- English for project content and artifacts; Brazilian Portuguese only for direct user chat. Preserve `docs/ref` and `brand`. Keep `AGENTS.md` and `CLAUDE.md` synchronized.

## Read in this order

1. [Root instructions](../../CLAUDE.md) and [orchestration procedure](agent-orchestration.md).
2. [Implementation plan](../architecture/implementation-plan.md) and [acceptance matrix](../architecture/acceptance-matrix.md).
3. Relevant domain guidance: [domain](../architecture/domain.md), [permissions](../architecture/permissions.md), [backend](../architecture/backend.md), [design system](../architecture/design-system.md), and feature README files.
4. Relevant evidence: [security](../verification/security-audit.md), [frontend findings](../verification/frontend-review.md), [design audit](../verification/design-audit.md), and [runtime cleanup](../verification/runtime-cleanup.md).
5. [Web setup](../../apps/web/README.md), [media setup](../../apps/media/README.md), and the package scripts before running commands.

## Domain routing for the earlier agent names

The associations below are navigation aids reconstructed from the current tree and plan. They are not recovered ownership records or signed reports from the named agents.

| Earlier name / responsibility | Existing context and implementation | Next integration need |
| --- | --- | --- |
| `/root/product_architecture` / product and intake | `docs/architecture/`; `apps/web/features/briefings/`, `credits/`, `settings/`; `apps/web/tests/e2e/intake-admin.spec.ts` | Reconcile intake/admin evidence and map actual results to acceptance rows. |
| `/root/design_reference` / design and references | `docs/architecture/reference-map.md`, `design-system.md`; `docs/verification/design-audit.md`, `frontend-review.md`; Brand Hub and shared styles | Recheck outstanding visual/logic findings and rerun the corrected browser scenarios. |
| `/root/backend_foundation` / backend | `supabase/migrations/`, `supabase/tests/`, `supabase/scripts/`; `apps/media/`; `docs/architecture/backend.md` | Reconcile policy, concurrency, media, fixture and recovery evidence against current files. |
| Orchestrator / integration | `apps/web/app/`, feature composition, root tooling, implementation plan and matrix | Establish the stable current state, integrate evidence, and own final acceptance. |

Future workers save actual reports in [handoffs/](handoffs/README.md). Do not backfill fictional reports for these unavailable threads.

## Existing evidence and unresolved work

These are historical claims from the linked files, not checks rerun during this handoff:

- The implementation plan records a successful Next.js production build, the three-role publication/revision/delivery journey, and a combined three-test navigation/workflow run. It explicitly leaves the full gate incomplete.
- The security report records clean dependency and candidate-file secret scans and a successful web container HTTP check. Database/HTTP/browser verification after the final fixture reset remains pending there.
- The runtime cleanup report records earlier type/build/lint failures. The later plan claims a passing build. Reconcile the current files and commands instead of treating either historical snapshot as definitive for today's tree.
- The design audit records three passing Brand tests and 42 captured surfaces, with a failing broad audit and pending corrections/reruns. Remaining topics include briefing/credit contrast, mobile credit overflow, canvas link naming/readability, long version notes, staged upload failure recovery, and production captures.
- The frontend review identifies measured version layout, contextual project controls, upload retry cleanup, and exact Brand asset search destinations. It distinguishes accepted corrections from final verification; inspect current code before changing it again.
- `docs/operations/seed-evidence.json` and `restore-evidence.json` exist. Their presence alone does not verify the current dataset or recovery state.
- Map current evidence to individual rows before marking them Verified; do not mark the whole application complete from a passing suite. A green gate proves the scenarios the suite covers, not the rows it never exercises.
- During its acknowledgement, Claude observed `apps/web/tests/e2e/intake-cleanup.tmp.spec.ts`, which was absent from the earlier test-file inventory and absent again at the orchestrator's follow-up. Treat this as a possible concurrent workflow: reconcile outgoing sessions and inspect the file if it reappears before changing it. No other session was stopped by this continuity task.

## State at 2026-09-20 09:55Z

Steps 1 to 4 of the previous list are complete; the detail is in [the baseline reconciliation report](handoffs/2026-09-20-claude-baseline-reconciliation.md) and the [implementation plan](../architecture/implementation-plan.md).

Every documented suite now passes on the current tree, including **25 of 25 browser tests** (24 of 24 at the time this section was first written; the suite gained a test and the figure is corrected here to match today's tree — see "Repository structural refactor: Phase C closed" at the end of this file for the count as of the refactor's close), and the dataset holds exactly 10 clients and 25 projects (20 at the time this section was first written; the seed generator was later rewritten to expand SABRE from two projects to seven) with no orphaned parents or leftover fixtures. Two defects were found and fixed: the invitation endpoint rejected every browser request in the container because it derived its origin from the server bind address, and earlier browser evidence had been measured against a container image older than the source. Codex's topbar/identity refactor was preserved and integrated, not reverted.

A passing gate is not a finished product. **75 acceptance rows remain Unverified**, and deployment, TLS and outbound SMTP remain unconfigured.

## Next actions, in order

1. Work through the remaining Unverified acceptance rows by domain, attaching the specific command or scenario to each row rather than citing the suite as a whole. The C, E, F and I families hold the largest gaps.
2. Cover the states the current suite does not reach: I04 and I05 transport failure, permission loss and interrupted writes; I07 responsiveness on the full dataset; G12 manual-copy fallback.
3. Complete the J family visual review at the documented widths against the rebuilt container, then refresh `docs/verification/design-audit.json` from one uninterrupted run.
4. Reconcile container restart and restore-drill evidence, and retire the stray `dawes-web-acceptance`, `dawes-media-acceptance` and `supabase_*-restore-drill` stacks once their evidence is recorded.
5. Keep deployment, TLS and SMTP explicitly out of scope until requested; this checkpoint publishes nothing.

Commands below are verified against the package manifests or backend guide. Unlike the earlier continuity task, **all of them were executed in the 2026-09-20 09:55Z session and passed**:

```bash
# Repository root; use the setup guides for prerequisites.
git status --short
npm run check
npm run build
npm --prefix apps/media test
npm run db:test
python3 supabase/tests/http_auth_storage_test.py
npm --prefix apps/media run test:integration
npm run test:e2e
```

Browser and integration suites require the local Supabase, media and web services, provisioned synthetic accounts, and ignored local configuration. Their mutations must use guarded fixtures and cleanup. Consult existing guides rather than copying credentials into this file.

## This continuity task

Implemented: persistent checkpoint, per-agent report template, transfer procedure, README navigation, and synchronized Codex/Claude instructions. Checked so far: repository/doc/script inspection; current agent listing; installed Claude Code version `2.1.278`; Claude authentication reports logged in. Product tests were not rerun.

Verified: Claude Code read the instructions, checkpoint, orchestration procedure, report template, implementation plan and acceptance matrix, then returned a successful read-only acknowledgement (process exit 0, no reported permission denials). Its response and limitations are saved in [the Claude handoff receipt](../verification/claude-handoff.md). The invocation did not retain a resumable session; future Claude sessions read the current shared files.

Documentation validation confirmed identical root instruction files, resolving relative links, existing documented package scripts and browser test paths, an unborn Git branch, and 110 Unverified acceptance rows. No product tests were rerun. The acknowledgement confirms receipt of context, not correctness of the implementation or automatic quota-based takeover. The incoming orchestrator still owns the reconciliation and verification steps above.

## Workspace topbar consolidation (2026-09-20)

**Superseded — read this before acting on anything below.** This entry describes a portal slot at
`features/workspace/topbar-tools.tsx`, a `--workspace-chrome` custom property, and a second tool row
below 1100 px, all as implemented. They are not: see "Board identity header; the topbar stands down;
Planning sized for its Kanban" at line 599 below, whose "Changed" section records both
`topbar-tools.tsx` and `--workspace-chrome` as **deleted**, deliberately, later the same day.
`client-identity.tsx` from this entry is also gone — it is now `client-mark.tsx`. The board carries
the client mark in its own header; the topbar carries only global chrome (notifications, and the
studio name outside a client workspace). This exact contradiction already cost one agent a full
wasted round hunting through the tree for a file this entry implies still exists. Read the later,
correct section first if you need current topbar/board structure; treat everything below this marker
as historical intent, not the current tree.

Owner: Claude Code, as orchestrator, implementing directly rather than delegating; no worker reports were produced for this task.

Implemented: the client workspace topbar now carries the client's brand mark and name in place of the studio/client breadcrumb, and the board's header and toolbar rows were folded into it. Pages contribute controls through a portal slot (`features/workspace/topbar-tools.tsx`); the board contributes search, a filter popover, the result count, the view selector and the primary action. The duplicated client name was removed from the board, briefings and credits headings. `--workspace-chrome` now derives the canvas height from the measured chrome, and the topbar reserves a second tool row below 1100 px.

Changed: `apps/web/features/workspace/{app-shell,topbar-tools,client-identity}.tsx`, `apps/web/features/board/board-page.tsx`, `apps/web/features/brand/brand-data.ts`, `apps/web/features/{briefings/briefings-page,credits/credits-page}.tsx`, `apps/web/app/globals.css`, and [the design system](../architecture/design-system.md).

Verified in this session: `npx tsc --noEmit`, `npm run lint` and `npm test` (109 unit tests — historical count for this 2026-09-20 session; stale as a current figure. It is **391 tests across 25 files** as of the refactor's close — see "Repository structural refactor: Phase C closed" at the end of this file) pass. The Playwright suite ran against a development server on port 3010: 23 passed, and `production-workflow.spec.ts` failed at the share-version dialog with `Failed to fetch`. That failure is environmental — the media service allows only `APP_ORIGIN=http://localhost:3003`, and a request carrying the port 3010 origin returns 403 while the same request from port 3003 returns 200. The spec passes against the container on port 3003. Re-run it from an allowed origin before treating any production-workflow row as evidence. Layout was measured at 1440, 1200, 1100, 1000, 900, 700 and 390 px with no horizontal or vertical overflow, and the `design-audit` accessibility spec passes.

Not done: the acceptance matrix rows remain as they were; no fixture, container or deployment state was changed.

## Board canvas: two columns, one project row per campaign (2026-09-20)

Owner: Claude Code, as orchestrator. This entry covers the orchestrator's own geometry work; two
delegated agents were dispatched afterwards and file their own reports under `handoffs/`.

### Implemented

The board canvas is now a two-column layout instead of a single stacked column.

- Planning (Timeline and Kanban) occupies the left column at `x = 0`. Its width never falls below
  `PLANNING_MIN_W` (880 px), which is what the calendar grid needs before it scrolls sideways; a
  viewport narrower than both columns pans rather than crushing the calendar.
- Campaign frames stack down the right column. Every campaign holds its projects in a **single
  row**, so a frame is as wide as that row and the next campaign sits below the previous one.
- A frame is as wide as its own row, floored at `MIN_ROW_CARDS` (3). Two projects plus the briefing
  slot is the shape of a seeded campaign and lands exactly on that floor, so in practice the column
  reads as one straight block — while a campaign that grows past it extends on its own instead of
  widening every quiet campaign beside it. Sizing all frames to the busiest row was tried first and
  rejected: one eight-project campaign would have left every other frame mostly empty.
- Planning's height grows with its lane count (`planningContentHeight`) and is capped by the
  campaign column's total height. It no longer stretches to match a column it cannot fill, which is
  what left a two-project calendar sitting in an empty frame.
- Below `TWO_COLUMN_MIN` (820 px of usable width) the board falls back to the previous single
  stacked column; below 640 px the separate list layout still applies.

Entering or returning to a board now fits the view to the whole board. The fit is computed from the
frame geometry (`boardFit`) rather than requested from xyflow's `fitView`, so it does not depend on
whether rendering had finished, and it is gated on the canvas having actually been measured — a fit
computed against the initial 1280x800 guess would frame the board for a viewport that never
existed. The fit stops at the canvas `minZoom` (0.4) rather than shrinking a ten-campaign board to
an illegible scale; the remaining height pans. The former "Reset view" control is now "Fit board to
view" and runs the same computation.

### Changed

`apps/web/features/board/board-layout.ts`, `board-layout.test.ts` and `board-page.tsx`.

### Verified in this session

`npm run check --prefix apps/web` passes: typecheck, lint, Prettier and 154 unit tests (41 of them
in `board-layout.test.ts`, up from 23). Both the web and media containers were rebuilt together and
reported healthy. Geometry was read back from the rendered DOM at 1600x1000 against the seeded
data: Planning at `x=0` width 880, campaigns at `x=900` width 920, project cards at `+20/+320/+620`
within their frame — one row — and the second campaign at `y=300` below the first at `y=0`.

### Not verified

The fit-on-entry fix and the bounded Planning height were completed after that capture and have
**not** yet been observed in a browser; the screenshot that prompted them showed the pre-fix state.
The Playwright suite was not re-run after these changes. No acceptance rows were moved.

### Delegated, in flight

- Planning frame UX/UI (owns `project-timeline.tsx`, `board-kanban.tsx`, `timeline.css`,
  `timeline-model*`).
- Card interaction — single click selects, double click opens the project inside the Planning frame
  (owns `board-nodes.tsx`, `board.css`, `board-page.tsx` as of this entry).

Both were told not to run the browser suite, because it mutates the shared seeded baseline and the
orchestrator coordinates it. The card-interaction change is expected to invalidate the e2e
expectations that click a project card to navigate; that agent reports the call sites rather than
editing them.

### Project card thumbnails — data investigation (2026-09-20)

Queried against the running local database so the delegated agent would not have to guess:

| Viewer | Source | Bucket | Policy |
| --- | --- | --- | --- |
| Agency, assigned designer | `designs.internal_asset_path` | `internal-assets` | `private.can_produce` |
| Client | `published_designs.asset_path` | `published-assets` | `private.can_client_channel` |

`project_assets` is not a usable source: two rows in total, and its policy is `can_produce`, so a
client cannot read it at all. All five storage buckets are private, so a thumbnail needs a signed
URL; `features/brand/brand-assets.tsx` already establishes that pattern and is the precedent to
follow.

**Coverage gap, open for a product decision.** Of the 20 seeded projects, only 5 have a design with
`internal_asset_path` set and only 4 have a published `asset_path`. About 75% of cards will show the
fallback rather than artwork. The card work therefore treats the fallback as the common case. The
alternative — seeding artwork for every project so the board looks realistic — would change the
verified baseline counts that section B of the acceptance matrix records (designs 41,
design_versions 35, and the storage objects behind them), so it is deliberately **not** being done
as a side effect of a UI task.

### Planning frame UX — delegated agent integrated (2026-09-20)

Report: [planning-frame-ux](handoffs/2026-09-20-planning-frame-ux.md). The agent owned
`project-timeline.tsx`, `board-kanban.tsx`, `timeline.css` and `timeline-model*`.

**Root cause of the stray line, verified.** `globals.css` carried a `.timeline-row` block from an
activity timeline that had already been removed from the markup. Its `::before` drew a 1 px vertical
connector at `left: 95px`, and its `padding: 18px 0` meant the calendar's sticky label only covered
the part inside the content box — the inherited padding bands above and below each row showed the
rest. That is the segment the product owner photographed. The calendar's classes were renamed to
`timeline-lane` / `timeline-lane-head`, and a unit test now fails if `.timeline-row` reappears in the
calendar's stylesheet.

The orchestrator removed the dead `.timeline-board`, `.timeline-row*`, `.timeline-date` and
`.timeline-dot` rules from `globals.css` after confirming no markup under `apps/web` references them
(1131 bytes).

**Interface requests applied to `board-layout.ts`** — these were the agent's measurements against
the rendered frame, and leaving them unapplied would have made Planning size itself for chrome that
no longer exists:

| Constant | Was | Now |
| --- | --- | --- |
| `LANE_H` | 88 | 56 |
| `PLANNING_CHROME` | 200 | 152 |
| `PLANNING_MIN_H` | 420 | 280 |

Measured effect: fully visible lanes went from 1 to 4, and the calendar no longer overflows its own
scroll region at two lanes (`clientHeight` 267 / `scrollHeight` 277 before, 327 / 327 after).

**Documentation correction.** `design-system.md` claimed all status chrome is monochrome. Checking
`git show HEAD:apps/web/features/board/timeline.css` confirmed the calendar already used olive
(`#4e5f39`, `#dce1d2`) and amber (`#795b23`, `#faf0de`) before this session, so the claim was
already stale and the agent extended existing families rather than introducing a palette. The rule
is now scoped: badges differentiate by shape and tone, the calendar bar is the documented exception,
and hue is additive because the bar also carries its status in text.

**Verified after integration:** `npm run check --prefix apps/web` passes with 181 unit tests across
9 files. **Not verified:** density above four lanes against real data — every seeded client holds
exactly two projects, so the agent measured that case by cloning DOM rows; and the rendered
scrollbar, because headless Chromium on this host uses overlay scrollbars. The browser suite was not
run.

### Card interaction, thumbnails and full-suite verification (2026-09-20)

Report: [board-card-select-and-open](handoffs/2026-09-20-board-card-select-and-open.md).

**Behaviour.** One click on a project card selects it and nothing more; a double click opens that
project inside the Planning frame, which now has three states — Timeline, Kanban, and one open
project — with a `Back to Timeline` / `Back to Kanban` control named after the view it returns to
and an `Open full view` link to the standalone route. The frame renders `ProjectPage` itself rather
than a summary, so role isolation stays defined in one place. Cards carry a thumbnail from
`designs.internal_asset_path` for the agency and assigned designer and `published_designs.asset_path`
for a client; browser verification confirmed a client is served a `published-assets` path and never
an internal one.

**Two defects the agent found and fixed.** A double click failed on any card that was not already
selected: `adoptUserNodes` keeps `measured` only for reference-equal node objects, and this board
rebuilds them, so the selecting click left the card with no dimensions and the second `pointerdown`
landed on the pane. Every node now carries explicit `width`/`height`. Separately, the board never
fitted itself on load — the orchestrator's `ResizeObserver` was attached in an effect that ran while
the component still returned its loading state, so the ref was null and the effect, keyed on
`layout`, never ran again. A callback ref fixed it; the board now opens at `scale(0.720879)` at
1600x1000, measured from the rendered viewport transform.

**Interface request applied to `board-layout.ts`.** `StackInput` gained `planningProject`, and
`buildStack` now reserves `PLANNING_PROJECT_MIN_H` (640) for an open project in **both** layouts —
stacked included, where it also pushes the campaigns down, which the agent could not do from its own
files. The temporary `planningFrameHeight` shim in `planning-view.ts` was deleted and its four unit
tests were replaced by four in `board-layout.test.ts` that cover the rule where it now lives.

**Title consistency.** The calendar had started dropping the shared client-name head from lane
labels while the campaign cards still showed it, so the board read inconsistently. The cards now
reuse `sharedTitlePrefix` / `distinctTitle` rather than repeating the rule; the full title remains
the card's accessible name and its tooltip.

**Browser suite.** Four call sites clicked a card to navigate and were updated: both in
`workspace.spec.ts` use `dblclick`, and the two `design-audit.spec.ts` captures follow the double
click with `Open full view` so the `project` capture keeps meaning the standalone route rather than
quietly becoming a picture of the board. One genuine test defect was fixed: the drag-persistence
assertion in `workspace-actions.spec.ts` compared a `board_position` stored in canvas coordinates
against a `boundingBox()` offset in rendered pixels. That only held while the board sat at zoom 1,
which it did only because the fit was broken; it now converts through the canvas zoom and allows
one pixel. A new test covers the interaction itself, and was mutation-checked — asserting the old
navigate-on-single-click behaviour makes it fail.

**Verified in this session:** `npm run check --prefix apps/web` passes with 181 unit tests across 9
files. The full Playwright suite passes **25/25** against the rebuilt containers, and the
eight-table baseline is identical before and after: clients 10, projects 20, notifications 11,
design_versions 35, designs 41, campaigns 10, briefings 23, Auth users 13.

**Baseline corruption found and repaired.** A stray `Test` campaign on Acme (created 16:38Z, no
projects or briefings) had inflated campaigns to 11; it was removed after confirming it had no
dependents. Two `Acceptance production` fixtures leaked from runs that failed before their `finally`
block and had inflated projects to 22, briefings to 25 and notifications to 15; they were removed
through the audited `cleanupTestProject` path rather than by hand-written SQL. Five suite failures
were caused by that pollution, not by the code — `canonical-workspaces` asserts exactly twenty
projects. A suite run is only evidence when the baseline is counted on both sides.

### One rule for opening a project; the frame's third state removed (2026-09-20)

The product owner reversed the in-frame project view and asked for one consistent gesture across
the board. Implemented directly by the orchestrator.

**Behaviour.** Everywhere a project appears on the board — the campaign card, the calendar lane and
the Kanban card — a single click selects and a double click opens that project's own canvas at
`/projects/:id`. The rule lives in `features/board/project-open.ts` (`projectHref`, `openLabel`,
`selectOrOpen`) rather than being written three times, which is how the three surfaces would drift
apart. A double click is invisible to the keyboard and to assistive technology, so every surface
also carries an explicit link named by `openLabel`.

**Removed.** `planning-project.tsx`, the `Back to Timeline` / `Back to Kanban` control, the
`Open full view` link, `planningView` and `planningBackLabel`, `PLANNING_PROJECT_MIN_H` and
`StackInput.planningProject`, and 1180 bytes of `board.css` — including the override that hid
`project-page`'s own back link, a workaround that had no target once the frame stopped rendering a
project. Planning is two states again.

**Accessibility improved on the way.** Each calendar lane used to hold two links to the same
project, so a screen reader read the row twice. There is now one link per lane, carrying the full
description the bar used to duplicate; the bar is the lane drawn on the grid and no longer a
control.

**Kanban sizing defect found by looking.** With the calendar's measurement driving the frame, a
two-project board gave Planning 280 px while a Kanban column needed 299, cutting the second card in
half. Measured against the rendered board — 24 px column padding, a 36 px sticky heading, 79 px
cards, 10 px between them — Planning now takes `KANBAN_MIN_H` (420) in Kanban mode, in both layouts.
Verified after the change: column `clientHeight` 327 equals `scrollHeight` 327, with zero clipped
cards. A unit test also covers the stacked layout, where the reserved height has to push the
campaigns down; without that the frame would have drawn over the first campaign.

**Verified in this session:** `npm run check --prefix apps/web` passes with 182 unit tests across 10
files. The full Playwright suite passes **25/25** against rebuilt containers. The Kanban was also
driven in a browser for all three gestures: one click stays on the board and selects, two clicks
land on `/projects/:id`.

**Baseline drift traced, not assumed.** After one suite run the baseline showed +1 project, +1
briefing and +1 notification although every test passed. Re-running from that state produced **no
further drift**, which proves the suite creates and removes its own fixtures; the extra rows are a
briefing titled `T` (service `guidelines`, accepted) and its project on the seeded Acme workspace,
created manually in a browser during the earlier run's window. They are left in place pending the
owner's decision, because deleting work someone created is not a cleanup the orchestrator makes on
its own. While they exist, `canonical-workspaces.spec.ts` fails — correctly, since it asserted
exactly ten clients and twenty projects at the time (the seed generator was later rewritten to
expand SABRE from two projects to seven; the same guard now enforces ten clients and twenty-five
projects).

### Why the calendar carried no information (2026-09-20)

The product owner reported that the timeline looked fixed and that a project dated in another month
could not be seen. Investigation found the report accurate and understated. Three facts, each
confirmed by direct query rather than inference:

| Measured | Value |
| --- | --- |
| Distinct `projects.start_date` values across all 21 rows | **1** (`2026-09-20`) |
| Projects that fit entirely inside a 14-day window | **1 of 21** |
| Projects whose artwork sits on the latest version of its deliverable | **1 of 21** (5 have artwork at all) |

`supabase/seed.sql` hard-codes the same `start_date` for every project and staggers only the due
date. Combined with the fixed fortnight (`DAYS = 14`, a module constant in `project-timeline.tsx`
with no setter anywhere), every lane draws the identical bar: it begins on Sep 20, runs to the right
edge and is clipped. The one fact that distinguishes one project from another — the due date — is
off-screen for all of them. The user's test project was not invisible; it rendered as
`planned clipped-end`, which is why "I can't see it" was about extent, not presence.

Two further findings the report did not mention:

- **The calendar never draws a campaign at all.** Lanes are built from `projects` only; the campaign
  appears solely as a text sub-label under the project title. Campaigns run 61 days, 4.36× the
  window, so the calendar cannot show the span its own campaigns occupy at any page count.
- **One short title switched off shortening for the whole board.** `sharedTitlePrefix` requires
  *every* title to agree on the prefix, while its own doc comment claims "at least two lanes agree".
  Adding a project called `T` therefore restored the repeated `Acme / ` head on every other lane.

**The card would have produced exactly the wrong feedback it was meant to fix.** `useProjectThumbnails`
orders `designs` by `created_at desc` with no join to `design_versions`, so it is version-blind and
already shows V1 artwork for 4 of the 5 projects that have any. Implementing "thumbnail of the latest
version" literally would have dropped the board from 5 thumbnails to 1. The approved rule is instead
to show the newest version that *has* artwork and to let the badge name that same version, from one
query — the version and the image are inseparable, or the card asserts a version the image is not.

`Designing` is not a status in this product (the seven are planned, in_progress, internal_review,
client_review, changes_requested, approved, delivered) and `Feed` is not a stored value; the nearest
real one is `format_catalog.id = 'feed'`, whose `definition->>'name'` is `Portrait Feed`, reached
through `deliverables.format` and covering 21/21 projects.

**Approved direction:** a Fortnight / Month / Quarter scale control in which the coarser scales change
the column *unit* (day, two days, week) rather than only the count, because Planning is pinned to
880 px wide and leaves 624 px of day tracks — day labels stop being legible past roughly 21 columns,
and a year view would give each day 1.7 px. The seed's flat start dates are corrected in the same
task, since a scale control alone would still draw every bar from the same origin. Changing date
values does not change row counts, so the eight-table baseline is unaffected.

### Timeline scale, staggered seed dates and the version badge (2026-09-20)

Three delegated pieces with disjoint ownership, integrated by the orchestrator, which wired the
rendering because it spans shared files.

**Timeline scale.** Fortnight / Month / Quarter, where the coarser scales change the column unit
rather than only the count: 14 columns of 1 day, 14 of 2 days, 13 of 1 week. The agent rejected the
brief's "about 5 weeks" for Month with a good reason — 5 weeks is 17.5 two-day columns, which would
half-step the Monday alignment — and used 4 weeks, keeping the fortnight's proven 44.6 px column.
The board opens on `smallestScaleFor(projects)`, so work running past a fortnight is visible without
the viewer first finding the control; their own choice then wins. The control sits in the Planning
header beside Timeline/Kanban rather than inside the calendar's 220 px label column, and only in
Timeline mode. The grid track count is driven by a `--timeline-columns` custom property.

**Seed.** `supabase/seed.sql` is generated — its header says so — so the schedule went into
`supabase/scripts/build_seed.py` and the SQL was regenerated; editing the SQL alone would have been
erased. Distinct start dates went from 1 to 19 of 20, and projects that fit whole inside a fortnight
from 1 to 12. Dates now correlate with status: delivered and approved sit in the past, in_progress
straddles today, planned starts later. Nine of ten campaigns hold an overlapping pair; one
deliberately does not, so the calendar shows both contention and separation.

**Card badge.** The version and the image come from one query and are inseparable: the card shows
the newest version that *has* artwork and the badge names that same version. Confirmed rendering:
`V1 · Portrait Feed` where artwork exists, `Brand Kit` alone where it does not. Client reads
`published_versions` / `published-assets`, agency and designer read `design_versions` /
`internal-assets`, never mixed.

**Defects found by looking at the result, then measured and fixed.** The card footer overflowed by
12 px once the badge row was added, so `CARD_H` went 188 → 204 (measured, not guessed; overflow is
now 0). The lane label lost its layout when the wrapping link was removed in the previous task — its
grid had been declared on `.timeline-label a` — so the title and campaign name ran together on one
line; the grid moved onto the cell. The badge rendered as `V1Portrait Feed` with no separator.

**A real bug the linter caught:** the rows memo in `project-timeline.tsx` did not depend on `scale`,
so intervals would have kept a stale geometry when the scale changed. A second error — passing a
callback that reads a ref during render — was fixed by deriving the scale (`chosenScale ?? smallest`)
instead of syncing state to it in an effect, which is both simpler and correct on the first render.

**Documented baseline corrected.** Row B10 recorded notifications 11, design_versions 35, designs 41.
A documented reset produces 12, 33, 38. The old figures came from a database that had accumulated
rows across sessions and never described a pristine seed, so a drift check against them could not be
recreated. The matrix now records the reset values and names the command that produces them.

**Verified in this session:** `npm run check --prefix apps/web` passes with 222 unit tests across 11
files (up from 182). The full Playwright suite passes **25/25** against rebuilt containers, with the
eight-table baseline identical before and after. Browser-measured after the fixes: card overflow 0,
lane label `display: grid` over two rows, scale control present in the header, Quarter renders 13
columns and the period reads `Sep 14 – Dec 13, 2026`, and both SABRE bars render unclipped where
every bar was previously `clipped-end`.

**Data loss to record honestly.** Applying the seed required the documented reset, which runs
`supabase stop --no-backup` and destroyed the local database — including the manually created `T`
project and briefing that the previous checkpoint said were being left in place pending the owner's
decision. The instruction to apply the seed the documented way made that unavoidable, and the
consequence should have been foreseen before the task was dispatched.

### Project artwork across the seed, and the card sized for it (2026-09-20)

Report: [seed-project-artwork](handoffs/2026-09-20-seed-project-artwork.md).

**Why the thumbnail was missing.** Not a bug: `supabase/scripts/build_seed.py` attached artwork only
to project indices 4, 12, 16 and 20, so 4 of 20 projects had any, and 6 of the 10 client boards had
none at all — including Acme, the board the owner opened. The special case is gone; asset paths are
now derived from the design id rather than the project index, which also lets one project carry
several distinct images. Coverage is **17 of 20** projects with internal artwork and 11 with
published artwork. Three projects (1, 10 and 19) are `planned` and hold no `designs` rows at all;
giving them artwork would mean inserting rows and moving the baseline, so they deliberately have
none.

Version 2 and adaptation designs are deliberately left without artwork, and this is load-bearing:
`production_integrity.test.sql` and `access_and_workflows.test.sql` call `publish_version` with an
empty asset map, and `publish_version` raises if a design carries an internal path with no prepared
publication asset. Because the card shows the newest version that *has* artwork, every card resolves
to V1.

Only `storage.objects` moved, 79 → 108. All 24 other tables are unchanged, verified by comparing
per-table insert counts between the committed and regenerated `seed.sql` (662 statements in both,
no table differing). `verify_seed.py`'s bare `assert downloaded == 79` was replaced with named
arithmetic whose terms are each checked against the manifest before the total, so a drift fails
where it is defined.

**An accessibility defect the wider seed exposed.** With most projects now carrying artwork, the
design audit began failing `image-redundant-alt` on `.uploaded-artwork` at all five widths: the
image used `alt={design.title}` while the same title is rendered beside it, so a screen reader
announced it twice. The artwork carries nothing a caption can add that the adjacent heading does
not, so it is now `alt=""`. The audit found this only because the data got more realistic — the
placeholder path had been hiding it.

**The card was sized for text, not for artwork.** The media box was `flex: 1` with a 40 px floor, so
it took whatever the text left over: a 40 px sliver. It now takes a 108 px share of a 256 px card
(42%), close to the reference proportion, with measured overflow 0. `CARD_H` went 204 → 256 in two
measured steps rather than one guess. The empty state was a filled grey block that read as a broken
image; it is now a dashed outline reading "No artwork yet", the same size so cards in a row stay
aligned. That state still matters after the seed fix, because every project starts without artwork
until a designer uploads the first version.

**Verified in this session:** `npm run check --prefix apps/web` passes with 222 unit tests. The full
Playwright suite passes **25/25** against rebuilt containers — both the design audit and the
production workflow, which had failed on the previous run, now pass in the full suite rather than
only in isolation. A nine-value baseline including `storage.objects` is identical before and after:
clients 10, projects 20, notifications 12, design_versions 33, designs 38, campaigns 10, briefings
23, Auth users 13, storage objects 108. `verify_seed.py` passes and `npm run db:test` reports 133
tests passing.

**Still open for the owner:** nothing is published for Acme, so its *client* view still has no
thumbnail even though its agency view now does. That is a decision about which projects are
published, not about artwork, and no publication was added that the seed did not already make.

### Artwork at its real format size, and versions laid out in rows (2026-09-20)

Two delegated pieces, integrated by the orchestrator.

**Fixture artwork now carries its format's true pixel canvas.** `png_card` rendered 640x480 for
every asset regardless of what was ordered. The size is now derived from `format_catalog` through
the deliverable, giving 7 distinct sizes across the 22 artwork designs: 1080x1080 (10), 1080x1920
(4), 1080x1350 (3), 1240x1754 (2), 1920x1080, 1440x1920 and 600x800. Three rules cover formats with
no pixel size, each exercised by the real dataset: print (mm) renders at 150 DPI, matching the
seeded A4 print proof already at 1240x1754; fluid formats keep their declared width and render 3:4;
formats with no dimensions at all render 1080x1080. `png_card` no longer has a default canvas, so
nothing can silently fall back.

The renderer was rewritten to paint flat runs and stream scanlines rather than walk pixels in
Python: **6.4x the pixels in 35% of the time**, and provisioning end to end went from 4.44 s to
2.53 s. Decompressing the new renderer at 640x480 gives scanlines pixel-identical to the old card,
so the composition is unchanged and only the canvas moved. `verify_seed.py` now derives the expected
canvas independently from `format_catalog` and checks it against each downloaded file's own IHDR
header, so a fixture that stops matching its ordered format fails there instead of looking plausible
on screen.

**The project canvas lays each version's designs in a row, with the next version below.** New pure
module `features/projects/canvas-layout.ts` with 24 unit tests, modelled on `board-layout.ts`. It
replaces a layout that depended on measuring node heights after paint: every node now declares its
width and height, and `nodeHeights`, `measureNodes` and `onNodesChange` are gone. Measured on
Harbor & Pine, which holds four versions across two deliverables: V1 at y 511 with its two designs
side by side, V2 at y 920 beneath it, columns at x 957 and x 1429 — a step of 472 (432 card + 40
gap) rather than the old fixed 332 — and **0 overlapping pairs**. Declared height equals rendered
height on every node. Each tile takes the deliverable's own proportions, so a 1080x1080 renders
square and a 1080x1350 renders portrait, with 1080x1920 clamped.

A row holds at most 5 tiles; beyond that the existing "+N more designs" control takes over, because
a sixth tile would push the next column off a 1600 px canvas. A version with one design keeps an
empty second slot, the same trade the board makes for a one-project campaign.

**Verified in this session:** `npm run check --prefix apps/web` passes with 246 unit tests across 12
files. The full Playwright suite passes **25/25** against rebuilt containers, with a nine-value
baseline identical before and after: clients 10, projects 20, notifications 12, design_versions 33,
designs 38, campaigns 10, briefings 23, Auth users 13, storage objects 108. No row and no storage
object was added or removed — only the bytes of existing objects changed. `verify_seed.py` passes
with `artwork_pixel_sizes_match_deliverable_format true`, and `npm run db:test` reports 133 passing.

**Documentation:** the two shared files the artwork agent could not write were updated here —
`docs/architecture/backend.md` now says `verify_seed.py` checks each file's PNG header against the
catalog, and `docs/operations/README.md` records the true-size rendering rules. Doc link check: 0
broken.

**Not covered by real data:** no seeded version holds more than two designs, so the five-tile row and
the overflow control were verified by unit tests plus an in-page rewrite of the REST response, with
nothing written to the database. No seeded version is empty, so that state is covered by unit tests
only. Both should get real fixtures before the acceptance matrix claims them.

### Version rows, the whole design in the card, and header alignment (2026-09-20)

Reports: [project-canvas-version-lines](handoffs/2026-09-20-project-canvas-version-lines.md).

**Each version is now a line.** The version's label, status, note, feedback and actions sit in a
left rail with its designs in a row beside them, and the next version is the line below —
`V1 Draft [img][img]` over `V2 Draft [img]`. Deliverables became stacked sections rather than
side-by-side columns, decided on real arithmetic: the canvas panel measures 1360x759 at a 1600
window, and two side-by-side sections of five designs would need 2796 px, forcing zoom 0.47 and a
94 px tile — below the legible floor. Columns only survived the seed's current maximum of two
designs. Stacked, every node sits at x 0 and the rails form one edge, so **0 overlapping pairs by
construction**. Measured on Harbor & Pine and on the Northfield reel: declared height equals
rendered height on every node, in every scenario, with no console errors.

The agent also removed `MIN_ROW_DESIGNS` — with a left rail giving the straight edge, a phantom slot
beside a single design reads as a missing image rather than as room to grow — and fixed a real bug
where the row width omitted `CARD_BORDER` and clipped 2 px off the second tile.

**The card shows the whole design, not a crop.** `object-fit: cover` on a wide box turned a
1080x1920 reel into a horizontal slice of its middle, which read as nothing. The thumbnail now
contains the artwork at its own proportion: the Rune Fitness reel renders 89x158 inside a 238x158
box, recognisable as the work. Letterboxing a portrait is the price of the card standing for
something. `CARD_H` went 256 → 324 across the changes below, each step measured.

**Two alignment defects the owner photographed, both quantified before being touched.** The day
headers were ragged because the wider pairs wrapped while their neighbours did not: measured column
heights were 51 px for the first three columns and 69 px for the rest. `white-space: nowrap`,
tabular figures and 2 px horizontal padding bring every column to a single height of 51. The card
footer sat 15 px below its divider but **2.7 px** above the card's bottom edge, against the body's
own 20 px padding — visibly crammed. It now measures 15 above and 20 below. The version and type ran
together as one label; a dash now separates them, so the badge reads `V1 – Instagram Reels`.

**Duplicate rule extracted.** `canvasFit` was written mirroring `boardFit`, leaving the same domain
rule in two files with their own constants — exactly what this project's instructions say to avoid.
Both now delegate to `features/shared/canvas-fit.ts`, which takes the two things that genuinely
differ: the minimum zoom each surface stays readable at, and whether height constrains the fit at
all (the board fits both axes; the project canvas is a tall list that must not shrink to fit). The
147 board and project tests passed **unchanged** after the extraction, which is the evidence that
behaviour is identical.

**Verified in this session:** `npm run check --prefix apps/web` passes with 262 unit tests across 13
files. The full Playwright suite passes **25/25** with a nine-value baseline identical before and
after.

**A flake to chase, recorded rather than rounded off.** In one run `brand-accessibility.spec.ts`
failed; it then passed in isolation and in the two full runs after it. The failure artifacts were
deleted by the isolated re-run before the reason could be read, so **why it failed is unknown**. A
suite that fails intermittently undermines every "25/25" recorded in this document, including the
earlier ones. The next occurrence must have its `test-results/` context captured before anything is
re-run.

## Board identity header; the topbar stands down; Planning sized for its Kanban (2026-09-20)

Owner: Claude Code, as orchestrator, implementing directly; no delegation and no worker reports for
this task. Two rounds, both driven by the user looking at the result.

### Implemented

The board titles itself with the client. Its header carries the client's brand mark at 58 px beside
their name as the page's `h1`, a quiet `PROJECT BOARD` caption, and the board's own controls on the
same row: search, the filter popover, the result count, the view selector and the primary action.
It replaces the visually-hidden `"<client> project board"` heading the board carried before, and it
is page chrome rather than a canvas node, so it holds still while the board pans and it sits above
the list view too. Below 1100 px the controls take their own row under the name.

The topbar is now global chrome only. Inside a client workspace it carries nothing but the
notifications control; outside one it still names the studio. The client's name survives in the
sidebar's active workspace and in this header, so nothing lost a label.

`features/workspace/topbar-tools.tsx` was **deleted**. The board was its only consumer, and once the
board renders its controls in its own header the portal would have moved them from the page to the
same page. `client-identity.tsx` became `client-mark.tsx`, exporting `ClientMark` alone; it takes
its size from a `--client-mark-size` custom property, and its initials fallback scales with it
(font size `0.38 × size`, radius `size / 4.3`).

Showing the canvas, `.board-page` takes the viewport height exactly and `.board-canvas` flexes into
whatever the header leaves, so the header's height is never restated in a token. This must be a
`height` rather than a `min-height`: **React Flow sets an inline `height: 100%`**, which resolves to
zero against an indefinite height and renders an empty board with the nodes present but clipped —
observed directly in this session before the fix. A `min-height: 568px` floor keeps the canvas
usable on a short window; the list view keeps the flexible box and scrolls with the page.

### Changed

`apps/web/features/workspace/client-mark.tsx` (renamed), `apps/web/features/workspace/app-shell.tsx`,
`apps/web/features/board/board-page.tsx`, `apps/web/app/globals.css`, and
[the design system](../architecture/design-system.md). Deleted:
`apps/web/features/workspace/topbar-tools.tsx`.

### Verified in this session

`npm run check` passes: typecheck, ESLint (2 pre-existing warnings, both unrelated — an unused
`ArrowLeft` import in `board-nodes.tsx` and an `exhaustive-deps` warning in `board-page.tsx`),
Prettier, and 262 unit tests across 13 files.

The full Playwright suite ran against a development server on port 3010: **24 passed, 1 failed** —
`production-workflow.spec.ts`, which fails the same way on the unchanged tree (measured before these
edits in this same session) and is the documented port-3003 media-origin environmental failure.
Layout was measured in the browser at 1512×950, 1024×800 and 390×844, in both canvas and list view,
with no page scrollbar and the canvas filling the viewport (header 102 px, canvas 732 px at 1512×950).
The initials fallback was forced in the DOM and renders at 58 px with 22 px initials.

### Two operational notes for whoever comes next

**The development server on port 3010 had stopped rebuilding CSS.** Edits to `globals.css` were not
reaching the browser — the served chunk kept its old hash through a touch and a hard reload, which
is why the first screenshots showed a broken header that the source did not explain. The server was
restarted (the old process 96714 was stopped) and picked the changes up immediately. Check the
served CSS before trusting a screenshot that contradicts the source.

**Uncommitted work in `app-shell.tsx` was destroyed and recovered.** A `git checkout` on that path
during this task discarded the prior session's uncommitted version, replacing 417 lines with the
43-line `main` baseline. It was recovered in full from a dangling stash commit
(`git cat-file -p eb730d5cf309d406697b0acbba5f1806cf218b14`, from the stash at 15:00) and verified
line for line against what had been read earlier in the session. **Never run `git checkout <path>`
in this tree**: almost everything here is uncommitted, and that command has no undo.

### Second and third rounds, same session

**The topbar stands down where a page brings its own header.** The notifications control moved to
the right of New briefing in the board's header, and `.workspace:has(.board-page)` now hides the bar
and zeroes `--topbar-height` above 901 px. Below that the bar stays — it holds the only way to open
the navigation drawer — and the board's own copy of the control hides instead, so there is never
one on screen twice. The markup behind it is a single `features/workspace/notifications-bell.tsx`
that both surfaces render; the query is shared, so two mounted copies still make one request.

`--workspace-chrome` was **deleted**. It was subtracted from the board's height by its only two
consumers and reserved 52 px for chrome that no longer exists, leaving a measured 52 px band of dead
white below the canvas. The board now fills to the bottom of the window.

**Planning is sized by the widest thing it holds, which is the Kanban.** `PLANNING_MIN_W` went from
a hardcoded 880 to `kanbanWidth()` — seven stages at `KANBAN_COLUMN_W` (176 px) with their gaps,
the row padding and the frame border, which comes to 1338 px. Before this, two of the seven stages
sat behind the frame's edge and every card title broke across three lines mid-word. `boardStatuses`
moved from `board-kanban.tsx` into `planning-view.ts` so the geometry can count the stages without
importing a component; `board-page.tsx` and `timeline-model.test.ts` follow it there.

The calendar shares that width, so its identity column went 220 → 280 px and now holds
`Creative Direction / Operations` without an ellipsis. `.timeline-calendar`'s `min-width` went
780 → 840 px to match: at 280 px of labels the old floor crushed the day pairs into each other in
the stacked layout, which was visible at 1024 px before the second change.

**The trade, stated plainly.** A wider Planning lowers the zoom a full board is fitted at — measured
0.672 → 0.537 at 1512x950. On-screen stage columns are about the same size as before (99 px → 95 px)
because the CSS column grew more than the zoom shrank, and all seven are now reachable instead of
five and a half. But every campaign card is correspondingly smaller at the opening fit. If that
reads as too small, the lever is `KANBAN_COLUMN_W`, not the fit.

### Verified after the third round

`npm run check` passes (262 unit tests, the same 2 pre-existing unrelated warnings). The full
Playwright suite: **24 passed, 1 failed** — `production-workflow.spec.ts` again, the documented
port-3003 media-origin environmental failure, unchanged from the measurement taken before any of
this session's edits. Measured in the browser at 1512x950 (Kanban: seven columns, `scrollWidth`
equals `clientWidth`, no inner scrollbar; Timeline: full titles), 1024x800 (stacked layout, legible
dates) and 390x844 (topbar present with the drawer control, one notifications control, list view).

### Not done

No acceptance matrix row changed. No fixture, container or deployment state was touched. The
opening fit zoom was not re-tuned after Planning widened.

## SABRE seeded from the reference package; baseline 20 → 25 projects (2026-09-20)

Owner: Claude Code, as orchestrator, implementing directly; no delegation and no worker reports for
this task. The user chose the baseline change and authorised the database reset before any of it ran.

### Why the reference package could be read as data

`docs/ref/manifest.json` carries the DOM control labels of every capture, not just the PNGs, and the
agency board captures are all `#/client/sabre/board`. So SABRE's structure was **extracted**, not
invented: three campaigns with their date ranges, seven projects with campaign, status and both
dates, the two-deliverable shape of Instagram Ads, and the two briefings that have not become
projects. Where the wireframe was plainly loose — every project rendered in one of two placeholder
formats — services and formats were taken from the real catalog instead, as `CLAUDE.md` licenses
("inspiration and workflow evidence, not a specification to reproduce screen by screen").

### Implemented

`build_seed.py` gained `emit_project()`, which emits one project whole: accepted briefing, project,
assignment, deliverables, versions, designs and artwork, internal comment, and — where the status
says the client has seen it — publication, published designs, review, both comment channels and the
notification. **The refactor was proved output-identical before SABRE was added**: with the branch
disabled the generator reproduced `seed.sql` and `fixtures.json` byte for byte.

SABRE then got its own branch: 3 campaigns (Summer Safety Sep 15–30, Everyday Confidence Sep 15 –
Oct 15, Brand Essentials undated), 7 projects, and 2 open briefings. The nine other clients kept
their exact rows — every removed line in the seed diff belongs to SABRE's two old projects.

Two follow-ons the new data forced:

- The fourth multi-deliverable project used to be project 16, which was SABRE's. It moved to 20
  (`ADAPTATION_PROJECTS`), so four projects still carry a second format on V1 and V2.
- `KANBAN_MIN_H` went 420 → 480. A card carries its campaign above a title that wraps, so on a real
  workspace it measures 90–110 px rather than the 79 px the floor was derived from: a three-card
  column needed 383 px against the 327 px it was given, and cut its third card. Measured after:
  `scrollHeight` equals `clientHeight` at 387.

### Assertions that had to change, and why

Three were genuinely stale and one was wrong in a way the old data hid:

- Per-client project counts (`verify_seed.py`, `canonical-workspaces.spec.ts`) now read the shape
  from the fixture manifest rather than asserting the number two.
- "Each deliverable on a multi-deliverable project needs V1 and V2" became "at least four such
  projects do". SABRE's Instagram Ads is a legitimate shape the old rule did not anticipate: two
  deliverables, both still on V1.
- Fixture file counts moved with the dataset: 22 → 27 working images, 15 → 18 published copies.
- **The scoped-search negative case was fragile.** It picked "a project this actor may not read" and
  expected zero search results. Global search also covers brand assets, so with SABRE's bare titles
  the Acme client searching `Brand Guidelines` matched its own `Sample brand guidelines`. The test
  now takes the negative case from a title that names another workspace, which cannot collide. The
  old data hid this only because every title was client-prefixed.

### Changed

`supabase/scripts/build_seed.py`, `supabase/scripts/verify_seed.py`, `supabase/seed.sql`,
`supabase/fixtures.json`, `apps/web/features/board/board-layout.ts`,
`apps/web/tests/e2e/{canonical-workspaces,design-audit,workspace,workspace-actions}.spec.ts`,
`docs/operations/seed-evidence.json`, and the baseline statement in `CLAUDE.md`, `AGENTS.md`,
`docs/operations/README.md`, `docs/architecture/{acceptance-matrix,implementation-plan,design-system,reference-map,production-workflow}.md`.

### Verified in this session

| Check | Result |
| --- | --- |
| `npm run check` | Pass — 262 unit tests, the same 2 pre-existing unrelated warnings |
| `local_stack.py reset --confirm-local-data-loss` | Applied; 13 Auth accounts, 70 brand files, 27 working images, 18 published copies, 1 delivery |
| `verify_seed.py` | PASS — 10 clients, 25 projects, all 20 services, 116 real file downloads, ledger reconciled |
| Full Playwright suite | 24 passed, 1 failed — `production-workflow.spec.ts`, the documented port-3003 media-origin environmental failure, which fails identically on the unchanged tree |
| Seven-table count before/after a full suite run | clients 10, projects 25, notifications 15, design_versions 41, designs 46, campaigns 12, briefings 30 — identical, and zero projects whose campaign parent disagrees with their client |
| Browser, 1512×950 | SABRE board renders 3 campaign frames and 7 cards with artwork; Kanban fills 4 of 7 stages with whole cards; briefings list shows the draft with no campaign and the one awaiting review |

### Not done

`production-workflow.spec.ts` still needs a run from an allowed media origin. The backend suite
(`133 PostgreSQL assertions` and the rest of that ledger) predates this dataset and has **not** been
re-run against it — `docs/architecture/acceptance-matrix.md` now says so where it quotes that run.
No acceptance row was marked Verified on evidence older than the dataset.

## Photographic artwork as a local overlay (2026-09-20)

Owner: Claude Code, as orchestrator, implementing directly. The user chose the overlay over vendoring
images after being shown the sizes: a full-colour PNG of one 1080x1350 photograph is 2.2 MB, so 27 of
them would be ~58 MB in the repository; palette-256 PNG is 807 KB each (~20 MB, with visible banding);
JPEG q80 is 251 KB each (~7 MB, but the artwork format is PNG throughout the pipeline).

### What it is

`supabase/scripts/demo_artwork.py`, wired as `npm run db:artwork:photos`. It replaces the 27
production images in `internal-assets` with photographs from picsum.photos, requested at the exact
canvas each deliverable was ordered in so the crop happens server side and no aspect ratio is
invented. The private copy keeps the `Author` text chunk `fixture_media.png_card` writes, so the
property the fixtures exist to prove — producer identity present privately, absent once published —
survives the swap.

Nothing is vendored, `build_seed.py` and `fixture_media.py` are untouched, and a reset restores the
synthetic baseline.

### Two findings worth keeping

**A publication is genuinely immutable, and the database enforces it.** The first version of the
script also rewrote the 18 published copies. `register_sanitized_asset` refused: `Sanitized asset
registration conflicts with existing bytes`. That is the guarantee working, not an obstacle, so the
script now leaves published snapshots alone and says so. A client login still shows generated cards;
changing that means publishing a new version through the product. The board reads `internal-assets`
for the agency and the designer and `published-assets` only for a client, so the agency board — which
is what this was for — shows photographs everywhere.

**Adaptation deliverables carry no uploaded artwork at all.** Only the primary deliverable's V1
designs get an entry in `working_assets`; an adaptation design renders from its `content` instead.
So Instagram Ads shows photographs on its Instagram Feed column and a generated card on its Instagram
Story column. That is a pre-existing gap in the fixture, not something the overlay introduced, and it
was left alone rather than changed under an unrelated task.

**`urllib` cannot verify a public certificate under this Python.** The macOS framework Python has no
certificate bundle and `certifi` is not installed, so HTTPS downloads shell out to `curl`, which
trusts the system keychain. Verification stays on; it was not disabled.

### Verified in this session

All 27 images replaced without error; the SABRE board and the Instagram Ads project canvas were
opened at 1512x950 and render photographs at the right aspect ratio per format. `verify_seed.py`
fails afterwards on `internal == png_card(...)`, which is the documented and intended consequence —
run it before the overlay, or after a reset.

### Not done

The published copies, the adaptation deliverables, and the brand assets still carry synthetic media.
No test was changed to accommodate the overlay.

## The "environmental" media failure was three real defects (2026-09-20)

Owner: Claude Code, as orchestrator, implementing directly. The user hit it in the product — added
more directions to a version, pressed send to client, and got a CORS error in the console — which is
what finally pulled the thread. The full browser suite now passes **25 of 25**.

`production-workflow.spec.ts` had been recorded as an environmental failure across several sessions,
on the grounds that the media service only allows `APP_ORIGIN` and the development server runs on a
different port. That was true, and it was also hiding two defects behind it. Each fix exposed the
next.

### One: the media service allowed exactly one browser origin

`apps/media/src/server.js` compared the request `Origin` against a single configured value, so a
`next dev` beside the container got 403 with no `Access-Control-Allow-Origin` and the preflight never
passed. It now holds an allowlist: `APP_ORIGIN` remains the single canonical origin, which the web
application also uses to build invitation links, and `MEDIA_ALLOWED_ORIGINS` adds the further origins
a machine serves the same application from. Entries are compared whole; nothing is reflected back
merely because it asked, and `https://untrusted.example` still gets 403 — verified with curl.

`local_stack.py` writes the loopback development origins into the local env file, `compose.yaml`
passes the variable through, and `.env.production.example` documents it as empty for production.

**The container that was actually serving the port was not the one the lifecycle script manages.**
`local_stack.py` owns `dawes-media-dev`, but port 55430 was held by `dawes-studios-app-media-1` from
the compose project, alongside a stale `dawes-media-acceptance` container from an earlier session.
The stale one was removed and the compose service rebuilt. Check which container answers 55430
before concluding a media change had no effect.

### Two: the client rejected identifiers its own database produces

With CORS fixed, sharing a version reported `The file service returned an incomplete response`. The
service had sanitized and stored the artwork correctly; the client threw the answer away. A `uuid`
column holds any 128-bit value — `gen_random_uuid()` happens to produce version 4, but the
deterministic fixtures derive ids from a hash, so `3daa14bc-6fe4-ce7e-d63b-dc75e94bba0e` declares
version `c`. Zod 4's `z.uuid()` enforces RFC 4122; `z.guid()` checks the shape the database actually
guarantees. Three call sites were validating responses and input more strictly than the schema:
`publicationSchema`, `deliverySchema` and the invitation request's `clientId` — that last one would
have refused an invitation to **any seeded workspace**. Covered by `media-client.test.ts`.

### Three: a delivery was attached to the project the viewer was not looking at

With that fixed the spec reached the delivery step and still failed, and the reason was visible in
the data: SABRE's Email Banner had collected **three** delivery files named `Approved campaign
final.png` from the three failed runs, plus one from a manual probe. The assets page filters to one
project; the delivery dialog narrows the choices to approved projects and then opened on the *first
approved project in the workspace* rather than on the one being viewed:

    initialProject={upload === "delivery"
      ? (projects.find((item) => item.status === "approved")?.id ?? "")   // ignored the filter
      : project || projects[0].id}

So a final file went to a different project and that project's client was notified their work was
complete. The working-file branch had always honoured the filter. `initialUploadProject` in
`asset-data.ts` now prefers the filtered project and falls back only when it cannot take a delivery,
with `asset-data.test.ts` covering all four cases. The four stray files were removed by a reset
rather than by hand, so no orphan was left in `private.sanitized_assets`.

### Changed

`apps/media/src/{server.js,server.test.js}`, `supabase/scripts/local_stack.py`, `compose.yaml`,
`.env.production.example`, `apps/web/features/projects/{media-client.ts,media-client.test.ts}`,
`apps/web/features/settings/settings-model.ts`,
`apps/web/features/assets/{assets-page.tsx,asset-data.ts,asset-data.test.ts}`.

### Verified in this session

| Check | Result |
| --- | --- |
| `npm run check` | Pass — 271 unit tests across 15 files, the same 2 pre-existing unrelated warnings |
| `apps/media` vitest | Pass — 14 tests across 2 files |
| Preflight from `http://localhost:3010` | 200 with `Access-Control-Allow-Origin: http://localhost:3010` |
| Preflight from `https://untrusted.example` | 403, unchanged |
| Full Playwright suite, port 3010 | **25 passed, 0 failed** |
| `verify_seed.py` after a reset and after the suite | PASS — 10 clients, 25 projects, 116 real file downloads |
| The user's own flow in the browser | Share with client on a seeded version completes with no error and appears under Shared with client |

### What this means for the record

Every earlier entry in this document that called `production-workflow.spec.ts` an environmental
failure was wrong about the cause, and the acceptance matrix rows that depended on that spec were
never covered by a passing run from an allowed origin. They are now. The lesson worth keeping: a
failure that reproduces only in one environment is a hypothesis about the environment, not a
conclusion — this one had two product defects queued behind it.

### Not done

The delivery dialog still lets a viewer change the project in the select, which is correct; no
confirmation step was added. The stale-container situation is a property of this machine, not of the
project, and was not automated away.

## A refused preparation now says what to do about it (2026-09-20)

Owner: Claude Code, as orchestrator. The user pressed send to client and got `403` on
`/publications/prepare` with `refresh_token` failing at `400` just above it.

### What had happened

The database reset earlier in this session wiped `auth.sessions`, so the browser's refresh token was
gone. The access token beside it was **not expired and still correctly signed**, and the seed
recreates users with the same deterministic ids — so PostgREST kept answering and the whole workspace
rendered as normal. Only the media service noticed, because it resolves the session through the auth
server: `/auth/v1/user` returned 403, which its request helper reports as `Access denied.`

Reproduced exactly in the browser (access token unexpired, `/auth/v1/user` 403, media 403
`Access denied.`), and signing out and in again fixed it, verified by sharing a seeded version with
no error. **This was caused by the reset, not by a defect** — a revoked session behaves the same way
in production for one token lifetime, which is how JWT verification is meant to work.

### What was worth changing anyway

The message. `Access denied.` is accurate and useless: it names no cause and no next step, and the
viewer has no way to know their sign-in is the problem while every other part of the workspace still
works. `mediaErrorMessage` in `media-client.ts` now turns a 401, or a 403 carrying that generic
wording, into "Your sign-in is no longer valid. Sign out, sign in again, and retry." A refusal that
already explains itself — `Agency access required.`, `Approve all deliverables before adding final
files.` — is passed through untouched. Covered in `media-client.test.ts`.

### Deliberately not done

The session handling itself was left alone. Making the application detect a dead session and force a
re-authentication means treating a PostgREST answer as authoritative about session liveness, which
it is not, or polling the auth server, which is a different design decision than a bug fix. It was
not asked for and is recorded here instead of being taken.

### Verified in this session

`npm run check` passes with 274 unit tests across 15 files. The full Playwright suite passes **25 of
25**. `verify_seed.py` passed on the deterministic baseline immediately after the reset and before
the photograph overlay was re-applied; with the overlay applied it fails on the artwork byte
comparison, which is the documented and intended consequence of running it.

## UI sweep, and three things it found (2026-09-20)

Owner: Claude Code, as orchestrator. The user asked for a complete UI test plus three changes; the
brainstorming skill classified the work as bounded and the design was approved in chat before any
code was written. Two of the three "missing" things already existed.

### The sweep

A throwaway script walked all 25 workspace routes signed in as the agency at 1512x950 and recorded,
per route, the `h1`, horizontal overflow, error states, and whether a sign-out control was present
and whether it was *labelled*. Result: **zero console errors, zero page errors, zero horizontal
overflow, exactly one `h1` per route**. The script was not kept; it is reproducible from this
description and was run again after the changes with the same result.

What it established, rather than assumed:

- `visible Sign out label anywhere: false` and `sign-out control present: true` on 25 of 25 routes.
  The logout was not missing. It was an icon-only button whose name lived in `aria-label`, so it was
  legible to a screen reader and invisible to everyone else.
- `/settings/team` renders and works. The Team page was not missing either; it was three clicks
  inside Studio settings.

### Changed

**Sign out gained its word.** It moved out of `.profile-bar`, where it was an `icon-button` squeezed
beside the account link, and became a full-width `nav-item` below it. The `aria-label` was removed
because the visible text now provides the accessible name — which is why the two specs that already
locate it by `getByRole("button", { name: "Sign out", exact: true })` kept passing untouched.

**Team joined the sidebar**, agency only, pointing at the same `/settings/team` route. No page was
duplicated. Studio settings marks itself active by exact path equality, so the two do not fight.

**The Brand Hub select became a row of links.** `brandNavigation`'s ten entries render under the
title in group order, the current one carrying `aria-current="page"`, one row, scrolling sideways
rather than wrapping. Links rather than buttons: they are routes.

**A floor under the sidebar.** The footer grew by two rows, which put `Sign out` at 910–950 in a
950 px window — flush against the bottom edge, which read as clipped. `.sidebar` went from
`padding: 30px 16px 0` to `30px 16px 14px`. Measured before and after rather than eyeballed.

### What had to follow the change

`brand-accessibility.spec.ts` and `docs/verification/brand-browser-audit.mjs` drove the Brand Hub
through `getByLabel("Brand section").selectOption(...)`. Both now click the section link by its
visible name and assert `aria-current`, which is what a viewer actually does. The label table lives
in `tests/e2e/test-support.ts` beside the other shared browser helpers.

Playwright's `getByRole` has no `current` option — the attribute is asserted with a locator instead.
That cost one failed typecheck and is worth knowing before reaching for it again.

### Verified in this session

`npm run check` passes with 274 unit tests across 15 files. The full Playwright suite passes **25 of
25**. The route sweep passes clean after the changes, with the sign-out label now visible on all 25.
The Brand Hub row was measured at 390 px: one row, 882 px of content scrolling inside 350 px, no page
overflow, current section reported.

### Two things the sweep found that were left alone

The Brand Hub's `h1` is "Brand Hub" on all ten sections, with the section name as the `h2` below —
coherent now that the row names the sections, so it stands. And "Reviews." and "Project assets." end
in a full stop while "Briefings", "Credits" and "Settings" do not. Both were reported to the user and
neither was changed under this task.

One thing that is **not** a defect: the dark circle over the sign-out row in development screenshots
is Next.js's own dev-tools badge, not workspace UI.


## Repository structural refactor: Phase A closed, boundaries documented (2026-09-20)

Owner: Claude Code, as orchestrator. Objective: restructure `apps/web` — data-access placement, the
shared component layer, the styling architecture, file size and dead code — without changing
behavior, per [the design](../superpowers/specs/2026-09-20-repository-structural-refactor-design.md)
and [the implementation plan](../architecture/implementation-plan.md). The existing suites are the
safety net; a test that has to change to keep passing is evidence behavior changed, and grounds to
revert whatever caused it.

**Baseline commit:** `31a2f7a` ("chore: commit the in-flight workspace and board work as a refactor
baseline") — the reference point every later diff in this refactor is measured against.

**Phase A commits, in order, and what each established:**

| Commit | What it established |
| --- | --- |
| `aa5d586`, `c6d9260` | The refactor design and implementation plan, committed before any code moved. |
| `8e2085d` | Repository hygiene: `.playwright-mcp/` untracked, `.superpowers/` ignored. |
| `41c0ccb` | Corrected the plan's stale "109 unit tests" figure to the tree's actual 274/15 at that point. |
| `0b8db54` (Task 3) | The data-access contract, worked end to end on `credits`: Supabase queries live only in `features/<feature>/<feature>-data.ts`; reads are `use<Thing>()` hooks, writes are plain `async (database, input)` functions; validation/trimming/idempotency/retry state stay in the component. Documented in [`docs/architecture/data-access.md`](../architecture/data-access.md). Added `credit-data.test.ts` (274 → 279 tests, 15 → 16 files). |
| `c09124c` | Corrected the plan's central-test-verification check: it demanded an empty test diff, which correct work (adding tests for extracted functions) can never satisfy; filtered on modified-or-deleted instead. |
| `4641bea` (Task 4) | The shared-layer evidence test: a primitive moves to `apps/web/features/shared/` only with two or more real consumers today. Extracted `FormError`, `PageStatus`, `SearchField` (64 call sites); evaluated and rejected seven candidates (`empty-state`, `centered-state`, `form-actions`, bare `role="status"` text, `settings-success`, `button`, `field`) because their consumers differ too much to share one component body without normalizing away real differences. Documented in [`apps/web/features/shared/README.md`](../../apps/web/features/shared/README.md). |
| `af9acf1` (Task 5) | The styling boundary: 58 namespaces moved out of `globals.css` (21 to `board.css`, 32 to a new `workspace.css`, 5 to a new `auth.css`); `globals.css` went from 2,221 to 1,105 lines. Of the 20 feature-named rules that stayed, 12 are the specific set the refactor plan tracked, in four categories verified individually (not all "multi-feature" as first drafted): 5 genuinely multi-feature consumers (`.topbar`, `.project-row`, `.project-table`, `.client-mark`, `.client-mark-initials`), 4 bound by a grouped CSS selector to a multi-feature rule (`.project-title`, `.board-canvas`, `.project-canvas`, `.sidebar-collapse`), 1 dead rule (`.workspace-status`), and 2 with no identified reason (`.project-origin`, `.project-symbol` — flagged for relocation to `workspace.css` in Phase B, not fabricated a justification). `.status-badge`, `.segmented-control` and `.brand-logo` are further, separately-verified multi-feature namespaces outside that tracked count. See [`design-system.md`](../architecture/design-system.md#styling-boundary) for the full breakdown. `brand.css` and `projects.css` received nothing — not a gap, see below. |
| `b31a8f6` | Refreshed the design-audit evidence after the split and corrected the plan's boundary expectation (0 remaining feature-named rules in `globals.css` was never the right target; 20 remain, 12 of them legitimately). |
| This entry's commit (Task 6) | Wrote down the three boundaries above for the seven Phase B feature agents: [`docs/architecture/design-system.md`](../architecture/design-system.md#styling-boundary) states the styling boundary (Tailwind's role, the `globals.css`/`<feature>.css` split, the multi-feature override, with verified examples); `AGENTS.md`/`CLAUDE.md` gained a short "Codebase Architecture Boundaries" subsection linking to all three contracts; corrected two rows in [the design spec](../superpowers/specs/2026-09-20-repository-structural-refactor-design.md) — the "16 dialog files" row was a measurement error (`grep` matched the word `Modal`, i.e. consumers, not duplicate dialog markup: there is exactly one dialog implementation and 15 consumers, 0 duplication), and the implicit assumption that `brand.css`/`projects.css` would receive split rules (neither did, for the reasons above). |

**Verified test count.** `npm test -- --run` from `apps/web`: **279 tests passed across 16 files**
(274/15 immediately after Task 3, +5 tests in `credit-data.test.ts`). Any earlier figure recorded
elsewhere in this file (for example "109 unit tests" in the 2026-09-20 workspace-topbar entry above)
is historical evidence of that session's own state, not a claim about the tree today — treat this
paragraph as the current count *as of Phase A's close*. It is superseded in turn: Phase B and Phase C
followed this same day, and the final count is **391 tests across 25 files** — see "Repository
structural refactor: Phase C closed" at the end of this file.

**Standing rule: rebuild before browser verification, every time.** `dawes-studios-app-web-1` has
**zero bind mounts** and runs a baked `node apps/web/server.js`; it does not see source changes. This
refactor's own tree diverged from that image mid-session — the image was built at 19:59 UTC on
2026-09-20 while the branch head was already at 22:10 UTC — so a Playwright run against the running
container that afternoon would have been **a false green**: it passes on source the refactor had
already replaced. This file already recorded one earlier instance of the identical mistake, before
this refactor. The rule going forward, unconditionally:

1. Before any browser verification, rebuild the web image and confirm its build timestamp is newer
   than `git log -1 --format=%cI` for the commit under test — do not trust "the container is
   already running."
2. During this refactor, the container was not rebuilt after each Phase A commit. The working
   alternative used instead: `npm run dev` (from `apps/web`) serves the live tree on port 3003, which
   is the one origin the media service allows (`APP_ORIGIN=http://localhost:3003`; port 3010 and
   other origins get a 403 from the media service, an environmental constraint, not a defect). Prefer
   this over the container whenever the container has not just been rebuilt.

**What remains.**

- **Phase B** — seven delegated feature agents, each confined to one owned path, applying the same
  mandate (relocate queries into `<feature>-data.ts`, adopt the shared primitives, move
  feature-specific CSS into `<feature>.css`, split files over ~350 lines along responsibility
  boundaries, remove dead code), each running `npm run check` itself before reporting and filing its
  report under `docs/engineering/handoffs/2026-09-20-refactor-<feature>.md`:

  | Wave | Agent scope | Owned paths |
  | --- | --- | --- |
  | 1 | board | `apps/web/features/board/` |
  | 1 | projects | `apps/web/features/projects/` |
  | 1 | brand | `apps/web/features/brand/` |
  | 2 | briefings | `apps/web/features/briefings/` |
  | 2 | settings | `apps/web/features/settings/` |
  | 2 | workspace | `apps/web/features/workspace/` |
  | 3 | small features | `apps/web/features/{assets,auth,campaigns,reviews}/` |

  `apps/media`, `supabase/`, `apps/web/app/`, `apps/web/lib/`, `apps/web/features/shared/`, and root
  tooling stay with the orchestrator.
- **Phase C** — closing verification once all waves land: `npm run check`, `npm run build`,
  `npm --prefix apps/media test`, `npm run db:test`, and `npm run test:e2e` **run from an allowed
  origin per the standing rule above**, plus the orchestrator's final security/functional/visual
  audit.
- **Explicitly not addressed by this refactor:** the 75 Unverified rows in the acceptance matrix
  (`docs/architecture/acceptance-matrix.md`). This refactor is a structural change under a
  behavior-preservation constraint; it does not advance acceptance-matrix coverage, and nothing in
  Phase A or this entry should be read as evidence toward those rows.

## Repository structural refactor: Phase C closed (2026-09-20/21)

Owner: Claude Code, as orchestrator. This entry closes the refactor Phase A opened above: Phase B's
seven feature migrations landed, the closing pass covered the shared infrastructure no feature agent
owned, and full verification ran against a rebuilt container. **The 75 Unverified acceptance-matrix
rows were NOT addressed by this refactor** — restated here plainly because it is the single most
important scope boundary for whoever reads this next.

**Baseline commit:** `31a2f7a` — the reference point every diff in this refactor is measured against.
**The three foundations**, established in Phase A and held through every later wave:

1. **The data-access contract** (`docs/architecture/data-access.md`): Supabase queries live only in
   `features/<feature>/<feature>-data.ts`; reads are `use<Thing>()` hooks, writes are plain
   `async (database, input)` functions; validation, trimming, idempotency and retry state stay in the
   component.
2. **The shared primitive layer** (`apps/web/features/shared/README.md`): a component moves to
   `features/shared/` only once it has two or more real consumers today, not on anticipated reuse.
3. **The styling boundary** (`docs/architecture/design-system.md#styling-boundary`): feature-specific
   CSS moves into `<feature>.css`; `globals.css` keeps only genuinely cross-feature rules, each one
   individually justified rather than assumed.

**The seven Phase B feature migrations**, each confined to its owned path, each filing its own report
under `docs/engineering/handoffs/`:

| Feature | Report |
| --- | --- |
| board | `handoffs/2026-09-20-refactor-board.md` |
| projects | `handoffs/2026-09-20-refactor-projects.md` |
| brand | `handoffs/2026-09-20-refactor-brand.md` |
| briefings | `handoffs/2026-09-20-refactor-briefings.md` |
| settings | `handoffs/2026-09-20-refactor-settings.md` |
| workspace | `handoffs/2026-09-20-refactor-workspace.md` |
| assets, auth, campaigns, reviews (small features) | `handoffs/2026-09-20-refactor-small-features.md` |

**The closing pass** (Task 16, `handoffs/2026-09-20-refactor-closing-pass.md`): wired the board's
`moveProjectPosition` invalidation onto workspace's `useInvalidateWorkspace()` helper (previously the
board called `useQueryClient()` directly with an inline, identical query key — non-widening, just
de-duplicated); reviewed `apps/web/app`'s three non-page files and all of `apps/media/src` (no
changes needed in either); and deduplicated one PNG "Author" marker chunk that `supabase/scripts`'
`fixture_media.py` and `demo_artwork.py` each built independently (`fixture_media.AUTHOR_TEXT_CHUNK`,
commit `7236def`). A concurrent session (`dawesstudios-70`) committed `9c38bd0` ("hide the React Flow
attribution badge", `proOptions={{ hideAttribution: true }}`) during this same window; its edits were
carried through intact and are not this refactor's work.

### Verification results, run against a rebuilt container

The web container image was rebuilt and restarted before the browser suite, so this evidence is
production-shaped rather than dev-mode. Image built `2026-09-21T03:12:27Z`; branch head
`2026-09-20T23:10:13-04:00` — the image is newer than the code, which is the condition that makes
browser evidence trustworthy here (see the standing rebuild-before-verify rule in the Phase A entry
above).

| Command | Result |
| --- | --- |
| `npm run check` | **PASS** — 391 tests across 25 files |
| `npm run build` | **PASS** — compiled successfully |
| `npm --prefix apps/media test` | **PASS** — 14 tests |
| `npm run test:e2e` | **PASS — 25 of 25** in 2.0 min, against the rebuilt container |
| `npm run db:test` | **FAIL — and it is not this refactor's doing.** See below. |

### Definition of done — all verified

- Inline Supabase queries in components: **0** (was 85). The grep excludes `Array.from(`, which the
  naive pattern falsely matches.
- Feature-named rules remaining in `globals.css`: **20**, all documented deliberate exceptions (see
  the Phase A table above and `design-system.md#styling-boundary`).
- **No existing test file was modified or deleted** across the entire refactor:
  `git diff --diff-filter=MD` over `apps/web/features`, `apps/web/tests`, `apps/media` and `supabase`
  returns nothing for `.test.`/`.spec.` files. This is the proof that behavior was preserved.
- Test files **added**: 10, roughly 1,841 lines of new coverage — `asset-data-writes` (167),
  `board-data` (32), `brand-data` (308), `briefing-data` (299), `campaign-data` (72), `credit-data`
  (67), `artwork-files` (55), `project-data` (477), `settings-data` (292), `workspace-data` (72).
- `AGENTS.md` and `CLAUDE.md`: **identical**.

### Measured before / after

- `app/globals.css`: **2,223 → 1,099 lines** (this supersedes the Phase A table's 2,221 → 1,105
  figure, which was measured mid-refactor before the later feature waves touched the stylesheet
  further).
- Unit suite: **274 tests / 15 files → 391 / 25** (this is the final figure; it supersedes every
  earlier count in this file, including the Phase A section's own 279/16).
- Largest components, before: `briefing-editor.tsx` 664, `board-page.tsx` 659, `project-page.tsx`
  504, `credits-page.tsx` 433, `app-shell.tsx` 415.
- Largest components, after: `board-page.tsx` 433, `credits-page.tsx` 424, `app-shell.tsx` 416,
  `briefing-editor-details.tsx` 344, `project-action-dialog.tsx` 333. **`briefing-editor.tsx` is now
  100 lines.**
- The largest files in `features/` are now data modules and their tests (`project-data.ts` 476,
  `project-data.test.ts` 477), not components.
- Feature data modules: **11** (`asset-data.ts`, `auth-data.ts`, `board-data.ts`, `brand-data.ts`,
  `briefing-data.ts`, `campaign-data.ts`, `credit-data.ts`, `project-data.ts`, `review-data.ts`,
  `settings-data.ts`, `workspace-data.ts`).
- Commits on the branch: **35**.

### The `db:test` failure: a pre-existing defect on another track, deliberately left alone

`npm run db:test` fails, and **this refactor did not cause it and did not fix it.**

Root cause: `supabase/scripts/build_seed.py` and `supabase/seed.sql` were rewritten (+382/−163 lines)
with mtime 16:44 on 2026-09-20 — about an hour before this refactor's baseline commit (`31a2f7a`) —
and the pgTAP suite in `supabase/tests/` was never updated to match. The tests reference fixture keys
`dawes:version-16-2` and `dawes:version-3-1`; `grep -c "dawes:version-16-2" supabase/seed.sql`
returns **0**, so `public.publish_version` raises `P0001: Version not found`. Failures: 11 of 53 in
`access_and_workflows`, 1 of 1 in `production_integrity`, 3 of 14 in `trusted_media_and_catalog`.

This refactor touched **zero** SQL files: `git diff --name-only 31a2f7a HEAD -- '*.sql'
supabase/migrations/` is empty. The seeded dataset itself is healthy — 10 clients, 25 projects, no
orphaned parents. Fixing this would mean editing test files (`supabase/tests/*.test.sql`) or the seed
(`supabase/seed.sql`), both explicitly out of scope for a behavior-preservation refactor and outside
every owned path in the Phase B table above. **This is a pre-existing defect belonging to another
track** (whichever session rewrote the seed builder an hour before this refactor started), and it was
deliberately left alone rather than patched incidentally by an agent who does not own the seed.

### Open question for the design-system.md owner — not resolved here

`.react-flow__attribution` at `globals.css:769-777` is a grouped selector
(`.board-canvas .react-flow__attribution, .project-canvas .react-flow__attribution,
.design-viewport .react-flow__attribution`) currently recorded in `design-system.md` as a deliberate,
verified multi-feature keep-it-global exception. The concurrent session's `9c38bd0` set
`proOptions={{ hideAttribution: true }}` on all three ReactFlow instances the same rule targets,
which may have made the rule dead — styling an element that `hideAttribution` now prevents from
rendering. This refactor did not check whether the badge is still ever mounted (e.g., during load, or
by a code path `hideAttribution` doesn't cover) and did not touch the rule or `design-system.md`.
Flagging it as an open question for that session's owner to resolve, not resolving it here.

## Audit-fix batch 4 landed — J08 tokens and semantic badge tones (2026-09-21)

Full report: [audit-fixes-tokens](handoffs/2026-09-21-audit-fixes-tokens.md).

A previous agent implemented this batch (`docs/verification/audit-j03-j04-j08-j09.md` section J08 —
literal-to-token substitution, the type/spacing scale, eyebrow consolidation, and semantic badge
tones in the new `apps/web/features/shared/status-tone.ts`) and was interrupted mid-task by an API
rate limit, leaving 30 modified files plus the two new `status-tone.*` files uncommitted. This
session verified that work rather than redoing it, found and fixed two exact-match literals the
implementer had missed (`.segmented-control`'s `border-radius: 8px` and its button's `font-size:
12px`, both in `globals.css`, outside the excluded React Flow attribution block), built the
near-match table the implementer had not left anywhere in the tree, and committed.

**Verified in this session:** `npm run check` — **420 tests / 29 files**, 0 errors, the same 2
pre-existing unrelated lint warnings in `features/board/`. A `next dev` server was started on port
3021 (not 3003 — that container was left untouched, per instruction) against the running local Docker
Supabase; `design-audit.spec.ts` and `brand-accessibility.spec.ts` both passed in full, and
`design-audit.json`'s diff against the committed baseline was **`capturedAt` only** — no route gained
overflow or a new axe violation, including from the J08-6 badge-colour change, which was the one
change this batch made on purpose. That regenerated `design-audit.json` and its screenshots were
reverted before committing (verification byproducts, not this batch's deliverable) and the port-3021
server was stopped. The dataset was re-counted directly against `supabase_db_dawes-studios`: 10
clients, 25 projects, unchanged.

**Not done:** the new `--space-xs/sm/md/lg` spacing scale is declared but not yet consumed anywhere —
converting spacing literals to it was out of this batch's scope. The J08-2 near-match literals remain
literals by design; growing the token scale to absorb them is explicitly the orchestrator's call.

## J-family final quality audit, five fix batches landed, matrix updated (2026-09-21)

Owner: Claude Code, as orchestrator, integrating five delegated fix batches against three
measurement-only audit reports. This closes the acceptance-matrix work the "Next actions" list above
named as item 3 ("Complete the J family visual review... then refresh the design audit").

### The audit

Three measurement passes, each recorded as `docs/verification/audit-*.md`, read rendered markup and
applied CSS/behavior rather than inferring from file structure or names, and changed no code:

| Report | Rows covered | Findings |
| --- | --- | --- |
| `audit-j01-j02-j06.md` | J01, J02, J06 (J07 already Verified, not re-audited) | J01: 1 Medium (759/760 layout cells clean across 19 routes × 40 widths). J02: 3 (2 Medium, 1 Low). J06: 2 (1 Medium, 1 Low); axe across 49 captures found zero violations, and a full keyboard-only journey (16 Tab presses inside a dialog, Escape returning focus to the trigger) completed. |
| `audit-j03-j04-j08-j09.md` | J03, J04, J08, J09 | J03: 5 (0/3/2). J04: 17 (3/7/7) — the highest-value row, with a full terminology table. J08: 6 (0/5/1). J09: 5 (0/3/2). |
| `audit-j05-duplication.md` | J05 | 0 High, 9 Medium, 9 Low. No High finding anywhere: credit arithmetic, role gating and briefing-status transitions are each implemented exactly once, in Postgres. |

### The five fix batches

Each filed its own report under `docs/engineering/handoffs/2026-09-21-audit-fixes-*.md`:

1. **Layout** (`audit-fixes-layout.md`) — J01/J02/J06's 6 findings, all fixed: three headings gained
   `overflow-wrap: anywhere`, the design-viewer toolbar breakpoint gap closed, a board-list row got a
   `title` fallback, `.board-tools` gained `flex-wrap` (fixing both the 320px spill and the 390px
   search field), and a `sessionStorage`-flagged focus move now lands on `#main-content` after
   sign-in.
2. **Terminology** (`audit-fixes-terminology.md`) — all 17 J04 findings. A `versionStatusLabels` map
   now covers all six version-status enum values; every user-facing date/instant routes through
   `createDateFormatters`/`useDateFormat`, honoring the studio timezone everywhere instead of one
   screen; "Workspace" retired as a name for a client or the studio account (two decisions that went
   further than the audit's own narrower recommendation, by this orchestrator's instruction).
3. **Minimalism** (`audit-fixes-minimalism.md`) — J03's 5 and J09's 5 findings. J03-5 was reviewed and
   **rejected, not fixed** — see "Deliberately open" below. J09-3 replaced the product's one
   `window.confirm` with the shared `Modal` and added confirmation to the destructive actions that
   had none; a later same-day correction reverted an over-applied confirmation on an unsaved-draft-row
   removal (nothing persisted is lost there) and added the resulting dialog step to two Playwright
   specs under a narrow, explicit exception to the no-test-modification rule.
4. **Tokens** (`audit-fixes-tokens.md`, two batches plus a documentation addendum) — J08's 6 findings.
   Exact-value literals converged onto existing tokens; a four-step type scale absorbed ~230 font-size
   literals; a four-tone semantic badge vocabulary (`status-tone.ts`) replaced four project-only
   variants, asserted total against the generated database enums. A follow-up orchestrator decision
   converged 23 of 35 near-twin grey literals onto their tokens, leaving 12 as literals with a
   recorded semantic-mismatch reason each.
5. **Duplication** (`audit-fixes-duplication.md`) — J05's 9 Medium + 9 Low findings; all 9 Medium and
   7 of 9 Low fixed behind new shared modules (`upload-rules.ts`, `version-row.ts`, `save-blob.ts`)
   plus local extractions. L1 and L4 deliberately deferred — see below.

### Deliberately open — not fixed, and the matrix rows say so

- **J03-5** — `Try again` stays `button primary` on the full-page error screen and plain `button` in
  fourteen in-page panels. Reviewed and rejected: on an error screen it is the only action available;
  in a panel beside working content it is secondary. Flattening the two would remove a real
  distinction, not close a gap.
- **J05 L1 and L4** — the credits page's two tabs still render the same records with one cell
  differing, because the report tab's column carries the campaign attribution the CSV export also
  depends on; consolidating first needs a design that gives campaign its own column. `ClientMark`'s
  initials-fallback duplication (3 sites) stays, because `ClientMark` also fires a signed-URL query
  per client — folding the other two sites into it would add one query per client in a list (ten on
  the seeded baseline). The J05 row's own wording is "consolidated **without removing useful
  actions**"; both deferrals satisfy that clause.
- **The upload ceiling was declared five times, not four** — a finding the audit missed, caught by a
  concurrent session after the fact. The fifth, `ARTWORK_MAX_BYTES` (25 MB) in
  `features/projects/artwork-files.ts`, deliberately disagrees with the shared 50 MB
  `BUCKET_MAX_BYTES` because it guards a `createImageBitmap` decode before the artwork path's own
  40-megapixel check can run. It is now a named, separate constant rather than merged into the shared
  module — recorded under J05 as the clearest case in the codebase of duplication where one copy was
  right to differ.

### Verification, measured just now against a rebuilt container

Image built `2026-09-21T12:30:40Z`, branch head `12:30:08Z` — the image is newer than the code, so
this evidence reflects the current tree:

| Suite | Result |
| --- | --- |
| `npm run check` | 430 tests / 30 files |
| `npm run build` | compiled |
| `npm --prefix apps/media test` | 14 tests |
| `npm run db:test` | 133 tests, PASS |
| `npm run test:e2e` | 25 of 25 |

### Acceptance matrix updated

`docs/architecture/acceptance-matrix.md`'s J family: J01, J02, J03, J04, J05, J06, J08 and J09 moved
from `Unverified` to `Verified`, each row rewritten to name the actual measured evidence (the audit
report, the fix report, the specific figures) rather than the generic evidence description the row
held before, matching the style of the already-Verified J07 and B01 rows. **J10 stays `Unverified`**
and now says why: it requires no open failed requirement across the *entire* matrix, and roughly 67
rows outside the J family (sections A–I) remain Unverified, so J10 is blocked on the rest of the
matrix rather than overlooked. Matrix totals: **48 Verified / 67 Unverified** (was 40/75).

### What remains

**The J family is now evidenced. The other ~67 Unverified rows (sections A–I) are not** — this session
did not touch them, and the standing instruction from the "Next actions" list above (work through the
remaining rows by domain; the C, E, F and I families hold the largest gaps) still applies. No fixture,
container or deployment state was changed by this session; the audits and fixes were measured against
the already-running local stack and a container rebuild performed for final verification only.

## Required-revision guards closed, and two false diagnoses behind them (2026-09-21)

`202609210005` removed the `is null or` escape from the compare-and-set on
`update_workspace_settings` and `save_service_preset`, so a call quoting no revision is refused
exactly as a stale one is. That closed the guard and immediately broke the browser suite, and the two
failures that followed were both measurement faults rather than product defects. Both are recorded
here because each one produced a confident, wrong conclusion first.

### The spec change the migration forced

`apps/web/tests/e2e/intake-admin.spec.ts` called both RPCs without a revision in the `finally`
teardown that restores the seeded settings. That block asserts nothing about product behavior — it
restores a fixture — so `b3f4ea5` reads the current revision immediately before each restore and
quotes it. The three other call sites in that file (lines 473, 515, 523) are negative-path assertions
that expect an error regardless of revision and were left untouched. No other spec calls either RPC.

### False diagnosis 1 — the shared stack's password had been rotated

Every fixture sign-in returned `invalid_credentials`, and this was first reported as predating the
session. It did not: `auth.users.updated_at` was `16:45:31Z` for all thirteen accounts, `supabase/.env.local`
in this tree had not been written since the previous day, and the password in the *other* working
tree's copy bcrypt-matched the stored hashes while this tree's did not.

`provision_local_auth.py` runs on every `db:start` and reads `DEMO_PASSWORD` from the tree it was
invoked from. A git worktree starts without that ignored file, so provisioning minted a new random
password, applied it to the single shared stack, and wrote it to that tree alone. Neither existing
guard catches it: the workdir check passes because `ROOT` derives from the script's own path, and the
API_URL check passes because both trees legitimately address the same instance.

`de10caa` fixes it. The seed inserts each account with `created_at` equal to `updated_at`, so an
account whose timestamps still match has never been given a password; provisioning mints one only in
that case and otherwise stops with a message naming both recoveries. Verified both ways: with the
credentials file hidden it refuses and changes nothing, and with it present a full run provisions 13
accounts, 70 brand files, 27 internal working files, 18 published copies and the delivery fixture,
after which sign-in returns `200`.

### False diagnosis 2 — a container 42 minutes older than the fix it was measuring

With auth restored, one test still failed: the workspace settings save produced no toast. The
procedure was not at fault — called over HTTP with a correct revision it returned `200`, and the
source sends one. The image serving `3003` had been built at 12:03; `5843974`, the commit that makes
the form send a revision at all, landed at 12:45. An old bundle was calling the procedure without a
revision against a guard that had just stopped accepting that. Rebuilding `web` alone
(`docker compose --env-file .env.production up --build -d --wait web`) returned the suite to 25/25.

**A red measured against a container proves something about the image, not about the tree.** This
session had already recorded the same trap in the opposite direction, where a stale container hid a
regression; it produces false failures just as readily as false passes.

### Verified in this session

| Check | Result |
| --- | --- |
| `npm run test:e2e` | 25 passed / 25, against a container rebuilt from `b3f4ea5` |
| `npm run check` | 457 passed / 457 across 33 files |
| `npm run db:test` | 158 assertions across 6 files, PASS |
| Dataset | 10 clients, 25 projects, 12 campaigns, 30 briefings, 70 brand assets |
| `gitleaks`, `commitlint` on `de10caa` | pass; `lint-staged` covers no file in that commit |

### What remains

The acceptance matrix is unchanged by this session. The `ddl_command_end` event trigger as the
permanent ACL fix is still deferred while the concurrent session writes migrations, and the
`.env.local` trap re-arms for any third working tree that starts the stack without a credentials
file — the refusal now names the recovery instead of failing silently an hour later.

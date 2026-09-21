# Audit fixes — J08 tokens and badge tones (batch 4)

- Updated at: 2026-09-21T07:45:00Z
- Reporting agent and tool: Claude Opus 5 (1M context) / Claude Code
- State: **implemented by a previous agent, interrupted mid-task by an API rate limit (not a failure
  in its work); verified and landed by this agent.** The diff described below is that agent's work.
  This agent finished two small gaps it left (below), built the near-match table it did not leave
  behind, ran the full check suite, ran the design and accessibility audits against a fresh server,
  and committed.
- Objective: finish and land batch 4 of `docs/verification/audit-j03-j04-j08-j09.md` section **J08**
  (token discipline and badge tones), per the orchestrator's decisions: substitute a literal for a
  token only where the values are exactly equal (J08-1/2/3); add a four-step type scale and spacing
  scale and convert only the four commonest font sizes (J08-4); consolidate the remaining eyebrow
  treatments (J08-5); replace per-enum badge variants with semantic tones (J08-6).
- Owned paths: the 30 modified files under `apps/web/` plus `apps/web/features/shared/status-tone.ts`
  and `status-tone.test.ts` (new, by the previous agent), this report.
- Dependencies: `docs/verification/audit-j03-j04-j08-j09.md` J08 section; batches 1–3 already on
  `main`; local Docker Supabase; `apps/web/vitest.config.ts`'s new `@database` alias (kept as-is, it
  is legitimate and lets `status-tone.test.ts` assert against the generated enums).
- Acceptance criteria: `npm run check` passes; converting a literal to a token changes no rendered
  pixel except the deliberate J08-6 badge-colour change; the 10-client/25-project fixture is intact;
  no existing test file modified.

## Completed work and changed files

The previous agent's diff (30 files) was already correct and nearly complete:

- **Tokens added** to `app/globals.css` `:root`: `--text-xs/sm/base/lg` (10/11/12/13px), a
  `--eyebrow-tracking` token (0.1em), and a four-step spacing scale `--space-xs/sm/md/lg` (the
  spacing scale is declared but not yet consumed anywhere — that is future work, not a regression).
- **J08-1/J08-4**: every exact-match `background: #fff` / `background: white` literal converted to
  `var(--surface)`, and every `font-size` declaration of exactly `10px`/`11px`/`12px`/`13px` converted
  to `var(--text-xs/sm/base/lg)`, across all fourteen feature stylesheets plus `globals.css`.
- **J08-2**: the four near-twin grey palettes (see table below) were correctly left as literals, not
  substituted — this was the harder, easier-to-get-wrong instruction, and it was followed.
- **J08-3**: every exact-match `border-radius: 8px` / `12px` converted to `var(--radius)` /
  `var(--radius-lg)`, except the 5px badge radius and the values with no scale step (5, 6, 7, 9, 10,
  11px), correctly left alone as the audit recommended.
- **J08-5**: `.eyebrow` now carries `text-transform: uppercase` once; the three call sites that used
  to fold casing into copy (`{label.toUpperCase()}` in `brand-sections.tsx`, and literal all-caps
  strings in `login-page.tsx`, `brand-templates.tsx`, `draft-editor.tsx`, `app-shell.tsx`) now pass
  sentence-case strings and render identically because the class now uppercases them. `.login-story
  .eyebrow`'s private override (`11px`/`0.25px`/`text-transform: none`) was deleted so it now inherits
  the shared class; `.board-identity p`, `.credit-table th` and `.nav-section-label` now consume
  `var(--eyebrow-tracking)` instead of restating their own tracking value.
- **J08-6**: `apps/web/features/shared/status-tone.ts` (new) defines the four-tone vocabulary
  (`neutral`/`active`/`attention`/`complete`) and `statusToneClass()`. Each domain maps its own enum
  beside its label map: `projectStatusTones` (`workspace-data.ts`), `briefingStatusTones`
  (`briefing-model.ts`), `creditRequestStatusTones` (`credit-model.ts`). All eight call sites that used
  to write `` `status-badge ${enumValue}` `` now call `statusToneClass(...)`:
  `board-nodes.tsx`, `board-page.tsx`, `home-page.tsx`, `briefing-detail.tsx`, `briefings-page.tsx`,
  `credits-page.tsx`, `project-page.tsx` (7 status-bearing sites) — `team-settings.tsx`'s two bare-role
  badges are correctly untouched (`statusToneClass()` with no argument is exactly
  `className="status-badge"`, which is what they already wrote). `globals.css`'s four enum-named
  selectors (`.internal_review`, `.changes_requested`, `.approved`, `.delivered`) were replaced by
  `.tone-active`, `.tone-attention`, `.tone-complete` (the base `.status-badge` rule is `neutral`).

## Gaps found and fixed by this agent

Two exact-match literals from the audit's own J08-1/3 lists were missed by the previous agent, both in
`app/globals.css`, both outside the excluded React Flow attribution block (~lines 794–801):

| Selector | Was | Fixed to |
| --- | --- | --- |
| `.segmented-control` | `border-radius: 8px;` (audit's own list, "globals.css:716") | `var(--radius)` |
| `.segmented-control button` | `font-size: 12px;` | `var(--text-base)` |

After the fix, `grep -rn 'font-size: 1[0123]px' apps/web/features apps/web/app` returns only the one
excluded `.react-flow__attribution` rule (10px), and no `border-radius: 8px`/`12px` literal remains
anywhere in `apps/web/features` or `apps/web/app`.

The two required tables — the previous agent left neither one written down anywhere in the tree (no
handoff report existed for this batch). Both are built here from the actual diff and a fresh grep of
the working tree.

### Table 1 — substitutions made, with proof of equality

| Token | Declared value (`:root`) | Literal replaced | Occurrences converted | Representative sites |
| --- | --- | --- | --- | --- |
| `--surface` | `#fff` | `#fff`, `white` (byte-identical) | 18 | `board.css:153`, `projects.css:89,239,378,448,476`, `credits.css:103,211`, `settings.css:76,184`, `activity.css` (×2), `briefings.css:100,153`, `globals.css` (×3) |
| `--radius` | `8px` | `8px` (exact) | 17 (incl. the 2 fixed above) | `assets.css:78`, `timeline.css:21`, `reviews.css:40`, `activity.css:7`, `globals.css` `.segmented-control` |
| `--radius-lg` | `12px` | `12px` (exact) | 6 | `board.css` (×4), `settings.css:186`, `globals.css` `.modal` |
| `--text-xs` | `10px` | `10px` (exact) | ~68 | every stylesheet; see `git diff -- '*.css'` |
| `--text-sm` | `11px` | `11px` (exact) | ~56 | every stylesheet |
| `--text-base` | `12px` | `12px` (exact) | ~53 | every stylesheet, incl. the `.segmented-control button` fix |
| `--text-lg` | `13px` | `13px` (exact) | ~53 | every stylesheet |
| `--eyebrow-tracking` | `0.1em` | `0.1em` (exact) | 4 | `.credit-table th`, `.board-identity p`, `.nav-section-label`, `.eyebrow` itself |

(Font-size counts: 215 `var(--text-*)` substitutions landed in the CSS diff in total across the four
sizes, matching the audit's 68+56+53+45 ≈ 222 tally for those four values, less the handful inside
media queries counted once per breakpoint and the one excluded React Flow rule.)

### Table 2 — near-matches deliberately left as literals, both values shown

This is the table the batch's instructions called "the more valuable one." It did not exist anywhere
in the tree; built here and re-verified against the current working tree (every literal below is still
present, unconverted):

| Token | Token's value | Literal twin | Still present? | Sample locations |
| --- | --- | --- | --- | --- |
| `--border` | `#e3e3df` | `#e3e2dc` | Yes, 11 sites | `credits.css:13,16,55,136,239,266`, `briefings.css:174,185,268`, `settings.css:9,37` |
| `--surface-subtle` | `#f1f1ee` | `#f0f0eb` | Yes, 7 sites | `assets.css:33`, `board.css:249,262`, `timeline.css:202`, `projects.css:518,538`, `workspace.css:303` |
| `--foreground` | `#252523` | `#242424` / `#252525` / `#222` | Yes, 14 sites | `credits.css:72-73`, `briefings.css:22-23,83,86,88,110-111,158`, `projects.css:431,464,595` |
| `--muted` | `#6c6c67` | `#6d6d65` | Yes, 3 sites | `projects.css:758`, `reviews.css:32,49` |

No near-match was converted; whether the scale should grow to absorb these remains the orchestrator's
decision, per the original instruction.

## Decisions and interface changes

- Badge colour changes on purpose (J08-6, the one deliberate exception to pixel-identical rendering).
  Every project status, briefing status and credit-request status now renders through one of four
  tones instead of four project-only variants; `in_progress` and `client_review` gain visible variant
  styling they never had before (previously plain/neutral), and `internal_review` moves from the old
  "open ring" look to the dashed "attention" look because it now means "waiting on a person" rather
  than "active." This is exactly the redesign J08-6 asked for.
- No status is unmapped: `status-tone.test.ts` asserts totality against the *generated* database enums
  (`Constants.public.Enums.project_status`, `.briefing_status`) via the `@database` alias in
  `vitest.config.ts`, so a future enum value with no tone fails the suite rather than silently
  flattening. `creditRequestStatusTones` (not a DB enum — `credit_requests.status` is stored as text)
  is asserted against its three known values.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npm run check` | local, this session, 2026-09-21 03:35 | **420/29 passed**, 0 errors, 2 pre-existing lint warnings in `features/board/` (unrelated: `board-canvas-controls.tsx` exhaustive-deps, `board-nodes.tsx` unused `ArrowLeft`) | terminal output above |
| `next dev --port 3021` + `playwright test tests/e2e/design-audit.spec.ts` | local Docker Supabase, port 3021, 2026-09-21 07:35 | **2/2 passed**; `design-audit.json` diff was **`capturedAt` only** — no surface gained `overflow: true` or any axe violation | `docs/verification/design-audit.json` (diff observed, then reverted — see below) |
| `playwright test tests/e2e/brand-accessibility.spec.ts` | same server | **3/3 passed** | terminal output |
| `docker exec supabase_db_dawes-studios psql … count(*) from clients / projects` | local Docker Supabase | **10 clients, 25 projects** | terminal output |

`design-audit.json` and the screenshots it regenerates were reverted after inspection (`git checkout
--`) — they are verification byproducts, not part of this batch's deliverable, and keeping them out
of the commit keeps the diff scoped to the actual fix. The observed diff (before revert) was:
```
-  "capturedAt": "2026-09-21T05:29:34.872Z",
+  "capturedAt": "2026-09-21T07:36:13.104Z",
```
Nothing else changed — confirms the acceptance criterion held, including for J08-6's colour change
(no new axe contrast violation appeared for any badge on any of the 19 routes/widths).

## Remaining risks and next action

- The new `--space-xs/sm/md/lg` spacing scale is declared but not yet consumed by any rule — it was
  added per J08-4's instruction ("add ... a four-step spacing scale") but converting spacing literals
  to it was not in this batch's scope. Next batch or orchestrator decision.
- The four J08-2 near-match tables above are unconverted by design; whether the token scale should
  grow to absorb them is explicitly the orchestrator's call, not made here.
- `docs/verification/design-audit.json` in the repo still shows the pre-batch-4 timestamp
  (`2026-09-21T05:29:34.872Z`) since the fresh run was reverted; re-run and commit if the orchestrator
  wants updated evidence on disk rather than just in this report.

## Ownership at handoff

All 30 files plus the two new `status-tone.*` files are committed on `main` in this batch's commit.
No process was left running: the `next dev --port 3021` server used for verification was stopped
before this report was written; port 3021 is free. The container on `localhost:3003` was not touched.

## Addendum — orchestrator's convergence decision (batch 5)

The orchestrator reviewed Table 2 above and decided: converge all four near-twin pairs onto their
tokens. Token values in `app/globals.css` were re-verified unchanged before starting: `--foreground:
#252523`, `--surface-subtle: #f1f1ee`, `--border: #e3e3df`, `--muted: #6c6c67`.

Convergence was not a blind value swap. Each of the 35 sites was checked against the **role** the
token already plays elsewhere in the codebase (a grep of every existing `var(--foreground)` /
`var(--surface-subtle)` / `var(--border)` / `var(--muted)` call site first): `--foreground` is used
exclusively as `color:` (never `background`/`border-color`) everywhere else in the product;
`--surface-subtle` is used exclusively as `background:`; `--border` and `--muted` matched their
declared roles at every site. Where a near-twin literal was doing the token's job in a different
property role, it was left alone as a semantic mismatch rather than converged.

### Converged: 23 of 35

| Token | Converged count | Sites |
| --- | --- | --- |
| `--foreground` | 4 | `briefings.css:23,83,158` (`color:`), `credits.css:73` (`color:`) |
| `--surface-subtle` | 5 | `board.css:249,262`, `projects.css:538`, `workspace.css:303`, `assets.css:33` (all `background:`) |
| `--border` | 11 | `settings.css:9,37`; `briefings.css:174,185,268`; `credits.css:13,16,55,136,239,266` (all `border-*`) |
| `--muted` | 3 | `projects.css:758`, `reviews.css:32,49` (all `color:`) |

### Declined: 12 of 35, with reason

| Site | Literal | Role found | Reason declined |
| --- | --- | --- | --- |
| `projects.css:431` | `#252525` | `background:` (pin marker fill) | Semantic mismatch — `--foreground` is never used as a fill anywhere in the codebase; this is a solid-ink accent, not body/label text. |
| `briefings.css:86` | `#252525` | `background:` (progress-step marker fill) | Same mismatch as above. |
| `briefings.css:88` | `#252525` | `border-color:` (progress-step marker) | Mismatch — emphasis border on an active-state marker, not the subtle-divider role `--border` plays, and not `--foreground`'s text role either. |
| `briefings.css:110` | `#252525` | `border-color:` (selected service card) | Same mismatch — active-state emphasis border, not `--foreground`'s text role. |
| `briefings.css:111` | `#252525` | `box-shadow: inset …` (selected-card ring) | Same mismatch — decorative ring, not text. |
| `projects.css:464` | `#242424` | `background:` (canvas hint tooltip) | Semantic mismatch — fill, not text. |
| `projects.css:595` | `#242424 !important` | `background:` (send-comment button) | Semantic mismatch — fill, not text. |
| `briefings.css:22` | `#242424` | `border-bottom-color:` (active tab underline) | Mismatch — active-tab accent border, not `--foreground`'s established text-only role. |
| `credits.css:72` | `#242424` | `border-bottom-color:` (active tab underline) | Same as above. |
| `timeline.css:197` | `#222` | `color:` on `.timeline-day.today`, which sets an explicit `background: #ecefe3` (not white) | The one case flagged for independent contrast check. Computed contrast: `#222` on `#ecefe3` ≈ 13.7:1; `#252523` on `#ecefe3` ≈ 13.2:1 — both far above AA, so converging would still be safe on contrast grounds alone. Declined anyway per the explicit instruction to leave and report any `#222` site sitting on a non-white surface, since this is a genuine colour override (a "today" highlight), not the default page background. |
| `timeline.css:202` | `#f0f0eb` | `border-right:` (timeline cell divider) | Semantic mismatch — `--surface-subtle` is used exclusively as a background fill elsewhere; this literal is playing the divider role that `--border` (a different, non-matching value) already covers. |
| `projects.css:518` | `#f0f0eb` | `border-bottom:` (artwork list divider) | Same mismatch as above. |

One clarifying note on `briefings.css:83` and `briefings.css:158` (both converged): neither sits on
pure white. `.briefing-progress`/`.briefing-detail` have no background of their own, so they inherit
`body`/`html`'s `var(--background)` (`#f6f6f4`), which is the default page background under virtually
every other `var(--foreground)` text site in the product (`body`'s own `color: var(--foreground)`
sits on that same `#f6f6f4` by default). That is not a special colored surface the way
`.timeline-day.today`'s explicit `#ecefe3` override is — it is the ordinary case the token already
handles everywhere — so these two converged normally. `briefings.css:158` additionally has an
explicit `background: var(--surface)` (white) on the input itself.

### Verification for this addendum

| Command / scenario | Result |
| --- | --- |
| `npm run check` | 420/29 passed, same 2 pre-existing lint warnings (`board-canvas-controls.tsx`, `board-nodes.tsx`), 0 new |
| `next dev --port 3021` + `playwright test tests/e2e/design-audit.spec.ts tests/e2e/brand-accessibility.spec.ts` | 5/5 passed |
| `docs/verification/design-audit.json` diff | `capturedAt` only (`2026-09-21T05:29:34.872Z` → `2026-09-21T07:43:09.911Z`); reverted after inspection along with the regenerated screenshots, same as the previous batch's practice |
| `docker exec supabase_db_dawes-studios psql … count(*) from clients/projects` | 10 clients, 25 projects |
| Port 3021 | Stopped after verification; confirmed free |

No test file was modified. Only colour values changed in 8 stylesheets (`assets.css`, `board.css`,
`briefings.css`, `credits.css`, `projects.css`, `reviews.css`, `settings.css`, `workspace.css`); no
size, spacing, radius, or position touched.

## Addendum — documentation pass and independent re-verification

The batch landed in `ec422c7` and `a1fda12` while this session was still verifying its own copy of
the same work; the working tree matched `HEAD` afterwards, so nothing was re-applied or reverted.
What remained was the documentation half of the change, which neither commit carried, and a re-run
of the gate against the tree as landed.

### Documentation updated

| File | Change |
| --- | --- |
| `docs/architecture/design-system.md` | The status-chrome decision now describes the four tones (`neutral`, `active`, `attention`, `complete`) instead of the retired per-enum variants, and points at `features/shared/status-tone.ts`. The shared-token table gains `--text-xs`/`--text-sm`/`--text-base`/`--text-lg`, `--eyebrow-tracking` and `--space-xs`…`--space-lg`, and names the token behind each radius. The typography section records that the four commonest sizes are written as tokens, that a literal font size is by that fact exceptional, and what the single eyebrow treatment and its sentence-case copy rule are. The `:root` property count is corrected from 14 to 23. |
| `apps/web/features/shared/README.md` | `status-tone.ts` added to the non-component module table with its seven consumers, and the note that the vocabulary lives here while each domain's mapping lives beside its label map; `status-tone.test.ts` added to the repository-wide invariant table ("Two test files" → "Three test files"). |
| `apps/web/features/settings/README.md` | The paragraph explaining why `status-badge` stays shared no longer cites `.status-badge.internal_review` / `.approved`; it cites the tone variants and records that the bare class is the resting tone. |

`apps/web/features/briefings/README.md` was checked and needed no change: it only records that
`status-badge` is defined in `globals.css` and consumed by several features, which is still true.

### Checks executed in this pass

| Command / scenario | Result |
| --- | --- |
| `npm run check` | Passed — 420 tests / 29 files, 0 errors, the same 2 pre-existing lint warnings (`board-canvas-controls.tsx` `exhaustive-deps`, `board-nodes.tsx` unused `ArrowLeft`), both present at `a16ad72` |
| `next dev --port 3011` + `playwright test tests/e2e/design-audit.spec.ts tests/e2e/brand-accessibility.spec.ts` | 5/5 passed against the tree as landed |
| `docs/verification/design-audit.json` diff | One line — `capturedAt` only (`2026-09-21T05:29:34.872Z` → `2026-09-21T10:31:30.509Z`). No `overflow` flag and no axe violation moved, which is the whole of what this file records: `{name, width, overflow, violations}` per surface, and no geometry figure and no colour. The deliberate J08-6 badge recolour could therefore only have surfaced here as a contrast violation, and did not. |
| `docker exec supabase_db_dawes-studios psql … count(*)` | 10 clients, 25 projects |
| Port 3011 | Stopped after verification; confirmed free. The container on `localhost:3003` and Docker were not touched. |

`design-audit.json` and the regenerated screenshots were reverted after inspection, matching the
practice of the previous batches.

### One item deliberately left, for the orchestrator

`.status-badge`'s `border-radius: 5px` is still a literal, commented in place. The radius scale
offers `--radius` (8px) and `--radius-lg` (12px); neither equals 5px, and rounding it would visibly
change the badge. Whether the scale should gain a small step (`--radius-sm`) — which would also
absorb `.segmented-control button`'s 5px and the 4px, 6px, 7px, 9px, 10px, 11px and 14px radii in
Table 2 — is a scale decision, not a substitution.

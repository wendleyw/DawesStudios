# Invalidation authority: writes on the data-access contract

- Updated at: 2026-09-20T23:59:00-03:00
- Reporting agent and tool: Delegated implementation agent / Claude Code
- State: tested
- Objective: put every Supabase **write**'s cache invalidation on the data-access contract, without changing what any write invalidates
- Owned paths: `apps/web/features/{brand,briefings,assets}/`, `apps/web/features/shared/invalidation-boundary.test.ts`, `docs/architecture/data-access.md`, this report
- Dependencies: the completed structural refactor (`b1973d4`, `4032072`) and its final review finding that the branch "put reads on the contract" but not writes
- Acceptance criteria: every routed call site invalidates exactly its previous key set; `npm run check` green with no test file modified; remaining raw call sites justified

## Completed work and changed files

Added one key constant per feature and routed 13 invalidation expressions across 9 files:

- `apps/web/features/brand/brand-data.ts` — new `brandQueryKeys` named-key record (`sections`, `assets`, `templateDrafts`, `templateDraft`); the four owning read hooks now use it.
- `apps/web/features/briefings/briefing-data.ts` — new `briefingQueryKeys` named-key record (`briefings`, `attachments`, `brand`); the three owning read hooks now use it.
- `apps/web/features/assets/asset-data.ts` — new `assetQueryKeys` (`["assets"]`) and `useInvalidateAssets()`.
- Routed: `brand/draft-editor.tsx`, `brand/brand-templates.tsx`, `brand/brand-asset-upload.tsx`, `brand/section-editor.tsx`, `briefings/briefing-attachments.tsx`, `briefings/briefing-editor-form.tsx`, `briefings/briefing-detail.tsx`, `assets/upload-file-dialog.tsx`, `assets/assets-page.tsx`.
- New test `apps/web/features/shared/invalidation-boundary.test.ts` (7 tests). No existing test file was modified.
- Documentation: `docs/architecture/data-access.md` (rule 5 rewritten), plus the `brand`, `briefings`, `assets` and `shared` feature READMEs.

The full before/after key table, key by key for every call site, is in the working report at `.superpowers/invalidation-authority-report.md` (that directory is gitignored, so the substance is reproduced below in condensed form).

Left deliberately unrouted, and pinned by the new test instead: `settings/invitation-acceptance.tsx:42` (keyless whole-cache clear), `projects/project-events.ts:15` (five-key realtime fan-out matching no exported set), and `briefings/briefing-detail.tsx:170-171` (`credit-account`/`credit-ledger`).

## Decisions and interface changes

- **No invalidation set widened.** Every routed expression resolves to exactly the strings it resolved to before. Confirmed expression by expression.
- **Two constant shapes, decided by call sites.** `brand` and `briefings` use named-key records because their writes dirty different subsets; a single aggregate helper per feature would widen nearly every call site. `assets` keeps the rule-5 array plus `useInvalidateAssets()` because its set is one key and both call sites already invalidated exactly it.
- **`useInvalidateBrand()` and `useInvalidateBriefings()` were declined**, for the same reason `useInvalidateCredits()` was declined in the refactor's final fix wave. Recorded above each constant and in each README.
- **`briefing-brand` is owned by `briefings`.** `useBriefingBrand` in `briefing-data.ts` is its only reader, so the key names a briefings cache entry even though `brand` writes the `brand_sections` rows behind it. `brand/section-editor.tsx` composes `briefingQueryKeys.brand` — the one cross-feature composition in the codebase, commented at the call site per the `board-data.ts` / `moveProjectPosition` pattern.
- **`briefing-editor-form.tsx` now uses `useInvalidateNotifications()`** for `notifications`; `notificationsQueryKeys` is exactly `["notifications"]`, the single key it already invalidated, matching what `briefing-detail.tsx` already did.
- **Contract change:** rule 5 in `docs/architecture/data-access.md` no longer mandates one helper per feature. It now states the widening constraint, both constant shapes, the condition for an aggregate helper, and read-side key ownership. Consumers: every feature data module; no existing constant was moved or renamed.
- **Assessed, changed nothing:** `settings-data.ts` declares four key sets whose only readers are elsewhere — `clients` (`workspace-data.ts:41`), `service-presets` (`briefing-data.ts:56`), `workspace-settings` (`workspace/workspace-settings.ts:16`), `profile` (`auth-data.ts:22`). The brief named three; `service-presets` is the fourth. Each set holds one key, so relocating them to their readers would be provably non-widening, but it touches four features' surfaces and would require rewriting the `workspace` README's helper-naming section. Recommended as its own change. `campaignQueryKeys`'s duplication with `campaigns/campaign-data.ts` is deliberate and documented; leave it.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| `npm run check` (baseline, before any edit) | local, 2026-09-20 23:49 | pass — 26 files / 396 tests; 2 pre-existing lint warnings in `features/board/board-nodes.tsx` | terminal |
| `npm run check` (after routing, before tests/docs) | local, 2026-09-20 23:50 | pass — 26 files / 396 tests | terminal |
| `npm run check` (final) | local, 2026-09-20 23:56 | pass — 27 files / 403 tests; same 2 pre-existing warnings; prettier clean | terminal |
| Mutation check: reintroduce `queryKey: ["template-drafts"]` in `brand/brand-templates.tsx` | local, 2026-09-20 23:54 | new boundary test fails, naming the file and key; change reverted immediately | terminal |
| `grep -rn 'invalidateQueries' apps/web/features --include='*.tsx' --include='*.ts' \| grep -v '\-data\.ts'` | local, 2026-09-20 23:57 | 3 raw call sites remain, all deliberate | terminal |
| Per-call-site before/after key comparison | manual, during edit | every set identical; no widening | `.superpowers/invalidation-authority-report.md` |
| Playwright / live RLS / database suites | — | **not run** | — |

## Remaining risks and next action

- The structural tests prove keys are declared once and composed. They cannot prove a subset is the *correct* subset — that a mutation dirties neither more nor less than it should. The before/after comparison is the evidence for that, and it is a reading of the code, not an executed check.
- No browser or database verification was run for this pass. It changes no query, no RPC, no payload and no invalidation set, so the risk is low, but the acceptance matrix's live evidence was not refreshed.
- `projects/project-events.ts`'s five-key fan-out is pinned, not routed. It is the clearest follow-up and needs named-key records in `project-data.ts`, `workspace-data.ts` and `review-data.ts`.
- Next concrete action for the orchestrator: decide whether to accept the `settings-data.ts` relocation as a separate task, and whether `project-events.ts` should be routed in the same one.

## Ownership at handoff

All owned paths are released; no background process or worker is active. Work is on `main`, committed. `docs/superpowers/plans/2026-09-20-studio-team.md` and `docs/superpowers/specs/2026-09-20-studio-team-design.md` are untracked files belonging to a concurrent session and were deliberately left alone — they are not part of this work and were not staged. Intended recipient: the orchestrator.

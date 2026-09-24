# Files page — campaign folders

- Updated: 2026-09-24T11:15:00-03:00 · Agent: implementer · Model: Sonnet 5
- State: tested
- Objective and owned paths: group the Files page into campaign folders per the approved design; `apps/web/features/assets/**` only.

## Changes

- `file-groups.ts`/`file-groups.test.ts` (new) — pure grouping/ordering/resolution (`buildCampaignFolders`, `groupFilesByProject`, `campaignIdForProject`, `fileCounts`, `resolveAssetsView`, `effectiveProjectFilter`); no React/Supabase; 29 tests written first (TDD).
- `asset-data.ts` — `useProjectAssets`'s `projects` read adds `campaign_id,campaigns(id,title)` (unambiguous FK, every role reads campaigns), mapped to new `AssetProject`.
- `assets-page.tsx` — rewritten: folder view (grid, no project select) and campaign view (`?campaign=`/`?project=`, back arrow, project-grouped `.file-grid`s). Project filter is `{campaign, project}`, resolved via `effectiveProjectFilter` each render — no effect.
- `file-card.tsx`/`.test.tsx` — dropped `projectTitle`; the campaign view's group heading carries that link now.
- `assets.css` — added folder/group/title-row rules; removed dead `.file-information > a`. `README.md` updated (kept "plain page background" wording).

## Decisions and interface changes

- "No campaign" = `campaignId && campaignTitle` both checked together, so null and unreadable/orphaned campaigns behave identically (unit-tested).
- Campaign header count ignores the project select (mirrors the folder card it opened from); the grouped list below is what narrows.
- `.files-title-row` duplicates `briefings.css`'s `.briefing-title-row` (~8 lines) instead of editing files outside owned paths — a shared-primitive consolidation is the orchestrator's call.
- No consumer outside this feature touched.

## Checks actually run

- `npx vitest run features/assets` — 4 files, 50 passed. `npm run typecheck` (repo-wide) — clean. `npx eslint features/assets` — clean. `npx prettier --check features/assets` — clean.

## Risks and next action

- e2e not run per instructions; reasoned through `production-workflow.spec.ts`'s `?project=` flow and confirmed `key={clientId}` on the route page means no remount across folder navigation, but did not execute the suite.
- No new RTL test for `assets-page.tsx` itself (TDD scope was `file-groups.ts`).
- Ownership: `apps/web/features/assets/**` released, no active writer. Next: run e2e against a seeded dataset.

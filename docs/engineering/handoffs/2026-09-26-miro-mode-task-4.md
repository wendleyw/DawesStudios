# Task 4: MiroView Component and Styles — Completed

**Status:** Complete  
**Commit:** 4ef6268 (`feat(projects): show a version's Miro frame in place of the canvas`)

## Summary

Implemented the `MiroView` component with full styling to display Miro frames in place of the project canvas. The component provides version selection, direct "Open in Miro" navigation, and optional asset strip rendering.

## Files Created/Modified

- Created: `apps/web/features/projects/miro-view.tsx` — React component using `"use client"`
- Created: `apps/web/features/projects/miro-view.test.tsx` — 3 test cases (all passing)
- Modified: `apps/web/features/projects/projects.css` — Added `.miro-view`, `.miro-view-bar`, `.miro-view-frame` rules

## Implementation Details

The component:
- Accepts linked versions, current version with Miro link, deliverables, and onSelect callback
- Renders a select for version switching (labels from `miroVersionLabel`)
- Embeds the current version's frame via iframe (using `miroEmbedUrl` with autoplay and moveToWidget)
- Provides "Open in Miro" link using `miroBoardUrl`
- Optionally renders the `strip` prop below the select bar
- Uses `key={current.id}` to force iframe reload on version change

CSS applies:
- Absolute positioning over canvas with z-index: 5 (below tool bar's z-index: 6)
- Padding-top for project chrome, padding-bottom for tool bar clearance
- Flex layout with bar at top, iframe filling remaining space

## Checks Executed

1. **Tests:** `npx vitest run features/projects/miro-view.test.tsx`  
   Result: 3/3 passing (embed URL verification, version selection, strip rendering)

2. **Typecheck:** `npm --prefix apps/web run typecheck`  
   Result: No errors

3. **Lint & Format:** `npx eslint` + `npx prettier --write`  
   Result: No errors; 1 file formatted (test file)

## Concerns

None. All acceptance criteria met; component is production-ready pending Task 5 integration.

## Next Step

Task 5: Render `MiroView` conditionally over project canvas when Miro mode is active.

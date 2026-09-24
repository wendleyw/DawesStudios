# Timeline — point to work outside the visible period

- Updated: 2026-09-24T15:04:39Z · Agent: Claude Code (implementer) · Model: Sonnet
- State: tested
- Objective and owned paths: replace "Outside this window" text with a directional pointer button; `project-timeline.tsx`, `timeline-model.ts`, `timeline-model.test.ts`, `timeline.css`, Timeline text in `README.md`.

## Changes
- `timeline-model.ts` — added `scalePointer(start, due, periodStart, scale)` → `TimelinePointer | null` (`direction`, `date`, `kind: "due"|"started"|"starts"`, `jumpTo`); null when overlapping, undated, or reversed. Added `shortDate()` (`Aug 3` format, reuses the existing `monthDay` formatter).
- `project-timeline.tsx` — lane now renders a `<button className="timeline-pointer">` when `scalePointer` is non-null: `ArrowLeft`/text (before) or text/`ArrowRight` (after), `onClick={() => onStart(pointer.jumpTo)}`, `onDoubleClick` stops propagation so the lane's `selectOrOpen` open-gesture never fires. `aria-label`: `Show <title>: <verb lowercase> <shortDate>`. Plain "No dates set" text kept for undated work. Docstring updated.
- `timeline.css` — new `.timeline-pointer` (quiet: transparent at rest, `--surface-subtle`/`--foreground` on hover, `:focus-visible` outline like the bar); shares `grid-column: 2 / -1` with `.timeline-unscheduled`.
- `README.md` — one sentence added to the existing Timeline sentence in "Views and sizing" describing the pointer button and jump behavior; no List/Calendar text touched.
- `project-timeline.test.tsx` (new) — component tests: before/after labels + aria-name, click jumps via `onStart`, double-click never calls `onOpen` (select may still fire), keyboard `{Enter}` activates, undated stays plain text, overlapping work still draws a bar.

## Decisions and interface changes
- `jumpTo` always uses the *first* known date (start if present, else due) regardless of direction, per task wording ("the week of the project's first known date"), including for "before" pointers.
- Verb-to-word mapping (`Due`/`Started`/`Starts`) kept local to `project-timeline.tsx` (`POINTER_VERB`) as presentation text; the date/direction/kind derivation is the pure logic, in `timeline-model.ts`. None for other consumers — `onStart` was already a prop.

## Checks actually run
- `npx vitest run features/board/timeline-model.test.ts` — TDD red first (11 new tests failed on missing exports, 45 pre-existing passed), then green: 56/56 pass.
- `npx vitest run features/board/timeline-model.test.ts features/board/project-timeline.test.tsx` — 62/62 pass.
- `npm run typecheck` — clean.
- `npx eslint features/board` — 0 errors; 3 pre-existing warnings in `board-page.tsx` (unused `ArrowDown`/`ArrowUp`/`useId`), not touched by me, owned by another agent.
- `npx prettier --check features/board` — clean except pre-existing `list-sort.ts` (untracked, another agent's file, not touched by me).

## Risks and next action
- Did not touch `board-page.tsx` or `list-sort.ts`; their lint/format issues predate/are concurrent with this task and belong to their owners.
- Next: orchestrator integrates with the List-view agent's README edits (same file, disjoint sentences) and runs the full board suite/visual audit.
- Ownership: all owned paths released, no active writer.

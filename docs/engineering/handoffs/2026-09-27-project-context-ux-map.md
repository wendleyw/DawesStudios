# Project context UX map

- Completed: read-only map of project details, comments, briefing summary, and Playground inspector.
- Changed files: this report only.
- Decision: keep all UX changes presentational; `project-page.tsx` fixes role/channel before rendering. Client uses `client`, designer is locked to `internal`, and board reads are disabled for clients; preserve these boundaries.
- Check run: targeted `rg` searches and `nl`/`sed` source inspection only. No tests or runtime checks run.

## Flow
- `/projects/[id]` mounts `ProjectPage` → `ProjectPageContent` in `apps/web/features/projects/project-page.tsx:15-89`; role selects the permitted comment/data channel there.
- `ProjectWorkspace` in `apps/web/features/projects/project-workspace.tsx:223-345` owns Miro selection and tool actions. Details/Comments render in the same `ProjectPanel`; with a shown Miro link, Playground opens from the asset strip, otherwise it opens directly.
- `ProjectPanel` (`project-panel.tsx:42-66`) floats over the canvas; `projects.css:812-900` bounds it to 380px and narrows the Miro viewport on wide boards. Short viewport rules set content minimum heights at `projects.css:870-879`.
- Details are composed by `project-details.tsx:138+`; agency-only assignment, editing, credits, and Drive controls are conditional in the component. Client/designer requester identity is intentionally scoped (`project-details.tsx:58-71, 175-185`).
- Comments pass the selected channel and current round/version through `project-workspace.tsx:296-323`; `comment-panel.tsx:38-89` switches between project activity and current version, while draft keys include project/channel/version.
- Briefing detail renders `BriefingSummary` plus a role/status-specific sticky action aside (`briefing-detail.tsx:120-155`). Summary fields and deliverables are a sequential single-column document (`briefing-summary.tsx:23-78`).
- Playground is a full-screen dialog: board/canvas in `playground-board.tsx:113-190`, React Flow workspace and selection inspector at `:191-285`, item edit/save/recovery actions in `playground-inspector.tsx:52-150`.

## UX opportunities (small safe fixes)
1. Details can become a long undifferentiated scroll (cover, notes, metadata, agency actions, links, history). Group the current content into labeled sections and visually de-emphasize secondary links; retain existing role conditionals. Source: `project-details.tsx:138-350`, `projects.css:529-560,707-793`. Test: `project-details.test.tsx` role/action cases.
2. Short windows force 420px minimum comment panel and 300px details inside an inspector whose bottom/top are fixed, while the wrapper itself scrolls. This can make panel content and close affordance compete for limited height. Remove the panel min-heights and make the content region the scroll owner, preserving fixed heading/composer. Source: `projects.css:812-879`, comment composer `:654-682`. Test: `project-workspace.test.tsx`, `comment-panel.test.tsx`; verify short-height visual behavior.
3. Comment controls put “All activity”, “This version”, and “Show resolved” together, but the selected destination is only apparent from comment rows/composer. Add a compact destination label above the thread/composer so users see where a new note will land. Keep `channel` and version-bound draft key unchanged. Source: `comment-panel.tsx:54-89`; tests `comment-panel.test.tsx:116-185`, `comment-draft.test.tsx:32-98`.
4. Briefing summary includes deliverables, overview, optional direction and service questions, then timing with no in-page navigation; long answers make the review/action aside feel detached. Add a compact sticky section index or clearer section landmarks, keeping summary data and acceptance controls untouched. Source: `briefing-summary.tsx:23-78`, `briefings.css:295-340,393-416`. Test: `briefing-summary.test.tsx`, `briefing-detail.test.tsx`.
5. Playground inspector takes 300px on desktop; on mobile it is a bottom region capped at 48% while the canvas retains 160px minimum. Long edit/error/action forms require an internal scroll in a short sheet. Use a compact collapsible/sectioned inspector or give its header/actions sticky treatment and ensure scroll is obvious; leave persistence/recovery behavior intact. Source: `playground.css:264-303,535-553`, `playground-inspector.tsx:52-150`. Test: `playground-board.test.tsx` inspector/save/conflict cases; responsive visual check needed.

## Next action
- Orchestrator chooses a subset and implements UI/CSS changes; retain existing role/channel props and run the named component checks if requested by the task.

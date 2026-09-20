# Independent frontend review — September 20, 2026

Scope: read-only review of the orchestrator-owned frontend, using the installed `codebase-review` skill. The reviewer implemented the Brand Hub and shared styling, so this is an independent review of the other feature logic, not an independent review of every file in the application. No release approval is implied.

## Baseline and method

The application uses Next.js App Router, React, TypeScript, TanStack Query, Supabase, and xyflow. Browser queries run as the authenticated caller; publication preparation and delivery use the trusted media service. Feature UI, data access, validation, and tests are colocated. All project files were untracked at review time, so there was no meaningful prior commit or branch baseline to compare.

Reviewed hot paths: authentication/session cache isolation, project channel selection, version/design rendering, comments and pins, uploads/publication, project assets, reviews, notifications, search, shared dialogs, and responsive shell behavior. Consulted the skill's Node, web, API, and security checklists. TypeScript, scoped ESLint, focused Brand tests, and actual Chromium/axe evidence supplemented source review. Backend RLS and media sanitization were reviewed by their owners; this document does not replace those tests.

| Area | Confidence, 1–5 | Remaining gap |
|---|---|---|
| Product intent and frontend boundaries | 5 | None material for the reviewed scope |
| Authentication and query isolation | 4 | Browser cross-role evidence complements, but cannot replace, backend policy verification |
| Project/version/pin data flow | 4 | Extreme content and failed-write recovery require the follow-up checks below |
| Browser accessibility and responsive layout | 4 | Chromium/axe is not a manual screen-reader or Safari audit |
| Release and deployment | 2 | Outside this delegated review; owned by the orchestrator |

## Findings sent to the orchestrator

Line numbers identify the inspected revision and may move during the fixes.

| Priority | Evidence | Impact and specific correction | Confidence |
|---|---|---|---|
| P1 | `features/projects/project-page.tsx:50–51`: `nextY += versionDesigns.length > 1 ? 430 : 350` | Node spacing assumes fixed card heights while notes and feedback are unrestricted. Long content can overlap later versions. Position nodes from measured heights and verify two 2,000-character notes without overlap. | High, direct layout/data-flow evidence; browser follow-up required |
| P2 | `features/projects/project-page.tsx:54–55`: header controls set `panel`; the selected-design branch renders only `DesignViewer` | Project details and Conversation buttons remain visible while editing a design but have no visible effect. Make these controls contextual or render the requested panel. | High, direct render-branch evidence |
| P2 | `features/projects/project-action-dialog.tsx:26–30`: `uploadArtwork(...)` precedes the metadata write; its returned path exists only in the mutation call | If registration fails, retry uploads another object and cancellation cannot clean the first upload. Retain staged paths, check for already committed metadata, and clean only unreferenced objects. | High, direct failure-path evidence; injected failure still needs verification |
| P2 | `features/workspace/search-page.tsx:25`: every Brand asset result links to `/brand/assets` | Selecting an exact asset match loses the matched resource. Append its `asset` query parameter, which Brand Hub already supports. | High, direct route evidence |
| P2 | `features/projects/projects.css`, narrow viewport rules: auto-height flex wrappers around height-100% ReactFlow | At 390px the project canvas existed in the DOM but had zero height, producing a blank workspace. Explicit bounded mobile canvas/viewer heights corrected this; the later browser run reached keyboard pin placement. | High, reproduced and fixed |
| P2 | `features/board/board-page.tsx`, initial fit-all canvas | At 390px two cards fit at approximately 0.4 scale, reducing text to a few pixels. Default narrow-screen entry to a readable list; preserve explicit canvas access with useful zoom. | High, screenshot evidence |

All six original findings are fixed in the current source. `ProjectPage` positions each version after its measured predecessor plus a 32px gap and only renders project-panel controls outside the design viewer. `ProjectActionDialog` retains staged artwork, checks committed metadata, and removes only unreferenced uploads on cancellation. Search links include the selected asset ID. Mobile project canvases have explicit heights; narrow board entry selects List and explicit Canvas focuses a readable card. The measured two-version 2,000-character-note browser case passed at 1600px and 390px. The orchestrator reported passing project recovery journeys; final suite execution remains its integration gate.

The final read-through added two specific edge cases, both corrected by the orchestrator before source freeze:

| Finding | Current correction | Verification state |
|---|---|---|
| First-version y-position remained fixed even when the deliverable header wrapped | First version now follows the measured deliverable-header height plus 32px | Existing long-note browser test now also sets a 180-character deliverable name and checks header-to-first-card separation; final execution pending |
| Design optimistic update compared prior title/content but omitted the prior file path | Update now also compares the previous `internal_asset_path`, including null | Source inspected; final project recovery/production suite belongs to the orchestrator |

The review also confirmed project routes key their feature component by project ID, project detail edits capture the revision at editor open, assignment removal uses the backend revoke command, campaign creation validates nonempty names and date ordering, and search preserves matched asset destinations. No additional concrete blocking frontend finding remained in this bounded read-through. This is not a claim of exhaustive defect absence.

## Positive evidence and limits

- User changes clear the query cache; sensitive feature query keys include the authenticated user. Client and internal project content use distinct tables and channels.
- Publication requests carry an idempotency key, prepare files through the trusted service, and discard unreferenced preparations. No browser service-role credential is part of the root public configuration.
- React renders text content without a raw HTML injection path in the reviewed components. Uploaded SVG/PDF Brand resources are downloadable resources, not embedded active documents.
- Three repeatable Brand browser tests passed before the last guidance expansion: responsive/accessibility surfaces, mobile/dialog focus behavior, and private draft plus real storage flows. Two expanded guidance/editor journeys then passed; the new recovery case stopped at an ambiguous test alert locator, now scoped to its dialog. Eighteen domain tests, typecheck, and scoped lint passed after the changes. Temporary records and files were cleaned.
- The corrected representative visual suite reached 42 captured surfaces with zero overflow/axe assertions, but failed during shared trace-output cleanup. A later server interruption left only 15 current JSON records. See the [design audit](design-audit.md) for exact evidence and final rerun requirements.

Do not infer complete security, failure recovery, performance, or production readiness from this bounded review. Brand registration recovery needs its corrected final browser execution; Safari/VoiceOver verification and deployment verification were not executed by this reviewer.

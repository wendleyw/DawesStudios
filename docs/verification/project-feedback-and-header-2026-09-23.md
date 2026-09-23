# Project feedback, floating header and inspectors

Later project/header/notification/Brand Hub changes supersede the corresponding visual descriptions
below. See [current verification](client-polish-and-brand-folders-2026-09-23.md). Other evidence here
is historical and remains scoped to its recorded revision.

Verified locally on 2026-09-23 against the existing Next.js server on port 3003 and Docker Supabase.

This record describes the initial connected-header iteration. The subsequent
[client layout verification](client-section-layout-2026-09-23.md) supersedes its header arrangement:
the project title is centered with metadata below, and the controls float outside the card.
Shared screenshot paths now show that final layout; the check results here remain historical.

## Result

- Version cards keep status, design count, feedback count and workflow actions. Release notes and
  review decisions are read in full inside the viewer's General feedback tab. This design retains
  design comments and image/video pins. Queries and unsent drafts distinguish version and design.
- Board and projects share floating client navigation/profile. The connected project bar spans
  from its 28 px desktop title to its action icons; smaller screens adapt the title and controls.
  Opening and Fit View reserve space below the measured header.
- Conversation, Project details and Notifications use one aligned floating inspector with matching
  spacing and close controls. Escape returns focus to the trigger; the canvas does not resize.
  Notifications reuse the authenticated workspace feed, including real explicit read actions.
- Playground has one compact title/team/tools/status/close row. Saving/unsaved status remains
  visible on mobile. Its layer starts below the project header and preserves the underlying canvas.

## Executed checks

- `npm run check` in `apps/web`: type generation/TypeScript, ESLint, formatting and **591 tests in
  49 files passed**. The new draft test checks version/project/design isolation and pin retention.
- `npx playwright test tests/e2e/project-feedback.spec.ts tests/e2e/playground.spec.ts
  tests/e2e/client-navigation.spec.ts tests/e2e/sabre-demo.spec.ts`: **20 passed**. This includes
  review persistence, scoped general comments, draft/pin restoration, empty working-version feedback,
  actual notification read persistence, no client internal-table requests, focus/keyboard behavior,
  all three roles, Playground uploads/retries/isolation, navigation and populated SABRE surfaces.
- Final notification alignment refinement: stylesheet boundary suite **22 passed** and the focused
  floating-header browser scenario passed again across 1600×1000, 1024×700, 390×844, 320×640 and
  844×390. Three inspectors have identical bounds; no page overflow; Axe checks passed.
- Desktop/mobile screenshots were inspected, including the design viewer, notification actions,
  project details, connected title bar and compact Playground. Representative captures:
  [project](screenshots/project-floating-header-1600.png),
  [details](screenshots/project-panel-project-details-1600.png),
  [notifications](screenshots/project-panel-notifications-1600.png),
  [feedback](screenshots/project-general-feedback-1600.png),
  [mobile](screenshots/project-floating-header-320.png),
  [Playground](screenshots/playground-390.png).
- `git diff --check` and AGENTS.md/CLAUDE.md synchronization passed.

## Data preservation and limits

Final counts: 10 clients, 68 projects, 50 SABRE projects, zero acceptance clients. SABRE remains
at 463 credits, 126 working versions, 92 publications and 175/190 internal/client comments.
Storage inventory and all scoped tables except Playground boards match the demo checkpoint.
There is one newly created Playground board for Retail Partner Introduction, outside the saved
population checkpoint; preserve it as newer work. Its origin was not established by these checks.
The rollback checkpoint was not rewritten, and guarded removal will therefore refuse this newer
state until explicitly reconciled. Browser mutations used disposable isolated clients.

No schema change, reset, population rerun, commit, deployment or release approval occurred. These
checks cover the requested UI changes; previous broader production acceptance remains separate.

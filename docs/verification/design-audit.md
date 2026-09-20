# Design and accessibility audit — September 20, 2026

The acceptance target is a restrained modern application using the supplied branding. `docs/ref` is workflow and visual inspiration, not a pixel-fidelity requirement. This report records actual browser observations and remaining work; it does not certify the entire production acceptance matrix.

## Reproduction

Run the standard Next.js server at `http://localhost:3003` with the local Docker Supabase and trusted media services available. The tests read ignored local credentials through `tests/e2e/test-support.ts`; credentials are not included in this report.

**Record which build served port 3003.** That port can be taken either by a development/production server started from the working tree or by the `dawes-studios-app-web-1` Compose container, and the container keeps serving whatever source it was built from. On 2026-09-20 a container built at 05:39 produced an `assets-desktop` axe contrast failure of 3.82:1 from a compiled `.brand-asset-preview{color:#78786f}` rule, while the working tree had already moved that declaration to `var(--muted)` (`#6c6c67`, 4.54:1). The surface passed once the image was rebuilt. Visual and accessibility findings are only attributable to current source when the serving build is known, so rebuild the container, or stop it and run from the tree, before recording browser evidence.

From `apps/web`:

```bash
npx playwright test tests/e2e/brand-accessibility.spec.ts tests/e2e/brand-guidance.spec.ts tests/e2e/design-audit.spec.ts
```

The integrated browser runtime reported no available browser. Actual browser validation therefore used installed Playwright Chromium. Screenshots use reduced motion and scroll to the top before full-page capture, so breakpoint transitions and fixed-header capture artifacts do not create false overflow findings. Tests run with one worker. Brand writes use unique names/IDs and remove their own records and objects in `finally`; they never reset the baseline database. The broad surface audit reads data and edits unsent comment drafts; the separate long-note test creates and cleans its own project. Concurrent specialist runs must pass a separate output path, for example `--output=/tmp/dawes-design-results --reporter=line`.

## Coverage and current state

The corrected broad audit reached **42 task surfaces with zero measured document overflow and zero axe violations**. Its runner then failed during trace cleanup because another Playwright invocation shared the default output directory; this is not a completed passing suite. The following attempt used an isolated output directory but stopped when the development server became unavailable. The current [design-audit.json](design-audit.json) therefore contains only 15 clean captures from `2026-09-20T09:22:46.053Z`. The orchestrator must replace it with the final uninterrupted production run; existing screenshots are interim evidence.

Three Brand accessibility/storage tests passed before the last guidance expansion. The expanded guidance run passed shared-section persistence, palette/manual copy, HTTPS font references, custom samples, three products, client/designer write denial, and seven private CTA drafts. Its new upload-recovery case failed on an ambiguous test locator that also matched Next's route announcer; the locator is now scoped to the actual dialog, awaiting final execution. The table-driven template definitions now match the final seven seeded types. Eighteen Brand unit tests, whole-app type checking, and scoped lint passed after these source changes. The two-version 2,000-character note test passed at 1600px and 390px with measured non-overlap and isolated cleanup.

| Task surface | Sizes checked | Assertions/evidence |
|---|---|---|
| Brand overview | 1600×1000, 1024×768, 1000×800, 768×1024, 390×844, 320×800 | Visible loaded content, no document overflow, zero axe findings |
| Brand logos, colors, typography, visual style, products, assets, templates, messaging, context | 1600×1000 | Section navigation and loaded resources, no overflow, zero axe findings |
| Navigation drawer | 390×844 and earlier 320×800 | Background inert, focus starts inside and remains inside after repeated Tab, Escape restores trigger, link navigation closes drawer |
| Shared section editor | 390×844 and 1600×1000 | Named dialog, initial focus, Tab/Shift+Tab containment, Escape/restoration, scrollable viewport |
| Personal template draft | 1600×1000, 390×844 | Save/reload persists content; other owner cannot open it; artwork scrolling is keyboard accessible |
| Private Brand asset | 390×844 | Actual image upload, search, authenticated download, selected asset dialog; temporary metadata and object removed |
| Login | 1600×1000 | Visible form and axe analysis |
| Overview, search, notifications, account/settings, briefings, new briefing, reviews, project assets, credits | 1600×1000, 390×844 | Loaded task surface, axe analysis, viewport overflow measurement and screenshot |
| Board canvas, Kanban, list, timeline | 1600×1000, 390×844 | Two seeded projects, each view selectable, bounded scrolling/canvas, screenshot and axe |
| Project canvas and design feedback | 1600×1000, 1024×800, 1000×800, 768×1024, 390×844 | Visible ReactFlow, open design, keyboard center pin, long unsent message draft; no baseline writes |

## Corrections grounded in browser evidence

- Mobile navigation now uses a valid dialog role on a generic container, with one sidebar shared by desktop and mobile. It closes on navigation and restores the menu trigger after Escape. Profile links lead to account settings for every role; studio identity comes from persisted workspace settings.
- Shared dialogs explicitly cycle keyboard focus, including Shift+Tab from the initially focused heading. The native dialog still supplies top-layer rendering and background inertness. The skip link belongs to an accessibility navigation landmark.
- Shared segmented controls have one canonical rule in `globals.css`; duplicate, lower-contrast rules were removed from `shared/forms.css`. Project mobile styles are scoped to their feature.
- Brand preview artwork is content, not a document heading; compact template previews preserve their actual aspect ratio. The full draft preview has a labeled, keyboard-focusable scroll region.
- Mobile project/viewer canvases have explicit heights. The previous min-height-only wrapper left ReactFlow at zero height and showed a blank canvas. Mobile deliverable filters can shrink within their toolbar.
- Settings and project secondary text use the shared muted token. The feedback resolved toggle is an inline checkbox row. Comment timestamps and composer hints were increased from 9px to 11px.
- Owners fixed briefing/credit contrast, editor heading hierarchy, credit table overflow, mobile board readability, and measured version-card spacing. The corrected captures passed their overflow/axe assertions. The independent logic findings and final source status are in [frontend-review.md](frontend-review.md).

## Manual visual assessment

The desktop overview uses a single primary heading, aligned content gutters, quiet metric separators, and consistent card borders. The Brand Hub uses one section selector instead of a second persistent sidebar. Forms and content panels use consistent spacing; contextual editors carry secondary actions. Brand content can contain client colors while the application chrome remains monochrome.

The 768px project screenshot demonstrates a readable design card and useful canvas space. The original 390px fit-all board reduced text to a few pixels; the corrected mobile entry opens List, and explicitly choosing Canvas fits a readable first card. The mobile credit overflow was an absolutely positioned accessible table label escaping its wrapper; adding a positioned wrapper preserved the label and contained the overflow. Allowed scrolling within artwork and table regions remains distinct from document overflow.

Representative files:

- [Desktop overview](screenshots/design-home-1600.png)
- [Mobile Brand overview](screenshots/brand-overview-390.png)
- [Tablet project canvas](screenshots/design-project-768.png)
- [Mobile design with keyboard pin and long draft](screenshots/design-design-pinned-draft-390.png)
- [Mobile board](screenshots/design-board-canvas-390.png)
- [Mobile credits](screenshots/design-credits-390.png)
- [Two long version notes, desktop](screenshots/design-long-version-notes-1600.png)
- [Two long version notes, mobile](screenshots/design-long-version-notes-390.png)

## Remaining gates

- Run the combined suite once after the final deterministic reset and stable production build, inspect updated screenshots, and record exact pass/fail counts. The Brand baseline assertions now expect seven templates.
- Execute the corrected Brand registration HTTP 503 retry/cancellation scenario. The last failure occurred before its recovery assertions, so those assertions are not yet verified. The orchestrator separately owns project-artwork recovery evidence.
- Reconcile final seed logo variants/files and project asset scope against G03/G13; screenshots alone do not establish file availability or permission isolation.
- Review production screenshots without the Next.js development indicator. Development capture artifacts are not product controls.
- Manual screen-reader/Safari coverage and systematic 44px target measurement have not been executed. Zero axe findings is useful evidence, not a complete accessibility certification.

The orchestrator owns final workflow, permission, baseline, security, documentation, deployment, and release acceptance. No final pass is asserted while the gates above remain open.

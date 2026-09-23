# Consistent client sections and compact project controls

Later project/header/notification/Brand Hub changes supersede the corresponding visual descriptions
below. See [current verification](client-polish-and-brand-folders-2026-09-23.md). Other evidence here
is historical and remains scoped to its recorded revision.

Verified locally on 2026-09-23 against the existing Next.js server on port 3003 and Docker Supabase.

## Implemented behavior

Briefings, Reviews, Files, Brand Hub and Credits now use the same floating client identity,
navigation and signed-in profile as the board/project surfaces. The desktop shell topbar is hidden
throughout client routes. Global/sidebar navigation and role rules remain intact. The main client
region scrolls beneath its sticky identity header and resets scroll position when changing routes.
Each section has a white title/action card, with contextual filters/tools inside it where present,
over the same subtle grid. Client navigation appears once and wraps on phones.

Briefing detail/direct editor and all ten Brand Hub sections follow this layout. The detail page
has one visible briefing title and a screen-reader summary heading that preserves heading order.
Private template drafts have the same title/action card and a separate white form panel. The
intercepted New briefing modal keeps its compact editor and existing persistence/close behavior.

The user's final project-header decision supersedes the earlier inline status/date request:
**the title is centered, with status and date below**. Working files / Shared with client is outside
the title card, underneath on the left; All deliverables sits beside the four action icons in a
separate floating group on the right. Groups wrap on narrow screens. Canvas fitting, inspectors
and Playground all use the measured total header height. Panel alignment, focus return, real
notifications and scoped feedback from the previous change are retained.

## Verification

Executed checks:

- `npm run check`: TypeScript, ESLint, formatting and **591 tests / 49 files passed**.
- `npx playwright test tests/e2e/client-pages-layout.spec.ts tests/e2e/project-feedback.spec.ts`:
  **6 passed** after the final title/control arrangement and draft editor changes.
- Final client action-group styling: `npx playwright test tests/e2e/client-pages-layout.spec.ts`:
  **3 passed** again after confirming the development server had compiled the updated shared CSS.
- `playground.spec.ts`: **9 passed** during this revision; `client-navigation.spec.ts` and
  `briefing-modal.spec.ts`: **5 passed** earlier in the same revision.
- `git diff --check`, synchronized AGENTS.md/CLAUDE.md and local links in the ten affected feature/
  verification documents passed. Final database read: **10 clients / 68 projects / 50 SABRE /
  zero acceptance clients**.

The browser coverage includes:

- All five sections as agency at 1600×1000, 1024×700, 390×844, 320×640 and 844×390;
  as client at 1600×1000 and 390×844: 35 role/section/viewport surfaces, including Axe,
  navigation uniqueness, active route, profile visibility and horizontal containment.
- Ten Brand Hub routes at desktop/mobile, plus briefing detail, direct editor and an existing
  owner-private draft at both sizes. The latter three receive Axe checks and screenshots;
  navigation from a scrolled draft verifies the main region returns to the top.
- Project title centering, metadata below it, channel/action groups below the card, filter beside
  the icons, canvas inset and equal inspector bounds at five sizes. Real feedback, review,
  notification read persistence and draft/pin isolation use disposable fixture clients.
- Existing Playground, client navigation and briefing-modal scenarios.

Two findings were corrected during verification: removing the duplicate visible briefing title
initially skipped a heading level; a subsequent header stylesheet edit displaced inspector rules.
The accessible summary heading and restored inspector rules passed focused follow-up checks.

Representative inspected captures:
[briefings](screenshots/client-page-agency-briefings-1600.png),
[Files](screenshots/client-page-agency-assets-1600.png),
[Brand Hub on mobile](screenshots/client-page-agency-brand-overview-390.png),
[briefing detail](screenshots/client-page-briefing-detail-390.png),
[private draft](screenshots/client-page-private-draft-390.png),
[project](screenshots/project-floating-header-1600.png),
[mobile project](screenshots/project-floating-header-390.png).

## Boundaries

This change adds no schema, authentication, billing, publication or storage rule. Existing data and
the optional 50-project SABRE demonstration remain in place. Its saved rollback checkpoint is not
rewritten; newer live Playground work must be preserved. No reset, commit, deployment or broad
release acceptance is part of this UI revision.

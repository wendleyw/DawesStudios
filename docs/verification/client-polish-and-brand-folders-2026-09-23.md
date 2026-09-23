# Compact project review, account notifications and Brand Hub folders

Date: 2026-09-23. Local Next.js on port 3003, existing Supabase Docker stack and media service.
No reset, password provisioning, server restart, commit or deployment. Earlier dirty-tree work and
all live demonstration data were preserved.

## Implemented behavior

- Project title/status/due date share a compact row on desktop, wrapping on phones. Channel controls
  remain outside the title card. Design review replaces the extra action row with a deliverable
  toolbar containing Playground. Artwork sits above its design/version navigation footer.
- Desktop double-click opens a design's feedback; explicit open arrows, Enter/Space and one touch
  tap remain available. The main board retains its existing double-click project entry.
- Feedback is 310–380 px wide on desktop, with compact heading/scope/filter controls, a separately
  scrolling history and a growing 60–120 px composer. The repeated privacy footer is removed.
  Scoped drafts, image/video pins, general review history and channel permissions are preserved.
- One notification bell sits immediately left of the profile on all client surfaces. A native
  nonmodal popover opens below the account card with a short downward animation, reduced-motion
  handling, bounded geometry, scrollable feed, Escape/close focus return and outside dismissal.
  Read actions persist through the existing recipient-scoped backend; opening itself changes no data.
- Brand Hub has nine sections. Templates navigation/gallery/create UI is retired; old links redirect
  to Assets. Existing template rows and owner-private direct draft editors are preserved.
- Assets has one-level client folders: create, rename, choose an upload destination, move a file and
  delete a folder without deleting assets/bytes. All assets and Unfiled remain available. Client and
  assigned designer sessions browse/download; agency organization is enforced by backend policies.

## Executed checks

| Check | Result |
| --- | --- |
| `npm run check` | TypeScript, ESLint, formatting; 590 unit/component tests in 49 files passed |
| Folder pgTAP suite | 26 assertions passed in a rolled-back transaction |
| Board/Brand Hub/client page/notification browser suite | 23 scenarios passed |
| Playground/project feedback/video loading browser suite | 14 scenarios passed |
| Whitespace and synchronized instructions | `git diff --check` and `cmp AGENTS.md CLAUDE.md` passed |

Browser coverage includes five principal sizes (1600×1000, 1024×700, 390×844, 320×640 and 844×390),
all five board views, agency/client/designer workflows, Axe accessibility, real Storage downloads,
comment draft and pin isolation, explicit notification read/reload, Escape/outside dismissal,
reduced motion and covered-app focus isolation in the fullscreen Playground. Comment history
occupies more than half its panel at the tested sizes; the empty composer stays below 100 px.

Folder tests include a committed creation response deliberately lost, a successful retry without a
second folder, case-insensitive duplicate rejection, move/reload/filter/rename, read-only client and
designer browsing, and a real download after deleting the containing folder. Database tests cover
cross-client placement rejection, immutable folder tenancy, removed/revoked access and anonymous
ACL denial. Fixture cleanup leaves no acceptance clients or folders.

Video loading remained lazy: 20 preview clips produced no signing/media requests before opening;
opening one design issued one signing request and loaded one 27,682-byte clip, with seeking verified.
The retired gallery's two unit tests were removed with its creation function; direct legacy draft
persistence, owner isolation and absence of billing/project side effects remain covered in browser tests.

Desktop notification, mobile notification, narrow asset-library and desktop/mobile review screenshots
were inspected. Examples: [notification panel](screenshots/notifications-popover-1600.png),
[mobile notification panel](screenshots/notifications-popover-390.png),
[asset folders](screenshots/brand-folders-1600.png),
[project feedback](screenshots/project-general-feedback-1600.png).

## Data preservation and limits

Migration `202609230009_brand_asset_folders.sql` was applied forward to the existing local database;
generated types match it. It adds a table and nullable folder reference, changes no existing stored
file path and leaves existing assets unfiled. Final read-only inventory: **10 clients, 68 projects,
50 SABRE projects, zero acceptance clients and zero remaining test folders**. No folders were added
to live clients automatically.

The SABRE overlay checkpoint predates the new nullable column and newer Playground work. Its strict
rollback fingerprint now differs even for old asset rows with a null folder. Preserve the checkpoint
and live content; do not bypass or rewrite its guard to force demo removal. A future rollback needs
explicit schema/content reconciliation.

Evidence is local Chromium and scoped database/source verification, not a production deployment or
full release certification. Previous verification records retain historical counts/layouts for their
recorded revisions; this document supersedes their centered-status-below and project-inspector
notification descriptions.

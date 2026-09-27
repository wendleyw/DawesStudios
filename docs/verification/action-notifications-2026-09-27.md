# Action notifications — 2026-09-27

## Result

Implemented and verified locally against the production Next.js/media images and official
filesystem-backed Supabase staging. No deployment or push was performed.

The [role/state contract](../architecture/action-notifications.md) defines nine pending actions.
The agency reviews briefings, starts confirmed projects, prepares projects, reviews submitted
rounds, handles client feedback, completes delivery and reviews credit requests. Designers submit
work from their own boards. Clients review the latest shared version according to requester and
notification preferences. Billing acceptance remains an agency action.

Actions appear above Activity on the page and in the existing bell popover. Reading Activity
never dismisses workflow work. The bell keeps unread and action counts separate. Pending work is
paged in groups of 100, with an exact total and access to older actions. Opening rechecks state;
polling refreshes it every 15 seconds. Links select the appropriate briefing, authorized board/round,
client version/comments, project-filtered Files delivery page, or credit-request section.

## Backend and review

Migrations `202609270018`, `202609270019` and `202609270020` were applied to filesystem staging
and the live local stack with no reset. The view uses invoker RLS, an active-role gate and a narrow
private project-ID predicate for client recipients. No designer/source metadata is exposed to clients.
The [independent review](../engineering/handoffs/2026-09-27-action-notifications-review.md) found that
removing a designer incorrectly removed the agency's review action despite the round remaining
shareable. Migration019 retains that action; migration020 adds authorized board names to distinguish concurrent reviews. Designer access is still revoked independently.

Tests cover role/tenant isolation, removed actors, requester/opt-in/fallback routing, latest-only
rounds and publications, stale approvals, direct publication without internal boards, transitions,
read-state independence and anonymous denial. The self-contained pgTAP fixture rolls back.

## Executed evidence

- Source gate: **127 files / 1,249 unit tests**, types, lint and formatting pass.
- Complete canonical database suite: **27 files / 1,108 assertions**, including **56 action assertions**.
- New action/Drive browser run: **4/4 pass**, one of each flow in Chromium and WebKit.
  After board labels were added, the complete action journey passed again in **both engines**.
- Additional final WebKit Comments, mobile/focus and in-project notification cases: **3/3 pass**.
- Existing broad Chromium acceptance: **53/53 existing cases pass**. The new action case first
  exposed an ambiguous fixture selector; it passed in the separate final run after correction.
- New action journey exercises preparation link, designer submission, studio round link and share,
  client read-all without dismissing review, feedback request, studio feedback destination,
  replacement version, approval, real sanitized delivery upload and completion through Files.
- Axe: no violations in the notification page or mobile popover after opening animation completes.
  Mobile390px: no horizontal overflow; popover is within viewport; close restores bell focus.
- An early accessibility capture sampled the fade animation. Waiting for computed opacity 1 before
  capture/check corrected the harness; contrast assertions were retained. Mobile geometry waits for the responsive layout to settle. Drive test labels are
  exact so a closing dialog's close button cannot match the edit control.
- Final eight-table counts exactly equal the original baseline:10 clients,25 projects,12 campaigns,
  30 briefings,29 boards,30 rounds,22 client versions,155 notifications. No acceptance fixture remains.
- Strict seed verifier passes **110 actual file downloads**,10 client logins, credit reconciliation
  and designer/client isolation. Live local dataset remains **10 clients /68 projects /50 SABRE**.

Final images were inspected for typography, spacing, wrapping and overlay placement:
[agency](screenshots/action-notifications/agency.png),
[designer](screenshots/action-notifications/designer.png),
[client](screenshots/action-notifications/client.png),
[mobile](screenshots/action-notifications/mobile.png),
[popover](screenshots/action-notifications/popover.png).

The browser fixture uses temporary accounts/projects and guarded cleanup. Ordinary screenshots
and logs remain ignored under `outputs/`; only the final images cited above are committed.
Firefox could not launch its temporary profile on this host. A broader WebKit workspace scan also
reported a third-party Miro response-header warning; full cross-browser coverage is not claimed.

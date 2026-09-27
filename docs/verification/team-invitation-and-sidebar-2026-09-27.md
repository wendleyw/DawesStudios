# Named invitations and visible sidebar control

Date: 2026-09-27. User request: fix the clipped sidebar toggle, add a designer name in Team,
and test the invitation flow with the user's mailbox. Resend has not been configured yet.

## Changes and verified behavior

- The sidebar's short-window vertical scrolling clipped the outer half of its absolutely
  positioned toggle. The control now uses a fixed position at the sidebar edge, follows the
  width transition and remains visible while the sidebar scrolls. Hit tests at its left edge,
  center and right edge passed expanded/collapsed at 1512 × 900, 1512 × 696 and 1512 × 600.
  [Final collapsed-sidebar capture](screenshots/team-sidebar-visible-2026-09-27.png).
- Team's shared invitation form now includes optional **Full name**. Whitespace is trimmed,
  blank names are omitted and nonempty names are capped at 120 characters. Only new Auth
  identities receive `display_name` metadata; the existing database trigger persists it.
  Existing accounts retain their profile name. No migration or permission change was required.
  [Final invitation dialog](screenshots/team-invitation-name-2026-09-27.png).
- Targeted validation/API/form tests: 17 passed. Full web gate: **128 files / 1,259 tests**, with
  types, lint and formatting passing. Secret/whitespace checks are part of the commit gate.
- New Chromium designer invitation test: **passed** through the real Team UI, Auth SMTP capture,
  password setup, invitation acceptance, persisted designer name/role, roster display and a fresh
  password sign-in. The new designer saw zero unassigned projects. Dialog Axe: zero violations.
  Its guarded cleanup removed the invitation, token, audit entries and disposable Auth identity.
- An initial Axe selector targeted an explicit role attribute while the UI uses native `dialog`;
  correcting the test selector allowed the complete run. No product permission was relaxed.
- Live data remains **10 clients / 68 projects / 50 SABRE**, no temporary designer accounts remain,
  and all **118 foreign-key checks** passed after cleanup.

## User mailbox test and delivery limit

Read-only runtime inspection confirmed Auth uses the local SMTP capture service on port 1025,
with no external SMTP credentials. The user's earlier designer invitation was present in the
local inbox and in the database as pending, unexpired, with password setup required. Its captured
Auth link matches the stored invitation and redirects to the correct local application route.
The user's identity and pending invitation were preserved; automation did not open/consume its
verification link, choose their password or grant studio access.

To test it, open [the local inbox](http://127.0.0.1:55424), locate the recipient's invitation, and
open its link in a separate/private browser session. Set a password and accept. External Gmail
delivery is untested and unavailable until Resend SMTP is configured with a verified sender and
host-only credentials; follow the [email runbook](../operations/email.md).

Project-header edits belong to the separate UI thread and were preserved. The unrelated
`login.png` deletion remains untouched. Working images and sidebar geometry are under the ignored
`outputs/team-invitation-2026-09-27/` directory. No push or deployment was performed.

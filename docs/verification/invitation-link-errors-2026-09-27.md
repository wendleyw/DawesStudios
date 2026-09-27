# Invitation link errors

Date: 2026-09-27. The user reported that the email invitation led to a sign-in form that did not work.

## Findings and change

- Auth recorded three verification requests rejected as invalid/expired between 22:46 and
  22:48 UTC. The original recipient's account was still unconfirmed, its invitation pending,
  and the email verification token still matched Auth's stored token. It had not expired at
  inspection. The exact message the user clicked was not confirmed.
- The local inbox contained a newer automated designer invitation whose account had already
  been removed. Its email remained after the previous test's account cleanup. The user received
  a direct link to their original captured message; automation did not consume its Auth link.
- The invitation screen previously ignored Auth's error fragment and displayed password sign-in.
  It now explains unavailable email links before showing sign-in/setup controls, even with an
  existing session. Raw callback error text is not displayed; backend authorization is unchanged.
- The designer journey now removes captured mail for its exact UUID fixture recipient. Cleanup
  accepts only the fixture address pattern, checks the sole recipient, uses the configured
  loopback inbox, and never sends an empty deletion list. The prior task's one retired fixture
  message was archived under ignored `outputs/invitation-link-2026-09-27/` and removed only after
  checking that its Auth account no longer existed. The user's message was preserved.

## Verification executed

- `npm run check`: types, lint, formatting and **128 files / 1,262 unit tests** pass.
- Chromium `designer-invitation.spec.ts`: pass. Real Team invitation, invalid Auth link,
  correct link/password setup, acceptance, fresh password login, persisted designer identity,
  zero unassigned projects, and reused-link handling with an existing session all pass.
  Returning to sign-in after the reused link keeps the accepted session usable.
- The fixture's Auth identity, application invitation and captured message are removed. No
  disposable designer accounts remain. Invalid-link screen Axe: zero violations; desktop and
  phone captures inspected without clipping:
  [desktop](screenshots/invitation-invalid-desktop-2026-09-27.png),
  [phone](screenshots/invitation-invalid-mobile-2026-09-27.png).
- `python3 supabase/scripts/backup_local.py --check-only`: all **118** foreign keys pass.
  Local data remains **10 clients / 68 projects / 50 SABRE**.
- The user's invitation remains pending; no password was selected or membership granted for
  them. Actual manual acceptance remains unverified. External Resend delivery remains unconfigured.
  No push or deployment. The unrelated `login.png` deletion is preserved.

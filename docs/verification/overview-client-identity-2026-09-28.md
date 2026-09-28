# Overview client identity — 2026-09-28

The client Overview welcome card now contains the client logo, the signed-in viewer's first name
and the full weekday/date in the configured studio timezone. The former Overview eyebrow and
agency preview heading/subtitle are removed. Client-scoped numbers and permissions are unchanged.

The upper navigation omits its logo on Overview. On Board/List and other client destinations the
same identity component appears in the menu, moving/scaling from its previous location for 460ms.
Returning to Overview reverses the movement. Only one identity exists in the main workspace;
the sidebar client switcher remains a separate control. Logo fallback, signed image URLs and the
existing designer destination are preserved. There is no new animation package or database change.

`ClientIdentityProvider` retains only the previous geometry. Consumed-origin and rendered-frame
guards prevent Strict Mode and cached route effects from canceling or duplicating transitions.
Reduced motion, direct visits, different clients and expired/offscreen origins skip movement.
The browser test initially caught both Strict Mode cancellation and a repeated transition; the
final tests retain exact single-animation assertions for each navigation.

## Verification

- `npm run check`: type generation, TypeScript, ESLint, Prettier and 132 files / 1,293 tests pass.
- `npm run build`: optimized Next.js build passes.
- `npm --prefix apps/web run test:e2e -- --project=chromium tests/e2e/overview.spec.ts`: four pass;
  client/agency figures, designer isolation, client accessibility and phone/dark-mode layout.
- `npm --prefix apps/web run test:e2e -- --project=chromium tests/e2e/client-identity.spec.ts`:
  three pass; real native animations across Overview/Board/Reviews, browser Back, keyboard,
  desktop1600/mobile390, no duplicate main-workspace logo, correct final placement, no horizontal
  overflow, direct visits and reduced motion.
- The same three motion checks also pass against `next start --port 3013` with
  `PLAYWRIGHT_BASE_URL=http://localhost:3013`. The temporary production server is stopped afterward;
  the normal development server remains on3003.
- No database mutations or new permissions. The SABRE-only six-project dataset is preserved.

Browser skill setup found no available integrated browser, so verification used the repository's
Playwright harness. Logs remain ignored under `outputs/overview-identity-*.log`.

## Final visual evidence

Reviewed spacing, hierarchy, logo readability, mobile stacking, and menu placement:

- [Desktop welcome card](screenshots/overview-identity-2026-09-28/welcome-desktop.png)
- [Mobile welcome card](screenshots/overview-identity-2026-09-28/welcome-mobile.png)
- [Logo in the desktop menu](screenshots/overview-identity-2026-09-28/navigation-desktop.png)

The new motion is checked in Chromium. Other browser engines were not run in this task. No push or
deployment was requested. The pre-existing `login.png` deletion remains outside this change.

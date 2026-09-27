# Compact Miro review controls — 2026-09-27

The project tool bar now tucks behind the client review bar instead of floating above an
8 px gap. The review bar covers 6 px of lower padding, leaving every tool and its full keyboard
focus outline visible. Both bars share their centre on desktop, beside an inspector and on
phones. Phone controls retain 44 px targets; the embed reserves 20 px less bottom space.
The phone breakpoint matches the shared button styles at 640 px.

## Executed checks

- `npm run check`: types, lint, formatting and 128 files / 1,259 unit tests pass.
- Isolated Chromium: light and dark at 1512×696, 1440×600, 844×768, 640×800, 639×800,
  390×844 and 320×740. All 14 cases pass centring, viewport bounds, actual pointer hit checks,
  overlap restricted to padding, unobscured keyboard focus outlines and touch target size.
- All 14 cases open Request changes and Approve with the correct decision selected, then
  cancel. Details and Comments open, Escape returns focus, and the Playground strip toggles.
  Both bars hide with narrow inspectors and stay aligned beside wider inspectors.
- Axe reports zero violations within the two control groups across all 14 cases.
- An older version without a review bar keeps the original tool bar bottom position at
  desktop and phone sizes.
- Final light/dark desktop and phone images inspected. `git diff --check` and matching
  `AGENTS.md` / `CLAUDE.md` pass.

The audit used an existing local SABRE client project. No review was submitted and no project
fixture or migration was needed. External Miro requests were blocked in the isolated browser;
this verifies application chrome, not external board loading or sharing. The integrated browser
was unavailable. Working scripts, measurements and logs remain under ignored `outputs/`.

## Final captures

- [Light desktop controls](screenshots/compact-miro-review-light-2026-09-27.png)
- [Dark desktop controls](screenshots/compact-miro-review-dark-2026-09-27.png)
- [Phone page](screenshots/compact-miro-review-phone-2026-09-27.png)

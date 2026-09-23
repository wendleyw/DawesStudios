# Fullscreen Playground

Verified locally on 2026-09-23 against the existing Next.js server on port 3003 and Docker Supabase.

## Result

Playground now slides down over the entire viewport, covering the sidebar, mobile topbar and
client/project headers. Its native dialog enters the browser's top layer, so the project canvas's
clipping and container styles cannot constrain it. The frame is 100vw × 100dvh with no border or
rounded margins. The transparent backdrop preserves the reveal of the previous surface during
entry/exit; the underlying application is inert until close.

The project stays mounted with the same zoom, position and selection. Closing slides upward,
restores body scrolling and returns focus to the opener. Reduced motion remains immediate. Escape
and native cancellation use the existing unsaved/busy guards. Opening from Add design still retains
the selected file and form fields and returns to the same upload dialog. Persistence and backend
permissions are unchanged.

## Executed checks

- `npm run check`: TypeScript, ESLint, formatting and **592 tests / 49 files passed**. The added
  cancellation regression proves a native cancel event cannot discard unsaved text. Component
  checks also verify named dialog semantics, initial focus and scroll restoration; jsdom stubs
  native dialog methods, so it is not evidence of browser top-layer behavior.
- `npx playwright test tests/e2e/playground.spec.ts`: **9 passed**. Actual browser measurements
  prove exact full-viewport bounds at 1600×1000, 1024×700, 390×844, 320×640 and 844×390; downward/
  upward animation keyframes; reduced motion; blocked focus on covered sidebar/project controls;
  zoom preservation and focus/scroll restoration. Axe and horizontal containment passed at all
  five sizes. The suite also verifies all three roles, real upload return, file bundles/downloads,
  private storage, drag/resize/delete persistence and conflict/retry recovery.
- Screenshots inspected: [desktop](screenshots/playground-1600.png),
  [mobile](screenshots/playground-390.png), [short landscape](screenshots/playground-844.png).
- `git diff --check` and AGENTS.md/CLAUDE.md synchronization passed. Final database read:
  **10 clients / 68 projects / 50 SABRE projects / zero acceptance clients**.

## Preservation and scope

Browser mutations use guarded disposable fixtures. Existing SABRE projects, files and newer live
Playground work remain in place; the optional demo rollback checkpoint was not rewritten. No
schema/policy change, reset, provisioning, commit or deployment occurred. This verifies the requested
presentation change, not the broader production release matrix.

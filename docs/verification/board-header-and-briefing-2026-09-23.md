# Floating board header and guided briefing — 2026-09-23

## Implemented behavior

The board uses separate floating client identity/period and signed-in profile cards in place of
its full-width title strip. The canvas grid continues behind them; the initial fit and structured
view margins keep content clear. The approved logo appears next to the name, with initials only
when no logo is available. The user's follow-up exposed an intrinsic sizing problem: the global
100% select width compressed SABRE to S…. The board selector now uses its intrinsic width and
the identity card sizes to its content. SABRE remains fully visible at all eight tested sizes;
long fixture names truncate within the card and retain a full-name tooltip.

All periods is the default. Q1–Q4 narrow the existing authorized project set by start/due interval
overlap, retaining undated work. The filter survives view switching and initially aligns Calendar
and Timeline with the chosen quarter. It is local to the visit; the selected view remains the
existing database-backed personal preference. No new profile lookup exposes another user's data.

The shared briefing editor now provides service search/categories, a selected-service summary,
project title/campaign before creative questions, prefilled standard sizes under expandable
settings, and clearer Design approach labels. Invalid review focuses its summary; editing clears
that obsolete summary until the next validation. Save draft to add files explains and performs the
existing attachment prerequisite. Modal/direct-page routes share the same draft and submission
rules. These changes do not alter billing, permissions, catalog contents or backend commands.

## Checks executed

- `npm run check`: **588 tests / 49 files**, TypeScript, ESLint and formatting all passed. Repeated
  after the final validation-message correction with the same result.
- `npm --prefix apps/web run test:e2e -- board-views briefing-modal intake-admin design-audit`:
  **19/19 passed**. The initial run found retry controls covered by the new floating header;
  placing notices below the header fixed the obstruction, and the complete rerun passed.
- `npm --prefix apps/web run test:e2e -- briefing-modal`: **2/2 passed** after the last form change.
  Agency and client both created a campaign, saved a real draft with a custom 1200px width,
  submitted it to awaiting review and returned to their prior Calendar view.
- Board geometry checks cover **40 combinations** (five views × eight viewport sizes), including
  320px phones and 844 × 390 landscape. Assertions cover client-name visibility, header separation,
  canvas coverage, toolbar/zoom placement and contained scrolling. Three-role scenarios also
  cover accessible controls, view persistence/isolation, quarter filtering, account navigation
  and failed-write retry.
- The design audit refreshed **44 surfaces** with responsive and axe checks. Briefing modal
  service screens were checked at 1440 × 900, 390 × 844 and 844 × 390; Details/formats at desktop
  and phone sizes include overflow, accessibility and visible-footer checks.
- Manually inspected final SABRE Canvas desktop/phone, Calendar desktop, Kanban landscape,
  long-name board identity, and briefing service/details/dimension screenshots.
- Final read-only database count: **10 clients / 25 projects / zero temporary acceptance clients**.
- The existing development server remained responsive: warm login HTTP 200 in approximately
  15ms. It continues with file-backed output as documented in the [recovery record](development-recovery-2026-09-23.md).
- `git diff --check` passed and `AGENTS.md` / `CLAUDE.md` remain identical.

## Evidence and scope

- [Board geometry](board-view-fit-2026-09-23.json)
- [Design audit](design-audit.json)
- [Desktop board](screenshots/board-fit-canvas-1440.png)
- [Phone board](screenshots/board-fit-canvas-390.png)
- [Service chooser](screenshots/briefing-modal-client-1440.png)
- [Details](screenshots/briefing-details-client-1440.png)
- [Phone dimensions](screenshots/briefing-formats-client-390.png)

The in-app Browser had no available instance; the repository's Playwright runner supplied the
browser evidence. No database schema or policy changed, so SQL suites were not rerun for this UI
revision. This is local development verification, not a production build or deployment. No reset,
canonical provisioning, commit or release occurred. Existing uncommitted work remains preserved.

## Follow-up — quarter picker without scrolling

The user asked how quarters are registered, then asked for a menu without scrolling. A clarification
offered the quarter picker or the main sidebar; with no reply, Codex announced the assumption that
the recent Q1–Q4 context meant the header picker. No sidebar navigation was changed in this follow-up.

`board-period-picker.tsx` replaces the native grouped year/quarter select with a compact panel:
Previous/Next year, four quarter buttons with month labels, and All periods. Every choice is visible
without scrolling. The trigger includes the current selection in its accessible name. Opening
focuses the selected choice; selection/Escape return focus; outside pointer or keyboard focus closes
the panel. Year arrows use `aria-disabled` with guarded handlers so reaching a year boundary keeps
keyboard focus and does not dismiss the panel.

The focused browser scenario verifies real quarter filtering, year navigation, reset, focus,
Escape/outside dismissal, zero panel overflow and no axe violations at 1440 × 900, 390 × 844,
320 × 640 and 844 × 390. Final captures were inspected:
[desktop](screenshots/board-period-1440.png), [phone](screenshots/board-period-320.png),
[landscape](screenshots/board-period-844.png). The original native-select test locator was updated
for the new control; the first interaction run also caught the year-boundary focus loss, corrected
before the final checks. Quarter/date rules and the database are unchanged.

Final follow-up checks: `npm run check` passed **588 tests / 49 files** plus type, lint and format;
`npm --prefix apps/web run test:e2e -- board-views` passed **9/9 in 45.7 seconds**. The panel geometry
check waits for the existing shell resize transition before asserting containment, rather than
measuring its intermediate animated position. Final baseline remains **10 clients / 25 projects /
zero temporary acceptance clients**. Documentation links, whitespace and instruction-file parity
also pass.

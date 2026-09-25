# Credits page: one-line rows like Briefings and Reviews

- Updated: 2026-09-25T14:05:28-04:00 · Agent: Claude Code (implementer) · Model: Sonnet 5
- State: tested
- Objective and owned paths: move Credits' tabs/Export CSV into the header card and replace its table/requests blocks with one-line rows like Briefings/Reviews; owned `features/credits/{credits-page.tsx,credits.css,README.md}`, the Credits steps of `tests/e2e/intake-admin.spec.ts`, and the credit-history sentence in `docs/architecture/design-system.md`.

## Changes
- `credits-page.tsx` — moved `.credit-navigation` (tabs + Export CSV) into `.client-page-heading` as `client-page-tools`; replaced the `.credit-table` with `.credit-list`/`.credit-list-row` buttons and the mapped `.credit-request` divs with `.credit-request-list`/`.credit-request-row`, per the brief's snippets verbatim.
- `credits.css` — `.credit-navigation` margin-top 22px→0; deleted every `.credit-table*` rule (base + both media queries); added `.credit-list*` rules with 1000px/720px breakpoints; replaced `.credit-request` rules with `.credit-request-list`/`-row` + a 720px breakpoint. Every colour stays on existing `var(--…)` tokens.
- `intake-admin.spec.ts` — `.credit-table`→`.credit-list` click target; added the header-card/row-height assertions right after the first Credits `page.goto`.
- `credits/README.md`, `design-system.md` — describe the header-card tabs/Export CSV and the shared one-line-row style with briefings/reviews.

## Decisions and interface changes
- Fixed pre-existing `page.getByRole("cell").filter({has: getByText(title)})` (just after the same `page.goto`) to `page.locator(".credit-list-row").filter(...)`: the table and its cell role no longer exist, so this would have failed GREEN otherwise. Smallest faithful fix per the brief's own rule; not itself in the brief's list, flagged below. No other paths affected.

## Checks actually run
- `npx playwright test intake-admin.spec.ts -g "reconciles credits" --output=../outputs/pw-credits-inline` — RED (missing header-card tabs) before the page/CSS change, GREEN (1 passed) after.
- `npx playwright test client-pages-layout.spec.ts project-credits.spec.ts --output=../outputs/pw-credits-inline` — 7 passed.
- `npx vitest run features/shared features/credits` — 159 passed (incl. theme-colors/stylesheet-boundary gates). `npx prettier --write` on touched files — unchanged. `npm run check` — typecheck/lint/format/vitest all pass, 1013 tests.
- Screenshots (not committed, `outputs/credits-inline/`, gitignored): 1440/900/390 × light/dark for Credits vs Briefings, plus the Credit requests section. Header card, tabs, Export CSV placement, row height/padding/fonts and the two-line phone stack all match Briefings.

## Risks and next action
- Concern (see Decisions): one pre-existing assertion changed beyond the brief's literal instructions — DONE_WITH_CONCERNS for that reason only.
- Ownership: released; no active writer or process left in owned paths.

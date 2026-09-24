# Competitor ads widget — 2026-09-24

Orchestrator: Claude Code (session `a375ed7c`), executing the
[plan](../superpowers/plans/2026-09-24-competitor-ads-widget.md) for the
[design](../superpowers/specs/2026-09-24-competitor-ads-widget-design.md) on `main` (`26eea82..`,
then this record). The user asked for the widget at 01:55 and delegated the design and plan approvals
for the night. Every check below was run in this session, on the local stack with the SABRE overlay
active.

## Checks executed

| Check | Result |
| --- | --- |
| `supabase test db supabase/tests/database/competitor_ads.test.sql` | 32 of 32: agency writes; case-insensitive uniqueness per client; name, website, Page ID, advertiser ID and widget-kind constraints; no move to another client; the 12-competitor cap; an assigned designer reads and cannot write; a client reads nothing, even for its own workspace; a designer without the client's work reads nothing; anonymous access revoked |
| Database gate (every pgTAP file except `access_and_workflows.test.sql`, which fails its six known SABRE-overlay assertions) | 20 files, 401 tests pass |
| `competitors-model.test.ts` | 14: trimming and nulls, seven refusals worded for the form, encoded library links (name with `&`, `#` and an accent), exact Page and advertiser links, the Google fallback, host and matched sources, the duplicate message |
| `meta-ad-library.test.ts` | 19: countries, the request (Page or name, fields without `ad_snapshot_url`), mapping (full and missing fields, unreadable answers), every error class, the cache's expiry and size |
| `competitor-ads-route.test.ts` | 13: 400, 403, 401 (no token and expired session), 404 for a hidden competitor, 503, previews off without calling Meta, the ready answer without the token or a snapshot URL, search by name, a cache hit, 502 for a refusal and for an unreadable answer, 504; plus the real route with the Supabase client and fetch replaced at the HTTP boundary |
| `competitors-data.test.ts`, `board-data.test.ts` | 5 and 7 (2 new): column mapping, removal refusals surfaced, the bearer call, widget placement and removal |
| `competitor-form.test.tsx`, `competitor-screen.test.tsx`, `competitor-ads-widget.test.tsx` | 4, 9 and 9: add, validate, duplicate, edit; links per tab, the four Meta states, ad cards with missing parts, failures with **Try again**, confirmed removal, no actions for a designer; tiles, empty states per role, the cap, removal from the board, form and screen wiring, a competitor removed elsewhere closing its screen, a failed list |
| Board suites | `board-layout` 35 (3 new), `board-canvas-nodes` 2 (new), `board-page` 14 (6 new: place, remove, failed placement, no Widgets button for a designer or a client, no widget read for a client) |
| `npm run check` | 72 files, 846 tests, after Task 8 and again after the visual-pass fixes |
| `npx playwright test tests/e2e/competitor-ads.spec.ts` | 1 passed, before and after the visual-pass fixes: the agency places the widget, adds a competitor, checks all three links and the previews-off note, then removes the competitor and the widget; the assigned designer sees it without **Add competitor** or **Board widgets** and gets `not_configured` from the route; the client sees no widget, reads no rows and gets 404 from the route |
| `board-views.spec.ts`, `project-creation-cards.spec.ts` | 9 of 10 pass. "The live SABRE board fits every view…" fails `clientNameFits` at 1024 × 768: the header's credit balance chip (`aad699b`, another session) shrinks "SABRE" to "S". This plan does not touch the header; the regression is queued for the system test |

## The spec's success criteria

1. **Roles.** pgTAP proves the policy matrix in the database; the browser test proves it through the
   interface and the route (a client gets 404, never a list).
2. **Links.** Unit tests pin every URL, and the browser test checks the rendered `href`, `target` and
   `rel` on each tab.
3. **Meta previews without leaking the token.** The route test asserts the response contains neither
   the token nor a snapshot URL, including when Meta's own error message contains the token.
4. **No token.** The route answers `not_configured` without calling Meta, and the screen keeps the
   link; checked in the browser against the local server, which has no token.

## Decisions that differ from the plan

- **The cap trigger passes non-agency callers through.** Row-level security runs after `before`
  triggers, so the plan's trigger answered a designer, and would answer a client, with the cap message
  instead of a refusal, telling a client how long the list is and taking a lock for it. The pgTAP test
  caught it. The unreleased migration was corrected in place.
- **Test harness.** The component tests stub `HTMLDialogElement` as the project dialogs' tests do, and
  two browser locators are exact because the modal's close button repeats the dialog's name.
- **Form labels.** The label text and its "(optional)" marker are wrapped together, so the shared
  grid label keeps them on one row. The campaign dialog has the same pattern and is left for the
  system test.
- **Widgets panel.** The option stacks its name, description and button, which were squeezed side by
  side in the narrow panel.

## Visual check

The widget, the Widgets panel, the add form and the screen's three tabs, including removal
confirmation and a name-only competitor, were captured at 1600 × 1000 and 390 × 844 into the ignored
`outputs/competitor-ads/`, with no console errors. The two fixes above came from these captures. At
the board's opening zoom the widget is as small as the campaign frames. The two visual-pass
competitors and the widget were removed from SABRE afterwards. No images are committed.

## Known limitations

- Meta's API returns ordinary ads only where they reached the EU; for competitors that advertise
  elsewhere, previews are mostly empty, and the library link remains the full view.
- A long-lived Meta token lasts about 60 days. The screen names the expiry, and the production guide
  explains renewal.
- `ALL` as a country value and TikTok's `adv_name` link parameter could not be confirmed without
  credentials. A refusal of the first is worded on the screen, and the second still opens the library.

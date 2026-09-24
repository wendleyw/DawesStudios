# Competitors

The **Competitor ads** widget lets the studio follow a client's competitors' advertising from the
client's board, using only free, official ad-transparency sources. Design:
[spec](../../../../docs/superpowers/specs/2026-09-24-competitor-ads-widget-design.md). Verification:
[record](../../../../docs/verification/competitor-ads-2026-09-24.md).

## Who sees what

| Role                              | Widget and list | Changes                                                            |
| --------------------------------- | --------------- | ------------------------------------------------------------------ |
| Agency                            | Yes             | Places and removes the widget; adds, edits and removes competitors |
| Designer with work for the client | Yes             | None                                                               |
| Client                            | Never           | None                                                               |

Row-level security enforces this on `competitors` and `client_board_widgets` through
`private.can_follow_competitors(client)`: the agency, or a designer that
`private.can_access_client` admits. Clients are refused even for their own workspace. Only the
agency inserts, updates or deletes, and the columns an update may touch are granted one by one, so a
competitor can never move to another client. A client can follow at most 12 competitors. The cap
trigger passes anyone but the agency straight to row-level security, so a refused caller learns
nothing about the list.

## Behavior

- **The widget** (`competitor-ads-widget.tsx`) is the board's first canvas frame (see the
  [board README](../board/README.md#widgets)). Each competitor is a tile with an initial, the name,
  the website's host and the sources that match exactly. The agency's head has **Add competitor**
  (replaced by "Up to 12 competitors" at the cap) and a button that removes the widget from the
  board. Removing the widget keeps the list. The form and the screen render into `document.body`,
  so the canvas's pointer and wheel handling never reaches them. A competitor removed elsewhere
  closes its screen, because the open competitor is looked up in the list rather than kept.
- **The screen** (`competitor-screen.tsx`) has one tab per library: **Facebook & Instagram**,
  **TikTok** and **Google**. Each tab has a direct link that opens in a new tab
  (`rel="noopener noreferrer"`). The agency can **Edit** it, or **Remove competitor** after
  confirming.
- **The form** (`competitor-form.tsx`) validates with `parseCompetitorForm`, which mirrors the
  database's check constraints. It words a duplicate name as "This client already follows <name>."
  and passes the cap's own message through.

## Links, and why there are no frames

`libraryLinks` (`competitors-model.ts`) builds one URL per library, already filtered:

- **Meta**: the Ad Library by Page ID (`view_all_page_id`), or a keyword search by name.
- **TikTok**: the Ad Library searched by the TikTok advertiser name, or by the competitor's name.
- **Google**: the Ads Transparency Center by advertiser ID (`AR…`), by the website's domain, or
  its search page.

Meta and Google refuse to be framed, and TikTok gives no guarantee, so every library opens in a new
tab. Scraping any of them breaks their terms, and nothing here does.

## Meta previews

`GET /api/competitors/[id]/ads` (`app/api/competitors/[id]/ads/route.ts`, logic in
`competitor-ads-route.ts`) reads the competitor with the caller's own session, so row-level security
answers 404 to a client, and only then calls Meta's official Ad Library API (`ads_archive`, Graph API
`v26.0`) with the server's `META_AD_LIBRARY_ACCESS_TOKEN`. It searches by Page ID when there is one
and by name otherwise, for `META_AD_LIBRARY_COUNTRIES` (every country by default), and keeps active
ads only, 25 at most, with a 10-second timeout. `meta-ad-library.ts` builds the request, maps each ad
to `{ id, pageName, platforms, body, title, description, caption, startedOn, libraryUrl }` and words
Meta's errors. It never requests `ad_snapshot_url`, whose loading needs the token, and the token
never appears in a response. Answers are cached per competitor and query for 30 minutes, for up to
100 entries, in the server process.

Without a token the route answers `{ status: "not_configured" }`, and the screen says previews are
off; the agency also reads how to turn them on. The production guide explains how to obtain the
token and renew it before its roughly 60 days run out.

**Coverage.** Meta's API returns ordinary ads only when they reached the EU; elsewhere it returns
political and issue ads only. The screen says so when the answer is empty, and the library link
still shows every active ad.

**Not used.** TikTok's Commercial Content API is barred for commercial and agency use by its terms,
and Google has no Ads Transparency API; its BigQuery export needs a Google Cloud project, runs up
query costs and covers mainly the EEA. Both sources stay links.

## Files

| File                                                                        | Responsibility                                                                                                         |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `competitors-model.ts`                                                      | Types, form validation, library links, host and matched sources, write messages                                        |
| `meta-ad-library.ts`                                                        | Meta request, answer mapping, error wording, the result cache (server only)                                            |
| `competitor-ads-route.ts`                                                   | The route's checks and its read-as-caller lookup (server only)                                                         |
| `competitors-data.ts`                                                       | `useCompetitors`, `useCompetitorAds`, `createCompetitor`, `updateCompetitor`, `deleteCompetitor`, `fetchCompetitorAds` |
| `competitor-form.tsx`, `competitor-screen.tsx`, `competitor-ads-widget.tsx` | The form, the screen and the widget                                                                                    |
| `competitors.css`                                                           | This feature's styles                                                                                                  |

`competitor-ads-route.ts` calls Supabase outside `competitors-data.ts` because it runs on the server
with the caller's bearer token, like the other `app/api` routes; it is listed under the
[data-access exceptions](../../../../docs/architecture/data-access.md#exceptions).

## Checks

From the repository root:

```bash
npm --prefix apps/web run test -- features/competitors
supabase test db supabase/tests/database/competitor_ads.test.sql
npm --prefix apps/web run test:e2e -- competitor-ads
```

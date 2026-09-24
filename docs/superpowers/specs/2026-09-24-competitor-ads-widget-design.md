# Competitor ads widget

Date: 2026-09-24

Status: written on the user's delegation. On 2026-09-24 at 01:55 the user asked for this widget,
asked that it follow the usual process, and had already put the orchestrator in control for the
night ("você vai estar no controle"). Every decision the user did not state is listed under
[Decisions taken on the user's behalf](#decisions-taken-on-the-users-behalf) for their review.

## Objective

The studio team should be able to follow a client's competitors' advertising from the client's
board, using only free, official ad-transparency sources. The agency places a **Competitor ads**
widget on the board and lists the client's competitors. Opening a competitor shows a screen with a
tab for each source, **Facebook & Instagram**, **TikTok** and **Google**. Each tab has a direct link
to that competitor in the platform's public ad library. The Facebook & Instagram tab also shows the
competitor's ads inside the app when the server holds a Meta Ad Library API token.

Success means all of the following hold:

1. The agency can add and remove the widget and add, edit and remove competitors. A designer who
   works on the client sees the widget and every competitor, read-only. A client never sees the
   widget, the competitor list or any competitor's ads, and the database refuses them, not only
   the interface.
2. Every link opens the official library already filtered to that competitor, in a new tab.
3. With a token configured, the Facebook & Instagram tab lists the competitor's active ads from
   Meta's official Ad Library API. The token never reaches the browser, and neither does any URL
   that contains it.
4. Without a token, the widget still works: the tab says previews are off and keeps the link.

## What the user asked for

"A widget we can place on the board. The widget brings all of the client's competitors. Use the
Facebook API to do it for free, like the Facebook Ad Library, bringing the ads, maybe as a screen
showing the Facebook library, Instagram, TikTok, Google. Use free, validated and secure tools."

## Decisions taken on the user's behalf

| Question | Decision | Why |
| --- | --- | --- |
| Who sees it | Agency and designers with access to the client; never the client. Only the agency writes. | Competitor research is internal studio work, and a restrictive default can be opened later without a data migration. |
| Where it lives | A frame on the board's **Canvas** view, above the campaigns, added and removed by the agency from a **Widgets** toolbar panel. | "Place on the board" names the canvas; a frame keeps the stack's shared left edge and the deterministic sizing the board already uses. |
| Sources shown in the app | Meta only, through the official Ad Library API (`ads_archive`). | It is free and official. TikTok's Commercial Content API terms bar commercial and agency use, and Google has no Ads Transparency API. |
| TikTok and Google | Links to their public libraries only. | Same reason; no scraping, which all three platforms forbid. |
| Embedding the libraries | No iframes. Every library opens in a new tab. | Meta and Google refuse framing, and TikTok gives no guarantee. |
| Meta coverage | Query every country (`ALL`) by default, configurable on the server. | Meta's API returns ordinary ads only when they reached the EU; elsewhere only political or issue ads. The screen says so and keeps the library link, which shows every active ad. |
| Competitors per client | At most 12. | Keeps the widget readable and bounds the work behind it. |
| LinkedIn | Not included. | The user did not ask for it and its link format is not documented. |

## Non-goals

- Scraping or automating any ad library website, or any unofficial or paid third-party source.
- TikTok's Commercial Content API and Google's BigQuery export of the Ads Transparency Center. The
  first is barred for commercial use, and the second needs a Google Cloud project, runs up query
  costs and covers mainly the EEA. Both stay possible follow-ups.
- Storing or re-hosting ad creatives. The app keeps only the competitor list; ad results live in a
  short server cache and the browser's query cache.
- Showing the widget in List, Timeline, Kanban or Calendar, or letting people drag it.
- Alerts, history or analytics about competitors' ads.

## Current state

- The board canvas (`features/board`) stacks campaign frames top to bottom, with their project
  cards, through `buildStack` in `board-layout.ts` and `useBoardCanvasNodes` in
  `board-canvas-nodes.ts`. Frames are sized by pure functions and share their left edge.
- Board actions live in `board-toolbar.tsx`: Search and Filters each open one compact panel.
- Server routes follow `app/api/team-members/[id]/remove/route.ts`: a bearer token, an origin
  check, and a Supabase client acting as the caller, so row-level security decides what it sees.
- `private.can_access_client(client)` is true for the agency, the client's members, and designers
  assigned to one of the client's projects. `private.current_role()` returns the caller's role.
- The legacy `board_preferences.visible_widgets` column is a per-viewer list of old view names
  with no current consumer. It is not reused.
- The Meta Ad Library API needs a Meta developer app with the Ad Library API product and a user
  access token from an identity-confirmed account. A long-lived token lasts about 60 days. The
  current Graph API version is v26.0.

## Design

### Interaction

**Placing the widget.** In Canvas view the agency's toolbar gains a **Widgets** button that opens
the same kind of compact panel as Search and Filters. It lists one widget, **Competitor ads**
("Follow competitors' ads from the official ad libraries"), with **Add to board** or, once placed,
**Remove from board**. Removing the widget keeps the competitor list. Designers and clients have no
Widgets button.

**The widget.** A frame above the campaigns, as wide as a three-card campaign row (920 units) and
as tall as its rows of tiles, so its size stays a pure function of the competitor count. Its
head reads **Competitor ads**, then a count badge like a campaign frame's. For the agency it also has
**Add competitor** and a **Remove from board** icon button. Its body is a grid of up to four
competitor tiles per row: an initial, the name, the website's host, and the sources that have a
direct match (**Meta**, **TikTok**, **Google**). Clicking a tile, or pressing Enter on it, opens
that competitor's screen. When the list is empty, the agency reads "Add the competitors you want to
follow." with **Add competitor**, and a designer reads "The studio has not added competitors yet."

**The competitor screen.** A large modal titled with the competitor's name, with the website as its
description. Three tabs:

- **Facebook & Instagram.** **Open in Meta Ad Library** at the top. Below it, the ads from Meta's
  API, each as a card: the page name, the platforms ("Facebook · Instagram"), "Running since
  Sep 3, 2026", the ad text (clamped to five lines), the link title and caption, and
  **View in Ad Library**. States:
  - loading: "Loading ads from Meta…";
  - no token: "In-app previews are off. The Ad Library shows every active ad." The agency also
    reads "Add a Meta Ad Library token on the server to preview ads here.";
  - no ads: "Meta's API returned no active ads for this competitor. It lists ordinary ads only
    where they reached the EU; the Ad Library shows every active ad.";
  - error: the message and **Try again**.
- **TikTok.** **Open in TikTok Ad Library**, and the note "TikTok's library covers ads shown in the
  EU, the UK and Switzerland."
- **Google.** **Open in Google Ads Transparency Center**. Without an advertiser ID or a website the
  link opens the Transparency Center's search, with the note "Add the competitor's website or
  Google advertiser ID for a direct link."

For the agency the screen's footer has **Edit** and **Remove competitor**. Removal asks for
confirmation.

**The competitor form.** A modal with **Name** (required, up to 80 characters), **Website**
(optional, http or https), **Facebook Page ID** (optional, digits; help: "The number after
view_all_page_id= in the page's Ad Library link"), **Google advertiser ID** (optional, AR followed by
digits; help: "From the advertiser's page in the Ads Transparency Center") and **TikTok advertiser
name** (optional; help: "Leave empty to search by the competitor's name"). Names are unique per
client, ignoring case.

### Links

`libraryLinks(competitor)` returns one URL per source:

| Source | With a match | Otherwise |
| --- | --- | --- |
| Meta | `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&media_type=all&search_type=page&view_all_page_id=<page id>` | the same with `search_type=keyword_unordered&q=<name>` |
| TikTok | `https://library.tiktok.com/ads?region=all&adv_name=<TikTok advertiser name>` | the same with the competitor's name |
| Google | `https://adstransparency.google.com/advertiser/<AR id>?region=anywhere` | `https://adstransparency.google.com/?region=anywhere&domain=<website host>`, or the search page `https://adstransparency.google.com/?region=anywhere` |

Every value is URL-encoded. Every link opens with `target="_blank"` and `rel="noopener noreferrer"`.
A tile marks a source as matched only when it has an exact match: a page ID for Meta, an advertiser
ID or website for Google, and always for TikTok, whose library searches by name.

### Data

Migration `202609240001_competitor_ads.sql`:

- `public.competitors`: `id`, `client_id` (cascades with the client), `name`, `website`,
  `meta_page_id`, `google_advertiser_id`, `tiktok_advertiser`, `created_by`, `created_at`,
  `updated_at` (through `private.touch_updated_at`). Check constraints mirror the form: a trimmed
  name of 1–80 characters, an http(s) website of at most 200 characters, a page ID of 1–20 digits,
  `AR` followed by 10–30 digits, and a trimmed TikTok name of 1–80 characters. A unique index on
  `(client_id, lower(name))`.
- A `before insert` trigger holds the client row and refuses a thirteenth competitor with "A client
  can follow up to 12 competitors."
- `public.board_widgets`: `(client_id, kind)` primary key, `kind` limited to `competitor_ads`,
  `created_by`, `created_at`.
- Row-level security on both tables: select when `private.can_access_client(client_id)` and the
  caller's role is agency or designer; insert, update and delete for the agency only. Grants to
  `authenticated` only, with update limited to the editable columns.

Reads and writes live in `features/competitors/competitors-data.ts` (`useCompetitors`, `useCompetitorAds`,
`createCompetitor`, `updateCompetitor`, `deleteCompetitor`) and, for the widget's placement, in
`features/board/board-data.ts` (`useBoardWidgets`, `addBoardWidget`, `removeBoardWidget`).

### Meta previews

`GET /api/competitors/[id]/ads` (`app/api/competitors/[id]/ads/route.ts`):

1. Refuses an id that is not a UUID (400), a foreign `Origin` (403), and a missing or expired
   session (401).
2. Reads the competitor as the caller. Row-level security hides it from clients and from anyone
   without access, which the route answers with 404 "This competitor is not available."
3. Without `META_AD_LIBRARY_ACCESS_TOKEN` it answers `{ status: "not_configured" }`.
4. Otherwise it calls `https://graph.facebook.com/v26.0/ads_archive` with `search_page_ids` when the
   competitor has a page ID and `search_terms` with the name when not, `ad_reached_countries` from
   `META_AD_LIBRARY_COUNTRIES` (default `ALL`), `ad_active_status=ACTIVE`, `ad_type=ALL`, a fixed
   field list and `limit=25`, with a 10-second timeout.
5. It maps each ad to `{ id, pageName, platforms, body, title, description, caption, startedOn,
   libraryUrl }`, where `libraryUrl` is the public `https://www.facebook.com/ads/library/?id=<id>`.
   It never requests or forwards `ad_snapshot_url`, whose loading needs the token.
6. It answers `{ status: "ready", ads, fetchedAt }` and caches that answer per competitor and query
   for 30 minutes, for up to 100 entries, in the server process.

The request builder, the response mapping and the error mapping live in
`features/competitors/meta-ad-library.ts`, which only the route imports.

### Security

- The token is a server environment variable without a `NEXT_PUBLIC_` prefix. It is sent only to
  `graph.facebook.com`, never logged, and never part of a response.
- The route contacts one fixed host. The page ID it sends is digits, and the name is a URL-encoded
  query parameter, so a competitor record cannot redirect the request.
- Ad text is rendered as text, never as HTML. No image or frame from another origin is loaded, so
  the Content Security Policy does not change.
- Clients are refused by row-level security on both tables and by the route's read-as-caller.
- The 12-competitor cap and the cache bound the calls made against the token's own rate limit.

## Failure handling

| Failure | What the person sees |
| --- | --- |
| Meta rejects the token (code 190) | "The Meta Ad Library token has expired or was revoked. Renew it on the server." |
| Meta throttles (codes 4, 17, 613, 80004) | "Meta is limiting requests right now. Try again in a few minutes." |
| Meta refuses the app or account (codes 10, 200, 2332002 and other permission errors) | "Meta has not approved this token for the Ad Library API." |
| Meta refuses the search's parameters (code 100) | "Meta refused the search. Check the server's Ad Library countries setting." |
| Any other Meta error, or a malformed answer | "Meta could not return ads right now. Try again." |
| No answer within 10 seconds | "Meta did not answer in time. Try again." |
| A duplicate name | "This client already follows <name>." |
| The thirteenth competitor | "A client can follow up to 12 competitors." |
| A failed widget or competitor write | The form keeps its values and shows the database's message. |

Meta errors answer 502, and a timeout answers 504. The screen shows the message with
**Try again**, and the library link stays available.

## Verification

- pgTAP `competitor_ads.test.sql`: the access matrix for both tables (agency writes; an assigned
  designer reads only; an unassigned designer and every client, including the client's own members,
  see nothing), the check constraints, the case-insensitive uniqueness, and the cap.
- Unit tests: form validation and `libraryLinks`; the Meta request builder (page or terms, countries,
  fields, never the snapshot URL); the mapping; the error mapping; the route (400, 401, 403, 404,
  not configured, ready, cache hit, 502, 504) with fetch and Supabase replaced.
- Component tests: the widget for agency and designer, the Widgets panel, the competitor screen's
  tabs, links and four Meta states, and the form.
- Board tests: the widget frame first in the stack, and absent for a client.
- Playwright `competitor-ads.spec.ts`: the agency places the widget, adds a competitor and checks
  every link and the no-token state; an assigned designer sees it read-only; a client sees no widget
  and receives 404 from the route; the agency removes the competitor and the widget.
- A visual pass at 1600 × 1000 and 390 × 844 for the widget, the Widgets panel and the screen.

### Definition of done

All of the above pass. `npm run check` and `npm run db:test` are green apart from the known SABRE
overlay assertions. Docs are updated: the competitors and board READMEs, the production guide (the
token, its roughly 60-day renewal, and the countries variable), `apps/web/.env.example`,
`compose.yaml`'s web environment, the backend and data-access architecture notes, and a
verification record.

## Risks

- For competitors that advertise only outside the EU, Meta's API returns ordinary ads rarely or
  never. The screen says so, and the library link still shows every active ad.
- A long-lived Meta token expires after about 60 days. The screen names the expiry, and the
  production guide explains renewal.
- The TikTok link's `adv_name` parameter comes from the public site and is not formally
  documented. If TikTok drops it, the link still opens the library.
- `ALL` as an `ad_reached_countries` value could not be checked without a token. If Meta refuses it,
  the screen says the search was refused, and `META_AD_LIBRARY_COUNTRIES` takes a list of country
  codes instead.

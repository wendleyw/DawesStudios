# Welcome dashboards for clients and designers

Date: 2026-09-25

Status: design approved in chat (all sections, one message); awaiting written-spec review

## Objective

Clients and designers get a welcome dashboard like the studio's Overview: a greeting, the few
numbers that matter to their role, and three short lists that say what is moving, what is waiting on
them, and what shipped recently. The user supplied a reference dashboard (a client greeting with a
logo, credits remaining, active projects, reviews awaiting feedback, an "in flight" strip, and the
columns What's moving / Your turn / Recently shipped) as an example of content, not of styling.

Success means all of the following hold:

1. A client with one workspace signs in and lands on that client's **Overview** page, greeted by
   first name, and can reach every other client destination in one click.
2. A designer's `/home` greets them and shows only their assigned work, with no credits.
3. The studio's `/home` keeps its Overview content under the same greeting, and the studio can open
   any client's Overview and see exactly what that client sees.
4. Every number on a dashboard equals the count the underlying records give for that role, and a
   client's Overview never reveals a designer's identity or assignment, an internal comment, or an
   unpublished version, for any viewer.
5. Both themes, phone widths and keyboard use work as on the other client pages.

## Decisions taken with the user

| Question | Decision |
| --- | --- |
| Where the client dashboard lives | A new first client destination, **Overview** (`/clients/:clientId/overview`); clients land there after sign-in instead of the Board. |
| Designer dashboard | Their assigned work across clients at `/home`; no credits; nothing outside their assignments. |
| Studio (agency) | The `/home` Overview gains the welcome header, and the studio can open each client's Overview to see the client's view. |
| Approach | A new `overview` feature composing the existing role-scoped reads, plus one column, `projects.delivered_at` (A). Dating deliveries from `updated_at` (B) and a server-side `get_overview` function (C) were rejected. |
| Look | The product's own visual system in both themes; the reference is content inspiration only. |

## Non-goals

- No new permissions, roles or policies; no change to what any role may read.
- No aggregate across several client workspaces for a client who belongs to more than one; such a
  client keeps today's `/home` and opens each workspace's Overview from there.
- No change to the Board, Reviews, Briefings, Credits or project pages beyond links into them.
- No charts, no editable widgets, no per-user dashboard settings.

## Current state

- `apps/web/features/workspace/home-page.tsx` renders `/home` for every role: tiles
  (`.overview-stats`), a "Needs attention" table and client cards. The agency title is "Overview",
  the designer's "My work", a client's "Home". A client with exactly one workspace is redirected to
  `/clients/:id/board`.
- `client-navigation.tsx` lists Board, Briefings, Reviews, Files, Brand Hub and Credits (Credits
  hidden for designers). `client-switcher.tsx` links a single-client account straight to its board.
- Role-scoped reads already exist: `useProjects(clientId?)` and `useClients` (workspace),
  `useBriefings` (briefings), `useCreditAccount` / `useCreditLedger` (credits) and `useReviews`
  (reviews; for a client session it returns published versions with the client's review status,
  and `inReviewTab("waiting", row, "client")` selects those waiting on the client).
- Projects have no delivery timestamp. `mark_project_delivered` sets `status = 'delivered'` and
  `updated_at = now()`, and any later update (a board move writes `board_position`) rewrites
  `updated_at`.
- Acceptance criterion **D01** states "Client lands on its board" and its evidence names the agency
  `<h1>Overview` and the designer `<h1>My work`.

## Design

### 1. Routes and landing

- New route `app/(workspace)/clients/[clientId]/overview/page.tsx` rendering the client Overview.
- `client-navigation.tsx` adds **Overview** as the first destination for the agency and clients
  (not designers, who keep today's five links).
- `home-page.tsx` redirects a client with one workspace to `/clients/:id/overview`, and
  `client-switcher.tsx` links a single-client account there. The Board stays one click away.
- A designer's `/home` renders the designer dashboard; the agency's `/home` keeps its content.
- The sidebar entries keep their role names (Overview, My work, Home).

### 2. Shared look

- **Welcome header.** An eyebrow with the page's role name (Overview, My work; on a client page
  also Overview, because the floating client header directly above already shows the client's
  logo); the heading "Welcome back, <first name>" (the first word of the viewer's display
  name); today's date in the studio time zone; one primary action at the right: **New briefing** for
  a client (and for the studio on a client's Overview), **New client** for the studio's `/home`, none
  for a designer. On a client route it is the white client header card like the other client pages;
  on `/home` it keeps that page's plain heading layout. It is a shared component because the
  workspace and the new overview feature both use it.
- **Numbers.** The existing Overview tiles (`.overview-stats`: large number, label), extended with an
  optional one-line note. They move to `app/globals.css` because two features now use them.
- **Columns.** Three cards side by side on desktop and stacked below 1000 px. Each card has an
  eyebrow, a title, an optional "See all →" link and up to five rows in the same one-line style as
  Briefings, Reviews and Credits. Each column has its own short empty state.
- **Relative time.** "today", "yesterday", "3 days ago", "last week", "2 weeks ago", "last month",
  "2 months ago", "last year" from `Intl.RelativeTimeFormat`, computed in the studio time zone.

### 3. Client Overview (`/clients/:clientId/overview`)

- **Numbers.**
  - **Credits remaining**: the account balance, noted "212 of 675 used", where used is the sum of
    project debits and the total is balance plus used.
  - **Active projects**: projects not delivered, noted "6 delivered this month" (delivered in the
    current calendar month, studio time zone).
  - **Needs your review**: versions waiting on the client, noted "awaiting your feedback".
- **In flight strip.** Briefings **with the studio** (`awaiting_review`, `budget_confirmed`) ·
  projects **in progress** (`planned`, `in_progress`, `internal_review`, `changes_requested`) ·
  **delivered** (all time).
- **What's moving.** Active projects, soonest due first (no due date last): title, the credits it
  used (from its project debit), due date and stage badge; the row opens the project. See all → Board.
- **Your turn.** Versions waiting on the client, longest waiting first: "Review · last week" above
  "<project> · <deliverable>"; the row opens the project on its client channel. See all → Reviews.
- **Recently shipped.** Delivered projects, newest delivery first, with the delivery date; the row
  opens the project. See all → Board.
- **The studio's view.** The same page and numbers. The header reads "What <client> sees" with the
  subtitle "This client's overview, as they see it", and keeps **New briefing**.
- **Isolation.** The page reads only client-visible data: projects, briefings, credits, and the
  client channel of reviews (`internal` rows are dropped for every viewer). It renders no designer
  name, assignment, internal note or unpublished version.

### 4. Designer home (`/home` for a designer)

- **Numbers.** **Active projects** (assigned, not delivered) · **Your turn** (latest versions whose
  status is changes requested, including a published version whose project the client sent back) ·
  **In studio review** (latest versions submitted) · **Delivered this month**.
- **What's moving.** Assigned active projects, soonest due first: title, client name, due date,
  stage badge.
- **Your turn.** Versions sent back, longest waiting first: "Changes requested · submitted 2 days
  ago" above "<project> · <deliverable>"; the row opens the project.
- **Recently delivered.** Assigned delivered projects, newest delivery first.
- No credits anywhere. The existing row-level policies already limit the reads to assignments.

### 5. Studio `/home`

The welcome header replaces the plain "Overview" heading (the eyebrow keeps "Overview"); the date,
**New client**, tiles, "Needs attention" and client cards are unchanged.

### 6. Data

- A new feature `apps/web/features/overview/` owns the dashboards: `overview-data.ts` (its only
  Supabase access: the designer's assigned-version read and the deliverable names both dashboards
  need), `overview-model.ts` (pure functions for every count, filter, ordering and the relative
  time), the two page components, `overview.css` and a README. It reuses the hooks listed under
  Current state rather than repeating their queries.
- The review tab rule (`inReviewTab`, `isFinished`) moves from `reviews-page.tsx` into
  `reviews/review-data.ts`, beside `publishedVersionStatus`, so the overview reads both without
  importing a page module.
- **Migration.** `projects.delivered_at timestamptz` (nullable). `mark_project_delivered` sets it
  to `now()` alongside the status. Existing delivered projects are backfilled from `updated_at`.
  Database types are regenerated. No policy changes: every role that reads a project already reads
  its columns.

### 7. Acceptance amendment

Under family D, a dated product amendment records the user's request: a client lands on its
Overview (one click from the Board); the agency and designer `/home` headings greet the viewer, with
the role name ("Overview", "My work") kept as the page eyebrow and the sidebar label. D01's
2026-09-21 evidence describes the earlier landing and is not a requirement to restore it.

## Testing

- Unit (`overview-model.test.ts`): every count and note from representative records; month
  boundaries in the studio time zone; ordering of each column including missing due dates; the
  client-channel filter dropping internal rows; the designer's changes-requested mapping; the
  relative-time wording; first-name extraction.
- Component: the client Overview and designer home render their numbers and empty states from mocked
  hooks, and the client page renders no designer name or internal note from a mocked internal row.
- Database: `mark_project_delivered` sets `delivered_at`; backfilled rows carry their old
  `updated_at`.
- Browser (`overview.spec.ts`):
  - a client signs in and lands on `/clients/:id/overview`, sees "Welcome back, <first name>",
    and the page's numbers equal the counts read from the database for that client;
  - a designer's `/home` lists only assigned projects and shows no credits;
  - the studio opens the same client's Overview and sees the same numbers under "What <client> sees";
  - no designer name or internal note appears on the client page;
  - both themes and 390 px render without overflow.
- Updates: `test-support.ts` sign-in URL (`overview`), `workspace.spec.ts` (client landing),
  `client-navigation.spec.ts` (seven links for clients), `canonical-workspaces.spec.ts` (designer
  heading).

## Documentation

`features/overview/README.md`; `features/workspace/README.md` (landing, navigation, welcome header);
`docs/architecture/reference-map.md` and `sitemap.md` (routes); `design-system.md` (dashboard
section); the acceptance amendment; `docs/engineering/handoff.md`.

## Delivery

A plan in `docs/superpowers/plans/`, executed task by task by workers with a review after each, a
final whole-branch review, a verification record, and a commit per task on local `main`.

## Risks

- The SABRE demonstration overlay (50 projects) makes the client's numbers large; browser tests
  compare against database counts instead of fixed numbers.
- Adding a column touches a table every role reads; the migration only adds a nullable column and
  changes one function body, and the database suite runs before the task is accepted.
- Landing changes can break flows that assumed the Board after sign-in; the four known tests above
  are updated in the same task, and the whole client browser suite runs at the end.

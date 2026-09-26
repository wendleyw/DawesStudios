# Miro frame links on project versions

Date: 2026-09-26

Status: design approved in chat (section by section); awaiting written-spec review

## Objective

The client trusts Miro and wants it alongside the product. Each project version can point at a
frame on a Miro board, and a **View on Miro** button opens that frame inside the product in a
full-screen panel, the same way Playground opens. There are two boards in the same sense: a
client board that the client sees on published versions, and a separate internal board that
assigned designers see on internal versions.

The product stays the source of truth. Miro is a window, not a backup or a synchronised copy.

Success means all of the following hold:

1. The agency can attach a Miro frame link to a published version while publishing it, and add,
   change or remove it afterwards without republishing.
2. The agency can attach a Miro frame link to an internal version, and add, change or remove it.
3. A client member sees **View on Miro** only on published versions that have a link; opening it
   shows the embed centred on that frame, with **Open in Miro** and **Back to project**.
4. An assigned designer sees **View on Miro** only on internal versions that have a link.
5. A client never receives an internal link, and a designer never receives a client link, through
   the UI or the API. Only the agency writes either kind.
6. The published snapshot (`published_versions`, `published_designs`) and `publish_version` are
   unchanged.
7. Both themes, phone widths, keyboard use and the Content-Security-Policy spec pass.

## Decisions taken with the user

| Question | Decision |
| --- | --- |
| Where the button lives | On the project version, not the client or campaign. |
| Granularity | One link per version, prefilled from the previous version of the same deliverable. |
| Client board audience | Client members and the agency; never designers. |
| Internal board audience | Assigned designers and the agency; never the client. |
| Who writes links | The agency only, for both boards. |
| When the client link is added | Optional field in the publish dialog, plus add/change/remove later (A). |
| Direction | Product → Miro only. No reading from Miro, no sync, no Miro API or OAuth. |

## Non-goals

- No Miro REST API, OAuth app, webhook or background job.
- No detection of clicks inside the embed; links inside Miro are the agency's own concern.
- No link at client, campaign or project level.
- Comments made in Miro stay in Miro and are not part of either comment channel.
- The product does not control what the agency places on a Miro board.

## Data model

One migration, `supabase/migrations/<timestamp>_miro_version_links.sql`.

`public.publication_miro_links` (client board):

- `publication_id uuid primary key references public.published_versions`
- `project_id uuid not null`, with `foreign key (publication_id, project_id) references
  public.published_versions (id, project_id)`
- `board_id text not null`, `widget_id text` (null opens the whole board)
- `updated_by uuid not null references public.profiles`, `updated_at timestamptz not null default now()`
- RLS select: `private.can_client_channel(project_id)`.

`public.design_version_miro_links` (internal board):

- `version_id uuid primary key references public.design_versions`
- `project_id uuid not null`, with `foreign key (version_id, project_id) references
  public.design_versions (id, project_id)`
- the same `board_id`, `widget_id`, `updated_by`, `updated_at` columns
- RLS select: `private.can_produce(project_id)`.

Both tables grant no insert, update or delete to `authenticated`; writes go through the RPCs
below. The tables are separate on purpose: internal and client data already live in different
tables under different rules, so a wrong filter cannot expose one board to the other audience.

The raw pasted URL is never stored. `private.parse_miro_board_url(p_url text)` accepts only
`https://miro.com/app/board/<boardId>/` with an optional `moveToWidget=<widgetId>` query value,
validates both identifiers against a strict character set and length, and raises `22023` with a
readable message otherwise.

## Server functions

All are `security definer`, `set search_path=''`, and start with `private.assert_agency()`.

- `set_publication_miro_link(p_publication_id uuid, p_url text)`: parse, then upsert.
- `clear_publication_miro_link(p_publication_id uuid)`: delete; a missing row is not an error.
- `set_version_miro_link(p_version_id uuid, p_url text)`: parse, then upsert.
- `clear_version_miro_link(p_version_id uuid)`: delete; a missing row is not an error.

Setting the same URL twice leaves one row, so retries are safe without an idempotency key.
`publish_version` is not modified: the publish dialog calls `set_publication_miro_link` after a
successful publish.

## Application

Boundaries follow `docs/architecture/data-access.md` and `apps/web/features/shared/README.md`.

- `features/projects/miro-links.ts`: pure helpers that build the embed URL
  (`https://miro.com/app/live-embed/<boardId>/?moveToWidget=<widgetId>`) and the open-in-Miro URL
  from stored identifiers, plus a client-side pre-check mirroring the database rule. The iframe
  never receives a pasted URL.
- `features/projects/project-data.ts`: `usePublicationMiroLink()` and `useVersionMiroLink()` read
  hooks; `setPublicationMiroLink`, `clearPublicationMiroLink`, `setVersionMiroLink` and
  `clearVersionMiroLink` write functions.
- `features/projects/miro-board-panel.tsx`: the full-screen panel. It receives `boardId`,
  `widgetId` and a title, and does not know which channel it shows. The header holds
  **Back to project**, the version label and **Open in Miro ↗** (new tab), which stays visible
  even if the embed fails to load.
- `features/shared/fullscreen-sheet.tsx`: the slide-up frame, focus handling, inert background
  and scroll lock, extracted from Playground's `use-playground-close-lifecycle.ts` now that two
  consumers exist. Playground keeps its unsaved-work guard and behaves exactly as before.
- Publish dialog (`project-action-dialog.tsx`): optional **Miro frame** field, prefilled with the
  board of the previous publication of the same deliverable.
- Version bar: **View on Miro** when the current version has a link for the viewer's channel;
  for the agency, a **Miro** menu with **Add link**, **Change link** and **Remove link**.
- `apps/web/next.config.ts`: `frame-src` changes from `'none'` to `https://miro.com`.

## Prefill rules

- A new client link prefills only from the previous **publication** of the same deliverable.
- A new internal link prefills only from the previous **internal version** of the same deliverable.
- A client link never prefills from an internal link, and the reverse never happens.
- With no earlier link, the field starts empty.

## Flows

**Agency, publishing.** The dialog shows Release note and the optional Miro frame field. On
Publish, `publish_version` runs; if it succeeds and the field is filled, the link is saved. If the
second call fails, the dialog reports "V<n> was published, but the Miro link was not saved" with
**Try again**; the publication is never rolled back.

**Agency, afterwards.** The **Miro** menu on a published or internal version adds, changes or
removes that channel's link. Changes are visible on the next read without republishing.

**Client member.** On a published version with a link, **View on Miro** opens the panel centred
on the frame. Escape or **Back to project** closes it and returns focus to the button. Switching
versions shows that version's own link or no button. No create, edit or remove controls appear.

**Assigned designer.** The same experience on internal versions with an internal link. No client
link, button or field is ever shown.

## Errors

- Invalid URL: inline form message; the database rejects it independently with `22023`.
- Publish succeeds, link save fails: the message and retry above.
- Embed cannot load (no Miro access, blocked third-party cookies): **Open in Miro** remains the
  path forward.
- Caller without permission: `42501` and no change.

## Testing

- pgTAP: a client reads the publication link and gets zero internal links; an assigned designer
  reads the internal link and gets zero publication links; an unassigned designer reads neither;
  only the agency can call the four RPCs; malformed, non-HTTPS and non-`miro.com` URLs are
  rejected; setting twice keeps one row.
- Unit: URL parsing and building in `miro-links.ts`; prefill rules; the panel's open, close and
  fallback link; the extracted `fullscreen-sheet` and Playground's existing tests.
- `lib/next-config.test.ts`: `frame-src https://miro.com`.
- Playwright: the agency publishes with a link and the client opens the panel; a designer does
  not see the client button; `content-security-policy.spec.ts` reports no violations.

## Documentation

- `apps/web/features/projects/README.md`: the links, the button, the menu and the prefill rules.
- `apps/web/features/playground/README.md` and `apps/web/features/shared/README.md`: the shared
  full-screen frame.
- The architecture documents that describe channel permissions and the Content-Security-Policy.

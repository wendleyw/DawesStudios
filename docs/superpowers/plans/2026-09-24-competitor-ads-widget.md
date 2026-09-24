# Competitor Ads Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the agency place a **Competitor ads** widget on a client's board canvas that lists the client's competitors, links each one to the official Meta, TikTok and Google ad libraries, and previews Meta ads through Meta's official Ad Library API when the server holds a token.

**Architecture:** Two tables (`competitors`, `client_board_widgets`) whose row-level security admits only the agency and designers with the client's work, and only the agency writes. A server route reads a competitor as the caller and queries Meta's `ads_archive` with a server-only token. A new `features/competitors` feature holds the model, the Meta adapter, the route handler, the data layer, the form, the competitor screen and the widget. The board renders the widget as the first canvas frame and toggles it from a **Widgets** toolbar panel.

**Tech Stack:** PostgreSQL with pgTAP (local Supabase), Next.js App Router route handler (Node.js), React 19, TanStack Query v5, xyflow, zod through `@/lib/zod` (jitless), Vitest with Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-24-competitor-ads-widget-design.md`

## Global Constraints

- English for all code, copy, tests and docs.
- Migration `supabase/migrations/202609240001_competitor_ads.sql`; re-check that it is still the next free number before creating it.
- Clients never read `competitors` or `client_board_widgets`. Only the agency inserts, updates or deletes.
- At most 12 competitors per client, refused with "A client can follow up to 12 competitors."
- Meta Graph API `v26.0`. Countries come from `META_AD_LIBRARY_COUNTRIES`, default `ALL`. The token comes from `META_AD_LIBRARY_ACCESS_TOKEN`, a server-only variable that never has a `NEXT_PUBLIC_` prefix.
- Never request or forward `ad_snapshot_url`. An ad's link is `https://www.facebook.com/ads/library/?id=<id>`.
- No iframes. Every external link opens with `target="_blank"` and `rel="noopener noreferrer"`.
- Route cache: 30 minutes, 100 entries. Meta timeout: 10 seconds. Meta `limit`: 25.
- Browser Supabase queries live in `features/<feature>/<feature>-data.ts`. The route's caller lookup lives in `competitor-ads-route.ts`, server code imported only by the route, like the existing `app/api` routes.
- Feature styles live in `features/competitors/competitors.css` (imported by the widget) and board styles in `features/board/board.css`; nothing new in `app/globals.css`.
- Every task ends with `npm run check` passing and one Conventional Commit that stages explicit paths only (never `git add -A`; other sessions share this tree).
- Do not reset or re-provision local Supabase. Apply migrations with `supabase migration up`.

## Review Focus

1. A competitor name with `&`, `#`, spaces or accents: every library link must encode it and still open the right search (Task 2 test `searches each library by name, encoded, …`).
2. A Meta ad with missing fields (no text, no platforms, no start time): the card shows what exists, with no "undefined", empty separator or "Invalid Date" (Task 3 test `keeps an ad with missing fields…`, Task 6 test `renders only the parts an ad has`).
3. The open competitor is removed elsewhere, for example in another tab: its screen closes instead of showing a record that no longer exists (Task 7 test `closes a competitor's screen when the competitor is removed elsewhere`).
4. The session expires while the screen is open: the Meta tab says "Your session has expired. Sign in again." with **Try again**, and the library link stays usable (Task 4 test `asks for a session…`, Task 6 test `shows a failed preview's message with Try again…`).
5. A client's board: no widget query is even sent, and the ads route answers 404 (Task 8 test `never asks for a client's widgets`, Task 9 browser scenario).

---

### Task 1: Database — competitors and board widget placement

**Files:**
- Create: `supabase/migrations/202609240001_competitor_ads.sql`
- Create: `supabase/tests/database/competitor_ads.test.sql`
- Modify: `supabase/database.types.ts` (regenerated)

**Interfaces:**
- Consumes: `private.can_access_client(uuid)`, `private.current_role()`, `private.is_agency()`, `private.touch_updated_at()`.
- Produces: `public.competitors(id, client_id, name, website, meta_page_id, google_advertiser_id, tiktok_advertiser, created_by, created_at, updated_at)`, `public.client_board_widgets(client_id, kind, created_by, created_at)` with `kind = 'competitor_ads'`, `private.can_follow_competitors(uuid) returns boolean`, and the unique index `competitors_client_name_key`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/database/competitor_ads.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- The agency writes.
select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);
set local role authenticated;
select lives_ok($$insert into public.competitors(client_id,name,website,meta_page_id,google_advertiser_id,tiktok_advertiser) values (md5('dawes:client-org-1')::uuid,'Rival Co','https://rival.example','123456789','AR01234567890123456789','Rival Official')$$,'Agency adds a competitor');
select is((select created_by from public.competitors where name='Rival Co'),md5('dawes:agency')::uuid,'The author is the session');
select lives_ok($$insert into public.client_board_widgets(client_id,kind) values (md5('dawes:client-org-1')::uuid,'competitor_ads')$$,'Agency places the widget');
select throws_ok($$insert into public.competitors(client_id,name) values (md5('dawes:client-org-1')::uuid,'rival co')$$,'23505',null,'Names are unique per client, ignoring case');
select lives_ok($$insert into public.competitors(client_id,name) values (md5('dawes:client-org-2')::uuid,'Rival Co')$$,'Another client may follow the same name');
select throws_ok($$insert into public.competitors(client_id,name) values (md5('dawes:client-org-1')::uuid,' Padded')$$,'23514',null,'Untrimmed names are refused');
select throws_ok($$insert into public.competitors(client_id,name) values (md5('dawes:client-org-1')::uuid,'')$$,'23514',null,'Empty names are refused');
select throws_ok($$insert into public.competitors(client_id,name,website) values (md5('dawes:client-org-1')::uuid,'Bad site','javascript:alert(1)')$$,'23514',null,'Only http(s) websites are accepted');
select throws_ok($$insert into public.competitors(client_id,name,meta_page_id) values (md5('dawes:client-org-1')::uuid,'Bad page','12ab')$$,'23514',null,'Page IDs are digits');
select throws_ok($$insert into public.competitors(client_id,name,google_advertiser_id) values (md5('dawes:client-org-1')::uuid,'Bad google','CR123')$$,'23514',null,'Google advertiser IDs start with AR');
select throws_ok($$insert into public.client_board_widgets(client_id,kind) values (md5('dawes:client-org-1')::uuid,'weather')$$,'23514',null,'Unknown widget kinds are refused');
select throws_ok($$update public.competitors set client_id=md5('dawes:client-org-2')::uuid where name='Rival Co' and client_id=md5('dawes:client-org-1')::uuid$$,'42501',null,'A competitor cannot move to another client');
select lives_ok($$update public.competitors set website='https://rival.example/new' where name='Rival Co' and client_id=md5('dawes:client-org-1')::uuid$$,'Agency edits a competitor');

-- The cap: Rival Co is the first; eleven more fill the list, and a thirteenth is refused.
select lives_ok($$insert into public.competitors(client_id,name) select md5('dawes:client-org-1')::uuid,'Rival '||n from generate_series(2,12) n$$,'Agency fills the list to twelve');
select throws_ok($$insert into public.competitors(client_id,name) values (md5('dawes:client-org-1')::uuid,'Rival 13')$$,'P0001','A client can follow up to 12 competitors.','The thirteenth competitor is refused');

-- A designer with the client's work reads and never writes.
select set_config('request.jwt.claim.sub',md5('dawes:designer-1')::uuid::text,true);
select is((select count(*)::int from public.competitors where client_id=md5('dawes:client-org-1')::uuid),12,'An assigned designer reads the list');
select is((select count(*)::int from public.client_board_widgets where client_id=md5('dawes:client-org-1')::uuid),1,'An assigned designer sees the widget');
select throws_ok($$insert into public.competitors(client_id,name) values (md5('dawes:client-org-1')::uuid,'Designer pick')$$,'42501',null,'A designer cannot add a competitor');
with changed as (update public.competitors set website='https://x.example' where client_id=md5('dawes:client-org-1')::uuid returning id)
select is((select count(*)::int from changed),0,'A designer cannot edit a competitor');
with removed as (delete from public.competitors where client_id=md5('dawes:client-org-1')::uuid returning id)
select is((select count(*)::int from removed),0,'A designer cannot remove a competitor');
with removed as (delete from public.client_board_widgets where client_id=md5('dawes:client-org-1')::uuid returning client_id)
select is((select count(*)::int from removed),0,'A designer cannot remove the widget');

-- The agency removes a competitor and the widget; the list outlives the widget.
select set_config('request.jwt.claim.sub',md5('dawes:agency')::uuid::text,true);
with removed as (delete from public.competitors where client_id=md5('dawes:client-org-1')::uuid and name='Rival 12' returning id)
select is((select count(*)::int from removed),1,'Agency removes a competitor');
with removed as (delete from public.client_board_widgets where client_id=md5('dawes:client-org-1')::uuid returning client_id)
select is((select count(*)::int from removed),1,'Agency removes the widget');
select is((select count(*)::int from public.competitors where client_id=md5('dawes:client-org-1')::uuid),11,'Removing the widget keeps the competitors');
insert into public.client_board_widgets(client_id,kind) values (md5('dawes:client-org-1')::uuid,'competitor_ads');

-- A client never sees either table, even for its own workspace.
select set_config('request.jwt.claim.sub',md5('dawes:client-1')::uuid::text,true);
select is((select count(*)::int from public.competitors),0,'A client never reads competitors, even its own');
select is((select count(*)::int from public.client_board_widgets),0,'A client never sees the widget');
select throws_ok($$insert into public.competitors(client_id,name) values (md5('dawes:client-org-1')::uuid,'Client pick')$$,'42501',null,'A client cannot add a competitor');
select throws_ok($$insert into public.client_board_widgets(client_id,kind) values (md5('dawes:client-org-3')::uuid,'competitor_ads')$$,'42501',null,'A client cannot place the widget');

-- A designer without the client's work sees nothing.
reset role;
delete from public.project_assignments where designer_id=md5('dawes:designer-1')::uuid;
select set_config('request.jwt.claim.sub',md5('dawes:designer-1')::uuid::text,true);
set local role authenticated;
select is((select count(*)::int from public.competitors),0,'A designer without the client''s work reads nothing');
select is((select count(*)::int from public.client_board_widgets),0,'A designer without the client''s work sees no widget');

reset role;
set local role anon;
select throws_ok($$select count(*) from public.competitors$$,'42501',null,'Anonymous users cannot read competitors');
reset role;
select ok(not has_table_privilege('anon','public.client_board_widgets','SELECT'),'Anonymous select on widgets is revoked');
select * from finish();
rollback;
```

- [ ] **Step 2: Run it to see it fail**

Run (repository root): `supabase test db supabase/tests/database/competitor_ads.test.sql`
Expected: FAIL — `relation "public.competitors" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/202609240001_competitor_ads.sql`:

```sql
-- Competitor ads: the competitors a client's studio team follows, and the board widget that shows
-- them. Internal only: the agency writes; the agency and designers with the client's work read;
-- clients never see either table.

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  website text check (
    website is null or (website ~ '^https?://[^[:space:]]+$' and char_length(website) <= 200)
  ),
  meta_page_id text check (meta_page_id is null or meta_page_id ~ '^[0-9]{1,20}$'),
  google_advertiser_id text check (
    google_advertiser_id is null or google_advertiser_id ~ '^AR[0-9]{10,30}$'
  ),
  tiktok_advertiser text check (
    tiktok_advertiser is null
    or (tiktok_advertiser = btrim(tiktok_advertiser) and char_length(tiktok_advertiser) between 1 and 80)
  ),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index competitors_client_name_key on public.competitors (client_id, lower(name));
create trigger competitor_updated_at before update on public.competitors
  for each row execute function private.touch_updated_at();

-- Holds the client row so two simultaneous additions cannot both pass the count.
create function private.enforce_competitor_limit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.clients where id = new.client_id for update;
  if (select count(*) from public.competitors where client_id = new.client_id) >= 12 then
    raise exception 'A client can follow up to 12 competitors.' using errcode = 'P0001';
  end if;
  return new;
end
$$;
revoke execute on function private.enforce_competitor_limit() from public, anon, authenticated;
create trigger competitor_limit before insert on public.competitors
  for each row execute function private.enforce_competitor_limit();

create table public.client_board_widgets (
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null check (kind in ('competitor_ads')),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (client_id, kind)
);

-- The studio side of a client: the agency, or a designer who holds work for it. Never a client.
create function private.can_follow_competitors(target_client uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(
    private.current_role() in ('agency', 'designer') and private.can_access_client(target_client),
    false
  )
$$;
revoke execute on function private.can_follow_competitors(uuid) from public, anon;
grant execute on function private.can_follow_competitors(uuid) to authenticated;

alter table public.competitors enable row level security;
alter table public.client_board_widgets enable row level security;

create policy competitors_read on public.competitors for select to authenticated
  using (private.can_follow_competitors(client_id));
create policy competitors_insert on public.competitors for insert to authenticated
  with check (private.is_agency());
create policy competitors_update on public.competitors for update to authenticated
  using (private.is_agency()) with check (private.is_agency());
create policy competitors_delete on public.competitors for delete to authenticated
  using (private.is_agency());

create policy client_board_widgets_read on public.client_board_widgets for select to authenticated
  using (private.can_follow_competitors(client_id));
create policy client_board_widgets_insert on public.client_board_widgets for insert to authenticated
  with check (private.is_agency());
create policy client_board_widgets_delete on public.client_board_widgets for delete to authenticated
  using (private.is_agency());

revoke all on public.competitors, public.client_board_widgets from anon, authenticated;
grant select, delete on public.competitors to authenticated;
grant insert (client_id, name, website, meta_page_id, google_advertiser_id, tiktok_advertiser)
  on public.competitors to authenticated;
grant update (name, website, meta_page_id, google_advertiser_id, tiktok_advertiser)
  on public.competitors to authenticated;
grant select, delete on public.client_board_widgets to authenticated;
grant insert (client_id, kind) on public.client_board_widgets to authenticated;
```

- [ ] **Step 4: Apply it**

Run (repository root): `supabase migration up`
Expected: `Applying migration 202609240001_competitor_ads.sql...` and `Local database is up to date.`

- [ ] **Step 5: Run the test to see it pass**

Run: `supabase test db supabase/tests/database/competitor_ads.test.sql`
Expected: `All tests successful.`

- [ ] **Step 6: Regenerate the database types**

Run: `npm run db:types`
Expected: `git diff --stat supabase/database.types.ts` shows additions only, for `competitors` and `client_board_widgets`.

- [ ] **Step 7: Run the database gate**

Run: `bash -c 'supabase test db $(ls supabase/tests/database/*.test.sql | grep -v access_and_workflows)'`
Expected: every file passes (`access_and_workflows.test.sql` is excluded for its six known SABRE-overlay assertions).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/202609240001_competitor_ads.sql supabase/tests/database/competitor_ads.test.sql supabase/database.types.ts
git commit -m "feat(db): add competitors and board widget placement for the studio side only"
```

---

### Task 2: Competitor model — validation and library links

**Files:**
- Create: `apps/web/features/competitors/competitors-model.ts`
- Test: `apps/web/features/competitors/competitors-model.test.ts`

**Interfaces:**
- Consumes: `z` from `@/lib/zod`.
- Produces:
  - `MAX_COMPETITORS = 12`
  - `type Competitor = { id: string; client_id: string; name: string; website: string | null; meta_page_id: string | null; google_advertiser_id: string | null; tiktok_advertiser: string | null }`
  - `type CompetitorInput = { name: string; website: string | null; metaPageId: string | null; googleAdvertiserId: string | null; tiktokAdvertiser: string | null }`
  - `type CompetitorForm = { name: string; website: string; metaPageId: string; googleAdvertiserId: string; tiktokAdvertiser: string }`
  - `parseCompetitorForm(form: CompetitorForm): { input: CompetitorInput } | { error: string }`
  - `type LibraryLinks = { meta: string; tiktok: string; google: string }`
  - `libraryLinks(competitor: CompetitorLinkFields): LibraryLinks`, where `CompetitorLinkFields = Pick<Competitor, "name" | "website" | "meta_page_id" | "google_advertiser_id" | "tiktok_advertiser">`
  - `websiteHost(website: string | null): string | null`
  - `matchedSources(competitor: CompetitorLinkFields): ("Meta" | "TikTok" | "Google")[]`
  - `competitorWriteMessage(error: Error, name: string): string`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/features/competitors/competitors-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  competitorWriteMessage,
  libraryLinks,
  matchedSources,
  parseCompetitorForm,
  websiteHost,
} from "./competitors-model";

const blank = { name: "", website: "", metaPageId: "", googleAdvertiserId: "", tiktokAdvertiser: "" };

describe("parseCompetitorForm", () => {
  it("trims every field and stores an empty optional field as null", () => {
    expect(
      parseCompetitorForm({
        ...blank,
        name: "  Rival Co  ",
        website: " https://rival.example ",
        metaPageId: " 123456789 ",
      }),
    ).toEqual({
      input: {
        name: "Rival Co",
        website: "https://rival.example",
        metaPageId: "123456789",
        googleAdvertiserId: null,
        tiktokAdvertiser: null,
      },
    });
  });

  it.each([
    [{ ...blank }, "Add the competitor's name."],
    [{ ...blank, name: "x".repeat(81) }, "Keep the name to 80 characters."],
    [{ ...blank, name: "Rival", website: "rival.example" }, "Enter a website that starts with http:// or https://."],
    [{ ...blank, name: "Rival", website: "javascript:alert(1)" }, "Enter a website that starts with http:// or https://."],
    [{ ...blank, name: "Rival", metaPageId: "12ab" }, "A Facebook Page ID is only digits."],
    [{ ...blank, name: "Rival", googleAdvertiserId: "CR123" }, "A Google advertiser ID starts with AR, followed by digits."],
    [{ ...blank, name: "Rival", tiktokAdvertiser: "y".repeat(81) }, "Keep the TikTok name to 80 characters."],
  ])("refuses %o with a message the form can show", (form, message) => {
    expect(parseCompetitorForm(form)).toEqual({ error: message });
  });
});

const cafe = {
  name: "Café & Co #1",
  website: "https://www.rival.example/shop",
  meta_page_id: null,
  google_advertiser_id: null,
  tiktok_advertiser: null,
};

describe("libraryLinks", () => {
  it("searches each library by name, encoded, when the competitor has no platform ids", () => {
    expect(libraryLinks(cafe)).toEqual({
      meta: "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&media_type=all&search_type=keyword_unordered&q=Caf%C3%A9+%26+Co+%231",
      tiktok: "https://library.tiktok.com/ads?region=all&adv_name=Caf%C3%A9+%26+Co+%231",
      google: "https://adstransparency.google.com/?region=anywhere&domain=rival.example",
    });
  });

  it("opens the exact page and advertiser when the competitor has their ids", () => {
    expect(
      libraryLinks({
        ...cafe,
        meta_page_id: "123456789",
        google_advertiser_id: "AR01234567890123456789",
        tiktok_advertiser: "Rival Official",
      }),
    ).toEqual({
      meta: "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&media_type=all&search_type=page&view_all_page_id=123456789",
      tiktok: "https://library.tiktok.com/ads?region=all&adv_name=Rival+Official",
      google: "https://adstransparency.google.com/advertiser/AR01234567890123456789?region=anywhere",
    });
  });

  it("opens the Transparency Center's search when Google has neither an id nor a website", () => {
    expect(libraryLinks({ ...cafe, website: null }).google).toBe(
      "https://adstransparency.google.com/?region=anywhere",
    );
  });
});

describe("websiteHost and matchedSources", () => {
  it("shows a website as its host, without www", () => {
    expect(websiteHost("https://www.rival.example/shop")).toBe("rival.example");
    expect(websiteHost(null)).toBeNull();
    expect(websiteHost("not a url")).toBeNull();
  });

  it("marks only the sources with a direct match; TikTok always searches by name", () => {
    expect(matchedSources({ ...cafe, website: null })).toEqual(["TikTok"]);
    expect(matchedSources(cafe)).toEqual(["TikTok", "Google"]);
    expect(matchedSources({ ...cafe, meta_page_id: "1", website: null, google_advertiser_id: "AR0123456789" })).toEqual([
      "Meta",
      "TikTok",
      "Google",
    ]);
  });
});

describe("competitorWriteMessage", () => {
  it("names a duplicate in the person's words and passes other messages through", () => {
    expect(
      competitorWriteMessage(
        new Error('duplicate key value violates unique constraint "competitors_client_name_key"'),
        "Rival Co",
      ),
    ).toBe("This client already follows Rival Co.");
    expect(
      competitorWriteMessage(new Error("A client can follow up to 12 competitors."), "Rival Co"),
    ).toBe("A client can follow up to 12 competitors.");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/web && npx vitest run features/competitors/competitors-model.test.ts`
Expected: FAIL — `Failed to resolve import "./competitors-model"`.

- [ ] **Step 3: Write the model**

Create `apps/web/features/competitors/competitors-model.ts`:

```ts
import { z } from "@/lib/zod";

/** The database refuses a thirteenth competitor with the same number. */
export const MAX_COMPETITORS = 12;

export type Competitor = {
  id: string;
  client_id: string;
  name: string;
  website: string | null;
  meta_page_id: string | null;
  google_advertiser_id: string | null;
  tiktok_advertiser: string | null;
};

export type CompetitorInput = {
  name: string;
  website: string | null;
  metaPageId: string | null;
  googleAdvertiserId: string | null;
  tiktokAdvertiser: string | null;
};

export type CompetitorForm = {
  name: string;
  website: string;
  metaPageId: string;
  googleAdvertiserId: string;
  tiktokAdvertiser: string;
};

type CompetitorLinkFields = Pick<
  Competitor,
  "name" | "website" | "meta_page_id" | "google_advertiser_id" | "tiktok_advertiser"
>;

const blankToNull = (value: string) => (value === "" ? null : value);

function isWebsite(value: string) {
  if (/\s/.test(value)) return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

// Mirrors the database's check constraints, so the form explains a refusal before the write.
const competitorFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Add the competitor's name.")
    .max(80, "Keep the name to 80 characters."),
  website: z
    .string()
    .trim()
    .max(200, "Keep the website to 200 characters.")
    .refine(
      (value) => value === "" || isWebsite(value),
      "Enter a website that starts with http:// or https://.",
    )
    .transform(blankToNull),
  metaPageId: z
    .string()
    .trim()
    .regex(/^(\d{1,20})?$/, "A Facebook Page ID is only digits.")
    .transform(blankToNull),
  googleAdvertiserId: z
    .string()
    .trim()
    .regex(/^(AR\d{10,30})?$/, "A Google advertiser ID starts with AR, followed by digits.")
    .transform(blankToNull),
  tiktokAdvertiser: z
    .string()
    .trim()
    .max(80, "Keep the TikTok name to 80 characters.")
    .transform(blankToNull),
});

/** The first problem, worded for the form, or the input the data layer writes. */
export function parseCompetitorForm(
  form: CompetitorForm,
): { input: CompetitorInput } | { error: string } {
  const result = competitorFormSchema.safeParse(form);
  if (!result.success)
    return { error: result.error.issues[0]?.message ?? "Check the competitor's details." };
  return { input: result.data };
}

export type LibraryLinks = { meta: string; tiktok: string; google: string };

/** One link per official library, already filtered to the competitor. */
export function libraryLinks(competitor: CompetitorLinkFields): LibraryLinks {
  const meta = new URL("https://www.facebook.com/ads/library/");
  meta.search = new URLSearchParams({
    active_status: "active",
    ad_type: "all",
    country: "ALL",
    media_type: "all",
    ...(competitor.meta_page_id
      ? { search_type: "page", view_all_page_id: competitor.meta_page_id }
      : { search_type: "keyword_unordered", q: competitor.name }),
  }).toString();
  const tiktok = new URL("https://library.tiktok.com/ads");
  tiktok.search = new URLSearchParams({
    region: "all",
    adv_name: competitor.tiktok_advertiser ?? competitor.name,
  }).toString();
  const host = websiteHost(competitor.website);
  const google = new URL(
    competitor.google_advertiser_id
      ? `https://adstransparency.google.com/advertiser/${competitor.google_advertiser_id}`
      : "https://adstransparency.google.com/",
  );
  google.search = new URLSearchParams({
    region: "anywhere",
    ...(!competitor.google_advertiser_id && host ? { domain: host } : {}),
  }).toString();
  return { meta: meta.toString(), tiktok: tiktok.toString(), google: google.toString() };
}

export function websiteHost(website: string | null): string | null {
  if (!website) return null;
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** The sources whose link lands on this competitor exactly; TikTok's library searches by name. */
export function matchedSources(competitor: CompetitorLinkFields): ("Meta" | "TikTok" | "Google")[] {
  return [
    ...(competitor.meta_page_id ? (["Meta"] as const) : []),
    "TikTok",
    ...(competitor.google_advertiser_id || websiteHost(competitor.website)
      ? (["Google"] as const)
      : []),
  ];
}

/** The database's refusal, in the person's words where it has a better name for it. */
export function competitorWriteMessage(error: Error, name: string): string {
  if (error.message.includes("competitors_client_name_key"))
    return `This client already follows ${name}.`;
  return error.message;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd apps/web && npx vitest run features/competitors/competitors-model.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Gate and commit**

Run: `npm run check`
Expected: exit 0.

```bash
git add apps/web/features/competitors/competitors-model.ts apps/web/features/competitors/competitors-model.test.ts
git commit -m "feat(competitors): validate competitor details and build official ad library links"
```

---

### Task 3: Meta Ad Library adapter

**Files:**
- Create: `apps/web/features/competitors/meta-ad-library.ts`
- Test: `apps/web/features/competitors/meta-ad-library.test.ts`

**Interfaces:**
- Consumes: `z` from `@/lib/zod`.
- Produces:
  - `META_GRAPH_VERSION = "v26.0"`
  - `type CompetitorAd = { id: string; pageName: string; platforms: string[]; body: string | null; title: string | null; description: string | null; caption: string | null; startedOn: string | null; libraryUrl: string }`
  - `type CompetitorAdsResult = { status: "ready"; ads: CompetitorAd[]; fetchedAt: string } | { status: "not_configured" }`
  - `adLibraryCountries(value: string | undefined): string[]`
  - `adsArchiveUrl(input: { token: string; pageId: string | null; name: string; countries: string[] }): URL`
  - `parseAdsArchive(json: unknown): CompetitorAd[] | null`
  - `metaErrorMessage(json: unknown): string`
  - `type ResultCache<T> = { get(key: string): T | undefined; set(key: string, value: T): void }`
  - `createResultCache<T>(options: { ttlMs: number; max: number; now?: () => number }): ResultCache<T>`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/features/competitors/meta-ad-library.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  adLibraryCountries,
  adsArchiveUrl,
  createResultCache,
  metaErrorMessage,
  parseAdsArchive,
} from "./meta-ad-library";

describe("adLibraryCountries", () => {
  it("reads country codes and falls back to every country", () => {
    expect(adLibraryCountries(undefined)).toEqual(["ALL"]);
    expect(adLibraryCountries("")).toEqual(["ALL"]);
    expect(adLibraryCountries(" br, us ")).toEqual(["BR", "US"]);
    expect(adLibraryCountries("xx1, ,DE")).toEqual(["DE"]);
  });
});

describe("adsArchiveUrl", () => {
  it("asks for a page's active ads with a fixed field list and never the snapshot URL", () => {
    const url = adsArchiveUrl({ token: "secret", pageId: "123456789", name: "Rival Co", countries: ["ALL"] });
    expect(url.origin).toBe("https://graph.facebook.com");
    expect(url.pathname).toBe("/v26.0/ads_archive");
    expect(url.searchParams.get("search_page_ids")).toBe("[123456789]");
    expect(url.searchParams.has("search_terms")).toBe(false);
    expect(url.searchParams.get("ad_reached_countries")).toBe('["ALL"]');
    expect(url.searchParams.get("ad_active_status")).toBe("ACTIVE");
    expect(url.searchParams.get("ad_type")).toBe("ALL");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("access_token")).toBe("secret");
    expect(url.searchParams.get("fields")).not.toContain("ad_snapshot_url");
  });

  it("searches by name when the competitor has no page ID", () => {
    const url = adsArchiveUrl({ token: "secret", pageId: null, name: "Café & Co", countries: ["BR", "US"] });
    expect(url.searchParams.get("search_terms")).toBe("Café & Co");
    expect(url.searchParams.has("search_page_ids")).toBe(false);
    expect(url.searchParams.get("ad_reached_countries")).toBe('["BR","US"]');
  });
});

describe("parseAdsArchive", () => {
  it("maps each ad to what the screen shows, with a public Ad Library link", () => {
    expect(
      parseAdsArchive({
        data: [
          {
            id: "111",
            page_name: "Rival Co",
            publisher_platforms: ["facebook", "INSTAGRAM"],
            ad_creative_bodies: ["  ", "Autumn sale"],
            ad_creative_link_titles: ["Shop now"],
            ad_creative_link_descriptions: ["Free delivery"],
            ad_creative_link_captions: ["rival.example"],
            ad_delivery_start_time: "2026-09-03T07:00:00+0000",
            ad_snapshot_url: "https://www.facebook.com/ads/archive/render_ad/?id=111&access_token=secret",
          },
        ],
        paging: { cursors: { after: "x" } },
      }),
    ).toEqual([
      {
        id: "111",
        pageName: "Rival Co",
        platforms: ["Facebook", "Instagram"],
        body: "Autumn sale",
        title: "Shop now",
        description: "Free delivery",
        caption: "rival.example",
        startedOn: "2026-09-03",
        libraryUrl: "https://www.facebook.com/ads/library/?id=111",
      },
    ]);
  });

  it("keeps an ad with missing fields, with nulls instead of guesses", () => {
    expect(parseAdsArchive({ data: [{ id: "222", ad_delivery_start_time: "soon" }] })).toEqual([
      {
        id: "222",
        pageName: "",
        platforms: [],
        body: null,
        title: null,
        description: null,
        caption: null,
        startedOn: null,
        libraryUrl: "https://www.facebook.com/ads/library/?id=222",
      },
    ]);
  });

  it("refuses an answer it cannot read", () => {
    expect(parseAdsArchive({ unexpected: true })).toBeNull();
    expect(parseAdsArchive({ data: [{ id: "../evil" }] })).toBeNull();
    expect(parseAdsArchive(null)).toBeNull();
  });
});

describe("metaErrorMessage", () => {
  it.each([
    [{ error: { code: 190 } }, "The Meta Ad Library token has expired or was revoked. Renew it on the server."],
    [{ error: { code: 4 } }, "Meta is limiting requests right now. Try again in a few minutes."],
    [{ error: { code: 17 } }, "Meta is limiting requests right now. Try again in a few minutes."],
    [{ error: { code: 613 } }, "Meta is limiting requests right now. Try again in a few minutes."],
    [{ error: { code: 80004 } }, "Meta is limiting requests right now. Try again in a few minutes."],
    [{ error: { code: 10 } }, "Meta has not approved this token for the Ad Library API."],
    [{ error: { code: 200 } }, "Meta has not approved this token for the Ad Library API."],
    [{ error: { code: 1, error_subcode: 2332002 } }, "Meta has not approved this token for the Ad Library API."],
    [{ error: { code: 100 } }, "Meta refused the search. Check the server's Ad Library countries setting."],
    [{ error: { code: 1 } }, "Meta could not return ads right now. Try again."],
    [null, "Meta could not return ads right now. Try again."],
  ])("words %o for the person", (json, message) => {
    expect(metaErrorMessage(json)).toBe(message);
  });
});

describe("createResultCache", () => {
  it("returns an entry until it expires", () => {
    let now = 0;
    const cache = createResultCache<string>({ ttlMs: 1000, max: 10, now: () => now });
    cache.set("a", "one");
    now = 999;
    expect(cache.get("a")).toBe("one");
    now = 1000;
    expect(cache.get("a")).toBeUndefined();
  });

  it("drops the oldest entry beyond its size", () => {
    const cache = createResultCache<number>({ ttlMs: 1000, max: 2, now: () => 0 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/web && npx vitest run features/competitors/meta-ad-library.test.ts`
Expected: FAIL — `Failed to resolve import "./meta-ad-library"`.

- [ ] **Step 3: Write the adapter**

Create `apps/web/features/competitors/meta-ad-library.ts`:

```ts
import { z } from "@/lib/zod";

/**
 * Meta's official Ad Library API (`ads_archive`), used only on the server by the competitor ads
 * route. The token travels only in the request this module builds; nothing it returns carries it,
 * and `ad_snapshot_url` — which needs the token to load — is never requested.
 */
export const META_GRAPH_VERSION = "v26.0";

const FIELDS = [
  "id",
  "page_id",
  "page_name",
  "ad_creative_bodies",
  "ad_creative_link_titles",
  "ad_creative_link_descriptions",
  "ad_creative_link_captions",
  "ad_delivery_start_time",
  "publisher_platforms",
].join(",");

export type CompetitorAd = {
  id: string;
  pageName: string;
  platforms: string[];
  body: string | null;
  title: string | null;
  description: string | null;
  caption: string | null;
  startedOn: string | null;
  libraryUrl: string;
};

export type CompetitorAdsResult =
  | { status: "ready"; ads: CompetitorAd[]; fetchedAt: string }
  | { status: "not_configured" };

/** `META_AD_LIBRARY_COUNTRIES` as ISO codes; every country (`ALL`) when unset or unreadable. */
export function adLibraryCountries(value: string | undefined): string[] {
  const codes = (value ?? "")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^(ALL|[A-Z]{2})$/.test(code));
  return codes.length ? codes : ["ALL"];
}

export function adsArchiveUrl(input: {
  token: string;
  pageId: string | null;
  name: string;
  countries: string[];
}): URL {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/ads_archive`);
  // The page ID is digits (checked by the database), so it is safe inside the array literal.
  if (input.pageId) url.searchParams.set("search_page_ids", `[${input.pageId}]`);
  else url.searchParams.set("search_terms", input.name);
  url.searchParams.set("ad_reached_countries", JSON.stringify(input.countries));
  url.searchParams.set("ad_active_status", "ACTIVE");
  url.searchParams.set("ad_type", "ALL");
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("limit", "25");
  url.searchParams.set("access_token", input.token);
  return url;
}

const archiveSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().regex(/^\d{1,30}$/),
      page_name: z.string().optional(),
      publisher_platforms: z.array(z.string()).optional(),
      ad_creative_bodies: z.array(z.string()).optional(),
      ad_creative_link_titles: z.array(z.string()).optional(),
      ad_creative_link_descriptions: z.array(z.string()).optional(),
      ad_creative_link_captions: z.array(z.string()).optional(),
      ad_delivery_start_time: z.string().optional(),
    }),
  ),
});

const platformNames: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  audience_network: "Audience Network",
  threads: "Threads",
};

const firstText = (values: string[] | undefined) =>
  values?.map((value) => value.trim()).find(Boolean) ?? null;

/** The ads the screen shows, or null when Meta's answer is not the documented shape. */
export function parseAdsArchive(json: unknown): CompetitorAd[] | null {
  const parsed = archiveSchema.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data.data.map((ad) => ({
    id: ad.id,
    pageName: ad.page_name?.trim() ?? "",
    platforms: (ad.publisher_platforms ?? []).map(
      (platform) => platformNames[platform.toLowerCase()] ?? platform,
    ),
    body: firstText(ad.ad_creative_bodies),
    title: firstText(ad.ad_creative_link_titles),
    description: firstText(ad.ad_creative_link_descriptions),
    caption: firstText(ad.ad_creative_link_captions),
    startedOn: /^\d{4}-\d{2}-\d{2}/.test(ad.ad_delivery_start_time ?? "")
      ? ad.ad_delivery_start_time!.slice(0, 10)
      : null,
    libraryUrl: `https://www.facebook.com/ads/library/?id=${ad.id}`,
  }));
}

const errorSchema = z.object({
  error: z.object({ code: z.number().optional(), error_subcode: z.number().optional() }),
});

/** Meta's refusal in the person's words. Meta's own message is never passed on. */
export function metaErrorMessage(json: unknown): string {
  const parsed = errorSchema.safeParse(json);
  const code = parsed.success ? parsed.data.error.code : undefined;
  const subcode = parsed.success ? parsed.data.error.error_subcode : undefined;
  if (code === 190)
    return "The Meta Ad Library token has expired or was revoked. Renew it on the server.";
  if (code === 4 || code === 17 || code === 613 || code === 80004)
    return "Meta is limiting requests right now. Try again in a few minutes.";
  if (
    code === 10 ||
    subcode === 2332002 ||
    code === 2332002 ||
    (code !== undefined && code >= 200 && code < 300)
  )
    return "Meta has not approved this token for the Ad Library API.";
  if (code === 100) return "Meta refused the search. Check the server's Ad Library countries setting.";
  return "Meta could not return ads right now. Try again.";
}

export type ResultCache<T> = { get(key: string): T | undefined; set(key: string, value: T): void };

/** A small per-process cache, so repeated opens of one competitor do not spend the token's limit. */
export function createResultCache<T>(options: {
  ttlMs: number;
  max: number;
  now?: () => number;
}): ResultCache<T> {
  const entries = new Map<string, { expires: number; value: T }>();
  const now = options.now ?? Date.now;
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expires <= now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { expires: now() + options.ttlMs, value });
      while (entries.size > options.max) entries.delete(entries.keys().next().value!);
    },
  };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd apps/web && npx vitest run features/competitors/meta-ad-library.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Gate and commit**

Run: `npm run check`
Expected: exit 0.

```bash
git add apps/web/features/competitors/meta-ad-library.ts apps/web/features/competitors/meta-ad-library.test.ts
git commit -m "feat(competitors): add the Meta Ad Library request, mapping and error adapter"
```

---

### Task 4: The competitor ads route

**Files:**
- Create: `apps/web/features/competitors/competitor-ads-route.ts`
- Create: `apps/web/app/api/competitors/[id]/ads/route.ts`
- Test: `apps/web/features/competitors/competitor-ads-route.test.ts`

**Interfaces:**
- Consumes: Task 3's `adLibraryCountries`, `adsArchiveUrl`, `parseAdsArchive`, `metaErrorMessage`, `createResultCache`, `ResultCache`, `CompetitorAdsResult`.
- Produces:
  - `type CompetitorLookup = { kind: "found"; competitor: { name: string; meta_page_id: string | null } } | { kind: "hidden" } | { kind: "unauthenticated" } | { kind: "unavailable" }`
  - `type CompetitorAdsDependencies = { env: Record<string, string | undefined>; fetch: typeof fetch; lookup: (token: string, competitorId: string) => Promise<CompetitorLookup>; cache: ResultCache<CompetitorAdsResult>; now: () => Date }`
  - `competitorAdsResponse(request: Request, competitorId: string, deps: CompetitorAdsDependencies): Promise<Response>`
  - `supabaseCompetitorLookup(env: Record<string, string | undefined>): CompetitorAdsDependencies["lookup"]`
  - `GET /api/competitors/[id]/ads` → `200 CompetitorAdsResult` or `{ error: string }` with 400, 401, 403, 404, 502, 503 or 504.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/features/competitors/competitor-ads-route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/competitors/[id]/ads/route";
import { competitorAdsResponse, type CompetitorAdsDependencies } from "./competitor-ads-route";
import { createResultCache, type CompetitorAdsResult } from "./meta-ad-library";

const id = "0b6f4a8e-6c1d-4b8f-9a55-2f1f3c1d7e10";
const token = "meta-secret-token";
const metaAnswer = () =>
  Response.json({
    data: [
      {
        id: "111",
        page_name: "Rival Co",
        publisher_platforms: ["facebook", "instagram"],
        ad_creative_bodies: ["Autumn sale"],
        ad_delivery_start_time: "2026-09-03T07:00:00+0000",
        ad_snapshot_url: `https://www.facebook.com/ads/archive/render_ad/?id=111&access_token=${token}`,
      },
    ],
  });

function request(headers: Record<string, string> = { authorization: "Bearer session-token" }) {
  return new Request(`http://localhost:3003/api/competitors/${id}/ads`, { headers });
}

function deps(overrides: Partial<CompetitorAdsDependencies> = {}): CompetitorAdsDependencies {
  return {
    env: { META_AD_LIBRARY_ACCESS_TOKEN: token },
    fetch: vi.fn<typeof fetch>(async () => metaAnswer()),
    lookup: vi.fn<CompetitorAdsDependencies["lookup"]>(async () => ({
      kind: "found",
      competitor: { name: "Rival Co", meta_page_id: "123456789" },
    })),
    cache: createResultCache<CompetitorAdsResult>({ ttlMs: 60_000, max: 10 }),
    now: () => new Date("2026-09-24T06:00:00Z"),
    ...overrides,
  };
}

describe("competitorAdsResponse", () => {
  it("refuses an id that is not a UUID", async () => {
    expect((await competitorAdsResponse(request(), "not-an-id", deps())).status).toBe(400);
  });

  it("refuses a request from another origin", async () => {
    const response = await competitorAdsResponse(
      request({ authorization: "Bearer s", origin: "https://evil.example" }),
      id,
      deps({ env: { APP_ORIGIN: "http://localhost:3003", META_AD_LIBRARY_ACCESS_TOKEN: token } }),
    );
    expect(response.status).toBe(403);
  });

  it("asks for a session without a bearer token, and again when the session has expired", async () => {
    expect((await competitorAdsResponse(request({}), id, deps())).status).toBe(401);
    const response = await competitorAdsResponse(
      request(),
      id,
      deps({ lookup: vi.fn(async () => ({ kind: "unauthenticated" as const })) }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Your session has expired. Sign in again." });
  });

  it("answers 404 when row-level security hides the competitor, as it does from every client", async () => {
    const hidden = deps({ lookup: vi.fn(async () => ({ kind: "hidden" as const })) });
    const response = await competitorAdsResponse(request(), id, hidden);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "This competitor is not available." });
    expect(hidden.fetch).not.toHaveBeenCalled();
  });

  it("answers 503 when the server has no database configuration", async () => {
    const response = await competitorAdsResponse(
      request(),
      id,
      deps({ lookup: vi.fn(async () => ({ kind: "unavailable" as const })) }),
    );
    expect(response.status).toBe(503);
  });

  it("reports previews as off, without calling Meta, when the server has no token", async () => {
    const off = deps({ env: {} });
    const response = await competitorAdsResponse(request(), id, off);
    expect(await response.json()).toEqual({ status: "not_configured" });
    expect(off.fetch).not.toHaveBeenCalled();
  });

  it("returns the competitor's active ads and never the token or a snapshot URL", async () => {
    const ready = deps();
    const response = await competitorAdsResponse(request(), id, ready);
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      status: "ready",
      fetchedAt: "2026-09-24T06:00:00.000Z",
      ads: [
        {
          id: "111",
          pageName: "Rival Co",
          platforms: ["Facebook", "Instagram"],
          body: "Autumn sale",
          title: null,
          description: null,
          caption: null,
          startedOn: "2026-09-03",
          libraryUrl: "https://www.facebook.com/ads/library/?id=111",
        },
      ],
    });
    expect(text).not.toContain(token);
    expect(text).not.toContain("render_ad");
    const url = new URL(String(vi.mocked(ready.fetch).mock.calls[0][0]));
    expect(url.searchParams.get("search_page_ids")).toBe("[123456789]");
    expect(url.searchParams.get("ad_reached_countries")).toBe('["ALL"]');
  });

  it("searches by name when the competitor has no page ID", async () => {
    const byName = deps({
      lookup: vi.fn(async () => ({
        kind: "found" as const,
        competitor: { name: "Rival Co", meta_page_id: null },
      })),
    });
    await competitorAdsResponse(request(), id, byName);
    const url = new URL(String(vi.mocked(byName.fetch).mock.calls[0][0]));
    expect(url.searchParams.get("search_terms")).toBe("Rival Co");
  });

  it("answers a repeat request from the cache", async () => {
    const cached = deps();
    await competitorAdsResponse(request(), id, cached);
    const second = await competitorAdsResponse(request(), id, cached);
    expect(second.status).toBe(200);
    expect(cached.fetch).toHaveBeenCalledTimes(1);
  });

  it("words Meta's refusal for the person and keeps the token out of it", async () => {
    const refused = deps({
      fetch: vi.fn<typeof fetch>(async () =>
        Response.json(
          { error: { message: `Invalid OAuth access token ${token}`, code: 190 } },
          { status: 400 },
        ),
      ),
    });
    const response = await competitorAdsResponse(request(), id, refused);
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(JSON.parse(text)).toEqual({
      error: "The Meta Ad Library token has expired or was revoked. Renew it on the server.",
    });
    expect(text).not.toContain(token);
  });

  it("answers 504 when Meta does not answer in time", async () => {
    const slow = deps({
      fetch: vi.fn<typeof fetch>(async () => {
        throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
      }),
    });
    const response = await competitorAdsResponse(request(), id, slow);
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: "Meta did not answer in time. Try again." });
  });

  it("answers 502 for an answer it cannot read, and caches nothing", async () => {
    const odd = deps({ fetch: vi.fn<typeof fetch>(async () => Response.json({ unexpected: true })) });
    expect((await competitorAdsResponse(request(), id, odd)).status).toBe(502);
    expect((await competitorAdsResponse(request(), id, odd)).status).toBe(502);
    expect(odd.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("GET /api/competitors/[id]/ads", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reads the competitor as the caller and asks Meta with the server's token", async () => {
    vi.stubEnv("SUPABASE_INTERNAL_URL", "https://database.example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-key");
    vi.stubEnv("META_AD_LIBRARY_ACCESS_TOKEN", token);
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const outgoing = new Request(input, init);
        const url = new URL(outgoing.url);
        calls.push(`${url.host}${url.pathname}`);
        if (url.pathname === "/auth/v1/user")
          return Response.json({ id: "caller", email: "caller@example.test" });
        if (url.pathname === "/rest/v1/competitors") {
          expect(outgoing.headers.get("authorization")).toBe("Bearer caller-token");
          expect(url.searchParams.get("id")).toBe(`eq.${id}`);
          return Response.json([{ name: "Rival Co", meta_page_id: "123456789" }]);
        }
        if (url.host === "graph.facebook.com") return metaAnswer();
        throw new Error(`Unexpected request ${outgoing.url}`);
      }),
    );
    const response = await GET(
      new Request(`http://localhost:3003/api/competitors/${id}/ads`, {
        headers: { authorization: "Bearer caller-token" },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("ready");
    expect(calls).toEqual([
      "database.example.test/auth/v1/user",
      "database.example.test/rest/v1/competitors",
      "graph.facebook.com/v26.0/ads_archive",
    ]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/web && npx vitest run features/competitors/competitor-ads-route.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/api/competitors/[id]/ads/route"`.

- [ ] **Step 3: Write the handler**

Create `apps/web/features/competitors/competitor-ads-route.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@database";
import {
  adLibraryCountries,
  adsArchiveUrl,
  metaErrorMessage,
  parseAdsArchive,
  type CompetitorAdsResult,
  type ResultCache,
} from "./meta-ad-library";

/**
 * Server side of `GET /api/competitors/[id]/ads`. The competitor is read as the caller, so
 * row-level security decides who may ask (a client never can), and only then is Meta queried with
 * the server's own token. Kept apart from the route file so it can be tested with its
 * dependencies replaced.
 */
export type CompetitorLookup =
  | { kind: "found"; competitor: { name: string; meta_page_id: string | null } }
  | { kind: "hidden" }
  | { kind: "unauthenticated" }
  | { kind: "unavailable" };

export type CompetitorAdsDependencies = {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  lookup: (token: string, competitorId: string) => Promise<CompetitorLookup>;
  cache: ResultCache<CompetitorAdsResult>;
  now: () => Date;
};

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const TIMEOUT_MS = 10_000;
const failure = (error: string, status: number) => Response.json({ error }, { status });

export async function competitorAdsResponse(
  request: Request,
  competitorId: string,
  deps: CompetitorAdsDependencies,
): Promise<Response> {
  if (!UUID.test(competitorId)) return failure("Select a valid competitor.", 400);
  const origin = deps.env.APP_ORIGIN ?? new URL(request.url).origin;
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== origin)
    return failure("This request must come from your workspace.", 403);
  const session = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!session) return failure("Sign in to see competitor ads.", 401);

  const found = await deps.lookup(session, competitorId);
  if (found.kind === "unauthenticated")
    return failure("Your session has expired. Sign in again.", 401);
  if (found.kind === "unavailable")
    return failure("Competitor ads are not configured. Contact the workspace administrator.", 503);
  if (found.kind === "hidden") return failure("This competitor is not available.", 404);

  const token = deps.env.META_AD_LIBRARY_ACCESS_TOKEN?.trim();
  if (!token) return Response.json({ status: "not_configured" } satisfies CompetitorAdsResult);

  const countries = adLibraryCountries(deps.env.META_AD_LIBRARY_COUNTRIES);
  const { name, meta_page_id: pageId } = found.competitor;
  const key = `${competitorId}:${pageId ?? name}:${countries.join(",")}`;
  const cached = deps.cache.get(key);
  if (cached) return Response.json(cached);

  let answer: Response;
  try {
    answer = await deps.fetch(adsArchiveUrl({ token, pageId, name, countries }), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))
      return failure("Meta did not answer in time. Try again.", 504);
    return failure("Meta could not return ads right now. Try again.", 502);
  }
  const body: unknown = await answer.json().catch(() => null);
  if (!answer.ok) return failure(metaErrorMessage(body), 502);
  const ads = parseAdsArchive(body);
  if (!ads) return failure("Meta could not return ads right now. Try again.", 502);
  const result: CompetitorAdsResult = { status: "ready", ads, fetchedAt: deps.now().toISOString() };
  deps.cache.set(key, result);
  return Response.json(result);
}

/** Reads a competitor with the caller's own session, so their row-level security applies. */
export function supabaseCompetitorLookup(
  env: Record<string, string | undefined>,
): CompetitorAdsDependencies["lookup"] {
  return async (token, competitorId) => {
    const url = env.SUPABASE_INTERNAL_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
    const publicKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !publicKey) return { kind: "unavailable" };
    const caller = createClient<Database>(url, publicKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await caller.auth.getUser(token);
    if (error || !data.user) return { kind: "unauthenticated" };
    const competitor = await caller
      .from("competitors")
      .select("name, meta_page_id")
      .eq("id", competitorId)
      .maybeSingle();
    if (competitor.error || !competitor.data) return { kind: "hidden" };
    return { kind: "found", competitor: competitor.data };
  };
}
```

Create `apps/web/app/api/competitors/[id]/ads/route.ts`:

```ts
import {
  competitorAdsResponse,
  supabaseCompetitorLookup,
} from "@/features/competitors/competitor-ads-route";
import { createResultCache, type CompetitorAdsResult } from "@/features/competitors/meta-ad-library";

// One cache per server process: repeated opens of a competitor within 30 minutes reuse Meta's answer.
const cache = createResultCache<CompetitorAdsResult>({ ttlMs: 30 * 60_000, max: 100 });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return competitorAdsResponse(request, id, {
    env: process.env,
    fetch,
    lookup: supabaseCompetitorLookup(process.env),
    cache,
    now: () => new Date(),
  });
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd apps/web && npx vitest run features/competitors/competitor-ads-route.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Gate and commit**

Run: `npm run check`
Expected: exit 0.

```bash
git add apps/web/features/competitors/competitor-ads-route.ts apps/web/features/competitors/competitor-ads-route.test.ts "apps/web/app/api/competitors/[id]/ads/route.ts"
git commit -m "feat(competitors): serve Meta ad previews through a caller-checked server route"
```

---

### Task 5: Data access — competitors and the board widget placement

**Files:**
- Create: `apps/web/features/competitors/competitors-data.ts`
- Test: `apps/web/features/competitors/competitors-data.test.ts`
- Modify: `apps/web/features/board/board-data.ts` (append after `moveProjectPosition`)
- Test: `apps/web/features/board/board-data.test.ts` (append)

**Interfaces:**
- Consumes: Task 1's tables; Task 2's `Competitor`, `CompetitorInput`; Task 3's `CompetitorAdsResult`.
- Produces:
  - `competitorQueryKeys = ["competitors", "competitor-ads"] as const`, `useInvalidateCompetitors(): () => Promise<void>`
  - `useCompetitors(clientId: string, enabled?: boolean)` → query of `Competitor[]` (key `["competitors", userId, clientId]`)
  - `createCompetitor(database, input: { clientId: string } & CompetitorInput): Promise<{ id: string }>`
  - `updateCompetitor(database, input: { id: string } & CompetitorInput): Promise<{ id: string }>`
  - `deleteCompetitor(database, input: { id: string }): Promise<void>`
  - `fetchCompetitorAds(session: Session, competitorId: string): Promise<CompetitorAdsResult>`
  - `useCompetitorAds(competitorId: string)` → query of `CompetitorAdsResult` (key `["competitor-ads", userId, competitorId]`)
  - `type BoardWidgetKind = "competitor_ads"`, `useBoardWidgets(clientId: string, enabled: boolean)` → query of `BoardWidgetKind[]`
  - `addBoardWidget(database, input: { clientId: string; kind: BoardWidgetKind }): Promise<void>`
  - `removeBoardWidget(database, input: { clientId: string; kind: BoardWidgetKind }): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/features/competitors/competitors-data.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import {
  createCompetitor,
  deleteCompetitor,
  fetchCompetitorAds,
  updateCompetitor,
} from "./competitors-data";

const input = {
  name: "Rival Co",
  website: "https://rival.example",
  metaPageId: "123456789",
  googleAdvertiserId: null,
  tiktokAdvertiser: null,
};
const columns = {
  name: "Rival Co",
  website: "https://rival.example",
  meta_page_id: "123456789",
  google_advertiser_id: null,
  tiktok_advertiser: null,
};

function chain(result: { data: unknown; error: { message: string } | null }) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ single });
  const eq = vi.fn().mockReturnValue({ select });
  const insert = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  const remove = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ insert, update, delete: remove });
  return { from, insert, update, remove, eq, select, single };
}

describe("competitor writes", () => {
  it("adds a competitor to a client with the database's column names", async () => {
    const database = chain({ data: { id: "c1" }, error: null });
    expect(await createCompetitor(database as never, { clientId: "client-1", ...input })).toEqual({
      id: "c1",
    });
    expect(database.from).toHaveBeenCalledWith("competitors");
    expect(database.insert).toHaveBeenCalledWith({ client_id: "client-1", ...columns });
  });

  it("edits a competitor by id without moving it to another client", async () => {
    const database = chain({ data: { id: "c1" }, error: null });
    await updateCompetitor(database as never, { id: "c1", ...input });
    expect(database.update).toHaveBeenCalledWith(columns);
    expect(database.eq).toHaveBeenCalledWith("id", "c1");
  });

  it("removes a competitor and reports a removal the database refused", async () => {
    const database = chain({ data: { id: "c1" }, error: null });
    await deleteCompetitor(database as never, { id: "c1" });
    expect(database.remove).toHaveBeenCalled();
    expect(database.eq).toHaveBeenCalledWith("id", "c1");
    const refused = chain({ data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } });
    await expect(deleteCompetitor(refused as never, { id: "c1" })).rejects.toThrow();
  });
});

describe("fetchCompetitorAds", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks the server route with the session's bearer token", async () => {
    const fetchMock = vi.fn(async () => Response.json({ status: "not_configured" }));
    vi.stubGlobal("fetch", fetchMock);
    const session = { access_token: "session-token" } as Session;
    expect(await fetchCompetitorAds(session, "c1")).toEqual({ status: "not_configured" });
    expect(fetchMock).toHaveBeenCalledWith("/api/competitors/c1/ads", {
      headers: { Authorization: "Bearer session-token" },
    });
  });

  it("surfaces the route's own message when it refuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "Your session has expired. Sign in again." }, { status: 401 }),
      ),
    );
    await expect(
      fetchCompetitorAds({ access_token: "old" } as Session, "c1"),
    ).rejects.toThrow("Your session has expired. Sign in again.");
  });
});
```

Append to `apps/web/features/board/board-data.test.ts` (and add `addBoardWidget, removeBoardWidget` to its import from `./board-data`):

```ts
describe("board widget placement", () => {
  it("places a widget for a client", async () => {
    const single = vi.fn().mockResolvedValue({ data: { kind: "competitor_ads" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const database = { from: vi.fn().mockReturnValue({ insert }) };
    await addBoardWidget(database as never, { clientId: "client-1", kind: "competitor_ads" });
    expect(database.from).toHaveBeenCalledWith("client_board_widgets");
    expect(insert).toHaveBeenCalledWith({ client_id: "client-1", kind: "competitor_ads" });
  });

  it("removes a client's widget and reports a removal the database refused", async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: "No widget" } });
    const select = vi.fn().mockReturnValue({ single });
    const kindFilter = vi.fn().mockReturnValue({ select });
    const clientFilter = vi.fn().mockReturnValue({ eq: kindFilter });
    const database = { from: vi.fn().mockReturnValue({ delete: vi.fn().mockReturnValue({ eq: clientFilter }) }) };
    await expect(
      removeBoardWidget(database as never, { clientId: "client-1", kind: "competitor_ads" }),
    ).rejects.toThrow("No widget");
    expect(clientFilter).toHaveBeenCalledWith("client_id", "client-1");
    expect(kindFilter).toHaveBeenCalledWith("kind", "competitor_ads");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/web && npx vitest run features/competitors/competitors-data.test.ts features/board/board-data.test.ts`
Expected: FAIL — `Failed to resolve import "./competitors-data"` and `addBoardWidget is not a function`.

- [ ] **Step 3: Write the competitors data layer**

Create `apps/web/features/competitors/competitors-data.ts`:

```ts
"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult, type SupabaseDatabase } from "@/lib/supabase";
import type { Competitor, CompetitorInput } from "./competitors-model";
import type { CompetitorAdsResult } from "./meta-ad-library";

/**
 * Supabase access for the competitors a client's studio team follows, and the server route that
 * previews their Meta ads. Row-level security returns nothing to a client, so these reads are also
 * disabled for one rather than sent and emptied.
 */
export const competitorQueryKeys = ["competitors", "competitor-ads"] as const;

export function useInvalidateCompetitors() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      competitorQueryKeys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
}

const COMPETITOR_COLUMNS =
  "id, client_id, name, website, meta_page_id, google_advertiser_id, tiktok_advertiser";

export function useCompetitors(clientId: string, enabled = true) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["competitors", session?.user.id, clientId],
    enabled: enabled && !!session,
    queryFn: async () =>
      assertResult(
        await database
          .from("competitors")
          .select(COMPETITOR_COLUMNS)
          .eq("client_id", clientId)
          .order("name"),
      ) as Competitor[],
  });
}

function columns(input: CompetitorInput) {
  return {
    name: input.name,
    website: input.website,
    meta_page_id: input.metaPageId,
    google_advertiser_id: input.googleAdvertiserId,
    tiktok_advertiser: input.tiktokAdvertiser,
  };
}

export async function createCompetitor(
  database: SupabaseDatabase,
  input: { clientId: string } & CompetitorInput,
) {
  return assertResult<{ id: string }>(
    await database
      .from("competitors")
      .insert({ client_id: input.clientId, ...columns(input) })
      .select("id")
      .single(),
  );
}

export async function updateCompetitor(
  database: SupabaseDatabase,
  input: { id: string } & CompetitorInput,
) {
  return assertResult<{ id: string }>(
    await database.from("competitors").update(columns(input)).eq("id", input.id).select("id").single(),
  );
}

/** Asks for the removed row back, so a removal row-level security refused fails loudly. */
export async function deleteCompetitor(database: SupabaseDatabase, input: { id: string }) {
  assertResult(
    await database.from("competitors").delete().eq("id", input.id).select("id").single(),
  );
}

export async function fetchCompetitorAds(
  session: Session,
  competitorId: string,
): Promise<CompetitorAdsResult> {
  const response = await fetch(`/api/competitors/${competitorId}/ads`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const body = (await response.json().catch(() => ({}))) as CompetitorAdsResult & {
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? "Competitor ads could not be loaded.");
  return body;
}

export function useCompetitorAds(competitorId: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["competitor-ads", session?.user.id, competitorId],
    enabled: !!session,
    // The server caches Meta's answer for 30 minutes; the screen need not ask more often than 10.
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: () => fetchCompetitorAds(session!, competitorId),
  });
}
```

- [ ] **Step 4: Add the board widget placement**

Append to `apps/web/features/board/board-data.ts`:

```ts
export type BoardWidgetKind = "competitor_ads";

/**
 * The widgets the studio placed on this client's board. Only the studio side can read them, so the
 * board disables this read for a client instead of sending it.
 */
export function useBoardWidgets(clientId: string, enabled: boolean) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["board-widgets", session?.user.id, clientId],
    enabled: enabled && !!session,
    queryFn: async () =>
      (
        assertResult(
          await database.from("client_board_widgets").select("kind").eq("client_id", clientId),
        ) as { kind: BoardWidgetKind }[]
      ).map((row) => row.kind),
  });
}

export async function addBoardWidget(
  database: SupabaseDatabase,
  input: { clientId: string; kind: BoardWidgetKind },
) {
  assertResult(
    await database
      .from("client_board_widgets")
      .insert({ client_id: input.clientId, kind: input.kind })
      .select("kind")
      .single(),
  );
}

export async function removeBoardWidget(
  database: SupabaseDatabase,
  input: { clientId: string; kind: BoardWidgetKind },
) {
  assertResult(
    await database
      .from("client_board_widgets")
      .delete()
      .eq("client_id", input.clientId)
      .eq("kind", input.kind)
      .select("kind")
      .single(),
  );
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd apps/web && npx vitest run features/competitors/competitors-data.test.ts features/board/board-data.test.ts`
Expected: PASS.

- [ ] **Step 6: Gate and commit**

Run: `npm run check`
Expected: exit 0. (If `board-page.test.tsx` fails because its `./board-data` mock lacks the new exports, that is Task 8's work; it should not fail yet because nothing imports them.)

```bash
git add apps/web/features/competitors/competitors-data.ts apps/web/features/competitors/competitors-data.test.ts apps/web/features/board/board-data.ts apps/web/features/board/board-data.test.ts
git commit -m "feat(competitors): add competitor and board widget data access"
```

---

### Task 6: The competitor form and the competitor screen

**Files:**
- Create: `apps/web/features/competitors/competitor-form.tsx`
- Create: `apps/web/features/competitors/competitor-screen.tsx`
- Create: `apps/web/features/competitors/competitors.css`
- Test: `apps/web/features/competitors/competitor-form.test.tsx`
- Test: `apps/web/features/competitors/competitor-screen.test.tsx`

**Interfaces:**
- Consumes: Task 2's `parseCompetitorForm`, `competitorWriteMessage`, `libraryLinks`, `websiteHost`, `Competitor`; Task 5's `createCompetitor`, `updateCompetitor`, `deleteCompetitor`, `useCompetitorAds`, `useInvalidateCompetitors`; `Modal`, `FormError`, `useDateFormat`.
- Produces:
  - `CompetitorForm({ clientId: string; competitor?: Competitor; onClose: () => void })`
  - `CompetitorScreen({ competitor: Competitor; canEdit: boolean; onEdit: () => void; onClose: () => void })`

- [ ] **Step 1: Write the failing form tests**

Create `apps/web/features/competitors/competitor-form.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompetitorForm } from "./competitor-form";

const backend = vi.hoisted(() => ({
  createCompetitor: vi.fn(),
  updateCompetitor: vi.fn(),
  invalidate: vi.fn(async () => undefined),
}));
vi.mock("./competitors-data", () => ({
  createCompetitor: backend.createCompetitor,
  updateCompetitor: backend.updateCompetitor,
  useInvalidateCompetitors: () => backend.invalidate,
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: { name: "database" }, profile: { role: "agency" } }),
}));

function renderForm(props: Partial<Parameters<typeof CompetitorForm>[0]> = {}) {
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CompetitorForm clientId="client-1" onClose={onClose} {...props} />
    </QueryClientProvider>,
  );
  return { onClose };
}

beforeEach(() => vi.clearAllMocks());

describe("CompetitorForm", () => {
  it("adds a competitor with trimmed values and closes", async () => {
    backend.createCompetitor.mockResolvedValue({ id: "c1" });
    const { onClose } = renderForm();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "  Rival Co ");
    await user.type(screen.getByLabelText(/Website/), "https://rival.example");
    await user.type(screen.getByLabelText(/Facebook Page ID/), "123456789");
    await user.click(screen.getByRole("button", { name: "Add competitor" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(backend.createCompetitor).toHaveBeenCalledWith(
      { name: "database" },
      {
        clientId: "client-1",
        name: "Rival Co",
        website: "https://rival.example",
        metaPageId: "123456789",
        googleAdvertiserId: null,
        tiktokAdvertiser: null,
      },
    );
    expect(backend.invalidate).toHaveBeenCalled();
  });

  it("explains a malformed field before writing anything", async () => {
    renderForm();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "Rival Co");
    await user.type(screen.getByLabelText(/Google advertiser ID/), "CR123");
    await user.click(screen.getByRole("button", { name: "Add competitor" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A Google advertiser ID starts with AR, followed by digits.",
    );
    expect(backend.createCompetitor).not.toHaveBeenCalled();
  });

  it("names a duplicate in the person's words and keeps the form open", async () => {
    backend.createCompetitor.mockRejectedValue(
      new Error('duplicate key value violates unique constraint "competitors_client_name_key"'),
    );
    const { onClose } = renderForm();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "Rival Co");
    await user.click(screen.getByRole("button", { name: "Add competitor" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This client already follows Rival Co.");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("edits an existing competitor in place", async () => {
    backend.updateCompetitor.mockResolvedValue({ id: "c1" });
    const { onClose } = renderForm({
      competitor: {
        id: "c1",
        client_id: "client-1",
        name: "Rival Co",
        website: null,
        meta_page_id: null,
        google_advertiser_id: null,
        tiktok_advertiser: "Rival Official",
      },
    });
    const user = userEvent.setup();
    expect(screen.getByLabelText("Name")).toHaveValue("Rival Co");
    expect(screen.getByLabelText(/TikTok advertiser name/)).toHaveValue("Rival Official");
    await user.clear(screen.getByLabelText(/TikTok advertiser name/));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(backend.updateCompetitor).toHaveBeenCalledWith(
      { name: "database" },
      {
        id: "c1",
        name: "Rival Co",
        website: null,
        metaPageId: null,
        googleAdvertiserId: null,
        tiktokAdvertiser: null,
      },
    );
  });
});
```

- [ ] **Step 2: Write the failing screen tests**

Create `apps/web/features/competitors/competitor-screen.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompetitorScreen } from "./competitor-screen";
import type { Competitor } from "./competitors-model";

const backend = vi.hoisted(() => ({
  ads: {} as Record<string, unknown>,
  deleteCompetitor: vi.fn(),
  invalidate: vi.fn(async () => undefined),
}));
vi.mock("./competitors-data", () => ({
  useCompetitorAds: () => backend.ads,
  deleteCompetitor: backend.deleteCompetitor,
  useInvalidateCompetitors: () => backend.invalidate,
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: { name: "database" }, profile: { role: "agency" } }),
}));
vi.mock("@/features/workspace/workspace-data", () => ({
  useDateFormat: () => ({ formatDate: (date: string | null) => `on ${date}` }),
}));

const rival: Competitor = {
  id: "c1",
  client_id: "client-1",
  name: "Rival Co",
  website: "https://www.rival.example",
  meta_page_id: "123456789",
  google_advertiser_id: null,
  tiktok_advertiser: null,
};

function renderScreen(props: Partial<Parameters<typeof CompetitorScreen>[0]> = {}) {
  const onClose = vi.fn();
  const onEdit = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CompetitorScreen competitor={rival} canEdit onEdit={onEdit} onClose={onClose} {...props} />
    </QueryClientProvider>,
  );
  return { onClose, onEdit };
}

beforeEach(() => {
  vi.clearAllMocks();
  backend.ads = { isPending: false, error: null, data: { status: "not_configured" }, refetch: vi.fn() };
});

describe("CompetitorScreen libraries", () => {
  it("links each official library in a new tab", async () => {
    renderScreen();
    const user = userEvent.setup();
    const meta = screen.getByRole("link", { name: "Open in Meta Ad Library" });
    expect(meta).toHaveAttribute(
      "href",
      "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&media_type=all&search_type=page&view_all_page_id=123456789",
    );
    expect(meta).toHaveAttribute("target", "_blank");
    expect(meta).toHaveAttribute("rel", "noopener noreferrer");
    await user.click(screen.getByRole("button", { name: "TikTok" }));
    expect(screen.getByRole("link", { name: "Open in TikTok Ad Library" })).toHaveAttribute(
      "href",
      "https://library.tiktok.com/ads?region=all&adv_name=Rival+Co",
    );
    expect(screen.getByText("TikTok's library covers ads shown in the EU, the UK and Switzerland.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Google" }));
    expect(
      screen.getByRole("link", { name: "Open in Google Ads Transparency Center" }),
    ).toHaveAttribute("href", "https://adstransparency.google.com/?region=anywhere&domain=rival.example");
  });

  it("asks for a website or advertiser ID when Google has neither", async () => {
    renderScreen({ competitor: { ...rival, website: null } });
    await userEvent.setup().click(screen.getByRole("button", { name: "Google" }));
    expect(
      screen.getByText("Add the competitor's website or Google advertiser ID for a direct link."),
    ).toBeInTheDocument();
  });
});

describe("CompetitorScreen Meta previews", () => {
  it("says previews are off, and tells only the agency how to turn them on", () => {
    renderScreen();
    expect(screen.getByText(/In-app previews are off\. The Ad Library shows every active ad\./)).toHaveTextContent(
      "Add a Meta Ad Library token on the server to preview ads here.",
    );
  });

  it("keeps the setup hint from a designer", () => {
    renderScreen({ canEdit: false });
    expect(screen.getByText(/In-app previews are off/)).not.toHaveTextContent("token");
  });

  it("shows loading, then explains an empty answer", () => {
    backend.ads = { isPending: true, error: null, data: undefined, refetch: vi.fn() };
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <CompetitorScreen competitor={rival} canEdit onEdit={vi.fn()} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading ads from Meta…");
    unmount();
    backend.ads = { isPending: false, error: null, data: { status: "ready", ads: [], fetchedAt: "" }, refetch: vi.fn() };
    renderScreen();
    expect(screen.getByText(/Meta's API returned no active ads for this competitor\./)).toBeInTheDocument();
  });

  it("renders only the parts an ad has, each with its Ad Library link", () => {
    backend.ads = {
      isPending: false,
      error: null,
      refetch: vi.fn(),
      data: {
        status: "ready",
        fetchedAt: "2026-09-24T06:00:00.000Z",
        ads: [
          {
            id: "111",
            pageName: "Rival Co",
            platforms: ["Facebook", "Instagram"],
            body: "Autumn sale",
            title: "Shop now",
            description: null,
            caption: "rival.example",
            startedOn: "2026-09-03",
            libraryUrl: "https://www.facebook.com/ads/library/?id=111",
          },
          {
            id: "222",
            pageName: "",
            platforms: [],
            body: null,
            title: null,
            description: null,
            caption: null,
            startedOn: null,
            libraryUrl: "https://www.facebook.com/ads/library/?id=222",
          },
        ],
      },
    };
    renderScreen();
    const [full, bare] = within(screen.getByRole("list", { name: "Rival Co ads from Meta" })).getAllByRole("listitem");
    expect(full).toHaveTextContent("Facebook · Instagram");
    expect(full).toHaveTextContent("Running since on 2026-09-03");
    expect(full).toHaveTextContent("Autumn sale");
    expect(full).toHaveTextContent("Shop now · rival.example");
    expect(within(full).getByRole("link", { name: "View in Ad Library" })).toHaveAttribute(
      "href",
      "https://www.facebook.com/ads/library/?id=111",
    );
    expect(bare).toHaveTextContent("Rival Co");
    expect(bare).not.toHaveTextContent("Running since");
    expect(bare).not.toHaveTextContent("undefined");
    expect(bare.querySelectorAll("p")).toHaveLength(0);
  });

  it("shows a failed preview's message with Try again, and keeps the library link", async () => {
    const refetch = vi.fn();
    backend.ads = { isPending: false, error: new Error("Your session has expired. Sign in again."), data: undefined, refetch };
    renderScreen();
    expect(screen.getByRole("alert")).toHaveTextContent("Your session has expired. Sign in again.");
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Open in Meta Ad Library" })).toBeInTheDocument();
  });
});

describe("CompetitorScreen actions", () => {
  it("lets the agency edit, and remove after confirming", async () => {
    backend.deleteCompetitor.mockResolvedValue(undefined);
    const { onClose, onEdit } = renderScreen();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove competitor" }));
    expect(screen.getByText("Remove Rival Co from this client's competitors?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(backend.deleteCompetitor).toHaveBeenCalledWith({ name: "database" }, { id: "c1" });
    expect(backend.invalidate).toHaveBeenCalled();
  });

  it("gives a designer no edit or removal", () => {
    renderScreen({ canEdit: false });
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove competitor" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd apps/web && npx vitest run features/competitors/competitor-form.test.tsx features/competitors/competitor-screen.test.tsx`
Expected: FAIL — `Failed to resolve import "./competitor-form"` and `"./competitor-screen"`.

- [ ] **Step 4: Write the form**

Create `apps/web/features/competitors/competitor-form.tsx`:

```tsx
"use client";

import { useMutation } from "@tanstack/react-query";
import { useId } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { FormError } from "@/features/shared/form-error";
import { Modal } from "@/features/shared/modal";
import { createCompetitor, updateCompetitor, useInvalidateCompetitors } from "./competitors-data";
import { competitorWriteMessage, parseCompetitorForm, type Competitor } from "./competitors-model";

/** Adds a competitor to a client, or edits one; validation and trimming happen here. */
export function CompetitorForm({
  clientId,
  competitor,
  onClose,
}: {
  clientId: string;
  competitor?: Competitor;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const invalidate = useInvalidateCompetitors();
  const hints = useId();
  const save = useMutation({
    mutationFn: async (form: FormData) => {
      const parsed = parseCompetitorForm({
        name: String(form.get("name") ?? ""),
        website: String(form.get("website") ?? ""),
        metaPageId: String(form.get("metaPageId") ?? ""),
        googleAdvertiserId: String(form.get("googleAdvertiserId") ?? ""),
        tiktokAdvertiser: String(form.get("tiktokAdvertiser") ?? ""),
      });
      if ("error" in parsed) throw new Error(parsed.error);
      try {
        return competitor
          ? await updateCompetitor(database, { id: competitor.id, ...parsed.input })
          : await createCompetitor(database, { clientId, ...parsed.input });
      } catch (error) {
        throw new Error(competitorWriteMessage(error as Error, parsed.input.name));
      }
    },
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });
  return (
    <Modal
      open
      title={competitor ? "Edit competitor" : "Add competitor"}
      description="Links and previews come from each platform's official ad library."
      closeDisabled={save.isPending}
      onClose={() => {
        if (!save.isPending) onClose();
      }}
    >
      <form
        className="stack-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(new FormData(event.currentTarget));
        }}
      >
        <label>
          Name
          <input name="name" maxLength={80} autoComplete="off" defaultValue={competitor?.name} />
        </label>
        <label>
          Website <span className="muted">(optional)</span>
          <input
            name="website"
            type="url"
            maxLength={200}
            placeholder="https://"
            defaultValue={competitor?.website ?? ""}
          />
        </label>
        <label>
          Facebook Page ID <span className="muted">(optional)</span>
          <input
            name="metaPageId"
            inputMode="numeric"
            maxLength={20}
            aria-describedby={`${hints}-meta`}
            defaultValue={competitor?.meta_page_id ?? ""}
          />
          <small id={`${hints}-meta`}>
            The number after view_all_page_id= in the page&apos;s Ad Library link.
          </small>
        </label>
        <label>
          Google advertiser ID <span className="muted">(optional)</span>
          <input
            name="googleAdvertiserId"
            maxLength={32}
            aria-describedby={`${hints}-google`}
            defaultValue={competitor?.google_advertiser_id ?? ""}
          />
          <small id={`${hints}-google`}>
            From the advertiser&apos;s page in the Ads Transparency Center.
          </small>
        </label>
        <label>
          TikTok advertiser name <span className="muted">(optional)</span>
          <input
            name="tiktokAdvertiser"
            maxLength={80}
            aria-describedby={`${hints}-tiktok`}
            defaultValue={competitor?.tiktok_advertiser ?? ""}
          />
          <small id={`${hints}-tiktok`}>Leave empty to search by the competitor&apos;s name.</small>
        </label>
        {save.error && <FormError>{save.error.message}</FormError>}
        <div className="form-actions">
          <button className="button" type="button" disabled={save.isPending} onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={save.isPending}>
            {competitor ? "Save changes" : "Add competitor"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 5: Write the screen**

Create `apps/web/features/competitors/competitor-screen.tsx`:

```tsx
"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { FormError } from "@/features/shared/form-error";
import { Modal } from "@/features/shared/modal";
import { useDateFormat } from "@/features/workspace/workspace-data";
import { deleteCompetitor, useCompetitorAds, useInvalidateCompetitors } from "./competitors-data";
import { libraryLinks, websiteHost, type Competitor } from "./competitors-model";

type Library = "meta" | "tiktok" | "google";
const libraries: { id: Library; label: string }[] = [
  { id: "meta", label: "Facebook & Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "google", label: "Google" },
];

/** One competitor's ads: a tab per official library, each with its direct link. */
export function CompetitorScreen({
  competitor,
  canEdit,
  onEdit,
  onClose,
}: {
  competitor: Competitor;
  canEdit: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const invalidate = useInvalidateCompetitors();
  const [library, setLibrary] = useState<Library>("meta");
  const [confirming, setConfirming] = useState(false);
  const links = libraryLinks(competitor);
  const remove = useMutation({
    mutationFn: () => deleteCompetitor(database, { id: competitor.id }),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });
  return (
    <Modal
      open
      size="lg"
      title={competitor.name}
      description={websiteHost(competitor.website) ?? undefined}
      closeDisabled={remove.isPending}
      onClose={() => {
        if (!remove.isPending) onClose();
      }}
      footer={
        canEdit ? (
          <div className="competitor-screen-actions">
            {confirming ? (
              <>
                <span>Remove {competitor.name} from this client&apos;s competitors?</span>
                <span className="competitor-screen-confirm">
                  <button
                    className="button"
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => setConfirming(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="button primary"
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate()}
                  >
                    Remove
                  </button>
                </span>
              </>
            ) : (
              <>
                <button className="button quiet" type="button" onClick={() => setConfirming(true)}>
                  Remove competitor
                </button>
                <button className="button" type="button" onClick={onEdit}>
                  Edit
                </button>
              </>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="segmented-control competitor-screen-tabs" role="group" aria-label="Ad library">
        {libraries.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={library === item.id}
            onClick={() => setLibrary(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {remove.error && <FormError>{remove.error.message}</FormError>}
      {library === "meta" ? (
        <MetaLibrary competitor={competitor} href={links.meta} canEdit={canEdit} />
      ) : library === "tiktok" ? (
        <div className="competitor-library">
          <LibraryLink href={links.tiktok}>Open in TikTok Ad Library</LibraryLink>
          <p className="competitor-note">
            TikTok&apos;s library covers ads shown in the EU, the UK and Switzerland.
          </p>
        </div>
      ) : (
        <div className="competitor-library">
          <LibraryLink href={links.google}>Open in Google Ads Transparency Center</LibraryLink>
          {!competitor.google_advertiser_id && !websiteHost(competitor.website) && (
            <p className="competitor-note">
              Add the competitor&apos;s website or Google advertiser ID for a direct link.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

function LibraryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="button" href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <ArrowUpRight size={15} aria-hidden="true" />
    </a>
  );
}

function MetaLibrary({
  competitor,
  href,
  canEdit,
}: {
  competitor: Competitor;
  href: string;
  canEdit: boolean;
}) {
  const ads = useCompetitorAds(competitor.id);
  const { formatDate } = useDateFormat();
  return (
    <div className="competitor-library">
      <LibraryLink href={href}>Open in Meta Ad Library</LibraryLink>
      {ads.isPending ? (
        <p className="competitor-note" role="status">
          Loading ads from Meta…
        </p>
      ) : ads.error ? (
        <FormError>
          {ads.error.message}{" "}
          <button type="button" className="button quiet" onClick={() => void ads.refetch()}>
            Try again
          </button>
        </FormError>
      ) : ads.data.status === "not_configured" ? (
        <p className="competitor-note">
          In-app previews are off. The Ad Library shows every active ad.
          {canEdit ? " Add a Meta Ad Library token on the server to preview ads here." : ""}
        </p>
      ) : ads.data.ads.length === 0 ? (
        <p className="competitor-note">
          Meta&apos;s API returned no active ads for this competitor. It lists ordinary ads only where
          they reached the EU; the Ad Library shows every active ad.
        </p>
      ) : (
        <ul className="competitor-ads" aria-label={`${competitor.name} ads from Meta`}>
          {ads.data.ads.map((ad) => (
            <li className="competitor-ad" key={ad.id}>
              <header>
                <strong>{ad.pageName || competitor.name}</strong>
                {ad.platforms.length > 0 && <span>{ad.platforms.join(" · ")}</span>}
              </header>
              {ad.startedOn && (
                <p className="competitor-ad-meta">Running since {formatDate(ad.startedOn)}</p>
              )}
              {ad.body && <p className="competitor-ad-body">{ad.body}</p>}
              {(ad.title || ad.caption) && (
                <p className="competitor-ad-meta">
                  {[ad.title, ad.caption].filter(Boolean).join(" · ")}
                </p>
              )}
              <a href={ad.libraryUrl} target="_blank" rel="noopener noreferrer">
                View in Ad Library
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Write the feature stylesheet**

Create `apps/web/features/competitors/competitors.css`:

```css
/* Competitor ads: the board widget frame, its tiles, and the competitor screen. */
.competitor-widget {
  height: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: #f6f5f4;
  pointer-events: auto;
}
.competitor-widget-head {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 52px;
  padding: 0 12px 0 18px;
  color: var(--muted);
}
.competitor-widget-head h2 {
  color: var(--foreground);
  font-size: 14px;
}
.competitor-widget-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.competitor-widget-note {
  font-size: var(--text-sm);
}
.competitor-widget-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 88px;
  margin: 0 20px;
  padding: 0 16px;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  color: var(--muted);
  font-size: var(--text-base);
}
.competitor-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0 20px;
  list-style: none;
}
.competitor-tile {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  column-gap: 10px;
  align-content: center;
  width: 100%;
  height: 88px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  text-align: left;
  cursor: pointer;
}
.competitor-tile:hover {
  border-color: #b9b9b1;
}
.competitor-initial {
  grid-row: span 3;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #e6ebe4;
  color: #3d4a3d;
  font-weight: 600;
}
.competitor-tile strong,
.competitor-host,
.competitor-sources {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.competitor-tile strong {
  color: var(--foreground);
  font-size: 14px;
  font-weight: 500;
}
.competitor-host,
.competitor-sources {
  color: var(--muted);
  font-size: var(--text-sm);
}
.competitor-screen-tabs {
  width: fit-content;
  max-width: 100%;
  margin-bottom: 16px;
}
.competitor-library {
  display: grid;
  gap: 14px;
}
.competitor-library > .button {
  justify-self: start;
}
.competitor-note {
  color: var(--muted);
  font-size: var(--text-base);
  line-height: 1.6;
}
.competitor-ads {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.competitor-ad {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: var(--text-base);
}
.competitor-ad header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--muted);
  font-size: var(--text-sm);
}
.competitor-ad header strong {
  color: var(--foreground);
  font-weight: 500;
}
.competitor-ad-body {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
  line-height: 1.6;
  overflow-wrap: anywhere;
  white-space: pre-line;
}
.competitor-ad-meta {
  color: var(--muted);
  font-size: var(--text-sm);
}
.competitor-screen-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
}
.competitor-screen-confirm {
  display: flex;
  gap: 8px;
}
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `cd apps/web && npx vitest run features/competitors/competitor-form.test.tsx features/competitors/competitor-screen.test.tsx`
Expected: PASS.

- [ ] **Step 8: Gate and commit**

Run: `npm run check`
Expected: exit 0, including `stylesheet-boundary.test.ts` (no `competitor-*` selector exists elsewhere).

```bash
git add apps/web/features/competitors/competitor-form.tsx apps/web/features/competitors/competitor-form.test.tsx apps/web/features/competitors/competitor-screen.tsx apps/web/features/competitors/competitor-screen.test.tsx apps/web/features/competitors/competitors.css
git commit -m "feat(competitors): add the competitor form and the ad library screen"
```

---

### Task 7: The Competitor ads widget

**Files:**
- Create: `apps/web/features/competitors/competitor-ads-widget.tsx`
- Test: `apps/web/features/competitors/competitor-ads-widget.test.tsx`

**Interfaces:**
- Consumes: Task 2's `MAX_COMPETITORS`, `matchedSources`, `websiteHost`, `Competitor`; Task 5's `useCompetitors`; Task 6's `CompetitorForm`, `CompetitorScreen`.
- Produces: `CompetitorAdsWidget({ clientId: string; canEdit: boolean; removing: boolean; onRemove: () => void })`, which renders `<section aria-label="Competitor ads">` and imports `./competitors.css`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/features/competitors/competitor-ads-widget.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompetitorAdsWidget } from "./competitor-ads-widget";
import type { Competitor } from "./competitors-model";

const backend = vi.hoisted(() => ({ competitors: {} as Record<string, unknown> }));
vi.mock("./competitors-data", () => ({ useCompetitors: () => backend.competitors }));
vi.mock("./competitor-form", () => ({
  CompetitorForm: ({ competitor }: { competitor?: Competitor }) => (
    <div role="dialog" aria-label={competitor ? `Edit ${competitor.name}` : "Add competitor"} />
  ),
}));
vi.mock("./competitor-screen", () => ({
  CompetitorScreen: ({ competitor, onEdit }: { competitor: Competitor; onEdit: () => void }) => (
    <div role="dialog" aria-label={competitor.name}>
      <button onClick={onEdit}>Edit</button>
    </div>
  ),
}));

function competitor(id: string, name: string, extra: Partial<Competitor> = {}): Competitor {
  return {
    id,
    client_id: "client-1",
    name,
    website: null,
    meta_page_id: null,
    google_advertiser_id: null,
    tiktok_advertiser: null,
    ...extra,
  };
}

function list(data: Competitor[]) {
  backend.competitors = { isPending: false, error: null, data, refetch: vi.fn() };
}

function renderWidget(props: Partial<Parameters<typeof CompetitorAdsWidget>[0]> = {}) {
  const onRemove = vi.fn();
  const view = render(
    <CompetitorAdsWidget clientId="client-1" canEdit removing={false} onRemove={onRemove} {...props} />,
  );
  return { onRemove, ...view };
}

beforeEach(() => list([]));

describe("CompetitorAdsWidget", () => {
  it("shows each competitor as a tile with its host and matched sources", () => {
    list([
      competitor("c1", "Rival Co", { website: "https://www.rival.example", meta_page_id: "123" }),
      competitor("c2", "Other Brand"),
    ]);
    renderWidget();
    const region = screen.getByRole("region", { name: "Competitor ads" });
    expect(region).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /Rival Co/ })).toHaveTextContent(
      "Rival Corival.exampleMeta · TikTok · Google",
    );
    expect(screen.getByRole("button", { name: /Other Brand/ })).toHaveTextContent("TikTok");
  });

  it("invites the agency to add competitors, and tells a designer none are set", () => {
    renderWidget();
    expect(screen.getByText("Add the competitors you want to follow.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add competitor" })).toBeInTheDocument();
  });

  it("gives a designer no way to add or remove", () => {
    renderWidget({ canEdit: false });
    expect(screen.getByText("The studio has not added competitors yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add competitor" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove competitor ads from the board" })).not.toBeInTheDocument();
  });

  it("says why nothing more can be added at twelve competitors", () => {
    list(Array.from({ length: 12 }, (_, index) => competitor(`c${index}`, `Rival ${index}`)));
    renderWidget();
    expect(screen.queryByRole("button", { name: "Add competitor" })).not.toBeInTheDocument();
    expect(screen.getByText("Up to 12 competitors")).toBeInTheDocument();
  });

  it("removes itself from the board through the board's handler", async () => {
    const { onRemove } = renderWidget();
    await userEvent.setup().click(screen.getByRole("button", { name: "Remove competitor ads from the board" }));
    expect(onRemove).toHaveBeenCalled();
  });

  it("opens the form to add, and a competitor's screen from its tile, then its form to edit", async () => {
    list([competitor("c1", "Rival Co")]);
    renderWidget();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add competitor" }));
    expect(screen.getByRole("dialog", { name: "Add competitor" })).toBeInTheDocument();
  });

  it("opens a competitor's screen from its tile and moves to its edit form", async () => {
    list([competitor("c1", "Rival Co")]);
    renderWidget();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Rival Co/ }));
    expect(screen.getByRole("dialog", { name: "Rival Co" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByRole("dialog", { name: "Rival Co" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Edit Rival Co" })).toBeInTheDocument();
  });

  it("closes a competitor's screen when the competitor is removed elsewhere", async () => {
    list([competitor("c1", "Rival Co")]);
    const { rerender } = renderWidget();
    await userEvent.setup().click(screen.getByRole("button", { name: /Rival Co/ }));
    expect(screen.getByRole("dialog", { name: "Rival Co" })).toBeInTheDocument();
    list([]);
    rerender(<CompetitorAdsWidget clientId="client-1" canEdit removing={false} onRemove={vi.fn()} />);
    expect(screen.queryByRole("dialog", { name: "Rival Co" })).not.toBeInTheDocument();
  });

  it("offers Try again when the list cannot be loaded", async () => {
    const refetch = vi.fn();
    backend.competitors = { isPending: false, error: new Error("offline"), data: undefined, refetch };
    renderWidget();
    expect(screen.getByRole("alert")).toHaveTextContent("Competitors could not be loaded.");
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/web && npx vitest run features/competitors/competitor-ads-widget.test.tsx`
Expected: FAIL — `Failed to resolve import "./competitor-ads-widget"`.

- [ ] **Step 3: Write the widget**

Create `apps/web/features/competitors/competitor-ads-widget.tsx`:

```tsx
"use client";

import { Plus, Radar, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { FormError } from "@/features/shared/form-error";
import { CompetitorForm } from "./competitor-form";
import { CompetitorScreen } from "./competitor-screen";
import { useCompetitors } from "./competitors-data";
import {
  MAX_COMPETITORS,
  matchedSources,
  websiteHost,
  type Competitor,
} from "./competitors-model";
import "./competitors.css";

/**
 * The Competitor ads widget, rendered inside its board frame. Its dialogs render into
 * `document.body`, so the canvas's own pointer and wheel handling never reaches them.
 */
export function CompetitorAdsWidget({
  clientId,
  canEdit,
  removing,
  onRemove,
}: {
  clientId: string;
  canEdit: boolean;
  removing: boolean;
  onRemove: () => void;
}) {
  const competitors = useCompetitors(clientId);
  const [form, setForm] = useState<{ competitor?: Competitor } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const list = competitors.data ?? [];
  // Resolved from the list rather than kept in state, so a competitor removed elsewhere closes.
  const open = list.find((item) => item.id === openId) ?? null;
  return (
    <section className="competitor-widget" aria-label="Competitor ads">
      <header className="competitor-widget-head">
        <Radar size={15} aria-hidden="true" />
        <h2>Competitor ads</h2>
        <span className="count-badge">{list.length}</span>
        {canEdit && (
          <div className="competitor-widget-actions">
            {list.length < MAX_COMPETITORS ? (
              <button
                type="button"
                className="button quiet nodrag"
                onClick={() => setForm({})}
              >
                <Plus size={15} aria-hidden="true" />
                Add competitor
              </button>
            ) : (
              <span className="competitor-widget-note">Up to {MAX_COMPETITORS} competitors</span>
            )}
            <button
              type="button"
              className="icon-button nodrag"
              aria-label="Remove competitor ads from the board"
              title="Remove from board"
              disabled={removing}
              onClick={onRemove}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </header>
      {competitors.isPending ? (
        <p className="competitor-widget-empty" role="status">
          Loading competitors…
        </p>
      ) : competitors.error ? (
        <div className="competitor-widget-empty">
          <FormError>
            Competitors could not be loaded.{" "}
            <button
              type="button"
              className="button quiet nodrag"
              onClick={() => void competitors.refetch()}
            >
              Try again
            </button>
          </FormError>
        </div>
      ) : list.length === 0 ? (
        <p className="competitor-widget-empty">
          {canEdit
            ? "Add the competitors you want to follow."
            : "The studio has not added competitors yet."}
        </p>
      ) : (
        <ul className="competitor-grid">
          {list.map((competitor) => {
            const host = websiteHost(competitor.website);
            return (
              <li key={competitor.id}>
                <button
                  type="button"
                  className="competitor-tile nodrag"
                  onClick={() => setOpenId(competitor.id)}
                >
                  <span className="competitor-initial" aria-hidden="true">
                    {Array.from(competitor.name)[0]?.toUpperCase()}
                  </span>
                  <strong>{competitor.name}</strong>
                  {host && <span className="competitor-host">{host}</span>}
                  <span className="competitor-sources">
                    {matchedSources(competitor).join(" · ")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {form &&
        createPortal(
          <CompetitorForm
            clientId={clientId}
            competitor={form.competitor}
            onClose={() => setForm(null)}
          />,
          document.body,
        )}
      {open &&
        !form &&
        createPortal(
          <CompetitorScreen
            competitor={open}
            canEdit={canEdit}
            onEdit={() => {
              setForm({ competitor: open });
              setOpenId(null);
            }}
            onClose={() => setOpenId(null)}
          />,
          document.body,
        )}
    </section>
  );
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd apps/web && npx vitest run features/competitors/competitor-ads-widget.test.tsx`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

Run: `npm run check`
Expected: exit 0.

```bash
git add apps/web/features/competitors/competitor-ads-widget.tsx apps/web/features/competitors/competitor-ads-widget.test.tsx
git commit -m "feat(competitors): add the competitor ads widget"
```

---

### Task 8: Board integration — the frame, the node and the Widgets panel

**Files:**
- Modify: `apps/web/features/board/board-layout.ts` (constants, `StackFrame.kind`, `StackInput`, `buildStack`)
- Modify: `apps/web/features/board/board-canvas-nodes.ts` (input, widget node)
- Modify: `apps/web/features/board/board-nodes.tsx` (node type)
- Modify: `apps/web/features/board/board-toolbar.tsx` (Widgets button and panel)
- Modify: `apps/web/features/board/board-page.tsx` (queries, mutation, wiring)
- Modify: `apps/web/features/board/board.css` (widget option rows)
- Test: `apps/web/features/board/board-layout.test.ts` (append)
- Test: `apps/web/features/board/board-canvas-nodes.test.tsx` (create)
- Test: `apps/web/features/board/board-page.test.tsx` (mocks and new tests)

**Interfaces:**
- Consumes: Task 5's `useBoardWidgets`, `addBoardWidget`, `removeBoardWidget`, `BoardWidgetKind`, `useCompetitors`; Task 7's `CompetitorAdsWidget`.
- Produces:
  - `competitorWidgetHeight(count: number): number`, `WIDGET_TILE_H = 88`, `WIDGET_TILE_GAP = 12`, `WIDGET_COLUMNS = 4`
  - `buildStack` input `competitorWidget?: { count: number }`, frame kind `"competitorAds"` with id `"widget:competitor-ads"`, first in the stack
  - `useBoardCanvasNodes` input `competitorWidget?: { count: number; canEdit: boolean; removing: boolean; onRemove: () => void }`
  - node type `competitorAds` with data `{ clientId, canEdit, removing, onRemove }`
  - `BoardToolbar` prop `widgets?: { placed: boolean; pending: boolean; error: string | null; onToggle: () => void }`

- [ ] **Step 1: Write the failing layout test**

Append to `apps/web/features/board/board-layout.test.ts` (add `competitorWidgetHeight, FRAME_HEAD, FRAME_PAD` to its import from `./board-layout` if not imported):

```ts
describe("competitor ads widget frame", () => {
  it("sits first in the stack, as wide as a three-card row, and pushes the campaigns down", () => {
    const frames = buildStack({
      ...base,
      projects: [project("p1", "c1")],
      campaigns: [campaign("c1", "First", "2026-09-01")],
      competitorWidget: { count: 5 },
    });
    expect(frames.map((frame) => frame.id)).toEqual(["widget:competitor-ads", "campaign:c1", "addCampaign"]);
    expect(frames[0]).toMatchObject({ kind: "competitorAds", x: 0, y: 0, width: campaignColumnWidth(3) });
    expect(frames[0].height).toBe(competitorWidgetHeight(5));
    expect(frames[1].y).toBe(frames[0].height + STACK_GAP);
  });

  it("grows by one row per four competitors, and keeps one row when empty", () => {
    expect(competitorWidgetHeight(0)).toBe(FRAME_HEAD + 88 + FRAME_PAD);
    expect(competitorWidgetHeight(4)).toBe(FRAME_HEAD + 88 + FRAME_PAD);
    expect(competitorWidgetHeight(5)).toBe(FRAME_HEAD + 88 * 2 + 12 + FRAME_PAD);
    expect(competitorWidgetHeight(12)).toBe(FRAME_HEAD + 88 * 3 + 12 * 2 + FRAME_PAD);
  });

  it("adds no frame when the widget is not on the board", () => {
    const frames = buildStack({ ...base, projects: [], campaigns: [campaign("c1", "First", "2026-09-01")] });
    expect(frames.some((frame) => frame.kind === "competitorAds")).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing node test**

Create `apps/web/features/board/board-canvas-nodes.test.tsx`:

```tsx
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBoardCanvasNodes } from "./board-canvas-nodes";

function nodesFor(competitorWidget?: Parameters<typeof useBoardCanvasNodes>[0]["competitorWidget"]) {
  return renderHook(() =>
    useBoardCanvasNodes({
      filteredProjects: [],
      campaigns: [{ id: "c1", title: "First", start_date: null, end_date: null }],
      canCreate: true,
      canMove: true,
      filtered: false,
      hasSearch: false,
      positions: {},
      clearFilters: vi.fn(),
      clientId: "client-1",
      setCreatingCampaign: vi.fn(),
      openProject: vi.fn(),
      selectedProjectId: null,
      artwork: undefined,
      competitorWidget,
    }),
  ).result.current;
}

describe("useBoardCanvasNodes competitor widget", () => {
  it("builds the widget node first, with what the widget needs", () => {
    const onRemove = vi.fn();
    const { nodes } = nodesFor({ count: 2, canEdit: true, removing: false, onRemove });
    expect(nodes[0]).toMatchObject({
      id: "widget:competitor-ads",
      type: "competitorAds",
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: { clientId: "client-1", canEdit: true, removing: false, onRemove },
    });
  });

  it("builds no widget node without the widget", () => {
    expect(nodesFor().nodes.some((node) => node.type === "competitorAds")).toBe(false);
  });
});
```

- [ ] **Step 3: Update the board page test harness and write the failing page tests**

In `apps/web/features/board/board-page.test.tsx`:

1. Extend the `fixture` hoisted object with:

```ts
  role: "agency" as "agency" | "designer" | "client",
  widgets: [] as string[],
  widgetsEnabled: [] as boolean[],
  addWidget: vi.fn(),
  removeWidget: vi.fn(),
```

2. Replace the `useAuth` mock's profile with `profile: { id: "viewer", role: fixture.role }`.
3. Add to the `vi.mock("./board-data", …)` factory object:

```ts
  useBoardWidgets: (_clientId: string, enabled: boolean) => {
    fixture.widgetsEnabled.push(enabled);
    return { data: enabled ? fixture.widgets : undefined, isPending: false, refetch: vi.fn() };
  },
  addBoardWidget: fixture.addWidget,
  removeBoardWidget: fixture.removeWidget,
```

4. Add after the other `vi.mock` calls:

```ts
vi.mock("@/features/competitors/competitors-data", () => ({
  useCompetitors: () => ({ data: [], isPending: false }),
}));
```

5. In `beforeEach`, add:

```ts
  fixture.role = "agency";
  fixture.widgets = [];
  fixture.widgetsEnabled = [];
  fixture.addWidget.mockReset().mockResolvedValue(undefined);
  fixture.removeWidget.mockReset().mockResolvedValue(undefined);
```

6. Append these tests:

```tsx
describe("BoardPage widgets", () => {
  it("lets the agency place the competitor ads widget from the Widgets panel", async () => {
    fixture.view = "canvas";
    mountBoard();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Board widgets" }));
    const panel = screen.getByRole("region", { name: "Board widgets" });
    expect(panel).toHaveTextContent("Follow competitors' ads from the official ad libraries.");
    await user.click(within(panel).getByRole("button", { name: "Add to board" }));
    await waitFor(() =>
      expect(fixture.addWidget).toHaveBeenCalledWith(fixture.database, {
        clientId: "client",
        kind: "competitor_ads",
      }),
    );
  });

  it("offers removal once the widget is on the board", async () => {
    fixture.view = "canvas";
    fixture.widgets = ["competitor_ads"];
    mountBoard();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Board widgets" }));
    await user.click(
      within(screen.getByRole("region", { name: "Board widgets" })).getByRole("button", {
        name: "Remove from board",
      }),
    );
    await waitFor(() =>
      expect(fixture.removeWidget).toHaveBeenCalledWith(fixture.database, {
        clientId: "client",
        kind: "competitor_ads",
      }),
    );
  });

  it("shows a failed placement in the panel", async () => {
    fixture.view = "canvas";
    fixture.addWidget.mockRejectedValue(new Error("Access removed"));
    mountBoard();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Board widgets" }));
    await user.click(within(screen.getByRole("region", { name: "Board widgets" })).getByRole("button", { name: "Add to board" }));
    expect(await within(screen.getByRole("region", { name: "Board widgets" })).findByRole("alert")).toHaveTextContent(
      "Access removed",
    );
  });

  it.each(["designer", "client"] as const)("gives a %s no Widgets button", async (role) => {
    fixture.view = "canvas";
    fixture.role = role;
    mountBoard();
    await screen.findByRole("group", { name: "Board tools" });
    expect(screen.queryByRole("button", { name: "Board widgets" })).not.toBeInTheDocument();
  });

  it("never asks for a client's widgets", async () => {
    fixture.view = "canvas";
    fixture.role = "client";
    mountBoard();
    await screen.findByRole("group", { name: "Board tools" });
    expect(fixture.widgetsEnabled.length).toBeGreaterThan(0);
    expect(fixture.widgetsEnabled).not.toContain(true);
  });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `cd apps/web && npx vitest run features/board/`
Expected: FAIL — `competitorWidgetHeight is not a function`, no `competitorAds` node, and no **Board widgets** button.

- [ ] **Step 5: Add the frame to the layout**

In `apps/web/features/board/board-layout.ts`:

After `const ADD_CAMPAIGN_H = 76;` add:

```ts
/** The competitor widget's tiles: four to a row, each as tall as a short card. */
export const WIDGET_TILE_H = 88;
export const WIDGET_TILE_GAP = 12;
export const WIDGET_COLUMNS = 4;

/** Its head, then one row per four competitors, one row even when empty for its message. */
export function competitorWidgetHeight(count: number): number {
  const rows = Math.max(1, Math.ceil(count / WIDGET_COLUMNS));
  return FRAME_HEAD + rows * WIDGET_TILE_H + (rows - 1) * WIDGET_TILE_GAP + FRAME_PAD;
}
```

Change `StackFrame.kind` to `kind: "notice" | "campaign" | "addCampaign" | "competitorAds";`.

Add to `StackInput`:

```ts
  /** Present when the studio placed the Competitor ads widget on this board. */
  competitorWidget?: { count: number };
```

In `buildStack`, immediately before `for (const campaign of ordered) {`, add:

```ts
  if (input.competitorWidget)
    push({
      id: "widget:competitor-ads",
      kind: "competitorAds",
      width: rowWidth(MIN_ROW_CARDS),
      height: competitorWidgetHeight(input.competitorWidget.count),
    });
```

- [ ] **Step 6: Build the node**

In `apps/web/features/board/board-canvas-nodes.ts`:

Add to the input type (after `artwork: ProjectArtworkMap | undefined;`):

```ts
  /** Present for the studio side when the widget is on the board. */
  competitorWidget?: { count: number; canEdit: boolean; removing: boolean; onRemove: () => void };
```

Add `competitorWidget,` to the destructuring, pass `competitorWidget: competitorWidget ? { count: competitorWidget.count } : undefined,` into the `buildStack({...})` call, add `competitorWidget` to the `useMemo` dependency list, and add this branch before `else if (frame.campaign) {`:

```ts
      else if (frame.kind === "competitorAds" && competitorWidget)
        built.push({
          ...shared,
          id: frame.id,
          type: "competitorAds",
          ariaLabel: "Competitor ads",
          data: {
            clientId,
            canEdit: competitorWidget.canEdit,
            removing: competitorWidget.removing,
            onRemove: competitorWidget.onRemove,
          },
        });
```

In `apps/web/features/board/board-nodes.tsx`, import `CompetitorAdsWidget` from `@/features/competitors/competitor-ads-widget`, then add:

```tsx
export type CompetitorAdsNode = Node<
  { clientId: string; canEdit: boolean; removing: boolean; onRemove: () => void },
  "competitorAds"
>;

const CompetitorAdsFrame = memo(function CompetitorAdsFrame({ data }: NodeProps<CompetitorAdsNode>) {
  return (
    <CompetitorAdsWidget
      clientId={data.clientId}
      canEdit={data.canEdit}
      removing={data.removing}
      onRemove={data.onRemove}
    />
  );
});
```

and register `competitorAds: CompetitorAdsFrame,` in `boardNodeTypes`.

- [ ] **Step 7: Add the Widgets panel to the toolbar**

In `apps/web/features/board/board-toolbar.tsx`:

1. Import `LayoutDashboard` with the other `lucide-react` icons and `FormError` from `@/features/shared/form-error`.
2. Add the prop `widgets?: { placed: boolean; pending: boolean; error: string | null; onToggle: () => void };` to the component's props and destructuring.
3. Change the panel state to `useState<"search" | "filters" | "widgets" | null>(null)`, add `const widgetsButton = useRef<HTMLButtonElement>(null);` and `const widgetToggle = useRef<HTMLButtonElement>(null);`, and add a helper used by the effect's Escape handler and `closePanel`:

```ts
  const triggerFor = (open: "search" | "filters" | "widgets") =>
    open === "search" ? searchButton : open === "filters" ? filterButton : widgetsButton;
```

   In the effect, focus `widgetToggle.current` when `panel === "widgets"` (keep the other two branches), and replace both `(panel === "search" ? searchButton : filterButton).current?.focus()` expressions with `triggerFor(panel).current?.focus()` (inside `closePanel`, guard with `if (panel)`).
4. After the New briefing group, add:

```tsx
      {widgets && (
        <>
          <span className="board-tool-divider" aria-hidden="true" />
          <div className="board-tool-group">
            <button
              type="button"
              className="icon-button board-tool"
              ref={widgetsButton}
              aria-label="Board widgets"
              title="Board widgets"
              aria-expanded={panel === "widgets"}
              aria-controls={panel === "widgets" ? panelId : undefined}
              onClick={() => setPanel(panel === "widgets" ? null : "widgets")}
            >
              <LayoutDashboard size={18} aria-hidden="true" />
            </button>
          </div>
        </>
      )}
```

5. In the panel section, set `aria-label={panel === "search" ? "Project search" : panel === "filters" ? "Project filters" : "Board widgets"}`, the heading to `{panel === "search" ? "Find a project" : panel === "filters" ? "Filters" : "Widgets"}`, and render this before the existing search/filters content:

```tsx
          {panel === "widgets" && widgets ? (
            <>
              <div className="board-widget-option">
                <div>
                  <strong>Competitor ads</strong>
                  <p>Follow competitors&apos; ads from the official ad libraries.</p>
                </div>
                <button
                  type="button"
                  className="button"
                  ref={widgetToggle}
                  disabled={widgets.pending}
                  onClick={widgets.onToggle}
                >
                  {widgets.placed ? "Remove from board" : "Add to board"}
                </button>
              </div>
              {widgets.error && <FormError>{widgets.error}</FormError>}
            </>
          ) : panel === "search" ? (
```

   and close the existing ternary accordingly, so the filters branch stays the final `: ( … )`. Render the footer (result count) only when `panel !== "widgets"`.

6. Append to `apps/web/features/board/board.css`:

```css
.board-widget-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.board-widget-option p {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: var(--text-sm);
}
```

- [ ] **Step 8: Wire the board page**

In `apps/web/features/board/board-page.tsx`:

1. Add `addBoardWidget, removeBoardWidget, useBoardWidgets,` to the `./board-data` import and `import { useCompetitors } from "@/features/competitors/competitors-data";`.
2. After `const canCreate = …;` add:

```ts
  // Only the studio side reads widgets or competitors; a client's board never asks.
  const studioSide = profile?.role === "agency" || profile?.role === "designer";
  const widgets = useBoardWidgets(clientId, studioSide);
  const competitorWidgetPlaced = !!widgets.data?.includes("competitor_ads");
  const competitors = useCompetitors(clientId, studioSide && competitorWidgetPlaced);
  const competitorCount = competitors.data?.length ?? 0;
  const toggleWidget = useMutation({
    mutationFn: async (placed: boolean) =>
      placed
        ? removeBoardWidget(database, { clientId, kind: "competitor_ads" })
        : addBoardWidget(database, { clientId, kind: "competitor_ads" }),
    onSuccess: () => widgets.refetch(),
  });
  const { mutate: setWidgetPlaced } = toggleWidget;
  const removeCompetitorWidget = useCallback(() => setWidgetPlaced(true), [setWidgetPlaced]);
  const competitorWidget = useMemo(
    () =>
      competitorWidgetPlaced
        ? {
            count: competitorCount,
            canEdit: canMove,
            removing: toggleWidget.isPending,
            onRemove: removeCompetitorWidget,
          }
        : undefined,
    [competitorWidgetPlaced, competitorCount, canMove, toggleWidget.isPending, removeCompetitorWidget],
  );
```

3. Pass `competitorWidget,` into the `useBoardCanvasNodes({…})` call.
4. Pass to `<BoardToolbar …>`:

```tsx
            widgets={
              canMove && layout === "canvas"
                ? {
                    placed: competitorWidgetPlaced,
                    pending: toggleWidget.isPending || widgets.isPending,
                    error: toggleWidget.error?.message ?? null,
                    onToggle: () => setWidgetPlaced(competitorWidgetPlaced),
                  }
                : undefined
            }
```

- [ ] **Step 9: Run the board tests to see them pass**

Run: `cd apps/web && npx vitest run features/board/`
Expected: PASS, including every existing board test.

- [ ] **Step 10: Gate and commit**

Run: `npm run check`
Expected: exit 0.

```bash
git add apps/web/features/board/board-layout.ts apps/web/features/board/board-layout.test.ts apps/web/features/board/board-canvas-nodes.ts apps/web/features/board/board-canvas-nodes.test.tsx apps/web/features/board/board-nodes.tsx apps/web/features/board/board-toolbar.tsx apps/web/features/board/board-page.tsx apps/web/features/board/board-page.test.tsx apps/web/features/board/board.css
git commit -m "feat(board): place the competitor ads widget on the canvas from a Widgets panel"
```

---

### Task 9: Browser acceptance across the three roles

**Files:**
- Create: `apps/web/tests/e2e/competitor-ads.spec.ts`

**Interfaces:**
- Consumes: `credentials`, `localAdmin`, `localCaller`, `signIn`, `preserveBoardPreference` from `./test-support`; everything above through the running app on `http://localhost:3003`.

- [ ] **Step 1: Write the browser test**

Create `apps/web/tests/e2e/competitor-ads.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { credentials, localAdmin, localCaller, preserveBoardPreference, signIn } from "./test-support";

const name = "Acceptance competitor Rival";

async function sabreId() {
  const client = await localAdmin.from("clients").select("id").eq("slug", "sabre").single();
  if (client.error) throw client.error;
  return client.data.id;
}

async function removeFixtures(clientId: string) {
  const competitors = await localAdmin
    .from("competitors")
    .delete()
    .eq("client_id", clientId)
    .like("name", "Acceptance competitor%");
  if (competitors.error) throw competitors.error;
}

async function openCanvas(page: Page, clientId: string) {
  await page.goto(`/clients/${clientId}/board`);
  const canvas = page.getByRole("button", { name: "Canvas view" });
  if ((await canvas.getAttribute("aria-pressed")) !== "true") await canvas.click();
  await expect(page.getByLabel("Project canvas")).toBeVisible();
}

test("the agency places the widget and follows a competitor; a designer reads it; a client never sees it", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const clientId = await sabreId();
  const placed = await localAdmin
    .from("client_board_widgets")
    .select("kind")
    .eq("client_id", clientId);
  if (placed.error) throw placed.error;
  const widgetWasPlaced = placed.data.length > 0;
  const restoreAgencyView = await preserveBoardPreference(credentials.agency, clientId);
  const restoreDesignerView = await preserveBoardPreference(credentials.designer, clientId);
  const restoreClientView = await preserveBoardPreference(credentials.client, clientId);
  await removeFixtures(clientId);
  if (widgetWasPlaced)
    await localAdmin.from("client_board_widgets").delete().eq("client_id", clientId);
  try {
    // The agency places the widget and adds a competitor.
    await signIn(page, credentials.agency);
    await openCanvas(page, clientId);
    await page.getByRole("button", { name: "Board widgets" }).click();
    await page
      .getByRole("region", { name: "Board widgets" })
      .getByRole("button", { name: "Add to board" })
      .click();
    const widget = page.getByRole("region", { name: "Competitor ads" });
    await expect(widget).toContainText("Add the competitors you want to follow.");
    await widget.getByRole("button", { name: "Add competitor" }).click();
    const form = page.getByRole("dialog", { name: "Add competitor" });
    await form.getByLabel("Name").fill(name);
    await form.getByLabel(/Website/).fill("https://rival.example");
    await form.getByLabel(/Facebook Page ID/).fill("123456789");
    await form.getByLabel(/Google advertiser ID/).fill("AR01234567890123456789");
    await form.getByRole("button", { name: "Add competitor" }).click();
    await expect(form).toBeHidden();

    // Its screen links every official library and says previews are off without a token.
    await widget.getByRole("button", { name: new RegExp(name) }).click();
    const screen = page.getByRole("dialog", { name });
    const meta = screen.getByRole("link", { name: "Open in Meta Ad Library" });
    await expect(meta).toHaveAttribute(
      "href",
      "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&media_type=all&search_type=page&view_all_page_id=123456789",
    );
    await expect(meta).toHaveAttribute("target", "_blank");
    await expect(meta).toHaveAttribute("rel", "noopener noreferrer");
    await expect(screen).toContainText("In-app previews are off.");
    await screen.getByRole("button", { name: "TikTok" }).click();
    await expect(screen.getByRole("link", { name: "Open in TikTok Ad Library" })).toHaveAttribute(
      "href",
      "https://library.tiktok.com/ads?region=all&adv_name=Acceptance+competitor+Rival",
    );
    await screen.getByRole("button", { name: "Google" }).click();
    await expect(
      screen.getByRole("link", { name: "Open in Google Ads Transparency Center" }),
    ).toHaveAttribute(
      "href",
      "https://adstransparency.google.com/advertiser/AR01234567890123456789?region=anywhere",
    );
    await page.keyboard.press("Escape");
    await expect(screen).toBeHidden();

    const competitor = await localAdmin
      .from("competitors")
      .select("id")
      .eq("client_id", clientId)
      .eq("name", name)
      .single();
    if (competitor.error) throw competitor.error;
    const adsPath = `/api/competitors/${competitor.data.id}/ads`;

    // An assigned designer reads the widget, cannot change it, and may ask the route.
    const designerContext = await browser.newContext();
    const designerPage = await designerContext.newPage();
    await signIn(designerPage, credentials.designer);
    await openCanvas(designerPage, clientId);
    const designerWidget = designerPage.getByRole("region", { name: "Competitor ads" });
    await expect(designerWidget.getByRole("button", { name: new RegExp(name) })).toBeVisible();
    await expect(designerWidget.getByRole("button", { name: "Add competitor" })).toHaveCount(0);
    await expect(designerPage.getByRole("button", { name: "Board widgets" })).toHaveCount(0);
    const designerSession = (await (await localCaller(credentials.designer)).auth.getSession()).data
      .session!;
    const designerAnswer = await designerPage.request.get(adsPath, {
      headers: { Authorization: `Bearer ${designerSession.access_token}` },
    });
    expect(designerAnswer.status()).toBe(200);
    expect(await designerAnswer.json()).toEqual({ status: "not_configured" });
    await designerContext.close();

    // A client never sees the widget, and the route refuses them as if it did not exist.
    const clientContext = await browser.newContext();
    const clientPage = await clientContext.newPage();
    await signIn(clientPage, credentials.client);
    await openCanvas(clientPage, clientId);
    await expect(clientPage.getByRole("region", { name: "Competitor ads" })).toHaveCount(0);
    const clientCaller = await localCaller(credentials.client);
    const clientRows = await clientCaller.from("competitors").select("id");
    expect(clientRows.data).toEqual([]);
    const clientSession = (await clientCaller.auth.getSession()).data.session!;
    const clientAnswer = await clientPage.request.get(adsPath, {
      headers: { Authorization: `Bearer ${clientSession.access_token}` },
    });
    expect(clientAnswer.status()).toBe(404);
    await clientContext.close();

    // The agency removes the competitor, then the widget.
    await widget.getByRole("button", { name: new RegExp(name) }).click();
    await page.getByRole("dialog", { name }).getByRole("button", { name: "Remove competitor" }).click();
    await page.getByRole("dialog", { name }).getByRole("button", { name: "Remove", exact: true }).click();
    await expect(widget.getByRole("button", { name: new RegExp(name) })).toHaveCount(0);
    await widget.getByRole("button", { name: "Remove competitor ads from the board" }).click();
    await expect(widget).toHaveCount(0);
  } finally {
    await removeFixtures(clientId);
    await localAdmin.from("client_board_widgets").delete().eq("client_id", clientId);
    if (widgetWasPlaced)
      await localAdmin
        .from("client_board_widgets")
        .insert({ client_id: clientId, kind: "competitor_ads" });
    await restoreAgencyView();
    await restoreDesignerView();
    await restoreClientView();
  }
});
```

- [ ] **Step 2: Run it**

Run: `cd apps/web && npx playwright test tests/e2e/competitor-ads.spec.ts --reporter=line`
Expected: `1 passed`. If a step fails, debug with superpowers:systematic-debugging; a failure here is a defect in Tasks 1–8, not in the test's expectations, unless the spec says otherwise.

- [ ] **Step 3: Re-run the board suites that share the canvas**

Run: `cd apps/web && npx playwright test tests/e2e/board-views.spec.ts tests/e2e/project-creation-cards.spec.ts --reporter=line`
Expected: all pass (the widget is absent unless placed, so nothing they assert moves).

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/e2e/competitor-ads.spec.ts
git commit -m "test(competitors): cover the widget for agency, designer and client in the browser"
```

---

### Task 10: Documentation, configuration and verification

**Files:**
- Create: `apps/web/features/competitors/README.md`
- Create: `docs/verification/competitor-ads-2026-09-24.md`
- Modify: `apps/web/features/board/README.md` (new "Widgets" section)
- Modify: `apps/web/.env.example`
- Modify: `compose.yaml` (the `web` service environment)
- Modify: `docs/operations/production.md` (Meta Ad Library token)
- Modify: `docs/architecture/data-access.md` and `docs/architecture/backend.md` (competitors, the widget table, the route)

- [ ] **Step 1: Visual pass**

With the widget placed and two competitors (one with every id, one with only a name) on the SABRE board, capture at 1600 × 1000 and 390 × 844 into the ignored `outputs/competitor-ads/`: the Widgets panel, the widget frame, the add form, and the competitor screen on each tab. Check alignment with the campaign frames, spacing, focus rings, the modal on a phone, and that no text overflows a tile. Fix what the captures show (with a test when it is logic), then remove the two competitors.

- [ ] **Step 2: Write the feature README**

Create `apps/web/features/competitors/README.md` describing: purpose and roles (agency writes; designers with the client's work read; clients never see it, enforced by row-level security); the widget, screen and form behavior; `libraryLinks` and why there are no iframes; the Meta route, its caching, errors and coverage limits (ordinary ads only where they reached the EU); why TikTok's API and Google's BigQuery export are not used; the files and their tests; and the commands `npm --prefix apps/web run test -- features/competitors`, `supabase test db supabase/tests/database/competitor_ads.test.sql` and `npm --prefix apps/web run test:e2e -- competitor-ads`.

- [ ] **Step 3: Update the board README**

Add a `## Widgets` section to `apps/web/features/board/README.md`: the agency's **Widgets** toolbar panel (Canvas view only), `client_board_widgets` as shared per-client placement (not the legacy per-viewer `visible_widgets`), the widget frame first in the stack at `competitorWidgetHeight(count)`, and a link to the competitors README. Update the "Its node model now contains only campaigns, projects and creation/empty-state frames" sentence to include the widget frame.

- [ ] **Step 4: Configuration**

Append to `apps/web/.env.example`:

```bash
# Optional: Meta Ad Library API token for in-app competitor ad previews. Server-only; never use a
# NEXT_PUBLIC_ prefix. A long-lived user token lasts about 60 days. Without it, the competitor
# screen keeps its library links and says previews are off.
META_AD_LIBRARY_ACCESS_TOKEN=
# Optional: comma-separated ISO country codes for the preview search. Empty means every country.
META_AD_LIBRARY_COUNTRIES=
```

In `compose.yaml`, add to the `web` service `environment`:

```yaml
      # Optional competitor ad previews (see docs/operations/production.md). Empty disables them.
      META_AD_LIBRARY_ACCESS_TOKEN: ${META_AD_LIBRARY_ACCESS_TOKEN:-}
      META_AD_LIBRARY_COUNTRIES: ${META_AD_LIBRARY_COUNTRIES:-}
```

- [ ] **Step 5: Production guide and architecture notes**

In `docs/operations/production.md`, add a "Competitor ad previews (optional)" section: create a Meta developer app with the Ad Library API product, confirm the account's identity at facebook.com/ID, generate a long-lived user access token, set `META_AD_LIBRARY_ACCESS_TOKEN` (and optionally `META_AD_LIBRARY_COUNTRIES`) for the `web` service, renew the token before its roughly 60 days run out, and note that without a token the widget still works with links only.

In `docs/architecture/data-access.md`, list `features/competitors/competitors-data.ts` (reads `useCompetitors`, `useCompetitorAds`; writes `createCompetitor`, `updateCompetitor`, `deleteCompetitor`), the board's `useBoardWidgets`, `addBoardWidget` and `removeBoardWidget`, and the `GET /api/competitors/[id]/ads` route with its read-as-caller lookup. In `docs/architecture/backend.md`, add the two tables, `private.can_follow_competitors`, the cap trigger and the column grants.

- [ ] **Step 6: Verification record**

Create `docs/verification/competitor-ads-2026-09-24.md` in the format of `docs/verification/playground-albums-2026-09-23.md`: the checks run in this session with their results (pgTAP file, unit suites with counts, `npm run check`, the browser spec and the two board suites), the spec's four success criteria with their evidence, decisions that differ from the plan, the visual pass, and the known limitations (Meta coverage outside the EU, token expiry, the unconfirmed `ALL` country value and TikTok's `adv_name` parameter).

- [ ] **Step 7: Final gate and commit**

Run: `npm run check`
Expected: exit 0.

```bash
git add apps/web/features/competitors/README.md apps/web/features/board/README.md apps/web/.env.example compose.yaml docs/operations/production.md docs/architecture/data-access.md docs/architecture/backend.md docs/verification/competitor-ads-2026-09-24.md
git commit -m "docs(competitors): document the widget, the Meta token and its verification"
```

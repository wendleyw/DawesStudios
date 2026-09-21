# Acceptance family C — Authentication and authorization

Measurement pass for the ten open rows of section **C** of
[`docs/architecture/acceptance-matrix.md`](../architecture/acceptance-matrix.md).
This is evidence, not repair: no application code, policy, migration or existing test was changed
while producing it.

| Field | Value |
|---|---|
| Date | 2026-09-21 |
| Branch | `main` at `54645f1` |
| Application under test | `http://localhost:3003`, container `dawes-studios-app-web-1`, image `dawes-studios-web:local` built `2026-09-21T12:30:41Z` from `6bc6228` |
| Image vs. head | `git diff 6bc6228 HEAD -- apps/web` touches thirteen files under `features/board`, `features/brand`, `features/projects` and `features/reviews`. Nothing under `features/auth`, `features/workspace`, `features/settings`, `app/` or `supabase/` differs. The one file in family C's path is `features/reviews/review-data.ts`, and its change adds no read — see [C05](#c05--the-designer-cannot-reach-the-client-channel-credits-contact-details-approval-or-administration). |
| Backend | `supabase_db_dawes-studios` (local Docker stack), PostgREST/Storage/Auth on `127.0.0.1:55421` |
| Disposable backend | `127.0.0.1:55521` (`supabase_db_dawes-studios-restore-drill`), used for the two checks that require a real state change — assignment revocation and signature reuse |
| Drivers | Seven throwaway Node HTTP probes and three rolled-back psql scripts in the session scratchpad, plus one throwaway Playwright spec, `apps/web/tests/e2e/evidence-probe-family-c.spec.ts`, five tests. **All deleted after the run.** Every measurement below is a line one of them printed. |
| Accounts | `studio@dawes.local` (the only agency user), `designer@dawes.local` / `designer2@dawes.local`, `sabre@client.dawes.local` and `acme@client.dawes.local` (two tenants), plus two disposable sign-ups |
| Result | **Nine of the ten Verified at the time of the pass. C07 was not**, because one clause of it failed: see [Defect C-2](#defect-c-2-a-signed-storage-url-outlives-the-authorisation-that-minted-it). [Defect C-1](#defect-c-1-an-access-token-keeps-working-after-sign-out) is recorded against C01 without changing its verdict, for the reason given there. **Both defects were closed on 2026-09-21** — each has a Resolution note under its heading — and **C07 is now Verified**. |

## How a refusal is read in this installation

Three refusal shapes appear throughout, and they are not interchangeable. The policy and grant map
below was taken from the running database (`pg_policy`, `information_schema.role_column_grants`) and
is what every verdict in this document is attributed against.

| Shape | When it happens | What a caller sees |
|---|---|---|
| **Grant refusal** | `authenticated` holds no privilege for that verb on that table at all | `42501 permission denied for table …`, PostgREST `403` (or `401` for `anon`) |
| **Policy refusal on INSERT** | The `WITH CHECK` expression is false | `42501 new row violates row-level security policy for table …`, PostgREST `403` |
| **Policy refusal on UPDATE/DELETE** | A column-level grant exists, so the statement is legal, but the `USING` expression hides every row | **`204`/`200` with zero rows changed and no error** |

The third shape is the trap this pass was warned about, and it is live here. `authenticated` holds
**column-level** `UPDATE` grants on exactly these tables, and nothing else:

| Table | Columns `authenticated` may update |
|---|---|
| `brand_assets` | `category, client_id, created_at, description, id, mime_type, name, storage_path, tags` |
| `brand_sections` | `client_id, content, section, updated_at` |
| `brand_templates` | `category, client_id, content, height, id, name, width` |
| `campaigns` | `description, end_date, start_date, title` |
| `clients` | `archived, description, industry, initials, name, website` |
| `designs` | `content, internal_asset_path, sort_order, title` |
| `notifications` | `read_at` |
| `profiles` | `avatar_url, display_name` |
| `projects` | `board_position, description, due_date, start_date, title` |
| `template_drafts` | `content, name, updated_at` |

An `UPDATE` against any of those columns answers `204` whether it changed a row or not. **Every
`UPDATE` and `DELETE` in this document is therefore followed by a service-role re-read of the stored
value**, and the verdict rests on the re-read, not the status code. An `UPDATE` that touches a column
outside the list — `projects.client_id`, `profiles.role`, `briefings.client_id` — is refused by the
grant instead, with a real `42501`, and those are marked as such.

## What the existing suites already proved

Run against this build before anything new was attempted.

| Suite | Result on 2026-09-21 | Rows it already carries | What it does not reach |
|---|---|---|---|
| `npm run db:test` (pgTAP, 5 files) | **133 assertions, all pass** | C08 and C10 in full (both already Verified). Substantial parts of C02 (client sees 1 client / 7 projects / 0 assignments / 0 versions / 0 designs / 0 internal comments), C05 (designer sees 0 credit rows, 0 client conversations, 0 publication records; `add_design` on another assignment refused), C06 (`profiles.role` promotion, forged invitation tokens), C11 (a briefing cannot take another client's campaign; an asset cannot register another project's bytes). | Everything runs inside one rolled-back transaction as `set local role authenticated`; it never crosses PostgREST, Storage, Auth or the browser, never re-reads after a refused `UPDATE` outside the two places it does so explicitly, and covers only two of the twenty-six cross-parent shapes C11 asserts. |
| `python3 supabase/tests/http_auth_storage_test.py` | Nine tests (not re-run in this pass; its assertions were re-derived independently below) | Real HTTP for parts of C01, C02, C03, C05, C07, C06. Notably it already re-reads after a cross-client `PATCH`. | One representative row per family; no `DELETE`, no `INSERT`, no embedded-relation attempts, no CSV, no count headers, no designer-vs-designer split, no revocation, no signed-URL reuse. |
| `node supabase/tests/realtime_boundary_test.mjs` | **PASS on 8 of 9 runs.** The first invocation of the session failed a `deepStrictEqual`; the eight runs after it passed. The test's own comment records that the local replication worker initialises on its first connection, which is the most likely cause, but the failing assertion was not captured and that is recorded here rather than explained away. | C09's realtime half: four simultaneous authenticated subscriptions, internal/client recipients matching RLS, version and design events reaching producers only, a second tenant receiving nothing, deleted-row identifiers not broadcast. | Search and notifications, which are C09's other two halves. |
| `python3 supabase/tests/concurrent_workflows_test.py` | Not run in this pass. | Nothing in section C. Its subject — atomic acceptance, insufficient balance, idempotency under retries and concurrency — is asserted by rows **E** and **H**, not by any C row. C06 and C11 cover forged and cross-parent *shapes*, not arithmetic under load. | — |

Everything below is what this pass added.

---

## C01 — Sessions, sign-out, deep links, and the closed door in front of an anonymous caller

**Required evidence:** a real sign-in/out browser journey and unauthenticated API/storage requests.

### Unauthenticated REST

Thirty tables were requested with `apikey` only and no `Authorization` header. **All thirty answered
`401` with `42501 permission denied for table <name>`** — a grant refusal, before RLS is consulted:

`clients, projects, briefings, campaigns, deliverables, designs, design_versions, internal_comments,
client_comments, published_versions, published_designs, publication_reviews, credit_accounts,
credit_ledger, credit_requests, notifications, profiles, project_assignments, brand_sections,
brand_assets, brand_templates, template_drafts, delivery_files, project_assets, workspace_settings,
invitations, client_memberships, briefing_attachments, service_presets, service_preset_history`.

### Unauthenticated RPC

Ten commands called with their real argument names and real fixture identifiers — so the refusal is
authorization, not a signature miss. **All ten: `401`, `42501 permission denied for function <name>`**
— `accept_briefing`, `post_comment`, `adjust_credits`, `create_client`, `publish_version`,
`review_publication`, `save_briefing`, `update_workspace_settings`, `create_invitation`,
`assign_designer`.

### Unauthenticated storage

Real object paths were taken with the service role first, so each request names a file that exists.

| Bucket | `/object/authenticated/…` | `/object/…` | `/object/public/…` | `POST /object/sign/…` | `POST /object/list` |
|---|---|---|---|---|---|
| `internal-assets` | 400 `Object not found` | 400 `Object not found` | 400 `Bucket not found` | 400 `Object not found` | 200 `[]` |
| `brand-assets` | 400 | 400 | 400 | 400 | 200 `[]` |
| `delivery-files` | 400 | 400 | 400 | 400 | 200 `[]` |
| `published-assets` | 400 | 400 | 400 | 400 | 200 `[]` |

`GET /auth/v1/user` without a token: `401 no_authorization`.

### Forged credentials

| Bearer | Result |
|---|---|
| The anon key itself | `401`, `42501 permission denied for table clients` |
| `not.a.token` | `401`, `PGRST301 JWT cryptographic operation failed` |
| Empty | `401`, `PGRST301 Empty JWT is not allowed` |
| A real client token re-encoded with `"role": "service_role"` | `401`, `PGRST301 — None of the keys was able to decode the JWT` |

### The browser journey

Eight protected deep links were opened in a fresh, signed-out context. **Every one redirected to
`/login` carrying its own `returnTo`** — the two client sub-routes, the brand section, a project, and
`/home`, `/notifications`, `/search`, `/settings/workspace`. Signing in from
`/clients/<SABRE>/board` landed back on `/clients/<SABRE>/board`. Signing out through the product
returned to `/login`, and the count of Supabase auth-token keys in `localStorage` went from **1 to
0**. All three protected routes then redirected to `/login?returnTo=…` again, and a browser **Back**
after sign-out rendered `/login`, not a cached workspace.

**Verdict: Verified.** See [Defect C-1](#defect-c-1-an-access-token-keeps-working-after-sign-out),
which is recorded against this row but does not contradict any of the four clauses it asserts: the
product's session is destroyed, the refresh token is revoked, and no unauthenticated caller reads
anything.

## C02 — One client against another, across every resource family

**Required evidence:** direct API/database policy checks for every resource family.

SABRE (`sabre@client.dawes.local`) was signed in and pointed at Acme's rows by explicit identifier,
one family at a time; then Acme was signed in and pointed at SABRE's.

### Reads — 24 families, both directions

Every targeted read of another tenant's row returned **`200` with zero rows**: `clients, campaigns,
briefings, projects, deliverables, design_versions, designs, internal_comments, client_comments,
published_versions, published_designs, publication_reviews, credit_accounts, credit_ledger,
credit_requests, brand_sections, brand_assets, brand_templates, template_drafts, notifications,
profiles, project_assignments, client_memberships, delivery_files`. The reverse direction (Acme
against twelve SABRE families) is likewise zero throughout.

`workspace_settings` is the one table where a client sees a row it does not own: it is the single
installation-wide record (`studio_name`, `timezone`) and holds no tenant data. It is recorded here
so a later reader does not mistake it for a leak.

An unfiltered enumeration confirms that each session's whole world is its own:

| Session | clients | projects | briefings | campaigns | brand_sections | brand_assets | template_drafts | credit_ledger | client_comments | published_designs | notifications | profiles |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SABRE | 1 | 7 | 9 | 3 | 8 | 7 | 1 | 9 | 16 | 6 | 4 | 1 |
| Acme | 1 | 2 | 3 | 1 | 8 | 7 | 1 | 3 | 2 | 0 | 0 | 1 |
| *(whole database)* | 10 | 25 | 30 | 12 | 80 | 70 | 10 | 36 | 57 | 22 | 15 | 13 |

### Updates — status code and stored value, separately

Twenty-five cross-tenant `PATCH` attempts, each preceded and followed by a service-role read of the
same row. **Nothing moved in any of them.**

| Refusal shape | Tables | Status |
|---|---|---|
| Grant refusal | `briefings, deliverables, internal_comments, client_comments, published_versions, published_designs, publication_reviews, credit_accounts, credit_ledger, credit_requests, profiles, delivery_files, workspace_settings, design_versions, project_assignments, client_memberships` | `403`, `42501` |
| **Policy refusal, silent** | `clients, campaigns, projects, brand_assets, brand_templates, template_drafts, notifications, brand_sections, designs` | **`200`/`204`, zero rows returned, stored value unchanged on re-read** |

The nine in the second group are precisely the tables with column-level `UPDATE` grants. A pass that
stopped at the status code would have recorded nine false "allowed" results here.

### Deletes — the same trap, the same treatment

Twenty cross-tenant `DELETE` attempts, each with a row count before and after.

- `403 / 42501` on `clients, campaigns, briefings, projects, deliverables, internal_comments,
  client_comments, published_versions, published_designs, publication_reviews, credit_accounts,
  credit_ledger, credit_requests, notifications, profiles, delivery_files, workspace_settings,
  design_versions, project_assignments, client_memberships`.
- **`200`/`204` with zero rows removed** on `brand_assets`, `brand_templates`, `template_drafts`
  and `brand_sections` — row count 1 before, 1 after, every time.

### Inserts — eleven forged parents

| Table | Result |
|---|---|
| `campaigns`, `brand_sections`, `brand_assets`, `brand_templates`, `template_drafts`, `project_assets` | `403` `42501 new row violates row-level security policy for table …` |
| `projects`, `client_comments`, `internal_comments`, `credit_ledger`, `notifications` | `403` `42501 permission denied for table …` |

### Commands — eight, with another tenant's identifiers

`save_briefing` → `Client access required`; `request_credits` → `Client access required`;
`adjust_credits` → `Agency access required`; `post_comment` → `Client channel access required`;
`review_publication` → `Client review access required`; `accept_briefing` → `Agency access required`;
`submit_briefing` → `Briefing access required`; `mark_project_delivered` → `Agency access required`.
All `403`/`42501`.

**Verdict: Verified.**

## C03 — What is actually in the bytes a client receives

**Required evidence:** inspect API responses, nested relations, browser network/cache, search, CSV
and events.

### The forbidden vocabulary, built from the database

52 strings for the REST pass and 126 for the browser pass, all read with the service role
immediately before the scan: every non-client profile id, display name and avatar; every staff email
from `auth.users`; every internal comment body and id on SABRE's projects; every internal design id
and `internal_asset_path`; every assignment's `designer_id`. The two designers are
**`Alex Morgan`** and **`Jordan Reed`**.

### Pass 1 — every table a client session can address

Thirty-two `select=*` requests, **138,259 bytes**. `design_versions`, `designs`,
`internal_comments`, `project_assignments`, `delivery_files`, `project_assets`,
`briefing_attachments`, `invitations` and `service_preset_history` each returned `[]`.

### Pass 2 — fifteen embedded-relation attempts

PostgREST resource embedding is the obvious way round a per-table policy, so it was tried
explicitly. Every embed of a forbidden relation **returned the parent row with an empty array**, not
a filtered one:

```
projects?select=id,project_assignments(*)   -> [{"id":"aea0ccab…","project_assignments":[]}, …]
projects?select=id,designs(*)               -> [{"id":"aea0ccab…","designs":[]}, …]
projects?select=id,design_versions(*)       -> [{"id":"aea0ccab…","design_versions":[]}, …]
projects?select=id,internal_comments(*)     -> [{"id":"aea0ccab…","internal_comments":[]}, …]
clients?select=id,projects(id,project_assignments(designer_id))
                                            -> [{"id":"e4401a17…","projects":[{"id":"aea0ccab…","project_assignments":[]}, …]}]
deliverables?select=id,design_versions(id,designs(id,title,content,internal_asset_path))
                                            -> [{"id":"91ff5fc4…","design_versions":[]}, …]
```

Three-level nests through `published_designs → published_versions → projects`, through
`briefings → projects → designs`, and through `notifications → projects → designs` behaved the same.

### Pass 3 — CSV, counts, and targeted single-row reads

`Accept: text/csv` is a separate representation of the same policy, and it holds: `designs`,
`internal_comments` and `project_assignments` each return a bare `\n` — no header row, no data.
`profiles` returns one row, the client's own.

Exact-count headers (`Prefer: count=exact`) report `*/0` for `designs`, `design_versions` and
`internal_comments`, so not even a cardinality escapes.

Naming a specific internal row of the client's **own** project — a real `designs` id, a real
`design_versions` id, a real `internal_comments` id, each taken with the service role — returns
`200 []`.

### Pass 4 — the browser

A Chromium client session walked **15 routes** (home, board, briefings, credits, reviews, two brand
sections, files, notifications, account, four projects, and a search for `a`) while every response
body was captured: **713 responses, 23,594,452 bytes**, including HTML documents, RSC flight
payloads, JS chunks, REST responses and image bytes. Scanned against all 126 forbidden strings:

**0 hits.**

The 48 distinct REST calls the session made are all client-scoped by construction; the only
production-shaped one is
`deliverables?select=id,project_id,format,sort_order,published_versions(version_number,published_designs(…))`
— the *published* chain, never `design_versions`.

### The one scan hit, examined

The REST pass reported a single hit: the string `Dawes Studio` in `workspace_settings`. It is a false
positive, and it is recorded rather than suppressed. `profiles` holds one agency row whose
`display_name` is `Dawes Studio`, and `workspace_settings.studio_name` is `Dawes Studio` — the
studio's own name, which is client-facing branding by design. No designer name, id, email or avatar
appears anywhere in either pass.

### The shape of the client's world

`published_designs` carries `id, project_id, publication_id, title, content, asset_path, sort_order`
— no author column exists. `client_comments` carries `author_label` and `author_kind` only; the
author identity lives in `private.client_comment_authors`, and the `private` schema is not exposed
at all (`PGRST106 Invalid schema: private`, and the same for a `Content-Profile` write). The agency
reading the same assignment sees `{"designer_id":"52711616…","profiles":{"display_name":"Jordan Reed"}}`;
the client reading it sees `[]`.

**Verdict: Verified.**

## C04 — One designer's work is not another's

**Required evidence:** direct read/write/subscription/file checks before and after reassignment.

The canonical dataset assigns **12 projects to `designer@` and 13 to `designer2@`, with no overlap**.
Each designer's `projects` list matches its own assignment set exactly and nothing else.

### Designer A against a project assigned only to Designer B

Target: `aea0ccab-…` (3 designs, 2 versions, 2 deliverables, 1 internal comment), assigned to
`designer2@` alone.

| Family | `designer@` | `designer2@` |
|---|---|---|
| `projects` | 0 rows | 1 row |
| `designs` | 0 | 3 |
| `design_versions` | 0 | 2 |
| `deliverables` | 0 | 2 |
| `internal_comments` | 0 | 1 |
| `project_assignments` | 0 | 1 |
| `briefings` (raw table) | 0 | 0 |

Writes by `designer@` on that project: `create_design_version` → `Production access required`;
`add_design` → `Production access required`; `submit_design_version` → `Production access required`;
`post_comment internal` → `Internal channel access required`; `resolve_comment` → `Comment access
required` — all `403`/`42501`. A direct `PATCH` of one of those designs answered **`204` and the
stored row was byte-identical on re-read**.

### Files

| Caller | download | sign | info |
|---|---|---|---|
| `designer@` | 400 | 400 | 400 |
| `designer2@` | **200, 1,189,854 bytes** | 200 | 200 |
| `sabre@` (client) | 400 | 400 | 400 |

`POST /object/list/internal-assets` at the bucket root returns **22 project folders to the agency and
11 to `designer@`** — every one of which is a project it is assigned to, and zero that are not.
Listing the target project's own prefix as `designer@` returns **0 entries**. Clients see **0**
entries in `internal-assets` at all.

### Revocation, over HTTP, on the disposable backend

Performed on `127.0.0.1:55521` so the canonical dataset was untouched; every assignment removed was
restored afterwards (10 before, 10 after). The designer's JWT was **not** re-issued between the two
measurements — the same unexpired token was used on both sides.

| | `projects` | `designs` | `design_versions` | `internal_comments` | `project_assignments` | internal object download |
|---|---|---|---|---|---|---|
| before `revoke_design_assignment` | 1 | 5 | 4 | 1 | 1 | **200** |
| after, same token | **0** | **0** | **0** | **0** | **0** | **400** |

Post-revocation writes: `add_design` and `create_design_version` → `Production access required`;
`post_comment internal` → `Internal channel access required`. A fresh signature request for the same
object → `400 Object not found`.

Revoking the designer's **last** assignment in that client also closed the client-level grant, which
`private.can_access_client` derives from assignments: `clients` 0, `campaigns` 0, `brand_sections` 0,
`brand_assets` 0. This matters for reading the next section correctly.

**Verdict: Verified.** See [Defect C-2](#defect-c-2-a-signed-storage-url-outlives-the-authorisation-that-minted-it), which was found here and is charged to C07, whose assertion names it.

### Observation C-3 — the seed makes the designer/client boundary untestable by inspection

`private.can_access_client` admits a designer to a client's `clients`, `campaigns`, `brand_sections`
and `brand_assets` rows if it holds **any** assignment in that client. In the canonical dataset both
designers are assigned in **all ten clients** (12 and 13 projects spread across 10 workspaces), so
each sees all 10 clients, all 12 campaigns and all 70 brand assets. That is the policy working as
written, not a leak — proven by the revocation measurement above, where removing the last assignment
in one client dropped all four families to zero. But a reader comparing counts alone cannot tell the
two apart, and no future pass should treat "the designer sees 12 campaigns" as evidence of anything.

## C05 — The designer cannot reach the client channel, credits, contact details, approval or administration

**Required evidence:** negative API/RLS checks and rendered navigation inspection.

### Reads

As `designer@`, over PostgREST, with no filter at all: `client_comments` **0**, `publication_reviews`
**0**, `published_versions` **0**, `published_designs` **0**, `credit_accounts` **0**, `credit_ledger`
**0**, `credit_requests` **0**, `briefings` (raw table) **0**, `briefing_attachments` **0**,
`template_drafts` **0**, `delivery_files` **0**, `invitations` **0**, `service_preset_history` **0**,
`client_memberships` **0**, `notifications` **0**.

**Contact details.** `clients` carries no contact column at all — a designer's row reads
`{id, name, slug, industry, initials, website, description, archived, created_at}`. `profiles`
returns exactly **one** row, the designer's own. `GET /auth/v1/admin/users` → **403**.

**The briefing projection.** `get_assigned_briefings()` returns 12 rows whose keys are
`id, client_id, campaign_id, title, service_type, status, overview, goals, direction,
requested_deliverables, due_date, created_at, updated_at`. Searched for `confirmed_credits`,
`estimated_credits` and `created_by`: **none present.**

### Commands — seventeen, all refused

`review_publication` (the client's approval command) → `Client review access required`.
`publish_version`, `adjust_credits`, `fulfill_credit_request`, `reject_credit_request`,
`create_client`, `create_invitation`, `update_workspace_settings`, `save_service_preset`,
`assign_designer` (self-assignment), `accept_briefing`, `confirm_briefing_budget`,
`mark_project_delivered`, `add_delivery_file` → `Agency access required`.
`post_comment` on the client channel → `Client channel access required`.
`request_credits` and `save_briefing` → `Client access required`. All `403`/`42501`.

### Administrative writes, with the stored value re-read

`workspace_settings` → `403 42501`, unchanged. `service_presets` → `403 42501`, unchanged.
`profiles.role` → `403 42501`, unchanged. `credit_accounts.balance` → `403 42501`, unchanged.
`clients.name` → **`204`, unchanged on re-read** (the column-level grant again).

### Rendered navigation

A designer session's sidebar reads
`My work | Search ⌘K | CLIENTS | Acme | Harbor & Pine | Kestrel Outdoor | Northfield Bank |
Otto & Sons | Pelagic | Rune Fitness | Sablefish Provisions | SABRE | Vela Skincare` —
no `Credits`, no `Settings`, no `Team`, no `Presets`, no `Workspace` entry anywhere.

Typed directly into the address bar:

| Route | What the designer gets |
|---|---|
| `/clients/<Acme>/credits` | `Credits are managed by the studio. Back to your work` |
| `/settings/workspace` | `Studio settings are private. You can manage your own account below.` |
| `/settings/team` | same |
| `/settings/clients` | same |
| `/settings/presets` | same |

`/clients/<Acme>/briefings` and `/clients/<Acme>/reviews` **do** render for a designer, and that is
the correct behaviour rather than a gap: the briefings page is fed by `get_assigned_briefings()`,
whose projection is measured above, and `features/reviews/review-data.ts` sends a designer to
`design_versions` — the internal table — never to `published_versions` or `publication_reviews`. The
head-vs-image difference in that file adds `publishedVersionStatus`, which derives a label from
`projects.status`, a column the designer already reads; it introduces no new query, so this
measurement holds at `54645f1` as well as in the running image.

### The bytes, not the page

A designer browser session walked **31 routes** across four clients while every response body was
captured: **1,315 responses, 61,353,954 bytes**. Scanned against 170 forbidden strings — every
client comment body and id, every non-empty publication review feedback and id, every credit ledger
id. **0 hits.** The session issued **0** requests to any `credit_*` endpoint.

**Verdict: Verified.**

## C06 — A forged field does not buy a role or a tenant

**Required evidence:** forged payloads and invalid parent combinations; confirm no records changed.

### Role elevation

| Attempt | Result | Stored value |
|---|---|---|
| Client `PATCH` its own `profiles.role = 'agency'` | `403` `42501` | unchanged |
| Designer `PATCH` its own `profiles.role = 'agency'` | `403` `42501` | unchanged |
| Client `PATCH` another person's `profiles.role` | `403` `42501` | unchanged |
| Client `PATCH` its own `display_name` (a granted column) | `204` | unchanged — the row is its own, and the value written equals the value already there |

`role` is not in `authenticated`'s `profiles` update grant, so the refusal is at the column.

### Sign-up metadata

Two throwaway accounts were created through `/auth/v1/signup` with
`data: { role: …, app_role: …, client_id: <SABRE> }`:

| `data.role` sent | Stored `profiles.role` | `clients` visible | `projects` visible |
|---|---|---|---|
| `agency` | **`client`** | 0 | 0 |
| `designer` | **`client`** | 0 | 0 |

Both accounts were deleted afterwards; `auth.users` is back to 13.

### Tenant relocation

Ten attempts, each with the stored row re-read afterwards. **Nothing moved.**

| Attempt | Refusal |
|---|---|
| Client moves its project to Acme (`projects.client_id`) | `403` `permission denied for table projects` |
| **Agency** moves a project to Acme | `403` `permission denied for table projects` — `client_id` is outside the column grant for every role |
| Client moves its briefing to Acme | `403` `permission denied for table briefings` |
| Client moves its brand section to Acme | `204`, unchanged (policy, silent) |
| Client moves its brand asset to Acme | `204`, unchanged (policy, silent) |
| Client moves its draft to Acme (`template_drafts.client_id`) | `403` `permission denied` |
| Client re-owns its draft to a designer (`owner_id`) | `403` `permission denied` |
| Client moves a client comment to an Acme project | `403` `permission denied` |
| Designer repoints a design to another project | `403` `permission denied for table designs` |
| Client marks another user's notification read | `204`, unchanged (policy, silent) |

### Forged author, owner and channel

| Attempt | Refusal |
|---|---|
| `INSERT template_drafts` with someone else's `owner_id` | `42501 new row violates row-level security policy` |
| `INSERT template_drafts` in another client's workspace | `42501 new row violates row-level security policy` |
| `INSERT client_comments` with `author_kind: "studio"`, `author_label: "Studio"` | `42501 permission denied for table client_comments` |
| `INSERT internal_comments` with a designer's `author_id` | `42501 permission denied` |
| Designer `INSERT project_assignments` for itself | `42501 permission denied` |
| `INSERT credit_ledger` | `42501 permission denied` |
| Designer `INSERT project_assets` naming another project's bytes | `42501 new row violates row-level security policy` |
| Client `post_comment` on `internal` | `42501 Client → Internal channel access required` |
| Designer `post_comment` on `client` | `42501 Client channel access required` |
| Client `post_comment` on an invented channel `studio` | `400` `P0001 Invalid comment channel` |
| Client `resolve_comment` on an internal comment | `42501 Comment access required` |

Only the agency can author a `Studio` message, and it does so through `post_comment`, which derives
`author_kind` from `private.is_agency()` rather than from the request.

### Transport

`apikey: <service role>` combined with `Authorization: Bearer <client JWT>` still returns the client's
one row (`[{"name":"SABRE"}]`) — PostgREST resolves the role from the `Authorization` token, and the
`apikey` header cannot upgrade it. `Accept-Profile: private` and `Content-Profile: private` are both
refused with `PGRST106 — Only the following schemas are exposed: public`.

**Verdict: Verified.**

## C07 — Private assets

**Required evidence:** real storage download/upload/signed-access tests, including metadata.

Everything in this row passes except one clause, and that clause is the reason for the verdict.

### Guessed and mistyped object keys

| Key | agency | designer1 | designer2 | SABRE | Acme |
|---|---|---|---|---|---|
| A real internal object in a project designer1 is **not** assigned to | 200 | **400** | 200 | 400 | 400 |
| A real internal object in a project designer1 **is** assigned to | 200 | 200 | **400** | 400 | 400 |
| `<own project>/../<other project>/<real object>` (path traversal) | 200 | **400** | 200 | 400 | 400 |
| A fabricated UUID under the caller's own project prefix | 400 | 400 | 400 | 400 | 400 |
| A delivery file of another tenant | 200 | 400 | 200 | **400** | **400** |
| A published asset of another tenant | 200 | 400 | 400 | **400** | 400 |

The traversal attempt normalises to the other project's real path and is then refused by the same
policy as the direct request — the URL shape buys nothing.

### Listing and metadata

Bucket-root listings are policy-scoped, not merely hidden by the interface:

| Bucket | agency | designer1 | designer2 | SABRE | Acme |
|---|---|---|---|---|---|
| `internal-assets` | 22 | 11 | 11 | **0** | **0** |
| `brand-assets` | 10 | 10 | 10 | **1** | **1** |
| `delivery-files` | 1 | 0 | 1 | **0** | **0** |
| `published-assets` | 14 | 0 | 0 | **4** | **0** |
| `briefing-files` | 0 | 0 | 0 | 0 | 0 |

`/object/info/authenticated/…` — the metadata endpoint, separate from the bytes — returns `400` for
every caller that is refused the object itself.

### Uploads

Nine attempts to write into a prefix the caller does not own. **All nine refused**, with
`{"statusCode":"403","error":"Unauthorized","message":"new row violates row-level security policy …"}`:
client → `brand-assets`, `internal-assets`, `published-assets`, `delivery-files` of another tenant;
designer → an unassigned project's `internal-assets`, and `published-assets` / `delivery-files` of
its **own** project; and the **agency** → `published-assets` and `delivery-files`, which only the
trusted worker may write.

### Signatures

A signature is bound to the exact object: taking a valid signed URL for one path and substituting
another project's path yields `400 InvalidSignature`. The claim body is
`{"url":"internal-assets/<project>/<object>.png","iat":…,"exp":…}` — no caller identity, which is the
root of the next finding.

**Verdict: Verified (2026-09-21).** The clause *"stale authorization cannot expose internal or
other-client files"* originally failed; see
[Defect C-2](#defect-c-2-a-signed-storage-url-outlives-the-authorisation-that-minted-it) and its
resolution. A signature still cannot be revoked — nothing in `{url, iat, exp}` can be — but the
board's TTL is now 600 and the revocation scenario was re-run at that value: the URL served through
t+570s and answered `400` at t+600s. The clause holds within a bounded ten-minute window rather than
an hour, and every other clause of the row passed unchanged.

## C09 — Realtime, search and notifications obey the same scope as a plain read

**Required evidence:** two simultaneous scoped sessions and captured unauthorized subscription and
search results.

### Realtime

`supabase/tests/realtime_boundary_test.mjs` was run nine times against this build: **eight passes**,
and one failure on the first invocation of the session, recorded in full above. Each run opens
**four simultaneous authenticated subscriptions** (agency, `designer@`, `sabre@`, `acme@`) to
`internal_comments`, `client_comments`, `design_versions` and `designs`, then asserts that an
internal comment reaches agency and designer only, a client comment reaches agency and client only,
new versions and designs reach producers only, the second tenant receives **nothing at all**, and no
`DELETE` event is broadcast.

### Search

The global search page issues four plain PostgREST queries (`clients`, `projects`, `briefings`,
`brand_assets`, each `ilike`). They were issued verbatim under four sessions and seven terms:

| Term | agency | designer1 | SABRE | Acme |
|---|---|---|---|---|
| `a` | 7 / 22 / 26 / 30 | 7 / 11 / n-a / 30 | 1 / 6 / 7 / 7 | 1 / 2 / 3 / 7 |
| `Acme` | 1 / 2 / 2 / 0 | 1 / 1 / n-a / 0 | **0 / 0 / 0 / 0** | 1 / 2 / 2 / 0 |
| `SABRE` | 1 / 0 / 0 / 0 | 1 / 0 / n-a / 0 | 1 / 0 / 0 / 0 | **0 / 0 / 0 / 0** |
| `Northfield` | 1 / 2 / 2 / 0 | 1 / 1 / n-a / 0 | **0 / 0 / 0 / 0** | **0 / 0 / 0 / 0** |
| `Deck` | 0 / 1 / 1 / 0 | **0 / 0** / n-a / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |

*(clients / projects / briefings / brand_assets)*

A client searching another tenant's name finds nothing — not a filtered list, an empty one. The
designer's counts equal its assignment set, never the whole 25.

The page skips the briefings query for a designer in JavaScript. That is a convenience, not the
boundary: **the same query issued directly by a designer returns `200` with 0 rows**, because
`briefings_read` does not admit the role at all. The rule is in the database.

### Notifications

| Session | rows | unread | rows belonging to other users | `Prefer: count=exact` header |
|---|---|---|---|---|
| agency | 0 | 0 | 0 | `*/0` |
| designer1 | 0 | 0 | 0 | `*/0` |
| SABRE | 4 | 4 | 0 | `0-3/4` |
| Acme | 0 | 0 | 0 | `*/0` |
| *(service role)* | **15** | — | — | — |

### Counts cannot be used to feel out what is hidden

Exact counts over ten families, compared with the truth:

| Session | designs | design_versions | internal_comments | client_comments | published_designs | briefings | projects | clients | brand_assets | template_drafts |
|---|---|---|---|---|---|---|---|---|---|---|
| truth | 47 | 44 | 22 | 57 | 22 | 30 | 25 | 10 | 70 | 10 |
| agency | 47 | 44 | 22 | 57 | 22 | 30 | 25 | 10 | 70 | **0** |
| designer1 | 32 | 30 | 11 | **0** | **0** | **0** | 12 | 10 | 70 | **0** |
| SABRE | **0** | **0** | **0** | 16 | 6 | 9 | 7 | 1 | 7 | 1 |
| Acme | **0** | **0** | **0** | 2 | **0** | 3 | 2 | 1 | 7 | 1 |

The agency's `template_drafts` count of 0 is C08 holding: drafts are owner-scoped and the agency owns
none. The designer's `clients` 10 and `brand_assets` 70 are [Observation C-3](#observation-c-3--the-seed-makes-the-designerclient-boundary-untestable-by-inspection).

**Verdict: Verified.**

## C11 — A parent from one tenant cannot be attached to a child from another

**Required evidence:** invalid cross-client parent-ID combinations against database constraints and
API commands; no changed records.

Two tenants were used throughout — **SABRE** (`e4401a17…`, project `aea0ccab…`) and **Harbor & Pine**
(`97902ff1…`, project `0b135ab6…`), both with deliverables, versions, designs, publications and
published designs, so every case names a real foreign row. The whole script ran inside one
transaction with a savepoint per case and a final `ROLLBACK`; the closing count of probe-marked rows
across twelve tables was **0**.

Pass 1 ran as the **table owner**, so grants and RLS were out of the way and only a constraint could
refuse.

| # | Attempt | Refused by |
|---|---|---|
| 1 | Project of A carries a campaign of B | FK `projects_campaign_id_client_id_fkey` |
| 2 | Project of A carries a briefing of B | FK `projects_briefing_id_client_id_fkey` |
| 3 | Briefing of A carries a campaign of B | FK `briefings_campaign_id_client_id_fkey` |
| 4 | Version of A on a deliverable of B | FK `design_versions_deliverable_id_project_id_fkey` |
| 5 | Design of A on a version of B | FK `designs_version_id_project_id_fkey` |
| 6 | Publication of A on a deliverable of B | FK `published_versions_deliverable_id_project_id_fkey` |
| 7 | Snapshot of A under a publication of B | FK `published_designs_publication_id_project_id_fkey` |
| 8 | Client comment on A pinned to a publication of B | FK `client_comments_publication_id_project_id_fkey` |
| 9 | Client pin on A naming a published design of B | FK `client_comments_design_id_project_id_publication_id_fkey` |
| 10 | Internal pin on A naming a design of B | FK `internal_comments_design_id_project_id_version_id_fkey` |
| 11 | Repointing an existing review of B at a project of A | FK `publication_reviews_publication_id_project_id_fkey` |
| 12 | Repointing an existing debit of B at client A | trigger `private.reject_mutation` — `This record is immutable` |
| 13 | Draft in A built from a template of B | FK `template_drafts_template_id_client_id_fkey` |
| 14 | Brand asset of A under the storage prefix of B | CHECK `brand_asset_scope_valid` |
| 15 | Delivery file of A under the storage prefix of B | CHECK `delivery_asset_scope_valid` |
| 16 | Snapshot of A pointing at the bytes of B | CHECK `published_design_asset_scope_valid` |
| 17 | Internal design of A pointing at the bytes of B | CHECK `internal_design_asset_scope_valid` |
| 18 | Moving an existing project of A into B | FK `credit_ledger_project_id_client_id_fkey` still references it |
| 19 | Moving an existing briefing of A into B | FK `projects_briefing_id_client_id_fkey` still references it |
| 20 | Moving an existing campaign of A into B | FK `briefings_campaign_id_client_id_fkey` still references it |
| 21 | Moving a brand asset of A into B | CHECK `brand_asset_scope_valid` |
| 22 | Repointing a deliverable of B at a project of A | FK `design_versions_deliverable_id_project_id_fkey` still references it |
| 23 | Repointing a published design of B at a project of A | trigger `private.reject_mutation` — `This record is immutable` |

The pattern is structural, not incidental: `campaigns`, `briefings`, `projects`, `deliverables`,
`design_versions`, `designs`, `published_versions`, `published_designs` and `brand_templates` each
carry a `UNIQUE (id, <tenant column>)`, and every child references the **pair**. A tenant cannot be
changed on one side of a relationship without breaking the other.

Pass 2 ran the same shapes through the API commands as the agency — the role that *can* create these
parents:

| Attempt | Refusal |
|---|---|
| `save_briefing` with a campaign of B | FK `briefings_campaign_id_client_id_fkey`, raised from inside the function |
| `add_delivery_file` with a storage path of B | `P0001 Approve all deliverables before adding final files` |
| `post_comment` on A pinning a publication of B | FK `client_comments_publication_id_project_id_fkey` |
| `publish_version` of A naming prepared bytes of B (on a **fresh** version, so the idempotent retry path could not mask it) | `P0001 A trusted sanitized publication asset is required for this design` |
| `add_briefing_attachment` on a briefing of B | `P0001 Draft briefing access required` |

Finally, a browser session cannot reach any of these tables directly in the first place:
`authenticated` holds **no `INSERT` grant** on `projects`, `briefings`, `deliverables`,
`design_versions`, `designs`, `published_versions`, `published_designs`, `publication_reviews`,
`client_comments`, `internal_comments`, `credit_ledger` or `delivery_files`.

**Verdict: Verified.**

## C12 — Client-facing text and files, and what is not in the bundle

**Required evidence:** injection cases, browser bundle/config inspection and authentication review.

### Injection, through the product's own control

Three payloads were typed into the client conversation box on a real project as `sabre@` and sent
with the product's own **Send message** button — not inserted into the database behind the interface:

```
<script>window.__familyC = "executed";</script>
<img src=x onerror="window.__familyC='executed'">
"><svg onload="window.__familyC='executed'">
```

| Check | Result |
|---|---|
| Rendered verbatim as text | **true** for all three |
| `window.__familyC` | `undefined`, before and after a full page reload |
| Dialogs raised | **0** |
| `img[src="x"]` nodes created | **0** |
| `svg[onload]` nodes created | **0** |
| The stored payload in the DOM | `<p>&lt;script&gt;window.__familyC = "executed";&lt;/script&gt;</p>` |

All three comments were removed afterwards; `client_comments` is back to 57.

There is **no** `dangerouslySetInnerHTML`, `innerHTML`, `eval(`, `new Function(` or `document.write`
anywhere in `apps/web/app`, `apps/web/features` or `apps/web/lib`.

### Files

Downloads go through `saveBlob`, which sets `anchor.download` — the browser saves rather than
navigates — and sanitises the filename against `[<>:"/\\|?*\u0000-\u001f]`, so a crafted name can
neither escape the download folder nor be navigated to. SVG brand assets are rendered through
`<img src={signedUrl}>`, which does not execute script content. The application's own responses carry
`Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`,
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
and `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
[Observation C-4](#observation-c-4--storage-serves-svg-inline-on-its-own-origin) records what the
storage origin does not set.

### The bundle

Six served documents (`/`, `/login`, `/home`, `/search`, `/notifications`, `/settings/workspace`) and
all **18** `_next/static` chunks they reference were downloaded — **1,453,484 bytes** — and searched:

| Searched for | Occurrences |
|---|---|
| The service-role key's literal value | **0** |
| `DEMO_PASSWORD`'s literal value | **0** |
| The strings `service_role` / `SERVICE_ROLE` | **0** |
| `__NEXT_DATA__`, `process.env.*`, `NEXT_PUBLIC_*` left in output | **0** |
| The anon key | 6 files — expected; its JWT claim is `{"role":"anon"}`, it grants nothing, and thirty tables refuse it outright (see C01) |

`role selector`, `switch role`, `impersonat…`, `preview as`, `demo mode`, `view as client/designer/agency`
and `sign in as`: **no match anywhere in the served application**. Authority comes from a real
password sign-in against GoTrue and the `role` on the caller's own `profiles` row, which no request
can change (C06).

### The one privileged server route

`POST /api/invitations` is the only server-side surface that holds the service-role key.

| Request | Response |
|---|---|
| No bearer | `401 Sign in before inviting a teammate.` |
| Client bearer, `role: "agency"` | `403 Only the studio can send invitations.` |
| Client bearer, `role: "client"` | `403 Only the studio can send invitations.` |
| Designer bearer, `role: "designer"` | `403 Only the studio can send invitations.` |
| Garbage bearer | `401 Your session has expired. Sign in again.` |
| Client bearer with `Origin: http://evil.example` | `403 This request must come from your workspace.` |

**Verdict: Verified.**

---

## Defect C-1 — An access token keeps working after sign-out

**Severity: Medium.** Recorded against **C01**, which stays Verified: the product's sign-out does
destroy the session, and this is about a token that was already in someone else's hands.

Signing out revokes the refresh token and clears the browser, but the **access token already issued
stays valid at PostgREST, for reads and writes, until its own expiry** — one hour in this
installation.

**Reproduction.**

```
POST /auth/v1/token?grant_type=password   (sabre@client.dawes.local)
  -> access_token, claims {"exp": iat+3600, "role":"authenticated", "session_id":"c64e834f-…"}
POST /auth/v1/logout?scope=global         (with that token)  -> 204
POST /auth/v1/token?grant_type=refresh_token (the refresh token) -> 400 refresh_token_not_found
GET  /auth/v1/user                        (the same access token) -> 403
GET  /rest/v1/clients                     (the same access token) -> 200, 1 row
GET  /rest/v1/projects | published_designs | client_comments
     | credit_accounts | notifications | brand_sections            -> 200, rows returned
POST /rest/v1/rpc/post_comment            (the same access token) -> 200, a comment was created
```

The comment that last call created, and its notification, were deleted immediately; the dataset is
back to 57 and 15.

GoTrue answers `403` on its own `/user` endpoint after sign-out, so the session **is** known to be
gone — but PostgREST validates the JWT signature and expiry alone and never consults it. This is
Supabase's documented default rather than a bug this codebase introduced, and closing it means either
shortening `JWT_EXPIRY` or having PostgREST check `session_id`. It is recorded so that "sign-out
works" is never read as "the token stops working".

**Resolution (2026-09-21).** The first of the two was taken: `supabase/config.toml` now sets
`jwt_expiry = 900`, and the local stack was restarted — not reset — for it to take effect. A token
issued afterwards decodes to `exp - iat = 900` and GoTrue reports `expires_in: 900`, so the running
stack, not only the file, issues fifteen-minute tokens. The post-sign-out window is a quarter of what
was measured above. The mechanism is unchanged and unfixable at this layer, so the number is the
control; its reason is recorded in
[permissions.md](../architecture/permissions.md#revocation-cannot-reach-a-credential-that-was-already-issued).

## Defect C-2 — A signed storage URL outlives the authorisation that minted it

**Severity: Medium.** This is why **C07 is Unverified**: its assertion names *stale authorization*
explicitly.

A designer who holds an assignment may mint a signed URL for an internal object with an expiry of its
own choosing. Revoking the assignment removes every other form of access **immediately** — but the
signature already minted keeps serving the bytes, to anyone, for its full lifetime.

**Reproduction** (performed on the disposable backend `127.0.0.1:55521`; the assignment was restored
afterwards):

```
designer@ : POST /storage/v1/object/sign/internal-assets/<project>/<object>.png {"expiresIn":3600}
            -> 200, signedURL
agency    : POST /rest/v1/rpc/revoke_design_assignment                          -> 204
designer@ : GET  /rest/v1/projects?id=eq.<project>                              -> 0 rows
designer@ : GET  /storage/v1/object/authenticated/internal-assets/<…>           -> 400
designer@ : POST /storage/v1/object/sign/internal-assets/<…>                    -> 400 Object not found
anonymous : GET  /storage/v1<signedURL>                                         -> 200, 2,726 bytes
```

The signature's claim body is `{"url":"internal-assets/<project>/<object>.png","iat":…,"exp":…}`. It
carries no subject and no session, so nothing in it can be revoked or checked against the caller's
current grants; the Storage API verifies the signature and the path, and serves the file.

The exposure is bounded by the chosen TTL, and the product's own call sites are short —
`features/brand/brand-data.ts` uses 300 and 600 seconds, `features/projects/project-data.ts` 300 —
but `features/board/board-data.ts` mints **3600-second** thumbnail URLs, and `expiresIn` is a caller
argument that any authenticated session can set for itself. Every other clause of C07 passes; this
one does not, and the row stays open until it does.

**Resolution (2026-09-21).** `THUMBNAIL_TTL` is now **600**, matching the nearest sibling call site;
the other three were already short and were left alone. The scenario was re-run on the same
disposable backend at the new value:

```
designer@ : POST /storage/v1/object/sign/internal-assets/<project>/<object>.png {"expiresIn":600}
            -> 200, signedURL
agency    : POST /rest/v1/rpc/revoke_design_assignment                          -> 204
designer@ : GET  /rest/v1/projects?id=eq.<project>                              -> 0 rows
designer@ : GET  /storage/v1/object/authenticated/internal-assets/<…>           -> 400
anonymous : GET  /storage/v1<signedURL>   at t+0s … t+570s (20 probes, 30s apart) -> 200, 2,730 bytes
anonymous : GET  /storage/v1<signedURL>   at t+600s                             -> 400
```

The URL served for exactly the ten minutes it was signed for and then stopped, and the assignment was
restored afterwards (10 per designer, as before). The signature still outlives the revocation — nothing in a
`{url, iat, exp}` claim body can be revoked — but the exposure is now bounded at ten minutes rather
than an hour, and the board re-mints on render so nothing observable was traded for it. `600` is
pinned by `apps/web/features/board/board-data.test.ts` and its reason is recorded in
[permissions.md](../architecture/permissions.md#revocation-cannot-reach-a-credential-that-was-already-issued).

## Observation C-3 — the seed makes the designer/client boundary untestable by inspection

Recorded in full under [C04](#c04--one-designers-work-is-not-anothers). Both designers hold an
assignment in all ten clients, so client-level counts cannot distinguish the policy from an absence
of one. A future pass should use the revocation measurement, not the counts.

## Observation C-4 — storage serves SVG inline on its own origin

`GET /storage/v1/object/authenticated/brand-assets/<svg>` returns `200` with
`Content-Type: image/svg+xml` and **no** `Content-Disposition` and **no** `X-Content-Type-Options`.
A stored SVG navigated to directly would therefore render, and any script in it would run — on the
Supabase origin (`127.0.0.1:55421`), not the application's, so it could not read the session in the
application's `localStorage`.

This is not counted against C12, because the application never navigates to a storage URL: brand
images go into `<img src>` (which does not execute SVG script) and every download goes through
`saveBlob`, which sets `anchor.download`. It is recorded because the exposure would become real for
anyone who later links to a storage URL directly, and because the storage origin is the one surface
in this installation with no `nosniff`.

## Dataset integrity

Twenty-three tables plus `auth.users` and `storage.objects`, counted immediately after the full pass:

| clients | projects | campaigns | briefings | brand_assets | brand_sections | brand_templates | template_drafts |
|---|---|---|---|---|---|---|---|
| **10** | **25** | **12** | **30** | **70** | 80 | 70 | 10 |

| notifications | client_comments | internal_comments | design_versions | designs | credit_ledger | published_versions | published_designs |
|---|---|---|---|---|---|---|---|
| 15 | 57 | 22 | 44 | 47 | 36 | 18 | 22 |

| publication_reviews | project_assignments | deliverables | delivery_files | project_assets | auth.users | storage.objects |
|---|---|---|---|---|---|---|
| 18 | 25 | 30 | 1 | 0 | 13 | 116 |

Every figure matches the recorded baseline. `design_versions` 44 and `designs` 47 are the known
pre-existing drift against the recorded 41/46; they were present before this pass began and were not
touched.

Three probe writes reached the canonical backend and all three were reversed by identifier in the
same session: one `client_comments` row and its notification created by the C01 token-lifetime
reproduction, and three `client_comments` rows created by the C12 injection test. The counts above
are the proof. Every other mutation this pass attempted was refused, which is the point of the pass.
The disposable backend's assignments were restored to 10 per designer.

The throwaway Playwright spec `apps/web/tests/e2e/evidence-probe-family-c.spec.ts` and every scratch
HTTP and SQL probe were deleted; `apps/web/tests/e2e/` holds only the twelve files it held before.

# Acceptance family G — Brand Hub and assets

Measurement pass for rows **G01–G14** of [`docs/architecture/acceptance-matrix.md`](../architecture/acceptance-matrix.md).
This is evidence, not repair: no application code, CSS, data module, migration or existing test was
changed while producing it.

| Field | Value |
|---|---|
| Date | 2026-09-21 |
| Branch | `main` at `142dd21` |
| Application under test | `http://localhost:3003`, container `dawes-studios-app-web-1`, image `dawes-studios-web:local` built `2026-09-21T12:30:41Z` from `6bc6228` |
| Image vs. head | `git diff 6bc6228 HEAD -- apps/web` touches ten files, all under `features/board`, `features/projects` and `features/reviews`. Nothing under `features/brand`, `features/assets`, `features/briefings`, `features/shared`, `app/` or `supabase/` differs, so family G's surface in the running image is head's. |
| Backend | `supabase_db_dawes-studios` (local Docker stack), PostgREST on `127.0.0.1:55421` |
| Driver | A throwaway Playwright probe, `apps/web/tests/e2e/evidence-probe-family-g.spec.ts`, seven tests, deleted after the run. Every measurement below is a line it printed with the `FG\|` prefix. |
| Accounts | `studio@dawes.local` (the only agency user), `designer@dawes.local` / `designer2@dawes.local`, `sabre@client.dawes.local`, `acme@client.dawes.local` (a second tenant), plus one throwaway client user per intake fixture |
| Fixtures | `createIntakeFixture` / `cleanupIntakeFixture` (`tests/e2e/intake-fixture.ts`) for every brand write, and `createProductionFixture` / `cleanupTestProject` (`tests/e2e/project-fixture.ts`) for the two project-file tests |
| Result | **All twelve open rows Verified.** Two findings are recorded separately: [Defect G-1](#defect-g-1-explore-reference-files-lands-on-an-empty-list-for-every-client) (a reference link that is a dead end in the canonical dataset) and [Finding G-2](#finding-g-2-six-of-the-eight-brand-sections-are-byte-identical-across-all-ten-clients). Neither contradicts a row's assertion; both are defects in the seeded dataset rather than in the feature, and both are recorded rather than repaired. |
| Artefact | [`screenshots/family-g-photography-reference-dead-end.png`](screenshots/family-g-photography-reference-dead-end.png) |

## Dataset integrity

Twenty-one tables, `auth.users` and two storage buckets counted immediately before and after the
full run of the three existing brand specs plus the seven-test probe (16 tests, 45.8 s). Identical
on both sides:

| clients | projects | campaigns | briefings | design_versions | designs | notifications | brand_sections | brand_assets | brand_templates | template_drafts | project_assets |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 10 | 25 | 12 | 30 | 44 | 47 | 15 | 80 | 70 | 70 | 10 | 0 |

| published_designs | published_versions | delivery_files | publication_reviews | credit_ledger | internal_comments | client_comments | project_assignments | deliverables | auth.users | storage `internal-assets` | storage `brand-assets` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 22 | 18 | 1 | 18 | 36 | 22 | 57 | 25 | 30 | 13 | 27 | 70 |

`design_versions` 44 and `designs` 47 are the known pre-existing drift against the recorded baseline
of 41/46; they were present before this pass began and were not touched. Every mutation this pass
performed happened inside an `Acceptance Intake …` client or an `Acceptance …` project, removed by
`cleanupIntakeFixture` or `cleanupTestProject`; the one draft created on the seeded SABRE workspace
was deleted by id in the test's own `finally` block, which is why `template_drafts` returns to 10.

## What the existing specs already proved

Before re-proving anything, the three specs that touch family G were run against this build. All
three pass, and they carry rows **G03** and **G08**, which were already Verified and are not
re-opened here.

| Spec | Rows it partly covers | What it already establishes | What it does not |
|---|---|---|---|
| `tests/e2e/brand-guidance.spec.ts` | G01, G04, G05, G07, G09, G10, G11, G12 | On an isolated intake client: agency edits to six sections saved and survived a reload, read back field by field in the editor; the four colour copy formats with the clipboard denied; the heading font-source link's `href`; live sample text in both type previews; three products with their asset links; the brand context containing `Use:`/`Never:`/`Terminology:`; a client and a designer `UPDATE` on `brand_sections` returning zero rows; a client browser traversal of all ten sections with no `Edit` control; a failed brand-asset registration retried onto the same storage path and an abandoned one whose orphan is removed; seven template rows opened through one editor with CTA, headline and preview zoom saved and resumed after a reload. | No designer browser traversal and no agency traversal on more than one client; no check that a section renders **that** client's record; no `INSERT` or `DELETE` refusal, and no re-read of the stored value after a refused `UPDATE`; no invalid-input rejection anywhere; no rendered read-side assertion for visual style or typography's scale; no cross-product mixing check; no resume of a draft after leaving the editor; no second-account read of a draft; no missing-draft recovery; no record-count comparison for G10; no network inspection for G12; nothing about the briefing reuse journey (G02) or the files library (G13). |
| `tests/e2e/brand-accessibility.spec.ts` | G01, G09, G10, G14 | Ten sections at six viewport widths with zero axe violations and no horizontal overflow; keyboard focus containment in the mobile drawer and in an edit dialog; one private draft saved, reloaded and rendered at two widths; a real brand-asset upload, search and download; a client session that cannot open the agency's draft page and sees no `Edit overview`. | The draft-privacy check is the **page**, which filters by `owner_id` in the query itself — it cannot distinguish a policy refusal from a client-side filter. No direct API read by another account, no write or delete attempt, and nothing about the agency reading a client's draft. |
| `tests/e2e/brand-canvas-final.spec.ts` | G03, G08, G14 | SVG/PNG/PDF logo records for SABRE; logo usage and approved-variations guidance; the library link; real PNG and PDF bytes by signature; a PDF detail dialog with no `iframe`/`embed`/`object`; search, category filter, the no-results state, `Clear filters`, the detail dialog and a copied reference that reopens the asset. | Nothing for SVG's detail dialog; no rejected file type; no cross-tenant storage attempt. |

Everything below is what this pass added.

---

## G01 — Ten sections, three roles, client-correct content, canonical writes refused

**Required evidence:** three-role section traversal and direct read/write tests.

**What was done.** All ten sections were opened, one navigation click or URL at a time, in three
independent browser contexts, and every canonical write a non-agency role could attempt was issued
directly against PostgREST and then **re-read from the database**, because a refused `UPDATE` on
these tables answers `204` with no error (see [Observation G-3](#observation-g-3-a-refused-update-still-answers-204)).

**Measured.**

| Check | Result |
|---|---|
| Agency, SABRE and Acme, ten sections each | `Brand Hub` heading present, the section row's `aria-current="page"` equals the expected label, exactly **1** `Edit …` control on each of the eight editable sections and **0** on `assets` and `templates` |
| Designer (`designer@`), SABRE, ten sections | all reachable, **0** `Edit …` controls |
| Client (`sabre@`), SABRE, ten sections | all reachable, **0** `Edit …` controls |
| Client (`sabre@`) → Acme's `/brand/overview` | `Brand Hub unavailable.` |
| Rendered identity vs. the record | SABRE's overview hero `h2` = `SABRE`, Acme's = `Acme`, each equal to its own `brand_sections.content->>'name'`; SABRE's hero is not Acme's name |
| Acme client reading SABRE `brand_sections` | **0 rows** |
| Designer reading the unrelated fixture client's `brand_sections` | **0 rows** (`can_access_client` admits a designer only where they hold an assignment, and the fixture client has no project) |

Write attempts, each followed by re-reading `brand_sections.content` for SABRE's overview:

| Caller | `UPDATE` | `INSERT` | `DELETE` | Stored value afterwards |
|---|---|---|---|---|
| `sabre@client.dawes.local` | no error, **0 rows** | **`42501`** | **0 rows** | unchanged |
| `designer@dawes.local` | no error, **0 rows** | **`42501`** | **0 rows** | unchanged |

A brand file is scoped to its tenant in storage as well as in its table: the SABRE client
downloading Acme's `brand-assets` object was refused (`Object not found`), a signed URL for it was
refused, and the same session downloaded SABRE's own object successfully — **451 bytes**.

The agency's own edit was made on the isolated fixture so the seed stayed pristine: five messaging
fields saved through the product's editor, then read back from the rendered page after a reload and
from the stored JSON —
`{"cta": "Read the guidance", "rules": ["Say what is true.", "Name the product plainly."], "headline": "A measured headline", "description": "Support that stays true.", "terminology": ["Studio", "Collection"]}`.

**Verdict: Verified.** Note that "client-correct content" is verified through the two fields that
actually differ between clients; see [Finding G-2](#finding-g-2-six-of-the-eight-brand-sections-are-byte-identical-across-all-ten-clients).

## G02 — Overview, visual style and messaging feed the briefing

**Required evidence:** save/reload/briefing reuse journey and client isolation.

**What was done.** `briefing-model.ts`'s `brandDefaults` reads exactly three fields —
`overview.audience`, `visual-style.photography` and `messaging.headline` — through
`useBriefingBrand`, which selects only those three sections. All three were saved through the Brand
Hub editor on an isolated fixture client, reloaded, and then the briefing editor was driven for that
client and for SABRE.

**Measured.**

| Step | Result |
|---|---|
| Saved and reloaded on the fixture client | Audience `Curators of quiet interiors`, photography `Low-contrast daylight on matte surfaces`, headline `Room to think`, all rendered after a reload |
| `/briefings/new` → `Digital Ad (Static)` → `Continue to details` → `Brand direction & additional details` | `Audience` = `Curators of quiet interiors`, `Visual style` = `Low-contrast daylight on matte surfaces`, `Key messaging` = `Room to think`; the source note reads **`From Brand Hub`** |
| Overwriting `Audience` by hand | the source note changes to **`Customized for this project`** |
| `Use brand defaults` | restores the stored audience exactly |
| The same route for SABRE | `Audience` = `Curious people who value purposeful design.` — SABRE's own stored value, and **not** the fixture's |
| SABRE client reading the fixture client's `brand_sections` | **0 rows** |

The note is not cosmetic: it tracks `direction.source`, which the editor clears on a manual edit and
`Use brand defaults` restores, so a reader can always tell whether the direction in front of them is
the brand's or this project's.

**Verdict: Verified.**

## G04 — Colours: valid data, four copy formats, invalid edits rejected

**Required evidence:** conversion/validation checks and real clipboard/fallback behavior.

**What was done.** The palette editor was driven with an invalid value, with an empty palette, and
with a short HEX, and the stored row was read after each. All four copy formats were then taken with
`navigator.clipboard.writeText` forced to throw.

**Measured.**

| Input | Refused by | Message | Stored |
|---|---|---|---|
| `#12345` | the input's own `pattern="#[a-fA-F0-9]{3}([a-fA-F0-9]{3})?"` — `validity.patternMismatch === true`, `"Please match the requested format."` | native constraint validation; the form's `onSubmit` never runs | **0 rows** for the section |
| An empty palette | `sectionSchemas.colors`' `min(1)`, surfaced through `validationMessage` in the dialog's `role="alert"` | **`Add at least one color.`** | **0 rows** |
| `#abc` | accepted | — | `{"palette": [{"hex": "#AABBCC", "name": "Paper Warm"}]}` — normalised to six digits and upper case by `hexColor`'s transform |

Copy formats, comparing the rendered `<code>` **and** the manual-copy dialog's value:

| Format | Rendered and copied |
|---|---|
| HEX | `#AABBCC` |
| RGB | `rgb(170, 187, 204)` |
| CSS | `--brand-paper-warm: #AABBCC;` |
| Tailwind | `bg-[#AABBCC] text-[#AABBCC] border-[#AABBCC]` |

With the clipboard denied every one of the four fell back to the accessible `Copy this text` dialog
carrying the identical string, so the fallback is the real path and not a decoration.

**A note on which layer refuses what.** The HEX field is refused by the browser before the schema is
reached, so this run exercises the `pattern` and the `min(1)` rule but not `hexColor`'s own regex
through the UI — the two express the same rule, and the schema side is covered by
`brand-model.test.ts`. What matters for the row is that the invalid edit is refused and **nothing is
stored**, which was confirmed against the database in both cases.

**Verdict: Verified.**

## G05 — Typography hierarchy, sample text, font source, persistence

**Required evidence:** rendered sample, link validation and persistence check.

**Measured.**

| Input | Result |
|---|---|
| `headingSource` = `http://insecure.example.com/inter` | refused with **`Use a complete HTTPS font source URL.`** — `safeFontSource` accepts `https:` only, and rejects a URL carrying credentials |
| `scale` = `14, 200` | refused with **`Type sizes must be 144 px or smaller.`** |
| `scale` = `14, 20, 32, 48`, valid HTTPS sources | saved |

After a reload: the type scale rendered `14`, `20`, `32`, `48` in order; the two type cards read
`Inter` (headings) and `Arial` (body); typing `Readable custom sample` into `Try a few words`
changed both the `.brand-type-heading` and the `.brand-type-body` preview at once; and the
`Headings font source` link carried `href="https://rsms.me/inter/"`, `rel="noopener noreferrer"` and
`target="_blank"`.

**Verdict: Verified.**

## G06 — Visual style: reference detail, Use/Avoid, persistence

**Required evidence:** browser read/edit/reload journey.

**What was done.** All four fields were edited through the dialog, saved, and then read from the
**rendered page** after a full reload — not from the editor, which is what
`brand-guidance.spec.ts` already checks.

**Measured, after reload.**

| Panel | Rendered |
|---|---|
| `Photography direction` | `Soft daylight, matte surfaces.` |
| `Visual principles` | `Natural texture`, `Honest materials` |
| `Use` | `Simple compositions`, `Generous whitespace` |
| `Avoid` | `Busy backgrounds`, `Heavy filters` |
| `Explore reference files` | `href="/clients/<id>/brand/assets?category=Photography"` |

The Use and Avoid lists are rendered as two separate `GuidanceList` panels side by side, so the
direction a person must follow and the direction they must not are never one list.

**Verdict: Verified** — the row asserts reference detail, Use/Avoid direction and persisting
authorized edits, and all three hold. The reference **link's destination** is a separate problem,
recorded as [Defect G-1](#defect-g-1-explore-reference-files-lands-on-an-empty-list-for-every-client)
rather than folded into this verdict.

## G07 — Products: several, with Assets/Specs/Rules kept apart

**Required evidence:** read at least three distinct products and compare tab data.

**What was done.** Three products with deliberately non-overlapping specifications and usage
guidance were saved on the fixture client and read back from the rendered page; then SABRE's three
seeded products were compared to their stored records read-only.

**Measured.** For each of the three fixture products the panel contained its own description, its
own `Spec _ only` and its own `Rule _ only`, carried the eyebrow `Product 01`/`02`/`03`, and — the
actual mixing test — contained **neither of the other two products' specs and neither of their
rules**. Each panel's `View product assets` link pointed at
`/brand/assets?search=<that product's name>`, URL-encoded.

On SABRE, the rendered `h3` sequence equalled the stored `items[].name` sequence exactly —
`Essential collection`, `Signature collection`, `Travel collection` — and each panel contained its
own stored `specs` string.

**Verdict: Verified.**

## G09 — Seven template types through one editor, with resumable drafts

**Required evidence:** table-driven coverage of seven template definitions plus browser persistence journey.

**What was done.** The rendered template grid was read as a table and compared, row for row, to
`brand_templates` ordered by name; every category the seed defines was exercised through the filter;
then one draft was created, edited, **left entirely**, and resumed from the drafts collection.

**Measured.** The seven definitions, rendered `name` and `category · width × height`, equal to the
stored rows:

| Name | Category | Size |
|---|---|---|
| Amazon Gallery | Commerce | 2000 × 2000 |
| Email Header | Email | 1200 × 600 |
| Instagram Post | Social | 1080 × 1080 |
| Presentation | Presentation | 1920 × 1080 |
| Print Flyer | Print | 1240 × 1754 |
| Product Card | Commerce | 1200 × 1500 |
| Website Hero | Web | 1920 × 1080 |

Category filter: `Commerce` 2, `Email` 1, `Social` 1, `Presentation` 1, `Print` 1, `Web` 1 — six
categories, seven cards.

The draft journey, on `Print Flyer`: `Draft name`, `Headline`, `Body copy` and `Call to action` were
filled, `Preview zoom` set to `75` (the preview sheet's inline `width` became `75%`) and the
artwork's `.brand-art-cta` updated live to `Continue reading`. After `Save draft` the session
navigated away to `/brand/overview`, back to `/brand/templates`, opened `My drafts (1)` — one card —
and reopened the draft by clicking it. All four fields came back with their saved values.

**Verdict: Verified.**

## G10 — Drafts create nothing, and no other account can reach one

**Required evidence:** before/after record counts, two-user API test and missing-link browser check.

**Counts,** taken immediately before and immediately after the whole G09/G10 journey — identical:

| projects | design_versions | designs | published_versions | published_designs | publication_reviews | credit_ledger | briefings |
|---|---|---|---|---|---|---|---|
| 25 | 44 | 47 | 18 | 22 | 18 | 36 | 30 |

**The two-user test.** `template_drafts` carries one policy, `drafts_owner`, `FOR ALL` with
`USING (owner_id = auth.uid() AND private.can_access_client(client_id))`. Four other accounts each
attempted to read, change and delete the agency's draft, and the stored `name || content` was
re-read after every attempt:

| Caller | `SELECT` | `UPDATE` | `DELETE` | Stored |
|---|---|---|---|---|
| `sabre@client.dawes.local` | 0 rows | 0 rows | 0 rows | unchanged |
| `acme@client.dawes.local` | 0 rows | 0 rows | 0 rows | unchanged |
| `designer@dawes.local` | 0 rows | 0 rows | 0 rows | unchanged |
| `designer2@dawes.local` | 0 rows | 0 rows | 0 rows | unchanged |

And the reverse direction, which is the stronger claim: the seed's SABRE draft
(`SABRE social exploration`) is owned by the SABRE **client** user, and the **agency** session —
the only agency user in the workspace — got **0 rows** on `SELECT`, **0 rows** on `UPDATE`, **0 rows**
on `DELETE`, with the stored name unchanged. The owner's own session read it back by id in the same
sequence, so the row exists and is simply out of everyone else's reach. `owner_id = auth.uid()` is
not qualified by `is_agency()`, which is why this holds.

`designer@dawes.local` can read all **70** `brand_templates` rows (the shared starting points are
client-scoped, and both designers are assigned in all ten workspaces) and **0** `template_drafts`.

**Recovery.** `/brand/drafts/00000000-0000-4000-8000-000000000000` renders
`This draft is unavailable.` with `You can open your own drafts from this workspace's templates.`
and a `Back to templates` button that returns to the seven-card grid. A signed-in designer opening
the agency's real draft id gets the **same** page — a draft that is not yours is indistinguishable
from one that does not exist, which is the correct disclosure.

**Verdict: Verified.**

## G11 — Messaging blocks, terminology and rules: save, read, copy, scope

**Required evidence:** save/read/copy representative blocks and role checks.

**Measured.** The five messaging fields saved on the fixture client (G01 above) were read back from
the three rendered `.brand-message` panels after a reload — `A measured headline`,
`Support that stays true.`, `Read the guidance` — and from the stored JSON. With the clipboard
denied, each panel's `Copy text` and each list's `Copy preferred terminology` / `Copy messaging
rules` opened the manual dialog carrying the exact stored text, including the newline-joined lists
`Studio\nCollection` and `Say what is true.\nName the product plainly.`

Scope: on SABRE the **designer** session rendered the stored `messaging.headline` and three
`Copy text` controls with **zero** `Edit …` controls, and the client session the same; both roles'
direct `UPDATE`, `INSERT` and `DELETE` against `brand_sections` were refused with the stored value
unchanged (the table in G01).

**Verdict: Verified.**

## G12 — Brand context: this client's own, copyable without a clipboard, no AI provider

**Required evidence:** context content comparison, clipboard failure and network inspection.

**What was done.** Every network request the page issued was recorded by host. The context was
copied with the clipboard denied, and the resulting string was compared fragment by fragment against
the client's own `brand_sections` rows read straight from Postgres — twenty-five text fragments plus
the full colour line — and against the `Preview the complete context` block on the page.

**Measured.**

| Check | Result |
|---|---|
| Length | **1148** characters |
| Opening | `SABRE\n\nMade for what comes next.\n\nSABRE creates considered experiences with a clear point of view.\n\nAudience: Curious people who value purposeful design.\n\nVoice: Clear, Confident, …` |
| Fragments matched | **26/26** — tagline, description, audience, every tone, every principle, heading font, photography direction, messaging headline and CTA, every preferred term, the AI instructions, and every `ai.use`, `ai.never`, `visual-style.use` and `visual-style.avoid` line |
| Colour line | `Colors: ` + the stored palette rendered as `name #HEX, …` |
| `Use:` / `Never:` sections | both present as their own blocks |
| Another client's name | absent |
| Production leakage | none — the string contains no designer identity, no `project_id` and no internal version reference |
| `Preview the complete context` | byte-identical to the copied value |
| Network hosts during the whole journey | `localhost:3003` and `127.0.0.1:55421` only. **Outside hosts: none.** |

Nothing on this page claims to call a model: the control is `Copy brand context`, the copy is the
whole product, and the manual dialog is what a person gets when the clipboard refuses. The network
record is what makes that a measurement rather than a reading of the copy.

**Verdict: Verified.**

## G13 — Project files: real records, real role scope, published assets only

**Required evidence:** upload and cross-role library/file access checks.

**What was done.** The seeded SABRE library was compared to its records; then an isolated
`Acceptance …` project was created with an assigned designer, a working file was uploaded through
the UI by the agency **and** by the assigned designer, and the client's page **and payload** were
inspected. The payload matters: the page hides working files by not querying them at all
(`useProjectAssets` skips `project_assets` for a client), so only a direct query proves the refusal
is the database's.

**Measured.**

| Check | Result |
|---|---|
| Agency `All files` on SABRE | **5** cards, equal to the 5 `published_designs` rows with an `asset_path` across SABRE's projects |
| `Approved` | **1**, equal to the one publication carrying an `approved` `publication_reviews` row (`Email Banner`) |
| Agency upload through `Add a working file` | 1 card, eyebrow `Working file` |
| Assigned designer (`designer@`) upload | sees **2**, and is offered **0** `Delivery file` controls |
| Client page, same workspace | **5** cards — the same published designs — **0** `Working file` controls, and neither uploaded file by name |

The client's payload, in the same session:

| Query as `sabre@client.dawes.local` | Result |
|---|---|
| `project_assets` for that project | **0 rows** |
| `project_assets` with no filter at all | **0 rows** |
| `delivery_files` for that (undelivered) project | **0 rows** |
| `designs`, `design_versions`, `internal_comments`, `project_assignments` | **0 rows** each |
| Storage `internal-assets` download of the uploaded object | refused — `Object not found` |
| Signed URL for the same object | refused |
| `published_designs` with an `asset_path` across SABRE | **5 rows** — the entitled side is present in the same session |
| `INSERT` into `project_assets` | **`42501`** |

And the unassigned designer, `designer2@dawes.local`, who holds no assignment on the fixture
project: `SELECT` **0 rows**, `INSERT` **`42501`**, and `project_assets` still holding exactly the
**2** rows the two authorized uploads created.

A `published_designs` row a client can read carries `id, project_id, publication_id, title, content,
asset_path, sort_order` — no `created_by`, no designer identity, no internal design or version id.

**Verdict: Verified.**

## G14 — Unsupported formats, and uploads that never finished

**Required evidence:** real file-type and interrupted-upload cases.

**Measured.**

| Case | Result |
|---|---|
| SVG brand asset detail dialog | labelled **`SVG asset`**; **0** `iframe`, `embed`, `object`, inline `svg` preview or `img`; `Download file` produced `Sample brand mark.svg` with no failure |
| `notes.txt` (`text/plain`) into the brand uploader | **`Choose a PNG, JPG, WebP, SVG, or PDF file.`**; `brand_assets` rows with that name: **0** |
| `mark.svg` (`image/svg+xml`) into the **working-file** uploader | **`Choose a PNG, JPG, WebP, or PDF file.`** — `brand-assets` is the only bucket whose `allowed_mime_types` includes SVG, and the two uploaders declare separate allow-lists rather than sharing one |
| A working-file upload whose `POST /rest/v1/project_assets` was forced to `503` | the dialog showed `Registration unavailable.`, and the already-uploaded object stayed in `internal-assets` (**1 object**) so a retry can reuse it |
| Cancelling that dialog | `internal-assets` objects for the project: **0**; `project_assets` rows: **0** |
| The library afterwards | **0** cards for that project, and no `Abandoned working file` anywhere |

PDF's side of the same claim is `brand-canvas-final.spec.ts` (`PDF document`, no embedded document
element, real `%PDF-` bytes). The design path's equivalent — a failed `add_design` that retries onto
the same object and an abandoned upload that is discarded — is `project-recovery.spec.ts`, re-run
green on this build.

**Verdict: Verified.**

---

# Defect G-1: `Explore reference files` lands on an empty list for every client

**Severity: Medium** — a navigational dead end on a shipped section, present for all ten clients in
the canonical dataset. **Not repaired; recorded.**

**Where.** `apps/web/features/brand/brand-sections.tsx`, the Visual style section:

```tsx
<Link className="button" href={`/clients/${clientId}/brand/assets?category=Photography`}>
  Explore reference files
```

**Reproduction.**

1. Sign in as `studio@dawes.local`.
2. Open any client's `/clients/:clientId/brand/visual-style`.
3. Press `Explore reference files`.

**Observed.** The assets page opens with `Asset category` correctly set to `Photography` and renders
`No matching assets.` — measured for **all ten** seeded clients, every one returning zero cards.
`Photography` is a valid option because `brand-assets.tsx` hard-codes the five category names
(`Logo`, `Photography`, `Product`, `Document`, `Other`) in addition to whatever the data contains,
so the filter is real; there is simply nothing behind it. The only categories in the seed are
`Document` (10 rows), `Logo` (30) and `Product` (30) — **zero** `Photography` assets across 70
brand assets.

Artefact: [`screenshots/family-g-photography-reference-dead-end.png`](screenshots/family-g-photography-reference-dead-end.png).

**Contrast with the link that works.** The Products section's `View product assets` link searches by
product name, and the seed does carry `Essential collection reference`, `Signature collection
reference` and `Travel collection reference`, so that one lands on real files. The Visual style link
is the only reference affordance in the Brand Hub that cannot resolve.

**This is a dataset defect, not a feature defect.** The component behaves correctly; the canonical
dataset has no photography reference material for a photography direction it nonetheless describes
in prose for every client. It therefore also bears on **B07** ("Every client has Brand Hub
context"), which is not this pass's row. Either the seed gains a `Photography` asset per client or
the link stops pre-filtering — a data and product decision above a measurement pass, so no change
was made.

# Finding G-2: six of the eight brand sections are byte-identical across all ten clients

**Severity: Low for G01, material for the dataset.** **Not repaired; recorded.**

Counting distinct `content` payloads per section across the ten seeded clients:

| Section | Distinct payloads across 10 clients |
|---|---|
| `colors` | **1** |
| `logos` | **1** |
| `messaging` | **1** |
| `products` | **1** |
| `typography` | **1** |
| `visual-style` | **1** |
| `overview` | 10 |
| `ai` | 10 |

Every client shares the tagline `Made for what comes next.`, the palette `Ink #191919 / Paper
#F7F6F2 / Stone #C9C5BB / Accent #D4DCB4`, the headline `Every detail, considered.`, the same three
products (`Essential`/`Signature`/`Travel collection`) with the same specs and rules, the same
typography, and the same Use/Avoid direction. `brand_assets` carries only **7 distinct names** across
70 rows — the same seven files, once per client. Only `overview` (which differs by `name` and
`description`) and `ai` vary.

**Why it is recorded here.** G01 asserts "client-correct content", and that claim is verified: each
page renders that client's own row, cross-tenant reads return nothing, and the two fields that do
differ were compared against the database. But the *discriminating power* of that check rests on
`overview.name` and `overview.description` alone — for six of the eight sections there is no
observable difference between rendering the right client's row and the wrong one. A future pass that
wants a stronger client-isolation signal on those sections cannot get one from this dataset.

It also sits against the root requirement for "realistic related data" and against **B07**, neither
of which is a G row. No seed change was made.

# Observation G-3: a refused `UPDATE` still answers `204`

`brand_sections`, `template_drafts` and `project_assets` carry column-level `UPDATE` grants, so a
forbidden update is refused by RLS row matching rather than by privilege: PostgREST returns success
with **zero rows affected** and no error. Every negative check in this record therefore verifies the
**stored value** after the attempt, not the response code — the same trap
[family F recorded as Observation F-4](acceptance-family-f.md). `INSERT`, by contrast, is refused
outright with `42501`, because the policy's `WITH CHECK` runs on the new row.

Recorded so the next pass does not read a `204` as an `ALLOWED`.

# Observation G-4: every `CopyButton` keeps its manual-copy dialog in the DOM

`features/shared/modal.tsx` always renders its `<dialog>` element and calls `showModal()` in an
effect, so a page with several copy controls (the colours palette, the messaging section) holds
several closed `Copy this text` dialogs at once. They are `display: none` per the native `<dialog>`
default, invisible to a screen reader and to `axe` — `brand-accessibility.spec.ts` reports zero
violations on all ten sections — so this is not a defect. It is recorded because it makes an
unscoped `getByLabel("Text to copy")` resolve to every dialog on the page at once; this probe scoped
every such assertion to `dialog[open]`.

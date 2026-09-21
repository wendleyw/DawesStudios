# J05 — Duplication audit

**Acceptance row J05:** *Duplicate UI actions, redundant sections, duplicate data adapters and
repeated business rules are consolidated without removing useful actions.*

**Date:** 2026-09-21 · **Branch:** `main` · **Scope:** `apps/web` (features, app routes, stylesheets)
and the Postgres rules those features mirror.

This is a measurement pass. No code was changed. Line numbers are as of commit `5ba2b57`.

Findings that the completed structural refactor already resolved are not repeated here, nor are the
three key-ownership items already recorded elsewhere (`settings-data.ts` owning four foreign key
sets, `["campaigns"]` / `["credit-account"]` shared across two features, and
`project-events.ts` holding a realtime list that differs from `projectQueryKeys`).

## Summary

| Severity | Count |
| -------- | ----- |
| High     | 0     |
| Medium   | 9     |
| Low      | 9     |

**No High findings.** The categories that could produce wrong data — credit arithmetic, briefing
status transitions, and role/permission enforcement — are implemented once, in Postgres, and the
client holds no second copy of them. See [What was checked and found clean](#what-was-checked-and-found-clean)
for the evidence.

---

## Medium

### M1 — The upload contract (50 MB ceiling, MIME allow-list, extension map) is declared four times in TypeScript and once more in Postgres

**Locations**

| What | Where |
| ---- | ----- |
| MIME → extension map (png/jpg/webp/pdf) | `apps/web/features/assets/upload-file-dialog.tsx:17`–`22` (`formats`) |
| Same map, values as arrays | `apps/web/features/briefings/briefing-attachments.tsx:20`–`25` (`fileTypes`) |
| Same map plus `image/svg+xml` | `apps/web/features/brand/brand-model.ts:368`–`374` (`brandFileTypes`) |
| Allow-list as an inline array | `apps/web/features/projects/media-client.ts:97` |
| 50 MB ceiling | `apps/web/features/assets/upload-file-dialog.tsx:69` |
| 50 MB ceiling | `apps/web/features/briefings/briefing-attachments.tsx:31` |
| 50 MB ceiling | `apps/web/features/brand/brand-model.ts:378` |
| 50 MB ceiling | `apps/web/features/projects/media-client.ts:99` |
| 50 MB as display copy | `apps/web/features/assets/upload-file-dialog.tsx:152` |
| 50 MB as display copy | `apps/web/features/briefings/briefing-attachments.tsx:153` |
| Authoritative value (`52428800`) | `supabase/migrations/202609200003_storage.sql:3`–`6`, `supabase/migrations/202609200004_requests_and_attachments.sql:41`, `:67`, `supabase/migrations/202609200008_trusted_media.sql:6` |

**Evidence they are the same rule, not similarly named constants.** All four TypeScript ceilings are
the literal expression `file.size > 50 * 1024 * 1024`, and all four exist to reject, before upload,
exactly what the bucket's `file_size_limit = 52428800` would reject after it. Three of the four MIME
declarations list the identical four types in the identical order and map them to the identical four
extensions; the fourth (`media-client.ts:97`) is the same four types as an inline array. Two call
sites already emit the byte-identical string `"Choose a PNG, JPG, WebP, or PDF file."`
(`upload-file-dialog.tsx:68`, `briefing-attachments.tsx:30`). The three surviving ceiling messages are
*not* identical — "Choose a file no larger than 50 MB.", "Choose a file smaller than 50 MB.", "Each
file must be 50 MB or smaller." — which is the drift this finding is about: the rule is one rule and
the wording has already diverged three ways.

**Why it matters.** Adding a file type to one uploader, or raising the ceiling in Postgres, leaves
four other places to find. A client ceiling above the bucket limit turns a friendly rejection into a
raw storage error; below it, valid files are refused with no way for the user to tell why.

**Not in scope of this finding:** `features/projects/artwork-files.ts:9`, `:15` uses a narrower list
(png/jpg/webp, no PDF) and a 25 MB ceiling. That is a genuinely different rule — the artwork path
re-encodes the image through a canvas and also caps 40 megapixels (`:19`), so its limit guards
browser memory, not the bucket. Folding it into a shared constant would be wrong.

**Severity:** Medium. **Recommendation:** structural, but small — one `features/shared/upload-rules.ts`
exporting `UPLOAD_MAX_BYTES`, the MIME→extension record and one message builder, imported by the four
uploaders; brand keeps its extra `image/svg+xml` entry as an explicit extension of the base record
rather than a second copy. Half a day including the copy strings. Postgres stays authoritative; the
shared module should carry a comment naming `202609200003_storage.sql` as the value it mirrors.

---

### M2 — The design-version / published-version normalisation is written twice

**Locations**

- `apps/web/features/projects/project-data.ts:85`, `:86`–`90`, `:91`
- `apps/web/features/reviews/review-data.ts:71`–`72`, `:73`, `:74`

**Evidence.** Both modules read a row that is either a `design_versions` row or a
`published_versions` row, and both decide which by the same three `in` discriminators, in expressions
that match term for term:

| Field | `project-data.ts` | `review-data.ts` |
| ----- | ----------------- | ---------------- |
| note | `"notes" in version ? version.notes : version.release_note` (`:85`) | `"notes" in version ? version.notes : version.release_note` (`:74`) |
| date | `"created_at" in version ? version.created_at : version.published_at` (`:91`) | `"created_at" in version ? version.created_at : version.published_at` (`:73`) |
| status | `"status" in version ? version.status : (review?.status ?? "pending")` (`:86`–`90`) | `"status" in version ? version.status : (version.publication_reviews?.status ?? "pending")` (`:71`–`72`) |

The status rule differs only in how the review row is reached (a separate `publication_reviews`
query versus an embedded join) — the fallback `?? "pending"` and the branch condition are the same.
These are not two coincidentally similar mappings; they are one answer to "how do I read a version
row whichever table it came from", stated in two features.

**Why it matters.** If a column is renamed, or the `"pending"` default changes, one of the two will be
missed and a version will display the wrong status or date on one screen and the right one on
another.

**Severity:** Medium. **Recommendation:** structural. The natural home is a small
`features/shared/version-row.ts` exporting the union type and three readers
(`versionNote`, `versionDate`, `versionStatus`), since neither `projects` nor `reviews` owns the
other. Roughly 30 lines moved plus two call-site edits; the type union is the fiddly part.

---

### M3 — "Save this blob to the viewer's disk" is written four times, with three different filename rules

**Locations**

- `apps/web/features/assets/file-download.ts:12`–`17` — the named helper; sanitises with `_`; one consumer (`assets-page.tsx:43`)
- `apps/web/features/brand/brand-assets.tsx:76`–`83` — sanitises with `-`; revokes after 30 000 ms
- `apps/web/features/briefings/briefing-attachments.tsx:85`–`90` — **no sanitisation**; `link.download = attachment.name`
- `apps/web/features/credits/credits-page.tsx:127`–`132` — generated filename, so nothing to sanitise

**Evidence.** All four run the identical five-step sequence: `URL.createObjectURL(blob)` →
`document.createElement("a")` → set `href` → set `download` → `click()` → `setTimeout(… revokeObjectURL, …)`.
Two of them use the same character class for sanitisation, `/[<>:"/\\|?*\u0000-\u001f]/g`, and
substitute *different* replacement characters (`_` in `file-download.ts:15`, `-` in
`brand-assets.tsx:79`). The third omits the rule entirely on a name that came from a user-supplied
upload. That is the same rule applied inconsistently, not three deliberate choices — nothing in the
code or comments distinguishes them.

**Severity:** Medium. **Recommendation:** extract `saveBlob(blob, filename)` into `features/shared/`
and have `downloadPrivateFile` call it. The shared README's component criteria do not apply (this is
a non-component module, like the existing `canvas-fit.ts`), and `saveBlob` was not among the seven
rejected candidates. Four consumers, ~10 lines. Decide the replacement character once; give the
briefing attachment path the sanitisation it currently lacks.

---

### M4 — `decodeBriefing` and `decodeAssignedBriefing` have byte-identical bodies

**Locations:** `apps/web/features/briefings/briefing-model.ts:118`–`124` and `:126`–`134`.

**Evidence.** Both functions are `{ ...row, direction: directionSchema.parse(row.direction),
requested_deliverables: z.array(deliverableSchema).parse(row.requested_deliverables) }`. There is no
difference at all in the body; only the parameter type differs (a `briefings` table row versus the
`get_assigned_briefings` return row). Both are called from the same hook,
`briefing-data.ts:73` and `:81`.

**Severity:** Medium (duplicate adapter). **Recommendation:** three-line change — one function taking
the union of the two row types. Cheapest fix on this list.

---

### M5 — `review-data.ts` maps `design_versions` → `ReviewRow` twice inside one query function

**Locations:** `apps/web/features/reviews/review-data.ts:64`–`76` and `:86`–`98`.

**Evidence.** Five of the eight fields are character-for-character identical across the two blocks,
including the non-obvious ones: `title: projects.find((project) => project.id === version.project_id)!.title`
and `deliverable: deliverables.find((item) => item.id === version.deliverable_id)?.name ?? "Deliverable"`,
with the same non-null assertion and the same `"Deliverable"` fallback string. The remaining three
differ only because the second block already filtered on `status = "submitted"` (`:83`), so it hard-codes
`status: "submitted"` and `internal: true` where the first block reads them from the row. Both produce
the same `ReviewRow` shape from the same table.

**Severity:** Medium. **Recommendation:** one local `toReviewRow(version, overrides)` closure inside the
query function. ~15 lines, no cross-module movement.

---

### M6 — `useProjectComments` maps two comment tables to `CanvasComment` with seven of eight fields identical

**Locations:** `apps/web/features/projects/project-data.ts:129`–`138` and `:148`–`157`.

**Evidence.** `id`, `body`, `pinX`, `pinY`, `designId`, `resolved` and `createdAt` are the same seven
expressions in the same order in both blocks. The single real difference is `label`:
`comment.author_label` for the client channel (`:132`), versus
`comment.author_id === profile?.id ? profile.display_name : "Studio team"` for the internal channel
(`:151`). That difference is exactly the leak boundary this split exists to hold — the client channel
must never learn a designer's identity — so it belongs in a prop or a parameter, not in a second copy
of the mapping.

**Severity:** Medium. **Recommendation:** one mapper taking a `label: (row) => string` resolver; keep
the two queries and the two label rules separate and visible. ~12 lines.

---

### M7 — `delivery_files` and `project_assets` are mapped to `ProjectAsset` by identical field expressions

**Locations:** `apps/web/features/assets/asset-data.ts:84`–`95` and `:98`–`109`.

**Evidence.** The two source tables share the same column names — `id`, `name`, `project_id`,
`storage_path`, `mime_type`, `file_size`, `created_at` — and the two `.map` bodies are identical line
for line for all seven, differing only in three literals: `bucket`, `category` and `approved`. The
third block (`:112`–`125`, `published_designs`) is genuinely different: different source columns
(`title`, `asset_path`, an embedded `published_versions.published_at`), a filter, a hard-coded mime and
a lookup into `approvedIds`. That one should stay as it is.

**Severity:** Medium. **Recommendation:** one helper for the two matching blocks, taking
`(row, bucket, category, approved)`. Three-line extraction; leave the third block alone.

---

### M8 — `project-details.tsx` re-implements the conflict message that `project-data.ts` already throws, in a branch that can no longer fire

**Locations:** `apps/web/features/projects/project-data.ts:255`–`258` and
`apps/web/features/projects/project-details.tsx:224`–`227`.

**Evidence.** `updateProjectDetails` detects the compare-and-set failure by error code and throws the
string *"This project changed while you were editing. Close and reopen the details to try again."*
The component then tests `save.error.message.includes("0 rows")` and substitutes the same string,
character for character. The comment at `project-data.ts:253`–`254` states the intended design
explicitly — *"The conflict message travels with the query rather than staying at the call site"* —
so the call-site copy is a leftover that contradicts the module it calls. It is also unreachable:
`updateProjectDetails` converts the PGRST116 result before it ever returns, so `save.error.message`
is already the friendly string and never contains `"0 rows"`.

**Severity:** Medium (duplicated user-facing rule). **Recommendation:** delete the conditional and
render `save.error.message`. Four-line deletion. Note that the sibling
`updateWorkingDesign` (`project-data.ts:405`–`408`) has no such call-site copy, which confirms this
one is a leftover rather than a pattern.

---

### M9 — Briefing status is formatted by `replaceAll("_", " ")` in search while `briefingStatusLabels` exists — and the two have already drifted

**Locations:** `apps/web/features/workspace/workspace-data.ts:269` versus
`apps/web/features/briefings/briefing-model.ts:136`–`141`.

**Evidence.** The search result adapter renders a briefing's status as
`item.status.replaceAll("_", " ")`. Every other surface — `briefings-page.tsx:113`,
`briefing-detail.tsx:55` — renders the same enum through `briefingStatusLabels`. The two already
disagree in production: a briefing in status `accepted` reads **"accepted"** in global search and
**"In progress"** everywhere else; `budget_confirmed` reads "budget confirmed" rather than "Budget
confirmed". The record exists precisely to name these four values, so this is one rule with a second,
worse implementation.

**Note:** the other four `replaceAll("_", " ")` call sites are *not* this rule.
`project-nodes.tsx:43`, `project-details.tsx:176` and `reviews-page.tsx:99` format the *version*
status enum, which has no label record at all; `workspace-settings.tsx:80` formats IANA timezone
names. Only the briefing one duplicates an existing record.

**Severity:** Medium. **Recommendation:** import `briefingStatusLabels` into the search adapter — a
one-line change plus an import. The version-status enum having no label record is a separate gap,
worth raising on its own rather than folding in here.

---

## Low

### L1 — The credits page's two tabs render the same records with one cell of difference

**Locations:** `apps/web/features/credits/credits-page.tsx:178`–`194` (the tabs), `:301` and
`:316`–`320` (everything `tab` affects).

**Evidence.** "Balance & activity" and "Client report" are driven by the same `visible` array
(`:100`), the same filters, the same five columns and the same rows. `tab` changes exactly two things:
the first column's header text ("Activity" versus "Project / activity") and that column's secondary
line, which in report mode shows the campaign title and otherwise the activity kind. Nothing else on
the page responds to `tab`. Two tabs that present the same records under different headings is the
redundant-section shape this row is about.

**Careful here — do not just delete a tab.** The campaign attribution the report tab surfaces is real
information that the activity tab does not show, and the CSV export (`:113`–`137`) carries a
*Campaign* column, so the report view has a job. **Recommendation:** structural, needs its own design
— most likely one table with campaign as its own column, and the tab pair removed. Do not remove the
report tab without first giving campaign a place to live.

### L2 — The credit package set `[25, 50, 100]` is written twice in one file

**Locations:** `apps/web/features/credits/credit-actions.tsx:36` (validation) and `:75` (the buttons).

**Evidence.** The same three-element array literal, 39 lines apart: line 75 renders one button per
value, line 36 rejects any amount not in that list. Adding a package to the buttons without editing
the validation would produce a button that always fails. Postgres holds the authoritative constraint
(`supabase/migrations/202609200004_requests_and_attachments.sql:3`, `check(amount in (25,50,100))`),
so the client copy is a fail-fast affordance — but it should be *one* client copy.

**Recommendation:** a module-level `const CREDIT_PACKAGES = [25, 50, 100] as const;` used by both.
Three-line extraction.

### L3 — `projectHref` calls itself "the single place that knows where a project lives"; nine call sites build the path literally

**Locations:** `apps/web/features/board/project-open.ts:13`–`16` versus
`board-page.tsx:410`, `project-details.tsx:79`–`80`, `workspace-data.ts:264`, `home-page.tsx:124`,
`notifications-page.tsx:76`, `briefing-detail.tsx:75`, `:98`, `:175`, `assets-page.tsx:177`,
`reviews-page.tsx:77`, `credits-page.tsx:414`.

**Evidence.** All build `/projects/${id}`. The most telling one is `board-page.tsx:410`, which inlines
the template literal in the same file that imports `projectHref` at line 34 and uses it at line 187.

**Recommendation:** either fix `board-page.tsx:410` and soften the docstring, or move the helper out
of `features/board/` so the other features can reach it without crossing a feature boundary — which
is the reason they do not use it today. Low value either way: the route is unlikely to change. The
docstring should not claim an invariant the codebase does not hold.

### L4 — `client.initials || client.name.slice(0, 2)` in three places, one of which is a component built for it

**Locations:** `apps/web/features/workspace/client-mark.tsx:35`,
`apps/web/features/workspace/app-shell.tsx:268`, `apps/web/features/workspace/home-page.tsx:173`.

**Evidence.** The identical fallback expression in all three.

**Do not consolidate naively.** `ClientMark` also resolves and displays the client's uploaded logo via
`useClientLogo` (`brand-data.ts:129`), which issues a query and a signed-URL call **per client**.
Dropping it into the sidebar's client list or the home workspace grid would fire one such pair for
every client in the workspace — ten on the seeded baseline — and would change what those surfaces
show. **Recommendation:** extract only the initials expression (a one-line helper on the `Client`
type), and treat "should the sidebar and the home cards show logos?" as a separate design question
with a real cost attached.

### L5 — The briefings page restates two entries of `briefingStatusLabels` as literal tab labels

**Locations:** `apps/web/features/briefings/briefings-page.tsx:63`–`68` versus
`briefing-model.ts:136`–`141`, with the record already imported at `briefings-page.tsx:9` and used at
`:113`.

**Evidence.** The tab array hard-codes `["draft", "Draft"]` and `["accepted", "In progress"]`; both
labels are exactly the record's values for those keys. Renaming a status in the model would leave the
tabs showing the old wording beside badges showing the new.

**Note the third tab is different:** `["awaiting_review", "Awaiting review"]` filters *two* statuses
(`awaiting_review` and `budget_confirmed`, `:44`), so it is a grouping, not a lookup, and must keep its
own label.

**Recommendation:** read the two pure-lookup labels from the record, leave the grouped tab alone.
Three-line change.

### L6 — Both notification bells render at viewport widths strictly between 900 px and 901 px

**Locations:** `apps/web/features/workspace/app-shell.tsx:389` and
`apps/web/features/board/board-page.tsx:347`; the two rules meant to keep them apart are
`features/workspace/workspace.css:151`–`157` (`@media (min-width: 901px)` hides the topbar on a board
page) and `features/board/board.css:319`–`324` (`@media (max-width: 900px)` hides the board's bell).

**Evidence.** The two queries are complementary at integer widths but leave a gap for fractional ones:
at a viewport width of, say, 900.5 px — reachable through browser zoom or a fractional device pixel
ratio — `min-width: 901px` is false, so the topbar shows, and `max-width: 900px` is false, so the
board bell shows too. Two identical `<Link>`s to `/notifications` with the same `aria-label` then sit
in the accessibility tree at once. The `NotificationsBell` docstring (`notifications-bell.tsx:8`–`10`)
already treats two mounted copies as normal and notes the query is shared, so the DOM duplication is
expected; only the simultaneous *visibility* is not.

**Recommendation:** change the board rule to `max-width: 900.98px` (the usual convention) or restate
both against a single shared breakpoint custom property. One-line CSS fix.

### L7 — The "needs attention" status set is expressed twice on the home page

**Locations:** `apps/web/features/workspace/home-page.tsx:29` and `:37`–`39`.

**Evidence.** Line 29 filters `["client_review", "internal_review", "changes_requested"]`; lines 37–39
build one tile per member of that same set, via `statusLabels.internal_review`,
`statusLabels.client_review`, `statusLabels.changes_requested`. The comment at `:33`–`34` states the
invariant that ties them — *"Its parts sum to the badge beside the table"* — and that invariant is
only true while the two lists agree. (The fourth tile, `approved` at `:40`, is deliberately outside
the set and outside the badge.)

**Recommendation:** derive the three tiles from the array at line 29. Five-line change.

### L8 — `canvas-layout.ts` still documents the canvas-fit duplication that has since been fixed

**Location:** `apps/web/features/projects/canvas-layout.ts:270`–`271`.

**Evidence.** The docstring on `canvasFit` reads *"a shared helper would have to be extracted by
whoever owns both, so this one stays local and is reported as a duplicate."* That helper now exists
and both callers use it: `features/shared/canvas-fit.ts:21` (`fitToContent`), called by
`canvasFit` at `canvas-layout.ts:279` and by `boardFit` at `board-layout.ts:337`. The comment describes
a state of the code that no longer exists and tells a future reader a duplicate is outstanding when
it is not.

**Recommendation:** rewrite the paragraph to describe what the two fits actually differ in (their
`minZoom` floor and whether height constrains) — which the shared module's own header already states
well. Documentation only.

### L9 — `["approved", "reviewed"]` is written three times in one component

**Locations:** `apps/web/features/reviews/reviews-page.tsx:30`, `:33` (negated) and `:81`.

**Evidence.** The same two-element array literal expressing one rule — "this version is finished" —
used once to select the Approved filter, once (negated) to select the waiting filter, and once to
choose between the tick and the clock icon. All three must agree or a row will appear under
"Approved" with a clock beside it.

**Recommendation:** one local `const isFinished = (status: string) => ["approved", "reviewed"].includes(status);`
above the component. Three-line extraction.

---

## What was checked and found clean

Recorded so the next reader does not re-audit it.

**Credit arithmetic — clean, and the reason there are no High findings.** Every balance mutation is a
single Postgres routine: `accept_briefing` (`supabase/migrations/202609200002_workflows.sql:44`–`66`)
takes `for update` locks on the briefing and the credit account, checks
`current_balance < b.confirmed_credits`, debits `credit_accounts`, writes the `credit_ledger` row with
`balance_after`, and keys idempotency on `'briefing:'||b.id` — all in one transaction.
`adjust_credits` (`:67` onward) does the same with an explicit idempotency key. The client performs
**no** balance arithmetic that is persisted. The one client-side computation,
`briefing-detail.tsx:178`–`179` (`balance.data.balance >= (briefing.confirmed_credits ?? Number(credits))`)
and the "credits needed" figure at `:251`, is an advisory pre-check that only disables a button; the
RPC re-checks and raises `Insufficient credit balance` regardless. `filterCreditEntries` and
`creditCsv` (`credit-model.ts:36`, `:76`) read the stored `amount` and `balance_after` and never
recompute them. There is one arithmetic expression per rule in the whole feature.

**Role gating — clean.** 80-odd `profile?.role === …` expressions exist, but they are presentation
decisions (which label, which tab, which button), not authorization. Enforcement lives in Postgres
(`private.assert_agency()`, `private.can_produce`, `private.can_client_channel`, RLS on every table),
and the per-bucket channel split is reinforced by the two disjoint select strings at
`board-data.ts:30`–`33`. No client-side check substitutes for a backend one, so none of them can
drift into granting access.

**Briefing status transitions — clean.** `draft → awaiting_review → budget_confirmed → accepted` is
set only by `submit_briefing`, `confirm_briefing_budget` and `accept_briefing`. The client reads the
status to choose a panel (`briefing-detail.tsx:81`, `:92`, `:110`, `:115`) but never writes it and
never encodes the ordering. The one status *label* duplication is M9 above.

**`validatePassword` — clean.** One definition (`settings-model.ts:26`–`30`), three consumers
(`account-settings.tsx:27`, `account-recovery.tsx:31`, `invitation-acceptance.tsx:35`). The 12-character
figure appears twice more as user-facing copy (`account-settings.tsx:81`, `account-recovery.tsx:67`)
— worth knowing, but prose beside a field is not a second implementation of the rule.

**`fromInternalRows` / `fromPublishedRows` — checked, intentional, leave as is.**
`project-thumbnail.tsx:181`–`198` and `:200`–`217` are structurally identical, differing only in three
key names (`design_versions`/`published_versions`, `designs`/`published_designs`,
`internal_asset_path`/`asset_path`). On the surface this is the clearest duplicate adapter in the
codebase. It should not be consolidated. The two types *are* the channel boundary: the header comment
at `:14`–`16` explains that mixing an internal version number with published artwork, or the reverse,
is a leak of one channel into the other, and keeping the two row types distinct is what makes that a
compile-time guarantee. A generic keyed by field name would erase the discrimination to save 18 lines.
Both functions are short, adjacent and pure, so drift risk is low. Intentional variety.

**`comment-panel.tsx:116` local-time date formatting — checked, intentional.** It is the only
`Intl.DateTimeFormat` with `month: "short", day: "numeric"` that omits `timeZone: "UTC"`, which makes
it look like a drifted copy of `formatDate` (`workspace-data.ts:295`–`301`). It is not: comment
timestamps are instants, where the viewer's local day is the right day, whereas `formatDate` renders
date-only columns (`due_date`, `start_date`) where UTC is the only stable reading. Unifying them would
shift comment timestamps by a day near midnight. The same reasoning covers `credits-page.tsx:323`
(adds a year for a financial ledger), `briefing-summary.tsx:76` (`dateStyle: "long"`),
`notifications-page.tsx:66` (renders in the workspace's configured timezone) and `home-page.tsx:46`
(today's date in the viewer's own locale). Five different jobs, not five copies.

**Canvas fit maths — already consolidated.** `boardFit` (`board-layout.ts:332`) and `canvasFit`
(`canvas-layout.ts:273`) both delegate to `fitToContent` (`shared/canvas-fit.ts:21`) and differ only in
the two documented parameters. Only the stale comment (L8) remains.

**Sidebar "Studio settings" and "Team" — checked, intentional.** `app-shell.tsx:300`–`319` gives the
settings Team tab a second entry point. This is the exact shape J05 warns about, and the comment at
`:310`–`311` states the reasoning: *"who is in the studio is a thing you look for by name, not a
setting you tune."* Removing it would remove a useful action. Leave it.

**`downloadPrivateFile`'s single consumer — checked, not a finding on its own.** It has one call site
(`assets-page.tsx:43`), which under the shared-primitive rule would argue for moving it back into the
feature. It already lives in `features/assets/`, so it is correctly placed; M3 concerns its body, not
its location.

**`supabase/.restore-drill/` — not a finding.** The duplicated migration and test tree there is a
restore-drill artifact, gitignored at `supabase/.gitignore:6` and untracked.

**Also checked, nothing found:** `settings-page.tsx` tab routing; `design-viewer.tsx` toolbar actions;
`brand-page.tsx` section navigation and its single contextual Edit control; `assets-page.tsx` upload
and delivery actions (the two upload buttons target different kinds with different gating, and the
"Complete delivery" callout at `:153` appears only when its precondition holds, so it is not a second
copy of a toolbar action); `campaign-data.ts` versus `settings-data.ts`'s `saveCampaign` (two
different writes — create-for-a-client versus create-or-edit-from-settings — that coincide only on a
cache key, already recorded elsewhere); `board-page.tsx`'s canvas and list views (different
affordances over the same data, which is a view toggle, not a redundant section).

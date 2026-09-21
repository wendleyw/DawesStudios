# Acceptance family F — project canvas, conversation, review, and delivery

Measurement pass for rows **F01–F17** of [`docs/architecture/acceptance-matrix.md`](../architecture/acceptance-matrix.md).
This is evidence, not repair: no application code, CSS, data module, migration or existing test was
changed while producing it.

| Field | Value |
|---|---|
| Date | 2026-09-21 |
| Branch | `main` at `0b5473a` |
| Application under test | `http://localhost:3003`, container `dawes-studios-app-web-1`, image `dawes-studios-web:local` built `2026-09-21T12:30:41Z` from `6bc6228` |
| Image vs. head | The image predates head by one web commit, `0b5473a`, whose only source changes are in `apps/web/features/board`. No file under `features/projects`, `features/reviews`, `features/assets`, `app/` or `supabase/` differs between the image and head, so family F's surface in the running image is head's. |
| Backend | `supabase_db_dawes-studios` (local Docker stack) |
| Driver | A throwaway Playwright probe, `apps/web/tests/e2e/evidence-probe-family-f.spec.ts`, four tests, deleted after the run. Every measurement below is a line it printed with the `FF|` prefix. |
| Accounts | `studio@dawes.local` (agency), `designer@dawes.local` / `designer2@dawes.local` (designer), `sabre@client.dawes.local` (client), `acme@client.dawes.local` (a second tenant's client), from `tests/e2e/test-support.ts` |
| Fixtures | `createProductionFixture` / `cleanupTestProject` (`tests/e2e/project-fixture.ts`), plus a two-deliverable variant built in the probe from the same RPC chain and cleaned by the same helper |
| Result | **16 of 17 Verified. F15 fails — see [Defect F-1](#defect-f-1-a-designer-never-learns-the-client-requested-changes).** |
| Artefacts | [`screenshots/family-f-project-canvas.png`](screenshots/family-f-project-canvas.png), [`screenshots/family-f-pin-alignment.png`](screenshots/family-f-pin-alignment.png) |

## Dataset integrity

Thirteen tables counted immediately before and after the full four-test probe run, identical on both
sides:

| clients | projects | campaigns | design_versions | designs | notifications | briefings | published_versions | published_designs | internal_comments | client_comments | delivery_files | project_assignments |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 10 | 25 | 12 | 44 | 47 | 15 | 30 | 18 | 22 | 22 | 57 | 1 | 25 |

`design_versions` 44 and `designs` 47 are the known pre-existing drift against the recorded baseline
of 41/46; those extra rows belong to the seeded SABRE project `Social Launch` and were created at
`2026-09-21T02:42Z`, before this pass. Every mutation this pass performed happened inside
`Acceptance …` fixtures removed by `cleanupTestProject`.

## What the existing specs already proved

Before re-proving anything, the two specs that touch family F were run against this build; both
passed in 8.8 s.

| Spec | Rows it partly covers | What it already establishes | What it does not |
|---|---|---|---|
| `tests/e2e/production-workflow.spec.ts` | F05, F06, F07, F08, F09, F10, F11, F12, F13, F14, F16 | One three-session journey on a **single-deliverable** project: designer creates V1, uploads two designs, keeps an unsent internal draft that survives a carousel move, pins and sends an internal note, submits to the studio; the client's reloaded session shows no design and not the internal note; the agency publishes; the client sees two designs; editing the working design afterwards leaves `published_designs` and the published asset's SHA-256 identical; the client pins and comments, requests changes, the agency publishes V2, the client approves; the agency uploads a delivery file and completes delivery; the client downloads it; a client API call returns `[]` for `internal_comments` and `delivered` for the project status. | One deliverable, so no grouping or filtering (F01); one version open at a time with no node/record comparison (F02); no inspector review in any role (F03); no assignment at all (F04); no negative case anywhere — nothing is ever attempted and refused; no channel switch (F06 agency half); no boundary coordinates or zoom measurements (F08); no review list (F15); no share link (F17). |
| `tests/e2e/project-recovery.spec.ts` | F05 | A failed `add_design` keeps the form, retries onto the **same** stored object, discards an abandoned upload, and refuses a stale working-design save with "changed while you were editing". | Nothing about versions other than V1, and no before/after comparison of an earlier version. |

`tests/e2e/workspace-actions.spec.ts` was reviewed and covers family D only; it never opens
`/projects/:id`.

Everything below is what this pass added.

---

## F01 — xyflow canvas, grouping by deliverable, ordered versions and designs, filter

**Required evidence:** multi-deliverable / V1 / V2 fixture rendering and node/record comparison.

**What was done.** A two-deliverable fixture was built through the product's own RPC chain
(`save_briefing` → `submit_briefing` → `confirm_briefing_budget` → `accept_briefing` →
`assign_designer`) with deliverables of deliberately different formats and proportions: `Campaign
square` (`square`, 1080 × 1080, 1 piece) and `Story frame` (`story`, 1080 × 1920, 2 pieces). Through
the browser, the designer created square V1 with two uploaded designs and square V2 with one; the
agency created story V1 with one. Every node the canvas drew was then read back with its
`data-id` and its on-screen `y`, sorted by `y`, and compared to the records.

**Measured.**

| Check | Result |
|---|---|
| `.react-flow` instances on the page | 1 |
| Node ids, sorted top to bottom | `deliverable-<square>`, `<square V1 id>`, `<square V2 id>`, `deliverable-<story>`, `<story V1 id>` — identical to the expected sequence built from `deliverables` and `design_versions` |
| Deliverable headers | `{format: "square", name: "Campaign square", dimensions: "1080 × 1080 · 1 piece"}`, `{format: "story", name: "Story frame", dimensions: "1080 × 1920 · 2 pieces"}` |
| Design tile order inside square V1 | `["Square direction A", "Square direction B"]` — identical to the `designs` rows ordered by `sort_order` |
| `--artwork-height` per version row | `200px`, `200px`, `300px` — the square sections use `TILE_W × 1`, the story section the `ARTWORK_MAX_H` clamp |
| Filter → `Story frame` | Nodes become exactly `["deliverable-<story>", "<story V1 id>"]` |
| Filter → `All deliverables` | All five nodes return, in the same order |

The ordering is not incidental: version frames are laid out by `buildCanvas` in `version_number`
order within a section, and the section order follows `sort_order` on `deliverables`. The rendered
`data-id` set is the record set, with no extra or missing node.

Artefact: [`screenshots/family-f-project-canvas.png`](screenshots/family-f-project-canvas.png).

**Verdict: Verified.**

## F02 — Version/design selection opens the reviewer; the carousel stays in its version

**Required evidence:** two-version / two-design browser journey and stable selected IDs.

**What was done.** On the same fixture (square V1 holding two designs, square V2 holding one), each
design was opened from its own version card and the viewer's single xyflow node id was read — that
node's id **is** the selected design's id, so it is a direct identity check rather than a title
match.

| Step | Viewer node `data-id` | Carousel |
|---|---|---|
| Open `Square direction A` from V1 | `= designs[0].id` | `1 of 2 · V1` |
| `Previous design` | disabled | — |
| `Next design` | `= designs[1].id` | `2 of 2 · V1` |
| `Next design` again | disabled | — |
| `All designs` | overview restored: the same five node ids, in the same order | — |
| Open `Square direction A2` from V2 | `= the V2 design's id` | `1 of 1 · V2` |

The carousel reported `2` designs in V1 and `1` in V2, never `3`: it is scoped to the version, not to
the deliverable. Back restored the overview to the exact node sequence F01 recorded.

**Verdict: Verified.**

## F03 — The inspector across three roles, with no duplicated competing controls

**Required evidence:** three-role inspector review and persisted allowed changes.

**What was done.** Three independent browser contexts opened the same project and the details panel,
and each one's controls and fields were counted.

| | Agency | Designer | Client |
|---|---|---|---|
| Details panels on screen | 1 | 1 | 1 |
| `Project details` toggles in the header | 1 | 1 | 1 |
| `Conversation` toggles | 1 | 1 | 1 |
| Channel controls | 1 | 1 | 1 |
| Deliverable filters | 1 | 1 | 1 |
| Fields | Service, Starts, Due date, Deliverables | same | same |
| `Edit project details` | 1 | 0 | 0 |
| `Designer` section | 1 (`Alex Morgan`) | 0 | 0 |
| `View briefing` | 1 | 1 | 1 |
| `Brand direction` | 1 | 1 | 1 |
| `Files` | 1 | 1 | 1 |
| `Copy project link` | 1 | 0 | 1 |
| Version history | 1 — `Story frame · V1`, `Campaign square · V2`, `Campaign square · V1` | identical | present but empty (no publication yet, which is the client channel's correct reading) |

Nothing in the client's panel contains the assigned designer's display name. Every route out of the
project — briefing, brand, files — is a single link, and every panel toggle exists once.

**Persisted allowed change.** The agency edited title, notes, start and due date through the panel;
after a reload the `projects` row read
`{title: "Acceptance family-f renamed", start_date: "2026-10-01", due_date: "2026-11-15"}` and the
panel rendered `Oct 1` / `Nov 15`. The designer and client have no edit affordance, and a direct
`projects` update as either role changed nothing (see F04).

**Verdict: Verified.** See also [Finding F-2](#finding-f-2-two-add-design-controls-share-one-accessible-name),
an accessible-name collision that does not make two controls compete for the same task.

## F04 — Assignment and dates save durably, are absent from client payloads, and are read-only to designers

**Required evidence:** persist/reload and direct negative mutation/read checks.

**Durability.** The agency assigned `Jordan Reed` through the panel. After a full reload the panel
listed `["Alex Morgan", "Jordan Reed"]` and `project_assignments` held 2 rows. Removing Jordan Reed
through the confirmation dialog and reloading left `["Alex Morgan"]` and 1 row. Dates: recorded
under F03.

**Absence from the client payload — inspected, not inferred.** Two independent readings:

1. A Supabase client authenticated as `sabre@client.dawes.local` asked the API directly:

| Query as the client | Result |
|---|---|
| `project_assignments` where `project_id = <fixture>` | `[]` — no error, RLS returned no row (`assignments_read` admits only `is_agency()` or `designer_id = auth.uid()`) |
| `profiles` | one row, `{display_name: "SABRE Team", role: "client"}` — no designer profile at all |
| `projects` row columns | `id, client_id, campaign_id, briefing_id, title, description, status, service_type, due_date, start_date, board_position, created_at, updated_at` — no designer or assignment column exists to leak |

2. Every REST response body the client's browser received while opening `/projects/:id` and its
   details panel was captured: **15 responses** across `workspace_settings`, `profiles`, `projects`,
   `clients`, `notifications`, `published_versions`, `published_designs`, `publication_reviews`,
   `deliverables`. None contains the string `Alex Morgan` or the designer's UUID.

**Read-only to designers — attempted, not assumed.**

| Attempt as the designer | Response |
|---|---|
| `insert` into `project_assignments` | `42501 permission denied for table project_assignments` |
| `update` `project_assignments` | `42501 permission denied for table project_assignments` |
| `delete` from `project_assignments` | `42501 permission denied for table project_assignments` |
| `rpc assign_designer` | `42501 Agency access required` |
| `rpc revoke_design_assignment` | `42501 Agency access required` |
| `rpc assign_designer` **as the client** | `42501 Agency access required` |
| `update projects set due_date` as designer **and** as client | No error — and the stored `due_date` was still `null` afterwards |

The last row is the reason a status code alone is not evidence. `projects` carries column-level
`grant update(title,description,due_date,start_date,board_position)`, so PostgREST accepts the
statement; the `projects_edit` policy (`using(private.is_agency())`) then matches no row, and
PostgREST answers `204` with nothing changed. The refusal is real, it is simply silent — the
verified fact is the unchanged `due_date`, not the response code. The designer still reads its own
assignment row (1 row), which is what "read-only" means here.

**Verdict: Verified.**

## F05 — Real upload, a new version with notes, earlier versions intact

**Required evidence:** file and version records before/after, reload, immutable content comparison.

**What was done.** Three distinct PNGs were used so the byte comparison is meaningful. The
**designer** created square V1 and uploaded two designs; the **agency** created story V1 and uploaded
one — both roles exercised the upload path. The designer then created square V2 with the note
`"V2 refines direction A after studio notes."` and uploaded a third artwork.

| Measurement | Before V2 | After V2 and a reload |
|---|---|---|
| V1 `designs` rows (full rows, JSON-compared) | `[["Square direction A", 0], ["Square direction B", 1]]` | identical |
| V1 stored object SHA-256 | `499441e0…438a`, `9a15be27…235c` | identical |
| Version cards on screen | — | 3 |

Every design holds its own object under an opaque `<project UUID>/<random UUID>.png` path — four
designs, four distinct paths. Version notes stored as written:
`[[1,"V1 explores two square directions."],[2,"V2 refines direction A after studio notes."],[1,"Story V1, drafted by the studio."]]`.

`project-recovery.spec.ts` separately proves that a retried registration reuses the one stored
object rather than adding a second, and that an abandoned upload is removed.

**Verdict: Verified.**

## F06 — Channel switching, one channel per non-agency role, and scoped drafts

**Required evidence:** three concurrent sessions, unsent drafts, design/channel switches and response inspection.

**The switch.** The agency's toolbar offers exactly `["Working files", "Shared with client"]`. The
designer's toolbar renders the static text `Working files` with **0** buttons; the client's renders
`Shared designs` with **0** buttons. The channel is chosen by role in `project-page.tsx` and the read
is chosen by channel in `project-data.ts`, so a client session never names an internal table.

**Drafts.** With the conversation panel open, the agency typed an internal draft, switched to the
client channel — the composer was **empty**, and the panel's accessible name changed from
`Studio conversation` to `Client conversation` — typed a different client-channel draft, switched
back, and found the internal draft restored verbatim; switching forward again restored the client
draft. Sending the client draft cleared the composer. Per-design draft retention within one channel
is proven by `production-workflow.spec.ts`.

**Response inspection — each role asked for the other channel directly.**

| Read | Rows | Error |
|---|---|---|
| Designer → `client_comments` | 0 | none (RLS filtered) |
| Client → `internal_comments` | 0 | none (RLS filtered) |
| Designer → `publication_reviews` | 0 | none |
| Designer → `published_versions` | 0 | none |
| A second tenant's client → `published_designs` | 0 | none |
| Agency → the same tables, for comparison | `client_comments` 1, `internal_comments` 1, `publication_reviews` 1 | — |

The agency comparison row matters: the zeroes are exclusion, not an empty project.

**Writes into the other channel.**

| Attempt | Response |
|---|---|
| Designer posts to `client` | `42501 Client channel access required` |
| Client posts to `internal` | `42501 Internal channel access required` |
| Agency posts to an invented channel `public` | `P0001 Invalid comment channel` |
| A second tenant's client posts here | `42501 Client channel access required` |

**Verdict: Verified.**

## F07 — Comments save with authenticated authors and arrive in the correct channel

**Required evidence:** send/read/reload in each authorized role; forged author/channel rejection.

**Sends, one per authorized role.**

| Author | Scope | Stored row |
|---|---|---|
| Agency | project level, internal | `author_id = agency`, `design_id null`, `version_id null`, no pin |
| Designer | design level, internal | `author_id = designer`, design A, its version, no pin |
| Designer | design level, internal, pinned | `author_id = designer`, design A, its version, pin `[0.25, 0.75]` |
| Designer | design level, internal, pinned | `author_id = designer`, design B, its version, pin `[0.8, 0.2]` |
| Client | design level, client channel, pinned | `author_label "SABRE Team"`, `author_kind "client"`, its publication, its published design, pin `[0.6, 0.4]` |
| Client | project level, client channel | delivered live to the agency's open session |

Every internal row carries the real signed-in author id; the client channel stores a label and kind
rather than an identity, with the true author kept in `private.client_comment_authors`.

**Reload.** After a full page reload the designer's project conversation still showed exactly
`["Studio: project-level note, internal channel."]`.

**Realtime.** With the agency parked on the client channel's conversation (composer list empty), the
client sent a project-level message; the agency's list became
`["Client: a project-level message for the studio."]` with no reload — the `useProjectEvents`
subscription on `client_comments` delivering it.

**Forgery.**

| Attempt | Response |
|---|---|
| Designer inserts into `internal_comments` with `author_id` = the agency | `42501 permission denied for table internal_comments` |
| Agency inserts into `internal_comments` with `author_id` = the designer | `42501 permission denied for table internal_comments` |
| Client inserts into `client_comments` with `author_kind: "studio"` | `42501 permission denied for table client_comments` |
| Designer rewrites another author's comment | `42501 permission denied for table internal_comments` |
| Any role posts with `p_channel` outside the two | `P0001 Invalid comment channel` |

No `Forged%` row exists afterwards. Neither comment table carries an insert or update grant at all:
authorship can only be set by `post_comment`, which takes it from `auth.uid()`.

**Verdict: Verified.**

## F08 — Pins: place, cancel, send, select, and normalised alignment

**Required evidence:** boundary-coordinate domain tests and visual browser checks at multiple zooms.

**Boundary coordinates, asked of the constraint itself.**

| Pin | Result |
|---|---|
| `(0, 0)` | accepted |
| `(1, 1)` | accepted |
| `(0.5, 0.5)` | accepted |
| `(-0.000001, 0.5)` | `23514 … violates check constraint "internal_comment_pin_pair"` |
| `(1.000001, 0.5)` | `23514 … violates check constraint "internal_comment_pin_pair"` |
| `x` only, no `y` | `23514 … violates check constraint "internal_comment_pin_pair"` |
| a pin with no `design_id` | `23514 … violates check constraint "internal_comment_pin_pair"` |
| a design comment with no `version_id` | `23514 … violates check constraint "internal_comments_check"` |

The closed interval is exact: both endpoints are inside, and one millionth beyond either is outside.
The last two rows are the scope integrity F09 depends on — a pin cannot float free of a design, and
a design comment cannot float free of its version.

**Interactive.** Pin mode → a pointer press at 25 % / 75 % of the artwork stage produced one
`.artwork-pin.pending`; `Remove pending pin` removed it; a second placement plus a message stored
`pin_x 0.25, pin_y 0.75` against design A and its version. Clicking the pin gave its comment the
`selected` class and the pin the `selected` class simultaneously — the highlight is bidirectional.

**Alignment across zoom, pan and resize.** The pin's centre was measured as a fraction of the artwork
stage's own box at seven viewport states:

| State | xyflow scale | Measured offset |
|---|---|---|
| Opening view | 1 | `(0.2500, 0.7500)` |
| Zoom in | 1.2 | `(0.2500, 0.7500)` |
| Zoom in again | 1.44 | `(0.2500, 0.7500)` |
| Zoom out three times | 0.8333 | `(0.2500, 0.7500)` |
| Drag-pan the viewport | 0.8333 | `(0.2500, 0.7500)` |
| Resize to 900 × 700 | 0.8333 | `(0.2500, 0.7500)` |
| Resize back to 1600 × 1000 | 0.8333 | `(0.2500, 0.7500)` |

The stored value is `0.25 / 0.75`; the rendered offset never moved by more than the fourth decimal.

Artefact: [`screenshots/family-f-pin-alignment.png`](screenshots/family-f-pin-alignment.png).

**Verdict: Verified.**

## F09 — Comment and pin scope: project, version, design and channel

**Required evidence:** multi-design/version/channel fixture assertions and interactive regression.

Stored scope, from the rows in F07: the project-level comment has `design_id null` **and**
`version_id null`; every design comment names both its design and its version; the client comment
names its `publication_id` and its `published_designs` id — a different id space from the internal
design it was rendered from.

Interactive regression, with a pin on design A and a pin on design B of the same version:

| Step | Pins on screen | Feedback list |
|---|---|---|
| Design A open | 1 (A's) | A's two comments; not B's, not the project-level one |
| `Next design` → B | 1 (B's) | B's comment only |
| `Previous design` → A | 1 (A's) | A's comments again, none of B's |
| `All designs` → `Conversation` | — | exactly `["Studio: project-level note, internal channel."]` |
| The client's copy of design A | 0 | the internal pin does not exist in the client channel |
| The designer's design A after the client commented | — | the client's message is absent |

**Verdict: Verified.**

## F10 — Internal submission does not reach the client

**Required evidence:** submission records, Client session before/after and scoped notification checks.

The designer wrote an internal message and used `Send to studio`. Afterwards:

- `projects.status` = `internal_review`.
- `notifications` for the project: `Design ready for internal review` addressed to the **agency**
  profile only. The one notification addressed to the client member is `Your project is ready`,
  written by `accept_briefing` when the fixture was created — no submission notification reaches a
  client member.
- The client's own API reads still return **0** rows from `design_versions` and **0** from
  `internal_comments`.

The browser half of the client's before/after is `production-workflow.spec.ts`, which reloads the
client session after the same submission and finds `0` design previews and the internal note absent
from the page.

**Verdict: Verified.**

## F11 — Only the agency publishes, and the snapshot is sanitized and immutable

**Required evidence:** publish, hash/snapshot, mutate internal design, compare client view and asset hashes.

**Only the agency.** With a version holding one design, `publish_version` was called directly:

| Caller | Response |
|---|---|
| Designer (assigned to the project) | `42501 Agency access required` |
| Client | `42501 Agency access required` |

`published_versions` held 0 rows afterwards. Only then did the agency publish through the dialog.

**Sanitized.** Before publishing, the internal design's `content` was given an extra key
`internal_note: "DO-NOT-SHARE-SOURCE-META"`. The resulting `published_designs.content` is
`{body, eyebrow, headline, background, foreground}` — the marker is absent, because
`private.public_design_content` copies a fixed allowlist rather than the source object. The published
asset is a different storage object in a different bucket from the internal one, and the client's own
credentials cannot download the internal object (`Object not found`).

**Immutable.** Two independent comparisons: `production-workflow.spec.ts` edits the working design
after publication and finds `published_designs` deep-equal and the published asset's SHA-256
unchanged; this pass (under F14) publishes an entire second version and finds V1's published rows
deep-equal and V1's published asset hash unchanged.

**Verdict: Verified.**

## F12 — Not-shared-yet shows project context and no internal design

**Required evidence:** client session before/after first publication.

Before the first publication, the client's own payload:

| Table | Rows |
|---|---|
| `design_versions` | 0 |
| `designs` | 0 |
| `published_versions` | 0 |
| `internal_comments` | 0 |
| `projects` | 1 — `{title, status: "in_progress", due_date}` |
| `deliverables` | 1 — `Campaign square` |

The project page rendered the heading, status and the details panel, with the canvas showing
`Your studio will share designs here when they're ready.` — context without artwork.

After the agency published, the client's **already-open** session showed one `.design-preview`
within the wait window and with no manual reload; `useProjectEvents` subscribes a client session to
`published_versions` and `published_designs`.

**Verdict: Verified.**

## F13 — The client decides on the exact published revision; replays and stale decisions are controlled

**Required evidence:** real review journey plus concurrent/replay/stale-publication integration cases.

**Who may decide.**

| Caller / input | Response |
|---|---|
| Agency | `42501 Client review access required` |
| Designer | `42501 Client review access required` |
| A second tenant's client | `42501 Client review access required` |
| The client, decision `maybe` | `P0001 Invalid review decision` |
| The client, `changes_requested` with blank feedback | `P0001 Describe the requested changes` |

The review stayed `pending` through all five.

**The journey.** The client opened the project, used `Review version`, chose `Request changes`, gave
feedback, and the heading badge became `Changes requested`. The stored row names the exact
publication, with `status: "changes_requested"` and the feedback text. The agency profile received a
`Client requested changes` notification carrying that feedback as its body.

**Replay, contradiction, concurrency, staleness.**

| Case | Response | Stored decision afterwards |
|---|---|---|
| The identical decision sent again | returns without error — a deliberate no-op in `review_publication` | unchanged |
| A contradicting decision (`approved`) | `P0001 This publication already has a review decision` | unchanged |
| Two identical decisions fired concurrently | both return without error | unchanged |
| V1 reviewed again once V2 exists | `P0001 Review the latest published version` | unchanged |
| Any review after delivery | `P0001 This publication already has a review decision` | unchanged |

**Verdict: Verified.**

## F14 — Requested changes handled internally, V2 published, V1 retained

**Required evidence:** full cross-role revision journey and immutable V1 comparison.

The agency answered the client's request in the **internal** conversation
(`"Studio: client wants more headline space — take it into V2."`); the client's own API read of
`internal_comments` stayed at 0 rows. The agency then created V2 with a note and shared it.

| V1 after V2 was published | Result |
|---|---|
| `published_designs` rows for V1's publication | deep-equal to the rows captured before V2 |
| V1's published asset SHA-256 | unchanged |
| V1's `publication_reviews` row | still `{status: "changes_requested", feedback: "Please give the headline more breathing room."}` |
| Version history in the inspector | `["Campaign square · V2", "Campaign square · V1"]` |
| The client's canvas | 2 version cards |

The client then approved V2 from its own card, and the project reached `Approved`.

**Verdict: Verified.**

## F15 — Waiting / Approved review views

**Required evidence:** review-list checks across seeded states and after a decision.

`/clients/:clientId/reviews` was opened in all three roles at five points in the lifecycle, and every
bucket was read. Rows are the fixture project's card only; the parenthesised number is how many cards
the bucket held in total, so an empty result is a filtered-out card rather than an empty page.

| Lifecycle point | Agency | Designer | Client |
|---|---|---|---|
| Design added, nothing submitted or published | `In review` — (4 total), `Studio review` — (2), `Approved` — (1) | **`In progress`: the project, "In progress"** (4) | `Waiting for you` — (4), `Approved` — (1) |
| V1 published, review pending | **`In review`: the project, "In review"** (5) | — | **`Waiting for you`: the project, "In review"** (5) |
| Client requested changes on V1 | **`In review`: the project, "Changes requested"** (5) | **`Approved`: the project, "Shared with client"** (1); `In progress` empty (3) | **`Waiting for you`: the project, "Changes requested"** (5) |
| Client approved V2 | **`Approved`: "Approved"** (2) | `Approved`: "Shared with client" (1) | **`Approved`: "Approved"** (2) |
| Project delivered | `Approved`: "Approved" (2) | `Approved`: "Shared with client" (1) | `Approved`: "Approved" (2) |

The agency's and the client's lists are correct at every point, and every card's link carries the
right channel (`channel=client` for both, `channel=internal` for the designer).

The **designer's** list is not. At the third row the client has just rejected V1, and the designer —
the person who has to act on it — sees an empty `In progress` bucket and the rejected version filed
under **Approved**. See [Defect F-1](#defect-f-1-a-designer-never-learns-the-client-requested-changes).

**Verdict: Unverified.** The row asserts the correct records *for the role*, and one of the three
roles is shown the opposite of what happened.

## F16 — Delivery of approved work, and what cannot corrupt it

**Required evidence:** download content verification and transition/idempotency checks.

**Premature and unauthorized.**

| Attempt | Response |
|---|---|
| Agency registers a delivery file that the media service never prepared | `P0001 Prepare a trusted sanitized delivery file for this project first` |
| Client calls `add_delivery_file` | `42501 Agency access required` |
| Agency marks delivered with no file | `P0001 Add a delivery file before marking delivered` |
| Client marks delivered | `42501 Agency access required` |
| Designer marks delivered | `42501 Agency access required` |

The project remained `approved` after all five.

**The window between upload and completion.** With the file uploaded but delivery not yet completed,
the client's own read of `delivery_files` returned **0 rows** and a direct storage download returned
`Object not found` — `private.delivery_released` withholding an unreleased production artifact from
the client channel.

**Completion, repetition, and the bytes.** The agency completed delivery through the dialog. Then:

| Case | Response | State afterwards |
|---|---|---|
| `mark_project_delivered` again | returns without error (the function returns early when already delivered) | 1 delivered project, 1 delivery file |
| `publish_version` on the already-published V2 | returns the existing publication id | still exactly 2 publications |
| `publish_version` on a **fresh** version created after delivery | `P0001 Delivered projects cannot publish new revisions` | still exactly 2 publications |
| `review_publication` after delivery | `P0001 This publication already has a review decision` | unchanged |

The client downloaded the file through the browser: `Family F final.png`, SHA-256
`abe7e10b8bb49702c7f2701a7525d7e970b76ddc727fddcbcc95ff1f56452fbd`, identical to the object stored in
the `delivery-files` bucket. A second tenant's client could not download the same path
(`Object not found`).

**Verdict: Verified.**

## F17 — Share / Copy link

**Required evidence:** copied-link open as authorized/unauthorized person and clipboard fallback.

`Copy project link` in the agency's inspector wrote
`http://localhost:3003/projects/<id>?channel=client` to a real clipboard (read back with granted
clipboard permission), and the button relabelled itself `Copied`.

**Clipboard denied.** With `navigator.clipboard.writeText` replaced by a rejecting stub, the same
button opened the `Copy this text` dialog whose read-only textarea contained exactly the same URL.

**Who the link works for.**

| Opener | Result |
|---|---|
| The owning client, signed in | The project page, heading rendered, channel control reading `Shared designs` |
| A second tenant's client, signed in | `Project unavailable.` |
| A signed-out visitor | Redirected to `/login?returnTo=%2Fprojects%2F<id>%3Fchannel%3Dclient` — no project content |

The `?channel=client` parameter is a view preference for an agency session, not a grant: a client
session is pinned to the client channel by role regardless of it, and a stranger's session is refused
by `projects_read` before any channel question arises.

**Verdict: Verified.**

---

# Defects

## Defect F-1: a designer never learns the client requested changes

**Severity: High.** It breaks the revision loop for the role that has to perform the revision.

**What happens.** When a client requests changes on a published version, the assigned designer's
review list moves that project **out of `In progress` and into `Approved`**, labelled
`Shared with client`. The designer is given no signal that anything was rejected, and the product
offers no other route to the client's decision.

**Reproduction.**

1. Sign in as the agency, open a project, create V1 for a deliverable and add a design.
2. Share the version with the client.
3. Sign in as the client, `Review version` → `Request changes`, with feedback.
4. Sign in as the assigned designer and open `/clients/<clientId>/reviews`.

**Observed (2026-09-21, fixture `Acceptance production 7a0aaee5`, designer `designer@dawes.local`):**

```
designer, after the client rejected V1:
  In progress : []                         (3 other cards on the page)
  Approved    : ["… | Sep 21 · Shared with client | channel=internal"]
```

The agency's and client's lists at the same instant both read `Changes requested`.

**Expected.** The version the client rejected is waiting on the designer, so it belongs in the
designer's in-progress bucket, carrying the client's decision.

**Why it happens** (three reinforcing causes, all read-only observations):

1. `apps/web/features/reviews/reviews-page.tsx:14` —
   `const isFinished = (status: string) => ["approved", "reviewed"].includes(status);`
   `reviewed` is the internal `design_versions` status meaning *published to the client*, labelled
   `Shared with client` by `versionStatusLabels`. Publishing therefore files the version under
   `Approved` for the designer whatever the client later decides.
2. `apps/web/features/reviews/review-data.ts` — for a designer the list is built from
   `design_versions` alone, with no `publication_reviews` join, so the client's decision is never
   read at all. The agency/client branch does embed that join.
3. The decision is not reachable elsewhere for a designer either. Measured as the designer against
   the fixture project: `publication_reviews` → **0 rows**, `published_versions` → **0 rows**, while
   the agency saw 1 of each. `private.can_client_channel` admits only the agency and client members.
   `public.review_publication` notifies the agency alone (`private.notify_agency`), so no
   notification reaches the designer. And on the project canvas,
   `apps/web/features/projects/project-data.ts` matches feedback with
   `reviews.find(r => r.publication_id === version.id)` — in the internal channel `version.id` is a
   `design_versions` id, which can never equal a `publication_id`, so the `Client feedback` panel on
   a version card is reachable only from the client channel, which a designer does not have.

**Note on the seed.** The canonical dataset does not reproduce this. Its two `changes_requested`
projects (`Kestrel Outdoor / Content Production`, `Rune Fitness / Printed Marketing Materials`) carry
`design_versions.status = 'draft'` on their latest internal version, whereas the application's own
publish path sets `'reviewed'`. The seed's internal statuses do not match what the product produces,
which is why the defect only appears when the flow is actually driven.

## Finding F-2: two "Add design" controls share one accessible name

**Severity: Low.** Not a role or data problem; a naming collision.

On a project with more than one deliverable, every deliverable's V1 renders a button whose
`aria-label` is `Add design to version 1` (`apps/web/features/projects/project-nodes.tsx`, the
`version-label` header button). With two deliverables the canvas carries two buttons with the
identical accessible name pointing at different versions, and a screen-reader or automation user has
no way to tell them apart. The same applies to `New version for <name>` only when two deliverables
share a name, which the data model permits.

The probe had to scope every such click to `.react-flow__node[data-id="<versionId>"]` to target the
right one. This does **not** make F03 fail: the two controls do different work, so they are not
competing controls for one task.

## Observation F-3: the review list does not distinguish a delivered project

Rows F15 asserts "pending/approved/delivered records". After delivery, the agency's and the client's
lists still show the project under `Approved`, labelled `Approved`; there is no delivered state in
`versionStatusLabels` for a publication and no delivered bucket. Nothing is waiting on anyone, the
link still resolves, and the delivered files are on the client's Files page, so this is recorded as a
naming gap rather than a wrong record — F15's verdict above rests on Defect F-1, not on this.

## Observation F-4: a silent refusal is indistinguishable from success at the client

`projects`, `designs`, `campaigns` and others carry column-level `UPDATE` grants, so a forbidden
update is refused by RLS row matching rather than by privilege, and PostgREST answers `204` with no
error. Every negative check in this record therefore verifies the **stored value**, not the response
code. This is correct behaviour (no information is leaked and nothing is written), but any future
evidence pass that reads only the status code will record a false "ALLOWED".

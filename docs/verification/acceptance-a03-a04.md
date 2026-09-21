# Acceptance evidence: A03 and A04

Measured 2026-09-21 against `main` at the working tree present in
`/Users/wendleywilson/DawesStudios`. Read-only: no code, docs, migrations or
tests were modified to produce this report; no command that touches the
database, Docker or a running service was executed (see the "not executed"
notes under A04). This file is the only artifact written.

## A03 — "English UI, errors, test fixtures, code, artifacts and documentation;
only direct chat uses pt-BR."

**Verdict: Verified.**

### Scope

```sh
git ls-files | wc -l                                   # 1282
git ls-files | grep -v '^docs/ref/' | grep -v '^brand/' | wc -l   # 493
```

`docs/ref/` (789 tracked files) and `brand/` (1 tracked file,
`brianna-dawes-studios.webp`) are excluded from the violation count because
`CLAUDE.md` instructs: "Treat `docs/ref` as inspiration and workflow evidence,
not a specification... Preserve these original source artifacts." Confirmed
`docs/ref` is genuinely Portuguese source material, not new project content:

```sh
$ find docs/ref -name "README.md" | head -1 | xargs head -8
# Creative Canvas — referência para reconstrução
**711 screenshots**, organizados por perfil, tela e ação. ...
```

The 493 remaining tracked files are the actual scope of the language policy.

### Method 1 — non-ASCII byte scan (catches any script, not just Portuguese)

A first pass using the shell's wrapped `grep -Il '[^\x00-\x7F]'` produced 356
false-positive matches out of 356 files tested — the wrapper resolves to
`ugrep`/BSD grep, neither of which honours `-P`/`\x`-hex escapes the way GNU
grep does, so the pattern degraded silently. Re-ran with a Python UTF-8 scan
instead (byte-accurate, no shell/grep-flavor dependency):

```python
# scans all 493 in-scope files, decodes as utf-8, flags any char > U+007F
```

Result: 309 of 493 files contain at least one non-ASCII character. Character
frequency count across every flagged line:

| Char | Count | What it is |
|---|---|---|
| `—` U+2014 | 1945 | em dash (typography) |
| `→` U+2192 | 412 | arrow (typography, diagrams) |
| `…` U+2026 | 292 | ellipsis |
| `–` U+2013 | 203 | en dash |
| `×` U+00D7 | 173 | multiplication sign (dimensions, e.g. "1600 × 1000") |
| `·` U+00B7 | 62 | middot separator |
| `’ " "` | 57 | curly quotes |
| `§` | 30 | section sign |
| `≥ ≈ − ↔ ≤ ↗ ⌘ ∩` | 27 | math/keyboard symbols |
| `é` | 1 | see below |
| `ã` | 1 | see below |

309 files match only because they use em dashes, arrows and typographic
punctuation — normal in English prose — not because of language content.
Filtering those symbols out leaves exactly **2 lines** with a real
non-ASCII letter, both false positives on inspection:

| File | Line | Content | Why it is not a violation |
|---|---|---|---|
| `apps/web/features/settings/settings-model.test.ts` | 57 | `expect(clientSlug("Café North")).toBe("cafe-north");` | `Café North` is a synthetic test client/business name (proper noun), used to verify slug-generation handles accented input — not Portuguese prose. |
| `apps/web/features/workspace/workspace-format.test.ts` | 64 | `// 02:00Z is the previous evening in São Paulo: the notifications page was...` | `São Paulo` is a real city name (proper noun) used in a timezone-conversion test comment. |

### Method 2 — Portuguese word list (catches ASCII-only Portuguese, e.g. "para", "nao")

Searched all 493 files for ~30 common Portuguese function words/phrases
(não/nao, está, então, após, você, usuário, senha, orçamento, rascunho,
equipe, revisão, aprovação, agência, cliente, projeto, configuração, código,
página, arquivo, formulário, painel, botão, campo, etc.), case-insensitive,
word-bounded.

Result: 73 matches, all in 4 files — `docs/architecture/acceptance-matrix.md`,
`docs/architecture/domain.md`, `docs/architecture/reference-map.md`,
`docs/architecture/sitemap.md`. Every one of the 73 is inside a Markdown
**link path** pointing into `docs/ref/` (e.g.
`../ref/01-agencia/02-board/08-sem-resultados.png`,
`../ref/02-cliente/03-projeto/20-ainda-nao-compartilhado.png`). The
surrounding prose in all four files is English; only the referenced
directory/file names — which are the preserved original artifact names —
are Portuguese. This is a reference to preserved source, covered by the same
`CLAUDE.md` docs/ref exemption above, not new Portuguese content.

### Method 3 — file names

```sh
git ls-files | grep -v '^docs/ref/' | grep -iE 'agencia|cliente|projeto|configuracao|nao|voce|usuario|senha|orcamento|rascunho'
# (no output)
```

No tracked file outside `docs/ref/` has a Portuguese name.

### Method 4 — commit messages (subjects and bodies)

```sh
git log --format='%H %s' | <scan for any char > U+007F>
# non-ascii commit subjects: 0 / 89
git log --format='%B' | <same scan>
# 25 lines flagged, 100% em dashes (—), 0% language content
```

All 89 commit subjects are pure ASCII; every non-ASCII character in the full
commit-body history is an em dash used as punctuation in English sentences
(e.g. "and the section now says so — a green `db:start` shows only...").

### Method 5 — structured data (fixtures, seed, CSV)

```sh
python3 -c "... decode supabase/fixtures.json as utf-8, flag non-ascii lines"
# non-ascii lines in fixtures.json: 0
git ls-files | grep -E '\.csv$' | grep -v '^docs/ref/'
# (no output — no tracked CSV outside docs/ref)
```

### Undecodable / binary check

```python
# attempted utf-8 decode of all 493 in-scope files
```

The only files that fail UTF-8 decode are binary images (`.png`/`.webp`),
confirming no source file uses a non-UTF-8 text encoding that could hide
content from the scans above.

### A03 counts

| Check | Files scanned | Violations |
|---|---|---|
| Non-ASCII byte scan (real letters only, symbols excluded) | 493 | 0 (2 proper-noun false positives) |
| Portuguese word list | 493 | 0 (73 hits, all preserved docs/ref link paths) |
| File names | 493 (tracked, excl. docs/ref/brand) | 0 |
| Commit subjects | 89 | 0 |
| Commit bodies | full history | 0 (25 typographic false positives) |
| `fixtures.json` / seed / CSV | 3 sources | 0 |

**Nothing outside `docs/ref` and `brand` (both explicitly preserved by
`CLAUDE.md`) contains non-English project content.** Both exempted locations
were independently confirmed to actually be the preserved Portuguese source
material the exemption describes, not a dumping ground for new content.

---

## A04 — "README/setup, architecture and operational documentation match
actual paths, commands, environment and behaviour."

**Verdict: Unverified.** Every command, path, port, env var and script
existence check passed. Seven specific factual/numeric claims across four
documents are demonstrably stale or self-contradictory. None of them make the
document unusable, but each is a false claim as written today.

### Documents checked

`README.md`, `docs/architecture/backend.md`, `docs/operations/README.md`,
`docs/architecture/data-access.md`, `docs/architecture/design-system.md`,
`apps/web/features/shared/README.md`, `apps/web/README.md`,
`apps/media/README.md`, plus the 10 feature READMEs under
`apps/web/features/*/README.md` (link-resolution only, see below).

### Commands — resolved by reading, not executing

Per the task's hard constraint, no `db:*`, Docker, or provisioning command was
run. Two commands were executed because they are pure, offline, non-mutating
unit-test runs with no database/Docker dependency (`npm test` inside
`apps/media`, `npx vitest run` for two shared-boundary tests in `apps/web`);
everything else was resolved statically against `package.json` / script
source.

```sh
$ cat package.json | grep scripts -A15        # root: dev/build/start/check/test/test:e2e/db:*/hooks — all present
$ cat apps/web/package.json | grep scripts -A12   # dev/build/start/test/lint/typecheck/test:e2e/format/check — all present
$ apps/web/package.json "dev": "next dev --port 3003" / "start": "next start --port 3003"   # matches README's :3003 claim
$ supabase --version
2.98.2   # matches docs/operations/README.md's "validated CLI version is 2.98.2" exactly
```

All 30 RPC function names listed in `docs/architecture/backend.md`'s mutation
table were confirmed present in `supabase/migrations/*.sql`
(`save_briefing`, `save_briefing_revision`, `submit_briefing`,
`confirm_briefing_budget`, `accept_briefing`, `adjust_credits`,
`create_client`, `assign_designer`, `revoke_design_assignment`,
`create_design_version`, `add_design`, `submit_design_version`,
`publish_version`, `review_publication`, `add_delivery_file`,
`mark_project_delivered`, `post_comment`, `resolve_comment`,
`create_invitation`, `accept_invitation`, `revoke_invitation`,
`update_workspace_settings`, `save_service_preset`, `request_credits`,
`fulfill_credit_request`, `reject_credit_request`, `add_briefing_attachment`,
`remove_briefing_attachment`, `register_sanitized_asset`,
`discard_sanitized_asset`, `get_assigned_briefings`) — 30/30 found.

All named scripts exist and their flags match exactly, e.g.:

```sh
$ grep "parser.add_argument\|args.action=='reset'" supabase/scripts/local_stack.py
parser.add_argument('action',choices=['start','stop','status','reset','media-start','media-stop'])
parser.add_argument('--confirm-local-data-loss',action='store_true')
if not args.confirm_local_data_loss: parser.error("Reset requires --confirm-local-data-loss ...")
```

matches `docs/operations/README.md`'s documented invocation exactly.

Ports in `supabase/config.toml` (`[api] port=55421`, `[db] port=55422`,
`[studio] port=55423`, `[inbucket] port=55424`) match both
`docs/architecture/backend.md` and `docs/operations/README.md`'s port table
exactly. `compose.yaml` matches `apps/web/README.md`'s container claims
(`read_only: true`, `cap_drop: [ALL]`, port `3003`/`55430`,
`host.docker.internal` extra host). `.env.production.example` and
`apps/web/.env.example` match the documented variable names and defaults
(`SUPABASE_INTERNAL_URL` is correctly documented as optional/not-in-example —
it is read in `apps/web/app/api/invitations/route.ts` with exactly the
described fallback to `NEXT_PUBLIC_SUPABASE_URL`).

### Links — all resolve

```python
# checked every non-http markdown link in the 8 core documents above
# total relative links checked: 39
# broken: []
```

The same check against all 10 `apps/web/features/*/README.md` files found 0
broken links out of 22 checked.

### Confirmed discrepancies

| # | File : line | Claims | Actually is | Evidence |
|---|---|---|---|---|
| 1 | `docs/architecture/backend.md:99` | Realtime publication includes 6 tables: `projects, internal_comments, client_comments, notifications, publication_reviews, published_versions` | The publication has **8** tables — migration `202609200026_realtime_design_events.sql` later added `design_versions` and `designs`, undocumented here | `grep -n "alter publication supabase_realtime add table" supabase/migrations/*.sql` shows both the original 6-table migration (`202609200005`) and a second migration (`202609200026`) adding 2 more; `docs/architecture/backend.md` still only lists the original 6 |
| 2 | `docs/architecture/backend.md:120` | "`npm --prefix apps/media test`: seven raster/PDF regeneration tests" | **14** tests across 2 files (9 in `sanitize.test.js`, 5 in `server.test.js`) | `npm test` in `apps/media` → `Test Files 2 passed (2)  Tests 14 passed (14)`. `apps/media/README.md:32` itself correctly says "14 tests across two files" — the two docs disagree with each other |
| 3 | `docs/operations/README.md:32` | "The 22 private production images and their 15 published copies are rendered..." | **27** private production images and **18** published copies | Same document's own line 39 says "27 private production images, 18 published copies"; `supabase/scripts/verify_seed.py:122-127` hard-codes `working_files = 27`, `publication_files = 18` and asserts fixture counts against them. Line 32's 22/15 is an internal self-contradiction, not just a stale doc |
| 4 | `docs/architecture/data-access.md:19` and `apps/web/features/projects/README.md:54` | `findUnchangedDesign` at `:99`, `findDesignByAsset` at `:113` in `project-action-dialog.tsx` | The calls are at lines **100** and **114** | `grep -n "findUnchangedDesign(database\|findDesignByAsset(database" apps/web/features/projects/project-action-dialog.tsx` → `100:` and `114:`. Both docs cite the same stale (pre-edit) line numbers |
| 5 | `docs/architecture/design-system.md:242` | `globals.css` is "1,105 lines after the Task 5 split, down from 2,221" | `wc -l apps/web/app/globals.css` → **1132** lines | Direct line count; the doc also describes later removals/relocations from `globals.css` (the "final structural-refactor fix wave"), which should have made the file shorter than 1,105, not longer — the discrepancy runs the wrong direction for "more rules were added since" to explain it |
| 6 | `docs/architecture/design-system.md:340` | "the 13 feature stylesheets declared 736 distinct selectors between them" | Re-running the exact extraction algorithm the doc describes (and that `stylesheet-boundary.test.ts` implements) over the current 13 feature stylesheets gives **730** distinct selector heads | Reproduced `extractSelectorHeads()` from `apps/web/features/shared/stylesheet-boundary.test.ts` in a standalone script against the live 13 `.css` files: 941 total heads, 730 distinct. (The boundary invariant itself still holds — `npx vitest run features/shared/stylesheet-boundary.test.ts` passes — only the specific count is stale) |
| 7 | `apps/web/features/shared/README.md:67` | `FormError` has "46 call sites in 27 files", listing `briefings/briefing-editor` and `briefings/briefings-page` among consumers | **44** call sites in **27** files; neither `briefing-editor.tsx` nor `briefings-page.tsx` contains `FormError` at all — the real consumer is `briefing-editor-form.tsx` | `grep -ro '<FormError' apps/web/features --include="*.tsx" \| wc -l` → 44; per-file breakdown sums to 44; `grep -n FormError apps/web/features/briefings/briefing-editor.tsx apps/web/features/briefings/briefings-page.tsx` → no matches in either file. The file count (27) is correct; the call-site count and two of the named files are not |

### What would have to change for A04 to move to Verified

Each of the 7 rows above would need its document corrected to the measured
value (backend.md's realtime table list and test count; operations/README's
22/15 → 27/18; the two `:99`/`:113` references → `:100`/`:114`; design-system's
line and selector counts refreshed against the current files; shared/README's
FormError count and its two stale consumer names replaced with
`briefing-editor-form`). None of these require touching code — the code and
tests already reflect the true values in every case checked (the docs are
what drifted). No other command, path, port, env var, RPC name or link failed
verification across the 8 core documents and 10 feature READMEs read.

### Explicitly not executed (would touch the shared running stack)

`db:reset`, `db:start`, `db:stop`, `supabase/scripts/verify_seed.py`,
`supabase/scripts/verify_local.py`, `supabase/tests/http_auth_storage_test.py`,
`supabase/tests/concurrent_workflows_test.py`,
`supabase/tests/realtime_boundary_test.mjs`,
`npm --prefix apps/media run test:integration`, `docker compose ...`, `npm
audit`. Their line-count/test-count claims (e.g. "nine real Auth/PostgREST/
Storage integration tests", "15 real worker pipeline checks", "four
concurrent workflow scenarios", port `55521`) were instead verified by
reading the source and counting `def test_`/assertion-increment statements
statically — all matched exactly (9 `def test_` methods in
`http_auth_storage_test.py`; assertion counter in `integration-test.js` sums
to exactly 15; 4 `def test_` methods in `concurrent_workflows_test.py`; its
hard guard checks `SUPABASE_URL == 'http://127.0.0.1:55521'`). The one number
that could not be confirmed this way is `verify_seed.py`'s claimed "108 actual
file downloads" in `docs/architecture/backend.md:125` — that total is computed
at runtime from live seeded data (`downloaded == brand_files + working_files +
publication_files + delivery_files`, evaluated against whatever the database
actually holds), so confirming the literal "108" requires running the script
against the live local Supabase stack, which this task's constraints
prohibit. This is marked unknown, not failing.

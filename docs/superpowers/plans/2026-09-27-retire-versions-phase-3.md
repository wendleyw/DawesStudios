# Retire Versions — Phase 3 (seed and SABRE demo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The canonical seed and the SABRE demonstration create Miro-model data: design boards,
rounds, client versions with sample Miro links, and covers. They no longer reference anything that
migration `202609270007` removed. Counts stay: seed 10 clients / 25 projects; SABRE overlay
50 SABRE / 10 clients / 68 total.

**Architecture:** `build_seed.py` generates `supabase/seed.sql`, and `verify_seed.py` asserts it. The
cover bytes, which must be attested by the media worker, are uploaded by the post-migration
provisioning step (`provision_local_auth.py`, which already uploads the seed's Storage objects).
They are not written in SQL. The SABRE scripts (`sabre_demo.py`, `sabre_demo_extras.py`,
`sabre_demo_state.py`) move to the same model. Their snapshot and rollback cover every table the
demo writes. The overlay that is already applied locally is backfilled in place, without a reset.

**Tech Stack:** Python scripts, Postgres (plpgsql RPCs), and the media worker (`/covers/prepare`).

**Spec:** `docs/superpowers/specs/2026-09-27-retire-versions-design.md` ("Seed and demo in the Miro
model").

## Global Constraints

- **Language:** English only in code, copy and docs. Chat with the user is in pt-BR.
- **Resets:** never run `supabase db reset`, `supabase migration down` or `local_stack.py reset`. The
  ONE fresh reset + SABRE apply is Phase 5's acceptance, and it runs only after the user confirms.
- **Where to verify the canonical seed:** on the disposable staging rehearsal
  (`deploy/staging/scripts/stage.sh`: apply `seed.sql` with psql, then `provision-fixtures`), or by
  loading the seed inside a single `begin; … rollback;` transaction on the local DB. It is never
  verified by resetting the local stack.
- **The local SABRE overlay must survive:** 10 clients, 68 projects, 50 SABRE. Its ignored rollback
  checkpoint must stay valid.
- **The Miro model per project:**
  - one design board per assigned designer, with a due date on or before the project's;
  - 1–2 rounds per board, whose statuses match the project status;
  - 0–2 client versions whose statuses match it;
  - sample Miro links on placeholder board ids (`uXjV…`);
  - a cover from the existing demo art, uploaded through the media worker, and visible to the
    client only on projects that have a client version;
  - internal and client comments without design or pin data.
- **Writes go through the real RPCs** where they exist (`send_board_round`, `share_miro_version`,
  `set_version_miro_link`, `review_publication`, `post_comment`, and the board RPCs). Direct inserts
  are allowed only where the seed already writes SQL rows, and they must respect the schema's
  checks and the author-column privileges.
- **Commits:** explicit pathspecs only, and every commit ends with the trailer
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never push.

## Review Focus

1. **Role isolation in the generated data:** no client-visible row names a designer; internal
   comments stay internal; a designer's round is on their own board.
2. **Statuses make sense:** a delivered project has an approved client version, a project in
   progress has no client decision, and so on. No round or version is left in a state the UI
   cannot explain.
3. **Determinism:** building the seed twice produces the same file.
4. **The SABRE rollback** covers `design_boards`, `design_versions`, `published_versions`,
   `design_version_miro_links`, `project_covers`, the cover Storage objects, and the credit tables
   (`credit_months`, `credit_plans`, `project_settlements`).

---

### Task 1: Canonical seed

**Files:**
- `supabase/scripts/build_seed.py`, `supabase/seed.sql` (regenerated) and
  `supabase/scripts/verify_seed.py`;
- the cover upload in `supabase/scripts/provision_local_auth.py`, and
  `deploy/staging/scripts/provision_fixtures.py` if it shares that code. If the media worker has to
  be running first, change the order in `local_stack.py start`.
- the seed counts in `docs/operations/README.md`.

- [ ] Replace the legacy generators with the Miro model described in the Global Constraints, and
  write the verifier assertions first: the counts, the boards per assigned designer, the round and
  client-version statuses per project status, the absence of designer identity in client rows, and
  covers present and marked client-visible as specified.
- [ ] Verify the seed on the staging rehearsal, or in a rolled-back transaction, and record the
  output. Also run `verify_seed.py` against it.
- [ ] Commit `feat(seed): build the canonical seed on the Miro model`.

### Task 2: SABRE demonstration

**Files:** `supabase/scripts/sabre_demo.py`, `sabre_demo_extras.py`, `sabre_demo_state.py`,
`demo_artwork.py` (only if it is needed), and `supabase/demo/sabre/README.md`.

- [ ] Remove the removed-RPC paths, and generate the Miro model for every SABRE project, following
  the Global Constraints.
- [ ] Extend the `sabre_demo_state.py` scopes to the Review Focus 4 tables and Storage prefixes.
- [ ] Add an idempotent `backfill` action, or make `apply` idempotent, that fills in Miro-model data
  for the overlay projects that are already applied and lack it. Run it on the local stack. Then
  `status` must report 10 clients / 68 projects / 50 SABRE, every project must have its boards,
  rounds, client versions and cover, and the rollback checkpoint must still load.
- [ ] Commit `feat(demo): run the SABRE demonstration on the Miro model`.

### Task 3: Leftovers

- `apps/media/src/upload-io.benchmark.js` calls the removed `registerSanitizedVideo` /
  `registerCopied`. Delete the benchmark or fix it, together with its npm script.
- Verify with `cd apps/media && npm test`, then commit
  `chore(media): drop the benchmark for removed video routes`.

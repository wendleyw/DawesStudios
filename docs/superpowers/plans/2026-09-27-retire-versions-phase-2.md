# Retire Versions — Phase 2 (database) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the legacy Versions data and drop every table, column, function, policy and
bucket that only Versions used. Simplify the Miro-model functions to match. Remove the orphaned
Storage bytes. Regenerate types and keep the web app compiling.

**Architecture:**
- The data deletion and the schema drops go in forward-only migrations. The schema that stays is
  the Miro workspace:
  - rounds: `design_versions` with a `board_id`;
  - client versions: `published_versions`, always project-level;
  - comments per channel without design or pin data.
- A guarded, service-role Node script deletes the Storage objects that the deleted rows referenced.
- The web code stops reading dropped columns in the same task that drops them, so every commit
  compiles.

**Tech Stack:** Supabase Postgres (plpgsql, RLS, pgTAP) and Next.js (Vitest).

**Spec:** `docs/superpowers/specs/2026-09-27-retire-versions-design.md` (Phase 2).

## Global Constraints

- **Language:** English only in code, copy and docs. Chat with the user is in pt-BR.
- **Migrations:** never run `supabase migration down` or `supabase db reset`. Apply with
  `supabase migration up --local` and fix forward. Check `ls supabase/migrations | tail -3` for
  the next free number.
- **Local data:** the SABRE overlay keeps its clients, projects, briefings, credits, boards,
  rounds, client versions, covers, project assets and delivery files. Only legacy Versions data
  is deleted. This is test data, and the user approved deleting it.
- **Parallel work:** other agents may work in this tree at the same time. Commit only with
  explicit pathspecs (`git add` new files first) and check `git show --stat HEAD`.
- **Commits:** every commit ends with the trailer
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never push.
- **Gates:**
  - `supabase test db`, where the known SABRE-overlay count failures in `access_and_workflows`
    may remain; every other test file is updated to the new schema and passes;
  - `npm run db:types`;
  - `cd apps/web && npm run check`;
  - the Playwright specs `miro-workspace`, `miro-version-links`, `project-cover`,
    `project-feedback` and `files-campaigns`
    (`--output ../../outputs/pw-rv2 --reporter=line`).

## Review Focus

1. **Privacy:** it must hold exactly as before. Dropping the `design_id` and pin columns must not
   loosen `internal_comments` / `client_comments` RLS, and it must not loosen the
   designer-to-designer privacy trigger or the client isolation.
2. **Project data:** no project, briefing, deliverable, credit, cover, board, round or client
   version row may be deleted. Row counts are checked before and after.
3. **Storage cleanup:** the script deletes only objects referenced by deleted rows, or objects
   under the design and publication prefixes with no referencing row. It refuses to run against a
   non-local URL.
4. **Function calls:** every remaining function still compiles and behaves. `post_comment`,
   `resolve_comment`, `review_publication`, `share_miro_version`, `send_board_round`,
   `set_version_miro_link` and `accept_briefing` all get pgTAP calls.

---

### Task 1: Delete the legacy data and drop the schema

**Files:** a new migration (for example `2026092700NN_retire_versions_schema.sql`), the updated
`supabase/tests/database/*.test.sql`, the regenerated `supabase/database.types.ts`, and the web
files that read dropped columns: `apps/web/features/projects/project-data.ts`
(`.is("design_id", null)`, `deliverable_id`), `miro-workspace.ts`, `project-action-miro.tsx`,
`features/shared/version-row.ts` and any other file `tsc` flags.

- **Step 1: inventory.**
  - List every function, trigger, policy, view, realtime publication entry and grant that
    mentions `designs`, `published_designs`, `deliverable_id` (on the version tables),
    `design_id` or `pin_x` / `pin_y` / `pin_t` (on the comment tables), `internal_asset_path`, or
    the `published-assets` bucket. Use `rg` over `supabase/migrations`, plus a `psql` catalog
    query for live definitions.
  - Write the list into the migration header as comments.
- **Step 2: tests first.** Update the pgTAP files that insert or assert legacy structures, so they
  describe the new schema: remove the design and pin assertions and keep the Miro ones. Add
  assertions that:
  - the dropped tables and columns do not exist;
  - project and credit counts are unchanged, by comparing with a pre-migration snapshot taken
    inside the test where possible, or with seeded expectations;
  - every function in Review Focus 4 works.
- **Step 3: the migration.**
  1. Delete the legacy rows in FK-safe order: comments with `design_id`; `designs`;
     `published_designs`; Miro links, `publication_sources`, `publication_reviews` and
     `private.miro_share_requests` for per-deliverable versions; `design_versions` and
     `published_versions` with a deliverable; `private.sanitized_assets` for the `internal-assets`
     design paths and the `published-assets` bucket; notifications and audit rows that only
     reference deleted ids.
  2. Drop the tables `designs` and `published_designs`, and drop the columns listed in the spec.
  3. `design_versions.board_id` becomes not null, and the one-parent check goes.
  4. Drop the legacy RPCs and recreate the Miro-model functions without the dropped branches and
     parameters. `post_comment` keeps a signature without the design and pin arguments, and its
     callers in the web and in the tests are updated in this task.
  5. Update the realtime publication.
  6. Drop the storage policies used only for design or publication objects. Drop the
     `published-assets` bucket only after the Task 2 script has removed its objects; if it is not
     empty yet, leave the bucket drop to Task 2's follow-up migration.
- **Step 4: the web.** Make `apps/web` compile against the new types: remove the dropped-column
  filters and use `boardId` in place of `deliverableId` wherever the model now guarantees it.
- **Step 5:** run the gates and commit
  `feat(db): drop the legacy Versions schema and data`.

### Task 2: Storage cleanup

**Files:** `supabase/scripts/cleanup_versions_storage.mjs` (or `.py`, following the existing
`supabase/scripts` style) and, if needed, a follow-up migration that drops the `published-assets`
bucket.

- **The script:**
  - asserts the local project and URL, the same way `local_stack.py` / `sabre_demo.py` guard
    loopback;
  - lists objects in `internal-assets` under design prefixes that no `project_assets` row
    references, and every object in `published-assets`;
  - prints a dry-run count;
  - with `--apply`, removes the objects through the Storage API in batches;
  - is idempotent.
- **Run it:** once with a dry run, then with `--apply`, on the local stack. Record the counts in
  the report. `project_assets` objects in `internal-assets` must remain.
- **Then:** the follow-up migration drops the `published-assets` bucket and its policies, if Task 1
  deferred that. Document the script in `supabase/demo/sabre/README.md` or
  `docs/operations/README.md`.
- **Commit:** `chore(db): remove Storage objects left by retired Versions`.

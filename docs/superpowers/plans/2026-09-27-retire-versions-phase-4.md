# Retire Versions — Phase 4 (Google Drive backup link) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each project can hold one Google Drive backup link. The agency sets it; the agency and the
client can see it and open it. It is only a link, and nothing syncs.

**Architecture:**
- The column `projects.drive_url` (nullable) is written only through an agency-only
  security-definer RPC, `set_project_drive_link(p_project_id uuid, p_url text)`. The RPC accepts
  only `https://drive.google.com/...`, and an empty or blank URL clears the link.
- The web app writes the link through `project-data.ts` and shows it in three places: the Miro
  workspace bar's More menu, Files beside the project, and Project details (agency: "Add Drive link"
  / "Edit Drive link").

**Tech Stack:** Supabase Postgres (plpgsql, RLS, pgTAP), Next.js / React 19 / TanStack Query
(Vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-09-27-retire-versions-design.md` ("Google Drive link").

## Global Constraints

- **Language:** English only in code, copy and docs. Chat with the user is in pt-BR.
- **Migrations:** never run `supabase migration down` or `supabase db reset`. Apply with
  `supabase migration up --local` and take the next free number (after `202609270008`).
- **Designers:** the spec names only the agency and the client. Designers can already read project
  rows; the link is a backup of client deliverables, not studio-internal. Ruling: designers may read
  it (no column privilege change), but only the agency sees the edit control.
- **Validation:** the scheme must be `https` and the host exactly `drive.google.com`. Reject
  lookalikes (`drive.google.com.evil.com`, `http://`, `javascript:`) in both SQL and TS. Store the
  trimmed URL.
- **Data access:** only in `features/<feature>/<feature>-data.ts`.
- **Opening the link:** use `target="_blank" rel="noopener noreferrer"` with an accessible name
  ("Open Google Drive backup"). Never render the link in an iframe.
- **Commits:** explicit pathspecs only, and every commit ends with the trailer
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never push.
- **Gates:** `supabase test db` (only the known `access_and_workflows` count failures), then
  `npm run db:types`, then `cd apps/web && npm run check`. The new e2e spec must pass.

## Review Focus

1. **The host check:** a client or designer calling the RPC is refused, and so is a lookalike host.
2. **The empty value:** an empty or blank value clears the link; it never stores `""`.
3. **Other roles' view:** a client sees the icon only when a link exists, and never sees the edit
   control.
4. **Stale screens:** the More menu and Files update after an edit without a reload.

---

### Task 1: Drive link end to end

**Files:**
- a new migration and `supabase/tests/database/project_drive_link.test.sql`;
- `supabase/database.types.ts`;
- `apps/web/features/projects/project-data.ts`, `project-details.tsx` and `miro-view.tsx` (the More
  menu), with their tests;
- `apps/web/features/assets/assets-page.tsx` / `file-groups.ts` (the icon beside the project), with
  its tests;
- a Google Drive icon (inline SVG or the existing icon set; no new dependency);
- `apps/web/tests/e2e/project-drive-link.spec.ts`;
- the projects and assets READMEs, and `docs/architecture/backend.md` (the RPC table).

- [ ] **pgTAP first:**
  - the agency sets a link, then clears it with `''`;
  - a client and a designer are refused;
  - `http://`, a lookalike host and `javascript:` are refused;
  - a client reads `drive_url` on its own project only.
- [ ] Write the migration and regenerate the types.
- [ ] **Unit tests first, then the UI:**
  - the TS validation helper;
  - Project details shows Add or Edit for the agency only, with validation and error messages;
  - the More menu and Files show the icon link only when a link exists.
- [ ] **E2E:** the agency adds a link in Project details; the client sees the icon in the More menu
  and in Files, and it opens in a new tab; the agency clears it and the icon disappears.
- [ ] Commit `feat(projects): keep a Google Drive backup link per project`.

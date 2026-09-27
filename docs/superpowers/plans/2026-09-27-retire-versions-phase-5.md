# Retire Versions — Phase 5 (rules, docs and acceptance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The instructions, the docs and the test suites describe only the Miro model. After the
user approves, ONE fresh reset followed by the SABRE apply proves the canonical counts and a working
demonstration.

**Architecture:** Documentation and test maintenance, then an acceptance run. No new product
features.

**Tech Stack:** Markdown, Playwright, Python tests, pgTAP.

**Spec:** `docs/superpowers/specs/2026-09-27-retire-versions-design.md` (Phase 5, "CLAUDE.md and
AGENTS.md", "Docs", "Testing").

## Global Constraints

- **Language:** English only in files. Chat with the user is in pt-BR.
- **Instruction files:** `CLAUDE.md` and `AGENTS.md` change identically, in the same commit.
- **Resets:** never run `supabase db reset` or `migration down`. `local_stack.py reset
  --confirm-local-data-loss` runs exactly once, in Task 3, and only after the user explicitly
  approves it in chat.
- **Canonical assertions:** do not weaken them. They must pass on the fresh canonical database
  (before the SABRE apply).
- **Commits:** explicit pathspecs only, and every commit ends with the trailer
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never push.

## Review Focus

1. **Surviving guarantees:** no rule is silently lost. Every guarantee the old design-pin and
   published-snapshot rules gave (client isolation, an immutable client artifact, separate
   channels) survives in its Miro form.
2. **Accurate docs:** every doc claim is checked against the code: paths, RPC names, commands.
3. **The acceptance run:** it records its real output. It is not inferred.

---

### Task 1: Rules and documentation

**Files:**
- `CLAUDE.md` and `AGENTS.md`. Replace "publishes an immutable client snapshot … including design
  pins and drafts" and the acceptance-baseline wording with the Miro model, following the spec's
  list:
  - the studio publishes an immutable client version (link + note), and only the agency shares it;
  - the channels stay separate, including drafts;
  - a designer never sees another designer;
  - covers are sanitized, and client-visible only when marked;
  - final files are delivered through Files;
  - the baseline describes boards, rounds and client versions.
- The docs that still describe Versions, designs, pins or published copies: `apps/web/README.md`,
  `docs/architecture/{acceptance-matrix,backend,permissions,design-system,implementation-plan,playground-and-board-widgets}.md`,
  `docs/operations/production.md`, and the `features/{assets,playground,board}` READMEs.
  - Remove the links to deleted specs; the phase-1 notes list
    `project-playground-and-video-optimization.md`.
  - Leave historical records (`docs/engineering/history`, `docs/verification`, handoffs) as they
    are.
- The deferred minors:
  - `design-system.md:220`;
  - `workspace/README` lines 42–44;
  - the stale `theme-colors.test.ts` allowlist;
  - the unused `upload-rules` exports (`VIDEO_MAX_BYTES` …);
  - ffmpeg in the media Dockerfile, if nothing uses it any more;
  - the unused `suspended` prop of `project-action-dialog`.

  Each is confirmed with `rg` before it is removed.
- [ ] Commit `docs: describe the product on the Miro workspace`, and a separate
  `refactor: remove leftovers of retired Versions` for the code minors.

### Task 2: Tests on the Miro model

**Files:** `supabase/demo/sabre/sabre_demo_http_test.py`, `apps/web/tests/e2e/sabre-demo.spec.ts`,
the canonical-count specs (`canonical-workspaces`, `design-audit`, `workspace-actions`,
`workspace.spec`), and any other test that still names the dropped tables or the old seed structure.

- Rewrite the Miro-model assertions. For example: every canonical project has boards, and statuses
  map to rounds and client versions.
- Keep the canonical counts (10 / 25). These specs are expected to fail only on the SABRE overlay
  until Task 3.
- Add Drive links on a few projects in the seed (`build_seed.py`, verified on staging) and in the
  SABRE generator (in the fresh `apply` path; not backfilled).
- [ ] Commit `test: assert the Miro-model seed and demo`.

### Task 3: Acceptance (requires the user's approval)

1. Ask the user to approve the reset. Wait for an explicit yes.
2. Take a safety backup (`supabase/scripts/backup_local.py`, if it applies), then run
   `python3 supabase/scripts/local_stack.py reset --confirm-local-data-loss`.
3. On the canonical database: run `verify_seed.py`, `supabase test db` and the full Playwright
   suite. All must pass, including the canonical-count specs.
4. Run the SABRE `prepare` + `apply` as the demo README says, then `status`: 10 clients /
   68 projects / 50 SABRE. Run the SABRE spec and `remove --dry-run`, which must be accepted.
5. Record the results in `docs/verification/` and update the handoff.

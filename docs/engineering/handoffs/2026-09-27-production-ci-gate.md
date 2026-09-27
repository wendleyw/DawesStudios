# Production CI database and Chromium gate

- Updated: 2026-09-27 EDT · Agent: Codex implementer · Model: GPT-6
- State: implemented and statically checked; remote CI execution unverified.
- Objective: add a real isolated database and Chromium acceptance job beside the source job.
- Owned paths: `.github/workflows/check.yml`, `scripts/ci-acceptance.py`, `.github/README.md`, this report.

## Changes
- `.github/workflows/check.yml`: pinned Supabase CLI 2.98.2, real fixtures, pgTAP, production Next server, targeted Chromium workflows and final canonical assertions.
- `scripts/ci-acceptance.py`: GitHub runner guard, local stack bootstrap, real media process, credential export/masking, eight-table before/after checks.
- `.github/README.md`: job scope, isolation, credential flow and evidence limits.

## Decisions and interface changes
- Media runs locally on the ephemeral Linux runner to reach Supabase's loopback API; covers and delivery files still use the real worker.
- `ACCEPTANCE_SUPABASE_URL` uses `localhost` while the fixture file uses `127.0.0.1`, forcing the existing E2E harness to consume explicitly declared CI credentials for the same isolated stack.
- No application or database interface changes; no linked project, reset command, mock service or repository secret.

## Checks actually run
- `python3 -m py_compile scripts/ci-acceptance.py` — pass.
- `ruby -e 'require "yaml"; ... YAML.load_file(...) ...'` — pass; both jobs parsed.
- `git diff --check -- .github/workflows/check.yml scripts/ci-acceptance.py` — pass.
- `python3 scripts/ci-acceptance.py guard` outside Actions — expected refusal, exit 1.
- All seven named Playwright spec paths confirmed present; no Docker, provisioning, server, database or E2E run in the shared workspace.

## Risks and next action
- Hosted GitHub Actions run remains unverified; orchestrator should review the diff and run or trigger the isolated job, then inspect failures and exact 10/25/post-browser counts.
- The canonical browser's existing 5-second p95 assertion may be sensitive to runner load; retain it unless measured CI evidence warrants a change.
- Ownership released: `.github/workflows/check.yml`, `scripts/ci-acceptance.py`, `.github/README.md`, this report. No process left running.

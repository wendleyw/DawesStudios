# Task 8 — Architecture documentation and the acceptance amendment

- Updated: 2026-09-25T18:15:00-03:00 · Agent: Claude Code · Model: Sonnet 5
- State: implemented, tested (docs only; no code change)
- Owned paths: docs/architecture/{acceptance-matrix,reference-map,sitemap,design-system}.md; 2 spec lines; this report.

## Changes
- acceptance-matrix.md — added the 2026-09-25 D01 amendment paragraph (brief text verbatim) after the 2026-09-24 one.
- reference-map.md — `/home` client-entry row now opens the Overview; new `/clients/:clientId/overview` row above the board row.
- sitemap.md — `/home` Client/Designer cells updated to today's behavior; new `/clients/:clientId/overview` row above the board row.
- design-system.md — new "Welcome dashboards" subsection: header shape, tiles+notes, in-flight strip, 3 columns, 1000px stack, isolation.
- spec lines 90/106 — replaced impossible "8 days ago"/"3 weeks ago" examples with real `relativeAge` buckets from overview-model.test.ts.
- overview/README.md, workspace/README.md — read in full against source; both already accurate, left unchanged.

## Decisions and interface changes
- None (docs only, no code touched, no new consumer).

## Checks actually run
- `npx prettier --check` on all 5 touched docs — fails on all 5, same as an unedited baseline copy; docs/ is outside apps/web's `format:check` glob (`app features lib tests *.ts *.mjs`), so `--write` was skipped to avoid reformatting every compact `|---|` table into Prettier's padded style.
- `npx prettier --check` on both feature READMEs — clean, unchanged.
- `npm run check` (apps/web) — typecheck, lint, format:check, vitest all pass: 91 files / 1037 tests.
- Ruling-5 grep from repo root — 2 hits: acceptance-matrix.md:86 (the superseded D01 2026-09-21 row, the named exception) and specs/...design.md:60 ("Current state" quote of pre-change D01 text, outside my 2-line scope for that file).

## Risks and next action
- specs/2026-09-25-role-overview-dashboards-design.md:60 quotes old D01 wording as historical rationale; not in the ruling's exception list but outside my authorized lines (~90, ~106) — left unchanged, flag for controller.
- Next action: controller review of this doc-only diff, then integrate; commit follows this report.
- Ownership: all owned paths released, no active writer.

# Production refactor and operational checks — 2026-09-27

## Implemented

- Project details split into credit and Drive dialog modules (`8fdd098`), retaining permissions,
  compare-and-swap behavior and retry keys. Main component reduced from838 to451 lines.
- Integrated separate repository cleanup (`6f6afd1`), documented in the
  [folder audit](../engineering/repository-cleanup-2026-09-27.md).
- [Production edge](../../deploy/production/README.md): versioned nginx renderer, distinct TLS hosts,
  explicit public-route allowlist, request/body/time limits, source-IP header replacement,
  query-free access logging, no automatic write retries and WebSocket forwarding.
- Server Auth administration uses the private Supabase gateway; public Auth admin routes remain
  denied. The production env example and [runbook](../operations/production.md) reflect this.
- [CI acceptance](../../.github/README.md): fresh-runner guards, isolated real backend/Auth/media,
  canonical seed verification, database suite, production app/browser checks and exact count comparison.
- Filesystem staging now includes local Mailpit. Invite/recovery tests explicitly select its
  loopback API, fixing a missing SMTP service that caused502 invite failures.
- [Action notifications](action-notifications-2026-09-27.md), URL targets and Safari focus restoration.
- User decision retained: Miro is the creative workflow. Supplementary uploads keep their current
  simple flow and caps; no concurrent-upload architecture or reservation service was introduced.

## Executed checks

| Check | Result |
| --- | --- |
| Web types/lint/format/unit gate |127 files,1,249 tests pass |
| Media unit suite |2 files,31 tests pass |
| Canonical PostgreSQL suite |27 files,1,108 assertions pass |
| Final web/media Docker images |Built and healthy |
| Existing Chromium acceptance |53existing cases pass |
| New notifications and Drive, Chromium/WebKit |4 cases pass |
| WebKit Comments/mobile/focus/read activity |3 cases pass |
| Invite/recovery/admin rerun after Mailpit fix |8 cases pass; included in later broad Chromium pass |
| Strict seed verifier |10 clients/25 projects,110 real downloads,10 tenant logins, role/credit checks pass |
| Disposable nginx TLS integration + renderer |9 tests pass |
| Real filesystem Supabase through disposable TLS proxy |7checks pass |
| CI bootstrap guard tests |4 tests pass; off-runner execution refused |
| Workflow YAML/Python syntax |Pass |
| npm audit, web/media |0 advisories |
| GitLeaks history/current source |551 commits and source clean |

The TLS proxy checks cover real50 MiB streaming plus HTTP envelope,413/429, redirects, encoded
private-path denial, spoofed forwarding headers and WebSocket101. An independent proxy review
found alternative HTTPS ports omitted from redirects/forwarding; renderer/template tests cover the fix.
The real-backend proxy checks additionally cover agency25/client7 project reads, internal denial,
signed Storage download, Auth/Storage preflights, media health and actual Realtime101.
These are API/browser checks on local staging; the app image's public environment remains HTTP
staging, so a complete three-public-HTTPS-host browser rehearsal is not claimed.

## Data and limits

Before/after all browser fixtures, eight-table counts match exactly: clients10, projects25,
campaigns12, briefings30, design_boards29, design_versions30, published_versions22, notifications155.
Live local before/after forward migrations remains clients10/projects68/SABRE50. No database reset,
rollback migration, production write, push or deployment occurred. Filesystem staging was stopped
with volumes retained; live app3003 and its backend remain available. Unrelated `login.png` deletion
was preserved and excluded from commits.

Remaining release evidence: real target-host DNS/TLS issuance and renewal, external SMTP delivery,
off-host recovery and forced alerts, actual Miro sharing permissions, and first hosted CI run.
Firefox launch failed before application navigation; a wider WebKit workspace scan reported an
external Miro response-header warning. Supported core WebKit flows passed, but complete Firefox
and third-party Miro behavior are still unverified. See the production runbook for operational gates.

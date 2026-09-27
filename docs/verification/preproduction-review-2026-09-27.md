# Preproduction priorities

Date: 2026-09-27. Orchestrator: Codex. Request: identify the remaining analysis and refactoring
before production. This is a readiness review and implementation proposal, not a release approval
or a claim that the proposed changes have been implemented.

## Assessment

The recent role-action audit is a strong functional baseline: 113 distinct Chromium cases with
passing runs/reruns, 1,206 unit tests and 1,052 database assertions. Those are prior executed
checks, recorded in [the extension audit](extension-role-actions-2026-09-27.md); this review did
not repeat them. The main remaining work is operational readiness, bounded data access and
targeted maintainability. Preserve the feature-oriented architecture and its data-access boundary.

Confidence: 4/5 for the inspected code/configuration, 2/5 for deployed operations because no
production host, SMTP service, alert destination or real Miro board was exercised here.

## Before public release

### P1 — Rehearse the actual deployment topology

`deploy/staging/scripts/stage.sh:77` includes `docker-compose.s3.yml`; the new production target
is persistent filesystem Storage. `docs/operations/production.md:210` explicitly records this gap.
Build a disposable staging variant using the official pinned Supabase distribution, persistent
Storage, web/media images and TLS proxy. Test clean migration/bootstrap, disabled public signup,
Auth redirects, real invitation/recovery mail, Realtime and authorized/forbidden downloads.
Do not promote the local fixture stack or copy SABRE/demo accounts into production.

Acceptance: the release commit passes its role suite on that topology, including a container
replacement with retained files. The [official Supabase deployment guide](https://supabase.com/docs/guides/self-hosting/docker)
is the upstream reference; keep a pinned version rather than implicitly following its latest branch.

### P1 — Close the remaining upload-capacity gap

`internal-assets` still permits **1,073,741,824 bytes**, inherited from the retired video feature
(`supabase/migrations/202609210004_video_storage.sql:8`). A read-only local database query confirmed
that effective value during this review. The current UI rejects above 50 MiB
(`apps/web/features/assets/upload-file-dialog.tsx:73`), but direct Storage writes are authorized
for agency/assigned designers by `202609200003_storage.sql:15`; the inspected policy has no quota.
Repeated authorized uploads can consume persistent disk without passing through the UI ceiling.
No saturation or abusive upload was executed.

Proposed change: inspect existing objects, then use a forward migration to align the internal
bucket's size/MIME policy with supported working files; add a backend-enforced storage budget
and request limits, disk alerts and an orphan-cleanup policy. Reducing the per-file limit alone
does not bound total usage. Do not delete existing files or rewrite applied migrations.
Acceptance: oversized/direct-API uploads fail, quota handling stays correct under concurrent
uploads, and existing allowed working/delivery flows still pass.

### P1 — Make recovery and release selection executable

The production guide prescribes off-host encrypted database plus Storage backups, but the checked-in
backup/restore scripts target local CLI containers. Configure the production schedule, retention,
consistent database/file snapshot, off-host destination and failed-backup alerts. Restore into an
isolated target and measure recovery time; verify Auth, role isolation and file hashes afterward.

The guide also says to keep image tags per commit, while `compose.yaml:4` and `:31` select `:local`.
Provide an explicit release-image selector and rehearse returning to a compatible previous image
pair. Keep migration compatibility separate from image rollback; a database dump is a recovery
tool, not a reason to discard writes made after deployment.

### P1 — Prove ingress protection and useful alerts

`docs/operations/production.md:241` leaves proxy per-IP limits open; media's two-request concurrency
cap (`apps/media/src/server.js:70`) is not a per-caller quota. Local Auth has its own configured
rate limits; their production values and proxy behavior were not verified. Version and test TLS,
WebSocket forwarding, body/time limits, private admin ports and request throttling. This matches
the [Next.js self-hosting guidance](https://nextjs.org/docs/app/guides/self-hosting#reverse-proxy).

Web `/login` and media `/health` show process availability without proving database/Auth/Storage
readiness. Add external service checks, centralized redacted logs and actionable alerts for failed
mail/media requests, disk pressure and backups. `apps/web/app/error.tsx:5` renders recovery UI but
does not report its error to a telemetry destination. Acceptance: force a dependency failure and
receive an alert with enough context to diagnose it, without leaking credentials or client content.

### P1 — Verify real Miro access and supported browsers

The previous suites use placeholder Miro IDs and explicitly do not prove actual embedded content.
Use separate real internal/client boards and real agency/designer/client accounts to verify
sharing, visible identities, link edits, revoked access, third-party-cookie restrictions and the
existing Open in Miro fallback. A stored URL's RLS cannot enforce permissions on Miro itself.
The [Miro embed documentation](https://help.miro.com/hc/en-us/articles/360016335640-Embed-a-Miro-board)
confirms that embeds respect board permissions, cookie blocking can interfere and mobile embeds
are view-only. Run the critical journey in Safari/WebKit and Firefox as well as Chromium.
Acceptance: a client cannot reach internal creative content through the real external links.

## Code and verification work to prioritize

### P1 — Bound project/file reads and verify correct totals

`supabase/config.toml:18` sets `max_rows = 1000`. `useProjects`
(`apps/web/features/workspace/workspace-data.ts:149`) uses one unpaginated `select('*')`;
`home-page.tsx:33` derives dashboard totals from that returned subset. Files similarly reads all
client projects and their files without pagination (`features/assets/asset-data.ts:109,127`).
Once a result exceeds the API cap, these paths can omit rows and show incomplete totals without
an error. The missing pagination and cap are confirmed in source; the large-dataset failure has
not been reproduced in this review.

Paginate with stable ordering, apply filters before paging and compute complete dashboard totals
through scoped backend aggregates where appropriate. Use a disposable dataset exceeding 1,000
projects/files to verify boundaries, authorization, search and totals. The ledger already pages
in `features/credits/credit-data.ts:45`; this is a targeted gap, not a claim that all reads are wrong.
[Supabase's range modifier](https://supabase.com/docs/reference/javascript/using-modifiers-range)
documents the paging primitive. Measure latency/memory under realistic concurrent users and
PDF/image uploads; no capacity claim can be inferred from the 68-project functional fixture.

### P2 — Put the release checks in repeatable automation

`.github/workflows/check.yml:21` runs source/media unit checks and explicitly omits browsers;
it also has no database/migration or production-build job. Add a disposable canonical database,
pgTAP, production image build and critical role-action browser gate with retained failure artifacts.
Use separate artifact paths and an explicitly declared acceptance backend. Align the runtime
matrix: CI selects Node 22 while Docker images currently use Node 24. Pin release images/action
revisions deliberately. Until automation exists, a recorded manual release gate is still required.

### P2 — Extract cohesive project-details components

`apps/web/features/projects/project-details.tsx` is 838 lines combining project editing,
assignment/revocation, Drive controls (`:487`), moving monthly charges (`:601`) and final settlement
(`:718`). Extract these cohesive controls/dialogs into colocated files with focused component
tests; keep input validation, retry keys and local state in their owning components. Preserve
queries in `project-data.ts` per the project contract. File length alone does not justify moving
queries into competing services or reworking the entire domain.

`useInvalidateProject` (`project-data.ts:477`) invalidates several broad query families. Profile
refetch counts during real navigation and scope invalidation to project/user where it measurably
helps. This is a performance candidate, not a confirmed functional defect or launch blocker.

## Checks actually executed in this review

- `npm audit --json` for web and media: zero reported vulnerabilities in both dependency trees.
- `gitleaks git --redact`: 547 commits scanned, no detected leaks. The pre-commit scanner exists.
- Read-only SQL: confirmed internal/delivery/cover bucket limits of 1 GiB / 50 MiB / 10 MiB.
- Source/configuration inspection and local branch listing: both extra local branches are merged
  into main; no branch was removed. Remote protection settings were not inspected.
- Independent bounded [operations](../engineering/handoffs/2026-09-27-preproduction-operations.md)
  and [security](../engineering/handoffs/2026-09-27-preproduction-security.md) reviews were integrated.
- No app/backend changes, migration, data mutation, new runtime test, server start, deployment or
  dependency installation. Docker/OS package CVEs were not scanned; Trivy was unavailable.

Finding groups: five release-readiness groups, one data-scaling risk, one automation gap and one
targeted maintainability candidate. No confirmed cross-role disclosure was found in the inspected
paths; that bounded source review is not proof of production-wide security.

Recommended sequence: align upload policy and staging/release configuration; prove recovery,
ingress and real Miro behavior; fix paginated reads and add release automation; extract project
dialogs under the passing role/credit regression tests. Close J10 only after operational evidence.

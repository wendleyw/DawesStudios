# Preproduction security review

- Date: 2026-09-27. Scope: web API routes, auth/lib, media server/backend/sanitizer, current Supabase authorization and Storage migrations, production release controls. Read-only source review; no runtime or database writes.
- Decision: one new confirmed availability risk; one already documented launch control; no confirmed cross-role data disclosure in the reviewed paths. No implementation or deployment performed.

## Ranked findings

- [P1, verified from code] `supabase/migrations/202609210004_video_storage.sql:8` leaves `internal-assets` at 1 GiB; `202609200003_storage.sql:15` permits any assigned designer or agency user to insert directly into that bucket, with no object-count quota. `apps/web/features/assets/upload-file-dialog.tsx:73` caps the current UI at 50 MiB, but a caller can bypass it through the public Storage API and repeatedly upload 1 GiB opaque-path objects, exhausting persistent storage. Forward-migrate this retired video ceiling to 50 MiB (and review allowed MIME types), update the production Storage limit and related tests/docs, and separately set a server-side quota or rate control appropriate to working files.
- [P1 launch control, already documented; production status unknown] `docs/operations/production.md:241` states that there is no per-IP proxy throttle, including for `/auth/v1/token` and the media host. `apps/media/src/server.js:70` caps concurrent media requests at two but does not rate-limit repeated requests; authenticated callers can repeatedly spend image/PDF processing time, and login receives no stated proxy protection. Configure and verify proxy rate limits before public exposure, balancing normal upload and Auth flows.
- [P1 verification gap, not a code defect] `docs/operations/production.md:210` says the existing staging rehearsal uses MinIO/S3 and has not verified the new filesystem Storage topology. A release without the documented persistence, role-isolated download and off-host restore drill risks data loss or unauthorized file access through configuration drift. Complete the staged checks in lines 210-230 before launch.

## Confirmed controls and limits of this review

- Web administrative routes authenticate bearer tokens and check active agency profiles before using a service key; the media worker authenticates active agency users, limits bodies and regenerates accepted delivery/cover formats. RLS helpers use `removed_at`, and comment project/version relationships have composite foreign keys (`202609200001_foundation.sql:120,132`). These are source observations, not fresh runtime test results.
- Commands: `rg` and numbered source excerpts over owned scope; `git diff --` for reviewed paths was empty. No tests, servers, scans, SQL, or network checks ran. Dependency and secret-history scans belong to the root review.
- Unknowns: deployed proxy rules, Auth service limits, filesystem Storage behavior, backup restoration, and current migration state were not inspected or exercised. Next: prioritize the 1 GiB Storage policy change; then run the documented production-topology and proxy checks in disposable staging.

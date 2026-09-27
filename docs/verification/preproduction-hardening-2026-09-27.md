# Preproduction hardening — 2026-09-27

Status: implemented and locally verified; **not a production release**.
This follows the [read-only review](preproduction-review-2026-09-27.md).

## Implemented scope

- Forward migration `202609270017` aligns `internal-assets` with the Files UI: 50 MiB and
  PNG/JPEG/WebP/PDF. Existing objects and historical attestations remain intact. Local configuration
  and filesystem staging use a 50 MiB global Storage limit; covers retain their 10 MiB bucket cap.
- Workspace projects, designer due dates, Files records and board artwork use stable ordered
  500-row pages. ID filters and signed-URL batches use at most 100 items. Cancellation stops new
  pages/signature batches, including when a final short page resolves after cancellation.
- `STAGING_STORAGE=file` adds an isolated official Supabase filesystem rehearsal on gateway 56110,
  DB 56111, web 3113 and media 56114. Default MinIO staging and live SABRE remain separate.
- Web/media release images are selectable through `WEB_IMAGE` and `MEDIA_IMAGE`, including digests.
  Starting selected images uses `--no-build`; this is image-selection support, not a proven release rollback.
- CI uses Node.js 24, matching the containers, and adds the production web build. The remote CI
  workflow itself has not run in this session; DB/browser CI remains outstanding.

## Runtime finding and correction

The initial filesystem rehearsal inherited upstream's host bind mount. Its first upload failed
with HTTP 500 / `ENOTSUP`: Docker Desktop's shared macOS filesystem did not support Storage's
extended attributes. Both Storage and imgproxy now share the persistent Linux Docker volume
`dawes-staging-file_staging-storage`. Recreated services then successfully provisioned all files.
A future production host must independently prove its filesystem supports these attributes.

The independent source review found two cancellation gaps; both were fixed. The full web gate
also caught the older board-artwork mock missing paging methods; that test adapter was corrected.

## Checks executed

- Web source gate: types, lint, formatting, **125 Vitest files / 1,218 tests passed**.
- Media: **2 files / 31 tests passed**.
- Compose/script checks: **5 Python tests passed**; both modes, image digests and isolated mounts.
- Final web/media container builds succeeded; both services reported healthy on filesystem staging.
- Direct local Storage HTTP: **7 assertions passed**. Agency/designer small-file uploads work;
  50 MiB + 1 byte and video MIME uploads fail; client working-file uploads fail. Probe files removed.
- Filesystem staging: **26 pgTAP files / 1,052 assertions passed** after canonical provisioning.
- Canonical HTTP verifier: **10 clients / 25 projects**, all role scopes, credit reconciliation,
  25 covers and **110 actual file downloads passed**.
- Filesystem staging Chromium: **7/7 passed** across workspace, Files/campaigns, covers and Miro
  review/final delivery, including designer-board isolation. This uses fixture Miro links; it does
  not prove real external board access. Temporary browser fixtures were removed; project count 25.
- Real scale regression: 1,005 tagged projects displayed in the actual Board for agency, SABRE
  client and assigned designer; captured pages at offsets 0/500/1000. Unassigned designer and
  unrelated client saw zero. Exact-ID cleanup restored staging 10/25. Files/cover scale behavior
  has unit coverage; no 1,000-file runtime fixture was created.
- Live SABRE HTTP: **42/42 passed**, preserving the authorized 10 clients / 68 projects / 50 SABRE.
- Storage/imgproxy container replacement: canonical verifier and all 110 downloads passed again.
- Offline filesystem recovery: consistent dump plus GNU tar archive with xattrs/ACLs, restored
  into a separate database and Docker volume. **96 physical files and all extended attributes
  matched**, 10/25 counts matched, and restored SABRE client SQL/RLS saw 7 projects and 0 internal
  boards. Temporary restore database/volume were removed; source data was never overwritten.
  This is same-host, offline evidence, not an off-host or complete restored HTTP/Auth stack.

The first broad pgTAP run against live SABRE failed five canonical-fixture assertions because that
stack intentionally has 68 projects. No assertions or data were weakened to make it pass. The first
staging DB run preceded file provisioning and failed the delivery prerequisite; provisioning the
real sanitized delivery resolved it. Neither result was counted as a passing gate.

The offline restore first exposed tooling requirements: the destination's default `public` schema
must be reconciled before replay, and owners/ACLs must be preserved. Restoring with the ordinary
`postgres` role could not assume `supabase_admin`; the final replay used `supabase_admin` in the
isolated database. Dropping ownership/privileges was rejected by the role checks, not accepted as
successful recovery. The final dump/archive and evidence are ignored under
`deploy/staging/.work-file/artifacts/recovery/`.

## Remaining release work

- Atomic aggregate capacity protection across **all** upload paths. A 50 MiB per-file cap still
  permits disk exhaustion through repeated uploads. RLS permission probes alone cannot reserve
  capacity reliably through concurrent uploads, retries and uncertain remote-write outcomes.
- Real production TLS, SMTP, proxy throttling/body limits, monitoring alerts and off-host recovery.
- Full application rollback rehearsal using distinct release images and migration compatibility.
- Actual Miro account/board permissions; Firefox/WebKit and automated database/browser CI.
- Project-details dialog extraction remains a separate maintainability task.
- Offset paging is ordered but is not a transaction snapshot; concurrent inserts/deletes may shift
  a page. The current implementation also eventually holds the complete visible result in memory.

Local logs and working captures are ignored under `outputs/`. Delegated reports:
[pagination](../engineering/handoffs/2026-09-27-preproduction-pagination.md),
[staging](../engineering/handoffs/2026-09-27-preproduction-release-config.md),
[independent review](../engineering/handoffs/2026-09-27-preproduction-change-review.md).

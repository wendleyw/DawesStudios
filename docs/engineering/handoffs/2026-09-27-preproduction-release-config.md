# Preproduction release images and filesystem staging

- Updated: 2026-09-27T20:09:26Z · Agent: Codex implementer · Model: GPT-6
- State: tested configuration; named-volume runtime pending
- Objective: selectable immutable app images and an isolated filesystem staging variant.
- Owned paths: `compose.yaml` image refs; `.env.production.example`; `deploy/staging/` config, scripts, tests, README.
## Changes
- `compose.yaml`, `.env.production.example`, `compose.app.yml`: `WEB_IMAGE`/`MEDIA_IMAGE` selectors accept digest references; local defaults remain.
- `compose.filesystem.override.yml`, `.gitignore`: pinned upstream file backend without S3/MinIO; both Storage consumers share a project-scoped named volume; new work directory ignored.
- `scripts/stage.sh`: `STAGING_STORAGE=file` selects `.work-file`, separate projects/ports/tags, 50 MiB limit and mode-specific stop/teardown text; default MinIO remains 1 GiB.
- `scripts/provision_fixtures.py`: mode-specific local gateway/media guards and fixture path.
- `README.md`, `compose.supabase.override.yml`: current mode instructions, named-volume behavior and historical MinIO labeling.
- `tests/test_release_config.py`: dummy Compose resolution plus temporary prepare/stop/image selection checks.

## Decisions and interface changes
- Default remains MinIO: `.work`, `dawes-staging*`, gateway 56010, DB 56011, web 3103, media 56014.
- `STAGING_STORAGE=file`: `.work-file`, `dawes-staging-file*`, gateway 56110, DB 56111, web 3113, media 56114; generated images use `:staging-file` tags.
- Exported `WEB_IMAGE`/`MEDIA_IMAGE` override generated tags for digest-pinned rehearsals; `app-up` uses `--no-build`.
- Both modes' active `storage-test` now uploads valid PNG; old 55 MiB MP4 result is historical only after migration 202609270017.

## Checks actually run
- `python3 -m unittest discover -s deploy/staging/tests -v` — PASS, 5 tests; resolved Compose uses file backend/shared named volume, no MinIO or S3 override, digest refs, isolated temporary prepare/stop.
- `bash -n deploy/staging/scripts/stage.sh` — PASS.
- `python3 -m py_compile deploy/staging/scripts/provision_fixtures.py deploy/staging/tests/test_release_config.py` — PASS.
- `git diff --check` — PASS.

## Risks and next action
- Root observed HTTP 500 `ENOTSUP` on first upload through the original macOS host bind; this change replaces it with Docker's Linux volume. Worker started no containers or live data operations.
- Root: recreate file-mode Storage consumers and rerun upload/restart/restore checks; confirm image digest selection, TLS proxy and SMTP at runtime.
- Ownership: all listed paths released; no active process.

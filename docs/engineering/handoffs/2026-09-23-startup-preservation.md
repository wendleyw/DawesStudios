# Local startup preserves existing artwork

- Updated at: 2026-09-23T05:21:07Z
- Reporting agent and tool: Startup preservation worker / Codex
- State: implemented and tested with isolated I/O; live startup verification pending
- Objective: correct acceptance defect I-1 without resetting the local fixture dataset or relaxing canonical verification.
- Owned paths: `supabase/scripts/provision_local_auth.py`, `supabase/scripts/fixture_provisioning.py`, `supabase/tests/test_fixture_provisioning.py`, lifecycle/artwork guidance in `docs/operations/README.md`, and this report.
- Dependencies: the root orchestrator exclusively controls live database/browser mutations and startup sequencing. Storage preserves create-only semantics; existing application-record/path guards remain in the provisioning caller.
- Acceptance criteria: normal startup preserves existing artwork; confirmed absent fixture files are created without concurrent overwrite; unrelated errors propagate; explicit `verify_seed.py` remains strict; deterministic isolated regression tests cover the behavior.

## Completed work and changed files

- Added `fixture_provisioning.py` next to its sole provisioning consumer. Its `ensure_fixture_object(...)` returns stored bytes and a creation flag. Existing objects are returned unchanged, including empty objects and photographic overlays.
- Replaced the destructive-reset recommendation in `provision_local_auth.py` with preservation. A missing object is created with `x-upsert: false`; a recognized concurrent-create conflict causes a read of the winning object. A failed readback remains an error.
- Publication attestation is written only when stored bytes equal the generated canonical bytes. This retries registration after an earlier interrupted canonical upload, while preserving divergent published bytes and their existing attestation. The provisioner reports the count of divergent publications it preserved.
- Added 12 stdlib `unittest` tests in `supabase/tests/test_fixture_provisioning.py`. All external I/O is mocked; three tests execute the provisioning caller under mocked REST/Storage/credential/file-write boundaries to cover the attestation decisions.
- Updated the operations guide to distinguish normal startup from canonical reset/verification and document the service-free test command. The existing lifecycle service table received formatting only.

No changes were made to `local_stack.py`, `verify_seed.py`, fixtures, photos, credentials, environment files, or authentication/password behavior. No framework, dependency, service, or permanent agent was added. Shared instructions did not change.

## Decisions and interface changes

The root orchestrator accepted this interface before implementation. Existing path/record checks remain with their current caller; the small helper owns only fixture Storage preservation and safe creation. It does not become a generic data-access service.

Missing-object handling recognizes `NoSuchKey`, with the specific older `not_found` / `Object not found` response also accepted. Duplicate-create handling recognizes `ResourceAlreadyExists` or `KeyAlreadyExists`, with the specific older `Duplicate` response accepted. An HTTP 400/404/409 alone is insufficient. Current codes and legacy fields were cross-checked against [Supabase Storage error definitions](https://github.com/supabase/storage/blob/master/src/internal/errors/codes.ts). Authentication failures, absent buckets, unknown errors, transport failures, and timeouts stop provisioning. Failure messages do not echo response bodies or credentials.

Canonical attestation is deliberately conditional on the returned bytes rather than the creation flag: a previous process can finish uploading and stop before registration. Preserved noncanonical content is not claimed to have passed sanitization. `verify_seed.py` remains the separate integrity check and still rejects a photographic overlay.

Applied the testing and project-structure skills; consulted setup to preserve the existing stdlib Python runner without installing tools, and update-project for scoped documentation maintenance.

## Checks actually executed

| Command or scenario                                                                                                                                                           | Environment and time          | Observed result                                                                                      | Evidence                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `python3 -m unittest discover -s supabase/tests -p test_fixture_provisioning.py -v` before the helper existed                                                                 | Local Python 3.14, 2026-09-23 | Expected import failure; establishes the new suite was executed before implementation                | Command output; not evidence of reproducing the old live startup defect              |
| Same unittest command after implementation                                                                                                                                    | Local Python 3.14, 2026-09-23 | PASS, 12 tests; no running services accessed                                                         | `supabase/tests/test_fixture_provisioning.py`                                        |
| `python3 -m py_compile supabase/scripts/fixture_provisioning.py supabase/scripts/provision_local_auth.py supabase/tests/test_fixture_provisioning.py`                         | Local Python 3.14, 2026-09-23 | PASS                                                                                                 | Exit 0                                                                               |
| `git diff --check -- supabase/scripts/provision_local_auth.py supabase/scripts/fixture_provisioning.py supabase/tests/test_fixture_provisioning.py docs/operations/README.md` | Working tree, 2026-09-23      | PASS                                                                                                 | Exit 0                                                                               |
| `git diff --exit-code -- supabase/scripts/verify_seed.py`                                                                                                                     | Working tree, 2026-09-23      | PASS; canonical verifier unchanged                                                                   | Exit 0                                                                               |
| `apps/web/node_modules/.bin/prettier --check docs/operations/README.md`                                                                                                       | Working tree, 2026-09-23      | Initial check identified the existing unformatted service table; formatting corrected with `--write` | Final check passed for this report and the operations guide after formatting; exit 0 |

## Remaining risks and next action

The worker did not run provisioning, start/stop/reset, live mutation tests, or `verify_seed.py`. These isolated tests prove preservation/error/race behavior and caller attestation decisions, not the health of the current Docker stack. Acceptance I01 must remain open until the orchestrator runs the documented startup command against the current photographic dataset and verifies unchanged object hashes and project/history counts. Cold-start evidence, if required, also belongs to the orchestrator's serialized lifecycle audit.

The existing provisioner still controls demonstration authentication and delivery setup; those paths were outside this fix and were not reworked. Noncanonical publications are intentionally preserved without repairing their metadata; explicit integrity verification must identify any undesired drift.

## Ownership at handoff

All owned changes are ready for root-orchestrator integration. No worker process or live mutation is left running. No commit or release was created. The root orchestrator owns the next startup verification and shared checkpoint update.

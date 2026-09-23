# Video upload and attestation read optimization

- Updated at: 2026-09-23T07:43:49Z
- Reporting agent and tool: continuity_code_map / Codex
- State: implemented and source-tested; orchestrator owns rebuilt live integration
- Objective: eliminate the second complete file read during video upload/attestation, preserving metadata stripping, authorization, provenance and failure cleanup.
- Owned paths: `apps/media/src/supabase.js`, `server.js`, `supabase.test.js`, `server.test.js`, `upload-io.benchmark.js`; `apps/media/README.md`; `docs/verification/media-upload-io-2026-09-23.json`; this report.
- Dependencies: [active plan](../../architecture/project-playground-and-video-optimization.md), existing trusted-media/video SQL, completed project-only Playground gate, orchestrator-owned runtime build/integration.
- Acceptance criteria: one clean-file read per upload/attestation; identical uploaded bytes, SHA-256 and size; EOF plus successful HTTP required; bounded streams closed on every outcome; failed publication uploads clean their own new target; no authorization or sanitization changes.

## Completed work and changed files

- `uploadFile` now computes SHA-256 and size from the outgoing chunks and returns a frozen internal `{ sha256, fileSize }` only after EOF, nonempty content, no cancellation and successful Storage response. A demand-driven Web stream with zero queued high-water mark preserves backpressure. The existing 1 GiB ceiling is also enforced during transfer; the five-minute transfer deadline remains unchanged. Every outcome destroys the source stream and awaits descriptor cleanup.
- Both registrators accept that trusted upload result instead of reopening the local file and calling `stat`. Their RPC names, project/actor/source fields, cleanup behavior and SQL trust boundary remain unchanged. The result comes only from the server-local upload call, never from request JSON.
- Both server callsites pass the result directly. Publication now also discards the new target best-effort when upload success is uncertain; the existing outer cleanup still removes earlier prepared copies from the same failed request. The internal source and immutable prior publications are not cleanup targets.
- Added ten streaming/backend regressions and one publication cleanup regression; strengthened the publication SHA assertion to exact equality. Updated the media README and added a reproducible benchmark and captured artifact.
- Preserved the preexisting active-membership filter in `identify`. Diff inspection confirmed it was the only preceding uncommitted change in `supabase.js`; the historical benchmark's upload/attestation methods were identical to the pre-optimization methods.

## Decisions and interface changes

- Internal `registerCopied` and `registerSanitizedVideo` receive the completed upload result in the position previously occupied by a local filename. Both real consumers are in `server.js` and were changed together. No public API body/response, migration, policy or service was added.
- Cancellation has an explicit flag in addition to EOF. A successful HTTP status after cancellation or a consumed prefix does not authorize attestation.
- The optimization removes one application-level read from this stage. It does not claim half the total video processing time, reduced network bytes, reduced ffmpeg work or a measured latency improvement.
- Retry idempotency across a lost sanitize response and abandoned raw/clean video lifecycle are separate existing follow-ups. This bounded change does not redefine them.

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| Pre-edit 4 MiB read-count probe using actual working-tree methods | Local Node, in-process fetch mock, 2026-09-23 around 07:34 UTC | Both flows: two streams, 8,388,608 bytes read, 4,194,304 uploaded; correct SHA/size | Probe closed and removed its temporary file and restored process-local instrumentation |
| `node apps/media/src/upload-io.benchmark.js > docs/verification/media-upload-io-2026-09-23.json` | Local Node, 07:40:35 UTC | Historical and current flows both executed; assertions passed | [Benchmark artifact](../../verification/media-upload-io-2026-09-23.json) |
| `npm --prefix apps/media test -- src/supabase.test.js src/server.test.js` | Vitest, initial implementation | 31/31 passed in two files | Before the additional cancellation-plus-HTTP-success regression |
| `npm --prefix apps/media test` | Vitest, final source, 07:40:35 UTC | **45/45 passed in three files**, 10.46 s | Ten backend/stream tests, 22 server tests, 13 sanitizer tests |
| Native `fetch` loopback proof through actual `uploadFile` and `registerSanitizedVideo` | Local Node HTTP server on an ephemeral loopback port, 07:43 UTC; no source edit | 4,194,304 bytes received; receiver hash, returned metadata and attestation equal | Test server and temporary file removed in `finally`; no live Auth/Storage requests |
| `node --check` on `supabase.js`, `server.js` and `upload-io.benchmark.js`; scoped `git diff --check` | Final source | All exit 0 | Syntax and patch whitespace checks |

The complete unit run includes real video remux/metadata-stripping tests. Mocked upstream cleanup-failure scenarios emitted their expected stable log messages; no assertion failed. The loopback proof exercises native Node fetch and its streaming body, while live Supabase/SQL validation remains with the orchestrator.

Reproducible measured result for each of sanitization upload and publication copy:

| Metric | Baseline `c2eaac7` | Optimized working tree |
| --- | ---: | ---: |
| Fixture bytes | 4,194,304 | 4,194,304 |
| File read streams | 2 | 1 |
| Application bytes read | 8,388,608 | 4,194,304 |
| Upload bytes | 4,194,304 | 4,194,304 |
| SHA-256 / attested size | Identical | Identical |

The benchmark uses a deterministic temporary file, instruments `fs.createReadStream` in its own process, imports the anchored historical source without changing the checkout, and mocks all network requests in process. `finally` restores instrumentation and removes the file. Its metric is application bytes read, because operating-system caching prevents equating that with physical disk traffic.

## Remaining risks and next action

- Root is rebuilding and exercising the live service. The existing 15-check media integration script uses raster/PDF paths, so real video E2E must also cover this upload path, metadata isolation, publication provenance and playback/feedback.
- Best-effort target cleanup can still fail during a Storage outage. The primary transfer error is preserved; this change does not claim guaranteed deletion while Storage is unavailable.
- No runtime services were rebuilt, stopped or reconfigured by this worker. No original project, asset, role or database content was mutated during these tests. Only ephemeral local test files/servers were used.
- Root should integrate independent review, live checks and the benchmark into the final verification/checkpoint. Existing broader video retry/lifecycle follow-ups remain separately scoped.

## Ownership at handoff

Runtime source is frozen for the orchestrator's build. All owned paths are released after this report; no worker test process remains. The orchestrator owns final runtime and release decisions.

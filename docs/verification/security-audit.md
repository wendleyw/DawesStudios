# Security verification

The scope covers the web application, trusted media service, database functions/policies, fixture tooling, dependency lockfiles, build output, and candidate repository files. Local acceptance credentials are synthetic and ignored by Git.

## Verified on 2026-09-20

| Check | Evidence | Result |
| --- | --- | --- |
| Dependency advisories | `npm audit --json` in both application directories | Zero known vulnerabilities in either lockfile at the time of the scan. |
| Candidate repository secrets | Git's tracked/untracked, non-ignored file list copied through hard links to a temporary scan directory; `gitleaks dir --redact` | 1,061 candidate files; 7.58 MB text scanned; no leaks. Ignored credentials/build/test traces were excluded deliberately. |
| Git history | `git log -1` | No commits exist yet, so no historical objects are available to scan. This is not a claim that an existing history passed. |
| Commit prevention | `.husky/pre-commit` and `.husky/commit-msg` | Gitleaks precedes lint-staged; conventional commit validation is configured. |
| Browser credentials | Exact private service-key search in `.next/static` | Zero occurrences. The invitation key remains server-only. |
| Container process | `dawes-web-acceptance` inspection and real HTTP request | Runs as `node`, read-only root filesystem, dropped capabilities, `/login` responds 200. |
| Client publication | `production-workflow.spec.ts` | Internal data changed after publication; client records and downloaded PNG SHA-256 stayed identical. Client cannot query internal comments. |
| Storage and policies | Backend SQL and real HTTP suites | See the backend evidence; these tests are being rerun after workflow hardening and final fixture reset. |

## Code review

React renders user content as text; no application use of `dangerouslySetInnerHTML`, `eval`, or dynamic shell execution was found. Media subprocesses receive argument arrays and controlled temporary paths. Server requests use configured Supabase URLs; asset paths must have a scoped UUID and opaque filename. The invitation endpoint validates the caller through Auth and an agency profile before using the privileged email API.

Permissions remain in PostgreSQL/RLS and trusted RPCs. UI visibility does not supply authorization. Clients use separate publications/comments, and designers use a safe accepted-brief RPC that excludes financial and author fields. Private artwork is downloaded through scoped Storage access; server-side publication regenerates bytes before exposure to clients.

Signed preview URLs expire after five minutes. Revoking membership prevents new authorized requests; a previously downloaded file or unexpired signed capability cannot be retroactively erased from a recipient's device. This boundary must remain explicit in operational guidance.

## Remaining release checks

Rerun the combined database, HTTP and browser suites after the final reset. The final seed, invitation/recovery mail, stale-review rejection, concurrency regression, and independent UI review have separate acceptance evidence. A local clean audit does not configure public TLS, outbound production SMTP, or deployment secrets.

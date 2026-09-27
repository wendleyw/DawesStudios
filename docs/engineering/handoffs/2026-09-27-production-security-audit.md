# Production security and release audit

- Updated: 2026-09-27 EDT · Agent: Codex reviewer · State: verified source audit
- Objective: bounded read-only audit of web API/auth, media, Compose, staging, CI and production guide; no source edits.
- Owned path: this report only. Decision: no cross-domain interface change.

## Ranked findings
- [High] `docs/operations/production.md:189` — the gateway serves Studio at `/` (`deploy/staging/compose.supabase.override.yml:22-25`), but the public proxy instruction only says to keep it private; forwarding the whole gateway would expose Studio. Provide and test an explicit API path allowlist and deny the root, analytics and admin routes.
- [High] `docs/operations/production.md:261` — no proxy request throttles are configured; public Auth token endpoints and media requests can be flooded, while the media cap only limits processing after authentication. Add tested per-IP and request-size controls at the public proxy.
- [Medium] `.github/workflows/check.yml:21` — CI runs static/unit/build checks but omits database policy and browser isolation suites; a release commit can pass with broken client permissions. Add a disposable backend job running DB and browser gates before release.
- [Medium] `deploy/staging/compose.app.yml:28` — current local rehearsal uses loopback HTTP and no TLS proxy, so it cannot verify production redirects, headers, WebSocket upgrade or proxy denials required by `docs/operations/production.md:226`. Add a TLS proxy rehearsal and HTTP checks.

## Checks actually run
- `npm audit --json` in `apps/web`: pass, 0 vulnerabilities (669 dependencies).
- `npm audit --json` in `apps/media`: pass, 0 vulnerabilities (105 dependencies).
- Root `npm audit --json`: ENOLOCK; root has no lockfile. Worktree `gitleaks dir` was interrupted after a long scan, so no fresh secret-scan conclusion; historical scan was outside assigned scope.
- Source inspection: administrative routes validate Supabase user plus active agency profile before privileged operations; competitor lookup uses caller RLS; media validates role, UUIDs, origins and body sizes; outbound URLs are fixed to configured Supabase or Meta hosts. No verified injection, path traversal, SSRF or client identity leak in assigned code.

## Risks and next action
- Production host, domain, SMTP, monitoring and off-host recovery remain unverified external configuration; verify them on the target host. Supplementary uploads have per-file caps; production needs a Storage disk-capacity/preflight gate, separate DB/scratch space and alerts. A dedicated filesystem quota can bound installation bytes without custom concurrent-upload reservations; per-client fairness remains separate.
- Next: orchestrator integrates proxy controls, CI/rehearsal gates and host checks. Ownership released; no services or data changed.

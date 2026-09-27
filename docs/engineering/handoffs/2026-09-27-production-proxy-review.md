# Production proxy independent review

- Updated: 2026-09-27 EDT · Agent: Codex reviewer · State: verified source review
- Objective: review rendered nginx edge, route allowlist, client IP, CORS, buffering, TLS and WebSocket handling.
- Owned path: this report only; no source, service or data changes.

## Finding
- [Medium] `deploy/production/nginx.conf.template:25` and `deploy/production/render_proxy.py:52` — renderer accepts a custom HTTPS port, but HTTP redirects omit it and `X-Forwarded-Port` stays `443`; an 8443 rehearsal redirects to an unreachable/default endpoint and upstreams see the wrong authority. Render the redirect port when nonstandard and forward the configured HTTPS port; cover the custom-port case in `test_proxy.py`.

## Verified controls and checks
- `python3 -m unittest discover -s deploy/production/tests -p test_proxy.py` — 2 passed, 6 Docker integration cases skipped by design; root reported an earlier separate 8/8 Docker TLS/stub run, which I did not rerun.
- Rendered `https_port=8443` and inspected output: `listen 8443`, redirect still `https://$host$request_uri`, forwarded port still `443`.
- Static route review: only Auth token/session/recovery endpoints, REST, Storage object and Realtime families reach the API gateway; Studio/root/admin/signup/functions/S3 have no matching proxy location. No verified path-allowlist bypass.
- Auth SDK calls in current web code fit allowed Auth routes; standard Storage uploads and signed downloads use `/storage/v1/object/`. The TUS path appears only in a stale CSP comment and dependency, not an active upload path.
- CORS preflight methods pass through allowed locations to Supabase/media; the proxy does not strip Origin or authorization. Media maintains its own origin allowlist. Live Supabase preflight remains for the upcoming rehearsal.
- Client-IP headers are overwritten from `$remote_addr`; limits use `$binary_remote_addr`. Storage upload bodies stream with a 51 MiB envelope; media bodies stream at 50 MiB. Storage response buffering is disabled. Realtime forwards Upgrade/Connection over HTTP/1.1 with a 3600-second read timeout.
- Access logs use `$uri` without query strings and critical-only error logs; signed URL tokens are not written by this proxy format. TLS rejects unknown SNI and redirects known HTTP hosts; certificate validity and live WebSocket behavior remain for the real-backend rehearsal.

## Next action
- Fix custom-port rendering, add its unit assertion, then run the real-Supabase TLS/proxy rehearsal and inspect Auth/Storage preflight, signed URLs, blocked paths and WebSocket handshakes. Production host/domain/SMTP remain unknown external inputs.
- Ownership released. No additional source finding confirmed; no Docker or server started in this review.

# Production edge

This directory supplies a public nginx configuration and an isolated TLS test. It does not deploy
services, issue certificates or change the host. The application continues to run as the Node.js
`web` container with the existing media worker and official self-hosted Supabase distribution.

The [Resend SMTP fragment](supabase-smtp.env.example) belongs in the official Supabase distribution's
`.env`, not the application environment. Follow the [email setup and release checks](../../docs/operations/email.md).

## Render and install

Use a current supported nginx package with `ssl_reject_handshake` (nginx 1.19.4 or later). Configure
DNS and obtain certificates for all three hosts first. Certificate renewal must reload nginx after
success. The following writes only a candidate file for review:

```bash
python3 deploy/production/render_proxy.py \
  --app-host app.example.com --api-host api.example.com --media-host media.example.com \
  > /tmp/dawes.conf
```

The generated file belongs inside nginx's `http` block, for example
`/etc/nginx/conf.d/dawes.conf`. It expects certificates at
`/etc/letsencrypt/live/<host>/{fullchain.pem,privkey.pem}` and an ACME webroot at `/var/www/acme`.
Both roots and each trusted backend address have explicit CLI overrides (`--help`). Use host nginx
with the existing loopback service ports. The renderer never installs files or reloads nginx.
Before an operator reload, run `nginx -t`; keep the previous configuration for rollback.

The HTTP-01 path serves the webroot. Other HTTP requests redirect to the matching HTTPS host.
Unknown hostnames have no application default: HTTP closes and TLS rejects the handshake.
Certificates must exist before enabling the HTTPS configuration; use your certificate provider's
DNS challenge or an initial ACME-only server for first issuance.

## Public boundary

| Public host | Allowed backend paths | Controls |
| --- | --- | --- |
| App | Application routes | 1 MiB request cap; app API 30 requests/s with burst 30 |
| API | Auth token/logout/recover/verify/user/resend/reauthenticate and JWKS; REST; Storage object routes; Realtime | Auth 2 requests/s with burst 10; REST 30/s with burst 100; Storage 30/s with burst 30 and 8 connections/IP |
| Media | `/health`, `/covers/prepare`, `/covers/clear`, `/deliveries/prepare` | Processing 10 requests/min with burst 5 and 4 connections/IP |

Limits count the actual source IP at the public edge and return HTTP 429. An office sharing one IP
shares these budgets; tune from observed legitimate traffic. Forwarded IP/protocol headers supplied
by clients are replaced. If a CDN/load balancer fronts nginx, configure and test only that provider's
trusted address ranges before using real-IP forwarding; never trust arbitrary forwarded headers.

The API defaults to 404: Studio, analytics, SQL/metadata administration, functions, S3, resumable
uploads and Auth admin/signup routes are not exposed. Current application uploads use the standard
Storage object endpoint. Every allowed API still enforces Supabase authentication and RLS. Keep all
backend ports on loopback/private networks so callers cannot bypass the edge.

The web/media `SUPABASE_INTERNAL_URL` **must point to the private gateway**, for example
`http://host.docker.internal:8000` from Docker. The public API deliberately blocks the Auth admin
paths the server uses to invite or remove members. Never substitute the public filtered hostname
for this private server URL. Public `NEXT_PUBLIC_SUPABASE_URL` uses the HTTPS API host.

Storage accepts a 51 MiB HTTP envelope around the existing 50 MiB file ceiling; media accepts 50 MiB.
Supabase's bucket limits remain authoritative, including the narrower cover cap. Upload requests
stream to the backend instead of accumulating proxy body files. Bounded JSON requests may buffer.
Realtime explicitly forwards WebSocket upgrade headers with a one-hour idle timeout. The proxy
does not automatically retry writes. Access logs omit query strings so signed URLs/auth links do
not log their tokens; nginx error logging retains only critical process failures because lower
levels can include raw request queries. Audit upstream gateway/Auth/Storage logging independently.

Creative work is in Miro. Supplementary uploads retain their simple existing flow; no multi-upload
queue or custom reservation service is required. Provision persistent Storage and scratch space,
monitor free bytes/inodes and backups, and isolate their capacity from the database. Filesystem
quotas are an operator option; this proxy is not a disk-capacity quota.

## Local verification

```bash
python3 -m unittest discover -s deploy/production/tests -v
RUN_PROXY_INTEGRATION=1 python3 -m unittest discover -s deploy/production/tests -v
```

The integration run creates a unique disposable Docker network, nginx, a fixed Python upstream
and a one-day self-signed certificate trusted only by the test. It verifies real TLS, HTTPS
redirects, private-route denials including encoded paths, IP/protocol spoof protection, Auth/media
429s, a real 50 MiB upload plus envelope, 413s, and a WebSocket 101 response. It deletes only its
own containers/network/temp files. No application database or user file is touched. Override
`PROXY_TEST_IMAGE` with the nginx image/digest selected for your release; the local default is
`nginx:stable-alpine`. Python test upstream uses `python:3.13-alpine`.

This test proves edge behavior against a controlled upstream. It does not prove public DNS,
certificate issuance/renewal, SMTP delivery, Miro permissions, or a deployed Supabase installation.
Those remain the target-host gates in the [production runbook](../../docs/operations/production.md).

References: nginx [request limiting](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html),
[WebSocket proxying](https://nginx.org/en/docs/http/websocket.html), and
[streaming request bodies](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_request_buffering).

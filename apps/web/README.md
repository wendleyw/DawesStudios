# Creative Canvas web application

The React and TypeScript frontend uses the Next.js App Router, xyflow canvases and TanStack Query. Supabase provides authentication, PostgreSQL, storage and realtime. The app runs with the standard Next.js CLI on Node.js.

## Local setup

Use Node.js `>=22.13.0` and npm. From the repository root:

```bash
npm ci --prefix apps/web
```

If `apps/web/.env.local` does not already exist, create it from the example:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Fill in the URL and keys for the local Supabase instance described in the [backend guide](../../docs/architecture/backend.md). Keep local credentials in ignored files.

| Variable                        | Purpose                                                                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Browser-accessible Supabase API URL.                                                                                                                       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase key; database and storage policies enforce access.                                                                                         |
| `NEXT_PUBLIC_MEDIA_URL`         | Browser-accessible trusted media service URL.                                                                                                              |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server-only credential used by the agency invitation endpoint. Never expose it with a `NEXT_PUBLIC_` prefix.                                               |
| `SUPABASE_INTERNAL_URL`         | Optional server-accessible Supabase API URL for invitations. Containers use `http://host.docker.internal:55421` locally; otherwise the public URL is used. |

Start Supabase and provision local fixture accounts using the backend guide. Run the [trusted media service](../media/README.md) for publishing uploaded artwork and preparing delivery files.

```bash
npm run dev
```

Open `http://localhost:3003`. Both development and production use port 3003, matching the local authentication redirects and media CORS configuration. Run one web server at a time on this port.

## Development from the repository

The source of truth is this Git checkout, with the frontend under `apps/web`. Use `npm run dev`
from the repository root for daily development. Next.js reads `apps/web/.env.local` and watches the
source files, so editing a page or stylesheet updates the browser without rebuilding an image.
Supabase and the trusted media service may continue running in Docker against the same data.

If the Compose web preview is using port 3003, switch runtimes explicitly:

```bash
docker compose --env-file .env.production stop web
npm run dev
```

Keep the development terminal open. For a server launched by an automation session, detach the
process and redirect stdin from `/dev/null` and stdout/stderr to a real log file; do not leave the
long-lived server attached to the session's output pipes. The current local recovery uses
`/tmp/dawes-next-dev.log`. A listening port alone does not establish health: verify a bounded HTTP
request to `/login` and a browser interaction after restarting. See the
[development recovery record](../../docs/verification/development-recovery-2026-09-23.md).

Stop the running server before starting another web runtime. No
copy from a container, migration, reset or fixture provisioning is needed for this switch. Keep
server-only credentials in the ignored environment file. When running Next.js on the host, its
Supabase URL must be accessible from the host; the public local API URL is already suitable.

## Optional production preview in Docker

The local Compose web service serves a compiled image on `http://localhost:3003`; it has no source bind mount. Editing files or starting a different repository on another port does not update that service. Stop the foreground development server first. From this repository root, rebuild and replace only the web container:

```bash
docker compose --env-file .env.production build web
docker compose --env-file .env.production up -d --no-deps web
```

Keep the existing ignored environment file. These commands do not reset Supabase, provision fixtures or replace the media service. Reopen the page after the new container starts. Use `docker compose --env-file .env.production ps web` to verify the running port.

## Build and verification

Run these commands from the repository root:

```bash
npm run check
npm run build
npm start
```

`check` generates Next.js route types, checks TypeScript, runs ESLint, verifies Prettier formatting and executes the colocated Vitest tests. Formatting is part of the gate so the pre-commit hook cannot rewrite files the gate has already passed. `build` creates production output under `apps/web/.next`; `start` serves that output with Node.js. Next.js fetches the configured Google fonts during the build, so the build requires network access to the font service.

Set the `NEXT_PUBLIC_*` variables before building; their values are included in the browser bundle. Provide the server-only invitation credential to the production process. A production environment also needs a reachable Supabase installation and the trusted media service; a successful local build does not deploy them.

With the web server and local Supabase running, and fixture accounts provisioned:

```bash
npm run test:e2e
```

The Playwright suite reads local test credentials from ignored `supabase/.env.local`. Because these journeys create and delete real rows, `tests/e2e/test-support.ts` refuses to run against a backend it was not told to expect: it accepts the local stack by default, and any other one must be declared through `ACCEPTANCE_SUPABASE_URL`. `PLAYWRIGHT_BASE_URL` points the browser at a server other than `http://localhost:3003`. It covers the three roles, all ten client workspaces, production/review/delivery, billing, invitations, legacy private drafts, brand asset folders, upload failures, concurrent editing, responsive layouts and accessibility. It does not start the services automatically. Mutation journeys create guarded temporary fixtures and remove them afterward. Run the suite with one worker against the local acceptance backend; do not run another seed reset or independent mutation suite at the same time. Screenshots go to the ignored `outputs/screenshots/`. Set `EVIDENCE_SCREENSHOTS=1` only when a run should refresh the committed images that a verification record in `docs/verification/screenshots/` cites.

## Continuous integration

[`.github/workflows/check.yml`](../../.github/workflows/check.yml) runs the web gate and the media unit tests on every push and pull request. The browser suite is deliberately not in that workflow: it needs a provisioned Supabase stack, the trusted media worker, the seeded dataset and the fixture accounts, and a job that quietly skipped it would read as coverage it does not have. The workflow file records what a browser job must set up when one is added.

## Production containers

The root [Compose configuration](../../compose.yaml) runs the web app and trusted media service as unprivileged processes with read-only filesystems. Supabase is managed separately by the backend runbook. Configure an ignored environment file from `.env.production.example`, then run from the repository root:

```bash
docker compose --env-file .env.production config --quiet
docker compose --env-file .env.production up --build -d --wait
docker compose --env-file .env.production ps
```

For local acceptance, use `http://127.0.0.1:55421` and `http://127.0.0.1:55430` for the public APIs, `http://host.docker.internal:55421` for the internal API, and `http://localhost:3003` for `APP_ORIGIN`. Stop the development web server and native media worker before assigning their ports to Compose. Public browser variables are build arguments; the service credential is injected only at runtime. Do not publish the example placeholders or local fixture accounts as a public service.

`APP_ORIGIN` must be the exact browser origin, and Compose passes it to both the web and media services. The web server needs it because the standalone Node.js process derives its request URL from the address it binds to: without `APP_ORIGIN` the invitation endpoint compares the browser `Origin` against `http://0.0.0.0:3003`, rejects every real invitation with HTTP 403, and would build invitation links on that unreachable host. A direct `next dev` or `next start` falls back to the request origin, so this only surfaces in a container.

Compose binds the web/media ports to loopback. A public installation needs its own Supabase deployment, DNS/TLS reverse proxy, exact Auth redirect URLs, CORS origin and SMTP provider. The configured local mailbox verifies invitation and recovery flows without claiming external email delivery. Credit requests are fulfilled by an authorized agency allocation; no payment processor is connected.

The production image uses Next.js standalone output with the repository as the tracing root, and includes its static assets and branding. See the [production workflow](../../docs/architecture/production-workflow.md), [security audit](../../docs/verification/security-audit.md), and [acceptance matrix](../../docs/architecture/acceptance-matrix.md) for behavior and actual verification evidence.

## Code layout

- `app/`: route composition, root layout and server endpoints.
- `features/`: feature UI, data access, validation and colocated unit tests.
- `lib/`: shared Supabase client configuration.
- `tests/`: test setup and browser scenarios.
- `public/brand/`: application branding.

The [board feature](features/board/README.md) owns five mutually exclusive views and per-viewer/client preferences. The [Playground feature](features/playground/README.md) provides persistent, role-isolated brainstorming canvases inside each project, with a layer sliding down over the entire viewport and a preserved return to the design upload form. Their focused browser checks run with `npm --prefix apps/web run test:e2e -- playground board-views` from the repository root against the running local stack.

Vitest remains the unit test runner and uses Vite internally; the web application itself builds and runs through Next.js.

Next.js agent-rule generation is disabled in `next.config.ts`; shared project instructions are maintained in the repository-root `AGENTS.md` and `CLAUDE.md`.

See the [Next.js CLI reference](https://nextjs.org/docs/app/api-reference/cli/next) for the underlying development, build, production and type-generation commands.

Video cards on project and client boards stay lightweight: they load playback only after opening a design. The viewer preserves position and playback state through signed-URL renewal; time-based pin actions wait for the restored frame. Run `npm --prefix apps/web run test:e2e -- video-loading video-designs` from the root for the loading budget, renewal and real three-role video workflow. See the [integrated verification](../../docs/verification/project-playground-video-2026-09-23.md) for measured scope and limits.

Client destinations appear as visible text links beside the board’s quarter selector and at the top of all other client pages, with an underline on the active section. They wrap on small screens and never duplicate in the sidebar. Global navigation and client switching remain in the sidebar. Project canvases use Add design tiles beside artwork and Add version rows below versions; agency actions from the shared tab open Working files and preserve published snapshots. See the [project feature](features/projects/README.md).

The client board replaces its full-width title with floating client identity/quarter and signed-in profile cards. Quarter filters start at All periods and keep undated work visible. It uses a floating left toolbar (bottom on small/short screens) for search, filters and five icon views: Canvas, List, Timeline, Kanban and Calendar. Each uses the same scoped projects and filters, fills the available work area, and saves the selected view per viewer/client. See the [board feature](features/board/README.md) for calendar date semantics, responsive sizing and verification commands.

The Next.js development indicator is disabled in `next.config.ts` so its fixed overlay cannot cover mobile board controls. Framework diagnostics remain available in the development terminal.

Client surfaces share a notification bell immediately left of the profile. It opens an animated
popover below the account card, with recipient-scoped activity and explicit read controls. Project
review uses desktop double-click (single touch/keyboard activation supported), a compact title with
inline status/date, a deliverable toolbar with Playground, and a larger feedback history. Assets in
Brand Hub now supports client-scoped folders; Templates is removed from navigation while existing
data and direct private draft URLs are preserved. See the
[current verification](../../docs/verification/client-polish-and-brand-folders-2026-09-23.md).

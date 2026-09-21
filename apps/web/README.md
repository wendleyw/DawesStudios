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

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-accessible Supabase API URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase key; database and storage policies enforce access. |
| `NEXT_PUBLIC_MEDIA_URL` | Browser-accessible trusted media service URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only credential used by the agency invitation endpoint. Never expose it with a `NEXT_PUBLIC_` prefix. |
| `SUPABASE_INTERNAL_URL` | Optional server-accessible Supabase API URL for invitations. Containers use `http://host.docker.internal:55421` locally; otherwise the public URL is used. |

Start Supabase and provision local fixture accounts using the backend guide. Run the [trusted media service](../media/README.md) for publishing uploaded artwork and preparing delivery files.

```bash
npm run dev
```

Open `http://localhost:3003`. Both development and production use port 3003, matching the local authentication redirects and media CORS configuration. Run one web server at a time on this port.

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

The Playwright suite reads local test credentials from ignored `supabase/.env.local`. Because these journeys create and delete real rows, `tests/e2e/test-support.ts` refuses to run against a backend it was not told to expect: it accepts the local stack by default, and any other one must be declared through `ACCEPTANCE_SUPABASE_URL`. `PLAYWRIGHT_BASE_URL` points the browser at a server other than `http://localhost:3003`. It covers the three roles, all ten client workspaces, production/review/delivery, billing, invitations, personal templates, upload failures, concurrent editing, responsive layouts and accessibility. It does not start the services automatically. Mutation journeys create guarded temporary fixtures and remove them afterward. Run the suite with one worker against the local acceptance backend; do not run another seed reset or independent mutation suite at the same time.

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

Vitest remains the unit test runner and uses Vite internally; the web application itself builds and runs through Next.js.

Next.js agent-rule generation is disabled in `next.config.ts`; shared project instructions are maintained in the repository-root `AGENTS.md` and `CLAUDE.md`.

See the [Next.js CLI reference](https://nextjs.org/docs/app/api-reference/cli/next) for the underlying development, build, production and type-generation commands.

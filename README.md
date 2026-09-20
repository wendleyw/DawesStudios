# Creative Canvas — Dawes Studios

A creative collaboration application built with Next.js, React and xyflow, backed by Docker-managed Supabase authentication, PostgreSQL, storage and realtime.

## Development

- Follow the [web application setup](apps/web/README.md) to install dependencies, configure the environment and run the app at `http://localhost:3003`.
- Follow the [backend guide](docs/architecture/backend.md) to start Supabase, apply migrations and provision the local fixtures.
- Run the [trusted media service](apps/media/README.md) when working with uploaded artwork publication and delivery files.

From the repository root, `npm run dev` starts the web application, `npm run check` checks types, lint and unit tests, and `npm run build` followed by `npm start` serves the production build. `npm run test:e2e` requires the running web server, local Supabase and provisioned fixture accounts.

## Project documentation

- [Architecture and implementation plan](docs/architecture/implementation-plan.md)
- [Domain model](docs/architecture/domain.md)
- [Permissions](docs/architecture/permissions.md)
- [Acceptance matrix](docs/architecture/acceptance-matrix.md)
- [Codex / Claude continuation checkpoint](docs/engineering/handoff.md)
- [Agent orchestration and handoff procedure](docs/engineering/agent-orchestration.md)

The application is in development. The acceptance matrix records the remaining verification work; local checks alone do not establish production readiness.

# Creative Canvas — Dawes Studios

A creative collaboration application built with Next.js, React and xyflow, backed by Docker-managed Supabase authentication, PostgreSQL, storage and realtime.

## Development

- Follow the [web application setup](apps/web/README.md) to install dependencies, configure the environment and run the app at `http://localhost:3003`.
- Follow the [backend guide](docs/architecture/backend.md) to start Supabase, apply migrations and provision the local fixtures.
- Run the [trusted media service](apps/media/README.md) when working with uploaded artwork publication and delivery files.

The repository is the source of truth: application routes, components and styles live in `apps/web`; Docker stores no unique application source. For everyday UI development, run Next.js directly from this checkout. Supabase and the trusted media service can remain in Docker.

From the repository root, `npm run dev` starts the web application with live updates, `npm run check` checks types, lint and unit tests, and `npm run build` followed by `npm start` serves the production build. `npm run test:e2e` requires the running web server, local Supabase and provisioned fixture accounts.

If a production-preview web container already owns port 3003, stop only that service before starting development:

```bash
docker compose --env-file .env.production stop web
npm run dev
```

Keep the terminal running and open `http://localhost:3003`. Edit `apps/web/app` and `apps/web/features` in this same checkout; changes appear without rebuilding a Docker image. Existing ignored environment files connect the app to the same backend. Do not reset or re-provision the database to switch web runtimes. See the [web setup](apps/web/README.md) for installing a fresh checkout and switching back to a production preview.

## Project documentation

- [Architecture and implementation plan](docs/architecture/implementation-plan.md)
- [Domain model](docs/architecture/domain.md)
- [Permissions](docs/architecture/permissions.md)
- [Board views](apps/web/features/board/README.md)
- [Populated SABRE demonstration: 50 projects](supabase/demo/sabre/README.md)
- [Playground and original board widget history](docs/architecture/playground-and-board-widgets.md)
- [Project Playground and video efficiency](docs/architecture/project-playground-and-video-optimization.md)
- [Acceptance matrix](docs/architecture/acceptance-matrix.md)
- [Production deployment guide](docs/operations/production.md)
- [Codex / Claude continuation checkpoint](docs/engineering/handoff.md)
- [Agent orchestration and handoff procedure](docs/engineering/agent-orchestration.md)
- [Folder-by-folder repository cleanup audit](docs/engineering/repository-cleanup-2026-09-27.md)

The application is in development and not yet deployed. The acceptance matrix records the remaining verification work, and the [production guide](docs/operations/production.md) lists the release checklist; local checks alone do not establish production readiness.

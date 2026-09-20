# Web runtime cleanup verification

Date: 2026-09-20.

## Implemented changes

- Removed the OpenAI Sites hosting manifest and packaging plugin, the Cloudflare Worker entry point and the application Vite configuration.
- Removed the direct vinext, Wrangler, Cloudflare, Vite plugin and React Server DOM adapter dependencies and refreshed the npm lockfile. npm removed 125 packages. Vite remains transitively through Vitest.
- Removed the generated vinext font cache and Wrangler registry/cache directories and their obsolete ignore/type configuration.
- Switched development, production builds and serving to the standard Next.js CLI, retaining port 3003. Type checking generates Next.js route types first.
- Replaced the starter README, including obsolete D1, R2, Drizzle and ChatGPT sign-in guidance, with application setup instructions. Updated the architecture plan and both root agent instruction files.
- Disabled automatic Next.js agent-file generation so the repository-root instruction files remain authoritative.
- Corrected the project canvas flex container selector after the agency browser test exposed a zero-height canvas.
- Added Suspense boundaries to the invitation and recovery routes for their URL-dependent client components, as required by the [Next.js prerendering guidance](https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout).

## Executed checks

| Check | Result |
| --- | --- |
| Removed paths and dependency lockfile entries | Verified absent. |
| Source/reference search | No active Sites, vinext, Cloudflare, Wrangler, D1/R2 or ChatGPT integration references outside this historical record. |
| `npm ls --prefix apps/web --depth=0` | Passed; direct dependency tree is valid. |
| `npm ls --prefix apps/web vite` | Vite is owned by Vitest and its mocker dependency. |
| `npm test` | 65 tests passed in four files. |
| `npm run test:e2e` | Both agency and client scenarios passed against Next.js development after the canvas correction. Screenshots were refreshed by the existing suite. |
| `npm start` and HTTP checks | The initial Next.js production build started successfully. `/login` and `/brand/logo.webp` returned 200; an unauthenticated POST to `/api/invitations` returned 401. |
| `npm run dev` | Starts Next.js on port 3003 without regenerating application-local agent instructions. |
| Targeted ESLint and Prettier checks | Passed for the edited Next.js configuration and authentication route files. |
| Root instructions, README links and environment ignores | Root `AGENTS.md` and `CLAUDE.md` match; relative README links resolve; local credential files remain ignored and the environment example is visible to Git. |

## Remaining verification limits

The working tree was being edited concurrently outside this cleanup. The first Next.js production build passed, but the final build could not finish type checking because `features/board/campaign-dialog.tsx:18` accesses a possibly null `result`. This cleanup does not claim a successful final production build.

The latest full `npm run check` passed type checking at that point, then failed ESLint on `Date.now()` during render in `features/settings/team-settings.tsx:21` (`react-hooks/purity`). It also reported six existing image-element warnings. The unit suite was run separately and passed.

The next release check must resolve the unrelated feature errors and rerun `npm run check` and `npm run build` on a stable tree. These runtime migration checks do not replace the full product acceptance matrix or establish production deployment readiness.

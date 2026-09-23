# Security headers: full CSP, HSTS, poweredByHeader, streamed invitation body cap

- Updated: 2026-09-23T22:21:50Z · Agent: Claude Code (implementer) · Model: Sonnet 5
- State: verified
- Objective: replace the 4-directive CSP with a full policy, add `poweredByHeader:false`/HSTS, and stream the invitations route's 4096-byte body cap. Owned: `apps/web/next.config.ts`, `apps/web/app/api/invitations/route.ts`, one new helper + tests.

## Changes
- `apps/web/next.config.ts` — full CSP (default/script/style/img/media/connect/font/worker/frame-src plus the existing 4 directives) built from `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_MEDIA_URL` origins (`rg`-verified against every fetch/img/video/TUS/Realtime call site); missing or invalid env falls back to `'self'` only + `console.warn`, never emits `"undefined"`; `poweredByHeader: false`; HSTS added only when `NODE_ENV=production`.
- `apps/web/features/settings/invitation-body.ts` (new helper) — `readCappedBody` streams `request.body`, cancels the reader once the running size exceeds `maxBytes`; mirrors `readBody` in `apps/media/src/server.js`.
- `apps/web/app/api/invitations/route.ts` — swapped `request.text()`-then-measure for `readCappedBody(request, 4096)`; identical 413/400 statuses and messages; the `Content-Length` precheck stays as a fast path.
- `apps/web/lib/next-config.test.ts`, `apps/web/features/settings/invitation-body.test.ts` (new tests).
- `apps/web/features/settings/README.md` — documented the streamed cap; added the new test to the verify command.

## Decisions and interface changes
- `team-members/[id]/remove/route.ts` has no `Content-Length`/body-buffering pattern (confirmed by reading it) — left untouched, per the task's own condition.
- `vitest.config.ts` only discovers `features/**`/`lib/**`, so the header-builder test lives at `apps/web/lib/next-config.test.ts` (importing named exports from `../next.config`) instead of beside `next.config.ts`; `vitest.config.ts` itself is outside owned paths and was not changed.

## Checks actually run
- `npx vitest run lib/next-config.test.ts features/settings/invitation-body.test.ts` — 13/13 pass, incl. an infinite-stream case that would hang, not just fail, if the cap weren't enforced mid-stream.
- `npm run typecheck`, `npm run lint`, `npx prettier --check app features lib *.ts` — all clean (prettier auto-formatted the 2 new/changed files once, re-verified after).
- `npm run build` — succeeds; running dev server's `.next/dev` undisturbed.
- `curl -sI http://localhost:3003/login` — dev server auto-restarted; live CSP (dev, `NODE_ENV=development`): `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http://127.0.0.1:55421 http://127.0.0.1:55430; media-src 'self' blob: http://127.0.0.1:55421 http://127.0.0.1:55430; connect-src 'self' http://127.0.0.1:55421 ws://127.0.0.1:55421 http://127.0.0.1:55430; font-src 'self' data:; worker-src 'self' blob:; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`. `X-Powered-By` absent; production drops `'unsafe-eval'` and adds HSTS (unit-tested, not curled — build output isn't served).

## Risks and next action
- No full-route integration test covers the invitations route's streamed path end-to-end (only `readCappedBody` is unit-tested); the route itself still has no route-level test file.
- Ownership: all owned paths released; no process left running beyond the pre-existing dev server.

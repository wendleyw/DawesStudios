# Playground fixture: own disposable client user

## Completed
`createPlaygroundFixture()` now creates its own disposable client-role auth user
(`acceptance-playground-<uuid>@client.dawes.local`, via `localAdmin.auth.admin.createUser`,
default trigger role `client`) instead of adding the shared SABRE demo login
(`credentials.client`) to the temporary client's `client_memberships`. Returns
`client: { email, password }`. `cleanup()` deletes the auth user last, guarded by an email
pattern check plus a live `getUserById` match, and is skipped safely if creation never happened.

## Changed files
- `apps/web/tests/e2e/playground-fixture.ts` — new client user creation/cleanup, return shape.
- `apps/web/tests/e2e/playground.spec.ts` — 3 direct `credentials.client` refs + a `role` loop
  (`for (const role of [...,"client"])`) that also relied on `credentials[role]`, switched to
  `workspace.client.email` (and its cross-role "other" check now uses the fixture client instead
  of the demo login).
- `apps/web/tests/e2e/project-feedback.spec.ts` — 4 refs switched to `fixture.client.email`.
- `apps/web/tests/e2e/board-views.spec.ts` — 1 direct ref, plus a `role` loop with the same
  `credentials[role]` pattern, both switched to `first.client.email` / `fixture.client.email`.
- `apps/web/README.md` — no change needed; it does not document this fixture.

## Decisions
- Returned shape is `client: { email, password }`; callers pass `client.email` into the existing
  `localCaller(email)` / `signIn(page, email)` signatures (unchanged, not owned).
- Refs against seeded SABRE data (`credentials.agency`, other `credentials.client` uses outside
  fixture-created clients) were left untouched.

## Checks executed
- `npx prettier --write`, `npx tsc --noEmit -p .`, `npx eslint tests/e2e` — all clean.
- `npx playwright test playground.spec.ts project-feedback.spec.ts board-views.spec.ts
  brand-folders.spec.ts notifications-popover.spec.ts theme.spec.ts` against the running dev
  server: 31 passed, 1 failed (`brand-folders.spec.ts`).
- `docker exec ... psql`: 0 leftover `Acceptance Playground%` clients, 0 leftover
  `acceptance-playground-%` auth users, `sabre@client.dawes.local` has exactly 1 membership.
- `git grep -n "credentials.client"` in the fixture file: no matches.

## Risk / unresolved — needs orchestrator follow-up
`tests/e2e/brand-folders.spec.ts` (not in my owned paths) has the same bug pattern at lines 94-98:
`for (const role of ["client", "designer"])` signs in as `credentials[role]` against
`fixture.clientId`'s brand page. Since the demo client login no longer has membership to
fixture-created clients, that iteration now fails (timeout: client viewer can't see the brand
folder nav). Needs the same `role === "client" ? fixture.client.email : credentials[role]` fix.
Did not touch it — outside owned paths.

## Next action
Orchestrator: apply the equivalent fix to `brand-folders.spec.ts:94-98`, then re-run its spec.

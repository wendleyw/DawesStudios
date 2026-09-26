# System audit, refactor and complete test — verification

Date: 2026-09-26 · Orchestrator: Claude Code · Workers: Sonnet (audit, implementation, reviews),
Haiku (checks)

Scope: the whole repository after the client people and Miro version links work (from `164c885`),
on local `main`. The Miro session (`dawesstudios-71`) had finished and was read-only for the whole
audit. Worker reports are `docs/engineering/handoffs/2026-09-26-system-refactor-*.md`.

## Method

Three independent read-only audits ran in parallel, each checking live code and the live database
rather than documentation. Every accepted finding was then fixed by one worker and reviewed before
the next task started.

- **Security and data integrity:** functions, grants, row-level policies, storage, the API routes
  and the media service.
- **Frontend logic and duplication:** 16 features, about 26,000 lines.
- **Tests, tooling, dependencies and documentation:** coverage gaps, test reliability, scripts,
  dependency audit, and documented claims checked against the code.

## Findings and outcome

| # | Finding | Outcome |
| --- | --- | --- |
| F1 | The People dialog froze its clock, so an invitation that expired while it was open stayed listed | Fixed (`5519811`): one `isInvitationPending` rule and a live `useNow` clock shared with the Team page; a fake-timer test fails on the old code |
| F2 | Credit count formatting and pluralisation duplicated across the credit chips | Fixed (`e4804f4`): `formatCredits` in `credit-model.ts`, also used by the Overview |
| F3 | "Dismiss on outside click" hand-written three times across two features | Fixed (`7d22265`): `useDismissOnOutsideClick` in `features/shared` |
| F4 | The Playground re-implemented the tested bounded-concurrency helper twice | Fixed (`d207be2`): `mapWithConcurrency` moved to `features/shared/concurrency.ts`, used by projects and the Playground |
| F5 | One 646-line project action dialog handled seven actions | Fixed (`9f466ab`, `2cae642`): a thin dispatcher, a shared shell and one component per action; its 21 existing tests pass unedited |
| S1 | No size limits on briefings | Fixed (`e95ae36`, migration `202609260003`): at most 50 deliverables, a 64 KB direction, 10,000 characters per text field (200 for the title), 100 drafts per client and 20 attachments per briefing, all far above today's largest |
| S2 | `adjust_credits` could return a raw unique-violation error under concurrent retries | Fixed (`e95ae36`): the advisory lock `request_credits` already takes |
| T1 | Six security-definer functions had no database test | Fixed (`9426f03`): `security_definer_coverage.test.sql`, 40 cases for allowed and refused callers plus every new limit |
| T6 | The removed-account lockout had no unit test | Fixed (`1e6a675`) |
| E1–E3 | Three browser specs out of date since 2026-09-24: Global Search removed, the sidebar's animated studio mark counted as a design video, and a real competitor on SABRE | Tests updated (`c2a104f`). No product regression; the user's competitor was kept |

Left as they are, with the reason:

- **The known SABRE-overlay failures.** Four browser specs and six `access_and_workflows.test.sql`
  assertions fail only because of the SABRE demonstration overlay's counts. `CLAUDE.md` forbids
  weakening the canonical assertions to reconcile them.
- **The media service's two-job limit.** It is global rather than per user, deliberately.
- **The competitor cap.** It runs only for the studio, which already holds the only insert policy.
- **Vitest versions.** The web app uses Vitest 5 and the media service Vitest 4.
- **The 347-line `project-action-design.tsx`.** It is one cohesive upload flow.

## Checks executed

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, lint, format, unit tests) at `1e6a675` | Pass, 1168 tests in 109 files |
| Media service unit tests | 70 of 70 |
| Media service integration test (live service) | 15 of 15 checks |
| `supabase test db` at `1e6a675` | 25 files, 633 tests; only the six known overlay assertions fail (2, 4, 9, 18, 32, 54) |
| `npm run build` | Pass |
| All 34 Playwright specs at `1e6a675` | 105 passed, 3 skipped, 8 failed: the 5 known overlay-count tests plus E1–E3 |
| E1–E3 after the test updates (`c2a104f`) | `brand-accessibility` 3 of 3, `competitor-ads` 1 of 1, `video-loading` 1 of 1, each green on two runs; `npm run check` 1168 tests. `video-loading` also needed Canvas view selected, since the board opens in List view for first-time viewers (`1cd8a6c`, 2026-09-24) |

Security audit, clean areas: no `anon` or `public` grants on application tables or functions;
every function has `search_path=''`; buckets are private; storage policies are scoped; clients
never receive designer identity; the service role is used only after authorisation in the four
API routes; the media service calls `ffmpeg` with argument arrays. Both apps report 0 known
vulnerabilities in `npm audit`.

## Remaining gaps

- The SABRE-overlay count failures above stay by rule.
- Browsers: Chromium only.
- Miro links still need the user's real-board check.

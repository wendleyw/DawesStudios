# Task 6: The studio names who requested a briefing

- Updated: 2026-09-25T23:56:05-0400 · Agent: Claude Code · Model: Sonnet 5
- State: implemented and tested
- Objective and owned paths: studio picks the client person a briefing is filed for; `apps/web/features/briefings/{briefing-model,briefing-editor,briefing-editor-form,briefing-editor-details}*`

## Changes
- `briefing-model.ts` — `Briefing.requested_by`; `briefingPayload(...,requestedBy?)` adds `p_requested_by` only when non-empty; new `initialRequester`, `requesterErrors`.
- `briefing-editor-details.tsx` — `requester` prop renders the "Requested by" `<select>` or the "Nobody at `<client>` …" note.
- `briefing-editor-form.tsx` — `people?: ClientPerson[]` prop; `requestedBy` state seeded by `initialRequester`; `requesterErrors` gates save/review; feeds `briefingPayload`/`BriefingEditorDetails`.
- `briefing-editor.tsx` — loads `useClientPeople`, passes `people` for `agency` role only.
- Tests: brief's model cases and new `briefing-editor-form.test.tsx`, verbatim.

## Decisions and interface changes
- `briefing-editor-form.test.tsx` stubs `Element.prototype.scrollIntoView` (jsdom has none), scoped to this file only. No files outside this feature touched.

## Checks actually run
- RED→GREEN then `npx vitest run features/briefings` — 6 files/105 tests pass; `npm run check` — 98 files/1094 tests, typecheck/lint/format pass.
- `npx playwright test tests/e2e/briefing-modal.spec.ts tests/e2e/intake-admin.spec.ts --output=../outputs/pw-client-team-6`: `briefing-modal.spec.ts` (agency+client, real draft/submit, axe) fully passes.
- `intake-admin.spec.ts`: tests 1–2 pass; test 3 fails on `toHaveURL(/board$/)` (actual `/overview`) — unrelated pre-existing regression from commit `79264ac9` in `features/workspace/home-page.tsx` (confirmed via `git status`/`blame`, not this diff); serial mode then skips tests 4–6.

## Risks and next action
- Route the `home-page.tsx`/`intake-admin.spec.ts` `/board` vs `/overview` mismatch to its owner.
- Ownership released; no active writer on these paths.

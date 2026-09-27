# Action notifications independent review

- Updated: 2026-09-27 EDT · Agent: Codex reviewer · State: source review complete; runtime verification pending.
- Objective: audit migration 018, pgTAP fixture, action hook/feed/bell, project URL targets and new browser journey.
- Owned path: this report only; no source, database, browser or service changes.

## Ranked finding
- [Medium] `supabase/migrations/202609270018_action_notifications.sql:86` — an agency `review_round` vanishes if its designer is removed or unassigned, even though the latest round remains `submitted` and `share_miro_version` still accepts that round (`202609270007_retire_versions_schema.sql:351`). A submitted round can therefore require a studio decision but disappear from the action list. Keep the agency action until the round is reviewed/replaced, or explicitly make such rounds non-actionable in the share workflow and document that rule.

## Supported controls and checks
- Read migration 018, `action_notifications.test.sql`, action UI/hook/feed/bell, project route/workspace URL handling and the new e2e journey; compared recipient helper with `private.notify_client` and board/role policies. No commands mutated data.
- The view uses `security_invoker=true` and source RLS; designer actions require own board plus current assignment, and client actions require a current client role, membership and requester/`notify_all` eligibility. The helper returns only a boolean and rejects unrelated projects in its test fixture. No supported cross-role data leak found in inspected code.
- Current-state predicates replace older submitted rounds and publications, remove completed reviews/deliveries, and keep read/unread activity independent of actions. The pgTAP fixture covers those transitions and role cases but deliberately expects removed-designer review suppression at lines 196–200.
- Project URL hints are resolved against already authorized board/version rows; client and designer channels remain role-fixed. Action links target existing project, briefing and credit routes. The browser journey covers designer→agency→client→feedback→approval→delivery, but was not executed in this review.
- Parent is implementing pagination for more than 100 actions. I inspected its current `.range()` query and Previous/Next controls; runtime behavior under concurrent action changes and actual PostgREST counts is unverified here.

## Next action
- Resolve the removed-designer round rule with a matching pgTAP assertion, then run the database test and e2e journey. Root owns integration, regression gates and final evidence.
- Ownership released; no source edits or external effects.

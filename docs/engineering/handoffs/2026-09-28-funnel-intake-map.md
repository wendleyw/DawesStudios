# Funnel and intake map
- Updated: 2026-09-27 EDT · Agent: Codex · Model: GPT-6 Luna
- State: verified (read-only code map)
- Objective and owned paths: Map onboarding and briefing/budget/credit intake; code ownership none.

## Changes
- `docs/engineering/handoffs/2026-09-28-funnel-intake-map.md` — current flow, exact UI labels, role gates, statuses and backend effects.

## Decisions and interface changes
- Agency invitations are the onboarding entry point: `/team` → **Invite someone** → Role (Designer/Agency/Client), or client People → **Invite person**; client scoped form fixes role to Client (`team-page.tsx:82-91,268-392`; `client-people-dialog.tsx:187-197`). Agency-only API/RPC; acceptance verifies token/email, changes role/membership (`route.ts:36-43,65-70`; migration `202609200002_workflows.sql:229-240`). Invitee completes **Accept invitation** (`invitation-acceptance.tsx:156-199`).
- Role copy: Agency manages studio work, clients and credits; Designer sees assigned projects; Client sees own projects/shared work (`team-page.tsx:378-384`). Team page and invitation list are agency-only (`team-page.tsx:57-66`; `team-data.ts:43-51`).
- Briefing entry: `/clients/:clientId/briefings` → **New briefing** (hidden for designers), then Service → Details → Review; buttons **Continue to details**, **Review briefing**, **Send briefing**, and **Save draft** (`briefings-page.tsx:63-69`; `briefing-editor-form.tsx:243-255,310-359`). Campaign selection is required; sending is free (`202609200002_workflows.sql:24-32`; `briefing-data.ts:229-235`).
- Briefing statuses: `draft` → `awaiting_review` → `budget_confirmed` → `accepted`, shown as Draft / Awaiting review / Budget confirmed / In progress (`briefing-model.ts:55-74,141-158`). Client or agency may submit; agency alone confirms budget and accepts (`202609200002_workflows.sql:24-42`; monthly `202609270003_monthly_credits.sql:427-432`).
- Agency detail panel has **Confirm budget** then **Accept & create project**; edited budget must be reconfirmed. Client sees “With the studio” or “Scope confirmed”; designers only get assigned safe briefings and **Open project** (`briefing-detail.tsx:121-187,407-447`; `briefing-data.ts:61-79`).
- Budget confirmation stores approved total/note only; no debit/project yet (`briefing-data.ts:165-185`; migration `202609200002_workflows.sql:34-43`). Acceptance locks the briefing/client credits, checks budget/month/balance, creates one project + deliverables, posts one debit, then marks accepted; repeat accepted calls return existing project (`202609270003_monthly_credits.sql:427-456`).
- Agency's **Credit month** select offers current month + next 11. Default is due-date month clamped to that window, or current month without due date (`briefing-detail.tsx:284-288,368-380`; `credit-model.ts:360-372`). Short balance blocks acceptance and points to another month or **Add extra**; backend rejects insufficient/closed month (`briefing-detail.tsx:421-445`; migration `202609270003_monthly_credits.sql:432-435`).
- No briefing rejection or cancellation status/action was found: four statuses only, and no such write path in the briefing UI/backend searched. A confirmed quote can be edited/reconfirmed. This does not establish cancellation outside the inspected intake scope.
- Separate credit request: Credits page button is client **Request credits**, agency **Adjust credits** (`credits-page.tsx:121-124,164-178`). Client sends 25/50/100 with optional note; agency's pending request **Review** dialog offers **Decline request** (required reason) or **Allocate credits** (`credit-actions.tsx:80-85,94-105,143-199`). Status is pending → fulfilled/rejected, with notification on request and resolution (`202609200004_requests_and_attachments.sql:1-36`).
- Notification evidence in this slice: briefing submit notifies agency; briefing acceptance notifies client; credit request notifies agency; fulfillment/decline notifies client (`202609200002_workflows.sql:30-32`; `202609270003_monthly_credits.sql:455`; `202609200004_requests_and_attachments.sql:12-17,25-36`). Parent owns complete notification audit.
## Checks actually run
- Read-only targeted `rg` searches and numbered excerpts across the named feature files and relevant migrations — completed; no tests run (explanation only).
## Risks and next action
- This map follows current code and latest monthly-credit migration; run the parent’s broader notification audit separately.
- Ownership: report only; no code, database or git changes.

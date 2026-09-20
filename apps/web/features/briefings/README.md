# Briefings

This feature implements the client/agency service request flow against the caller's authenticated Supabase session. Designers can read only accepted briefings for their assigned projects through the safe `get_assigned_briefings` projection; raw briefing records and financial fields remain unavailable.

- `service-catalog.json` contains the 20 service types and 25 formats copied from the reference catalog, with English product data and no prototype implementation dependency.
- `briefing-model.ts` defines draft validation, catalog helpers, a validated JSON decoder, brand defaults, and the typed briefing RPC payload. New drafts have no implicit campaign.
- `briefing-data.ts` owns scoped briefing, campaign, brand, and service-preset queries. It uses a separate validated designer decoder for the safe assigned projection.
- `briefings-page.tsx` lists drafts, pending reviews and accepted briefs. `briefing-editor.tsx` provides Type, Details and Review with persisted draft saves. `briefing-detail.tsx` exposes agency budget confirmation and atomic acceptance through backend RPCs.
- `briefing-attachments.tsx` uploads real private PNG/JPG/WebP/PDF files, enforces a 50 MiB client-side limit, registers them with the backend, and supports authorized download/removal. A draft must be saved before files can be attached. Backend policies independently enforce access and file constraints.
- `briefing-summary.tsx` renders the saved scope without exposing internal project assignments.

Routes live under `app/(workspace)/clients/[clientId]/briefings/`. Feature styles are local to `briefings.css`; shared dialogs use the common Modal component. Authoritative state is stored in Supabase and read through TanStack Query. Form state contains only the in-progress draft; it does not grant permissions or create credits locally.

Saving an incomplete draft is allowed after choosing a service. Submission requires a campaign, title, overview, at least one valid deliverable and the service-specific answers. Fixed formats require width/height, fluid formats width, and non-dimensional formats neither. Named variations preserve their own quantity and Original/Adaptation scope. Estimates apply to the service and are not multiplied by format badges. Current service presets override only the estimate and delivery timing, while questions and formats remain canonical. Saving stores the preset revision; accepted project quotes are not recalculated. Optional RPC arguments are omitted when empty, using the SQL function's nullable defaults to clear optional draft fields. The editor calls `save_briefing_revision`, captures the loaded revision with its local draft, and receives the saved ID/revision atomically. A second editor with an older revision receives a conflict; its unsaved text is preserved. Background query refreshes do not advance that local revision.

The agency confirms an integer project budget. An adjustment or custom service requires a note in the interface. Acceptance calls the backend transaction; the interface does not create a project or ledger entry separately. Backend rejection of insufficient balance and repeated acceptance is surfaced directly.

Verification from `apps/web`:

```sh
npm run test -- features/briefings/briefing-model.test.ts features/briefings/briefing-attachments.test.ts
npm run test:e2e -- tests/e2e/intake-admin.spec.ts
npm run typecheck
./node_modules/.bin/eslint features/briefings 'app/(workspace)/clients/[clientId]/briefings'
```

The focused tests cover all catalog services/formats, required and invalid answers, dates, quantities, explicit campaign selection, service-level estimates, JSON decoding and file policy. These tests do not prove RLS, actual file transport or the authenticated browser workflow; those require the orchestrator's database and browser suites in the [acceptance matrix](../../../../docs/architecture/acceptance-matrix.md).

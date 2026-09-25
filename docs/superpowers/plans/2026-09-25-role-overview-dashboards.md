# Welcome Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give clients a welcome Overview for their workspace (their landing page) and designers a
welcome dashboard at `/home`, and greet the studio on its own Overview, all built from the reads
each role already has.

**Architecture:** A new `features/overview` feature holds a pure model (every count, ordering and
filter), one Supabase read for designers, the client Overview page and the designer dashboard.
Shared pieces (a welcome header and the Overview number tiles) move to `features/shared` and
`app/globals.css`. One migration adds `projects.delivered_at`, stamped by `mark_project_delivered`.

**Tech Stack:** Next.js 16.3.5 App Router, React 19.2.8, TanStack Query 5, Supabase (PostgreSQL,
pgTAP), Vitest 5 with Testing Library, Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-09-25-role-overview-dashboards-design.md`

## Global Constraints

- English for all code, identifiers, comments, UI copy and documentation.
- No new dependencies; no new policies, roles or grants.
- Supabase queries live only in `features/<feature>/<feature>-data.ts` (`overview-data.ts` for the
  new feature); reads are `use<Thing>()` hooks.
- Styling: shared tokens and shared-primitive styles in `apps/web/app/globals.css`; feature rules in
  `features/overview/overview.css`; every colour a token (`features/shared/theme-colors.test.ts`)
  and no selector in two stylesheets (`features/shared/stylesheet-boundary.test.ts`).
- A client's Overview renders only client-visible data: `internal` review rows are dropped for every
  viewer; no designer name, assignment, internal note or unpublished version.
- Designers see no credits anywhere.
- Relative times: `Intl.RelativeTimeFormat("en", { numeric: "auto" })` — "today", "yesterday",
  "3 days ago", "last week", "2 weeks ago", "last month", "2 months ago", "last year".
- "This month" is the calendar month in the studio time zone (`useDateFormat().formatMonth`).
- Up to five rows per dashboard column.
- Local Supabase: never reset or re-provision; apply the new migration with `supabase migration up`
  from the repository root. The Next.js dev server on http://localhost:3003 is already running; never
  start another.
- Playwright: always pass a private `--output` directory. `workspace-actions`, `design-audit`,
  `canonical-workspaces` and `workspace` have known failures on the SABRE overlay's counts only.
- Commands run from `apps/web` unless stated. `npm run check` includes `prettier --check`: run
  `npx prettier --write` on touched files first.
- Stage explicit paths only; one Conventional Commit per task, ending with the committing agent's
  own `Co-Authored-By:` line.

## Review Focus

1. A client who belongs to several workspaces must not be redirected at all (only a single-workspace
   client lands on its Overview). Task 5 changes only the redirect target; its reviewer checks that the
   multi-workspace branch of `home-page.tsx` is untouched.
2. A designer who types `/clients/:id/overview` is sent to that client's Board, never shown client
   credits. Pinned in Task 4.
3. A project delivered before the migration, or created by the SABRE demo script later without
   `delivered_at`, still dates its delivery (falls back to `updated_at`). Pinned in Task 3.
4. A review row flagged `internal` never renders on the client Overview, even for the studio viewer.
   Pinned in Tasks 3 and 4.
5. Month and "N days ago" boundaries in a non-UTC studio time zone. Pinned in Task 3.

---

### Task 1: Delivery timestamp

**Files:**
- Create: `supabase/migrations/202609250001_project_delivered_at.sql`
- Create: `supabase/tests/database/project_delivered_at.test.sql`
- Modify: `supabase/database.types.ts` (regenerated)
- Modify: `apps/web/features/workspace/workspace-data.ts` (`Project` type)
- Modify: the six unit-test files that build `Project` literals (`features/board/board-data.test.ts`,
  `board-page.test.tsx`, `project-timeline.test.tsx`, `list-sort.test.ts`, `board-layout.test.ts`,
  `features/credits/credit-model.test.ts`) — add `delivered_at: null` where typecheck asks
- Modify: `apps/web/tests/e2e/production-workflow.spec.ts` (delivery assertion)

**Interfaces:**
- Produces: `projects.delivered_at timestamptz` (nullable), set by `mark_project_delivered`;
  `Project.delivered_at: string | null`.

- [ ] **Step 1: Write the failing database test**

Create `supabase/tests/database/project_delivered_at.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(3);
select has_column('public', 'projects', 'delivered_at', 'Projects record when they were delivered');
select col_type_is('public', 'projects', 'delivered_at', 'timestamp with time zone',
  'The delivery instant is a timestamp with time zone');
select is(
  (select count(*)::int from public.projects where status = 'delivered' and delivered_at is null),
  0,
  'Every delivered project carries its delivery instant'
);
select * from finish();
rollback;
```

- [ ] **Step 2: Write the failing browser assertion**

In `apps/web/tests/e2e/production-workflow.spec.ts`, replace

```ts
    expect(
      (await clientApi.from("projects").select("status").eq("id", fixture.projectId).single()).data
        ?.status,
    ).toBe("delivered");
```

with

```ts
    const delivered = (
      await clientApi
        .from("projects")
        .select("status,delivered_at")
        .eq("id", fixture.projectId)
        .single()
    ).data;
    expect(delivered?.status).toBe("delivered");
    // `mark_project_delivered` stamps the delivery instant for the dashboards.
    expect(Date.now() - new Date(delivered!.delivered_at!).getTime()).toBeLessThan(10 * 60_000);
```

- [ ] **Step 3: Run both to verify they fail**

Run (repository root): `supabase test db supabase/tests/database/project_delivered_at.test.sql`
(if the CLI rejects a path, run `supabase test db` and read this file's lines)
Expected: FAIL, `has_column` and `col_type_is` fail (the column does not exist).

Run (apps/web): `npx playwright test tests/e2e/production-workflow.spec.ts --output=../outputs/pw-delivered-at`
Expected: FAIL at the new assertion (the column is unknown, so `delivered` is null).

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/202609250001_project_delivered_at.sql`:

```sql
-- The instant a project was delivered, for the client and designer dashboards. `updated_at` cannot
-- date a delivery: any later edit rewrites it, including a board move (`board_position`).
alter table public.projects add column delivered_at timestamptz;

-- Projects delivered before this column existed take their last update, the best record left.
update public.projects set delivered_at = updated_at where status = 'delivered' and delivered_at is null;

-- Unchanged from 202609200014_delivery_integrity.sql apart from stamping `delivered_at`.
create or replace function public.mark_project_delivered(p_project_id uuid) returns void language plpgsql security definer set search_path='' as $$
 declare p public.projects; begin
 perform private.assert_agency(); select * into p from public.projects where id=p_project_id for update;
 if found and p.status='delivered' then return; end if;
 if not found or p.status<>'approved' then raise exception 'Approve all deliverables before delivery'; end if;
 if not exists(select 1 from public.delivery_files where project_id=p.id) then raise exception 'Add a delivery file before marking delivered'; end if;
 update public.projects set status='delivered',delivered_at=now(),updated_at=now() where id=p.id;
 perform private.notify_client(p.client_id,p.id,'Your project has been delivered',p.title);
 perform private.audit('project.delivered',p.id);
end $$;
```

Before writing it, confirm with `grep -rn "function public.mark_project_delivered" supabase/migrations`
that `202609200014_delivery_integrity.sql` holds the latest definition; if a later file redefines it,
copy that body instead and add only `delivered_at=now(),`.

- [ ] **Step 5: Apply the migration and regenerate the types**

Run (repository root): `supabase migration up`
Expected: applies `202609250001_project_delivered_at` with no error.

Run (repository root): `supabase gen types typescript --local > supabase/database.types.ts`
Expected: the diff adds `delivered_at` to the `projects` Row/Insert/Update types only.

- [ ] **Step 6: Add the field to the app type**

In `apps/web/features/workspace/workspace-data.ts`, add to `export type Project` after `due_date`:

```ts
  /** When the studio marked the project delivered; null until then. */
  delivered_at: string | null;
```

Run `npm run typecheck`; add `delivered_at: null` to each `Project` literal or factory it reports
(the six test files listed above).

- [ ] **Step 7: Run both to verify they pass**

Run (repository root): `supabase test db supabase/tests/database/project_delivered_at.test.sql`
Expected: PASS, 3 tests. Then `supabase test db` in full: only `access_and_workflows.test.sql` fails
its known 6 overlay assertions (2, 4, 9, 18, 32, 54).

Run (apps/web): `npx playwright test tests/e2e/production-workflow.spec.ts --output=../outputs/pw-delivered-at`
Expected: PASS.

- [ ] **Step 8: Run the gate and commit**

Run: `npm run check` — Expected: PASS.

```bash
git add supabase/migrations/202609250001_project_delivered_at.sql supabase/tests/database/project_delivered_at.test.sql supabase/database.types.ts apps/web/features/workspace/workspace-data.ts apps/web/tests/e2e/production-workflow.spec.ts
# plus each of the six listed test files you edited for `delivered_at: null`, by explicit path
git commit -m "feat(projects): record when a project was delivered"
```

---

### Task 2: Shared groundwork

**Files:**
- Modify: `apps/web/features/reviews/review-data.ts` (receives `isFinished`, `inReviewTab`)
- Modify: `apps/web/features/reviews/reviews-page.tsx` (imports them)
- Modify: `apps/web/features/reviews/review-status.test.ts` (import path)
- Modify: `apps/web/features/reviews/README.md` (where the tab rule lives)
- Create: `apps/web/features/shared/welcome-header.tsx`
- Test: `apps/web/features/shared/welcome-header.test.tsx`
- Modify: `apps/web/app/globals.css` (receives the Overview tiles), `apps/web/features/workspace/workspace.css` (loses them)
- Modify: `apps/web/features/shared/README.md` (the welcome header)

**Interfaces:**
- Produces: `isFinished(status)`, `inReviewTab(tab, row, role)` exported from
  `@/features/reviews/review-data` (same signatures as today);
  `WelcomeHeader({ eyebrow, title, subtitle?, actions?, card? })` and
  `welcomeTitle(displayName: string | null | undefined): string` from
  `@/features/shared/welcome-header`; `.overview-stats` tiles with an optional `<small>` note in
  `globals.css`.

- [ ] **Step 1: Move the review rules out of the page module**

Cut `export const isFinished …`, the `versionStatusTones`-independent `export function inReviewTab …`
and their doc comments from `features/reviews/reviews-page.tsx` and paste them, unchanged, into
`features/reviews/review-data.ts` below `publishedVersionStatus`. In `reviews-page.tsx` import them:
`import { inReviewTab, useReviews } from "./review-data";` (keep `isFinished` imported there only if
the page still uses it). In `review-status.test.ts` change
`import { inReviewTab, isFinished } from "./reviews-page";` to import from `"./review-data"`.
In `features/reviews/README.md`, say the tab rule (`inReviewTab`) lives in `review-data.ts` beside
`publishedVersionStatus`, so other features read it without importing the page.

Run: `npx vitest run features/reviews` — Expected: PASS (same tests, new import path).

- [ ] **Step 2: Write the failing welcome-header test**

Create `apps/web/features/shared/welcome-header.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WelcomeHeader, welcomeTitle } from "./welcome-header";

describe("welcomeTitle", () => {
  it("greets the viewer by the first word of their display name", () => {
    expect(welcomeTitle("Beth Morgan")).toBe("Welcome back, Beth");
    expect(welcomeTitle("  Ana  ")).toBe("Welcome back, Ana");
  });

  it("drops the name when there is none", () => {
    expect(welcomeTitle("")).toBe("Welcome back");
    expect(welcomeTitle(null)).toBe("Welcome back");
  });
});

describe("WelcomeHeader", () => {
  it("shows the role name above the greeting, the subtitle and the actions", () => {
    render(
      <WelcomeHeader
        eyebrow="Overview"
        title="Welcome back, Beth"
        subtitle="Friday, September 25"
        actions={<button type="button">New briefing</button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Welcome back, Beth");
    expect(screen.getByText("Overview")).toHaveClass("eyebrow");
    expect(screen.getByText("Friday, September 25")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New briefing" })).toBeInTheDocument();
  });

  it("uses the client header card on client routes", () => {
    const { container } = render(<WelcomeHeader card eyebrow="Overview" title="Welcome back" />);
    expect(container.querySelector("header")).toHaveClass("page-heading", "client-page-heading");
  });
});
```

Run: `npx vitest run features/shared/welcome-header.test.tsx` — Expected: FAIL (module missing).

- [ ] **Step 3: Write the component**

Create `apps/web/features/shared/welcome-header.tsx`:

```tsx
import type { ReactNode } from "react";

/** "Welcome back, Beth" from "Beth Morgan"; just "Welcome back" when there is no name. */
export function welcomeTitle(displayName: string | null | undefined): string {
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? `Welcome back, ${first}` : "Welcome back";
}

/**
 * The greeting at the top of a dashboard: the page's role name as an eyebrow, the greeting, a
 * subtitle and the page's actions. On a client route it is the white client header card; on `/home`
 * it keeps that page's plain heading. Callers wrap `actions` in their own container.
 */
export function WelcomeHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  card = false,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  card?: boolean;
}) {
  return (
    <header className={card ? "page-heading client-page-heading" : "page-heading"}>
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}
```

Run: `npx vitest run features/shared/welcome-header.test.tsx` — Expected: PASS, 4 tests.

- [ ] **Step 4: Move the Overview tiles to the shared stylesheet**

Cut the rules `.overview-stats`, `.overview-stats > div`, `.overview-stats strong` and
`.overview-stats span` from `features/workspace/workspace.css` and paste them into
`app/globals.css` after the `.eyebrow` rule, under a comment
`/* The Overview number tiles, shared by the studio's /home and the overview dashboards. */`. Add:

```css
.overview-stats small {
  display: block;
  margin-top: 2px;
  color: var(--muted);
  font-size: var(--text-sm);
}
```

Delete the `.overview-stats small { display: none; }` rule inside workspace.css's
`@media (max-width: 1200px)` block (no tile used `<small>` before; the notes must stay visible).

Run: `npx vitest run features/shared/stylesheet-boundary.test.ts features/shared/theme-colors.test.ts`
Expected: PASS.

- [ ] **Step 5: Document and commit**

In `features/shared/README.md` add a short "Welcome header" entry (what it renders, `card`, the
two consumers: `workspace/home-page` and the `overview` feature, and `welcomeTitle`).

Run: `npm run check` — Expected: PASS.

```bash
git add apps/web/features/reviews/review-data.ts apps/web/features/reviews/reviews-page.tsx apps/web/features/reviews/review-status.test.ts apps/web/features/reviews/README.md apps/web/features/shared/welcome-header.tsx apps/web/features/shared/welcome-header.test.tsx apps/web/features/shared/README.md apps/web/app/globals.css apps/web/features/workspace/workspace.css
git commit -m "refactor(shared): share the review tab rule, a welcome header and the overview tiles"
```

---

### Task 3: Overview model

**Files:**
- Create: `apps/web/features/overview/overview-model.ts`
- Test: `apps/web/features/overview/overview-model.test.ts`

**Interfaces:**
- Consumes: `Project` (Task 1), `CreditEntry` from `@/features/credits/credit-model`, `ReviewRow`,
  `inReviewTab`, `publishedVersionStatus` from `@/features/reviews/review-data` (Task 2).
- Produces (Tasks 4–6 use these exact names):
  - `ROW_LIMIT = 5`
  - `deliveredOn(project: Project): string`
  - `relativeAge(date: string, now: Date): string`
  - `bySoonestDue(a: Project, b: Project): number`
  - `type ClientOverview` and `clientOverview(input): ClientOverview`
  - `type RawDesignerVersion`, `type DesignerVersion` and
    `designerVersions(versions, deliverables, projects): DesignerVersion[]`
  - `type DesignerOverview` and `designerOverview(input): DesignerOverview`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/features/overview/overview-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CreditEntry } from "@/features/credits/credit-model";
import type { ReviewRow } from "@/features/reviews/review-data";
import { createDateFormatters, type Project } from "@/features/workspace/workspace-data";
import {
  bySoonestDue,
  clientOverview,
  deliveredOn,
  designerOverview,
  designerVersions,
  relativeAge,
} from "./overview-model";

const now = new Date("2026-09-25T15:00:00Z");
const { formatMonth } = createDateFormatters("America/New_York");

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: overrides.id ?? "p1",
    client_id: "c1",
    campaign_id: null,
    briefing_id: null,
    title: overrides.title ?? "Project",
    description: "",
    status: "in_progress",
    service_type: "social",
    due_date: null,
    delivered_at: null,
    start_date: null,
    board_position: { x: 0, y: 0 },
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function review(overrides: Partial<ReviewRow> = {}): ReviewRow {
  return {
    id: overrides.id ?? "v1",
    projectId: "p1",
    title: "Project",
    deliverable: "Portrait Feed",
    version: 1,
    status: "pending",
    date: "2026-09-20T00:00:00Z",
    note: null,
    internal: false,
    ...overrides,
  };
}

function debit(projectId: string, amount: number): CreditEntry {
  return {
    id: `d-${projectId}`,
    client_id: "c1",
    project_id: projectId,
    amount: -amount,
    balance_after: 0,
    kind: "project_debit",
    description: "",
    created_at: "2026-09-01T00:00:00Z",
  };
}

describe("relativeAge", () => {
  it("names how long ago a date was", () => {
    expect(relativeAge("2026-09-25T09:00:00Z", now)).toBe("today");
    expect(relativeAge("2026-09-24T12:00:00Z", now)).toBe("yesterday");
    expect(relativeAge("2026-09-22T12:00:00Z", now)).toBe("3 days ago");
    expect(relativeAge("2026-09-17T12:00:00Z", now)).toBe("last week");
    expect(relativeAge("2026-09-08T12:00:00Z", now)).toBe("2 weeks ago");
    expect(relativeAge("2026-08-20T12:00:00Z", now)).toBe("last month");
    expect(relativeAge("2026-07-20T12:00:00Z", now)).toBe("2 months ago");
    expect(relativeAge("2025-09-01T12:00:00Z", now)).toBe("last year");
  });

  it("never reads a future instant as ahead", () => {
    expect(relativeAge("2026-09-26T12:00:00Z", now)).toBe("today");
  });
});

describe("deliveredOn", () => {
  it("prefers the delivery instant and falls back to the last update", () => {
    expect(deliveredOn(project({ delivered_at: "2026-09-10T00:00:00Z" }))).toBe(
      "2026-09-10T00:00:00Z",
    );
    expect(deliveredOn(project({ updated_at: "2026-08-02T00:00:00Z" }))).toBe(
      "2026-08-02T00:00:00Z",
    );
  });
});

describe("bySoonestDue", () => {
  it("orders by due date and puts undated work last, newest first", () => {
    const list = [
      project({ id: "none-old", created_at: "2026-01-01T00:00:00Z" }),
      project({ id: "late", due_date: "2026-10-20" }),
      project({ id: "none-new", created_at: "2026-09-01T00:00:00Z" }),
      project({ id: "soon", due_date: "2026-09-30" }),
    ];
    expect(list.toSorted(bySoonestDue).map((item) => item.id)).toEqual([
      "soon",
      "late",
      "none-new",
      "none-old",
    ]);
  });
});

describe("clientOverview", () => {
  const input = {
    projects: [
      project({ id: "a", status: "in_progress", due_date: "2026-10-01" }),
      project({ id: "b", status: "client_review", due_date: "2026-09-28" }),
      project({ id: "c", status: "delivered", delivered_at: "2026-09-03T12:00:00Z" }),
      // 02:00 UTC on Sep 1 is still August 31 in New York.
      project({ id: "d", status: "delivered", delivered_at: "2026-09-01T02:00:00Z" }),
    ],
    briefings: [{ status: "awaiting_review" }, { status: "budget_confirmed" }, { status: "draft" }],
    ledger: [debit("a", 12), debit("c", 3)],
    balance: 85,
    reviews: [
      review({ id: "wait-new", date: "2026-09-24T00:00:00Z" }),
      review({ id: "wait-old", date: "2026-09-10T00:00:00Z" }),
      review({ id: "internal", status: "pending", internal: true }),
      review({ id: "sent-back", status: "changes_requested" }),
    ],
    now,
    formatMonth,
  };

  it("counts credits, active work, this month's deliveries and waiting reviews", () => {
    const overview = clientOverview(input);
    expect(overview.credits).toEqual({ remaining: 85, used: 15, total: 100 });
    expect(overview.active).toBe(2);
    expect(overview.deliveredThisMonth).toBe(1);
    expect(overview.needsReview).toBe(2);
    expect(overview.inFlight).toEqual({ withStudio: 2, inProgress: 1, delivered: 2 });
    expect(overview.creditsByProject.get("a")).toBe(12);
  });

  it("orders each column and keeps internal rows out", () => {
    const overview = clientOverview(input);
    expect(overview.moving.map((item) => item.id)).toEqual(["b", "a"]);
    expect(overview.yourTurn.map((row) => row.id)).toEqual(["wait-old", "wait-new"]);
    expect(overview.shipped.map((item) => item.id)).toEqual(["c", "d"]);
  });

  it("shows at most five rows per column", () => {
    const many = Array.from({ length: 8 }, (_, index) => project({ id: `p${index}` }));
    expect(clientOverview({ ...input, projects: many }).moving).toHaveLength(5);
  });
});

describe("designerVersions and designerOverview", () => {
  const projects = [
    project({ id: "p1", title: "Launch", status: "changes_requested", due_date: "2026-10-02" }),
    project({ id: "p2", title: "Guide", status: "internal_review" }),
    project({ id: "p3", title: "Poster", status: "delivered", delivered_at: "2026-09-12T00:00:00Z" }),
  ];
  const raw = [
    { id: "v1", project_id: "p1", deliverable_id: "d1", version_number: 1, status: "approved", created_at: "2026-09-01T00:00:00Z" },
    // The client sent the project back after this version was shared.
    { id: "v2", project_id: "p1", deliverable_id: "d1", version_number: 2, status: "reviewed", created_at: "2026-09-20T00:00:00Z" },
    { id: "v3", project_id: "p2", deliverable_id: "d2", version_number: 1, status: "submitted", created_at: "2026-09-22T00:00:00Z" },
  ];
  const deliverables = [
    { id: "d1", name: "Portrait Feed" },
    { id: "d2", name: "Story" },
  ];

  it("keeps each deliverable's latest version and reads a sent-back share as changes requested", () => {
    expect(designerVersions(raw, deliverables, projects)).toEqual([
      { id: "v2", projectId: "p1", title: "Launch", deliverable: "Portrait Feed", version: 2, status: "changes_requested", date: "2026-09-20T00:00:00Z" },
      { id: "v3", projectId: "p2", title: "Guide", deliverable: "Story", version: 1, status: "submitted", date: "2026-09-22T00:00:00Z" },
    ]);
  });

  it("counts the designer's work", () => {
    const overview = designerOverview({
      projects,
      versions: designerVersions(raw, deliverables, projects),
      now,
      formatMonth,
    });
    expect(overview).toMatchObject({ active: 2, yourTurn: 1, inStudioReview: 1, deliveredThisMonth: 1 });
    expect(overview.moving.map((item) => item.id)).toEqual(["p1", "p2"]);
    expect(overview.yourTurnRows.map((row) => row.id)).toEqual(["v2"]);
    expect(overview.delivered.map((item) => item.id)).toEqual(["p3"]);
  });
});
```

Run: `npx vitest run features/overview/overview-model.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 2: Write the model**

Create `apps/web/features/overview/overview-model.ts`:

```ts
import type { CreditEntry } from "@/features/credits/credit-model";
import { inReviewTab, publishedVersionStatus, type ReviewRow } from "@/features/reviews/review-data";
import type { Project } from "@/features/workspace/workspace-data";

/** Rows per dashboard column; "See all" leads to the full list. */
export const ROW_LIMIT = 5;

const DAY = 86_400_000;
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** When a delivered project shipped: its delivery instant, else its last update (older rows). */
export function deliveredOn(project: Project): string {
  return project.delivered_at ?? project.updated_at;
}

/** "today", "yesterday", "3 days ago", "last week", "2 months ago" … never a future phrase. */
export function relativeAge(date: string, now: Date): string {
  const days = Math.max(0, Math.floor((now.getTime() - new Date(date).getTime()) / DAY));
  if (days < 7) return relative.format(-days, "day");
  if (days < 30) return relative.format(-Math.floor(days / 7), "week");
  if (days < 365) return relative.format(-Math.floor(days / 30), "month");
  return relative.format(-Math.floor(days / 365), "year");
}

/** Soonest due first; undated projects last, newest first among themselves. */
export function bySoonestDue(a: Project, b: Project): number {
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return b.created_at.localeCompare(a.created_at);
}

const newestDelivery = (a: Project, b: Project) => deliveredOn(b).localeCompare(deliveredOn(a));
const inProgress = new Set(["planned", "in_progress", "internal_review", "changes_requested"]);
const withStudio = new Set(["awaiting_review", "budget_confirmed"]);

type MonthFormatter = (date: string | null) => string;

export type ClientOverview = {
  credits: { remaining: number; used: number; total: number };
  active: number;
  deliveredThisMonth: number;
  needsReview: number;
  inFlight: { withStudio: number; inProgress: number; delivered: number };
  moving: Project[];
  yourTurn: ReviewRow[];
  shipped: Project[];
  creditsByProject: Map<string, number>;
};

/**
 * Everything the client Overview shows. Reviews go through the client's own **Waiting for you**
 * rule (`inReviewTab`), which also drops every internal row, so the studio's view of this page
 * shows exactly what the client sees.
 */
export function clientOverview(input: {
  projects: Project[];
  briefings: { status: string }[];
  ledger: CreditEntry[];
  balance: number;
  reviews: ReviewRow[];
  now: Date;
  formatMonth: MonthFormatter;
}): ClientOverview {
  const active = input.projects.filter((project) => project.status !== "delivered");
  const delivered = input.projects.filter((project) => project.status === "delivered");
  const month = input.formatMonth(input.now.toISOString());
  const creditsByProject = new Map<string, number>();
  let used = 0;
  for (const entry of input.ledger) {
    if (entry.kind !== "project_debit") continue;
    used -= entry.amount;
    if (entry.project_id)
      creditsByProject.set(entry.project_id, (creditsByProject.get(entry.project_id) ?? 0) - entry.amount);
  }
  const waiting = input.reviews.filter((row) => inReviewTab("waiting", row, "client"));
  return {
    credits: { remaining: input.balance, used, total: input.balance + used },
    active: active.length,
    deliveredThisMonth: delivered.filter((project) => input.formatMonth(deliveredOn(project)) === month)
      .length,
    needsReview: waiting.length,
    inFlight: {
      withStudio: input.briefings.filter((briefing) => withStudio.has(briefing.status)).length,
      inProgress: active.filter((project) => inProgress.has(project.status)).length,
      delivered: delivered.length,
    },
    moving: active.toSorted(bySoonestDue).slice(0, ROW_LIMIT),
    yourTurn: waiting.toSorted((a, b) => a.date.localeCompare(b.date)).slice(0, ROW_LIMIT),
    shipped: delivered.toSorted(newestDelivery).slice(0, ROW_LIMIT),
    creditsByProject,
  };
}

export type RawDesignerVersion = {
  id: string;
  project_id: string;
  deliverable_id: string;
  version_number: number;
  status: string;
  created_at: string;
};

export type DesignerVersion = {
  id: string;
  projectId: string;
  title: string;
  deliverable: string;
  version: number;
  status: string;
  date: string;
};

/**
 * Each deliverable's latest version on the designer's projects. A version shared with the client
 * takes the client's decision from its project (`publishedVersionStatus`), so a share the client
 * sent back reads as changes requested.
 */
export function designerVersions(
  versions: RawDesignerVersion[],
  deliverables: { id: string; name: string }[],
  projects: Project[],
): DesignerVersion[] {
  const latest = new Map<string, RawDesignerVersion>();
  for (const version of versions) {
    const current = latest.get(version.deliverable_id);
    if (!current || current.version_number < version.version_number)
      latest.set(version.deliverable_id, version);
  }
  return [...latest.values()].flatMap((version) => {
    const project = projects.find((item) => item.id === version.project_id);
    if (!project) return [];
    return [
      {
        id: version.id,
        projectId: project.id,
        title: project.title,
        deliverable: deliverables.find((item) => item.id === version.deliverable_id)?.name ?? "Deliverable",
        version: version.version_number,
        status: publishedVersionStatus(version.status, project.status),
        date: version.created_at,
      },
    ];
  });
}

export type DesignerOverview = {
  active: number;
  yourTurn: number;
  inStudioReview: number;
  deliveredThisMonth: number;
  moving: Project[];
  yourTurnRows: DesignerVersion[];
  delivered: Project[];
};

/** Everything the designer's `/home` shows, over the projects their assignments admit. */
export function designerOverview(input: {
  projects: Project[];
  versions: DesignerVersion[];
  now: Date;
  formatMonth: MonthFormatter;
}): DesignerOverview {
  const active = input.projects.filter((project) => project.status !== "delivered");
  const delivered = input.projects.filter((project) => project.status === "delivered");
  const month = input.formatMonth(input.now.toISOString());
  const sentBack = input.versions.filter((version) => version.status === "changes_requested");
  return {
    active: active.length,
    yourTurn: sentBack.length,
    inStudioReview: input.versions.filter((version) => version.status === "submitted").length,
    deliveredThisMonth: delivered.filter((project) => input.formatMonth(deliveredOn(project)) === month)
      .length,
    moving: active.toSorted(bySoonestDue).slice(0, ROW_LIMIT),
    yourTurnRows: sentBack.toSorted((a, b) => a.date.localeCompare(b.date)).slice(0, ROW_LIMIT),
    delivered: delivered.toSorted(newestDelivery).slice(0, ROW_LIMIT),
  };
}
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `npx vitest run features/overview/overview-model.test.ts`
Expected: PASS. If `relativeAge`'s Intl output differs (for example "1 week ago" instead of
"last week"), the runtime is ignoring `numeric: "auto"`: report it rather than changing the
expectations.

- [ ] **Step 4: Run the gate and commit**

Run: `npm run check` — Expected: PASS.

```bash
git add apps/web/features/overview/overview-model.ts apps/web/features/overview/overview-model.test.ts
git commit -m "feat(overview): compute the client and designer dashboard figures"
```

---

### Task 4: Client Overview page

**Files:**
- Create: `apps/web/app/(workspace)/clients/[clientId]/overview/page.tsx`
- Create: `apps/web/features/overview/client-overview-page.tsx`
- Create: `apps/web/features/overview/overview-panel.tsx`
- Create: `apps/web/features/overview/overview.css`
- Test: `apps/web/features/overview/client-overview-page.test.tsx`
- Create: `apps/web/features/overview/README.md`

**Interfaces:**
- Consumes: Task 2's `WelcomeHeader`, `welcomeTitle`, `.overview-stats`; Task 3's `clientOverview`,
  `relativeAge`, `deliveredOn`; `useClients`, `useProjects`, `useDateFormat`, `statusLabels`,
  `projectStatusTones` (workspace), `useBriefings` (briefings), `useCreditAccount`,
  `useCreditLedger` (credits), `useReviews` (reviews), `statusToneClass`, `PageStatus`.
- Produces: `ClientOverviewPage({ clientId })`; `OverviewPanel({ eyebrow, title, seeAll?, empty, children })`;
  CSS classes `.overview-page`, `.overview-flight`, `.overview-columns`, `.overview-panel`,
  `.overview-panel-head`, `.overview-see-all`, `.overview-row`, `.overview-row-meta`,
  `.overview-empty` (Task 6 reuses them).

- [ ] **Step 1: Write the failing component test**

Create `apps/web/features/overview/client-overview-page.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/features/workspace/workspace-data";

/** The number tiles only: panel eyebrows repeat some of their labels. */
const tiles = () => within(document.querySelector(".overview-stats") as HTMLElement);
const replace = vi.fn();
const viewer = vi.hoisted(() => ({ role: "client", display_name: "Beth Morgan" }));
const data = vi.hoisted(() => ({
  projects: [] as Project[],
  reviews: [] as unknown[],
}));
const query = (value: unknown) => ({ data: value, isPending: false, error: null, refetch: vi.fn() });

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => ({ profile: viewer }) }));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/workspace/workspace-data")>();
  return {
    ...actual,
    useClients: () => query([{ id: "c1", name: "SABRE" }]),
    useProjects: () => query(data.projects),
    useDateFormat: () => actual.createDateFormatters("UTC"),
  };
});
vi.mock("@/features/briefings/briefing-data", () => ({
  useBriefings: () => query([{ status: "awaiting_review" }]),
}));
vi.mock("@/features/credits/credit-data", () => ({
  useCreditAccount: () => query({ balance: 40 }),
  useCreditLedger: () =>
    query([{ id: "l1", client_id: "c1", project_id: "p1", amount: -10, balance_after: 40, kind: "project_debit", description: "", created_at: "2026-09-01T00:00:00Z" }]),
}));
vi.mock("@/features/reviews/review-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/reviews/review-data")>()),
  useReviews: () => query(data.reviews),
}));

import { ClientOverviewPage } from "./client-overview-page";

const project = (overrides: Partial<Project>): Project => ({
  id: "p1", client_id: "c1", campaign_id: null, briefing_id: null, title: "Campus Welcome",
  description: "", status: "client_review", service_type: "social", due_date: "2026-09-30",
  delivered_at: null, start_date: null, board_position: { x: 0, y: 0 },
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-25T15:00:00Z"));
  viewer.role = "client";
  data.projects = [project({}), project({ id: "p2", title: "Holiday Poster", status: "delivered", delivered_at: "2026-09-20T00:00:00Z" })];
  data.reviews = [
    { id: "v1", projectId: "p1", title: "Campus Welcome", deliverable: "Portrait Feed", version: 2, status: "pending", date: "2026-09-17T00:00:00Z", note: null, internal: false },
    { id: "v2", projectId: "p1", title: "Studio-only draft", deliverable: "Story", version: 1, status: "pending", date: "2026-09-20T00:00:00Z", note: null, internal: true },
  ];
});
afterEach(() => vi.useRealTimers());

describe("ClientOverviewPage", () => {
  it("greets the client and shows their numbers", () => {
    render(<ClientOverviewPage clientId="c1" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Welcome back, Beth");
    expect(tiles().getByText("Credits remaining").closest("div")).toHaveTextContent("40");
    expect(tiles().getByText("10 of 50 used")).toBeInTheDocument();
    expect(tiles().getByText("Active projects").closest("div")).toHaveTextContent("1");
    expect(tiles().getByText("1 delivered this month")).toBeInTheDocument();
    expect(tiles().getByText("Needs your review").closest("div")).toHaveTextContent("1");
    expect(screen.getByRole("link", { name: /New briefing/ })).toHaveAttribute("href", "/clients/c1/briefings/new");
  });

  it("lists the client's turn with its age and never an internal version", () => {
    render(<ClientOverviewPage clientId="c1" />);
    expect(screen.getByText("Review · last week")).toBeInTheDocument();
    expect(screen.getByText("Campus Welcome · Portrait Feed")).toBeInTheDocument();
    expect(screen.queryByText(/Studio-only draft/)).not.toBeInTheDocument();
    expect(screen.getByText("Holiday Poster")).toBeInTheDocument();
  });

  it("tells the studio whose view it is", () => {
    viewer.role = "agency";
    render(<ClientOverviewPage clientId="c1" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("What SABRE sees");
  });

  it("sends a designer to the client's board", () => {
    viewer.role = "designer";
    render(<ClientOverviewPage clientId="c1" />);
    expect(replace).toHaveBeenCalledWith("/clients/c1/board");
  });
});
```

Run: `npx vitest run features/overview/client-overview-page.test.tsx` — Expected: FAIL (module missing).

- [ ] **Step 2: Write the panel**

Create `apps/web/features/overview/overview-panel.tsx`:

```tsx
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Children, useId, type ReactNode } from "react";

/** One dashboard column: an eyebrow, a title, an optional "See all" and up to five one-line rows. */
export function OverviewPanel({
  eyebrow,
  title,
  seeAll,
  empty,
  children,
}: {
  eyebrow: string;
  title: string;
  seeAll?: string;
  empty: string;
  children?: ReactNode;
}) {
  const id = useId();
  const rows = Children.toArray(children);
  return (
    <section className="overview-panel" aria-labelledby={id}>
      <header className="overview-panel-head">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2 id={id}>{title}</h2>
        </div>
        {seeAll && (
          <Link className="overview-see-all" href={seeAll}>
            See all <ArrowRight size={14} />
          </Link>
        )}
      </header>
      {rows.length ? rows : <p className="overview-empty">{empty}</p>}
    </section>
  );
}
```

- [ ] **Step 3: Write the page**

Create `apps/web/features/overview/client-overview-page.tsx`:

```tsx
"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useBriefings } from "@/features/briefings/briefing-data";
import { useCreditAccount, useCreditLedger } from "@/features/credits/credit-data";
import { useReviews } from "@/features/reviews/review-data";
import { PageStatus } from "@/features/shared/page-status";
import { statusToneClass } from "@/features/shared/status-tone";
import { WelcomeHeader, welcomeTitle } from "@/features/shared/welcome-header";
import {
  projectStatusTones,
  statusLabels,
  useClients,
  useDateFormat,
  useProjects,
} from "@/features/workspace/workspace-data";
import { clientOverview, deliveredOn, relativeAge } from "./overview-model";
import { OverviewPanel } from "./overview-panel";
import "./overview.css";

/** The client's welcome page: their numbers, what is moving, their turn and what shipped. */
export function ClientOverviewPage({ clientId }: { clientId: string }) {
  const { profile } = useAuth();
  const router = useRouter();
  const clients = useClients();
  const projects = useProjects(clientId);
  const briefings = useBriefings(clientId);
  const account = useCreditAccount(clientId);
  const ledger = useCreditLedger(clientId);
  const reviews = useReviews(clientId);
  const { formatDate, formatMonth, formatWeekdayDate } = useDateFormat();
  // Designers have no Overview destination; one typed by hand opens the client's board.
  useEffect(() => {
    if (profile?.role === "designer") router.replace(`/clients/${clientId}/board`);
  }, [profile?.role, clientId, router]);
  const reads = [clients, projects, briefings, account, ledger, reviews];
  if (profile?.role === "designer" || reads.some((read) => read.isPending))
    return <PageStatus>Loading your overview…</PageStatus>;
  const client = clients.data?.find((item) => item.id === clientId);
  if (!client || reads.some((read) => read.error))
    return (
      <div className="page-content">
        <h1>Overview unavailable.</h1>
        <p>Your overview could not be loaded. Please try again.</p>
        <button className="button" onClick={() => reads.forEach((read) => void read.refetch())}>
          Try again
        </button>
      </div>
    );
  const now = new Date();
  const overview = clientOverview({
    projects: projects.data ?? [],
    briefings: briefings.data ?? [],
    ledger: ledger.data ?? [],
    balance: account.data?.balance ?? 0,
    reviews: reviews.data ?? [],
    now,
    formatMonth,
  });
  const studio = profile?.role === "agency";
  const projectHref = (id: string) => `/projects/${id}?channel=client`;
  return (
    <div className="page-content overview-page">
      <WelcomeHeader
        card
        eyebrow="Overview"
        title={studio ? `What ${client.name} sees` : welcomeTitle(profile?.display_name)}
        subtitle={
          studio ? "This client's overview, as they see it." : formatWeekdayDate(now.toISOString())
        }
        actions={
          <div className="page-actions">
            <Link className="button primary" href={`/clients/${clientId}/briefings/new`}>
              <Plus size={16} />
              New briefing
            </Link>
          </div>
        }
      />
      <div className="overview-stats">
        <div>
          <strong>{overview.credits.remaining}</strong>
          <span>Credits remaining</span>
          <small>
            {overview.credits.used} of {overview.credits.total} used
          </small>
        </div>
        <div>
          <strong>{overview.active}</strong>
          <span>Active projects</span>
          <small>{overview.deliveredThisMonth} delivered this month</small>
        </div>
        <div>
          <strong>{overview.needsReview}</strong>
          <span>Needs your review</span>
          <small>awaiting your feedback</small>
        </div>
      </div>
      <section className="overview-flight" aria-label="In flight">
        <span className="eyebrow">In flight</span>
        <span>
          <strong>{overview.inFlight.withStudio}</strong> with the studio
        </span>
        <span>
          <strong>{overview.inFlight.inProgress}</strong> in progress
        </span>
        <span>
          <strong>{overview.inFlight.delivered}</strong> delivered
        </span>
      </section>
      <div className="overview-columns">
        <OverviewPanel
          eyebrow="Active projects"
          title="What's moving"
          seeAll={`/clients/${clientId}/board`}
          empty="Nothing in production right now."
        >
          {overview.moving.map((project) => {
            const credits = overview.creditsByProject.get(project.id);
            return (
              <Link key={project.id} className="overview-row" href={projectHref(project.id)}>
                <strong>{project.title}</strong>
                <span className="overview-row-meta">
                  {credits ? `${credits} credits · ` : ""}Due{" "}
                  {formatDate(project.due_date, "not set")}
                </span>
                <span className={statusToneClass(projectStatusTones[project.status])}>
                  {statusLabels[project.status]}
                </span>
              </Link>
            );
          })}
        </OverviewPanel>
        <OverviewPanel
          eyebrow="Needs you"
          title="Your turn"
          seeAll={`/clients/${clientId}/reviews`}
          empty="Nothing waiting on you."
        >
          {overview.yourTurn.map((row) => (
            <Link key={row.id} className="overview-row" href={projectHref(row.projectId)}>
              <strong>
                {row.title} · {row.deliverable}
              </strong>
              <span className="overview-row-meta">Review · {relativeAge(row.date, now)}</span>
            </Link>
          ))}
        </OverviewPanel>
        <OverviewPanel
          eyebrow="Delivered"
          title="Recently shipped"
          seeAll={`/clients/${clientId}/board`}
          empty="Delivered work will appear here."
        >
          {overview.shipped.map((project) => (
            <Link key={project.id} className="overview-row" href={projectHref(project.id)}>
              <strong>{project.title}</strong>
              <span className="overview-row-meta">{formatDate(deliveredOn(project))}</span>
            </Link>
          ))}
        </OverviewPanel>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Style it**

Create `apps/web/features/overview/overview.css`:

```css
/* The welcome dashboards: client Overview and designer /home (features/overview). */
.overview-page .overview-stats {
  margin-bottom: var(--space-md);
}
.overview-flight {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-sm) var(--space-lg);
  margin-bottom: var(--space-section);
  padding: var(--space-md) var(--space-lg);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--muted);
  font-size: var(--text-base);
}
.overview-flight strong {
  margin-right: 4px;
  color: var(--ink);
  font-size: var(--text-section);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.overview-columns {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-md);
  align-items: start;
}
.overview-panel {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}
.overview-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--border);
}
.overview-panel-head h2 {
  margin: 2px 0 0;
  font-size: var(--text-section);
  font-weight: 600;
}
.overview-see-all {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--muted);
  font-size: var(--text-base);
  white-space: nowrap;
}
.overview-see-all:hover {
  color: var(--foreground);
}
/* One line of title with a quieter line below, and a status badge at the right when it has one. */
.overview-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: var(--space-sm);
  align-items: center;
  min-height: 56px;
  padding: 10px var(--space-lg);
  border-bottom: 1px solid var(--border);
  color: var(--muted);
}
.overview-row:last-child {
  border-bottom: 0;
}
.overview-row:hover {
  background: var(--surface-hover);
}
.overview-row:focus-visible {
  outline-offset: -3px;
}
.overview-row > strong {
  overflow: hidden;
  color: var(--ink);
  font-size: var(--text-lg);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.overview-row-meta {
  grid-column: 1;
  overflow: hidden;
  font-size: var(--text-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.overview-row > .status-badge {
  grid-column: 2;
  grid-row: 1 / span 2;
}
.overview-empty {
  margin: 0;
  padding: var(--space-lg);
  color: var(--muted);
  font-size: var(--text-base);
}
@media (max-width: 1000px) {
  .overview-columns {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 5: Add the route**

Create `apps/web/app/(workspace)/clients/[clientId]/overview/page.tsx`:

```tsx
import { ClientOverviewPage } from "@/features/overview/client-overview-page";
export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return <ClientOverviewPage key={clientId} clientId={clientId} />;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run features/overview features/shared/stylesheet-boundary.test.ts features/shared/theme-colors.test.ts`
Expected: PASS.

- [ ] **Step 7: Document and commit**

Create `apps/web/features/overview/README.md` describing: the feature's purpose; the client Overview
(route, numbers and their definitions from the spec, in-flight strip, the three columns and their
ordering, "See all" targets, the studio's "What <client> sees" view, the designer redirect); the
isolation rule (client channel only, internal rows dropped by `inReviewTab`); `overview-model.ts`
(pure) and `overview-data.ts` (added in Task 6); `deliveredOn`'s fallback; verification commands.

Run: `npm run check` — Expected: PASS.

```bash
git add "apps/web/app/(workspace)/clients/[clientId]/overview/page.tsx" apps/web/features/overview/client-overview-page.tsx apps/web/features/overview/client-overview-page.test.tsx apps/web/features/overview/overview-panel.tsx apps/web/features/overview/overview.css apps/web/features/overview/README.md
git commit -m "feat(overview): add the client Overview page"
```

---

### Task 5: Navigation and landing

**Files:**
- Modify: `apps/web/features/workspace/client-navigation.tsx`
- Test: `apps/web/features/workspace/client-navigation.test.tsx` (create)
- Modify: `apps/web/features/workspace/home-page.tsx` (single-workspace redirect target)
- Modify: `apps/web/features/workspace/client-switcher.tsx` (single-workspace link)
- Modify: `apps/web/tests/e2e/test-support.ts`, `workspace.spec.ts`, `client-navigation.spec.ts`,
  `client-pages-layout.spec.ts`
- Modify: `apps/web/features/workspace/README.md`

**Interfaces:**
- Consumes: the `/clients/:id/overview` route (Task 4).
- Produces: "Overview" as the first client destination for the agency and clients.

- [ ] **Step 1: Write the failing navigation test**

Create `apps/web/features/workspace/client-navigation.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "./workspace-data";

vi.mock("next/navigation", () => ({ usePathname: () => "/clients/c1/overview" }));

import { ClientNavigation } from "./client-navigation";

const client = { id: "c1", name: "SABRE" } as Client;
const labels = () =>
  within(screen.getByRole("navigation", { name: "SABRE navigation" }))
    .getAllByRole("link")
    .map((link) => link.textContent);

describe("ClientNavigation", () => {
  it("opens with Overview for clients and the studio", () => {
    render(<ClientNavigation client={client} role="client" />);
    expect(labels()).toEqual(["Overview", "Board", "Briefings", "Reviews", "Files", "Brand Hub", "Credits"]);
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/clients/c1/overview");
  });

  it("keeps designers on their five destinations", () => {
    render(<ClientNavigation client={client} role="designer" />);
    expect(labels()).toEqual(["Board", "Briefings", "Reviews", "Files", "Brand Hub"]);
  });
});
```

Run: `npx vitest run features/workspace/client-navigation.test.tsx` — Expected: FAIL (no Overview link).

- [ ] **Step 2: Add the destination**

In `client-navigation.tsx`, make the list start with Overview for everyone but designers:

```tsx
  const destinations = [
    ...(role !== "designer" ? [{ path: "overview", label: "Overview" }] : []),
    { path: "board", label: "Board" },
    { path: "briefings", label: "Briefings" },
    { path: "reviews", label: "Reviews" },
    { path: "assets", label: "Files" },
    { path: "brand/overview", label: "Brand Hub" },
    ...(role !== "designer" ? [{ path: "credits", label: "Credits" }] : []),
  ];
```

The existing active rule (`pathname.includes(`/clients/${client.id}/${path.split("/")[0]}`)`)
already marks Overview; `brand/overview` does not collide because it tests `/clients/c1/brand`.

Run: `npx vitest run features/workspace/client-navigation.test.tsx` — Expected: PASS.

- [ ] **Step 3: Land on the Overview**

- `home-page.tsx`: change `router.replace(`/clients/${clients.data[0].id}/board`)` to
  `router.replace(`/clients/${clients.data[0].id}/overview`)`. Leave every other branch as it is (a
  client in several workspaces still gets `/home`).
- `client-switcher.tsx`: the single-workspace link should open the Overview for clients and the
  studio and the Board for designers. Read the viewer with
  `const { profile } = useAuth();` (import from `@/features/auth/auth-provider`) and use
  `href={`/clients/${clients[0].id}/${profile?.role === "designer" ? "board" : "overview"}`}`.

- [ ] **Step 4: Update the browser tests**

- `tests/e2e/test-support.ts` `signIn`: `await expect(page).toHaveURL(/\/(home|clients\/[^/]+\/(board|overview))$/);`
- `tests/e2e/workspace.spec.ts`, test "client sees only its own workspace…": replace
  `await expect(page).toHaveURL(/\/clients\/[^/]+\/board$/);` with

```ts
  await expect(page).toHaveURL(/\/clients\/[^/]+\/overview$/);
  await page
    .getByRole("navigation", { name: "SABRE navigation", exact: true })
    .getByRole("link", { name: "Board", exact: true })
    .click();
  await expect(page).toHaveURL(/\/clients\/[^/]+\/board$/);
```

- `tests/e2e/client-navigation.spec.ts`: both `.toHaveCount(6)` on the SABRE navigation links become
  `.toHaveCount(7)` (the client's list and the studio's list both gain Overview).
- `tests/e2e/client-pages-layout.spec.ts`: add `["Overview", "overview"],` as the first entry of the
  `[label, route]` list, so the new page passes the same header and layout checks.

Run: `npx playwright test tests/e2e/client-navigation.spec.ts tests/e2e/client-pages-layout.spec.ts tests/e2e/workspace.spec.ts --output=../outputs/pw-overview-nav`
Expected: `client-navigation` and `client-pages-layout` pass; `workspace.spec.ts` passes its client
test and fails only on the SABRE overlay's known counts.

- [ ] **Step 5: Document and commit**

`features/workspace/README.md`: the client navigation now starts with Overview (agency and clients),
a single-workspace client lands on it after sign-in, and the sidebar's single-workspace link opens it
(the Board for designers).

Run: `npm run check` — Expected: PASS.

```bash
git add apps/web/features/workspace/client-navigation.tsx apps/web/features/workspace/client-navigation.test.tsx apps/web/features/workspace/home-page.tsx apps/web/features/workspace/client-switcher.tsx apps/web/features/workspace/README.md apps/web/tests/e2e/test-support.ts apps/web/tests/e2e/workspace.spec.ts apps/web/tests/e2e/client-navigation.spec.ts apps/web/tests/e2e/client-pages-layout.spec.ts
git commit -m "feat(overview): open the client workspace on its Overview"
```

---

### Task 6: Designer home and the studio's greeting

**Files:**
- Create: `apps/web/features/overview/overview-data.ts`
- Create: `apps/web/features/overview/designer-overview.tsx`
- Test: `apps/web/features/overview/designer-overview.test.tsx`
- Modify: `apps/web/features/workspace/home-page.tsx`
- Modify: `apps/web/tests/e2e/canonical-workspaces.spec.ts`
- Modify: `apps/web/features/overview/README.md`, `apps/web/features/workspace/README.md`

**Interfaces:**
- Consumes: Task 3's `designerVersions`, `designerOverview`, `relativeAge`, `deliveredOn`,
  `RawDesignerVersion`; Task 4's `OverviewPanel` and CSS; Task 2's `WelcomeHeader`, `welcomeTitle`.
- Produces: `useDesignerVersions(projectIds: string[] | undefined)` returning
  `{ versions: RawDesignerVersion[]; deliverables: { id: string; name: string }[] }`;
  `DesignerOverview()`.

- [ ] **Step 1: Write the failing component test**

Create `apps/web/features/overview/designer-overview.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/features/workspace/workspace-data";

const tiles = () => within(document.querySelector(".overview-stats") as HTMLElement);
const query = (value: unknown) => ({ data: value, isPending: false, error: null, refetch: vi.fn() });
const project = (overrides: Partial<Project>): Project => ({
  id: "p1", client_id: "c1", campaign_id: null, briefing_id: null, title: "Launch",
  description: "", status: "changes_requested", service_type: "social", due_date: "2026-10-02",
  delivered_at: null, start_date: null, board_position: { x: 0, y: 0 },
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", ...overrides,
});

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ profile: { role: "designer", display_name: "Alex Morgan" } }),
}));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/workspace/workspace-data")>();
  return {
    ...actual,
    useClients: () => query([{ id: "c1", name: "SABRE" }]),
    useProjects: () => query([project({})]),
    useDateFormat: () => actual.createDateFormatters("UTC"),
  };
});
vi.mock("./overview-data", () => ({
  useDesignerVersions: () =>
    query({
      versions: [{ id: "v1", project_id: "p1", deliverable_id: "d1", version_number: 2, status: "reviewed", created_at: "2026-09-23T00:00:00Z" }],
      deliverables: [{ id: "d1", name: "Portrait Feed" }],
    }),
}));

import { DesignerOverview } from "./designer-overview";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-25T15:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("DesignerOverview", () => {
  it("greets the designer and lists their turn without credits", () => {
    render(<DesignerOverview />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Welcome back, Alex");
    expect(screen.getByText("My work")).toHaveClass("eyebrow");
    expect(tiles().getByText("Your turn").closest("div")).toHaveTextContent("1");
    expect(screen.getByText("Changes requested · 2 days ago")).toBeInTheDocument();
    expect(screen.getByText("Launch · Portrait Feed")).toBeInTheDocument();
    expect(screen.queryByText(/credit/i)).not.toBeInTheDocument();
  });
});
```

Run: `npx vitest run features/overview/designer-overview.test.tsx` — Expected: FAIL (module missing).

- [ ] **Step 2: Write the data hook**

Create `apps/web/features/overview/overview-data.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult } from "@/lib/supabase";
import type { RawDesignerVersion } from "./overview-model";

/**
 * The only Supabase access this feature owns: the design versions and deliverable names of a
 * designer's projects. Row-level security already limits both to their assignments; the client
 * Overview reuses the workspace, briefing, credit and review hooks instead.
 */
export function useDesignerVersions(projectIds: string[] | undefined) {
  const { database, profile, session } = useAuth();
  return useQuery({
    queryKey: ["overview-designer-versions", session?.user.id, projectIds?.join(",") ?? ""],
    enabled: !!session && profile?.role === "designer" && !!projectIds,
    queryFn: async () => {
      if (!projectIds?.length) return { versions: [], deliverables: [] };
      const [versions, deliverables] = await Promise.all([
        database
          .from("design_versions")
          .select("id,project_id,deliverable_id,version_number,status,created_at")
          .in("project_id", projectIds),
        database.from("deliverables").select("id,name").in("project_id", projectIds),
      ]);
      return {
        versions: assertResult(versions) as RawDesignerVersion[],
        deliverables: assertResult(deliverables),
      };
    },
    refetchInterval: 30_000,
  });
}
```

- [ ] **Step 3: Write the dashboard**

Create `apps/web/features/overview/designer-overview.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useAuth } from "@/features/auth/auth-provider";
import { PageStatus } from "@/features/shared/page-status";
import { statusToneClass } from "@/features/shared/status-tone";
import { WelcomeHeader, welcomeTitle } from "@/features/shared/welcome-header";
import {
  projectStatusTones,
  statusLabels,
  useClients,
  useDateFormat,
  useProjects,
} from "@/features/workspace/workspace-data";
import { useDesignerVersions } from "./overview-data";
import { deliveredOn, designerOverview, designerVersions, relativeAge } from "./overview-model";
import { OverviewPanel } from "./overview-panel";
import "./overview.css";

/** A designer's `/home`: their assigned work across clients, and what is waiting on them. */
export function DesignerOverview() {
  const { profile } = useAuth();
  const clients = useClients();
  const projects = useProjects();
  const versions = useDesignerVersions(projects.data?.map((project) => project.id));
  const { formatDate, formatMonth, formatWeekdayDate } = useDateFormat();
  const reads = [clients, projects, versions];
  if (reads.some((read) => read.isPending)) return <PageStatus>Loading your work…</PageStatus>;
  if (reads.some((read) => read.error))
    return (
      <div className="page-content">
        <h1>We couldn’t load your work.</h1>
        <button className="button" onClick={() => reads.forEach((read) => void read.refetch())}>
          Try again
        </button>
      </div>
    );
  const now = new Date();
  const list = projects.data ?? [];
  const overview = designerOverview({
    projects: list,
    versions: designerVersions(versions.data?.versions ?? [], versions.data?.deliverables ?? [], list),
    now,
    formatMonth,
  });
  const clientName = (id: string) => clients.data?.find((client) => client.id === id)?.name ?? "";
  return (
    <div className="page-content home-content overview-page">
      <WelcomeHeader
        eyebrow="My work"
        title={welcomeTitle(profile?.display_name)}
        subtitle="Your assigned projects and next steps."
        actions={
          <div className="home-actions">
            <span className="home-date">{formatWeekdayDate(now.toISOString())}</span>
          </div>
        }
      />
      <div className="overview-stats">
        <div>
          <strong>{overview.active}</strong>
          <span>Active projects</span>
          <small>assigned to you</small>
        </div>
        <div>
          <strong>{overview.yourTurn}</strong>
          <span>Your turn</span>
          <small>sent back for changes</small>
        </div>
        <div>
          <strong>{overview.inStudioReview}</strong>
          <span>In studio review</span>
          <small>waiting on the studio</small>
        </div>
        <div>
          <strong>{overview.deliveredThisMonth}</strong>
          <span>Delivered this month</span>
          <small>shipped to clients</small>
        </div>
      </div>
      <div className="overview-columns">
        <OverviewPanel eyebrow="Assigned projects" title="What's moving" empty="No active assignments.">
          {overview.moving.map((project) => (
            <Link key={project.id} className="overview-row" href={`/projects/${project.id}`}>
              <strong>{project.title}</strong>
              <span className="overview-row-meta">
                {clientName(project.client_id)} · Due {formatDate(project.due_date, "not set")}
              </span>
              <span className={statusToneClass(projectStatusTones[project.status])}>
                {statusLabels[project.status]}
              </span>
            </Link>
          ))}
        </OverviewPanel>
        <OverviewPanel eyebrow="Needs you" title="Your turn" empty="Nothing sent back to you.">
          {overview.yourTurnRows.map((row) => (
            <Link key={row.id} className="overview-row" href={`/projects/${row.projectId}`}>
              <strong>
                {row.title} · {row.deliverable}
              </strong>
              <span className="overview-row-meta">
                Changes requested · {relativeAge(row.date, now)}
              </span>
            </Link>
          ))}
        </OverviewPanel>
        <OverviewPanel eyebrow="Delivered" title="Recently delivered" empty="Delivered work will appear here.">
          {overview.delivered.map((project) => (
            <Link key={project.id} className="overview-row" href={`/projects/${project.id}`}>
              <strong>{project.title}</strong>
              <span className="overview-row-meta">
                {clientName(project.client_id)} · {formatDate(deliveredOn(project))}
              </span>
            </Link>
          ))}
        </OverviewPanel>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Route designers to it and greet the studio**

In `apps/web/features/workspace/home-page.tsx`:

1. Import `import { DesignerOverview } from "@/features/overview/designer-overview";` and
   `import { WelcomeHeader, welcomeTitle } from "@/features/shared/welcome-header";`.
2. Directly after the last hook call (`const campaigns = useWorkspaceCampaigns();`) and before any
   early return, add `if (profile?.role === "designer") return <DesignerOverview />;`.
3. Replace the `<div className="page-heading">…</div>` block with:

```tsx
      <WelcomeHeader
        eyebrow={profile?.role === "agency" ? "Overview" : "Home"}
        title={welcomeTitle(profile?.display_name)}
        subtitle={
          profile?.role === "agency"
            ? "Projects and next steps across your clients."
            : "Your projects and next steps."
        }
        actions={
          <div className="home-actions">
            <span className="home-date">{today}</span>
            {profile?.role === "agency" && (
              <Link className="button" href="/settings/clients">
                <Plus size={16} />
                New client
              </Link>
            )}
          </div>
        }
      />
```

Everything below the heading stays unchanged.

In `tests/e2e/canonical-workspaces.spec.ts`, replace
`await expect(page.getByRole("heading", { level: 1 })).toHaveText("My work");` with

```ts
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Welcome back/);
        await expect(page.locator(".page-heading .eyebrow")).toHaveText("My work");
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run features/overview features/workspace`
Expected: PASS.

- [ ] **Step 6: Document and commit**

`features/overview/README.md`: the designer `/home` (numbers, columns, `useDesignerVersions`, the
`publishedVersionStatus` mapping) and the no-credits rule. `features/workspace/README.md`: `/home`
greets every role (eyebrow keeps Overview / My work / Home) and renders `DesignerOverview` for
designers.

Run: `npm run check` — Expected: PASS.

```bash
git add apps/web/features/overview/overview-data.ts apps/web/features/overview/designer-overview.tsx apps/web/features/overview/designer-overview.test.tsx apps/web/features/overview/README.md apps/web/features/workspace/home-page.tsx apps/web/features/workspace/README.md apps/web/tests/e2e/canonical-workspaces.spec.ts
git commit -m "feat(overview): greet every role on /home and give designers their dashboard"
```

---

### Task 7: Browser checks for every role

**Files:**
- Create: `apps/web/tests/e2e/overview.spec.ts`

**Interfaces:**
- Consumes: `credentials`, `localAdmin`, `localCaller`, `signIn` from `tests/e2e/test-support.ts`;
  the pages from Tasks 4–6.

- [ ] **Step 1: Write the spec**

Create `apps/web/tests/e2e/overview.spec.ts`:

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { credentials, localAdmin, localCaller, signIn } from "./test-support";

async function sabre() {
  return (await localAdmin.from("clients").select("id,name").eq("slug", "sabre").single()).data!;
}

/** The number in the Overview tile whose label is `label`. */
async function tile(page: Page, label: string) {
  const text = await page.locator(".overview-stats > div", { hasText: label }).locator("strong").innerText();
  return Number(text);
}

test("a client lands on its Overview and sees its own numbers", async ({ page }) => {
  const client = await sabre();
  await signIn(page, credentials.client);
  await expect(page).toHaveURL(new RegExp(`/clients/${client.id}/overview$`));
  const caller = await localCaller(credentials.client);
  const user = (await caller.auth.getUser()).data.user!;
  const me = (await localAdmin.from("profiles").select("display_name").eq("id", user.id).single()).data!;
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    `Welcome back, ${me.display_name.trim().split(/\s+/)[0]}`,
  );
  const projects = (await caller.from("projects").select("id,status").eq("client_id", client.id)).data!;
  const account = (await caller.from("credit_accounts").select("balance").eq("client_id", client.id).single()).data!;
  await expect.poll(() => tile(page, "Active projects")).toBe(
    projects.filter((project) => project.status !== "delivered").length,
  );
  await expect.poll(() => tile(page, "Credits remaining")).toBe(account.balance);
  const waiting = await tile(page, "Needs your review");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // The client's own Reviews tab agrees with the Overview.
  await page.goto(`/clients/${client.id}/reviews`);
  await expect(page.locator(".review-card, .empty-state").first()).toBeVisible();
  expect(await page.locator(".review-card").count()).toBe(waiting);

  // Nothing internal reaches the client's Overview.
  await page.goto(`/clients/${client.id}/overview`);
  await expect(page.locator(".overview-panel")).toHaveCount(3);
  const text = await page.locator(".overview-page").innerText();
  const designers = (await localAdmin.from("profiles").select("display_name").eq("role", "designer")).data!;
  for (const designer of designers) expect(text).not.toContain(designer.display_name);
  const notes = (
    await localAdmin
      .from("internal_comments")
      .select("body")
      .in("project_id", projects.map((project) => project.id))
  ).data!;
  for (const note of notes.filter((item) => item.body.length >= 20))
    expect(text).not.toContain(note.body.slice(0, 40));
});

test("a designer's home shows only assigned work and no credits", async ({ page }) => {
  await signIn(page, credentials.designer);
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Welcome back/);
  const caller = await localCaller(credentials.designer);
  const allowed = (await caller.from("projects").select("title,status")).data!;
  await expect.poll(() => tile(page, "Active projects")).toBe(
    allowed.filter((project) => project.status !== "delivered").length,
  );
  const titles = new Set(allowed.map((project) => project.title));
  for (const row of await page.locator(".overview-row > strong").allInnerTexts())
    expect(titles.has(row.split(" · ")[0])).toBe(true);
  await expect(page.getByText(/credits/i)).toHaveCount(0);
});

test("the studio sees a client's Overview as the client does", async ({ page }) => {
  const client = await sabre();
  await signIn(page, credentials.agency);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Welcome back/);
  await page.goto(`/clients/${client.id}/overview`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`What ${client.name} sees`);
  await expect(
    page
      .getByRole("navigation", { name: `${client.name} navigation`, exact: true })
      .getByRole("link", { name: "Overview", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const projects = (await localAdmin.from("projects").select("status").eq("client_id", client.id)).data!;
  await expect.poll(() => tile(page, "Active projects")).toBe(
    projects.filter((project) => project.status !== "delivered").length,
  );
});

test("the client Overview fits a phone in dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, credentials.client);
  await expect(page.locator(".overview-panel")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/overview.spec.ts --output=../outputs/pw-overview`
Expected: 4 passed. A failure means a dashboard number disagrees with the database or a page leaks;
fix the product code (in its owning task's files), never the expectation, and report it.

- [ ] **Step 3: Run the surrounding suites**

Run: `npx playwright test tests/e2e/client-navigation.spec.ts tests/e2e/client-pages-layout.spec.ts tests/e2e/console-errors.spec.ts tests/e2e/production-workflow.spec.ts tests/e2e/theme.spec.ts --output=../outputs/pw-overview-suites`
Expected: all pass.

- [ ] **Step 4: Run the gate and commit**

Run: `npm run check` — Expected: PASS.

```bash
git add apps/web/tests/e2e/overview.spec.ts
git commit -m "test(overview): check every role's dashboard against the database in a browser"
```

---

### Task 8: Architecture documentation and the acceptance amendment

**Files:**
- Modify: `docs/architecture/acceptance-matrix.md`, `docs/architecture/reference-map.md`,
  `docs/architecture/sitemap.md`, `docs/architecture/design-system.md`

- [ ] **Step 1: Amend D01**

In `docs/architecture/acceptance-matrix.md`, directly after the existing "Product amendment
(2026-09-24)" paragraph under family D, add:

```md
Product amendment (2026-09-25): the user asked for welcome dashboards. A client with one workspace
now lands on its **Overview** (`/clients/:clientId/overview`, the first client destination for the
client and the studio), one click from the Board. The studio's and the designer's `/home` headings
greet the viewer ("Welcome back, <first name>") and keep their role names, **Overview** and **My
work**, as the page eyebrow and the sidebar label; the designer's `/home` is now a dashboard of their
assigned work. D01's 2026-09-21 evidence describes the earlier landing and is not a requirement to
restore it; the rest of D01 (role-consistent navigation) still applies and `overview.spec.ts` covers
the new landing.
```

- [ ] **Step 2: Update the route maps and the design system**

- `reference-map.md`: the `/home — client entry` row's "Keep / simplify" becomes "Open the client's
  Overview (welcome dashboard), one click from the board"; add a row for `/clients/:clientId/overview`
  ("Client welcome dashboard: numbers, what's moving, your turn, recently shipped").
- `sitemap.md`: add `/clients/:clientId/overview` to the client routes with one line on who sees it
  (client and studio; designers are sent to the board).
- `design-system.md`: add a "Welcome dashboards" subsection (near the canvas identity header and
  client page sections) covering the welcome header (eyebrow + greeting + date + one action; card on
  client routes), the Overview tiles with notes, the in-flight strip, the three columns (up to five
  one-line rows, "See all"), stacking below 1000 px, and the isolation rule.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/acceptance-matrix.md docs/architecture/reference-map.md docs/architecture/sitemap.md docs/architecture/design-system.md
git commit -m "docs(overview): amend D01 and describe the welcome dashboards"
```

---

### Task 9: Visual audit, verification record and handoff (orchestrator)

- [ ] **Step 1: Capture.** With a throwaway Playwright script (signed in per role, password read from
  `supabase/.env.local`, never printed), capture light and dark at 1440×900, 900×700 and 390×844:
  the client Overview (as the client and as the studio), the designer `/home` and the studio `/home`,
  into `outputs/overview/`.
- [ ] **Step 2: Audit.** Alignment, spacing, contrast, empty states, long titles, both themes, and
  that nothing internal appears on the client pages. Fix defects in their own commits.
- [ ] **Step 3: Verify.** `npm run check`; `supabase test db` (only the known 6 overlay assertions
  fail); Playwright `overview theme client-navigation client-pages-layout production-workflow
  console-errors project-feedback playground board-views` with a private `--output`.
- [ ] **Step 4: Record.** `docs/verification/role-overview-dashboards-2026-09-25.md` with the checks
  and a few cited final images under `docs/verification/screenshots/role-overview/`; update
  `docs/engineering/handoff.md` (100 lines or fewer).
- [ ] **Step 5: Commit.** `docs(overview): record the verification and update the handoff`.

# Studio Team Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the agency a working surface that answers who should get the next briefing, at `/team` and `/team/[personId]`, and stop treating the studio's people as a setting.

**Architecture:** Three reads the agency can already make under RLS — `profiles`, `project_assignments`, `projects` — aggregated in a pure, unit-tested model rather than in a database view or a component. Two more reads on the person page turn `design_versions` and `internal_comments` into a recent-activity list. No new database object, no new privileged surface.

**Tech Stack:** Next.js App Router (client components), TanStack Query v5, Supabase JS v2, Zod is not needed here, Vitest for unit tests, Playwright for the browser suite.

**Spec:** `docs/superpowers/specs/2026-09-20-studio-team-design.md`

## Global Constraints

- English for every identifier, comment, string, file name and commit message. Brazilian Portuguese only in chat with the user.
- `npm run check` (typecheck, ESLint, Prettier, Vitest) must pass at the end of every task. Two ESLint warnings pre-exist and are unrelated: an unused `ArrowLeft` import in `board-nodes.tsx` and an `exhaustive-deps` warning in `board-page.tsx`. Any third warning is yours.
- Prettier decides formatting. Run `npx prettier --write <files>` before the check rather than hand-aligning.
- The full Playwright suite passes 25 of 25 today. It must still pass 25 of 25 at the end of Task 6. Run it with:
  `cd apps/web && set -a && . ../../supabase/.env.local && set +a && PLAYWRIGHT_BASE_URL=http://localhost:3010 npx playwright test`
- The local stack must be running (`npm run db:status` reports `media_healthy: true`) and a dev server must be on port 3010 before any browser step.
- **Do not commit unless the user has asked for it.** The commit step in each task is written out so the work is committable in one command, but this project's session instruction is that commits happen on request. Ask before running them.
- Never run `git checkout <path>` in this tree. Almost everything is uncommitted and that command has no undo.
- Agency-only surfaces render their unavailable state for other roles; RLS refuses the data regardless. Do not rely on the UI as the boundary.

---

### Task 1: Move the status order out of the board

The seven statuses in workflow order are a property of `ProjectStatus`, not of the board. `boardStatuses` currently lives in `features/board/planning-view.ts`; the team model needs the same list, and a team module importing a board module to borrow it would tie two features together for a constant belonging to neither.

Verified before writing this plan: a pure test module that imports a value from `workspace-data.ts` (which carries `"use client"` and pulls in TanStack Query) still runs — `board-layout.test.ts` passed 45 tests in 373 ms with such an import in place. Placement is safe.

**Files:**
- Modify: `apps/web/features/workspace/workspace-data.ts` (add `statusOrder` beside `statusLabels`, around line 133)
- Modify: `apps/web/features/board/planning-view.ts` (remove `boardStatuses` and its `ProjectStatus` import if unused)
- Modify: `apps/web/features/board/board-layout.ts:3,56`
- Modify: `apps/web/features/board/board-page.tsx:49,530`
- Modify: `apps/web/features/board/board-kanban.tsx:9,47`
- Modify: `apps/web/features/board/timeline-model.test.ts:5,452`

**Interfaces:**
- Consumes: nothing.
- Produces: `statusOrder: ProjectStatus[]` exported from `@/features/workspace/workspace-data`, seven entries in workflow order.

- [ ] **Step 1: Add `statusOrder` to `workspace-data.ts`**

Insert immediately above `export const statusLabels` (currently line 133):

```ts
/**
 * The seven statuses in the order work moves through them.
 *
 * It sits beside `statusLabels` and the type it enumerates because it belongs to a project's status,
 * not to any one surface: the board lays its Kanban out in this order and the team page reports a
 * person's load in it.
 */
export const statusOrder: ProjectStatus[] = [
  "planned",
  "in_progress",
  "internal_review",
  "client_review",
  "changes_requested",
  "approved",
  "delivered",
];
```

- [ ] **Step 2: Delete `boardStatuses` from `planning-view.ts`**

Remove this block and the now-unused `import type { ProjectStatus }` line at the top of the file:

```ts
/**
 * The stages the Kanban lays out, in the order work moves through them. It lives here rather than
 * with the component because the board's geometry is sized from how many there are.
 */
export const boardStatuses: ProjectStatus[] = [
  "planned",
  "in_progress",
  "internal_review",
  "client_review",
  "changes_requested",
  "approved",
  "delivered",
];
```

- [ ] **Step 3: Repoint the five importers**

`board-layout.ts` line 3 — replace `import { boardStatuses } from "./planning-view";` with:

```ts
import { statusOrder } from "@/features/workspace/workspace-data";
```

and line 56, inside `kanbanWidth`, replace `boardStatuses.length` with `statusOrder.length`.

`board-page.tsx` line 49 — the import becomes two lines:

```ts
import { selectionFromChanges, type PlanningMode } from "./planning-view";
```

and add `statusOrder` to the existing `@/features/workspace/workspace-data` import on line 22. At line 530 replace `boardStatuses.map` with `statusOrder.map`.

`board-kanban.tsx` line 9 — replace `import { boardStatuses } from "./planning-view";` with `statusOrder` added to the existing `@/features/workspace/workspace-data` import on line 7, then at line 47 replace `boardStatuses.map` with `statusOrder.map`.

`timeline-model.test.ts` line 5 — replace `import { boardStatuses } from "./planning-view";` with:

```ts
import { statusOrder } from "@/features/workspace/workspace-data";
```

and at line 452 replace `for (const status of boardStatuses)` with `for (const status of statusOrder)`.

- [ ] **Step 4: Verify nothing still refers to the old name**

Run: `grep -rn "boardStatuses" apps/web --include='*.ts' --include='*.tsx'`
Expected: no output.

- [ ] **Step 5: Run the checks**

Run: `npx prettier --write apps/web/features/workspace/workspace-data.ts apps/web/features/board/ && npm run check`
Expected: PASS — 274 tests across 15 files, 2 pre-existing warnings.

There is no new unit test in this task on purpose: the list is unchanged and `timeline-model.test.ts:452` already iterates it, so the existing suite is the regression test. A test asserting that a literal array equals itself would prove nothing.

- [ ] **Step 6: Commit** (ask the user first — see Global Constraints)

```bash
git add apps/web/features/workspace/workspace-data.ts apps/web/features/board/
git commit -m "refactor(workspace): move the status order beside the status it enumerates"
```

---

### Task 2: The team model

Every rule that can be decided without a network call. Pure, no React, no Supabase.

**Files:**
- Create: `apps/web/features/team/team-model.ts`
- Test: `apps/web/features/team/team-model.test.ts`

**Interfaces:**
- Consumes: `statusOrder`, `ProjectStatus` from `@/features/workspace/workspace-data` (Task 1).
- Produces:
  - `type StudioPerson = { id: string; display_name: string; role: "agency" | "designer"; avatar_url: string | null }`
  - `type Assignment = { project_id: string; designer_id: string }`
  - `type TeamProject = { id: string; client_id: string; title: string; status: ProjectStatus; due_date: string | null }`
  - `type LoadEntry = { status: ProjectStatus; count: number }`
  - `type StudioMember = { person: StudioPerson; total: number; load: LoadEntry[] }`
  - `type ActivityEntry = { id: string; kind: "version" | "comment"; project_id: string; at: string; detail: string }`
  - `studioLoad(people: StudioPerson[], assignments: Assignment[], projects: TeamProject[]): StudioMember[]`
  - `personProjects(projects: TeamProject[], assignments: Assignment[], personId: string): { status: ProjectStatus; projects: TeamProject[] }[]`
  - `mergeActivity(versions: { id: string; project_id: string; version_number: number; created_at: string }[], comments: { id: string; project_id: string; body: string; created_at: string }[], limit?: number): ActivityEntry[]`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/features/team/team-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  mergeActivity,
  personProjects,
  studioLoad,
  type Assignment,
  type StudioPerson,
  type TeamProject,
} from "./team-model";

const agency: StudioPerson = {
  id: "studio",
  display_name: "Dawes Studio",
  role: "agency",
  avatar_url: null,
};
const alex: StudioPerson = {
  id: "alex",
  display_name: "Alex Morgan",
  role: "designer",
  avatar_url: null,
};
const jordan: StudioPerson = {
  id: "jordan",
  display_name: "Jordan Reed",
  role: "designer",
  avatar_url: null,
};

function project(id: string, status: TeamProject["status"], due: string | null = null): TeamProject {
  return { id, client_id: "sabre", title: `Project ${id}`, status, due_date: due };
}

describe("studio load", () => {
  it("counts a person's projects and splits them across statuses", () => {
    const rows = studioLoad(
      [alex],
      [
        { project_id: "a", designer_id: "alex" },
        { project_id: "b", designer_id: "alex" },
        { project_id: "c", designer_id: "alex" },
      ],
      [project("a", "in_progress"), project("b", "in_progress"), project("c", "approved")],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(3);
    expect(rows[0].load).toEqual([
      { status: "in_progress", count: 2 },
      { status: "approved", count: 1 },
    ]);
  });

  it("omits a status the person has no work in", () => {
    const rows = studioLoad(
      [alex],
      [{ project_id: "a", designer_id: "alex" }],
      [project("a", "delivered")],
    );
    expect(rows[0].load.map((entry) => entry.status)).toEqual(["delivered"]);
  });

  it("reports the load in workflow order, not in the order the projects arrived", () => {
    const rows = studioLoad(
      [alex],
      [
        { project_id: "a", designer_id: "alex" },
        { project_id: "b", designer_id: "alex" },
      ],
      [project("a", "approved"), project("b", "planned")],
    );
    expect(rows[0].load.map((entry) => entry.status)).toEqual(["planned", "approved"]);
  });

  it("keeps the agency, which holds no assignments, with a total of zero", () => {
    // Load is measured by assignment, and the agency assigns rather than is assigned. Dropping the
    // row would say the agency is not in the studio, which is a different and false claim.
    const rows = studioLoad([agency, alex], [{ project_id: "a", designer_id: "alex" }], [
      project("a", "planned"),
    ]);
    expect(rows.map((row) => row.person.id)).toEqual(["studio", "alex"]);
    expect(rows[0].total).toBe(0);
    expect(rows[0].load).toEqual([]);
  });

  it("orders the agency first, then designers by name, so the page does not reshuffle", () => {
    const rows = studioLoad([jordan, alex, agency], [], []);
    expect(rows.map((row) => row.person.display_name)).toEqual([
      "Dawes Studio",
      "Alex Morgan",
      "Jordan Reed",
    ]);
  });

  it("ignores an assignment pointing at a project the viewer cannot read", () => {
    // RLS can hide a project while its assignment row remains visible. That is a narrower read, not
    // a broken one, and it must not throw.
    const rows = studioLoad(
      [alex],
      [
        { project_id: "visible", designer_id: "alex" },
        { project_id: "hidden", designer_id: "alex" },
      ],
      [project("visible", "planned")],
    );
    expect(rows[0].total).toBe(1);
  });
});

describe("one person's projects", () => {
  it("groups by status in workflow order and drops empty groups", () => {
    const groups = personProjects(
      [project("a", "approved"), project("b", "planned"), project("c", "planned")],
      [
        { project_id: "a", designer_id: "alex" },
        { project_id: "b", designer_id: "alex" },
        { project_id: "c", designer_id: "alex" },
      ],
      "alex",
    );
    expect(groups.map((group) => group.status)).toEqual(["planned", "approved"]);
    expect(groups[0].projects).toHaveLength(2);
  });

  it("sorts each group by due date, with undated work last", () => {
    const groups = personProjects(
      [
        project("late", "planned", "2026-10-09"),
        project("none", "planned", null),
        project("soon", "planned", "2026-09-21"),
      ],
      [
        { project_id: "late", designer_id: "alex" },
        { project_id: "none", designer_id: "alex" },
        { project_id: "soon", designer_id: "alex" },
      ],
      "alex",
    );
    expect(groups[0].projects.map((item) => item.id)).toEqual(["soon", "late", "none"]);
  });

  it("returns nothing for a person with no assignments", () => {
    expect(personProjects([project("a", "planned")], [], "alex")).toEqual([]);
  });
});

describe("recent activity", () => {
  it("merges versions and comments newest first", () => {
    const entries = mergeActivity(
      [{ id: "v1", project_id: "p", version_number: 2, created_at: "2026-09-18T10:00:00Z" }],
      [{ id: "c1", project_id: "p", body: "Ready for studio feedback.", created_at: "2026-09-19T10:00:00Z" }],
    );
    expect(entries.map((entry) => entry.kind)).toEqual(["comment", "version"]);
    expect(entries[0].detail).toBe("Ready for studio feedback.");
    expect(entries[1].detail).toBe("Submitted V2");
  });

  it("shows a comment's first line only, trimmed", () => {
    const entries = mergeActivity([], [
      { id: "c1", project_id: "p", body: "  First line\nSecond line  ", created_at: "2026-09-19T10:00:00Z" },
    ]);
    expect(entries[0].detail).toBe("First line");
  });

  it("caps the list", () => {
    const comments = Array.from({ length: 30 }, (_, index) => ({
      id: `c${index}`,
      project_id: "p",
      body: `Comment ${index}`,
      created_at: `2026-09-${String(index + 1).padStart(2, "0")}T10:00:00Z`,
    }));
    expect(mergeActivity([], comments)).toHaveLength(20);
    expect(mergeActivity([], comments, 5)).toHaveLength(5);
  });

  it("returns an empty list when the person has done nothing yet", () => {
    expect(mergeActivity([], [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run features/team/team-model.test.ts`
Expected: FAIL — `Failed to resolve import "./team-model"`.

- [ ] **Step 3: Write the model**

Create `apps/web/features/team/team-model.ts`:

```ts
/**
 * Who is in the studio and what they are carrying.
 *
 * Kept free of React and Supabase so the counting, the ordering and the tie-breaks can be unit
 * tested without a network or a render. The reads themselves live in `team-data.ts`.
 */
import { statusOrder, type ProjectStatus } from "@/features/workspace/workspace-data";

export type StudioPerson = {
  id: string;
  display_name: string;
  role: "agency" | "designer";
  avatar_url: string | null;
};
export type Assignment = { project_id: string; designer_id: string };
/** The columns the team surfaces read; a project carries more than this elsewhere. */
export type TeamProject = {
  id: string;
  client_id: string;
  title: string;
  status: ProjectStatus;
  due_date: string | null;
};
export type LoadEntry = { status: ProjectStatus; count: number };
export type StudioMember = { person: StudioPerson; total: number; load: LoadEntry[] };
export type ActivityEntry = {
  id: string;
  kind: "version" | "comment";
  project_id: string;
  at: string;
  detail: string;
};

/** The agency reads first, then designers by name, so the roster does not reshuffle between loads. */
function byRoleThenName(a: StudioPerson, b: StudioPerson): number {
  if (a.role !== b.role) return a.role === "agency" ? -1 : 1;
  return a.display_name.localeCompare(b.display_name);
}

/**
 * The projects assigned to one person that the viewer can actually read.
 *
 * RLS can hide a project while leaving its assignment row visible, which is a narrower read rather
 * than a broken one: the missing project is skipped instead of throwing.
 */
function assignedProjects(
  projects: TeamProject[],
  assignments: Assignment[],
  personId: string,
): TeamProject[] {
  const readable = new Map(projects.map((project) => [project.id, project]));
  return assignments
    .filter((assignment) => assignment.designer_id === personId)
    .map((assignment) => readable.get(assignment.project_id))
    .filter((project): project is TeamProject => !!project);
}

/** One row per person in the studio, each carrying the total and a count for the statuses it holds. */
export function studioLoad(
  people: StudioPerson[],
  assignments: Assignment[],
  projects: TeamProject[],
): StudioMember[] {
  return [...people].sort(byRoleThenName).map((person) => {
    const held = assignedProjects(projects, assignments, person.id);
    const counts = new Map<ProjectStatus, number>();
    for (const project of held) counts.set(project.status, (counts.get(project.status) ?? 0) + 1);
    return {
      person,
      total: held.length,
      // Workflow order, and only the statuses the person is actually in: a row of seven zeroes
      // says nothing, and teaches the viewer to stop reading the row.
      load: statusOrder
        .filter((status) => counts.has(status))
        .map((status) => ({ status, count: counts.get(status)! })),
    };
  });
}

/** One person's projects, grouped by status in workflow order, each group soonest first. */
export function personProjects(
  projects: TeamProject[],
  assignments: Assignment[],
  personId: string,
): { status: ProjectStatus; projects: TeamProject[] }[] {
  const held = assignedProjects(projects, assignments, personId);
  return statusOrder
    .map((status) => ({
      status,
      projects: held
        .filter((project) => project.status === status)
        // Undated work sorts last: no date is not the far future, it is an absence.
        .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")),
    }))
    .filter((group) => group.projects.length > 0);
}

/** What a person has done lately, newest first: versions they submitted and notes they wrote. */
export function mergeActivity(
  versions: { id: string; project_id: string; version_number: number; created_at: string }[],
  comments: { id: string; project_id: string; body: string; created_at: string }[],
  limit = 20,
): ActivityEntry[] {
  const entries: ActivityEntry[] = [
    ...versions.map((version) => ({
      id: version.id,
      kind: "version" as const,
      project_id: version.project_id,
      at: version.created_at,
      detail: `Submitted V${version.version_number}`,
    })),
    ...comments.map((comment) => ({
      id: comment.id,
      kind: "comment" as const,
      project_id: comment.project_id,
      at: comment.created_at,
      // A note can run long; the list shows the line the person led with.
      detail: comment.body.trim().split("\n")[0].trim(),
    })),
  ];
  return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run features/team/team-model.test.ts`
Expected: PASS — 13 tests.

- [ ] **Step 5: Run the full checks**

Run: `npx prettier --write apps/web/features/team/ && npm run check`
Expected: PASS — 287 tests across 16 files.

- [ ] **Step 6: Commit** (ask the user first)

```bash
git add apps/web/features/team/team-model.ts apps/web/features/team/team-model.test.ts
git commit -m "feat(team): count what each person in the studio is carrying"
```

---

### Task 3: The reads

**Files:**
- Create: `apps/web/features/team/team-data.ts`

**Interfaces:**
- Consumes: `StudioPerson`, `Assignment`, `TeamProject` from `./team-model` (Task 2); `useAuth` from `@/features/auth/auth-provider`; `assertResult` from `@/lib/supabase`.
- Produces:
  - `useStudioTeam(): UseQueryResult<{ people: StudioPerson[]; assignments: Assignment[]; projects: TeamProject[] }>`
  - `usePersonActivity(personId: string): UseQueryResult<ActivityEntry[]>`

- [ ] **Step 1: Write the hooks**

Create `apps/web/features/team/team-data.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult } from "@/lib/supabase";
import { mergeActivity, type Assignment, type StudioPerson, type TeamProject } from "./team-model";

/**
 * The roster and everything needed to count it, in one cached read.
 *
 * Three selects rather than one embedded query: `project_assignments` is scoped by its own policy
 * and `projects` by another, and asking for them separately keeps each read inside the policy that
 * governs it instead of relying on how PostgREST resolves an embed.
 */
export function useStudioTeam() {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["studio-team", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const [people, assignments, projects] = await Promise.all([
        database
          .from("profiles")
          .select("id,display_name,role,avatar_url")
          .in("role", ["agency", "designer"])
          .order("display_name"),
        database.from("project_assignments").select("project_id,designer_id"),
        database.from("projects").select("id,client_id,title,status,due_date"),
      ]);
      return {
        people: assertResult(people) as StudioPerson[],
        assignments: assertResult(assignments) as Assignment[],
        projects: assertResult(projects) as TeamProject[],
      };
    },
  });
}

/** What one person has done lately. Both reads are refused by policy for anyone who may not produce. */
export function usePersonActivity(personId: string) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["person-activity", session?.user.id, personId],
    enabled: !!session && !!personId,
    queryFn: async () => {
      const [versions, comments] = await Promise.all([
        database
          .from("design_versions")
          .select("id,project_id,version_number,created_at")
          .eq("created_by", personId)
          .order("created_at", { ascending: false })
          .limit(20),
        database
          .from("internal_comments")
          .select("id,project_id,body,created_at")
          .eq("author_id", personId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      return mergeActivity(assertResult(versions), assertResult(comments));
    },
  });
}
```

- [ ] **Step 2: Run the checks**

Run: `npx prettier --write apps/web/features/team/ && npm run check`
Expected: PASS — 287 tests, no new warning.

There is no unit test for this file: it is a pair of thin query wrappers whose only logic is
`mergeActivity`, already covered in Task 2. Testing it would mean asserting against a mocked
Supabase client, which proves the mock works.

- [ ] **Step 3: Commit** (ask the user first)

```bash
git add apps/web/features/team/team-data.ts
git commit -m "feat(team): read the roster, its assignments and one person's activity"
```

---

### Task 4: The roster page

**Files:**
- Create: `apps/web/features/team/team-page.tsx`
- Create: `apps/web/features/team/team.css`
- Create: `apps/web/app/(workspace)/team/page.tsx`

**Interfaces:**
- Consumes: `useStudioTeam` (Task 3), `studioLoad` (Task 2), `statusLabels` from `@/features/workspace/workspace-data`.
- Produces: `TeamPage` component, default-exported route at `/team`.

- [ ] **Step 1: Write the page**

Create `apps/web/features/team/team-page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useAuth } from "@/features/auth/auth-provider";
import { statusLabels } from "@/features/workspace/workspace-data";
import { useStudioTeam } from "./team-data";
import { studioLoad } from "./team-model";
import "./team.css";

export function TeamPage() {
  const { profile } = useAuth();
  const team = useStudioTeam();
  if (!profile || team.isPending)
    return (
      <div className="page-content" role="status">
        Opening the team…
      </div>
    );
  if (profile.role !== "agency")
    return (
      <div className="page-content">
        <h1>The studio team is private.</h1>
        <p>Ask your studio contact if you need to reach someone.</p>
      </div>
    );
  if (team.error || !team.data)
    return (
      <div className="page-content">
        <h1>The team is unavailable.</h1>
        <button className="button" onClick={() => void team.refetch()}>
          Try again
        </button>
      </div>
    );
  const members = studioLoad(team.data.people, team.data.assignments, team.data.projects);
  return (
    <div className="page-content team-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">THE STUDIO</span>
          <h1>Team</h1>
          <p>Who is here, and what each of them is carrying.</p>
        </div>
      </header>
      <div className="team-list">
        {members.map((member) => (
          <Link className="team-row" key={member.person.id} href={`/team/${member.person.id}`}>
            <div className="team-row-person">
              <strong>{member.person.display_name}</strong>
              <span className="team-role">{member.person.role}</span>
            </div>
            <div className="team-row-load">
              <span className="team-total">
                {member.total} project{member.total === 1 ? "" : "s"}
              </span>
              {member.load.length ? (
                <span className="team-breakdown">
                  {member.load.map((entry) => (
                    <span key={entry.status}>
                      {statusLabels[entry.status]} {entry.count}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="team-breakdown team-quiet">No projects yet.</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the styles**

Create `apps/web/features/team/team.css`:

```css
/* One row per person, wide enough that the status breakdown sits on the same line as the total. */
.team-list {
  display: grid;
  gap: 10px;
}
.team-row {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 18px 22px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: inherit;
  text-decoration: none;
}
.team-row:hover {
  border-color: var(--border-strong);
}
.team-row-person {
  display: grid;
  min-width: 0;
  gap: 3px;
}
.team-row-person strong {
  font-size: 15px;
  font-weight: 500;
}
.team-role {
  color: var(--muted);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.team-row-load {
  display: grid;
  justify-items: end;
  gap: 5px;
  text-align: right;
}
.team-total {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.team-breakdown {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px 12px;
  color: var(--muted);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}
.team-quiet {
  font-style: italic;
}

@media (max-width: 640px) {
  .team-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
  }
  .team-row-load {
    justify-items: start;
    text-align: left;
  }
  .team-breakdown {
    justify-content: flex-start;
  }
}
```

- [ ] **Step 3: Add the route**

Create `apps/web/app/(workspace)/team/page.tsx`:

```tsx
import { TeamPage } from "@/features/team/team-page";
export default function Team() {
  return <TeamPage />;
}
```

- [ ] **Step 4: Run the checks**

Run: `npx prettier --write apps/web/features/team/ "apps/web/app/(workspace)/team/" && npm run check`
Expected: PASS.

- [ ] **Step 5: Look at it**

Open `http://localhost:3010/team` signed in as `studio@dawes.local`.
Expected: three rows — Dawes Studio with "0 projects" and "No projects yet.", Alex Morgan with 12 and Jordan Reed with 13, each with its status breakdown. Confirm the browser console is clean.

- [ ] **Step 6: Commit** (ask the user first)

```bash
git add apps/web/features/team/ "apps/web/app/(workspace)/team/"
git commit -m "feat(team): show the studio roster and what each person carries"
```

---

### Task 5: The person page

**Files:**
- Create: `apps/web/features/team/person-page.tsx`
- Create: `apps/web/app/(workspace)/team/[personId]/page.tsx`
- Modify: `apps/web/features/team/team.css` (append the person styles)

**Interfaces:**
- Consumes: `useStudioTeam`, `usePersonActivity` (Task 3); `studioLoad`, `personProjects` (Task 2); `statusLabels`, `formatDate` from `@/features/workspace/workspace-data`; `useClients` from the same module.
- Produces: `PersonPage({ personId }: { personId: string })`, route at `/team/[personId]`.

- [ ] **Step 1: Write the page**

Create `apps/web/features/team/person-page.tsx`:

```tsx
"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/features/auth/auth-provider";
import { formatDate, statusLabels, useClients } from "@/features/workspace/workspace-data";
import { usePersonActivity, useStudioTeam } from "./team-data";
import { personProjects, studioLoad } from "./team-model";
import "./team.css";

export function PersonPage({ personId }: { personId: string }) {
  const { profile } = useAuth();
  const team = useStudioTeam();
  const clients = useClients();
  const activity = usePersonActivity(personId);
  if (!profile || team.isPending)
    return (
      <div className="page-content" role="status">
        Opening the team…
      </div>
    );
  if (profile.role !== "agency")
    return (
      <div className="page-content">
        <h1>The studio team is private.</h1>
        <p>Ask your studio contact if you need to reach someone.</p>
      </div>
    );
  if (team.error || !team.data)
    return (
      <div className="page-content">
        <h1>The team is unavailable.</h1>
        <button className="button" onClick={() => void team.refetch()}>
          Try again
        </button>
      </div>
    );
  const member = studioLoad(team.data.people, team.data.assignments, team.data.projects).find(
    (item) => item.person.id === personId,
  );
  if (!member)
    return (
      <div className="page-content">
        <h1>This person is not in the studio.</h1>
        <Link className="button" href="/team">
          Back to the team
        </Link>
      </div>
    );
  const groups = personProjects(team.data.projects, team.data.assignments, personId);
  const workspace = (clientId: string) =>
    clients.data?.find((client) => client.id === clientId)?.name ?? "";
  return (
    <div className="page-content team-page">
      <Link className="button quiet team-back" href="/team">
        <ArrowLeft size={15} />
        Back to the team
      </Link>
      <header className="page-heading">
        <div>
          <span className="eyebrow">{member.person.role.toUpperCase()}</span>
          <h1>{member.person.display_name}</h1>
          <p>
            {member.total} project{member.total === 1 ? "" : "s"} in hand.
          </p>
        </div>
      </header>
      {member.load.length > 0 && (
        <div className="team-breakdown team-breakdown-wide">
          {member.load.map((entry) => (
            <span key={entry.status}>
              {statusLabels[entry.status]} {entry.count}
            </span>
          ))}
        </div>
      )}
      {groups.length === 0 ? (
        <p className="team-quiet">No projects yet.</p>
      ) : (
        groups.map((group) => (
          <section className="person-group" key={group.status}>
            <h2>{statusLabels[group.status]}</h2>
            <div className="person-projects">
              {group.projects.map((item) => (
                <Link className="person-project" key={item.id} href={`/projects/${item.id}`}>
                  <strong>{item.title}</strong>
                  <span>{workspace(item.client_id)}</span>
                  <span>{formatDate(item.due_date)}</span>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
      <section className="person-group">
        <h2>Recent activity</h2>
        {activity.isPending ? (
          <p className="team-quiet" role="status">
            Loading…
          </p>
        ) : !activity.data?.length ? (
          <p className="team-quiet">Nothing recorded yet.</p>
        ) : (
          <ul className="person-activity">
            {activity.data.map((entry) => (
              <li key={`${entry.kind}:${entry.id}`}>
                <Link href={`/projects/${entry.project_id}`}>{entry.detail}</Link>
                <span>{formatDate(entry.at.slice(0, 10))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Append the person styles**

Append to `apps/web/features/team/team.css`:

```css
.team-back {
  margin-bottom: 18px;
}
.team-breakdown-wide {
  justify-content: flex-start;
  margin-bottom: 30px;
  font-size: 12.5px;
}
.person-group {
  margin-bottom: 32px;
}
.person-group h2 {
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}
.person-projects {
  display: grid;
  gap: 8px;
}
.person-project {
  display: grid;
  align-items: center;
  gap: 16px;
  grid-template-columns: minmax(0, 1fr) minmax(0, 200px) 110px;
  padding: 14px 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: inherit;
  font-size: 13px;
  text-decoration: none;
}
.person-project:hover {
  border-color: var(--border-strong);
}
.person-project strong {
  min-width: 0;
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.person-project span {
  color: var(--muted);
  font-size: 12px;
}
.person-activity {
  display: grid;
  margin: 0;
  padding: 0;
  gap: 9px;
  list-style: none;
}
.person-activity li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  font-size: 13px;
}
.person-activity span {
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .person-project {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
}
```

- [ ] **Step 3: Add the route**

Create `apps/web/app/(workspace)/team/[personId]/page.tsx`:

```tsx
import { PersonPage } from "@/features/team/person-page";
export default async function Person({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  return <PersonPage personId={personId} />;
}
```

- [ ] **Step 4: Run the checks**

Run: `npx prettier --write apps/web/features/team/ "apps/web/app/(workspace)/team/" && npm run check`
Expected: PASS.

- [ ] **Step 5: Look at it**

Open `/team` and click Alex Morgan.
Expected: the breakdown, projects grouped by status with workspace and due date, and a recent-activity list. Then open `/team/not-a-person` and expect "This person is not in the studio." with a working link back.

- [ ] **Step 6: Commit** (ask the user first)

```bash
git add apps/web/features/team/ "apps/web/app/(workspace)/team/"
git commit -m "feat(team): open one person's projects and recent activity"
```

---

### Task 6: Navigation, and undoing the wrong shortcut

**Files:**
- Modify: `apps/web/features/workspace/app-shell.tsx` (add the main-nav entry near line 242; remove the footer shortcut at lines 309–319)
- Modify: `apps/web/features/settings/settings-page.tsx:14` (the `labels` map)

**Interfaces:**
- Consumes: nothing new.
- Produces: `/team` reachable from the main navigation for the agency.

- [ ] **Step 1: Add the main-navigation entry**

In `app-shell.tsx`, immediately after the `Search` link and before `<div className="nav-section-label">WORKSPACES</div>`:

```tsx
{profile.role === "agency" && (
  /* A working surface, not a setting: who is carrying what decides where the next briefing
     goes. It stays active while a person's own page is open. */
  <Link
    className={`nav-item ${pathname.startsWith("/team") ? "active" : ""}`}
    aria-current={pathname.startsWith("/team") ? "page" : undefined}
    href="/team"
  >
    <Users size={17} />
    <span>Team</span>
  </Link>
)}
```

- [ ] **Step 2: Remove the footer shortcut**

Delete this block from the sidebar footer:

```tsx
{profile.role === "agency" && (
  /* The same page Studio settings opens on its Team tab, given a way in of its own:
     who is in the studio is a thing you look for by name, not a setting you tune. */
  <Link
    href="/settings/team"
    className={`nav-item ${pathname === "/settings/team" ? "active" : ""}`}
  >
    <Users size={17} />
    <span>Team</span>
  </Link>
)}
```

The `Users` import stays — Step 1 uses it.

- [ ] **Step 3: Rename the settings tab**

In `settings-page.tsx`, change the `labels` map entry so one word means one thing:

```ts
const labels: Record<SettingsTab, string> = {
  workspace: "Workspace",
  // Access administration, not the studio's workload: `/team` owns the word Team.
  team: "People",
  clients: "Clients",
  presets: "Presets",
  account: "Your account",
};
```

The `SettingsTab` union, the route `/settings/team` and `TeamSettings` are unchanged, so no link and no browser test breaks.

- [ ] **Step 4: Run the checks**

Run: `npx prettier --write apps/web/features/workspace/app-shell.tsx apps/web/features/settings/settings-page.tsx && npm run check`
Expected: PASS.

- [ ] **Step 5: Run the full browser suite**

Run: `cd apps/web && set -a && . ../../supabase/.env.local && set +a && PLAYWRIGHT_BASE_URL=http://localhost:3010 npx playwright test`
Expected: 25 passed, 0 failed.

Nothing in the suite asserts the tab's label — verified with `grep -rn '"Team"' apps/web/tests/e2e docs/verification`, which returns nothing, and `intake-admin.spec.ts:570` navigates to `/settings/team` by URL. The rename is safe.

- [ ] **Step 6: Sweep every route**

Re-run the route sweep described in `docs/engineering/handoff.md` under "UI sweep", adding `["team", "/team"]` and a person route to its list.
Expected: zero console errors, zero horizontal overflow, exactly one `h1` per route, on 27 routes.

- [ ] **Step 7: Commit** (ask the user first)

```bash
git add apps/web/features/workspace/app-shell.tsx apps/web/features/settings/settings-page.tsx
git commit -m "feat(workspace): give the studio team its own place in the navigation"
```

---

### Task 7: Documentation

Documentation maintenance is part of the change in this project, not a follow-up.

**Files:**
- Modify: `docs/architecture/design-system.md`
- Modify: `docs/engineering/handoff.md`

- [ ] **Step 1: Record the surface in the design system**

Add a `### Studio team` subsection after the `### Workspace topbar` subsection covering: Team is a working surface in the main navigation, agency only; settings hold access administration under the name People; a row carries the total and the statuses the person actually holds, in workflow order, using `statusLabels`; the agency appears with no load because load is measured by assignment; `statusOrder` lives beside `statusLabels` because it belongs to the status, not to a surface.

- [ ] **Step 2: Append the handoff entry**

Append a dated section covering what was built, the decisions and what they cost (browser aggregation over a database view; a route per person over an expanding row; the settings tab renamed), what was deliberately left out (assignment stays in the project panel; designers have no team surface yet), and the checks actually run with their results.

- [ ] **Step 3: Verify the documented claims**

Run: `npm run check` and confirm the test count quoted in the handoff matches reality.

- [ ] **Step 4: Commit** (ask the user first)

```bash
git add docs/
git commit -m "docs: record the studio team surface and the status-order move"
```

---

## Self-Review

**Spec coverage.** `/team` → Task 4. `/team/[personId]` → Task 5. Agency-only main-navigation entry → Task 6. Settings tab renamed to People → Task 6. Footer shortcut removed → Task 6. `statusOrder` moved to `workspace-data.ts` → Task 1. Browser aggregation over three reads → Task 3. `studioLoad` / `personProjects` / activity merge → Task 2. Every error and empty state in the spec's table appears in Task 4 or Task 5. The spec's testing section maps to Task 2's tests plus the sweep in Task 6, Step 6.

**Placeholders.** None: every code step carries the code, every run step carries the command and the expected result.

**Type consistency.** `StudioPerson`, `Assignment`, `TeamProject`, `LoadEntry`, `StudioMember` and `ActivityEntry` are declared once in Task 2 and used under those names in Tasks 3, 4 and 5. `statusOrder` is named identically in Tasks 1 and 2. `useStudioTeam` and `usePersonActivity` are produced in Task 3 and consumed under those names in Tasks 4 and 5. `personProjects` returns `{ status, projects }[]`, which is what Task 5 iterates.

**One gap found and closed during review:** Task 5 needs workspace names, which come from `useClients` — added to that task's Consumes block and imported in its code.

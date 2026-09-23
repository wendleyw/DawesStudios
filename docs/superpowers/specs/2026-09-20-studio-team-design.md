# Studio Team — design

Status: approved in chat on 2026-09-20, awaiting spec review.

## Why

The studio has three people and twenty-five projects, and nothing in the product says who is
carrying what. Assignment happens one project at a time in the project details panel, so the only
way to learn a designer's load is to open twenty-five projects and remember.

Team was previously reachable only as a tab inside Studio settings, and a shortcut to it was briefly
added beside Studio settings in the sidebar footer. That was wrong: settings are values you tune,
and a studio's people are not a setting. This design separates the two ideas rather than moving the
same page around.

## What Team is

A working surface that answers one question: **who should get the next briefing?**

It is not an administration screen. Inviting a teammate, changing a role and revoking access stay
where they are, inside Studio settings, which is renamed from Team to **People** so that one word
means one thing.

## Scope

In scope:

- `/team` — every person in the studio, with their project load.
- `/team/[personId]` — one person: their load, their projects, and what they have recently done.
- A main-navigation entry for both, visible to the agency only.
- Renaming the Studio settings tab `Team` to `People`.
- Removing the sidebar-footer shortcut added earlier.

Out of scope, deliberately:

- **Assigning or revoking a designer.** `assign_designer` and `revoke_design_assignment` already
  exist and are already driven from the project details panel. A second place to do the same thing
  would be exactly the duplicate control the project instructions forbid.
- **Clients.** They are workspaces, listed under Studio settings → Clients. Team means the studio.
- **Anything a designer sees.** The routes are agency-only. Whether a designer should see their own
  load, and only their own, is a separate question with its own permission story.

## Architecture

### Where the numbers come from

Aggregated in the browser from tables the agency can already read, not from a new database view or
RPC.

RLS is the security boundary and it is already correct: `assignments_read` admits the agency or the
assigned designer, `versions_read` and `internal_comments_read` admit anyone who `can_produce` the
project, which the agency can. A `security definer` function would add a privileged surface for a
read that policy already scopes, and would move domain rules into SQL where they cannot be unit
tested beside the rest.

Three reads, all through the existing browser client:

| Read | Table | Columns |
| --- | --- | --- |
| Studio roster | `profiles` | `id, display_name, role, avatar_url` where role in (`agency`, `designer`) |
| Assignments | `project_assignments` | `project_id, designer_id` |
| Projects | `projects` | `id, title, status, due_date, client_id` |

The person page adds two more, filtered to that person:

| Read | Table | Columns |
| --- | --- | --- |
| Versions submitted | `design_versions` | `id, project_id, version_number, created_at` where `created_by` is the person |
| Internal comments | `internal_comments` | `id, project_id, body, created_at` where `author_id` is the person |

### Components

```
features/team/
  team-model.ts        pure aggregation and ordering, no React
  team-model.test.ts   unit tests for the above
  team-data.ts         react-query hooks over the reads in the table above
  team-page.tsx        the roster
  person-page.tsx      one person
  team.css             styles for both

app/(workspace)/team/page.tsx             renders TeamPage
app/(workspace)/team/[personId]/page.tsx  renders PersonPage
```

`team-model.ts` holds every rule that can be decided without a network call, in the shape the rest
of this codebase already uses for `timeline-model.ts`, `board-layout.ts` and `brand-model.ts`:

- `studioLoad(people, assignments, projects)` → one row per person, each carrying the total and a
  count per status.
- `statusOrder` — the seven statuses in the order work moves through them. `boardStatuses` already
  holds exactly this list, but it lives in `features/board/planning-view.ts`, and a team module
  reaching into a board module to borrow a constant would tie two features together for something
  that belongs to neither. It **moves** to `features/workspace/workspace-data.ts`, beside
  `statusLabels` and the `ProjectStatus` type it enumerates, and both features import it from there.
  A status with a count of zero is omitted from the row; a person with no projects reads as "No
  projects yet" rather than as seven zeroes.
- `personProjects(projects, assignments, personId)` → that person's projects grouped by status, in
  `statusOrder`, each group sorted by due date with undated work last.

### Data flow

`/team` mounts `TeamPage`, which calls one hook that issues the three reads in parallel and passes
their results to `studioLoad`. The result is a plain array the component renders. No aggregation
logic lives in the component.

`/team/[personId]` mounts `PersonPage`, which reuses the same three reads (react-query serves them
from cache when arriving from `/team`) plus the two activity reads, and calls `personProjects`.

The agency account appears in the roster because it is in the studio, and carries no load, because
load is measured by assignment and the agency assigns rather than is assigned. Its row reads "No
projects yet" — accurate, not an empty state to design around.

### What a row says

Name, role, total project count, and the count for each status the person actually has, using the
existing `statusLabels` map so the words match the board and every other surface:

```
Alex Morgan      designer        12 projects
  Planned 1 · In progress 3 · Studio review 1 · In review 4 · Approved 3
```

The whole row is a link to that person.

### What the person page says

- Heading: name and role.
- The same status breakdown as the roster row.
- Projects grouped by status in `statusOrder`; each one names its workspace and due date and links
  to the project.
- Recent activity: versions submitted and internal comments written, merged into one list ordered
  by time, newest first, capped at twenty entries. A comment shows its first line, truncated.

### Navigation

A `Team` entry in the main navigation, after `Search` and before the `WORKSPACES` label, rendered
only when `profile.role === "agency"`. It is active on `/team` and on `/team/<id>`, which means
`pathname.startsWith("/team")` rather than exact equality.

The sidebar-footer shortcut added earlier is removed. The Studio settings tab keeps its route
`/settings/team` and its component, and changes its label to `People`. The route is unchanged, so no
link and no browser test breaks; only the word people read changes.

## Error and empty states

| Case | What is shown |
| --- | --- |
| Reads pending | `Opening the team…` in a `role="status"` region, matching the other pages |
| Any read fails | `The team is unavailable.` with a retry button, matching the assets page |
| Viewer is not agency | The route renders the same unavailable state as other agency-only surfaces; RLS refuses the data regardless |
| A person has no projects | `No projects yet.` in place of the breakdown |
| A person has no activity | `Nothing recorded yet.` under Recent activity |
| `personId` is not a studio person | `This person is not in the studio.` with a link back to `/team` |

## Testing

Unit, in `team-model.test.ts`:

- `studioLoad` counts a person's projects and splits them across statuses.
- Statuses with no work are omitted from a row.
- A person with no assignments is present with a total of zero.
- Rows come back in a stable order (role first so the agency reads before designers, then display
  name) so the page does not reshuffle between loads.
- `personProjects` groups by status in `statusOrder` and sorts each group by due date with undated
  work last.
- An assignment pointing at a project the viewer cannot read is ignored rather than throwing.
- The agency, holding no assignments, is present with a total of zero rather than being dropped.

Browser: the route sweep already walks every workspace route and asserts one `h1`, no overflow and
no console errors; `/team` and `/team/<id>` join it. No new e2e spec — the existing suite covers the
navigation shell, and a spec that only asserts two numbers from the fixture would test the seed, not
the product.

## What the fixture will and will not show

Jordan Reed carries 13 projects and Alex Morgan 12, both across all 10 workspaces, so the two rows
will look nearly identical on the seeded data. The page earns its place when load is uneven; the
seed is deliberately even. Overdue work is computable but is zero in the fixture, which is why it is
not a column: a signal that always reads zero teaches the viewer to ignore it.

## Decisions taken, and what they cost

| Decision | Alternative rejected | Why |
| --- | --- | --- |
| Aggregate in the browser | Database view or RPC | RLS already scopes the reads; a definer function adds a privileged surface and untestable domain logic |
| Full status breakdown per row | Splitting "in the designer's court" from "waiting on the client" | The user chose the full breakdown; it shows everything and leaves the reading to the viewer |
| A route per person | Expanding the row in place | A person has an address that can be shared, and room for activity that a row cannot hold |
| Rename the settings tab to People | Two tabs named Team | One word, one meaning |

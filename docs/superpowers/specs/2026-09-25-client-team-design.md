# Several people in one client workspace

Date: 2026-09-25

Status: design approved in chat; the user asked to continue through spec, plan and execution
without stopping ("continue após finalizar")

## Objective

A client such as SABRE has five people who work with the studio. Today they share one login, so
nobody can tell who asked for a piece of work, who approved it, or who should answer a question, and
every update reaches one shared inbox. Each person gets their own login, and the product records and
shows who did what:

1. The studio sees every client's people, invites them and removes them.
2. Every briefing names its requester, and the studio names one when it files a briefing for a
   client (the "on behalf of" case).
3. Every client decision on a version names the person who made it.
4. Updates about a briefing's project reach its requester, not the whole team, and anyone can opt in
   to everything.
5. Each person sees their team, and the Overview greets them by name.

Success means: two people at one client act separately and the product attributes and notifies each
correctly, while designers stay invisible to clients and no client sees another client's people.

## Decisions taken with the user

| Question | Decision |
| --- | --- |
| Shared login with "on behalf of" names, or a login per person | A login per person (the existing invitation flow). "On behalf of" survives only as the studio choosing the requester when it files a briefing. |
| Permissions inside a client | The same for everyone: submit briefings, review versions, comment, see credits. No client roles. |
| Who adds and removes people | The studio only. Clients see their team and ask the studio for changes. |
| Who receives updates | The briefing's requester, plus anyone who switches on "All <client> activity". |
| Approach | Record the person on the records that exist (`briefings.requested_by`, `publication_reviews.reviewed_by`, a switch on `client_memberships`) and route inside `private.notify_client`. A followers table (B) and typed names under a shared login were rejected. |

## Non-goals

- Client roles or permission tiers; client self-service invitations; follow buttons.
- Cancelling or resending invitations (pending ones are listed only).
- Per-event notification settings, email notifications, or digest emails.
- Showing requesters or reviewers to designers; any change to what designers can read.
- Per-person counts on the Overview (it stays team-wide; only the greeting becomes personal).
- Migrating shared logins automatically: they keep working until the studio removes them.

## Current state

- `client_memberships (client_id, user_id)` already allows many people per client and many clients
  per person (`supabase/migrations/202609200001_foundation.sql`). The studio invites a client person
  from Settings → Clients → Invite (`apps/web/features/settings/client-settings.tsx`,
  `InvitePerson` from `features/team/team-page.tsx`, `POST /api/invitations`, agency only).
- The studio cannot see who belongs to a client, and nothing removes a client person
  (`public.remove_team_member` accepts only agency and designer profiles).
- A client reads only its own profile and membership (`profiles_read`, `memberships_read`), so a
  person cannot see their teammates. Client users reach only Settings → Your account.
- `briefings.created_by` is stored but never shown. The studio can create briefings for a client
  (`save_briefing` allows the agency; "New briefing" on the client's Board, Briefings and Overview).
- `publication_reviews` stores status, feedback and `reviewed_at`, not the reviewer.
- `private.notify_client(target_client, target_project, title, body)` notifies every member except
  the actor. Callers: `accept_briefing`, `publish_version`, `mark_project_delivered` and
  `post_comment` (project updates), `fulfill_credit_request` and `reject_credit_request`
  (client-wide, no project). Every project comes from a briefing (`projects.briefing_id`).
- Client comments already carry their author's name (`client_comments.author_label`).

## Design

### 1. The studio manages a client's people

In Settings → Clients, each client row's **Invite** button becomes **People**, which opens a
dialog:

- **People**: each active person's name and email, with **Remove**.
- **Invited**: pending invitations (email and expiry), read-only.
- **Invite person**: the existing `InvitePerson` form, unchanged.

**Remove** asks for confirmation ("<name> loses access to <client>"). A new
`public.remove_client_member(p_client_id, p_profile_id)` (agency only, audited) removes the person
from that client. If they still belong to another client, it deletes this membership and this
client's notifications for them, and they keep their login. If it was their last client, it
deactivates the account the way `remove_team_member` does (`profiles.removed_at`, notifications
deleted) and keeps the membership row as the record of which client the pending removal belongs to;
a route that mirrors `/api/team-members/[id]/remove` then completes the Auth block, and the dialog
offers **Finish removal** if that step failed, even after a reload. Removing a client's last person
is allowed; the dialog says "<client> will have nobody who can sign in until someone is invited."

### 2. Each person sees their team

Settings → Your account gains, for a client user, one **Team** section per client they belong to:

- The client's active people (name and email), marked "You" for the viewer.
- "To add or remove someone, contact the studio."
- A notification switch: **My requests** (default) or **All <client> activity**.

A new `public.client_team(p_client_id)` (security definer) returns `(user_id, display_name, email)`
for active client-role members of that client, to the agency or to a member of that client, and
nothing to anyone else. Profile and membership policies do not widen. Emails come from Auth inside
the function.

### 3. Requested by

- `briefings.requested_by uuid` (nullable, references `profiles`). The client person who first
  saves a briefing becomes its requester; teammates who later edit or submit it do not change it.
  When the studio creates one, the Details step requires a **Requested by** choice among the
  client's people; a client with exactly one person defaults to that person, and a client with no
  people leaves it empty.
- The database accepts only an active client member of the briefing's client (or null when the
  studio files for a client with nobody), whatever the UI sends.
- The studio can change the requester on the briefing page (`public.set_briefing_requester`,
  agency only, same validation), for example after the requester leaves.
- Existing briefings take `created_by` when that person is a member of the briefing's client, else
  null.
- The Briefings list rows, the briefing page and the project's details show "Requested by <name>"
  to the studio and the client. A project's requester is its briefing's requester. A requester who
  was removed shows as "<name> (left)" to the studio and as "Former member" to the client.

### 4. Approved by

`publication_reviews.reviewed_by uuid` is set by `review_publication` to the person deciding. The
Reviews page and the project's review status read "Approved by <name> · <date>" or "Changes
requested by <name> · <date>"; older reviews without a reviewer keep today's wording. Only client
members can review (`review_publication`), so the reviewer is always a client person; one who has
left reads like a requester who left.

### 5. Notifications

- `client_memberships.notify_all boolean not null default false`, set only by the person through
  `public.set_client_notifications(p_client_id, p_all)`.
- `private.notify_client` keeps its signature. With no project (credit updates) it notifies every
  member, as today. With a project it notifies the project's requester, members with `notify_all`,
  and, for a studio message, client people who have written in that project's client conversation
  and are still members. The studio message is recognised by `post_comment`'s fixed title "New
  message from Studio", which a database test pins.
  If the project has no requester or the requester is no longer a member, every member is notified.
- The actor is never notified, and removed people never are.

### 6. Isolation

No new path lets a client read another client's people or any designer: `client_team` filters by
membership and role, names on briefings and reviews resolve through it for clients, and designers
see neither requester nor reviewer. The studio reads profiles as today.

### 7. Existing shared logins

Nothing migrates automatically. The studio invites each person, then removes the shared login from
the People dialog. Old briefings keep the shared login as requester until the studio changes it.

## Testing

- Database (pgTAP): `requested_by` backfill and validation (client creator becomes requester; a
  non-member, a designer or another client's person is rejected; the studio's choice validated);
  `set_briefing_requester` agency-only; `reviewed_by` recorded; notification routing (requester
  only, `notify_all`, conversation participants, fallback to everyone, client-wide events, actor
  excluded); `client_team` isolation (another client's member and a designer get nothing);
  `remove_client_member` (membership only vs last membership, agency only).
- Unit and component: the People dialog, the Team section and switch, the requester picker and the
  "Requested by" and "Approved by" labels, including the removed-person wording.
- Browser (`client-team.spec.ts`): a temporary second person at SABRE, created and deleted by the
  test (the seed stays 10 clients / 25 projects and its user count is restored). The requester gets
  "New designs ready for review" and the teammate does not until they switch on all activity; both
  see each other in Team; a review shows "Approved by <name>"; the studio files a briefing on behalf
  of a chosen person; the studio removes the temporary person and that login stops working.

## Documentation

Feature READMEs for settings, team, briefings, reviews and workspace (which owns notifications);
`docs/architecture/` (data access, sitemap, design system where the People dialog and Team section
live, the acceptance matrix with a dated amendment under family C); the verification record;
`docs/engineering/handoff.md`.

## Risks

- `private.notify_client` serves six workflows; pgTAP covers each routing case before any caller
  changes.
- Removal touches Auth; it mirrors the tested team-member removal route, including its retry order.
- Teammates see each other's emails inside one client. That is intended: they are colleagues, and
  the list is limited to their own client.

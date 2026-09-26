/**
 * Who a client's people are, and the words a viewer reads for one of them on a briefing or a
 * review. Pure: `team-data.ts` reads the people, and the briefings, projects, reviews and settings
 * features render these labels, so every surface names a person the same way.
 */

/** One of a client's active people, as `client_team` returns them. */
export type ClientPerson = { user_id: string; display_name: string; email: string };

/**
 * A client's people for one viewer: the active team (the only list a client person ever receives)
 * and, for the studio alone, every client person's name by id, so someone who left can be named.
 */
export type ClientPeople = { team: ClientPerson[]; names: Record<string, string> };

/**
 * The name a viewer sees for the person recorded on a briefing or a review. An active member reads
 * by name to the studio and the client alike; someone who has left reads "<name> (left)" to the
 * studio and "Former member" to the client, which never receives a former member's name. Nothing
 * is shown when nobody is recorded, before the people load, or to a designer, who never sees who
 * asked or who decided.
 */
export function personName(
  id: string | null | undefined,
  people: ClientPeople | undefined,
  viewerRole: string | undefined,
): string | null {
  if (!id || !people || (viewerRole !== "agency" && viewerRole !== "client")) return null;
  const member = people.team.find((person) => person.user_id === id);
  if (member) return member.display_name;
  if (viewerRole === "client") return "Former member";
  const name = people.names[id];
  return name ? `${name} (left)` : null;
}

/** "Requested by <name>", or nothing when no name can be shown. */
export function requesterLabel(name: string | null): string | null {
  return name ? `Requested by ${name}` : null;
}

/**
 * "Approved by <name> · <date>" or "Changes requested by <name> · <date>" for a decided version, or
 * nothing: an undecided version, and one decided before reviewers were recorded, keep the wording
 * their surface already uses.
 */
export function reviewDecisionLabel(
  status: string,
  name: string | null,
  date: string,
): string | null {
  if (!name) return null;
  if (status === "approved") return `Approved by ${name} · ${date}`;
  if (status === "changes_requested") return `Changes requested by ${name} · ${date}`;
  return null;
}

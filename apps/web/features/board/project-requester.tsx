"use client";

import { useCallback } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useBriefingRequesters } from "@/features/briefings/briefing-data";
import { personName } from "@/features/team/client-people";
import { useClientPeople } from "@/features/team/team-data";
import type { Project } from "@/features/workspace/workspace-data";

/**
 * The person who asked for a project: its briefing's `requested_by`, named by `personName` (the
 * studio reads "<name> (left)", the client "Former member"). `null` means the project has no
 * requester to name.
 */
export type RequesterOf = (project: Project) => string | null;

/**
 * The board's requester lookup, or `undefined` when the viewer does not see requesters at all
 * (designers), so every view drops the field rather than showing an empty one.
 */
export function useRequesterOf(clientId: string): RequesterOf | undefined {
  const { profile } = useAuth();
  const role = profile?.role;
  const requesters = useBriefingRequesters(clientId);
  const people = useClientPeople(clientId);
  const requesterOf = useCallback<RequesterOf>(
    (project) =>
      project.briefing_id
        ? personName(requesters.data?.[project.briefing_id], people.data, role)
        : null,
    [requesters.data, people.data, role],
  );
  return role === "agency" || role === "client" ? requesterOf : undefined;
}

/** Up to two initials from a display name: "Maya Chen" → "MC". */
export function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toUpperCase())
    .join("");
}

/**
 * The requester as an initials avatar, with the name beside it unless `compact`, where the name is
 * the avatar's tooltip and accessible name instead.
 */
export function ProjectRequester({ name, compact = false }: { name: string; compact?: boolean }) {
  return (
    <span className="project-requester" title={compact ? `Requested by ${name}` : undefined}>
      <span
        className="project-requester-avatar"
        aria-hidden={compact ? undefined : true}
        aria-label={compact ? `Requested by ${name}` : undefined}
        role={compact ? "img" : undefined}
      >
        {initialsOf(name)}
      </span>
      {!compact && <span className="project-requester-name">{name}</span>}
    </span>
  );
}

/** A card's requester line: nothing when the viewer does not see requesters or there is none. */
export function CardRequester({ name }: { name: string | null | undefined }) {
  return name ? (
    <span className="board-card-requester">
      <ProjectRequester name={name} />
    </span>
  ) : null;
}

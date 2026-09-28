/** The current, assignment-scoped unit of internal work. Client decisions never infer this state. */
export type CurrentBoardWork = {
  id: string;
  project_id: string;
  board_id: string;
  sequence: number;
  kind: string;
  outcome: string;
  current: boolean;
  round_id: string | null;
  created_at: string;
  round: { version_number: number; notes: string } | null;
};

export function workRequestStatus(request: Pick<CurrentBoardWork, "outcome" | "kind">): string {
  if (request.outcome === "open")
    return request.kind === "revision" ? "changes_requested" : "draft";
  return request.outcome === "shared" ? "reviewed" : request.outcome;
}

export function workRequestLabel(request: CurrentBoardWork, boardName?: string): string {
  const detail = request.round
    ? `Round ${request.round.version_number}`
    : request.kind === "revision"
      ? "Changes requested"
      : "Production brief";
  return `${boardName ?? "Design board"} · ${detail}`;
}

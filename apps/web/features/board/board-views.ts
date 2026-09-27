/** Picker order, the default view first. `name` is the short form the client navigation shows in place of "Board". */
export const boardViews = [
  { id: "list", label: "List view", name: "List" },
  { id: "canvas", label: "Canvas view", name: "Canvas" },
  { id: "timeline", label: "Timeline view", name: "Timeline" },
  { id: "kanban", label: "Kanban view", name: "Kanban" },
  { id: "calendar", label: "Calendar view", name: "Calendar" },
] as const;

export type BoardView = (typeof boardViews)[number]["id"];

/** A viewer who has never chosen a view opens the board as a list, on every screen size. */
export const defaultBoardView: BoardView = "list";

export function boardViewName(view: BoardView) {
  return boardViews.find((candidate) => candidate.id === view)!.name;
}

export function normalizeBoardView(value: string | null): BoardView | null {
  return boardViews.find((view) => view.id === value)?.id ?? null;
}

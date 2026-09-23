export const boardViews = [
  { id: "canvas", label: "Canvas view" },
  { id: "list", label: "List view" },
  { id: "timeline", label: "Timeline view" },
  { id: "kanban", label: "Kanban view" },
  { id: "calendar", label: "Calendar view" },
] as const;

export type BoardView = (typeof boardViews)[number]["id"];

export function normalizeBoardView(value: string | null): BoardView | null {
  return boardViews.find((view) => view.id === value)?.id ?? null;
}

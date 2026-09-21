/**
 * How a project is selected and opened from the board.
 *
 * Three surfaces show projects — the campaign card, the calendar lane and the Kanban card — and all
 * three obey one rule: a single click selects, a double click opens that project's own canvas.
 * Defining it once is what keeps them from drifting apart.
 *
 * A double click is invisible to the keyboard and to assistive technology, so a surface that uses
 * these handlers must also carry an explicit control named by `openLabel`. The handlers are the
 * pointer shortcut; the control is the real affordance.
 */

/**
 * Where a project's own page lives. Used within this feature; other features build the same
 * `/projects/${id}` path literally rather than reach across the feature boundary for it, since the
 * route is unlikely to change and importing across features for one template literal is not worth
 * the coupling.
 */
export function projectHref(projectId: string): string {
  return `/projects/${projectId}`;
}

/** The accessible name of the explicit control that opens a project. */
export function openLabel(title: string): string {
  return `Open ${title}`;
}

export type SelectOrOpen = {
  onClick: () => void;
  onDoubleClick: (event: { stopPropagation: () => void }) => void;
};

/**
 * Handlers for a surface that selects on one click and opens on two.
 *
 * The browser fires `click` before `dblclick`, so opening is always preceded by selecting. That is
 * deliberate: the project the viewer opens is the one left selected when they come back.
 */
export function selectOrOpen(handlers: { onSelect: () => void; onOpen: () => void }): SelectOrOpen {
  return {
    onClick: handlers.onSelect,
    onDoubleClick: (event) => {
      // A lane sits inside the Planning frame, which the canvas would otherwise also act on.
      event.stopPropagation();
      handlers.onOpen();
    },
  };
}

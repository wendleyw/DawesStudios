import { CalendarDays, Columns3, GanttChart, LayoutDashboard, List } from "lucide-react";
import { boardViews, type BoardView } from "./board-views";

const icons = {
  canvas: LayoutDashboard,
  list: List,
  timeline: GanttChart,
  kanban: Columns3,
  calendar: CalendarDays,
};

export function BoardViewPicker({
  value,
  disabled,
  onChange,
}: {
  value: BoardView;
  disabled: boolean;
  onChange: (view: BoardView) => void;
}) {
  return (
    <div className="segmented-control board-view-picker" role="group" aria-label="Board view">
      {boardViews.map((view) => {
        const Icon = icons[view.id];
        return (
          <button
            key={view.id}
            type="button"
            aria-label={view.label}
            title={view.label}
            aria-pressed={value === view.id}
            disabled={disabled}
            onClick={() => onChange(view.id)}
          >
            <Icon size={18} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

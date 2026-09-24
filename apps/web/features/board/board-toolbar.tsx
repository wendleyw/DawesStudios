"use client";

import { LayoutDashboard, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { statusLabels } from "@/features/workspace/workspace-data";
import { FormError } from "@/features/shared/form-error";
import { SearchField } from "@/features/shared/search-field";
import { BoardViewPicker } from "./board-view-picker";
import { boardStatuses } from "./planning-view";
import type { BoardView } from "./board-views";
import type { BoardCampaign } from "./board-layout";

export function BoardToolbar({
  clientId,
  view,
  onView,
  disabled,
  canCreate,
  search,
  onSearch,
  campaign,
  onCampaign,
  status,
  onStatus,
  campaigns,
  resultCount,
  onClear,
  widgets,
}: {
  clientId: string;
  view: BoardView;
  onView: (view: BoardView) => void;
  disabled: boolean;
  canCreate: boolean;
  search: string;
  onSearch: (search: string) => void;
  campaign: string;
  onCampaign: (id: string) => void;
  status: string;
  onStatus: (status: string) => void;
  campaigns: BoardCampaign[];
  resultCount: number;
  onClear: () => void;
  /** The agency's widget placement, offered only on the Canvas view. */
  widgets?: { placed: boolean; pending: boolean; error: string | null; onToggle: () => void };
}) {
  const [panel, setPanel] = useState<"search" | "filters" | "widgets" | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const campaignInput = useRef<HTMLSelectElement>(null);
  const widgetsButton = useRef<HTMLButtonElement>(null);
  const widgetToggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!panel) return;
    if (panel === "search") searchInput.current?.focus();
    else if (panel === "filters") campaignInput.current?.focus();
    else widgetToggle.current?.focus();
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target))
        setPanel(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setPanel(null);
      (panel === "search"
        ? searchButton
        : panel === "filters"
          ? filterButton
          : widgetsButton
      ).current?.focus();
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [panel]);

  function closePanel() {
    if (panel)
      (panel === "search"
        ? searchButton
        : panel === "filters"
          ? filterButton
          : widgetsButton
      ).current?.focus();
    setPanel(null);
  }

  return (
    <div className="board-floating-toolbar" ref={container} role="group" aria-label="Board tools">
      <div className="board-tool-group">
        <button
          type="button"
          className="icon-button board-tool"
          ref={searchButton}
          aria-label="Search projects"
          title="Search projects"
          aria-expanded={panel === "search"}
          aria-controls={panel === "search" ? panelId : undefined}
          onClick={() => setPanel(panel === "search" ? null : "search")}
        >
          <Search size={18} aria-hidden="true" />
          {search && <span className="board-tool-indicator" aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="icon-button board-tool"
          ref={filterButton}
          aria-label="Filters"
          title="Filters"
          aria-expanded={panel === "filters"}
          aria-controls={panel === "filters" ? panelId : undefined}
          onClick={() => setPanel(panel === "filters" ? null : "filters")}
        >
          <SlidersHorizontal size={18} aria-hidden="true" />
          {(campaign || status) && <span className="board-tool-indicator" aria-hidden="true" />}
        </button>
      </div>
      <span className="board-tool-divider" aria-hidden="true" />
      <BoardViewPicker
        value={view}
        disabled={disabled}
        onChange={(next) => {
          setPanel(null);
          onView(next);
        }}
      />
      <span className="board-tool-divider" aria-hidden="true" />
      <div className="board-tool-group">
        {canCreate && (
          <Link
            className="icon-button board-tool"
            href={`/clients/${clientId}/briefings/new`}
            aria-label="New briefing"
            title="New briefing"
          >
            <Plus size={20} aria-hidden="true" />
          </Link>
        )}
      </div>
      {widgets && (
        <>
          <span className="board-tool-divider" aria-hidden="true" />
          <div className="board-tool-group">
            <button
              type="button"
              className="icon-button board-tool"
              ref={widgetsButton}
              aria-label="Board widgets"
              title="Board widgets"
              aria-expanded={panel === "widgets"}
              aria-controls={panel === "widgets" ? panelId : undefined}
              onClick={() => setPanel(panel === "widgets" ? null : "widgets")}
            >
              <LayoutDashboard size={18} aria-hidden="true" />
            </button>
          </div>
        </>
      )}
      {panel && (
        <section
          className="board-tool-panel"
          id={panelId}
          aria-label={
            panel === "search"
              ? "Project search"
              : panel === "filters"
                ? "Project filters"
                : "Board widgets"
          }
        >
          <header>
            <h2>
              {panel === "search" ? "Find a project" : panel === "filters" ? "Filters" : "Widgets"}
            </h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Close panel"
              onClick={closePanel}
            >
              <X size={16} />
            </button>
          </header>
          {panel === "widgets" && widgets ? (
            <>
              <div className="board-widget-option">
                <div>
                  <strong>Competitor ads</strong>
                  <p>Follow competitors&apos; ads from the official ad libraries.</p>
                </div>
                <button
                  type="button"
                  className="button"
                  ref={widgetToggle}
                  disabled={widgets.pending}
                  onClick={widgets.onToggle}
                >
                  {widgets.placed ? "Remove from board" : "Add to board"}
                </button>
              </div>
              {widgets.error && <FormError>{widgets.error}</FormError>}
            </>
          ) : panel === "search" ? (
            <SearchField
              label="Search projects"
              value={search}
              onChange={onSearch}
              placeholder="Find a project…"
              iconSize={16}
              inputRef={searchInput}
            />
          ) : (
            <>
              <label>
                Campaign
                <select
                  ref={campaignInput}
                  value={campaign}
                  onChange={(event) => onCampaign(event.target.value)}
                >
                  <option value="">All campaigns</option>
                  {campaigns.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select value={status} onChange={(event) => onStatus(event.target.value)}>
                  <option value="">All statuses</option>
                  {boardStatuses.map((item) => (
                    <option key={item} value={item}>
                      {statusLabels[item]}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {panel !== "widgets" && (
            <footer>
              <span className="board-result-count" role="status">
                {resultCount} project{resultCount === 1 ? "" : "s"}
              </span>
              {(search || campaign || status) && (
                <button type="button" className="button quiet" onClick={onClear}>
                  Clear filters
                </button>
              )}
            </footer>
          )}
        </section>
      )}
    </div>
  );
}

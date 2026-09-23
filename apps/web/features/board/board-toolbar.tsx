"use client";

import { Plus, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { statusLabels } from "@/features/workspace/workspace-data";
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
}) {
  const [panel, setPanel] = useState<"search" | "filters" | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const campaignInput = useRef<HTMLSelectElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!panel) return;
    if (panel === "search") searchInput.current?.focus();
    else campaignInput.current?.focus();
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target))
        setPanel(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setPanel(null);
      (panel === "search" ? searchButton : filterButton).current?.focus();
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [panel]);

  function closePanel() {
    (panel === "search" ? searchButton : filterButton).current?.focus();
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
      {panel && (
        <section
          className="board-tool-panel"
          id={panelId}
          aria-label={panel === "search" ? "Project search" : "Project filters"}
        >
          <header>
            <h2>{panel === "search" ? "Find a project" : "Filters"}</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Close panel"
              onClick={closePanel}
            >
              <X size={16} />
            </button>
          </header>
          {panel === "search" ? (
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
        </section>
      )}
    </div>
  );
}

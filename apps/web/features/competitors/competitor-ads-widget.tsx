"use client";

import { Plus, Radar, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { FormError } from "@/features/shared/form-error";
import { CompetitorForm } from "./competitor-form";
import { CompetitorScreen } from "./competitor-screen";
import { useCompetitors } from "./competitors-data";
import { MAX_COMPETITORS, matchedSources, websiteHost, type Competitor } from "./competitors-model";
import "./competitors.css";

/**
 * The Competitor ads widget, rendered inside its board frame. Its dialogs render into
 * `document.body`, so the canvas's own pointer and wheel handling never reaches them.
 */
export function CompetitorAdsWidget({
  clientId,
  canEdit,
  removing,
  onRemove,
}: {
  clientId: string;
  canEdit: boolean;
  removing: boolean;
  onRemove: () => void;
}) {
  const competitors = useCompetitors(clientId);
  const [form, setForm] = useState<{ competitor?: Competitor } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const list = competitors.data ?? [];
  // Resolved from the list rather than kept in state, so a competitor removed elsewhere closes.
  const open = list.find((item) => item.id === openId) ?? null;
  return (
    <section className="competitor-widget" aria-label="Competitor ads">
      <header className="competitor-widget-head">
        <Radar size={15} aria-hidden="true" />
        <h2>Competitor ads</h2>
        <span className="count-badge">{list.length}</span>
        {canEdit && (
          <div className="competitor-widget-actions">
            {list.length < MAX_COMPETITORS ? (
              <button type="button" className="button quiet nodrag" onClick={() => setForm({})}>
                <Plus size={15} aria-hidden="true" />
                Add competitor
              </button>
            ) : (
              <span className="competitor-widget-note">Up to {MAX_COMPETITORS} competitors</span>
            )}
            <button
              type="button"
              className="icon-button nodrag"
              aria-label="Remove competitor ads from the board"
              title="Remove from board"
              disabled={removing}
              onClick={onRemove}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </header>
      {competitors.isPending ? (
        <p className="competitor-widget-empty" role="status">
          Loading competitors…
        </p>
      ) : competitors.error ? (
        <div className="competitor-widget-empty">
          <FormError>
            Competitors could not be loaded.{" "}
            <button
              type="button"
              className="button quiet nodrag"
              onClick={() => void competitors.refetch()}
            >
              Try again
            </button>
          </FormError>
        </div>
      ) : list.length === 0 ? (
        <p className="competitor-widget-empty">
          {canEdit
            ? "Add the competitors you want to follow."
            : "The studio has not added competitors yet."}
        </p>
      ) : (
        <ul className="competitor-grid">
          {list.map((competitor) => {
            const host = websiteHost(competitor.website);
            return (
              <li key={competitor.id}>
                <button
                  type="button"
                  className="competitor-tile nodrag"
                  onClick={() => setOpenId(competitor.id)}
                >
                  <span className="competitor-initial" aria-hidden="true">
                    {Array.from(competitor.name)[0]?.toUpperCase()}
                  </span>
                  <strong>{competitor.name}</strong>
                  {host && <span className="competitor-host">{host}</span>}
                  <span className="competitor-sources">
                    {matchedSources(competitor).join(" · ")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {form &&
        createPortal(
          <CompetitorForm
            clientId={clientId}
            competitor={form.competitor}
            onClose={() => setForm(null)}
          />,
          document.body,
        )}
      {open &&
        !form &&
        createPortal(
          <CompetitorScreen
            competitor={open}
            canEdit={canEdit}
            onEdit={() => {
              setForm({ competitor: open });
              setOpenId(null);
            }}
            onClose={() => setOpenId(null)}
          />,
          document.body,
        )}
    </section>
  );
}

"use client";

import { useState } from "react";
import { ArrowUpRight, Pencil } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/features/auth/auth-provider";
import { BriefingSummary } from "@/features/briefings/briefing-summary";
import { useDateFormat } from "@/features/workspace/workspace-data";
import { PageStatus } from "@/features/shared/page-status";
import {
  useProductionBrief,
  useProductionBriefs,
  type DesignBoard,
  type TableRow,
} from "./project-data";
import { productionSummary } from "./production-brief-model";
import { ProductionBriefEditor } from "./production-brief-editor";
import "@/features/briefings/briefings.css";
import "./projects.css";

export function ProductionBrief({
  board,
  project,
}: {
  board: DesignBoard | null;
  project: TableRow<"projects">;
}) {
  const { profile } = useAuth();
  const agency = profile?.role === "agency";
  const query = useProductionBrief(board?.id);
  const { formatDate } = useDateFormat();
  const [editing, setEditing] = useState(false);
  if (!board)
    return (
      <p>
        {agency
          ? "Add a design board to prepare its production brief."
          : "The studio is preparing your production board."}
      </p>
    );
  if (query.isPending) return <p role="status">Loading production brief…</p>;
  if (query.error)
    return (
      <div role="alert">
        <p>We couldn’t load the production brief.</p>
        <button className="button" onClick={() => void query.refetch()}>
          Try again
        </button>
      </div>
    );
  const published = query.data?.published ?? null;
  const saved = agency ? (query.data?.draft ?? published) : published;
  const unpublished = agency && saved && saved.revision !== published?.revision;
  return (
    <div className="production-brief">
      <div className="production-brief-heading">
        <div>
          <h3>{board.name}</h3>
          <p>
            {unpublished
              ? "Draft · not sent to the designer"
              : saved
                ? `Sent ${formatDate(published?.updated_at ?? null)} · Revision ${saved.revision}`
                : "No production brief sent yet."}
          </p>
        </div>
        {agency && project.status !== "delivered" && (
          <button className="button quiet" onClick={() => setEditing(true)}>
            <Pencil size={14} />
            {saved ? "Edit production brief" : "Prepare production brief"}
          </button>
        )}
      </div>
      {saved ? (
        <>
          <BriefingSummary
            draft={productionSummary({
              ...saved.content,
              dueDate: unpublished ? saved.content.dueDate : (board.dueDate ?? ""),
            })}
            campaignName="Production brief"
            compact
          />
          {saved.content.references.length > 0 && (
            <nav className="project-resources" aria-label="Production references">
              <h3>References</h3>
              {saved.content.references.map((item, index) => (
                <a
                  className="button quiet"
                  key={index}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.name}
                  <ArrowUpRight size={14} />
                </a>
              ))}
            </nav>
          )}
        </>
      ) : (
        <p>
          {agency
            ? "Prepare the scope, quantities and direction for this designer. The client briefing stays separate."
            : "The studio will send your scope, deliverables and creative direction here."}
        </p>
      )}
      {editing && (
        <ProductionBriefEditor
          key={board.id}
          board={board}
          project={project}
          saved={saved}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

export function ProductionBriefsPage({ clientId }: { clientId: string }) {
  const query = useProductionBriefs(clientId);
  if (query.isPending) return <PageStatus>Loading production briefs…</PageStatus>;
  return (
    <div className="page-content">
      <header className="page-heading client-page-heading">
        <div>
          <h1>Production briefs</h1>
          <p>Instructions from the studio for your assigned boards.</p>
        </div>
      </header>
      {query.error ? (
        <div role="alert">
          <p>We couldn’t load your production briefs.</p>
          <button className="button" onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      ) : query.data?.length ? (
        <div className="production-brief-list">
          {query.data.map((item) => (
            <Link
              className="production-brief-list-item"
              key={item.board_id}
              href={`/projects/${item.design_boards.project_id}?panel=details&board=${item.board_id}`}
            >
              <div>
                <h2>{item.content.title}</h2>
                <p>
                  {item.design_boards.name} · Revision {item.revision}
                </p>
              </div>
              <ArrowUpRight size={16} />
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>No production briefs yet.</h2>
          <p>The studio’s instructions will appear here when they are sent.</p>
        </div>
      )}
    </div>
  );
}

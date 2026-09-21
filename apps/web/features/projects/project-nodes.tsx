"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { ArrowUpRight, Check, ChevronRight, Plus, Send } from "lucide-react";
import { memo, type CSSProperties } from "react";
import { Artwork } from "./artwork";
import type { ProjectAction } from "./project-action-dialog";
import { versionStatusLabel } from "@/features/workspace/workspace-data";
import type { CanvasDesign, CanvasVersion, ProjectChannel } from "./project-data";

/** The two node kinds the project canvas draws: a deliverable's heading and one of its versions. */
export type VersionNode = Node<
  {
    version: CanvasVersion;
    designs: CanvasDesign[];
    channel: ProjectChannel;
    canProduce: boolean;
    canPublish: boolean;
    canReview: boolean;
    /** The artwork box every tile of this deliverable uses, in the deliverable's proportions. */
    artworkHeight: number;
    /** Designs the row shows; the rest stay behind the card's "+N more designs" control. */
    visibleDesigns: number;
    openDesign: (id: string) => void;
    action: (action: ProjectAction) => void;
  },
  "version"
>;
export type DeliverableNode = Node<
  { name: string; format: string; dimensions: string; canProduce: boolean; onCreate: () => void },
  "deliverable"
>;

/**
 * One version as a single line: its label and meta in the column on the left, its designs in a row
 * beside them. The next version is the line below, so the canvas reads as a list of versions.
 */
const VersionCard = memo(function VersionCard({ data }: NodeProps<VersionNode>) {
  return (
    <article className="version-card">
      <div className="version-label">
        <header>
          <strong>V{data.version.number}</strong>
          <span className="version-state">{versionStatusLabel(data.version.status)}</span>
          {data.canProduce && (
            <button
              className="icon-button nodrag"
              aria-label={`Add design to version ${data.version.number}`}
              onClick={() => data.action({ kind: "design", version: data.version })}
            >
              <Plus size={15} />
            </button>
          )}
        </header>
        {data.version.note && <p className="version-note">{data.version.note}</p>}
        {data.version.feedback && (
          <p className="version-feedback">
            <strong>Client feedback</strong>
            <span>{data.version.feedback}</span>
          </p>
        )}
        <footer>
          <span>
            {data.designs.length} design{data.designs.length === 1 ? "" : "s"}
          </span>
          {data.canPublish && data.designs.length > 0 ? (
            <button
              className="button quiet nodrag"
              onClick={() => data.action({ kind: "publish", version: data.version })}
            >
              {data.version.status === "reviewed" ? <Check size={14} /> : <Send size={13} />}
              {data.version.status === "reviewed" ? "Share update" : "Share with client"}
            </button>
          ) : data.canProduce && data.designs.length > 0 ? (
            <button
              className="button quiet nodrag"
              onClick={() => data.action({ kind: "submit", version: data.version })}
            >
              <Send size={13} />
              Send to studio
            </button>
          ) : data.canReview ? (
            <button
              className="button quiet nodrag"
              onClick={() => data.action({ kind: "review", version: data.version })}
            >
              Review version
              <ArrowUpRight size={13} />
            </button>
          ) : null}
        </footer>
      </div>
      <div
        className="version-designs"
        style={{ "--artwork-height": `${data.artworkHeight}px` } as CSSProperties}
      >
        {data.designs.length ? (
          data.designs.slice(0, data.visibleDesigns).map((design) => (
            <button
              key={design.id}
              className="design-preview nodrag"
              onClick={() => data.openDesign(design.id)}
              aria-label={`Open ${design.title}`}
            >
              <Artwork design={design} channel={data.channel} thumbnail />
              <span>
                {design.title}
                <ArrowUpRight size={13} />
              </span>
            </button>
          ))
        ) : (
          <div className="empty-state empty-state-compact version-empty">
            <p>A space for your first design.</p>
            {data.canProduce && (
              <button
                className="button quiet nodrag"
                onClick={() => data.action({ kind: "design", version: data.version })}
              >
                <Plus size={14} />
                Add design
              </button>
            )}
          </div>
        )}
        {data.designs.length > data.visibleDesigns && (
          <button
            className="button quiet more-designs nodrag"
            onClick={() => data.openDesign(data.designs[data.visibleDesigns].id)}
          >
            +{data.designs.length - data.visibleDesigns} more designs
            <ChevronRight size={14} />
          </button>
        )}
      </div>
    </article>
  );
});
function DeliverableHeader({ data }: NodeProps<DeliverableNode>) {
  return (
    <header className="deliverable-header">
      <div>
        <span className="eyebrow">{data.format}</span>
        <h2>{data.name}</h2>
        <p>{data.dimensions}</p>
      </div>
      {data.canProduce && (
        <button
          className="icon-button nodrag"
          aria-label={`New version for ${data.name}`}
          onClick={data.onCreate}
        >
          <Plus size={16} />
        </button>
      )}
    </header>
  );
}
export const nodeTypes = { version: VersionCard, deliverable: DeliverableHeader };

"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { ArrowUpRight, Check, ChevronRight, MessageSquare, Plus, Send } from "lucide-react";
import { memo, type CSSProperties } from "react";
import { Artwork } from "./artwork";
import type { ProjectAction } from "./project-action-dialog";
import { versionStatusLabel } from "@/features/workspace/workspace-data";
import type { CanvasDesign, CanvasVersion, ProjectChannel } from "./project-data";

/** Project canvas nodes: deliverable headings, version rows and version-creation slots. */
export type VersionNode = Node<
  {
    version: CanvasVersion;
    designs: CanvasDesign[];
    channel: ProjectChannel;
    canProduce: boolean;
    canPublish: boolean;
    commentCount?: number;
    openFeedback: () => void;
    canReview: boolean;
    /** The artwork box every tile of this deliverable uses, in the deliverable's proportions. */
    artworkHeight: number;
    /** Designs the row shows; the rest stay behind the card's "+N more designs" control. */
    visibleDesigns: number;
    onAddDesign?: () => void;
    addDesignLabel: string;
    creationHint?: string;
    openDesign: (id: string) => void;
    action: (action: ProjectAction) => void;
  },
  "version"
>;
export type DeliverableNode = Node<
  { name: string; format: string; dimensions: string },
  "deliverable"
>;
export type AddVersionNode = Node<
  { name: string; onCreate: () => void; creationHint?: string },
  "addVersion"
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
        </header>
        <button
          className="version-comments nodrag"
          onClick={data.openFeedback}
          aria-label={`Open feedback for version ${data.version.number}`}
          title="Open version feedback"
        >
          <MessageSquare size={15} aria-hidden="true" />
          <span>
            {data.commentCount === undefined
              ? "Feedback"
              : `${data.commentCount} comment${data.commentCount === 1 ? "" : "s"}`}
          </span>
        </button>
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
            <article className="design-preview nodrag" key={design.id}>
              <button
                className="design-preview-artwork"
                aria-label={`Review ${design.title}`}
                title="Double-click to open feedback"
                onClick={(event) => {
                  // Keyboard/assistive activation and touch need a direct way into feedback.
                  if (
                    event.detail === 0 ||
                    ("pointerType" in event.nativeEvent &&
                      event.nativeEvent.pointerType === "touch")
                  )
                    data.openDesign(design.id);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  data.openDesign(design.id);
                }}
              >
                <Artwork design={design} channel={data.channel} thumbnail />
              </button>
              <footer>
                <span>{design.title}</span>
                <button
                  className="icon-button"
                  aria-label={`Open ${design.title}`}
                  title="Open feedback"
                  onClick={() => data.openDesign(design.id)}
                >
                  <ArrowUpRight size={13} />
                </button>
              </footer>
            </article>
          ))
        ) : !data.onAddDesign ? (
          <div className="empty-state empty-state-compact version-empty">
            <p>A space for your first design.</p>
          </div>
        ) : null}
        {data.designs.length > data.visibleDesigns && (
          <button
            className="button quiet more-designs nodrag"
            onClick={() => data.openDesign(data.designs[data.visibleDesigns].id)}
          >
            +{data.designs.length - data.visibleDesigns} more designs
            <ChevronRight size={14} />
          </button>
        )}
        {data.onAddDesign && (
          <button
            type="button"
            className="project-add-design nodrag"
            aria-label={data.addDesignLabel}
            onClick={data.onAddDesign}
          >
            <Plus size={18} aria-hidden="true" />
            <span>Add design</span>
            {data.creationHint && <small>{data.creationHint}</small>}
          </button>
        )}
      </div>
    </article>
  );
});
/**
 * The deliverable's frame: a title bar with the name centred and its format beside it, and one
 * border that the version lines and the add-version row sit inside (see `buildCanvas`).
 */
function DeliverableFrame({ data }: NodeProps<DeliverableNode>) {
  return (
    <section className="deliverable-frame" aria-label={data.name}>
      <header className="deliverable-frame-bar">
        <h2 title={data.name}>{data.name}</h2>
        <p>
          {data.format} · {data.dimensions}
        </p>
      </header>
    </section>
  );
}
function AddVersionCard({ data }: NodeProps<AddVersionNode>) {
  return (
    <button
      type="button"
      className="project-add-version nodrag"
      aria-label={`New version for ${data.name}`}
      onClick={data.onCreate}
    >
      <Plus size={16} aria-hidden="true" />
      <span>Add version</span>
      {data.creationHint && <small>{data.creationHint}</small>}
    </button>
  );
}
export const nodeTypes = {
  version: VersionCard,
  deliverable: DeliverableFrame,
  addVersion: AddVersionCard,
};

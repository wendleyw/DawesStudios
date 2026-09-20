"use client";

import {
  Background,
  Controls,
  ReactFlow,
  useReactFlow,
  useStore,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Info,
  MessageSquare,
  Plus,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { formatDate, statusLabels } from "@/features/workspace/workspace-data";
import { Artwork } from "./artwork";
import { buildCanvas, canvasBounds, canvasFit } from "./canvas-layout";
import { ProjectDetails } from "./project-details";
import { CommentPanel } from "./comment-panel";
import { DesignViewer } from "./design-viewer";
import { ProjectActionDialog, type ProjectAction } from "./project-action-dialog";
import {
  useProjectDetail,
  type CanvasDesign,
  type CanvasVersion,
  type ProjectChannel,
} from "./project-data";
import { useProjectEvents } from "./project-events";
import "./projects.css";

type VersionNode = Node<
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
type DeliverableNode = Node<
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
          <span className="version-state">{data.version.status.replaceAll("_", " ")}</span>
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
          <div className="version-empty">
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
const nodeTypes = { version: VersionCard, deliverable: DeliverableHeader };

/**
 * Places the opening view once the canvas knows how wide it is.
 *
 * xyflow's own Fit View is not used on load: a project with several deliverables is a tall list, and
 * fitting its full height would centre it at a scale where nothing can be read and hide its first
 * version above the pane. The view is computed from the frames instead, so it does not depend on
 * xyflow having finished rendering, and it is applied once — a later resize, such as opening the
 * conversation panel, must not drag the canvas out from under the viewer. The Fit View control
 * remains for anyone who does want the whole project at once.
 */
function CanvasOpeningView({
  content,
  view,
}: {
  content: { width: number; height: number };
  view: { width: number; height: number };
}) {
  const { setViewport } = useReactFlow();
  // Setting a viewport before the pan/zoom instance exists is silently dropped.
  const ready = useStore((state) => !!state.panZoom);
  const placed = useRef(false);
  useEffect(() => {
    if (!ready || placed.current || view.width <= 0 || content.width <= 0) return;
    placed.current = true;
    void setViewport(canvasFit(content, view));
  }, [ready, content, view, setViewport]);
  return null;
}

export function ProjectPage({ projectId }: { projectId: string }) {
  const { profile } = useAuth();
  useProjectEvents(projectId);
  const parameters = useSearchParams();
  const [agencyChannel, setAgencyChannel] = useState<ProjectChannel>(
    parameters.get("channel") === "client" ? "client" : "internal",
  );
  const channel =
    profile?.role === "client"
      ? "client"
      : profile?.role === "designer"
        ? "internal"
        : agencyChannel;
  const data = useProjectDetail(projectId, channel);
  const [panel, setPanel] = useState<"conversation" | "details" | null>(null);
  const [selected, setSelected] = useState<{ designId: string; versionId: string } | null>(null);
  const [format, setFormat] = useState("");
  const [action, setAction] = useState<ProjectAction | null>(null);
  // The canvas pane's own size, which is all the opening view needs; the frames supply the rest.
  const [pane, setPane] = useState<HTMLDivElement | null>(null);
  const [view, setView] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!pane) return;
    const observer = new ResizeObserver(([entry]) =>
      setView({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(pane);
    return () => observer.disconnect();
  }, [pane]);
  const canProduce = profile?.role !== "client" && channel === "internal";
  if (data.isPending)
    return (
      <div className="page-content" role="status">
        Opening the project…
      </div>
    );
  if (data.error || !data.data)
    return (
      <div className="page-content">
        <h1>Project unavailable.</h1>
        <p>This project is unavailable or you do not have access.</p>
        <Link className="button" href="/home">
          Back to your work
        </Link>
      </div>
    );
  const { project, versions, designs, deliverables } = data.data;
  const chosenVersion = versions.find((version) => version.id === selected?.versionId);
  const chosenDeliverable = deliverables.find(
    (deliverable) => deliverable.id === chosenVersion?.deliverableId,
  );
  const shownDeliverables = deliverables.filter(
    (deliverable) => !format || deliverable.id === format,
  );
  const versionsByDeliverable = new Map(
    shownDeliverables.map((deliverable) => [
      deliverable.id,
      versions.filter((version) => version.deliverableId === deliverable.id),
    ]),
  );
  const designsByVersion = new Map(
    versions.map((version) => [
      version.id,
      designs.filter((design) => design.versionId === version.id),
    ]),
  );
  // One section per deliverable, stacked. The geometry is computed, not measured, so the canvas
  // lands in its final shape on first paint.
  const frames = buildCanvas(
    shownDeliverables.map((deliverable) => ({
      deliverable: { id: deliverable.id, width: deliverable.width, height: deliverable.height },
      versions: (versionsByDeliverable.get(deliverable.id) ?? []).map((version) => ({
        id: version.id,
        designCount: designsByVersion.get(version.id)?.length ?? 0,
        hasNote: Boolean(version.note),
        hasFeedback: Boolean(version.feedback),
      })),
    })),
  );
  const nodes: (VersionNode | DeliverableNode)[] = [];
  for (const frame of frames) {
    const deliverable = shownDeliverables.find((item) => item.id === frame.deliverableId);
    if (!deliverable) continue;
    const deliverableVersions = versionsByDeliverable.get(deliverable.id) ?? [];
    const latest = deliverableVersions.at(-1);
    const style = {
      width: frame.width,
      height: frame.height,
      pointerEvents: "all",
    } satisfies CSSProperties;
    if (frame.kind === "deliverable") {
      nodes.push({
        id: frame.id,
        type: "deliverable",
        position: { x: frame.x, y: frame.y },
        data: {
          name: deliverable.name,
          format: deliverable.format,
          dimensions:
            deliverable.width && deliverable.height
              ? `${deliverable.width} × ${deliverable.height} · ${deliverable.quantity} ${deliverable.quantity === 1 ? "piece" : "pieces"}`
              : `${deliverable.quantity} ${deliverable.quantity === 1 ? "piece" : "pieces"} · ${deliverable.scope}`,
          canProduce,
          onCreate: () =>
            setAction({
              kind: "version",
              deliverableId: deliverable.id,
              sourceVersionId: latest?.id,
            }),
        },
        style,
        draggable: false,
        selectable: false,
      });
      continue;
    }
    const version = deliverableVersions.find((item) => item.id === frame.versionId);
    if (!version) continue;
    nodes.push({
      id: version.id,
      type: "version",
      position: { x: frame.x, y: frame.y },
      data: {
        version,
        designs: designsByVersion.get(version.id) ?? [],
        channel,
        canProduce,
        canPublish: profile?.role === "agency" && channel === "internal",
        canReview:
          profile?.role === "client" &&
          version.id === latest?.id &&
          version.status === "pending" &&
          project.status !== "delivered",
        artworkHeight: frame.artworkHeight,
        visibleDesigns: frame.visible,
        openDesign: (id) => setSelected({ designId: id, versionId: version.id }),
        action: setAction,
      },
      style,
      draggable: false,
      selectable: false,
    });
  }

  return (
    <div className="project-page">
      <header className="project-header">
        <Link
          className="icon-button"
          href={`/clients/${project.client_id}/board`}
          aria-label="Back to board"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="project-heading">
          <h1>{project.title}</h1>
          <div>
            <span className={`status-badge ${project.status}`}>{statusLabels[project.status]}</span>
            <span>{formatDate(project.due_date)}</span>
          </div>
        </div>
        {!selected && (
          <div className="project-header-actions">
            <button
              className={`icon-button ${panel === "details" ? "selected" : ""}`}
              aria-label="Project details"
              aria-expanded={panel === "details"}
              onClick={() => setPanel(panel === "details" ? null : "details")}
            >
              <Info size={18} />
            </button>
            <button
              className={`button quiet ${panel === "conversation" ? "selected" : ""}`}
              aria-expanded={panel === "conversation"}
              onClick={() => setPanel(panel === "conversation" ? null : "conversation")}
            >
              <MessageSquare size={16} />
              Conversation
            </button>
          </div>
        )}
      </header>
      {selected && chosenVersion && chosenDeliverable ? (
        <DesignViewer
          key={`${channel}:${chosenVersion.id}`}
          projectId={projectId}
          version={chosenVersion}
          deliverable={chosenDeliverable}
          designs={designs.filter((design) => design.versionId === chosenVersion.id)}
          initialDesignId={selected.designId}
          channel={channel}
          onEdit={
            canProduce
              ? (design) => setAction({ kind: "edit-design", version: chosenVersion, design })
              : undefined
          }
          onClose={() => setSelected(null)}
        />
      ) : (
        <>
          <div className="project-toolbar">
            <div className="segmented-control">
              {profile?.role === "agency" ? (
                <>
                  <button
                    className={channel === "internal" ? "active" : ""}
                    onClick={() => setAgencyChannel("internal")}
                  >
                    Working files
                  </button>
                  <button
                    className={channel === "client" ? "active" : ""}
                    onClick={() => setAgencyChannel("client")}
                  >
                    Shared with client
                  </button>
                </>
              ) : (
                <span>{channel === "client" ? "Shared designs" : "Working files"}</span>
              )}
            </div>
            <label className="visually-hidden" htmlFor="deliverable-filter">
              Filter deliverable
            </label>
            <select
              id="deliverable-filter"
              value={format}
              onChange={(event) => setFormat(event.target.value)}
            >
              <option value="">All deliverables</option>
              {deliverables.map((deliverable) => (
                <option key={deliverable.id} value={deliverable.id}>
                  {deliverable.name}
                </option>
              ))}
            </select>
          </div>
          <div className="project-body">
            <div className="project-canvas" ref={setPane}>
              <ReactFlow
                key={`${channel}:${format}`}
                nodes={nodes}
                edges={[]}
                nodeTypes={nodeTypes}
                nodesConnectable={false}
                deleteKeyCode={null}
                defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                minZoom={0.2}
                maxZoom={1.5}
                panOnScroll
              >
                <CanvasOpeningView content={canvasBounds(frames)} view={view} />
                <Background gap={20} color="#d4d4d0" />
                <Controls showInteractive={false} />
              </ReactFlow>
              {versions.length === 0 && (
                <div className="canvas-empty-hint">
                  {canProduce
                    ? "Add a version to start shaping your ideas."
                    : "Your studio will share designs here when they’re ready."}
                </div>
              )}
            </div>
            {panel === "conversation" && (
              <CommentPanel key={channel} projectId={projectId} channel={channel} />
            )}
            {panel === "details" && (
              <ProjectDetails project={project} deliverables={deliverables} versions={versions} />
            )}
          </div>
        </>
      )}
      <ProjectActionDialog
        key={
          action
            ? `${action.kind}:${"version" in action ? action.version.id : action.deliverableId}`
            : "closed"
        }
        action={action}
        projectId={projectId}
        onClose={() => setAction(null)}
      />
    </div>
  );
}

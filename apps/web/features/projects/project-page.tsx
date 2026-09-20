"use client";

import {
  Background,
  Controls,
  ReactFlow,
  type Node,
  type NodeProps,
  type NodeChange,
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
import { memo, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { formatDate, statusLabels } from "@/features/workspace/workspace-data";
import { Artwork } from "./artwork";
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
    openDesign: (id: string) => void;
    action: (action: ProjectAction) => void;
  },
  "version"
>;
type DeliverableNode = Node<
  { name: string; format: string; dimensions: string; canProduce: boolean; onCreate: () => void },
  "deliverable"
>;

const VersionCard = memo(function VersionCard({ data }: NodeProps<VersionNode>) {
  return (
    <article className="version-card">
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
      <div className="version-designs">
        {data.designs.length ? (
          data.designs.slice(0, 2).map((design) => (
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
      </div>
      {data.designs.length > 2 && (
        <button
          className="button quiet more-designs nodrag"
          onClick={() => data.openDesign(data.designs[2].id)}
        >
          +{data.designs.length - 2} more designs
          <ChevronRight size={14} />
        </button>
      )}
      {data.version.note && <p className="version-note">{data.version.note}</p>}
      {data.version.feedback && (
        <p className="version-feedback">
          <strong>Client feedback</strong>
          {data.version.feedback}
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
  const [nodeHeights, setNodeHeights] = useState<Record<string, number>>({});
  function measureNodes(changes: NodeChange<VersionNode | DeliverableNode>[]) {
    const dimensions = changes.filter(
      (change) => change.type === "dimensions" && change.dimensions?.height,
    );
    if (!dimensions.length) return;
    setNodeHeights((current) => {
      const next = { ...current };
      let changed = false;
      for (const item of dimensions)
        if (
          item.type === "dimensions" &&
          item.dimensions &&
          Math.abs((current[item.id] ?? 0) - item.dimensions.height) > 0.5
        ) {
          next[item.id] = item.dimensions.height;
          changed = true;
        }
      return changed ? next : current;
    });
  }
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
  const nodes: (VersionNode | DeliverableNode)[] = [];
  deliverables
    .filter((deliverable) => !format || deliverable.id === format)
    .forEach((deliverable, column) => {
      const deliverableVersions = versions.filter(
        (version) => version.deliverableId === deliverable.id,
      );
      const latest = deliverableVersions.at(-1);
      nodes.push({
        id: `deliverable-${deliverable.id}`,
        type: "deliverable",
        position: { x: column * 332, y: 0 },
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
        style: { width: 296, pointerEvents: "all" },
        draggable: false,
        selectable: false,
      });
      let nextY = (nodeHeights[`deliverable-${deliverable.id}`] ?? 74) + 32;
      deliverableVersions.forEach((version) => {
        const versionDesigns = designs.filter((design) => design.versionId === version.id);
        nodes.push({
          id: version.id,
          type: "version",
          position: { x: column * 332, y: nextY },
          data: {
            version,
            designs: versionDesigns,
            channel,
            canProduce,
            canPublish: profile?.role === "agency" && channel === "internal",
            canReview:
              profile?.role === "client" &&
              version.id === latest?.id &&
              version.status === "pending" &&
              project.status !== "delivered",
            openDesign: (id) => setSelected({ designId: id, versionId: version.id }),
            action: setAction,
          },
          style: { width: 296, pointerEvents: "all" },
          draggable: false,
          selectable: false,
        });
        nextY += (nodeHeights[version.id] ?? 430) + 32;
      });
    });

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
            <div className="project-canvas">
              <ReactFlow
                key={`${channel}:${format}`}
                nodes={nodes}
                edges={[]}
                nodeTypes={nodeTypes}
                onNodesChange={measureNodes}
                nodesConnectable={false}
                deleteKeyCode={null}
                fitView
                fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
                minZoom={0.2}
                maxZoom={1.5}
                panOnScroll
              >
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

"use client";

import { Background, Controls, ReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { ArrowLeft, ChevronLeft, ChevronRight, MapPin, MousePointer2, Pencil } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import { Artwork } from "./artwork";
import { CommentPanel } from "./comment-panel";
import {
  useProjectComments,
  type CanvasComment,
  type CanvasDesign,
  type CanvasVersion,
  type ProjectChannel,
  type TableRow,
} from "./project-data";
import { formatTimecode, isVideoAsset, visiblePins } from "./video-pins";

import { useCommentDraft, type PendingPin } from "./comment-draft";

type ArtworkNode = Node<
  {
    design: CanvasDesign;
    channel: ProjectChannel;
    pinMode: boolean;
    comments: CanvasComment[];
    pendingPin: PendingPin | null;
    onPin: (pin: PendingPin) => void;
    selectedComment: string | null;
    onSelect: (id: string) => void;
    ratio: number;
    isVideo: boolean;
    videoRef: RefObject<HTMLVideoElement | null>;
    onTimeUpdate: (seconds: number) => void;
    onDurationChange: (seconds: number) => void;
  },
  "artwork"
>;

function ArtworkCanvasNode({ data }: NodeProps<ArtworkNode>) {
  return (
    <div
      className={`artwork-stage ${data.pinMode ? "pin-mode nodrag" : ""}`}
      style={{ aspectRatio: data.ratio }}
      tabIndex={data.pinMode ? 0 : undefined}
      role={data.pinMode ? "button" : undefined}
      aria-label={
        data.pinMode
          ? data.isVideo
            ? "Place a pin on this frame at the current time. Press Enter to pin the frame's center."
            : "Place a pin on this artwork. Press Enter for the center."
          : undefined
      }
      onKeyDown={(event) => {
        if (data.pinMode && ["Enter", " "].includes(event.key)) {
          event.preventDefault();
          data.onPin({ x: 0.5, y: 0.5 });
        }
      }}
      onPointerDown={(event) => {
        if (!data.pinMode) return;
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        data.onPin({
          x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
          y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
        });
      }}
    >
      <Artwork
        design={data.design}
        channel={data.channel}
        videoRef={data.videoRef}
        onTimeUpdate={data.onTimeUpdate}
        onDurationChange={data.onDurationChange}
      />
      {data.comments
        .filter((comment) => !comment.resolved && comment.pinX !== null && comment.pinY !== null)
        .map((comment, index) => (
          <button
            key={comment.id}
            className={`artwork-pin nodrag ${data.selectedComment === comment.id ? "selected" : ""}`}
            style={{ left: `${comment.pinX! * 100}%`, top: `${comment.pinY! * 100}%` }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => data.onSelect(comment.id)}
            aria-label={`View pin ${index + 1}: ${comment.body.slice(0, 60)}`}
          >
            {index + 1}
          </button>
        ))}
      {data.pendingPin && (
        <span
          className="artwork-pin pending"
          style={{ left: `${data.pendingPin.x * 100}%`, top: `${data.pendingPin.y * 100}%` }}
        >
          <MapPin size={15} />
        </span>
      )}
    </div>
  );
}
const nodeTypes = { artwork: ArtworkCanvasNode };

export function DesignViewer({
  projectId,
  version,
  designs,
  initialDesignId,
  deliverable,
  channel,
  onClose,
  onEdit,
}: {
  projectId: string;
  version: CanvasVersion;
  designs: CanvasDesign[];
  initialDesignId: string;
  deliverable: TableRow<"deliverables">;
  channel: ProjectChannel;
  onClose: () => void;
  onEdit?: (design: CanvasDesign) => void;
}) {
  const [designId, setDesignId] = useState(initialDesignId);
  const [pinMode, setPinMode] = useState(false);
  const [selectedComment, setSelectedComment] = useState<string | null>(null);
  // The playhead and the <video> element itself. Both are read by `placePin` below, which is why
  // they live here rather than inside `Artwork`: pausing on pin placement is this component's
  // decision, not the player's.
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const design = designs.find((item) => item.id === designId) ?? designs[0];
  const index = designs.findIndex((item) => item.id === design?.id);
  const { draft, update } = useCommentDraft(projectId, channel, design?.id);
  const pendingPin = draft.pin;
  function setPendingPin(pin: PendingPin | null) {
    update({ pin });
  }
  const comments = useProjectComments(projectId, channel, design?.id);
  if (!design) return null;
  const isVideo = isVideoAsset(design.assetPath);
  const commentList = comments.data ?? [];
  // On a still image every pin is drawn; on video only the ones near the current frame are, so a
  // long recording with dozens of comments does not paint them all over the same frame at once.
  const frameComments = isVideo ? visiblePins(commentList, currentTime) : commentList;
  const timedComments = commentList.filter((comment) => comment.pinT !== null);
  const ratio =
    deliverable.width && deliverable.height ? deliverable.width / deliverable.height : 0.8;
  function placePin(pin: PendingPin) {
    if (!isVideo) return setPendingPin(pin);
    // Pausing first is not a nicety. On a playing video the frame under the click is gone by the
    // time the pin is stored, so the coordinate would describe a frame nobody chose.
    videoRef.current?.pause();
    setPendingPin({ ...pin, t: videoRef.current?.currentTime ?? 0 });
  }
  const nodes: ArtworkNode[] = [
    {
      id: design.id,
      type: "artwork",
      position: { x: 0, y: 0 },
      data: {
        design,
        channel,
        pinMode,
        pendingPin,
        comments: frameComments,
        selectedComment,
        onSelect: setSelectedComment,
        onPin: (pin) => {
          placePin(pin);
          setPinMode(false);
        },
        ratio,
        isVideo,
        videoRef,
        onTimeUpdate: setCurrentTime,
        onDurationChange: setDuration,
      },
      style: { width: ratio < 1 ? 440 : 620, pointerEvents: "all" },
      draggable: false,
      selectable: false,
    },
  ];
  function changeDesign(nextIndex: number) {
    setDesignId(designs[nextIndex].id);
    setSelectedComment(null);
    setPinMode(false);
    setCurrentTime(0);
    setDuration(0);
  }

  return (
    <div className="design-viewer">
      <header className="design-viewer-toolbar">
        <button className="button quiet" onClick={onClose}>
          <ArrowLeft size={16} />
          All designs
        </button>
        <div>
          <strong>{design.title}</strong>
          <span>
            {deliverable.name} · V{version.number}
          </span>
        </div>
        <div className="viewer-mode-switch">
          {onEdit && (
            <button
              className="icon-button"
              aria-label="Edit working design"
              onClick={() => onEdit(design)}
            >
              <Pencil size={16} />
            </button>
          )}
          <button
            className={`icon-button ${!pinMode ? "selected" : ""}`}
            aria-label="Navigate designs"
            aria-pressed={!pinMode}
            onClick={() => setPinMode(false)}
          >
            <MousePointer2 size={16} />
          </button>
          <button
            className={`button quiet ${pinMode ? "selected" : ""}`}
            aria-pressed={pinMode}
            onClick={() => setPinMode(!pinMode)}
          >
            <MapPin size={15} />
            Add pin
          </button>
        </div>
      </header>
      <div className="design-viewer-body">
        <div className="design-viewport">
          <div className="design-canvas">
            <ReactFlow
              key={design.id}
              nodes={nodes}
              edges={[]}
              nodeTypes={nodeTypes}
              proOptions={{ hideAttribution: true }}
              fitView
              fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
              minZoom={0.15}
              maxZoom={3}
              nodesConnectable={false}
              deleteKeyCode={null}
              panOnDrag={!pinMode}
              panOnScroll
            >
              <Background color="#d4d4d0" gap={20} />
              <Controls showInteractive={false} />
            </ReactFlow>
            <div className="design-carousel">
              <button
                className="icon-button"
                aria-label="Previous design"
                disabled={index <= 0}
                onClick={() => changeDesign(index - 1)}
              >
                <ChevronLeft size={17} />
              </button>
              <span>
                {index + 1} of {designs.length} · V{version.number}
              </span>
              <button
                className="icon-button"
                aria-label="Next design"
                disabled={index >= designs.length - 1}
                onClick={() => changeDesign(index + 1)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
            {pinMode && <div className="canvas-hint">Click a detail to leave a pin.</div>}
          </div>
          {isVideo && duration > 0 && (
            // `role="group"`, not `role="list"`/`role="listitem"`: these are actionable seek
            // controls, not list items containing content, and `<button>`'s permitted-roles list
            // doesn't include `listitem` — a browser would just ignore that override and fall
            // back to the button's implicit role anyway.
            <div className="video-pin-track" role="group" aria-label="Comments in time">
              {timedComments.map((comment) => (
                <button
                  key={comment.id}
                  type="button"
                  className={`video-pin-marker ${selectedComment === comment.id ? "selected" : ""}`}
                  style={{ left: `${(comment.pinT! / duration) * 100}%` }}
                  aria-label={`Comment at ${formatTimecode(comment.pinT!)}: ${comment.body.slice(0, 60)}`}
                  onClick={() => {
                    if (videoRef.current) videoRef.current.currentTime = comment.pinT!;
                    setSelectedComment(comment.id);
                  }}
                />
              ))}
            </div>
          )}
        </div>
        <CommentPanel
          key={`${channel}:${design.id}`}
          projectId={projectId}
          channel={channel}
          versionId={version.id}
          designId={design.id}
          pendingPin={pendingPin}
          onClearPin={() => setPendingPin(null)}
          selectedComment={selectedComment}
          // Selecting a comment from the side list seeks to the moment it marks, exactly as
          // clicking its marker on the track below does. Without this the two controls disagree
          // about what selecting a pin means — the track seeks, the list only highlights — and a
          // timed comment opened from the list leaves the viewer on whatever frame happened to be
          // showing, which is the one frame the comment is not about.
          //
          // Done here rather than in an effect on `selectedComment`: an effect would not fire when
          // an already-selected comment is clicked again, which is exactly when someone who has
          // scrubbed away wants to come back, and its dependency on the comment array would make
          // it re-seek on every render and fight the person dragging the scrubber. Pausing first
          // is `placePin`'s reasoning — seeking a playing video lands a moment past the frame
          // asked for.
          onSelectComment={(id) => {
            setSelectedComment(id);
            const pinned = commentList.find((comment) => comment.id === id);
            if (!isVideo || pinned?.pinT == null || !videoRef.current) return;
            videoRef.current.pause();
            videoRef.current.currentTime = pinned.pinT;
          }}
        />
      </div>
    </div>
  );
}

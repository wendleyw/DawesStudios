"use client";

import { ReactFlow, type Node, type NodeChange } from "@xyflow/react";
import { CanvasBackground } from "@/features/shared/canvas-background";
import { canvasNavigation } from "@/features/shared/canvas-navigation";
import { boardNodeTypes } from "./board-nodes";
import { BoardCanvasControls } from "./board-canvas-controls";

/** The board's Canvas view: the xyflow surface, its node types and the shared zoom pill. */
export function BoardCanvasView({
  canvasRef,
  nodes,
  onNodesChange,
  onDragStart,
  onDragStop,
  content,
  viewport,
  zoomDockTarget,
  fitKey,
}: {
  canvasRef: (node: HTMLDivElement | null) => void;
  nodes: Node[];
  onNodesChange: (changes: NodeChange<Node>[]) => void;
  onDragStart: (nodeId: string, position: { x: number; y: number }) => void;
  onDragStop: (node: Node) => void;
  content: { width: number; height: number };
  viewport: { width: number; height: number };
  zoomDockTarget: HTMLDivElement | null;
  fitKey: string;
}) {
  return (
    <div className="board-canvas" aria-label="Project canvas" ref={canvasRef}>
      <ReactFlow
        {...canvasNavigation}
        nodes={nodes}
        edges={[]}
        nodeTypes={boardNodeTypes}
        proOptions={{ hideAttribution: true }}
        onNodesChange={onNodesChange}
        onNodeDragStart={(_event, node) => onDragStart(node.id, node.position)}
        onNodeDragStop={(_event, node) => onDragStop(node)}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={0.1}
        maxZoom={1.5}
        nodeDragThreshold={4}
        nodesConnectable={false}
        deleteKeyCode={null}
      >
        <CanvasBackground />
        <BoardCanvasControls
          content={content}
          view={viewport}
          portalTarget={zoomDockTarget}
          fitKey={fitKey}
        />
      </ReactFlow>
    </div>
  );
}

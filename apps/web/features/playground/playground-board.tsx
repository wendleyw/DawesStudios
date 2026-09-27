"use client";

import { CanvasBackground } from "@/features/shared/canvas-background";
import { canvasNavigation } from "@/features/shared/canvas-navigation";
import { CanvasControls } from "@/features/shared/canvas-controls";

import { ReactFlow } from "@xyflow/react";
import { useId, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import {
  PLAYGROUND_FULL_MESSAGE,
  PLAYGROUND_MAX_ITEMS,
  playgroundFileAccept,
} from "./playground-model";
import { PlaygroundNode, type PlaygroundCanvasNode } from "./playground-node";
import { PlaygroundViewport } from "./playground-viewport";
import { useFullscreenLayer } from "./use-fullscreen-layer";
import { usePlaygroundNavigationGuard } from "./use-playground-navigation-guard";
import { usePlaygroundDrop } from "./use-playground-drop";
import { usePlaygroundItems } from "./use-playground-items";
import { downloadBrandAssetFile } from "@/features/brand/brand-data";
import { downloadDesignAssetFile } from "@/features/projects/project-data";
import {
  copyAlbumFilesToBoard,
  PLAYGROUND_ALBUM_DRAG_TYPE,
  type AlbumFile,
  type CopyStatus,
} from "./playground-albums";
import { PlaygroundAlbumsPanel } from "./playground-albums-panel";
import { PlaygroundHeader } from "./playground-header";
import { PlaygroundNotices } from "./playground-notices";
import { PlaygroundInspector } from "./playground-inspector";
import "./playground.css";

const nodeTypes = { playgroundItem: PlaygroundNode };

export function PlaygroundBoard({
  clientId,
  projectId,
  onClose,
  returnLabel = "Back to project",
}: {
  clientId: string;
  projectId: string;
  onClose: () => void;
  returnLabel?: string;
}) {
  const { database, profile } = useAuth();
  const titleId = useId();
  const descriptionId = useId();
  // Album files being copied onto the board: a copy that is still downloading or that failed.
  const [copies, setCopies] = useState<CopyStatus[]>([]);
  const albumDrag = useRef<AlbumFile[] | null>(null);

  const board = usePlaygroundItems({ clientId, projectId, database });
  const { layer, heading, phase, beginExit, handleAnimationEnd } = useFullscreenLayer({
    onClose,
  });
  const { closeRequested, setCloseRequested, navigationBlocked, requestClose } =
    usePlaygroundNavigationGuard({
      busy: board.busy,
      unsavedCount: board.unsaved.length,
      phase,
      beginExit,
      locks: board.locks,
      layer,
    });
  const {
    canvas,
    fileInput,
    flow,
    setFlowInstance,
    dragOver,
    setDragOver,
    issues,
    setIssues,
    origin,
    viewCenter,
    addFiles,
  } = usePlaygroundDrop({
    boardId: board.boardId,
    itemCount: board.items.length,
    writeDraft: board.writeDraft,
    select: board.select,
    persist: board.persist,
  });

  function onCopyStatus(status: CopyStatus) {
    setCopies((current) => {
      const withoutId = current.filter((entry) => entry.id !== status.id);
      return status.state === "done" ? withoutId : [...withoutId, status];
    });
  }

  /** Downloads album files with the viewer's own session and adds them through the same `addFiles`
   * a native drop uses, so validation, storage and retry are the Playground's own. */
  async function copyAlbumFiles(files: AlbumFile[], point: { x: number; y: number }) {
    const downloaded = await copyAlbumFilesToBoard(
      files,
      point,
      {
        downloadBrand: (storagePath) => downloadBrandAssetFile(database, { path: storagePath }),
        downloadDesign: (assetPath, channel) =>
          downloadDesignAssetFile(database, { assetPath, channel }),
      },
      onCopyStatus,
    );
    if (downloaded.length) await addFiles(downloaded, point);
  }

  function retryCopy(status: Extract<CopyStatus, { state: "error" }>) {
    setCopies((current) => current.filter((entry) => entry.id !== status.id));
    void copyAlbumFiles([status.file], status.point);
  }

  return (
    <dialog
      ref={layer}
      className="fullscreen-layer playground-board"
      data-phase={phase}
      inert={phase === "exiting"}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          requestClose();
        }
      }}
      onAnimationEnd={handleAnimationEnd}
      onSubmit={(event) => event.stopPropagation()}
    >
      <div className="playground-shell">
        <PlaygroundHeader
          role={profile?.role}
          titleId={titleId}
          descriptionId={descriptionId}
          headingRef={heading}
          boardId={board.boardId}
          itemCount={board.items.length}
          maxItems={PLAYGROUND_MAX_ITEMS}
          closing={board.closing}
          busy={board.busy}
          unsavedCount={board.unsaved.length}
          isFetching={board.query.isFetching}
          fileInputRef={fileInput}
          fileAccept={playgroundFileAccept}
          onAddNote={() => board.addNote(origin())}
          onFilesSelected={(files) => void addFiles(files)}
          onRefresh={() => void board.refresh()}
          onRequestClose={requestClose}
          returnLabel={returnLabel}
        />
        <PlaygroundAlbumsPanel
          clientId={clientId}
          projectId={projectId}
          canAdd={!!board.boardId && !board.closing && board.items.length < PLAYGROUND_MAX_ITEMS}
          blockedReason={
            board.items.length >= PLAYGROUND_MAX_ITEMS ? PLAYGROUND_FULL_MESSAGE : undefined
          }
          viewCenter={viewCenter}
          onAdd={(files, point) => void copyAlbumFiles(files, point)}
          onDragStart={(files) => {
            albumDrag.current = files;
          }}
          onDragEnd={() => {
            albumDrag.current = null;
          }}
        />
        <PlaygroundNotices
          copies={copies}
          onRetryCopy={retryCopy}
          loadError={board.query.error}
          onRetryLoad={() => void board.refresh()}
          cleanupError={board.query.data?.cleanupError}
          onRetryCleanup={() => void board.refresh()}
          cleanupBusy={board.query.isFetching}
          issues={issues}
          onDismissIssue={(id) =>
            setIssues((current) => current.filter((issue) => issue.id !== id))
          }
          closeRequested={closeRequested}
          showCloseBanner={board.unsaved.length > 0 || board.busy}
          navigationBlocked={navigationBlocked}
          busy={board.busy}
          closing={board.closing}
          onKeepWorking={() => setCloseRequested(false)}
          onDiscardAndClose={() => void board.discardAndClose(beginExit)}
        />
        <div className="playground-workspace">
          <div
            ref={canvas}
            className={`playground-canvas dark-surface${dragOver ? " is-dragging-over" : ""}`}
            onDragOver={(event) => {
              if (
                event.dataTransfer.types.includes("Files") ||
                event.dataTransfer.types.includes(PLAYGROUND_ALBUM_DRAG_TYPE)
              ) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setDragOver(true);
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null))
                setDragOver(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDragOver(false);
              const point =
                flow.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ??
                origin();
              const dragged = albumDrag.current;
              albumDrag.current = null;
              if (dragged) {
                void copyAlbumFiles(dragged, point);
                return;
              }
              void addFiles(Array.from(event.dataTransfer.files), point);
            }}
          >
            <ReactFlow<PlaygroundCanvasNode>
              {...canvasNavigation}
              nodes={board.nodes}
              edges={[]}
              nodeTypes={nodeTypes}
              onInit={setFlowInstance}
              onNodesChange={board.nodesChange}
              onNodeClick={(event, node) => {
                if (!event.shiftKey && !event.metaKey && !event.ctrlKey) board.select(node.id);
                else board.setSelectedId(node.id);
              }}
              onPaneClick={() => board.clearSelection()}
              onNodeDragStop={(_event, _node, moved) =>
                moved.forEach((node) => board.geometry(node.id, node.position))
              }
              minZoom={0.15}
              maxZoom={2}
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
              deleteKeyCode={null}
              nodesConnectable={false}
              panOnDrag
              selectionKeyCode="Shift"
              proOptions={{ hideAttribution: true }}
            >
              <PlaygroundViewport selectedId={board.selected?.item.id ?? null} />
              <CanvasBackground />
              <CanvasControls />
            </ReactFlow>
            {board.query.isPending ? (
              <div className="playground-empty" role="status">
                <p>Opening your Playground…</p>
              </div>
            ) : !board.items.length && !board.query.error ? (
              <div className="playground-empty">
                <h3>A little room for ideas</h3>
                <p>Drop images and documents here, or start with a note.</p>
                <small>Images, PDF, text and Office documents · up to 25 MB each</small>
              </div>
            ) : null}
            {dragOver && (
              <div className="playground-drop-hint">Drop files to add them to your Playground</div>
            )}
          </div>
          {board.selected && (
            <PlaygroundInspector
              selected={board.selected}
              closing={board.closing}
              removeRequested={board.removeRequested}
              downloadBusy={board.downloadBusy}
              downloadError={board.downloadError}
              onClose={() => board.setSelectedId(null)}
              onEdit={board.edit}
              onSave={board.persist}
              onRemove={board.removeItem}
              onReloadSaved={board.reloadSaved}
              onDownload={board.download}
              onRequestRemove={board.setRemoveRequested}
            />
          )}
        </div>
        <footer className="playground-footer">
          <span>
            {board.items.length} / {PLAYGROUND_MAX_ITEMS} items
          </span>
          <span>Drag items · Shift + drag to select · Scroll to pan · Pinch to zoom</span>
        </footer>
      </div>
    </dialog>
  );
}

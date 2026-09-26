"use client";

import { CanvasBackground } from "@/features/shared/canvas-background";
import { canvasNavigation } from "@/features/shared/canvas-navigation";
import { CanvasControls } from "@/features/shared/canvas-controls";

import { ReactFlow, type NodeChange } from "@xyflow/react";
import { FilePlus2, LockKeyhole, Plus, RefreshCw, X } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { FormError } from "@/features/shared/form-error";
import {
  deletePlaygroundItem,
  discardPlaygroundFile,
  getPlaygroundDownload,
  savePlaygroundItem,
  uploadPlaygroundFile,
  useInvalidatePlayground,
  usePlayground,
} from "./playground-data";
import {
  batchPosition,
  isPlaygroundBusy,
  itemInput,
  mergePlaygroundDrafts,
  messageOf,
  PLAYGROUND_FULL_MESSAGE,
  PLAYGROUND_MAX_ITEMS,
  playgroundFileAccept,
  validatePlaygroundItem,
  type PlaygroundDraft,
} from "./playground-model";
import { PlaygroundNode, type PlaygroundCanvasNode } from "./playground-node";
import { PlaygroundViewport } from "./playground-viewport";
import { useFullscreenLayer } from "@/features/shared/use-fullscreen-layer";
import { usePlaygroundNavigationGuard } from "./use-playground-navigation-guard";
import { usePlaygroundDrop } from "./use-playground-drop";
import { downloadBrandAssetFile } from "@/features/brand/brand-data";
import { downloadDesignAssetFile } from "@/features/projects/project-data";
import {
  copyAlbumFilesToBoard,
  PLAYGROUND_ALBUM_DRAG_TYPE,
  type AlbumFile,
  type CopyStatus,
} from "./playground-albums";
import { PlaygroundAlbumsPanel } from "./playground-albums-panel";
import type { PlaygroundItemInput } from "./playground-types";
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
  const query = usePlayground({ clientId, projectId });
  const invalidate = useInvalidatePlayground();
  const titleId = useId();
  const descriptionId = useId();
  const noteTextId = useId();
  const [drafts, setDrafts] = useState<Record<string, PlaygroundDraft>>({});
  const draftsRef = useRef(drafts);
  const locks = useRef(new Set<string>());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const [hiddenIds, setHiddenIds] = useState(new Set<string>());
  const [closing, setClosing] = useState(false);
  const [removeRequested, setRemoveRequested] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  // Album files being copied onto the board: a copy that is still downloading or that failed.
  const [copies, setCopies] = useState<CopyStatus[]>([]);
  const albumDrag = useRef<AlbumFile[] | null>(null);
  const items = mergePlaygroundDrafts(query.data?.items ?? [], drafts, query.dataUpdatedAt).filter(
    (draft) => !hiddenIds.has(draft.item.id),
  );
  const selected = items.find((draft) => draft.item.id === selectedId);
  const busy = closing || items.some(isPlaygroundBusy);
  const unsaved = items.filter((draft) => draft.status !== "saved");
  const boardId = query.data?.boardId;

  const { layer, heading, phase, beginExit, handleAnimationEnd } = useFullscreenLayer({
    onClose,
  });
  const { closeRequested, setCloseRequested, navigationBlocked, requestClose } =
    usePlaygroundNavigationGuard({
      busy,
      unsavedCount: unsaved.length,
      phase,
      beginExit,
      locks,
      layer,
    });

  const writeDraft = useCallback((draft: PlaygroundDraft) => {
    draftsRef.current = { ...draftsRef.current, [draft.item.id]: draft };
    setDrafts(draftsRef.current);
  }, []);
  const forgetDraft = useCallback((id: string) => {
    const next = { ...draftsRef.current };
    delete next[id];
    draftsRef.current = next;
    setDrafts(next);
  }, []);
  function findDraft(id: string) {
    return items.find((draft) => draft.item.id === id);
  }
  function currentDraft(id: string) {
    const local = draftsRef.current[id];
    return local && local.status !== "saved" ? local : (findDraft(id) ?? local);
  }

  async function refresh() {
    const fresh = await query.refetch();
    if (!fresh.error && fresh.data) {
      // A confirmed server read supersedes committed overlays, including another person's
      // deletion. Dirty/error/deletion drafts remain available for recovery.
      for (const [id, draft] of Object.entries(draftsRef.current)) {
        const remote = fresh.data.items.find((item) => item.id === id);
        if (draft.status === "saved" && (!remote || remote.revision >= (draft.revision ?? 0)))
          forgetDraft(id);
      }
    }
    return fresh;
  }

  async function persist(id: string) {
    if (!boardId || locks.current.has(id)) return;
    let draft = currentDraft(id);
    if (!draft) return;
    locks.current.add(id);
    writeDraft({ ...draft, status: "saving", error: undefined, conflict: false });
    try {
      const item = validatePlaygroundItem(draft.item);
      if (draft.file && !draft.uploaded && item.asset_path) {
        await uploadPlaygroundFile(database, { path: item.asset_path, file: draft.file });
        draft = { ...draft, uploaded: true };
        writeDraft({ ...draft, status: "saving" });
      }
      const saved = await savePlaygroundItem(database, {
        boardId,
        item,
        expectedRevision: draft.revision,
      });
      writeDraft({
        item: itemInput(saved),
        revision: saved.revision,
        url: saved.url ?? draft.url,
        status: "saved",
        savedAfterRead: query.dataUpdatedAt,
      });
      void invalidate();
      void refresh();
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      const expiredStage =
        !!draft.file &&
        code === "42501" &&
        messageOf(error) === "Upload your file before saving this item";
      writeDraft({
        ...draft,
        ...(expiredStage ? { uploaded: false } : {}),
        status: "error",
        error: expiredStage
          ? "The unfinished upload expired. Retry to upload your file again."
          : messageOf(error),
        failedAction: "save",
        conflict: code === "PT409" || code === "40001",
      });
    } finally {
      locks.current.delete(id);
    }
  }

  function edit(id: string, update: Partial<PlaygroundItemInput>) {
    const draft = currentDraft(id);
    if (!draft || locks.current.has(id) || draft.failedAction === "delete") return;
    writeDraft({ ...draft, item: { ...draft.item, ...update }, status: "dirty", error: undefined });
  }

  function select(id: string) {
    setSelectedId(id);
    setSelectedIds(new Set([id]));
    setRemoveRequested(false);
    setDownloadError("");
  }

  function geometry(id: string, update: { x: number; y: number; width?: number; height?: number }) {
    edit(id, update);
    void persist(id);
  }

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
  } = usePlaygroundDrop({ boardId, itemCount: items.length, writeDraft, select, persist });

  function addNote() {
    if (!boardId || items.length >= PLAYGROUND_MAX_ITEMS) return;
    const id = crypto.randomUUID();
    writeDraft({
      item: {
        id,
        kind: "note",
        title: "New note",
        body: "",
        asset_path: null,
        mime_type: null,
        ...batchPosition(items.filter((draft) => draft.revision === null).length, origin()),
        width: 280,
        height: 220,
      },
      revision: null,
      status: "dirty",
    });
    select(id);
  }

  async function removeItem(id: string): Promise<boolean> {
    if (!boardId || locks.current.has(id)) return false;
    const draft = currentDraft(id);
    if (!draft) return true;
    locks.current.add(id);
    writeDraft({ ...draft, status: "deleting", error: undefined });
    try {
      let revision = draft.revision;
      // A lost save response may have committed an item whose local revision is still null.
      if (revision === null && (draft.uploaded || draft.failedAction)) {
        const fresh = await query.refetch();
        if (fresh.error) throw fresh.error;
        revision = fresh.data?.items.find((item) => item.id === id)?.revision ?? null;
      }
      if (revision !== null) {
        await deletePlaygroundItem(database, {
          boardId,
          itemId: id,
          expectedRevision: revision,
          assetPath: draft.item.asset_path,
        });
      } else if (draft.item.asset_path) {
        await discardPlaygroundFile(database, draft.item.asset_path);
      }
      setHiddenIds((current) => new Set([...current, id]));
      forgetDraft(id);
      if (selectedId === id) setSelectedId(null);
      setRemoveRequested(false);
      void invalidate();
      return true;
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      writeDraft({
        ...draft,
        status: "error",
        failedAction: "delete",
        error: messageOf(error),
        conflict: code === "PT409" || code === "40001",
      });
      setRemoveRequested(false);
      return false;
    } finally {
      locks.current.delete(id);
    }
  }

  async function download() {
    if (!selected?.item.asset_path) return;
    setDownloadBusy(true);
    setDownloadError("");
    try {
      const url = await getPlaygroundDownload(database, selected.item.asset_path);
      const link = document.createElement("a");
      link.href = url;
      link.download = selected.item.title;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      setDownloadError(messageOf(error));
    } finally {
      setDownloadBusy(false);
    }
  }

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

  async function discardAndClose() {
    if (busy) return;
    setClosing(true);
    try {
      for (const draft of unsaved) {
        if (draft.failedAction === "delete" && draft.conflict) {
          // The server rejected this stale removal. Discarding our attempt must leave the
          // collaborator's current item intact rather than retrying the same stale request.
          forgetDraft(draft.item.id);
          continue;
        }
        if (
          (draft.revision === null || draft.failedAction === "delete") &&
          !(await removeItem(draft.item.id))
        )
          return;
      }
      beginExit();
    } finally {
      setClosing(false);
    }
  }

  async function reloadSaved() {
    if (!selected) return;
    const fresh = await query.refetch();
    if (fresh.error) {
      writeDraft({ ...selected, status: "error", error: messageOf(fresh.error) });
      return;
    }
    const remote = fresh.data?.items.find((item) => item.id === selected.item.id);
    if (!remote) {
      if (selected.revision === null) {
        await removeItem(selected.item.id);
        return;
      }
      // The button explicitly discards the local edit. A remote deletion needs no new mutation.
      forgetDraft(selected.item.id);
      setHiddenIds((current) => new Set([...current, selected.item.id]));
      setSelectedId(null);
      setRemoveRequested(false);
      return;
    }
    // The query already owns this successful read. Keeping a second saved copy would
    // resurrect it if a later automatic refetch observes a collaborator's deletion.
    forgetDraft(selected.item.id);
    setRemoveRequested(false);
  }

  const nodes: PlaygroundCanvasNode[] = items.map((draft) => ({
    id: draft.item.id,
    type: "playgroundItem",
    position: { x: draft.item.x, y: draft.item.y },
    width: draft.item.width,
    height: draft.item.height,
    style: { width: draft.item.width, height: draft.item.height },
    selected: selectedIds.has(draft.item.id),
    draggable: !isPlaygroundBusy(draft) && draft.failedAction !== "delete",
    data: { draft, onSelect: select, onResize: geometry },
    ariaLabel: `${draft.item.kind}: ${draft.item.title}`,
  }));

  function nodesChange(changes: NodeChange<PlaygroundCanvasNode>[]) {
    for (const change of changes) {
      if (change.type === "position" && change.position) edit(change.id, change.position);
      if (change.type === "dimensions" && change.resizing && change.dimensions)
        edit(change.id, change.dimensions);
      if (change.type === "select" && change.selected) setSelectedId(change.id);
    }
    const selections = changes.filter((change) => change.type === "select");
    if (selections.length)
      setSelectedIds((current) => {
        const next = new Set(current);
        for (const change of selections) {
          if (change.selected) next.add(change.id);
          else next.delete(change.id);
        }
        return next;
      });
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
        <header className="playground-header">
          <div className="playground-identity">
            <h2 ref={heading} id={titleId} tabIndex={-1}>
              Playground
            </h2>
            <span
              className="playground-audience"
              title={
                profile?.role === "client"
                  ? "Only your client team can see these ideas"
                  : profile?.role === "designer"
                    ? "Only assigned designers can see these ideas"
                    : "Only your agency team can see these ideas"
              }
            >
              <LockKeyhole size={12} />
              {profile?.role === "client"
                ? "Client team"
                : profile?.role === "designer"
                  ? "Design team"
                  : "Agency team"}
            </span>
            <p id={descriptionId} className="visually-hidden">
              Ideas stay separate from project work and are visible only to your team.
            </p>
          </div>
          <div className="playground-toolbar">
            <button
              type="button"
              className="icon-button"
              aria-label="Add note"
              title="Add note"
              onClick={addNote}
              disabled={!boardId || items.length >= PLAYGROUND_MAX_ITEMS || closing}
            >
              <Plus size={15} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Add files"
              title="Add files"
              onClick={() => fileInput.current?.click()}
              disabled={!boardId || items.length >= PLAYGROUND_MAX_ITEMS || closing}
            >
              <FilePlus2 size={15} />
            </button>
            <input
              ref={fileInput}
              className="playground-file-input"
              type="file"
              hidden
              tabIndex={-1}
              multiple
              accept={playgroundFileAccept}
              aria-label="Add files to Playground"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void addFiles(files);
              }}
            />
            <span
              className={`playground-save-status ${busy || unsaved.length ? "has-changes" : ""}`}
              role="status"
            >
              {busy
                ? "Saving changes… Please keep Playground open."
                : unsaved.length
                  ? `${unsaved.length} item${unsaved.length === 1 ? " has" : "s have"} unsaved changes`
                  : "All changes saved"}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Refresh Playground"
              title="Refresh Playground"
              onClick={() => void refresh()}
              disabled={busy || query.isFetching}
            >
              <RefreshCw size={15} />
            </button>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={returnLabel}
            title={returnLabel}
            onClick={requestClose}
            disabled={busy}
          >
            <X size={17} />
          </button>
        </header>
        <PlaygroundAlbumsPanel
          clientId={clientId}
          projectId={projectId}
          canAdd={!!boardId && !closing && items.length < PLAYGROUND_MAX_ITEMS}
          blockedReason={items.length >= PLAYGROUND_MAX_ITEMS ? PLAYGROUND_FULL_MESSAGE : undefined}
          viewCenter={viewCenter}
          onAdd={(files, point) => void copyAlbumFiles(files, point)}
          onDragStart={(files) => {
            albumDrag.current = files;
          }}
          onDragEnd={() => {
            albumDrag.current = null;
          }}
        />
        {copies.length > 0 && (
          <div className="playground-upload-issues" role="status">
            {copies.map((status) => (
              <div key={status.id}>
                <span>
                  <strong>{status.file.title}:</strong>{" "}
                  {status.state === "error" ? status.error : "Copying…"}
                </span>
                {status.state === "error" && (
                  <button type="button" className="button" onClick={() => retryCopy(status)}>
                    Try again
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {query.error && (
          <div className="playground-banner">
            <FormError>{query.error.message}</FormError>
            <button type="button" className="button" onClick={() => void refresh()}>
              Try loading again
            </button>
          </div>
        )}
        {query.data?.cleanupError && (
          <div className="playground-banner">
            <FormError>{query.data.cleanupError}</FormError>
            <button
              type="button"
              className="button"
              onClick={() => void refresh()}
              disabled={query.isFetching}
            >
              Retry file cleanup
            </button>
          </div>
        )}
        {issues.length > 0 && (
          <div className="playground-upload-issues" role="alert">
            {issues.map((issue) => (
              <div key={issue.id}>
                <span>
                  <strong>{issue.name}:</strong> {issue.message}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Dismiss error for ${issue.name}`}
                  onClick={() =>
                    setIssues((current) => current.filter((item) => item.id !== issue.id))
                  }
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        {closeRequested && (unsaved.length > 0 || busy) && (
          <div className="playground-banner" role="alert">
            <p>
              {navigationBlocked
                ? "Save or discard your Playground changes before leaving this project."
                : "Some changes are not saved. Keep working to retry, or discard the unsaved changes before leaving."}
              {navigationBlocked &&
                busy &&
                " A transfer or save is still in progress. Please wait for it to finish."}
            </p>
            <button
              type="button"
              className="button"
              onClick={() => setCloseRequested(false)}
              disabled={closing}
            >
              Keep working
            </button>
            <button
              type="button"
              className="button"
              onClick={() => void discardAndClose()}
              disabled={busy}
            >
              Discard unsaved changes and close
            </button>
          </div>
        )}
        <div className="playground-workspace">
          <div
            ref={canvas}
            className={`playground-canvas${dragOver ? " is-dragging-over" : ""}`}
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
              nodes={nodes}
              edges={[]}
              nodeTypes={nodeTypes}
              onInit={setFlowInstance}
              onNodesChange={nodesChange}
              onNodeClick={(event, node) => {
                if (!event.shiftKey && !event.metaKey && !event.ctrlKey) select(node.id);
                else setSelectedId(node.id);
              }}
              onPaneClick={() => {
                setSelectedId(null);
                setSelectedIds(new Set());
              }}
              onNodeDragStop={(_event, _node, moved) =>
                moved.forEach((node) => geometry(node.id, node.position))
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
              <PlaygroundViewport selectedId={selected?.item.id ?? null} />
              <CanvasBackground />
              <CanvasControls />
            </ReactFlow>
            {query.isPending ? (
              <div className="playground-empty" role="status">
                <p>Opening your Playground…</p>
              </div>
            ) : !items.length && !query.error ? (
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
          {selected && (
            <aside className="playground-inspector" aria-label="Selected item">
              <header>
                <h3>{selected.item.kind === "note" ? "Edit note" : "Edit item"}</h3>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Close item editor"
                  onClick={() => setSelectedId(null)}
                >
                  <X size={16} />
                </button>
              </header>
              <form
                className="stack-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void persist(selected.item.id);
                }}
              >
                <fieldset
                  disabled={
                    isPlaygroundBusy(selected) || selected.failedAction === "delete" || closing
                  }
                >
                  <label>
                    {selected.item.kind === "note" ? "Note title" : "Item title"}
                    <input
                      value={selected.item.title}
                      maxLength={160}
                      onChange={(event) => edit(selected.item.id, { title: event.target.value })}
                    />
                  </label>
                  <div className="playground-field">
                    <label htmlFor={noteTextId}>
                      {selected.item.kind === "note" ? "Note text" : "Description"}
                    </label>
                    <textarea
                      id={noteTextId}
                      value={selected.item.body}
                      maxLength={20_000}
                      rows={5}
                      onChange={(event) => edit(selected.item.id, { body: event.target.value })}
                    />
                  </div>
                  <details className="playground-geometry">
                    <summary>Position and size</summary>
                    <div>
                      {(
                        [
                          ["x", "Horizontal position", -100000, 100000],
                          ["y", "Vertical position", -100000, 100000],
                          ["width", "Width", 100, 2400],
                          ["height", "Height", 100, 2400],
                        ] as const
                      ).map(([field, label, min, max]) => (
                        <label key={field}>
                          {label}
                          <input
                            type="number"
                            value={
                              Number.isFinite(selected.item[field]) ? selected.item[field] : ""
                            }
                            min={min}
                            max={max}
                            step={1}
                            onChange={(event) =>
                              edit(selected.item.id, { [field]: event.target.valueAsNumber })
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </details>
                  <button
                    type="submit"
                    className="button primary"
                    disabled={selected.status === "saved"}
                  >
                    {selected.item.kind === "note" ? "Save note" : "Save item"}
                  </button>
                </fieldset>
                {selected.error && (
                  <div>
                    <FormError>{selected.error}</FormError>
                    <p className="playground-help">Your local changes are still here.</p>
                    {!(selected.conflict && selected.failedAction === "delete") && (
                      <button
                        type="button"
                        className="button"
                        onClick={() =>
                          selected.failedAction === "delete"
                            ? void removeItem(selected.item.id)
                            : void persist(selected.item.id)
                        }
                      >
                        Retry {selected.failedAction === "delete" ? "removal" : "save"}
                      </button>
                    )}
                    {selected.conflict && (
                      <button type="button" className="button" onClick={() => void reloadSaved()}>
                        Discard my edits and load saved item
                      </button>
                    )}
                  </div>
                )}
              </form>
              {downloadError && <FormError>{downloadError}</FormError>}
              <div className="playground-item-actions">
                {selected.item.asset_path && (
                  <button
                    type="button"
                    className="button"
                    disabled={
                      downloadBusy ||
                      selected.revision === null ||
                      selected.failedAction === "delete"
                    }
                    onClick={() => void download()}
                  >
                    {downloadBusy ? "Preparing download…" : "Download file"}
                  </button>
                )}
                {removeRequested ? (
                  <div className="playground-remove-confirm">
                    <p>Remove this item and its file from Playground?</p>
                    <button
                      type="button"
                      className="button"
                      onClick={() => void removeItem(selected.item.id)}
                      disabled={isPlaygroundBusy(selected)}
                    >
                      Confirm removal
                    </button>
                    <button
                      type="button"
                      className="button"
                      onClick={() => setRemoveRequested(false)}
                    >
                      Keep item
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="button"
                    disabled={
                      isPlaygroundBusy(selected) ||
                      closing ||
                      (selected.conflict && selected.failedAction === "delete")
                    }
                    onClick={() => setRemoveRequested(true)}
                  >
                    Remove item
                  </button>
                )}
              </div>
            </aside>
          )}
        </div>
        <footer className="playground-footer">
          <span>
            {items.length} / {PLAYGROUND_MAX_ITEMS} items
          </span>
          <span>Drag items · Shift + drag to select · Scroll to pan · Pinch to zoom</span>
        </footer>
      </div>
    </dialog>
  );
}

"use client";

import { useCallback, useRef, useState } from "react";
import type { NodeChange } from "@xyflow/react";
import type { SupabaseDatabase } from "@/lib/supabase";
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
  PLAYGROUND_MAX_ITEMS,
  validatePlaygroundItem,
  type PlaygroundDraft,
} from "./playground-model";
import type { PlaygroundCanvasNode } from "./playground-node";
import type { PlaygroundItemInput, PlaygroundScope } from "./playground-types";

/**
 * Item drafts, persistence, selection and the remove/download flows for one Playground board,
 * since nearly every action reads or writes them: saving retains a successful upload if the item
 * save fails, a stale-revision save/delete offers explicit conflict recovery instead of silently
 * overwriting another person's work, and a confirmed server read (including an automatic refetch)
 * supersedes a committed local overlay so a remote deletion never leaves a phantom item.
 * `addNote` takes its placement point as an argument rather than computing it, since the viewport
 * origin lives in `usePlaygroundDrop`, which itself depends on this hook's
 * `writeDraft`/`select`/`persist`. `discardAndClose` likewise takes the fullscreen layer's
 * `beginExit` as an argument rather than depending on `useFullscreenLayer` directly.
 */
export function usePlaygroundItems({
  clientId,
  projectId,
  database,
}: PlaygroundScope & {
  database: SupabaseDatabase;
}) {
  const query = usePlayground({ clientId, projectId });
  const invalidate = useInvalidatePlayground();
  const [drafts, setDrafts] = useState<Record<string, PlaygroundDraft>>({});
  const draftsRef = useRef(drafts);
  const locks = useRef(new Set<string>());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const [hiddenIds, setHiddenIds] = useState(new Set<string>());
  const [removeRequested, setRemoveRequested] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [closing, setClosing] = useState(false);

  const items = mergePlaygroundDrafts(query.data?.items ?? [], drafts, query.dataUpdatedAt).filter(
    (draft) => !hiddenIds.has(draft.item.id),
  );
  const selected = items.find((draft) => draft.item.id === selectedId);
  const unsaved = items.filter((draft) => draft.status !== "saved");
  const boardId = query.data?.boardId;
  const busy = closing || items.some(isPlaygroundBusy);

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

  function clearSelection() {
    setSelectedId(null);
    setSelectedIds(new Set());
  }

  function geometry(id: string, update: { x: number; y: number; width?: number; height?: number }) {
    edit(id, update);
    void persist(id);
  }

  function addNote(point: { x: number; y: number }) {
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
        ...batchPosition(items.filter((draft) => draft.revision === null).length, point),
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

  async function discardAndClose(beginExit: () => void) {
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

  return {
    query,
    boardId,
    locks,
    busy,
    closing,
    items,
    selected,
    selectedId,
    setSelectedId,
    unsaved,
    writeDraft,
    refresh,
    persist,
    edit,
    select,
    clearSelection,
    geometry,
    addNote,
    removeItem,
    discardAndClose,
    download,
    downloadBusy,
    downloadError,
    reloadSaved,
    removeRequested,
    setRemoveRequested,
    nodes,
    nodesChange,
  };
}

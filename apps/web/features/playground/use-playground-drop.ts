"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import { mapWithConcurrency } from "@/features/playground/concurrency";
import {
  batchPosition,
  messageOf,
  PLAYGROUND_FULL_MESSAGE,
  PLAYGROUND_MAX_ITEMS,
  playgroundStorageName,
  preparePlaygroundFile,
  type PlaygroundDraft,
} from "./playground-model";
import type { PlaygroundCanvasNode } from "./playground-node";

/**
 * The canvas drop target, the file-picker input and the bounded upload queue both funnel into.
 * Owns the canvas and xyflow instance refs so `origin()` — the current viewport's top-left in
 * flow coordinates — is available for a dropped batch's placement and, through the caller, for a
 * keyboard-added note. A bounded queue of 3 concurrent transfers keeps a large drop from starting
 * hundreds of simultaneous requests; rejected files are reported individually while valid files
 * continue.
 */
export function usePlaygroundDrop({
  boardId,
  itemCount,
  writeDraft,
  select,
  persist,
}: {
  boardId: string | undefined;
  itemCount: number;
  writeDraft: (draft: PlaygroundDraft) => void;
  select: (id: string) => void;
  persist: (id: string) => Promise<void>;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const flow = useRef<ReactFlowInstance<PlaygroundCanvasNode> | null>(null);
  const objectUrls = useRef(new Set<string>());
  const [dragOver, setDragOver] = useState(false);
  const [issues, setIssues] = useState<{ id: string; name: string; message: string }[]>([]);

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  function setFlowInstance(instance: ReactFlowInstance<PlaygroundCanvasNode>) {
    flow.current = instance;
  }

  function origin() {
    const bounds = canvas.current?.getBoundingClientRect();
    return bounds && flow.current
      ? flow.current.screenToFlowPosition({ x: bounds.left + 48, y: bounds.top + 48 })
      : { x: 40, y: 40 };
  }

  /** The current viewport's center in flow coordinates — where a keyboard-triggered album add
   * lands, as distinct from `origin()` (a native drop or file-picker batch, anchored near the
   * viewport's top-left instead). */
  function viewCenter() {
    const bounds = canvas.current?.getBoundingClientRect();
    return bounds && flow.current
      ? flow.current.screenToFlowPosition({
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
        })
      : { x: 40, y: 40 };
  }

  async function addFiles(files: File[], point = origin()) {
    if (!boardId) return;
    const added: string[] = [];
    const rejected: typeof issues = [];
    const count = itemCount;
    for (const original of files) {
      try {
        if (count + added.length >= PLAYGROUND_MAX_ITEMS) throw new Error(PLAYGROUND_FULL_MESSAGE);
        const file = preparePlaygroundFile(original);
        const id = crypto.randomUUID();
        const image = file.type.startsWith("image/");
        const url = image ? URL.createObjectURL(file) : undefined;
        if (url) objectUrls.current.add(url);
        writeDraft({
          item: {
            id,
            kind: image ? "image" : "file",
            title: file.name.slice(0, 160),
            body: "",
            asset_path: `${boardId}/${id}/${playgroundStorageName(file.name)}`,
            mime_type: file.type,
            ...batchPosition(added.length, point),
            width: 280,
            height: image ? 220 : 170,
          },
          revision: null,
          status: "queued",
          file,
          url,
        });
        added.push(id);
      } catch (error) {
        rejected.push({ id: crypto.randomUUID(), name: original.name, message: messageOf(error) });
      }
    }
    setIssues((current) => [...current, ...rejected]);
    if (added.length) select(added[0]);
    // A bounded queue keeps a large drop from starting hundreds of simultaneous requests.
    await mapWithConcurrency(added, 3, (id) => persist(id));
  }

  return {
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
  };
}

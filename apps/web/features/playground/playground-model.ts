import { uploadExtensions } from "@/features/shared/upload-rules";
import {
  PLAYGROUND_FILE_MIMES,
  PLAYGROUND_MAX_FILE_BYTES,
  type PlaygroundItem,
  type PlaygroundItemInput,
} from "./playground-types";

export const PLAYGROUND_MAX_ITEMS = 500;
/** Why nothing more can be added once a board holds `PLAYGROUND_MAX_ITEMS` items. */
export const PLAYGROUND_FULL_MESSAGE =
  "This Playground holds 500 items. Remove an item before adding more.";

/** The message shown for a failed save, delete or upload attempt when the error carries none. */
export const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "The change could not be saved. Please try again.";

// Each entry's extensions come from the shared `uploadExtensions` vocabulary
// (`features/shared/upload-rules.ts`) rather than restating them; only the set of mime types
// accepted here — the Playground board's own allow-list — is specific to this feature.
export const playgroundFormats: Record<string, readonly string[]> = {
  "image/png": uploadExtensions["image/png"],
  "image/jpeg": uploadExtensions["image/jpeg"],
  "image/webp": uploadExtensions["image/webp"],
  "image/gif": uploadExtensions["image/gif"],
  "application/pdf": uploadExtensions["application/pdf"],
  "text/plain": uploadExtensions["text/plain"],
  "text/csv": uploadExtensions["text/csv"],
  "application/msword": uploadExtensions["application/msword"],
  "application/vnd.ms-excel": uploadExtensions["application/vnd.ms-excel"],
  "application/vnd.ms-powerpoint": uploadExtensions["application/vnd.ms-powerpoint"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    uploadExtensions["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    uploadExtensions["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    uploadExtensions["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  "application/rtf": uploadExtensions["application/rtf"],
  "text/rtf": uploadExtensions["text/rtf"],
};
export const playgroundFileAccept = [...new Set(Object.values(playgroundFormats).flat())]
  .map((extension) => `.${extension}`)
  .join(",");

export function preparePlaygroundFile(file: File): File {
  if (!file.size) throw new Error("This file is empty. Choose a file with content.");
  if (file.size > PLAYGROUND_MAX_FILE_BYTES) throw new Error("Choose a file no larger than 25 MB.");
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  let mime = file.type.toLowerCase();
  // Some desktop pickers omit Office/text MIME types. Infer only an absent generic type,
  // never turn an explicitly declared unsupported type into an accepted one.
  if (!mime || mime === "application/octet-stream") {
    mime =
      Object.keys(playgroundFormats).find((type) => playgroundFormats[type].includes(extension)) ??
      "";
  }
  if (
    !(PLAYGROUND_FILE_MIMES as readonly string[]).includes(mime) ||
    !playgroundFormats[mime]?.includes(extension)
  ) {
    throw new Error(
      "Choose a PNG, JPG, WebP, GIF, PDF, text, CSV, Word, Excel, PowerPoint, or RTF file.",
    );
  }
  return file.type === mime
    ? file
    : new File([file], file.name, { type: mime, lastModified: file.lastModified });
}

export function playgroundStorageName(name: string): string {
  const safe = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-115);
  return /^[a-zA-Z0-9]/.test(safe) ? safe : `file-${safe || "upload"}`;
}

export function batchPosition(index: number, origin: { x: number; y: number }) {
  return {
    x: Math.max(-100_000, Math.min(100_000, Math.round(origin.x + (index % 3) * 310))),
    y: Math.max(-100_000, Math.min(100_000, Math.round(origin.y + Math.floor(index / 3) * 250))),
  };
}

export function itemInput(item: PlaygroundItem): PlaygroundItemInput {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    body: item.body,
    asset_path: item.asset_path,
    mime_type: item.mime_type,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
  };
}

export function validatePlaygroundItem(item: PlaygroundItemInput): PlaygroundItemInput {
  const title = item.title.trim();
  if (!title) throw new Error("Add a title before saving.");
  if (title.length > 160) throw new Error("Keep the title within 160 characters.");
  if (item.body.length > 20_000) throw new Error("Keep the note within 20,000 characters.");
  if (![item.x, item.y].every((value) => Number.isFinite(value) && Math.abs(value) <= 100_000))
    throw new Error("Positions must be between -100,000 and 100,000.");
  if (
    ![item.width, item.height].every(
      (value) => Number.isFinite(value) && value >= 100 && value <= 2400,
    )
  )
    throw new Error("Width and height must be between 100 and 2,400.");
  return { ...item, title, body: item.body.trim() };
}

export type PlaygroundDraft = {
  item: PlaygroundItemInput;
  revision: number | null;
  url?: string;
  file?: File;
  uploaded?: boolean;
  status: "dirty" | "queued" | "saving" | "saved" | "error" | "deleting";
  error?: string;
  conflict?: boolean;
  failedAction?: "save" | "delete";
  /** The canonical query snapshot at save time; a later successful read supersedes this overlay. */
  savedAfterRead?: number;
};

export function isPlaygroundBusy(draft: PlaygroundDraft) {
  return ["queued", "saving", "deleting"].includes(draft.status);
}

export function mergePlaygroundDrafts(
  items: PlaygroundItem[],
  drafts: Record<string, PlaygroundDraft>,
  serverReadAt = 0,
) {
  const merged = new Map(
    items.map((item) => [
      item.id,
      {
        item: itemInput(item),
        revision: item.revision,
        url: item.url,
        status: "saved",
      } as PlaygroundDraft,
    ]),
  );
  for (const [id, draft] of Object.entries(drafts)) {
    const remote = merged.get(id);
    if (
      draft.status === "saved" &&
      draft.savedAfterRead !== undefined &&
      serverReadAt > draft.savedAfterRead
    )
      continue;
    if (draft.status === "saved" && remote && remote.revision! >= draft.revision!) continue;
    merged.set(id, draft);
  }
  return [...merged.values()];
}

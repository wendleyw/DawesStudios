export type PlaygroundScope = { clientId: string; projectId: string };

export type PlaygroundItem = {
  id: string;
  board_id: string;
  kind: "note" | "image" | "file";
  title: string;
  body: string;
  asset_path: string | null;
  mime_type: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  revision: number;
  url?: string;
};

export type PlaygroundItemInput = Omit<PlaygroundItem, "board_id" | "revision" | "url">;

export type PlaygroundData = { boardId: string; items: PlaygroundItem[]; cleanupError?: string };

export const PLAYGROUND_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const PLAYGROUND_IMAGE_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;
export const PLAYGROUND_FILE_MIMES = [
  ...PLAYGROUND_IMAGE_MIMES,
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/rtf",
  "text/rtf",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

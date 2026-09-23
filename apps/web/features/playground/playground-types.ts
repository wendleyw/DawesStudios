import type { UploadMime } from "@/features/shared/upload-rules";

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

// The Playground board's own 25 MiB ceiling — tighter than the shared `BUCKET_MAX_BYTES`. It must
// keep matching the effective `file_size_limit` (26214400 bytes) on the `playground-assets`
// bucket, set once in `supabase/migrations/202609230003_playground.sql` and left untouched by
// `202609230007_project_playground.sql`. Unlike the ceilings in `upload-rules.ts`, this one has no
// automated drift check against the migrations — raising it means updating both by hand.
export const PLAYGROUND_MAX_FILE_BYTES = 25 * 1024 * 1024;

// The board's own allow-list: wider than any other uploader (raster GIF, plain text/CSV, RTF and
// the legacy and OOXML Office formats on top of the standard image/PDF set), so it stays declared
// here rather than in `upload-rules.ts`. Each member still comes from the shared extension
// vocabulary — `satisfies readonly UploadMime[]` fails to compile if one does not — so
// `playground-model.ts` can build its accept list from that shared source instead of restating it.
export const PLAYGROUND_IMAGE_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const satisfies readonly UploadMime[];
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
] as const satisfies readonly UploadMime[];

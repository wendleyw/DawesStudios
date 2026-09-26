/**
 * Miro frame links: the form's pre-check and the URLs the product builds from stored ids.
 *
 * The database parses the pasted URL again (`private.parse_miro_board_url`) and is the authority;
 * this copy only lets the dialog refuse a bad link before anything is sent. The iframe and the
 * "Open in Miro" link are always rebuilt from `boardId` / `widgetId`, never from a pasted URL.
 */
export type MiroLink = { boardId: string; widgetId: string | null };

export const miroUrlHint = "Paste a Miro board or frame link (https://miro.com/app/board/…).";

const boardUrl =
  /^https:\/\/(?:www\.)?miro\.com\/app\/board\/([A-Za-z0-9_=%-]{6,80})\/?(\?[^#\s]*)?(#\S*)?$/;

export function parseMiroBoardUrl(url: string): MiroLink | null {
  const parts = boardUrl.exec(url.trim());
  if (!parts) return null;
  const boardId = parts[1].replaceAll("%3D", "=");
  if (!/^[A-Za-z0-9_=-]{6,64}$/.test(boardId)) return null;
  const widgetId = /[?&]moveToWidget=([^&]*)/.exec(parts[2] ?? "")?.[1] ?? null;
  if (widgetId !== null && !/^[0-9]{1,32}$/.test(widgetId)) return null;
  return { boardId, widgetId };
}

function build(path: "live-embed" | "board", link: MiroLink) {
  const base = `https://miro.com/app/${path}/${encodeURIComponent(link.boardId)}/`;
  // Without autoplay the live embed shows a "See the board" preview that needs an extra click.
  const query = [
    ...(path === "live-embed" ? ["autoplay=true"] : []),
    ...(link.widgetId ? [`moveToWidget=${link.widgetId}`] : []),
  ];
  return query.length ? `${base}?${query.join("&")}` : base;
}

export const miroEmbedUrl = (link: MiroLink) => build("live-embed", link);
export const miroBoardUrl = (link: MiroLink) => build("board", link);

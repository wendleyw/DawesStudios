"use client";

import { FileText, ImageIcon } from "lucide-react";
import {
  Fragment,
  useId,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  useBrandAssetFolders,
  useBrandAssetPreviewUrl,
  useBrandAssets,
} from "@/features/brand/brand-data";
import {
  buildBrandAlbums,
  clipboardDisabledReason,
  isPreviewableImage,
  PLAYGROUND_ALBUM_DRAG_TYPE,
  type Album,
  type AlbumFile,
} from "./playground-albums";

/** Today's Playground usage: dragging or Enter-adding an album file onto the board. */
type BoardMode = {
  mode?: "board";
  /** False while the board has no id yet, is closing, or is already at its 500-item cap — mirrors
   * the same gate the header's Add note/Add files buttons already use. */
  canAdd: boolean;
  /** Why nothing can be added right now, shown on every thumbnail while `canAdd` is false (the
   * 500-item cap); absent for a passing state such as loading or closing. */
  blockedReason?: string;
  viewCenter: () => { x: number; y: number };
  onAdd: (files: AlbumFile[], point: { x: number; y: number }) => void;
  onDragStart: (files: AlbumFile[]) => void;
  onDragEnd: () => void;
};

/** The Miro asset strip's usage: clicking a thumbnail copies it to the clipboard instead of adding
 * it to a board — there is no board to add to, select a range on, or drag onto. */
type ClipboardMode = {
  mode: "clipboard";
  onCopy: (file: AlbumFile) => Promise<void>;
  onDownload: (file: AlbumFile) => Promise<void>;
};

export type PlaygroundAlbumsPanelProps = {
  clientId: string;
  /** Albums shown before the Brand Hub albums this panel already builds — the caller's own
   * album, such as `buildPlaygroundAlbum`'s Playground album for the asset strip. */
  extraAlbums?: Album[];
} & (BoardMode | ClipboardMode);

export function PlaygroundAlbumsPanel(props: PlaygroundAlbumsPanelProps) {
  const { clientId, extraAlbums = [] } = props;
  const mode = props.mode ?? "board";
  const canAdd = props.mode === "clipboard" ? false : props.canAdd;
  const blockedReason = props.mode === "clipboard" ? undefined : props.blockedReason;
  const viewCenter = props.mode === "clipboard" ? undefined : props.viewCenter;
  const onAdd = props.mode === "clipboard" ? undefined : props.onAdd;
  const onDragStart = props.mode === "clipboard" ? undefined : props.onDragStart;
  const onDragEnd = props.mode === "clipboard" ? undefined : props.onDragEnd;
  const onCopy = props.mode === "clipboard" ? props.onCopy : undefined;
  const onDownload = props.mode === "clipboard" ? props.onDownload : undefined;

  const folders = useBrandAssetFolders(clientId);
  const assets = useBrandAssets(clientId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastIndex, setLastIndex] = useState<number | null>(null);
  const [copyState, setCopyState] = useState<{
    fileId: string;
    state: "copying" | "copied" | "failed";
  } | null>(null);
  const [downloadFailed, setDownloadFailed] = useState(false);
  // Only the latest click's file may ever update `copyState`: an earlier click's copy can still be
  // in flight (a slow download, a slow clipboard write) when a later click starts a new one, and
  // its eventual result must never overwrite what the later click already announced.
  const latestCopyRequest = useRef<string | null>(null);

  const albums: Album[] = [
    ...extraAlbums,
    ...buildBrandAlbums(folders.data ?? [], assets.data ?? []),
  ];
  const openAlbum = albums.find((album) => album.id === openId);
  const openFiles =
    openAlbum && mode === "clipboard"
      ? openAlbum.files.map((file) => ({ ...file, disabledReason: clipboardDisabledReason(file) }))
      : (openAlbum?.files ?? []);
  const firstBrandIndex = albums.findIndex((album) => album.group === "brand");
  const copiedFile = copyState
    ? openAlbum?.files.find((file) => file.id === copyState.fileId)
    : undefined;

  function openAlbumChip(id: string) {
    setSelectedIds([]);
    setLastIndex(null);
    setCopyState(null);
    setDownloadFailed(false);
    setOpenId((current) => (current === id ? null : id));
  }

  function toggleSelect(file: AlbumFile, index: number, shiftKey: boolean) {
    if (file.disabledReason) return;
    if (shiftKey && lastIndex !== null && openAlbum) {
      const [start, end] = lastIndex < index ? [lastIndex, index] : [index, lastIndex];
      const range = openAlbum.files.slice(start, end + 1).filter((entry) => !entry.disabledReason);
      setSelectedIds((current) => [...new Set([...current, ...range.map((entry) => entry.id)])]);
    } else {
      setSelectedIds((current) =>
        current.includes(file.id) ? current.filter((id) => id !== file.id) : [...current, file.id],
      );
    }
    setLastIndex(index);
  }

  async function copy(file: AlbumFile) {
    if (!onCopy) return;
    latestCopyRequest.current = file.id;
    setDownloadFailed(false);
    setCopyState({ fileId: file.id, state: "copying" });
    try {
      await onCopy(file);
      if (latestCopyRequest.current === file.id) setCopyState({ fileId: file.id, state: "copied" });
    } catch {
      if (latestCopyRequest.current === file.id) setCopyState({ fileId: file.id, state: "failed" });
    }
  }

  async function download(file: AlbumFile) {
    if (!onDownload) return;
    try {
      await onDownload(file);
    } catch {
      setDownloadFailed(true);
    }
  }

  function handleDragStart(event: DragEvent, file: AlbumFile, index: number) {
    if (!canAdd || file.disabledReason) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(PLAYGROUND_ALBUM_DRAG_TYPE, file.id);
    const partOfSelection = !!openAlbum && selectedIds.includes(file.id);
    const dragged = partOfSelection
      ? openAlbum!.files.filter((entry) => selectedIds.includes(entry.id) && !entry.disabledReason)
      : [file];
    if (!partOfSelection) {
      setSelectedIds([file.id]);
      setLastIndex(index);
    }
    onDragStart?.(dragged);
  }

  return (
    <div className="playground-albums">
      <div className="playground-album-chips">
        {albums.map((album, index) => (
          // A shorthand `<>` fragment cannot carry the `key` a `.map()` output needs; `Fragment`
          // is used explicitly here so both the optional divider and the chip share one keyed
          // wrapper without an extra DOM element.
          <Fragment key={album.id}>
            {index > 0 && index === firstBrandIndex && extraAlbums.length > 0 && (
              <span className="playground-album-divider" aria-hidden="true" />
            )}
            <button
              type="button"
              aria-pressed={openId === album.id}
              className={`playground-album-chip${openId === album.id ? " is-open" : ""}`}
              onClick={() => openAlbumChip(album.id)}
            >
              {album.label}
            </button>
          </Fragment>
        ))}
      </div>
      {openAlbum && (
        <div className="playground-album-row">
          {openFiles.map((file, index) => (
            <AlbumThumbnail
              key={file.id}
              file={file}
              mode={mode}
              blockedReason={canAdd ? undefined : blockedReason}
              selected={mode === "board" && selectedIds.includes(file.id)}
              onClick={(event) =>
                mode === "clipboard" ? copy(file) : toggleSelect(file, index, event.shiftKey)
              }
              onKeyDown={(event) => {
                if (mode === "board" && event.key === "Enter" && canAdd && !file.disabledReason) {
                  event.preventDefault();
                  onAdd?.([file], viewCenter!());
                }
              }}
              onDragStart={(event) => {
                if (mode === "clipboard") {
                  event.preventDefault();
                  return;
                }
                handleDragStart(event, file, index);
              }}
              onDragEnd={() => {
                if (mode === "board") onDragEnd?.();
              }}
            />
          ))}
        </div>
      )}
      {mode === "clipboard" && copyState && (
        <p className="playground-album-copy-status" role="status">
          {copyState.state === "copied" && "Copied — paste in Miro with ⌘V / Ctrl+V"}
          {copyState.state === "failed" &&
            (downloadFailed ? (
              "Couldn't download this file."
            ) : (
              <>
                Couldn&apos;t copy this image.
                <button
                  type="button"
                  className="button quiet"
                  aria-label={`Download ${copiedFile?.title ?? ""}`}
                  onClick={() => copiedFile && download(copiedFile)}
                >
                  Download
                </button>
              </>
            ))}
        </p>
      )}
    </div>
  );
}

function AlbumThumbnail({
  file,
  mode,
  blockedReason,
  selected,
  onClick,
  onKeyDown,
  onDragStart,
  onDragEnd,
}: {
  file: AlbumFile;
  mode: "board" | "clipboard";
  blockedReason?: string;
  selected: boolean;
  onClick: (event: MouseEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
}) {
  const isClipboard = mode === "clipboard";
  const previewable = isPreviewableImage(file.mimeType) && !file.disabledReason;
  const brandPreview = useBrandAssetPreviewUrl(
    file.id,
    file.source.kind === "brand" ? file.source.storagePath : null,
    previewable && file.source.kind === "brand",
  );
  const url = file.source.kind === "brand" ? brandPreview.data : file.source.previewUrl;
  const reason = file.disabledReason ?? blockedReason;
  const reasonId = useId();
  return (
    <span className="playground-album-thumb-slot">
      <button
        type="button"
        className={`playground-album-thumb${!isClipboard && selected ? " is-selected" : ""}${reason ? " is-disabled" : ""}`}
        aria-disabled={!!reason}
        aria-pressed={isClipboard ? undefined : selected}
        aria-label={isClipboard ? `Copy ${file.title}` : undefined}
        aria-describedby={reason ? reasonId : undefined}
        title={reason ? undefined : file.title}
        draggable={!isClipboard && !reason}
        onClick={(event) => {
          if (reason) return;
          onClick(event);
        }}
        onKeyDown={onKeyDown}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        {previewable && url ? (
          // Short-lived signed private URLs are intentional; they must not enter an image proxy.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" draggable={false} />
        ) : previewable ? (
          <ImageIcon size={24} aria-hidden />
        ) : (
          <FileText size={24} aria-hidden />
        )}
        <span>{file.title}</span>
      </button>
      {/* A `title` tooltip never shows on keyboard focus, so the reason is text of its own, shown
          beside the thumbnail on hover and focus. */}
      {reason && (
        <span className="playground-album-thumb-reason" id={reasonId} role="tooltip">
          {reason}
        </span>
      )}
    </span>
  );
}

"use client";

import { FileText, ImageIcon } from "lucide-react";
import {
  Fragment,
  useId,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useAuth } from "@/features/auth/auth-provider";
import {
  useBrandAssetFolders,
  useBrandAssetPreviewUrl,
  useBrandAssets,
} from "@/features/brand/brand-data";
import {
  useDesignAssetUrl,
  useProjectDetail,
  type ProjectChannel,
} from "@/features/projects/project-data";
import {
  buildBrandAlbums,
  buildProjectAlbums,
  isPreviewableImage,
  PLAYGROUND_ALBUM_DRAG_TYPE,
  type Album,
  type AlbumFile,
} from "./playground-albums";

export type PlaygroundAlbumsPanelProps = {
  clientId: string;
  projectId: string;
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

export function PlaygroundAlbumsPanel({
  clientId,
  projectId,
  canAdd,
  blockedReason,
  viewCenter,
  onAdd,
  onDragStart,
  onDragEnd,
}: PlaygroundAlbumsPanelProps) {
  const { profile } = useAuth();
  const channel: ProjectChannel = profile?.role === "client" ? "client" : "internal";
  const folders = useBrandAssetFolders(clientId);
  const assets = useBrandAssets(clientId);
  const project = useProjectDetail(projectId, channel);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastIndex, setLastIndex] = useState<number | null>(null);

  const albums: Album[] = [
    ...buildBrandAlbums(folders.data ?? [], assets.data ?? []),
    ...buildProjectAlbums(
      project.data?.deliverables ?? [],
      project.data?.versions ?? [],
      project.data?.designs ?? [],
      channel,
    ),
  ];
  const openAlbum = albums.find((album) => album.id === openId);
  const firstProjectIndex = albums.findIndex((album) => album.group === "project");

  function openAlbumChip(id: string) {
    setSelectedIds([]);
    setLastIndex(null);
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
    onDragStart(dragged);
  }

  return (
    <div className="playground-albums">
      <div className="playground-album-chips">
        {albums.map((album, index) => (
          // A shorthand `<>` fragment cannot carry the `key` a `.map()` output needs; `Fragment`
          // is used explicitly here so both the optional divider and the chip share one keyed
          // wrapper without an extra DOM element.
          <Fragment key={album.id}>
            {index === firstProjectIndex && index > 0 && (
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
          {openAlbum.files.map((file, index) => (
            <AlbumThumbnail
              key={file.id}
              file={file}
              blockedReason={canAdd ? undefined : blockedReason}
              selected={selectedIds.includes(file.id)}
              onClick={(event) => toggleSelect(file, index, event.shiftKey)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canAdd && !file.disabledReason) {
                  event.preventDefault();
                  onAdd([file], viewCenter());
                }
              }}
              onDragStart={(event) => handleDragStart(event, file, index)}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AlbumThumbnail({
  file,
  blockedReason,
  selected,
  onClick,
  onKeyDown,
  onDragStart,
  onDragEnd,
}: {
  file: AlbumFile;
  blockedReason?: string;
  selected: boolean;
  onClick: (event: MouseEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
}) {
  const previewable = isPreviewableImage(file.mimeType) && !file.disabledReason;
  const brandPreview = useBrandAssetPreviewUrl(
    file.id,
    file.source.kind === "brand" ? file.source.storagePath : null,
    previewable && file.source.kind === "brand",
  );
  // `file.source.channel` already carries the panel's own computed channel for a design file —
  // `buildProjectAlbums` stamped it there — so there is no separate `channel` prop to keep in sync.
  // The "internal" fallback below is inert: the query stays disabled whenever the source isn't a
  // design, so its channel argument is never actually used.
  const designPreview = useDesignAssetUrl(
    file.source.kind === "design" ? file.source.assetPath : null,
    file.source.kind === "design" ? file.source.channel : "internal",
    previewable && file.source.kind === "design",
  );
  const url = file.source.kind === "brand" ? brandPreview.data : designPreview.data;
  const reason = file.disabledReason ?? blockedReason;
  const reasonId = useId();
  return (
    <span className="playground-album-thumb-slot">
      <button
        type="button"
        className={`playground-album-thumb${selected ? " is-selected" : ""}${reason ? " is-disabled" : ""}`}
        aria-disabled={!!reason}
        aria-pressed={selected}
        aria-describedby={reason ? reasonId : undefined}
        title={reason ? undefined : file.title}
        draggable={!reason}
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

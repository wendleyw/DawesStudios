"use client";

import { useAuth } from "@/features/auth/auth-provider";
import { downloadBrandAssetFile } from "@/features/brand/brand-data";
import { downloadDesignAssetFile } from "@/features/projects/project-data";
import { saveBlob } from "@/features/shared/save-blob";
import { copyImageToClipboard } from "./album-clipboard";
import { buildPlaygroundAlbum, fileNameFor, type AlbumFile } from "./playground-albums";
import { PlaygroundAlbumsPanel } from "./playground-albums-panel";
import { getPlaygroundDownload, usePlayground } from "./playground-data";

/**
 * The Playground's asset strip for Miro mode: the viewer's album row plus their own Playground
 * images, each copied as a PNG for pasting into Miro. Every read is one the viewer already has.
 */
export function PlaygroundAssetStrip({
  clientId,
  projectId,
  onOpenPlayground,
}: {
  clientId: string;
  projectId: string;
  onOpenPlayground: () => void;
}) {
  const { database } = useAuth();
  const playground = usePlayground({ clientId, projectId });
  const playgroundAlbum = buildPlaygroundAlbum(playground.data?.items ?? []);

  async function download(file: AlbumFile): Promise<Blob> {
    if (file.source.kind === "brand")
      return downloadBrandAssetFile(database, { path: file.source.storagePath });
    if (file.source.kind === "design")
      return downloadDesignAssetFile(database, {
        assetPath: file.source.assetPath,
        channel: file.source.channel,
      });
    const response = await fetch(await getPlaygroundDownload(database, file.source.assetPath));
    if (!response.ok) throw new Error("The image could not be downloaded.");
    return response.blob();
  }

  return (
    <div className="playground-asset-strip dark-surface">
      <PlaygroundAlbumsPanel
        mode="clipboard"
        clientId={clientId}
        projectId={projectId}
        extraAlbums={playgroundAlbum ? [playgroundAlbum] : []}
        onCopy={(file) => copyImageToClipboard(() => download(file))}
        onDownload={async (file) => {
          const path =
            file.source.kind === "brand" ? file.source.storagePath : file.source.assetPath;
          saveBlob(await download(file), fileNameFor(file.title, path));
        }}
      />
      <button type="button" className="button quiet" onClick={onOpenPlayground}>
        Open full Playground
      </button>
    </div>
  );
}

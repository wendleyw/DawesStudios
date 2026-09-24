"use client";

import { Download, FileImage, FileText, FileVideo } from "lucide-react";
import Link from "next/link";
import { fileTypeLabel } from "@/features/shared/upload-rules";
import { useDateFormat } from "@/features/workspace/workspace-data";
import type { ProjectAsset } from "./asset-data";

/**
 * One file in the Files grid: the image's own preview when one is signed, otherwise an icon and the
 * file's real type, then its category, name, project, size and date, and its download.
 */
export function FileCard({
  file,
  projectTitle,
  preview,
  downloading,
  onDownload,
}: {
  file: ProjectAsset;
  projectTitle: string | undefined;
  preview: string | undefined;
  downloading: boolean;
  onDownload: (file: ProjectAsset) => void;
}) {
  const { formatDate } = useDateFormat();
  const Icon = file.mime.startsWith("image/")
    ? FileImage
    : file.mime.startsWith("video/")
      ? FileVideo
      : FileText;
  return (
    <article className="file-card">
      <div className="file-icon">
        {preview ? (
          // Keep expiring, caller-scoped signed URLs out of Next.js's shared image optimization cache.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" loading="lazy" />
        ) : (
          <>
            <Icon size={31} aria-hidden="true" />
            <span>{fileTypeLabel(file.mime)}</span>
          </>
        )}
      </div>
      <div className="file-information">
        <span className="eyebrow">{file.category}</span>
        <h2>{file.name}</h2>
        <Link href={`/projects/${file.projectId}`}>{projectTitle}</Link>
        <footer>
          <span>
            {file.size ? `${(file.size / 1024).toFixed(0)} KB · ` : ""}
            {formatDate(file.date)}
          </span>
          <button
            className="icon-button"
            aria-label={`Download ${file.name}`}
            disabled={downloading}
            onClick={() => onDownload(file)}
          >
            <Download size={16} />
          </button>
        </footer>
      </div>
    </article>
  );
}

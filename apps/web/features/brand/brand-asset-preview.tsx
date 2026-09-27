"use client";

import { FileText, Link2 } from "lucide-react";
import { useBrandAssetPreviewUrl, type BrandAsset } from "./brand-data";
import { isLinkAsset } from "./brand-model";

/**
 * A brand asset's preview: raster images as signed previews, anything else as a labelled icon.
 * `decorative` leaves the image without alternative text where the asset's name is printed beside it.
 */
export function AssetPreview({
  asset,
  decorative = false,
}: {
  asset: BrandAsset;
  decorative?: boolean;
}) {
  if (isLinkAsset(asset))
    return (
      <div className="brand-asset-preview">
        <Link2 size={24} aria-hidden="true" />
        <span>{linkHost(asset.link_url)}</span>
      </div>
    );
  return <FilePreview asset={asset} decorative={decorative} />;
}

function linkHost(url: string | null) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "Link";
  } catch {
    return "Link";
  }
}

function FilePreview({ asset, decorative }: { asset: BrandAsset; decorative: boolean }) {
  const canPreview =
    !!asset.storage_path &&
    ["image/png", "image/jpeg", "image/webp"].includes(asset.mime_type ?? "");
  const preview = useBrandAssetPreviewUrl(asset.id, asset.storage_path, canPreview);
  return (
    <div className="brand-asset-preview">
      {preview.data ? (
        // Keep expiring, caller-scoped signed URLs out of Next.js's shared image optimization cache.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview.data} alt={decorative ? "" : asset.name} loading="lazy" />
      ) : (
        <>
          <FileText size={30} />
          <span>
            {preview.isFetching
              ? "Loading preview…"
              : asset.mime_type === "application/pdf"
                ? "PDF document"
                : asset.mime_type === "image/svg+xml"
                  ? "SVG asset"
                  : "Brand resource"}
          </span>
        </>
      )}
    </div>
  );
}

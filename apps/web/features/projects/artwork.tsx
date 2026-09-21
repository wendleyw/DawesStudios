"use client";

import { useState } from "react";
import { useDesignAssetUrl, type CanvasDesign, type ProjectChannel } from "./project-data";

export function Artwork({
  design,
  channel,
  thumbnail = false,
}: {
  design: CanvasDesign;
  channel: ProjectChannel;
  thumbnail?: boolean;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const asset = useDesignAssetUrl(design.assetPath, channel);
  const content =
    typeof design.content === "object" && design.content && !Array.isArray(design.content)
      ? design.content
      : {};
  const field = (name: string, fallback = "") =>
    typeof content[name] === "string" ? (content[name] as string) : fallback;
  const color = (name: string, fallback: string) =>
    /^#[a-f\d]{3,8}$/i.test(field(name)) ? field(name) : fallback;
  if (design.assetPath)
    return asset.data && failedSource !== asset.data ? (
      // Private signed URLs must bypass the public image optimization cache.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="uploaded-artwork"
        // The design's title is already rendered beside this image, so repeating it here makes a
        // screen reader announce the same name twice. The artwork carries no information a caption
        // can express, which is what `alt=""` is for.
        alt=""
        src={asset.data}
        draggable={false}
        onError={() => setFailedSource(asset.data!)}
      />
    ) : (
      <div className="artwork-loading" role="status">
        {asset.error || failedSource ? (
          <>
            <span>Preview unavailable</span>
            {!thumbnail && (
              <button
                className="button quiet nodrag"
                type="button"
                disabled={asset.isFetching}
                onClick={(event) => {
                  event.stopPropagation();
                  setFailedSource(null);
                  void asset.refetch();
                }}
              >
                Retry preview
              </button>
            )}
          </>
        ) : (
          "Loading artwork…"
        )}
      </div>
    );
  return (
    <div
      className={`artwork ${thumbnail ? "artwork-thumbnail" : ""}`}
      style={{
        backgroundColor: color("background", "#efeee8"),
        color: color("foreground", "#242822"),
      }}
    >
      <span className="artwork-brand">{field("eyebrow", "CREATIVE STUDIO")}</span>
      <div className="artwork-composition">
        <div className="artwork-shape" style={{ backgroundColor: color("accent", "#c8cbb9") }} />
        <div className="artwork-title">{field("headline", design.title)}</div>
      </div>
      <div className="artwork-copy">
        <span>{field("subheading")}</span>
        <p>{field("body")}</p>
      </div>
      <span className="artwork-mark">↗</span>
    </div>
  );
}

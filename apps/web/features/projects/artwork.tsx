"use client";

import { useState, type RefObject } from "react";
import { Film } from "lucide-react";
import { useDesignAssetUrl, type CanvasDesign, type ProjectChannel } from "./project-data";
import { isVideoAsset } from "./video-pins";
import { VideoPlayer } from "./video-player";

export function Artwork({
  design,
  channel,
  thumbnail = false,
  videoRef,
  onTimeUpdate,
  onDurationChange,
  onVideoReadyChange,
}: {
  design: CanvasDesign;
  channel: ProjectChannel;
  thumbnail?: boolean;
  /** Only meaningful for a video design: the element the viewer pauses, reads and seeks. */
  videoRef?: RefObject<HTMLVideoElement | null>;
  onTimeUpdate?: (seconds: number) => void;
  onDurationChange?: (seconds: number) => void;
  onVideoReadyChange?: (ready: boolean) => void;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const video = isVideoAsset(design.assetPath);
  const asset = useDesignAssetUrl(design.assetPath, channel, !(video && thumbnail));
  const content =
    typeof design.content === "object" && design.content && !Array.isArray(design.content)
      ? design.content
      : {};
  const field = (name: string, fallback = "") =>
    typeof content[name] === "string" ? (content[name] as string) : fallback;
  const color = (name: string, fallback: string) =>
    /^#[a-f\d]{3,8}$/i.test(field(name)) ? field(name) : fallback;
  if (design.assetPath) {
    if (video && thumbnail) {
      return (
        <div className="artwork-video-placeholder">
          <Film size={28} aria-hidden="true" />
          <span>Video</span>
        </div>
      );
    }
    if (video) {
      return (
        <VideoPlayer
          key={`${channel}:${design.id}:${design.assetPath}`}
          source={asset.data}
          sourceError={!!asset.error}
          isFetching={asset.isFetching}
          retrySource={async () => {
            const result = await asset.refetch();
            if (result.error) throw result.error;
            if (!result.data) throw new Error("The video URL could not be loaded.");
            return result.data;
          }}
          videoRef={videoRef}
          onTimeUpdate={onTimeUpdate}
          onDurationChange={onDurationChange}
          onVideoReadyChange={onVideoReadyChange}
        />
      );
    }
    if (!(asset.data && failedSource !== asset.data)) {
      return (
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
    }
    return (
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
    );
  }
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

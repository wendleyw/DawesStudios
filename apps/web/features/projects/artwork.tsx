"use client";

import { useState, type RefObject } from "react";
import { useDesignAssetUrl, type CanvasDesign, type ProjectChannel } from "./project-data";
import { isVideoAsset } from "./video-pins";

export function Artwork({
  design,
  channel,
  thumbnail = false,
  videoRef,
  onTimeUpdate,
  onDurationChange,
}: {
  design: CanvasDesign;
  channel: ProjectChannel;
  thumbnail?: boolean;
  /** Only meaningful for a video design: the element the viewer pauses, reads and seeks. */
  videoRef?: RefObject<HTMLVideoElement | null>;
  onTimeUpdate?: (seconds: number) => void;
  onDurationChange?: (seconds: number) => void;
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
  if (design.assetPath) {
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
    if (isVideoAsset(design.assetPath)) {
      return (
        <video
          ref={videoRef}
          className="artwork-video"
          src={asset.data}
          // A thumbnail is a passive preview in a list: it plays silently and offers no
          // transport controls, the same role an <img> plays there. The full viewer always
          // shows controls so a person can play, pause and scrub without the pin tool.
          controls={!thumbnail}
          muted={thumbnail}
          preload="metadata"
          playsInline
          onTimeUpdate={(event) => onTimeUpdate?.(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => onDurationChange?.(event.currentTarget.duration)}
          // Unlike an <img>, a <video> can raise `error` and still be perfectly usable. A seek
          // backwards issues a fresh range request, and an aborted or briefly failed one fires
          // here while the element keeps every frame it has already buffered. Retiring the player
          // on that is unrecoverable by design — `failedSource === asset.data` stays true until
          // the signed URL is refreshed 55 minutes later or the page is reloaded — so a person
          // scrubbing back loses the video and only a refresh brings it back.
          //
          // `readyState === HAVE_NOTHING` is the distinction that matters: the source never
          // yielded anything, which is the genuinely terminal case an <img> error always is.
          // Anything above it means the element still holds usable media, so the error is
          // transient and the browser recovers on its own without the UI intervening.
          onError={(event) => {
            if (event.currentTarget.readyState === event.currentTarget.HAVE_NOTHING)
              setFailedSource(asset.data!);
          }}
        />
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

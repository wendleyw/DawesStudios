"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

type Playback = { time: number; playing: boolean; rate: number };

/** One media element per design; renewing credentials does not discard the viewing session. */
export function VideoPlayer({
  source,
  sourceError,
  isFetching,
  retrySource,
  videoRef,
  onTimeUpdate,
  onDurationChange,
  onVideoReadyChange,
}: {
  source?: string;
  sourceError: boolean;
  isFetching: boolean;
  retrySource: () => Promise<string>;
  videoRef?: RefObject<HTMLVideoElement | null>;
  onTimeUpdate?: (seconds: number) => void;
  onDurationChange?: (seconds: number) => void;
  onVideoReadyChange?: (ready: boolean) => void;
}) {
  const player = useRef<HTMLVideoElement | null>(null);
  const playback = useRef<Playback>({ time: 0, playing: false, rate: 1 });
  const pending = useRef<Playback | null>(null);
  const generation = useRef(0);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [retryError, setRetryError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [resumeBlocked, setResumeBlocked] = useState(false);
  const attach = useCallback(
    (element: HTMLVideoElement | null) => {
      player.current = element;
      if (videoRef) videoRef.current = element;
    },
    [videoRef],
  );

  const replaceSource = useCallback(
    (next: string, force = false) => {
      const video = player.current;
      if (!video || (!force && video.getAttribute("src") === next)) return;
      // A second renewal before metadata arrives must retain the original snapshot, not the
      // temporary zero playhead/paused state created by the first source replacement.
      pending.current ??=
        video.readyState > 0
          ? {
              time: video.currentTime,
              playing: !video.paused && !video.ended,
              rate: video.playbackRate,
            }
          : { ...playback.current };
      generation.current += 1;
      onVideoReadyChange?.(false);
      video.src = next;
      video.load();
    },
    [onVideoReadyChange],
  );

  useEffect(() => {
    if (source) replaceSource(source);
  }, [source, replaceSource]);

  function remember(video: HTMLVideoElement) {
    if (pending.current || video.readyState === 0) return;
    playback.current = {
      time: video.currentTime,
      playing: !video.paused && !video.ended,
      rate: video.playbackRate,
    };
  }

  async function retry() {
    if (retrying || isFetching) return;
    setRetrying(true);
    setRetryError(false);
    try {
      const previous = player.current?.getAttribute("src");
      const next = await retrySource();
      // A repeated signature can be identical within one signing second. Explicit retry
      // still reloads it; a newly applied URL is not loaded twice by the query update.
      replaceSource(next, previous === next);
      setFailedSource(null);
    } catch {
      setRetryError(true);
    } finally {
      setRetrying(false);
    }
  }

  const failed = (!source && sourceError) || retryError || (!!source && failedSource === source);
  return (
    <div className="artwork-video-player">
      <video
        ref={attach}
        className="artwork-video"
        controls
        preload="metadata"
        playsInline
        onTimeUpdate={(event) => {
          remember(event.currentTarget);
          if (!pending.current) onTimeUpdate?.(event.currentTarget.currentTime);
        }}
        onPlay={(event) => {
          remember(event.currentTarget);
          setResumeBlocked(false);
        }}
        onPause={(event) => remember(event.currentTarget)}
        onRateChange={(event) => remember(event.currentTarget)}
        onSeeked={(event) => {
          if (event.currentTarget.readyState === 0 || pending.current) return;
          remember(event.currentTarget);
          onTimeUpdate?.(event.currentTarget.currentTime);
          setFailedSource(null);
          setRetryError(false);
          onVideoReadyChange?.(true);
        }}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          const restore = pending.current;
          const currentGeneration = generation.current;
          onDurationChange?.(video.duration);
          if (restore) {
            const restoredTime = Math.max(
              0,
              Math.min(
                restore.time,
                Number.isFinite(video.duration) ? video.duration : restore.time,
              ),
            );
            if (Math.abs(video.currentTime - restoredTime) > 0.001)
              video.currentTime = restoredTime;
            video.playbackRate = restore.rate;
            playback.current = { ...restore, time: video.currentTime };
            pending.current = null;
          }
          onTimeUpdate?.(video.currentTime);
          setFailedSource(null);
          setRetryError(false);
          // Setting currentTime after metadata can start an asynchronous seek. Timed pin
          // actions must wait until that restoration has completed, not read a reset frame.
          if (!video.seeking) onVideoReadyChange?.(true);
          if (restore?.playing) {
            void video.play().catch(() => {
              if (player.current === video && generation.current === currentGeneration)
                setResumeBlocked(true);
            });
          }
        }}
        onPlaying={() => {
          setFailedSource(null);
          setRetryError(false);
        }}
        onError={(event) => {
          // Aborted range requests can report an error while buffered media still works.
          // Preserve the existing controls/frame; only an unusable source needs retry UI.
          if (event.currentTarget.readyState === 0) {
            onVideoReadyChange?.(false);
            setFailedSource(event.currentTarget.getAttribute("src"));
          }
        }}
      />
      {(!source || failed) && (
        <div className="artwork-video-feedback" role="status">
          <span>{failed ? "Preview unavailable" : "Loading video…"}</span>
          {failed && (
            <button
              className="button quiet nodrag"
              type="button"
              disabled={retrying || isFetching}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                void retry();
              }}
            >
              {retrying ? "Retrying…" : "Retry preview"}
            </button>
          )}
        </div>
      )}
      {resumeBlocked && (
        <p className="artwork-video-feedback" role="status">
          Playback is paused. Press Play to continue.
        </p>
      )}
    </div>
  );
}

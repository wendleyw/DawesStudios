"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

function subscribeToMotionPreference(onChange: () => void) {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * The studio's mark at the top of the sidebar. The animation plays when the app opens, rests on
 * the finished mark for ten seconds, and plays again; it is silent decoration, because the link around it carries the
 * name. With reduced motion, or where the browser cannot play it, the finished mark shows as a
 * still. `public/brand/logo-mark.webm` is a small, silent, inverted cut of the master file
 * `brand/logo-animation.webm`, screened onto the sidebar by `.brand-mark` in `workspace.css`.
 */
export function BrandMark() {
  const reducedMotion = useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(reducedMotionQuery).matches,
    () => false,
  );
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    // Browsers only autoplay muted media, and React does not reflect `muted` as an attribute.
    element.muted = true;
    element.play().catch(() => {});
    // After each run the finished mark rests for ten seconds, then the animation plays again.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const replay = () => {
      timer = setTimeout(() => {
        element.currentTime = 0;
        element.play().catch(() => {});
      }, 10_000);
    };
    element.addEventListener("ended", replay);
    return () => {
      element.removeEventListener("ended", replay);
      clearTimeout(timer);
    };
  }, [reducedMotion, failed]);

  if (reducedMotion || failed)
    return (
      <Image
        className="brand-mark"
        src="/brand/logo-mark.webp"
        alt=""
        width={76}
        height={120}
        unoptimized
      />
    );
  return (
    <video
      ref={video}
      className="brand-mark"
      src="/brand/logo-mark.webm"
      width={76}
      height={120}
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      onError={() => setFailed(true)}
    />
  );
}

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
 * The studio's mark at the top of the sidebar. The animation plays once when the app opens and
 * rests on the finished mark; it is silent decoration, because the link around it carries the
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

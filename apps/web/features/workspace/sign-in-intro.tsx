"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/features/auth/auth-provider";

// The redirect out of /login sets this and the intro clears it after playing, so it plays on entering
// the system after a sign-in, not on a later reload or an in-app navigation.
const FLAG = "dawes:intro-after-sign-in";
// Longer than the 3.25-second animation: a video that stalls never keeps the workspace covered.
const maximumMs = 6_000;
const fadeMs = 400;

export function markSignInIntro() {
  try {
    sessionStorage.setItem(FLAG, "1");
  } catch {
    // Without storage the redirect still succeeds; the workspace simply opens without the intro.
  }
}

// Read on every render rather than consumed on mount: the intro clears the flag itself once it has
// faded out, and the server (and hydration) always renders without it.
function introRequested(): boolean {
  try {
    if (sessionStorage.getItem(FLAG) !== "1") return false;
  } catch {
    return false;
  }
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clearSignInIntro() {
  try {
    sessionStorage.removeItem(FLAG);
  } catch {
    // Nothing to clear without storage.
  }
}

const noSubscription = () => () => {};

/**
 * The studio's animated mark, centred on white, between signing in and the workspace. It plays
 * once, holds its finished frame until the workspace has loaded, and fades out; a click or key
 * skips it. It is silent decoration hidden from assistive technology, and never plays with reduced
 * motion. `public/brand/intro.webm` is a small, silent cut of the master `brand/logo-animation.webm`.
 */
export function SignInIntro() {
  const { session, profile, loading, error } = useAuth();
  // The shell's own failure message is ready to read too; the intro never hides it.
  const ready = !loading && Boolean(error || (session && profile));
  const requested = useSyncExternalStore(noSubscription, introRequested, () => false);
  const [ended, setEnded] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [done, setDone] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const shown = requested && !done;
  const leaving = skipped || (ended && ready);

  useEffect(() => {
    if (!shown) return;
    const element = video.current;
    const skip = () => setSkipped(true);
    if (element) {
      // Browsers only autoplay muted media, and React does not reflect `muted` as an attribute.
      element.muted = true;
      element.play().catch(skip);
    }
    const limit = setTimeout(skip, maximumMs);
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    return () => {
      clearTimeout(limit);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [shown]);

  useEffect(() => {
    if (!shown || !leaving) return;
    const timer = setTimeout(() => {
      clearSignInIntro();
      setDone(true);
    }, fadeMs);
    return () => clearTimeout(timer);
  }, [shown, leaving]);

  if (!shown) return null;
  return (
    <div className={`sign-in-intro${leaving ? " leaving" : ""}`} aria-hidden="true">
      <video
        ref={video}
        src="/brand/intro.webm"
        width={640}
        height={640}
        muted
        playsInline
        preload="auto"
        onEnded={() => setEnded(true)}
        onError={() => setSkipped(true)}
      />
    </div>
  );
}

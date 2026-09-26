"use client";

import { useEffect, useState } from "react";

/**
 * The current time, refreshed every `intervalMs` while mounted, rather than each caller freezing
 * its own `Date.now()` for its whole mounted lifetime. The Team page and the client People dialog
 * both call this with the same 60-second interval so `isInvitationPending` (`./team-data.ts`)
 * agrees between them and an invitation that expires while either is open drops out on its own.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

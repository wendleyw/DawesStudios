/**
 * What distinguishes a video design from an image one, and which of its pins belong on screen.
 *
 * The kind is read from the stored path's extension rather than from a column. `apps/media`
 * names every sanitised object after the type it verified, so the extension is derived from a
 * probe of the real container, not from what a browser claimed at upload.
 */

export { isVideoAsset } from "@/features/shared/upload-rules";

/** A pin's moment as a person reads it: `1:05`. Seconds are floored, never rounded up. */
export function formatTimecode(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * The pins to draw over the frame at `currentTime`.
 *
 * Without a window every comment in a ten-minute video would render at once and the overlay
 * would be unreadable. A pin with no time belongs to a still image and is always shown; the
 * window is a display concern and is deliberately not stored.
 */
export function visiblePins<T extends { pinT: number | null }>(
  pins: T[],
  currentTime: number,
  window = 0.5,
): T[] {
  return pins.filter((pin) => pin.pinT === null || Math.abs(pin.pinT - currentTime) <= window);
}

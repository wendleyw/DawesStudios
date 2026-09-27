/**
 * A small triangular mark in Google's Drive palette (green, yellow, blue), sized like the lucide
 * icons beside it. Decorative only — the link or button around it always carries its own
 * accessible name, so this glyph is `aria-hidden`.
 */
export function DriveIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <polygon fill="#4285F4" points="12,14.33 12,3 3,20" />
      <polygon fill="#0F9D58" points="12,14.33 3,20 21,20" />
      <polygon fill="#FFCD40" points="12,14.33 21,20 12,3" />
    </svg>
  );
}

"use client";

/**
 * The design form's collapsed "Or compose a text concept" fields: a text-only design alternative
 * to an uploaded image/video. Purely presentational — `field` reads a stored design's own content
 * (or the given fallback for a new design), the same helper `project-action-design.tsx` already
 * builds from `action`.
 */
export function DesignTextOptions({
  field,
}: {
  field: (name: string, fallback?: string) => string;
}) {
  return (
    <details className="design-text-options">
      <summary>Or compose a text concept</summary>
      <label>
        Brand label
        <input name="eyebrow" defaultValue={field("eyebrow")} maxLength={80} />
      </label>
      <label>
        Headline
        <textarea name="headline" defaultValue={field("headline")} rows={2} maxLength={240} />
      </label>
      <label>
        Supporting copy
        <textarea name="body" defaultValue={field("body")} rows={2} maxLength={1000} />
      </label>
      <div className="form-row">
        <label>
          Background
          <input type="color" name="background" defaultValue={field("background", "#f2f0e8")} />
        </label>
        <label>
          Text
          <input type="color" name="foreground" defaultValue={field("foreground", "#20231f")} />
        </label>
      </div>
    </details>
  );
}

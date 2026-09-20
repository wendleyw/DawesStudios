import type { TemplateContent } from "./brand-model";

export function TemplatePreview({
  content,
  width,
  height,
  compact = false,
}: {
  content: TemplateContent;
  width: number;
  height: number;
  compact?: boolean;
}) {
  const ratio = Math.max(1, width) / Math.max(1, height);
  const artwork = (
    <div
      className={`brand-template-art layout-${content.layout} ${compact ? "compact" : ""}`}
      style={{
        backgroundColor: content.background,
        color: content.foreground,
        aspectRatio: ratio,
        ...(compact ? { width: `min(100%, ${178 * ratio}px)` } : {}),
      }}
    >
      <span className="brand-art-eyebrow">{content.eyebrow || content.subheading}</span>
      <div className="brand-art-main">
        {content.layout !== "minimal" && (
          <div className="brand-art-accent" style={{ background: content.accent }} />
        )}
        <p className="brand-art-headline">{content.headline || "Your story starts here."}</p>
      </div>
      <div className="brand-art-copy">
        <span>{content.subheading}</span>
        <p>{content.body}</p>
        {content.cta && <span className="brand-art-cta">{content.cta}</span>}
      </div>
    </div>
  );
  return compact ? <div className="brand-template-stage">{artwork}</div> : artwork;
}

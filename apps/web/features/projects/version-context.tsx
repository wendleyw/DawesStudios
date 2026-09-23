import type { CanvasVersion, ProjectChannel } from "./project-data";
import { versionStatusLabel } from "@/features/workspace/workspace-data";

/** Original publication/review text remains readable without copying it into comment records. */
export function VersionContext({
  version,
  channel,
  onReview,
}: {
  version: CanvasVersion;
  channel: ProjectChannel;
  onReview?: () => void;
}) {
  return (
    <div className="version-context">
      <p className="version-context-heading">
        V{version.number} · {versionStatusLabel(version.status)}
      </p>
      <p className="version-context-hint">For all designs in this version.</p>
      {version.note && (
        <section>
          <h3>{channel === "client" ? "Studio note" : "Version note"}</h3>
          <p>{version.note}</p>
        </section>
      )}
      {version.feedback && (
        <section>
          <h3>{versionStatusLabel(version.status)}</h3>
          <p>{version.feedback}</p>
        </section>
      )}
      {onReview && (
        <button className="button primary" onClick={onReview}>
          Review version
        </button>
      )}
    </div>
  );
}

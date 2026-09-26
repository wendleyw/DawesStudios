import type { CanvasVersion } from "./project-data";

/**
 * Miro mode's rules: which versions can be shown on Miro, which one is shown, and how the choice
 * is kept in the URL. The versions come from the viewer's own channel, so a client only ever sees
 * client-board links and a designer only internal-board links.
 */
export type ProjectView = "versions" | "miro";

export function linkedVersions(versions: CanvasVersion[], deliverableId: string): CanvasVersion[] {
  return versions
    .filter(
      (version) => !!version.miro && (!deliverableId || version.deliverableId === deliverableId),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number);
}

/** The requested version when it is linked and shown; otherwise the newest linked one. */
export function pickMiroVersion(
  linked: CanvasVersion[],
  requestedId: string | null,
): CanvasVersion | null {
  return linked.find((version) => version.id === requestedId) ?? linked[0] ?? null;
}

export function miroVersionLabel(
  version: CanvasVersion,
  deliverables: { id: string; name: string }[],
): string {
  const name = deliverables.find((entry) => entry.id === version.deliverableId)?.name ?? "Version";
  return `${name} · V${version.number}`;
}

export function readProjectView(parameters: URLSearchParams): {
  view: ProjectView;
  versionId: string | null;
} {
  return parameters.get("view") === "miro"
    ? { view: "miro", versionId: parameters.get("version") }
    : { view: "versions", versionId: null };
}

export function writeProjectView(
  parameters: URLSearchParams,
  state: { view: ProjectView; versionId: string | null },
): string {
  const next = new URLSearchParams(parameters);
  next.delete("view");
  next.delete("version");
  if (state.view === "miro") {
    next.set("view", "miro");
    if (state.versionId) next.set("version", state.versionId);
  }
  return next.toString();
}

import type { CanvasVersion } from "./project-data";

/**
 * Miro mode's rules: which versions can be shown on Miro, which one is shown, and how the choice
 * is kept in the URL. The versions come from the viewer's own channel, so a client only ever sees
 * client-board links and a designer only internal-board links.
 */
export type ProjectView = "versions" | "miro";

/**
 * The versions Miro mode may show: those on the viewer's channel with a Miro frame, grouped by
 * deliverable. A Miro-workspace round or a shared project-level version carries no deliverable and
 * never appears here — that workspace has its own page.
 */
export function linkedVersions(
  versions: CanvasVersion[],
  deliverableId: string,
): (CanvasVersion & { deliverableId: string })[] {
  return versions
    .filter(
      (version): version is CanvasVersion & { deliverableId: string } =>
        version.deliverableId !== null,
    )
    .filter(
      (version) => !!version.miro && (!deliverableId || version.deliverableId === deliverableId),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number);
}

/** The requested version when it is linked and shown; otherwise the newest linked one. */
export function pickMiroVersion(
  linked: (CanvasVersion & { deliverableId: string })[],
  requestedId: string | null,
): (CanvasVersion & { deliverableId: string }) | null {
  return linked.find((version) => version.id === requestedId) ?? linked[0] ?? null;
}

export function miroVersionLabel(
  version: CanvasVersion,
  deliverables: { id: string; name: string }[],
): string {
  const name = deliverables.find((entry) => entry.id === version.deliverableId)?.name ?? "Version";
  return `${name} · V${version.number}`;
}

/**
 * Miro is the project's first view: without `view=versions` the page opens on Miro, and the page
 * falls back to Versions when nothing linked can be shown.
 */
export function readProjectView(parameters: URLSearchParams): {
  view: ProjectView;
  versionId: string | null;
} {
  return parameters.get("view") === "versions"
    ? { view: "versions", versionId: null }
    : { view: "miro", versionId: parameters.get("version") };
}

/**
 * Versions is recorded only when Miro could have been shown (`miroAvailable`), so a deliberate choice
 * survives a reload while a project with no Miro link keeps a clean URL.
 */
export function writeProjectView(
  parameters: URLSearchParams,
  state: { view: ProjectView; versionId: string | null; miroAvailable: boolean },
): string {
  const next = new URLSearchParams(parameters);
  next.delete("view");
  next.delete("version");
  if (state.view === "miro") {
    next.set("view", "miro");
    if (state.versionId) next.set("version", state.versionId);
  } else if (state.miroAvailable) next.set("view", "versions");
  return next.toString();
}

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { readProjectView } from "./miro-mode";
import { useDesignBoards, useProjectDetail, type ProjectChannel } from "./project-data";
import { useProjectEvents } from "./project-events";
import "./projects.css";
import { PageStatus } from "@/features/shared/page-status";
import { usesWorkspace } from "./miro-workspace";
import { ProjectWorkspace } from "./project-workspace";
import { ProjectVersionsCanvas } from "./project-versions-canvas";
import { type ProjectPanelKind } from "./project-panel";
import { usePanelFocusReturn } from "./use-panel-focus-return";

export function ProjectPage({ projectId }: { projectId: string }) {
  const { profile } = useAuth();
  useProjectEvents(projectId);
  // Both bodies below share one panel and deliverable filter, kept here above the early returns
  // that follow: `useProjectDetail` unmounts whichever body is showing while the other channel's
  // data loads, and state that lived inside that body would be lost on every channel switch.
  const panels = usePanelFocusReturn<ProjectPanelKind>();
  const [format, setFormat] = useState("");
  const parameters = useSearchParams();
  const [agencyChannel, setAgencyChannel] = useState<ProjectChannel>(
    parameters.get("channel") === "client" ? "client" : "internal",
  );
  const channel =
    profile?.role === "client"
      ? "client"
      : profile?.role === "designer"
        ? "internal"
        : agencyChannel;
  const data = useProjectDetail(projectId, channel);
  // RLS limits a designer to their own boards; the client channel never reads boards at all.
  const boards = useDesignBoards(projectId, profile?.role !== "client" && channel === "internal");
  // The agency may step back to the Versions canvas on a project that still has legacy versions;
  // the choice lasts until the channel changes.
  const [legacyChosen, setLegacyChosen] = useState(false);
  // The agency may also open the workspace of a project that has only legacy versions, to add its
  // first design board; that choice too lasts until the channel changes.
  const [workspaceChosen, setWorkspaceChosen] = useState(false);
  // `?view=versions` asks for the legacy canvas for every role. Read once: the URL effect in
  // `project-versions-canvas.tsx` drops `view` when no Miro link exists, and the request must
  // outlive that.
  const [legacyRequested, setLegacyRequested] = useState(
    () => readProjectView(parameters).view === "versions",
  );
  function switchChannel(next: ProjectChannel) {
    setLegacyChosen(false);
    setWorkspaceChosen(false);
    setAgencyChannel(next);
  }
  // Only the agency needs a working target while viewing published snapshots. Client sessions
  // never enable this read, and publication IDs are never used as production version IDs.
  const working = useProjectDetail(
    projectId,
    "internal",
    profile?.role === "agency" && channel === "client",
  );
  // A file dropped anywhere else on the page must never make the browser open it and leave the
  // workspace; only the canvas accepts a drop, and only in Working files. Runs for both bodies
  // below, not only the legacy canvas that owns the canvas's own drop handling.
  useEffect(() => {
    const swallow = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    return () => {
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
    };
  }, []);
  if (
    data.isPending ||
    (profile?.role === "agency" && channel === "client" && working.isPending) ||
    (boards.fetchStatus !== "idle" && boards.isPending)
  )
    return <PageStatus>Loading the project…</PageStatus>;
  // A failed board read is never taken for "no boards": that would show the wrong body.
  if (data.error || !data.data || boards.error)
    return (
      <div className="page-content">
        <h1>Project unavailable.</h1>
        <p>This project is unavailable or you do not have access.</p>
        <div className="form-actions">
          <button
            className="button"
            onClick={() => {
              void data.refetch();
              if (boards.error) void boards.refetch();
            }}
          >
            Try again
          </button>
          <Link className="button" href="/home">
            Back to your work
          </Link>
        </div>
      </div>
    );
  const workspace = usesWorkspace(channel, {
    versions: data.data.versions,
    boards: boards.data ?? [],
  });
  const legacyAvailable = data.data.versions.some((version) => version.deliverableId !== null);
  if ((workspace || workspaceChosen) && !legacyChosen && !legacyRequested)
    return (
      <ProjectWorkspace
        projectId={projectId}
        channel={channel}
        onChannel={switchChannel}
        data={data.data}
        boards={boards.data ?? []}
        panels={panels}
        viewControl={
          profile?.role === "agency" && legacyAvailable ? (
            <button className="button quiet" onClick={() => setLegacyChosen(true)}>
              Versions
            </button>
          ) : null
        }
      />
    );
  return (
    <ProjectVersionsCanvas
      projectId={projectId}
      channel={channel}
      onChannel={switchChannel}
      onWorkingFiles={() => setAgencyChannel("internal")}
      data={data.data}
      workingVersions={working.data?.versions}
      workspace={workspace}
      panels={panels}
      format={format}
      onFormat={setFormat}
      onOpenWorkspace={() => {
        setWorkspaceChosen(true);
        setLegacyChosen(false);
        setLegacyRequested(false);
      }}
    />
  );
}

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useDesignBoards, useProjectDetail, type ProjectChannel } from "./project-data";
import { useProjectEvents } from "./project-events";
import "./projects.css";
import { PageStatus } from "@/features/shared/page-status";
import { ProjectWorkspace } from "./project-workspace";
import { type ProjectPanelKind } from "./project-panel";
import { usePanelFocusReturn } from "./use-panel-focus-return";

export function ProjectPage({ projectId }: { projectId: string }) {
  const { profile } = useAuth();
  useProjectEvents(projectId);
  // The open panel is kept here, above the early returns that follow: `useProjectDetail` unmounts
  // the workspace while the other channel's data loads, and state that lived inside it would be
  // lost on every channel switch.
  const panels = usePanelFocusReturn<ProjectPanelKind>();
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
  // A file dropped anywhere on the page must never make the browser open it and leave the
  // workspace: nothing on the page accepts a dropped file.
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
  if (data.isPending || (boards.fetchStatus !== "idle" && boards.isPending))
    return <PageStatus>Loading the project…</PageStatus>;
  // A failed board read is never taken for "no boards": that would show the wrong empty state.
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
  return (
    <ProjectWorkspace
      projectId={projectId}
      channel={channel}
      onChannel={setAgencyChannel}
      data={data.data}
      boards={boards.data ?? []}
      panels={panels}
    />
  );
}

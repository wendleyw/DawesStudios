"use client";

import Link from "next/link";
import { ArrowLeft, Lightbulb } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useClients, useDateFormat } from "@/features/workspace/workspace-data";
import { useFoldSidebarWhile } from "@/features/workspace/app-shell";
import { CanvasHeader } from "@/features/workspace/canvas-header";
import { PlaygroundBoard } from "@/features/playground/playground-board";
import { PlaygroundAssetStrip } from "@/features/playground/playground-asset-strip";
import { ProjectCreditsChip } from "@/features/credits/project-credits-chip";
import { CommentPanel } from "./comment-panel";
import { ProjectDetails } from "./project-details";
import { ProjectPanel, type ProjectPanelKind } from "./project-panel";
import { ProjectToolBar } from "./project-tool-bar";
import { ProjectActionDialog, projectActionKey, type ProjectAction } from "./project-action-dialog";
import { MiroEmbed, MiroReviewBar } from "./miro-view";
import { MiroWorkspaceBar } from "./miro-workspace-bar";
import {
  boardRounds,
  canReviewShared,
  latestSharedLink,
  pickById,
  sharedVersions,
} from "./miro-workspace";
import type { DesignBoard, ProjectChannel, useProjectDetail } from "./project-data";

type ProjectData = NonNullable<ReturnType<typeof useProjectDetail>["data"]>;

export type ProjectWorkspaceProps = {
  projectId: string;
  channel: ProjectChannel;
  onChannel: (channel: ProjectChannel) => void;
  data: ProjectData;
  /** Exactly what `useDesignBoards` returns: RLS limits a designer to their own boards. */
  boards: DesignBoard[];
  viewControl: ReactNode;
};

/**
 * The project in the Miro workspace: the board, round or client version on Miro, with the
 * product's own controls around it. Replaces the Versions canvas for a channel that uses the
 * workspace (`usesWorkspace`); the legacy canvas stays in `project-page.tsx`.
 */
export function ProjectWorkspace({
  projectId,
  channel,
  onChannel,
  data,
  boards,
  viewControl,
}: ProjectWorkspaceProps) {
  const { profile } = useAuth();
  const clients = useClients();
  const { formatDate } = useDateFormat();
  const role = profile?.role ?? "client";
  const { project, versions, deliverables } = data;
  const [boardId, setBoardId] = useState<string | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [panel, setPanel] = useState<ProjectPanelKind | null>(null);
  const [action, setAction] = useState<ProjectAction | null>(null);
  const [assetStripOpen, setAssetStripOpen] = useState(false);
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [chrome, setChrome] = useState<HTMLDivElement | null>(null);
  const [chromeHeight, setChromeHeight] = useState(0);
  const playgroundTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!chrome) return;
    const observer = new ResizeObserver(() =>
      setChromeHeight(chrome.offsetHeight + chrome.offsetTop),
    );
    observer.observe(chrome);
    return () => observer.disconnect();
  }, [chrome]);

  const board = pickById(boards, boardId);
  const rounds = board ? boardRounds(versions, board.id) : [];
  const round = roundId ? (rounds.find((item) => item.id === roundId) ?? null) : null;
  const shared = sharedVersions(versions);
  const version = pickById(shared, versionId);
  const internal = channel === "internal";
  const shownLink = internal ? (round?.miro ?? board?.miro ?? null) : (version?.miro ?? null);
  const feedbackTarget = internal ? round : version;
  useFoldSidebarWhile(!!shownLink);

  const back = (
    <Link
      className="icon-button"
      href={`/clients/${project.client_id}/board`}
      aria-label="Back to board"
      title="Back to board"
    >
      <ArrowLeft size={17} />
    </Link>
  );
  const channelControl = role === "agency" && (
    <div className="segmented-control" role="group" aria-label="Project channel">
      {(["internal", "client"] as const).map((option) => (
        <button
          key={option}
          className={channel === option ? "active" : ""}
          aria-pressed={channel === option}
          onClick={() => {
            setPanel(null);
            onChannel(option);
          }}
        >
          {option === "internal" ? "Working files" : "Shared with client"}
        </button>
      ))}
    </div>
  );
  const empty = internal
    ? role === "agency"
      ? {
          text: "No design board yet.",
          action: "Add a design board",
          onClick: () => setAction({ kind: "board", projectId }),
        }
      : { text: "The studio has not set up your board yet." }
    : role === "agency"
      ? {
          text: "Nothing shared yet. Share a round or add a version.",
          action: "New client version",
          onClick: () => setAction({ kind: "share", projectId, round: null, prefill: null }),
        }
      : { text: "Nothing shared yet. Your studio will share designs here." };

  return (
    <div
      className="project-page"
      style={{ "--project-chrome-height": `${chromeHeight}px` } as CSSProperties}
    >
      <div className="project-chrome" ref={setChrome}>
        {(() => {
          const client = clients.data?.find((item) => item.id === project.client_id);
          return client ? <CanvasHeader client={client} viewer={profile} /> : null;
        })()}
        <MiroWorkspaceBar
          back={back}
          title={project.title}
          channel={channel}
          role={role}
          viewerId={profile?.id ?? ""}
          dueLabel={project.due_date ? `Due ${formatDate(project.due_date)}` : "No due date"}
          boards={boards}
          board={board}
          rounds={rounds}
          round={round}
          shared={shared}
          version={version}
          onBoard={(id) => {
            setBoardId(id);
            setRoundId(null);
          }}
          onRound={setRoundId}
          onVersion={setVersionId}
          onAddBoard={() => setAction({ kind: "board", projectId })}
          onEditBoard={() => board && setAction({ kind: "board", projectId, board })}
          onSendRound={() => board && setAction({ kind: "round", board })}
          onShareRound={() =>
            round && setAction({ kind: "share", projectId, round, prefill: null })
          }
          onAddVersion={() =>
            setAction({ kind: "share", projectId, round: null, prefill: latestSharedLink(shared) })
          }
          onEditLink={() => version && setAction({ kind: "miro", version, channel: "client" })}
          viewControl={viewControl}
          menu={
            <>
              <ProjectCreditsChip projectId={projectId} viewer={profile} />
              {channelControl}
            </>
          }
        />
      </div>
      <div className="project-workspace">
        <div className="project-workspace-content" inert={playgroundOpen}>
          <div className="project-body">
            <div className="project-canvas">
              <ProjectToolBar
                panel={panel}
                onPanel={(next) => {
                  setAssetStripOpen(false);
                  setPanel(next);
                }}
                disabled={playgroundOpen}
                feedback={
                  feedbackTarget
                    ? {
                        open: panel === "feedback",
                        onToggle: () => setPanel(panel === "feedback" ? null : "feedback"),
                      }
                    : undefined
                }
              >
                <button
                  className="icon-button"
                  ref={playgroundTrigger}
                  title="Playground"
                  aria-label="Playground"
                  aria-expanded={assetStripOpen}
                  disabled={playgroundOpen}
                  onClick={() => {
                    setPanel(null);
                    setAssetStripOpen((open) => !open);
                  }}
                >
                  <Lightbulb size={18} />
                </button>
              </ProjectToolBar>
              {!internal && version && canReviewShared(version, shared, role, project.status) && (
                <MiroReviewBar
                  label={`V${version.number}`}
                  onDecide={(decision) => setAction({ kind: "review", version, decision })}
                />
              )}
              {shownLink ? (
                <MiroEmbed
                  title={
                    internal
                      ? `Miro board ${board?.name ?? ""}${round ? ` · Round ${round.number}` : ""}`
                      : `Miro board · V${version?.number}`
                  }
                  link={shownLink}
                  frameKey={
                    internal ? `${board?.id}:${round?.id ?? "board"}` : (version?.id ?? "none")
                  }
                  strip={
                    assetStripOpen ? (
                      <PlaygroundAssetStrip
                        clientId={project.client_id}
                        projectId={projectId}
                        onOpenPlayground={() => {
                          setAssetStripOpen(false);
                          setPlaygroundOpen(true);
                        }}
                      />
                    ) : undefined
                  }
                />
              ) : (
                <div className="miro-workspace-empty">
                  <p>{empty.text}</p>
                  {"action" in empty && empty.action && (
                    <button className="button primary" onClick={empty.onClick}>
                      {empty.action}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {!playgroundOpen && panel && (
          <ProjectPanel key={panel} onClose={() => setPanel(null)}>
            {panel === "conversation" && (
              <CommentPanel
                key={channel}
                projectId={projectId}
                channel={channel}
                onClose={() => setPanel(null)}
              />
            )}
            {panel === "details" && (
              <ProjectDetails
                project={project}
                deliverables={deliverables}
                versions={versions}
                onClose={() => setPanel(null)}
              />
            )}
            {panel === "feedback" && feedbackTarget && (
              <CommentPanel
                key={`${channel}:${feedbackTarget.id}`}
                projectId={projectId}
                channel={channel}
                versionId={feedbackTarget.id}
                heading="Feedback"
                onClose={() => setPanel(null)}
              />
            )}
          </ProjectPanel>
        )}
        {playgroundOpen && (
          <PlaygroundBoard
            clientId={project.client_id}
            projectId={projectId}
            onClose={() => setPlaygroundOpen(false)}
            returnLabel="Back to project"
          />
        )}
      </div>
      <ProjectActionDialog
        key={projectActionKey(action)}
        action={action}
        projectId={projectId}
        suspended={false}
        onOpenPlayground={() => setPlaygroundOpen(true)}
        onClose={() => setAction(null)}
      />
    </div>
  );
}

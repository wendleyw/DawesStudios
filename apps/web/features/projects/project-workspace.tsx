"use client";

import { Lightbulb } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { designerDueDate, useClients, useDateFormat } from "@/features/workspace/workspace-data";
import { useFoldSidebarWhile } from "@/features/workspace/app-shell";
import { CanvasHeader } from "@/features/workspace/canvas-header";
import { PlaygroundBoard } from "@/features/playground/playground-board";
import { PlaygroundAssetStrip } from "@/features/playground/playground-asset-strip";
import { ProjectCreditsChip } from "@/features/credits/project-credits-chip";
import { CommentPanel } from "./comment-panel";
import { ProjectDetails } from "./project-details";
import { ProjectBackLink, ProjectChannelLead, ProjectTitle } from "./project-header";
import { ProjectPanel, type ProjectPanelKind } from "./project-panel";
import { ProjectToolBar, ProjectToolButton } from "./project-tool-bar";
import { useFocusReturn, usePanelFocusReturn } from "./use-panel-focus-return";
import type { useProjectSelection } from "./use-project-selection";
import { ApproveRoundButton } from "./project-action-approve";
import { ProjectActionDialog, projectActionKey, type ProjectAction } from "./project-action-dialog";
import { MiroEmbed } from "./miro-view";
import { MiroWorkspaceBar } from "./miro-workspace-bar";
import {
  boardRounds,
  canReviewShared,
  latestSharedLink,
  pickById,
  sharedVersions,
} from "./miro-workspace";
import {
  useLatestSharedMiroLink,
  useProjectDetail,
  useProjectDriveLinks,
  useProjectWorkflow,
  type CanvasVersion,
  type DesignBoard,
  type ProjectChannel,
} from "./project-data";

type ProjectData = NonNullable<ReturnType<typeof useProjectDetail>["data"]>;

export type ProjectWorkspaceProps = {
  projectId: string;
  channel: ProjectChannel;
  onChannel: (channel: ProjectChannel) => void;
  data: ProjectData;
  /** Exactly what `useDesignBoards` returns: RLS limits a designer to their own boards. */
  boards: DesignBoard[];
  /**
   * The open side panel, owned by `project-page.tsx` (above its early returns) so it survives the
   * remount `useProjectDetail` causes while the other channel's data loads.
   */
  panels: ReturnType<typeof usePanelFocusReturn<ProjectPanelKind>>;
  /** The board, round and version on screen, owned by `project-page.tsx` for the same reason. */
  selection: ReturnType<typeof useProjectSelection>;
};

/**
 * The project in the Miro workspace: the board, round or client version on Miro, with the
 * product's own controls around it. This is the whole project page for every role and channel.
 */
export function ProjectWorkspace({
  projectId,
  channel,
  onChannel,
  data,
  boards,
  panels,
  selection,
}: ProjectWorkspaceProps) {
  const { profile } = useAuth();
  const clients = useClients();
  const { formatDate } = useDateFormat();
  const role = profile?.role ?? "client";
  const { project, versions, deliverables } = data;
  const { boardId, setBoardId, roundId, setRoundId, versionId, setVersionId } = selection;
  const { panel, setPanel, closePanel, changePanel } = panels;
  const [action, setAction] = useState<ProjectAction | null>(null);
  const [assetStripOpen, setAssetStripOpen] = useState(false);
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [chrome, setChrome] = useState<HTMLDivElement | null>(null);
  const [chromeHeight, setChromeHeight] = useState(0);
  const playgroundTrigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useFocusReturn();
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
  // A designer works on the live board only; rounds are the agency's review history.
  const round =
    role !== "designer" && roundId ? (rounds.find((item) => item.id === roundId) ?? null) : null;
  const shared = sharedVersions(versions);
  const version = pickById(shared, versionId);
  const internal = channel === "internal";
  const workflow = useProjectWorkflow(projectId);
  const internalDetail = useProjectDetail(
    projectId,
    "internal",
    role === "agency" && channel === "client",
  );
  const workflowBoard = workflow.data?.boards.find((item) => item.id === board?.id);
  const latestPublication = workflow.data?.project.latestPublication;
  const latestVersion = version?.id === latestPublication?.id;
  const paused = workflow.data?.project.activity === "backlog";
  const currentRound = !!round && round.id === workflowBoard?.currentRequest?.roundId;
  const submittedRound = rounds.find((item) => item.id === workflowBoard?.currentRequest?.roundId);
  const availableRounds = (internal ? versions : (internalDetail.data?.versions ?? [])).filter(
    (item) => !!item.boardId,
  );
  const designerNames = Object.fromEntries(
    boards.map((item) => [item.id, item.designerName ?? "Designer unavailable"]),
  );
  const boardNames = Object.fromEntries(boards.map((item) => [item.id, item.name]));
  // A new client version starts from the client board last shared, whichever channel it is shared
  // from: Working files holds no client versions of its own to read it from.
  const latestShared = useLatestSharedMiroLink(projectId, role === "agency");
  const sharePrefill = latestShared.data ?? latestSharedLink(shared);
  // RLS keeps a designer to the `internal` row and a client to the `client` row, so this always
  // resolves to the one link either of them may see; the agency gets whichever channel is on
  // screen.
  const driveLinks = useProjectDriveLinks(projectId);
  const driveUrl = internal
    ? (driveLinks.data?.internal ?? null)
    : (driveLinks.data?.client ?? null);
  const client = clients.data?.find((item) => item.id === project.client_id);
  // A designer works to their board's internal date; everyone else sees the project's own date.
  const dueDate =
    role === "designer"
      ? designerDueDate(project.due_date, board?.dueDate ?? null)
      : project.due_date;
  const shownProject = dueDate === project.due_date ? project : { ...project, due_date: dueDate };
  const dueLabel = dueDate ? `Due ${formatDate(dueDate)}` : "No due date";
  const shownLink = internal ? (round?.miro ?? board?.miro ?? null) : (version?.miro ?? null);
  const commentTarget = internal ? round : version;
  const commentLabels = Object.fromEntries(
    versions.map((item) => {
      const label = `${internal ? "Round" : "Version"} ${item.number}`;
      const boardName = internal ? boards.find((board) => board.id === item.boardId)?.name : null;
      return [item.id, boardName ? `${label} · ${boardName}` : label];
    }),
  );
  // The studio acts only on an active, undelivered project whose workflow has loaded.
  const agencyActs =
    role === "agency" && !paused && project.status !== "delivered" && !!workflow.data;
  const outcome = workflowBoard?.currentRequest?.outcome;
  // Client feedback not yet sent back to the designers.
  const feedbackWaiting = role === "agency" && !!workflow.data?.capabilities.respondFeedback;
  const activeBoards =
    workflow.data?.boards.filter((item) => item.activity === "active").length ?? 0;
  const boardStatus =
    workflowBoard?.activity === "closed"
      ? "No further work needed"
      : feedbackWaiting
        ? "Client requested changes"
        : outcome === "open"
          ? "Designer working"
          : outcome === "submitted"
            ? "Studio review"
            : outcome === "approved"
              ? "Approved by the studio"
              : outcome === "shared"
                ? latestPublication?.decision === "pending"
                  ? "Waiting for the client"
                  : latestPublication?.decision === "approved"
                    ? "Approved by the client"
                    : "Shared with client"
                : "Waiting for production instructions";
  function shareRound(source: CanvasVersion | null) {
    if (!workflow.data) return;
    setAction({
      kind: "share",
      projectId,
      round: source,
      prefill: sharePrefill,
      workflow: workflow.data,
      availableRounds,
      boardNames,
    });
  }
  function closePlayground() {
    setPlaygroundOpen(false);
    // The button is disabled until this close commits.
    returnFocus(playgroundTrigger, { onlyFromBody: true });
  }
  useFoldSidebarWhile(!!shownLink);

  // Only the agency switches; the designer sees an Internal label and the client nothing.
  const channelLead = (
    <ProjectChannelLead
      role={role}
      channel={channel}
      onChannel={(option) => {
        // The panel stays open; its thread and drafts remain scoped to the new channel.
        setAssetStripOpen(false);
        onChannel(option);
      }}
    />
  );
  const empty = internal
    ? role === "agency"
      ? {
          text: "No design board yet.",
          action: "Add a design board",
          onClick: () => setAction({ kind: "board", projectId, projectDueDate: project.due_date }),
        }
      : { text: "The studio has not set up your board yet." }
    : project.status === "delivered"
      ? { text: "No client version was shared." }
      : role === "agency"
        ? {
            text: "Nothing shared yet. Approve a round in Working files to share it.",
          }
        : { text: "Nothing shared yet. Your studio will share designs here." };

  const title = (
    <ProjectTitle
      clientId={project.client_id}
      campaignId={project.campaign_id}
      title={project.title}
      dueLabel={dueLabel}
    />
  );

  return (
    <div
      className="project-page"
      style={{ "--project-chrome-height": `${chromeHeight}px` } as CSSProperties}
    >
      <div className="project-chrome" ref={setChrome}>
        {client ? <CanvasHeader client={client} viewer={profile} center={title} /> : title}
        <MiroWorkspaceBar
          back={<ProjectBackLink clientId={project.client_id} />}
          channel={channel}
          role={role}
          delivered={project.status === "delivered"}
          deliverableHref={
            role === "designer"
              ? null
              : `/clients/${project.client_id}/brand/files?project=${projectId}`
          }
          viewerId={profile?.id ?? ""}
          boardDueLabel={
            role === "agency" && board?.dueDate
              ? `Board due ${formatDate(board.dueDate)}`
              : undefined
          }
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
          onAddBoard={() =>
            setAction({ kind: "board", projectId, projectDueDate: project.due_date })
          }
          onEditBoard={() =>
            board &&
            setAction({ kind: "board", projectId, board, projectDueDate: project.due_date })
          }
          onSendRound={() =>
            board && workflowBoard && setAction({ kind: "round", board, workflowBoard })
          }
          onShareRound={() => round && shareRound(round)}
          onAddVersion={() => shareRound(null)}
          canShareDirectly={agencyActs && !!workflow.data?.capabilities.publish}
          onEditLink={() => version && setAction({ kind: "miro", version, channel: "client" })}
          lead={channelLead}
          menu={<ProjectCreditsChip projectId={projectId} viewer={profile} />}
          driveUrl={driveUrl}
        />
      </div>
      <div className="project-workspace">
        <div className="project-workspace-content" inert={playgroundOpen}>
          <div className="project-body">
            <div className="project-canvas">
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
                  {"action" in empty && empty.action && !workflow.data && (
                    <button className="button primary" onClick={empty.onClick}>
                      {empty.action}
                    </button>
                  )}
                </div>
              )}
              {/* One docked footer under the board: project tools, then the current state and its
                  workflow actions. It never floats over Miro's canvas or its controls. */}
              <div className="project-dock">
                <ProjectToolBar
                  panel={panel}
                  briefingFirst={role === "designer"}
                  onPanel={(next) => {
                    if (next) setAssetStripOpen(false);
                    changePanel(next);
                  }}
                  disabled={playgroundOpen}
                >
                  <ProjectToolButton
                    active={shownLink ? assetStripOpen : playgroundOpen}
                    ref={playgroundTrigger}
                    title="Playground"
                    aria-label="Playground"
                    aria-expanded={shownLink ? assetStripOpen : playgroundOpen}
                    disabled={playgroundOpen}
                    onClick={() => {
                      // The asset strip lives on the Miro embed; with nothing on Miro yet the
                      // Playground opens directly.
                      setPanel(null);
                      if (shownLink) setAssetStripOpen((open) => !open);
                      else setPlaygroundOpen(true);
                    }}
                  >
                    <Lightbulb size={18} />
                  </ProjectToolButton>
                </ProjectToolBar>
                <div
                  className="miro-review-bar project-workflow-bar"
                  role="group"
                  aria-label="Workflow actions"
                >
                  <p>
                    <strong>
                      {paused
                        ? "Project in backlog"
                        : internal
                          ? (board?.name ?? "Working files")
                          : version
                            ? `V${version.number}`
                            : role === "client"
                              ? "In progress"
                              : "Shared with client"}
                    </strong>
                    <span>
                      {workflow.error
                        ? "Could not load project actions"
                        : paused
                          ? role === "agency"
                            ? "Work resumes from Edit project details"
                            : "Paused by the studio"
                          : project.status === "delivered"
                            ? "Delivered"
                            : internal
                              ? boardStatus
                              : !version
                                ? role === "client"
                                  ? "The studio is preparing your first version"
                                  : "Nothing shared yet"
                                : latestPublication?.decision === "changes_requested"
                                  ? project.status === "in_progress"
                                    ? role === "client"
                                      ? "The studio is working on your changes"
                                      : "Changes sent to designers"
                                    : "Changes requested"
                                  : latestPublication?.decision === "approved"
                                    ? "Approved"
                                    : role === "client"
                                      ? "Ready for your review"
                                      : "Waiting for the client"}
                    </span>
                  </p>
                  {workflow.error && (
                    <button className="button" onClick={() => void workflow.refetch()}>
                      Try again
                    </button>
                  )}
                  {agencyActs && internal && !board && (
                    <button
                      className="button primary"
                      onClick={() =>
                        setAction({ kind: "board", projectId, projectDueDate: project.due_date })
                      }
                    >
                      Add design board
                    </button>
                  )}
                  {agencyActs && internal && board && workflowBoard?.capabilities.reactivate && (
                    <button
                      className="button primary"
                      onClick={() =>
                        setAction({ kind: "activity", board: workflowBoard, change: "reactivate" })
                      }
                    >
                      Reactivate board
                    </button>
                  )}
                  {agencyActs &&
                    internal &&
                    board &&
                    workflowBoard?.capabilities.release &&
                    !workflowBoard.currentRequest && (
                      <button
                        className="button primary"
                        onClick={() =>
                          setAction({ kind: "production", board, workflowBoard, project })
                        }
                      >
                        Send to designer
                      </button>
                    )}
                  {agencyActs &&
                    internal &&
                    board &&
                    workflowBoard?.capabilities.close &&
                    !feedbackWaiting &&
                    outcome !== "submitted" &&
                    outcome !== "approved" && (
                      <button
                        className="button"
                        onClick={() =>
                          setAction({ kind: "activity", board: workflowBoard, change: "close" })
                        }
                      >
                        No further work needed
                      </button>
                    )}
                  {/* The client asked for changes: the studio answers from the boards, where the
                      designers' work lives, choosing which boards continue. */}
                  {agencyActs && internal && board && feedbackWaiting && (
                    <button
                      className="button primary"
                      onClick={() =>
                        setAction({
                          kind: "handoff",
                          projectId,
                          workflow: workflow.data!,
                          designerNames,
                        })
                      }
                    >
                      {activeBoards > 1 ? "Send to designers" : "Send to designer"}
                    </button>
                  )}
                  {!paused &&
                    project.status !== "delivered" &&
                    workflow.data &&
                    internal &&
                    role === "designer" &&
                    board &&
                    workflowBoard?.capabilities.submit &&
                    !round && (
                      <button
                        className="button primary"
                        onClick={() => setAction({ kind: "round", board, workflowBoard })}
                      >
                        Send to studio
                      </button>
                    )}
                  {/* The studio reviews the submitted round itself; from the live board the bar
                      opens it. An approved round can be shared from either view. */}
                  {agencyActs &&
                    internal &&
                    board &&
                    !currentRound &&
                    submittedRound &&
                    (workflowBoard?.capabilities.approve || workflowBoard?.capabilities.share) && (
                      <button
                        className="button primary"
                        onClick={() =>
                          workflowBoard.capabilities.share
                            ? shareRound(submittedRound)
                            : setRoundId(submittedRound.id)
                        }
                      >
                        {workflowBoard.capabilities.share
                          ? `Share R${submittedRound.number} with client`
                          : `Review R${submittedRound.number}`}
                      </button>
                    )}
                  {agencyActs &&
                    internal &&
                    board &&
                    currentRound &&
                    round &&
                    workflowBoard?.capabilities.requestChanges && (
                      <>
                        <button
                          className="button"
                          onClick={() =>
                            setAction({
                              kind: "handoff",
                              projectId,
                              workflow: workflow.data!,
                              designerNames,
                              selectedBoardId: board.id,
                            })
                          }
                        >
                          Request changes
                        </button>
                        {workflowBoard.capabilities.approve && (
                          <ApproveRoundButton
                            board={workflowBoard}
                            roundId={round.id}
                            roundNumber={round.number}
                          />
                        )}
                        {workflowBoard.capabilities.share && (
                          <button className="button primary" onClick={() => shareRound(round)}>
                            Share with client
                          </button>
                        )}
                      </>
                    )}
                  {agencyActs && !internal && feedbackWaiting && latestVersion && (
                    <button className="button primary" onClick={() => onChannel("internal")}>
                      Continue in Working files
                    </button>
                  )}
                  {agencyActs &&
                    !internal &&
                    workflow.data!.capabilities.deliver &&
                    latestVersion && (
                      <Link
                        className="button primary"
                        href={`/clients/${project.client_id}/brand/files?project=${projectId}`}
                      >
                        Prepare delivery
                      </Link>
                    )}
                  {!paused &&
                    workflow.data &&
                    !internal &&
                    role === "client" &&
                    version &&
                    latestVersion &&
                    workflow.data.capabilities.review &&
                    canReviewShared(version, shared, role, project.status) && (
                      <>
                        <button
                          className="button"
                          onClick={() =>
                            setAction({ kind: "review", version, decision: "changes_requested" })
                          }
                        >
                          Request changes
                        </button>
                        <button
                          className="button primary"
                          onClick={() =>
                            setAction({ kind: "review", version, decision: "approved" })
                          }
                        >
                          Approve
                        </button>
                      </>
                    )}
                </div>
              </div>
            </div>
          </div>
        </div>
        {!playgroundOpen && panel && (
          <ProjectPanel key={panel} onClose={closePanel}>
            {panel === "comments" && (
              <CommentPanel
                key={`${projectId}:${channel}`}
                projectId={projectId}
                projectTitle={project.title}
                channel={channel}
                currentVersion={
                  commentTarget
                    ? {
                        id: commentTarget.id,
                        label: commentLabels[commentTarget.id],
                      }
                    : undefined
                }
                versionLabels={commentLabels}
                onClose={closePanel}
              />
            )}
            {panel === "details" && (
              <ProjectDetails
                project={shownProject}
                board={board}
                internal={internal}
                deliverables={deliverables}
                versions={versions}
                onClose={closePanel}
              />
            )}
          </ProjectPanel>
        )}
        {playgroundOpen && (
          <PlaygroundBoard
            clientId={project.client_id}
            projectId={projectId}
            onClose={closePlayground}
            returnLabel="Back to project"
          />
        )}
      </div>
      <ProjectActionDialog
        key={projectActionKey(action)}
        action={
          (project.status === "delivered" || paused) &&
          (action?.kind === "round" ||
            action?.kind === "share" ||
            action?.kind === "handoff" ||
            action?.kind === "production" ||
            action?.kind === "activity")
            ? null
            : action
        }
        onClose={() => {
          if (action?.kind === "share") setVersionId(null);
          setAction(null);
        }}
      />
    </div>
  );
}

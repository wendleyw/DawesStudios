"use client";

import { Lightbulb } from "lucide-react";
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
import {
  useLatestSharedMiroLink,
  useProjectDriveLinks,
  type DesignBoard,
  type ProjectChannel,
  type useProjectDetail,
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
  /** URL hints are resolved against authorized rows only; they grant no access. */
  initialSelection?: { board: string | null; round: string | null; version: string | null };
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
  initialSelection,
}: ProjectWorkspaceProps) {
  const { profile } = useAuth();
  const clients = useClients();
  const { formatDate } = useDateFormat();
  const role = profile?.role ?? "client";
  const { project, versions, deliverables } = data;
  const [boardId, setBoardId] = useState<string | null>(initialSelection?.board ?? null);
  const [roundId, setRoundId] = useState<string | null>(initialSelection?.round ?? null);
  const [versionId, setVersionId] = useState<string | null>(initialSelection?.version ?? null);
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
  const round = roundId ? (rounds.find((item) => item.id === roundId) ?? null) : null;
  const shared = sharedVersions(versions);
  const version = pickById(shared, versionId);
  // A new client version starts from the client board last shared, whichever channel it is shared
  // from: Working files holds no client versions of its own to read it from.
  const latestShared = useLatestSharedMiroLink(projectId, role === "agency");
  const sharePrefill = latestShared.data ?? latestSharedLink(shared);
  const internal = channel === "internal";
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
            text: "Nothing shared yet. Share a round or add a version.",
            action: "New client version",
            onClick: () =>
              setAction({ kind: "share", projectId, round: null, prefill: sharePrefill }),
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
          onSendRound={() => board && setAction({ kind: "round", board })}
          onShareRound={() =>
            round && setAction({ kind: "share", projectId, round, prefill: sharePrefill })
          }
          onAddVersion={() =>
            setAction({ kind: "share", projectId, round: null, prefill: sharePrefill })
          }
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
              <ProjectToolBar
                panel={panel}
                briefingFirst={role === "designer" && !!project.briefing_id}
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
          project.status === "delivered" && (action?.kind === "round" || action?.kind === "share")
            ? null
            : action
        }
        onClose={() => setAction(null)}
      />
    </div>
  );
}

"use client";

import { Plus, Send, Share2, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { DriveIcon } from "@/features/shared/drive-icon";
import { versionStatusLabel } from "@/features/workspace/workspace-data";
import { MiroBarShell, miroBarTone } from "./miro-view";
import type { CanvasVersion, DesignBoard, ProjectChannel } from "./project-data";

export type MiroWorkspaceBarProps = {
  back: ReactNode;
  channel: ProjectChannel;
  role: "agency" | "designer" | "client";
  delivered: boolean;
  viewerId: string;
  /** The agency's view of the shown board's internal due date, e.g. "Board due Oct 3". */
  boardDueLabel?: string;
  boards: DesignBoard[];
  board: DesignBoard | null;
  rounds: CanvasVersion[];
  round: CanvasVersion | null;
  shared: CanvasVersion[];
  version: CanvasVersion | null;
  onBoard: (id: string) => void;
  onRound: (id: string | null) => void;
  onVersion: (id: string) => void;
  onAddBoard: () => void;
  onEditBoard: () => void;
  onSendRound: () => void;
  onShareRound: () => void;
  onAddVersion: () => void;
  onEditLink: () => void;
  /** The channel, from `ProjectChannelLead`. */
  lead: ReactNode;
  menu: ReactNode;
  /**
   * The Drive link of the channel on screen, if the agency has set one: `internal` for Working
   * files, `client` for Shared with client. A designer is only ever on `internal` and a client only
   * ever on `client`, so this is always the one link either of them may see.
   */
  driveUrl: string | null;
};

/**
 * The Miro workspace's header. In Working files: the design board, its rounds, and the actions of
 * whoever is looking (the board's designer sends a round; the agency shares it and manages boards).
 * The agency also sees the selected board's designer. Shared with client contains only client
 * versions and their status; a designer only ever receives their own boards.
 */
export function MiroWorkspaceBar(props: MiroWorkspaceBarProps) {
  const agency = props.role === "agency";
  const internal = props.channel === "internal";
  const shown = internal ? (props.round?.miro ?? props.board?.miro) : props.version?.miro;
  const ownBoard = props.board?.designerId === props.viewerId;
  const designerName = props.board?.designerName?.trim() || "Name unavailable";
  // One action at most: the board's designer sends a round, the agency shares the round on screen.
  const primary =
    !props.delivered && internal && props.board && props.role === "designer" && ownBoard ? (
      <button className="button primary" onClick={props.onSendRound}>
        <Send size={13} aria-hidden="true" />
        Send to studio
      </button>
    ) : !props.delivered &&
      internal &&
      agency &&
      props.round &&
      props.round.status !== "reviewed" ? (
      <button className="button primary" onClick={props.onShareRound}>
        <Share2 size={13} aria-hidden="true" />
        Share with client
      </button>
    ) : null;
  return (
    <MiroBarShell
      back={props.back}
      tone={miroBarTone(props.role, props.channel)}
      lead={props.lead}
      link={shown}
      primary={primary}
      menu={(close) => (
        <>
          {agency && internal && props.board && (
            <button
              className="button quiet"
              onClick={() => {
                close();
                props.onEditBoard();
              }}
            >
              Edit board
            </button>
          )}
          {agency && !internal && props.version && (
            <button
              className="button quiet"
              onClick={() => {
                close();
                props.onEditLink();
              }}
            >
              Edit Miro link
            </button>
          )}
          {props.driveUrl && (
            <a
              className="button quiet"
              href={props.driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
            >
              <DriveIcon size={14} />
              {internal ? "Open internal Drive folder" : "Open client Drive folder"}
            </a>
          )}
          {props.menu}
        </>
      )}
    >
      {internal ? (
        <>
          {props.boards.length > 1 && (
            <select
              className="miro-bar-board"
              aria-label="Design board"
              value={props.board?.id ?? ""}
              onChange={(event) => props.onBoard(event.target.value)}
            >
              {props.boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </select>
          )}
          {agency && props.board && (
            <span className="miro-bar-designer" title={`Designer: ${designerName}`}>
              <UserRound size={14} aria-hidden="true" />
              <span>Designer</span>
              <strong>{designerName}</strong>
            </span>
          )}
          {agency && props.boards.length > 0 && (
            <button
              className="button quiet miro-bar-add"
              aria-label="Add design board"
              title="Add design board"
              onClick={props.onAddBoard}
            >
              <Plus size={14} aria-hidden="true" />
              Add board
            </button>
          )}
          {props.board && props.rounds.length > 0 && (
            <div className="segmented-control" role="group" aria-label="Rounds">
              <button
                className={props.round ? "" : "active"}
                aria-pressed={!props.round}
                onClick={() => props.onRound(null)}
              >
                Board
              </button>
              {[...props.rounds].reverse().map((round) => (
                <button
                  key={round.id}
                  className={props.round?.id === round.id ? "active" : ""}
                  aria-pressed={props.round?.id === round.id}
                  aria-label={`Round ${round.number}`}
                  onClick={() => props.onRound(round.id)}
                >
                  R{round.number}
                </button>
              ))}
            </div>
          )}
          {props.round && (
            <span className="miro-bar-status">{versionStatusLabel(props.round.status)}</span>
          )}
          {props.boardDueLabel && <span className="miro-bar-due">{props.boardDueLabel}</span>}
        </>
      ) : props.shared.length === 0 ? null : (
        <>
          <div className="segmented-control" role="group" aria-label="Client versions">
            {[...props.shared].reverse().map((version) => (
              <button
                key={version.id}
                className={props.version?.id === version.id ? "active" : ""}
                aria-pressed={props.version?.id === version.id}
                onClick={() => props.onVersion(version.id)}
              >
                V{version.number}
              </button>
            ))}
          </div>
          {/* With nothing shared yet, the empty state's own call to action is the one control. */}
          {agency && !props.delivered && (
            <button
              className="button quiet miro-bar-add"
              aria-label="New client version"
              title="New client version"
              onClick={props.onAddVersion}
            >
              <Plus size={14} aria-hidden="true" />
              New version
            </button>
          )}
          {props.version && (
            <span className="miro-bar-status">{versionStatusLabel(props.version.status)}</span>
          )}
        </>
      )}
    </MiroBarShell>
  );
}

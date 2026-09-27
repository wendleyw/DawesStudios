"use client";

import { Plus, Send, Share2 } from "lucide-react";
import type { ReactNode } from "react";
import { versionStatusLabel } from "@/features/workspace/workspace-data";
import { MiroBarShell, miroBarTone } from "./miro-view";
import type { CanvasVersion, DesignBoard, ProjectChannel } from "./project-data";

export type MiroWorkspaceBarProps = {
  back: ReactNode;
  title: string;
  channel: ProjectChannel;
  role: "agency" | "designer" | "client";
  viewerId: string;
  dueLabel: string;
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
};

/**
 * The Miro workspace's header. In Working files: the design board, its rounds, and the actions of
 * whoever is looking (the board's designer sends a round; the agency shares it and manages boards).
 * In Shared with client: the client versions and their status. Nothing here names a designer: a
 * designer only ever receives their own boards.
 */
export function MiroWorkspaceBar(props: MiroWorkspaceBarProps) {
  const agency = props.role === "agency";
  const internal = props.channel === "internal";
  const shown = internal ? (props.round?.miro ?? props.board?.miro) : props.version?.miro;
  const ownBoard = props.board?.designerId === props.viewerId;
  // One action at most: the board's designer sends a round, the agency shares the round on screen.
  const primary =
    internal && props.board && props.role === "designer" && ownBoard ? (
      <button className="button primary" onClick={props.onSendRound}>
        <Send size={13} aria-hidden="true" />
        Send to studio
      </button>
    ) : internal && agency && props.round ? (
      <button className="button primary" onClick={props.onShareRound}>
        <Share2 size={13} aria-hidden="true" />
        Share with client
      </button>
    ) : null;
  return (
    <MiroBarShell
      back={props.back}
      title={props.title}
      due={props.dueLabel}
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
          {agency && props.boards.length > 0 && (
            <button
              className="icon-button"
              aria-label="Add design board"
              title="Add design board"
              onClick={props.onAddBoard}
            >
              <Plus size={16} />
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
          {agency && (
            <button
              className="icon-button"
              aria-label="New client version"
              title="New client version"
              onClick={props.onAddVersion}
            >
              <Plus size={16} />
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

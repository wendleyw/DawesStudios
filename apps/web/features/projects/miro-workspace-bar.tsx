"use client";

import { PackageCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { DriveIcon } from "@/features/shared/drive-icon";
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
  /**
   * Where a delivered project's final files are: its Deliverables. Shown beside Open in Miro on the
   * client channel only (the client, and the agency's Shared with client view), so the delivered
   * work is one click from the version it came from; never on Working files or for designers.
   */
  deliverableHref?: string | null;
};

/**
 * The Miro workspace's header: what is on screen, in the same order for every role — back, channel,
 * board, then the board's rounds (Live, R1, R2…) or the client versions (V1, V2…). A designer sees
 * only their live board: the rounds they sent are the agency's review history. The state and the
 * workflow actions live once, in the docked action bar below the board. The agency's board picker
 * names each board's designer; a designer only ever receives their own boards, and the client none.
 * Board management (add, edit, Miro link, Drive) sits in the ⋯ menu.
 */
export function MiroWorkspaceBar(props: MiroWorkspaceBarProps) {
  const agency = props.role === "agency";
  const internal = props.channel === "internal";
  const shown = internal ? (props.round?.miro ?? props.board?.miro) : props.version?.miro;
  const boardLabel = (board: DesignBoard) =>
    agency ? `${board.name} · ${board.designerName?.trim() || "Designer unavailable"}` : board.name;
  // Workflow advances live in the single contextual bar below the canvas.
  return (
    <MiroBarShell
      back={props.back}
      tone={miroBarTone(props.role, props.channel)}
      lead={props.lead}
      link={shown}
      primary={
        props.delivered && !internal && props.deliverableHref ? (
          <Link className="button" href={props.deliverableHref}>
            <PackageCheck size={14} aria-hidden="true" />
            <span className="miro-bar-open-label">Deliverable</span>
          </Link>
        ) : undefined
      }
      menu={(close) => (
        <>
          {agency && internal && props.boards.length > 0 && (
            <button
              className="button quiet"
              onClick={() => {
                close();
                props.onAddBoard();
              }}
            >
              Add design board
            </button>
          )}
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
          {props.board && props.boards.length === 1 && (
            <span className="miro-bar-board-name" title={boardLabel(props.board)}>
              {boardLabel(props.board)}
            </span>
          )}
          {props.boards.length > 1 && (
            <select
              className="miro-bar-board"
              aria-label="Design board"
              value={props.board?.id ?? ""}
              onChange={(event) => props.onBoard(event.target.value)}
            >
              {props.boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {boardLabel(board)}
                </option>
              ))}
            </select>
          )}
          {props.role !== "designer" && props.board && props.rounds.length > 0 && (
            <div className="segmented-control" role="group" aria-label="Rounds">
              <button
                className={props.round ? "" : "active"}
                aria-pressed={!props.round}
                title="The board as it is now"
                onClick={() => props.onRound(null)}
              >
                Live
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
          {props.boardDueLabel && <span className="miro-bar-due">{props.boardDueLabel}</span>}
        </>
      ) : props.shared.length === 0 ? null : (
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
      )}
    </MiroBarShell>
  );
}

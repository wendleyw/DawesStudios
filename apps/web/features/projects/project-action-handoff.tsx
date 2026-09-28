"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { formats, newDeliverable, services } from "@/features/briefings/briefing-model";
import { handoffBoardWork, type ProjectWorkflow, type WorkflowBoard } from "./project-data";
import {
  emptyProductionBrief,
  productionBriefSchema,
  type ProductionBriefContent,
} from "./production-brief-model";
import {
  ProjectActionShell,
  useCloseOnSuccess,
  useProjectActionClose,
} from "./project-action-shell";

export type HandoffAction = {
  kind: "handoff";
  projectId: string;
  workflow: ProjectWorkflow;
  designerNames: Record<string, string>;
  selectedBoardId?: string;
};
type Choice = { action: "continue" | "close"; content: ProductionBriefContent };

export function ProjectActionHandoff({
  action,
  onClose,
}: {
  action: HandoffAction;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(
      action.selectedBoardId
        ? action.workflow.boards
            .filter((board) => board.id === action.selectedBoardId)
            .map((board) => [
              board.id,
              {
                action: "continue",
                content: board.briefContent ?? emptyProductionBrief(board.name, "design", null),
              },
            ])
        : [],
    ),
  );
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const { closeOnSuccess } = useCloseOnSuccess(onClose);
  const mutation = useMutation({
    mutationFn: async () => {
      const decisions = Object.entries(choices).map(([boardId, choice]) => {
        const board = action.workflow.boards.find((item) => item.id === boardId)!;
        return {
          boardId,
          action: choice.action,
          ...(choice.action === "continue"
            ? { content: productionBriefSchema.parse(choice.content) }
            : {}),
          expectedBoardRevision: board.workflowRevision,
          expectedAssignmentGeneration: board.assignmentGeneration,
          expectedBriefRevision: board.briefRevision,
        };
      });
      if (!decisions.some((item) => item.action === "continue"))
        throw new Error("Continue work on at least one board.");
      const latest = action.workflow.project.latestPublication;
      await handoffBoardWork(database, {
        projectId: action.projectId,
        latestPublicationId: action.selectedBoardId ? null : (latest?.id ?? null),
        reviewRevision: action.selectedBoardId ? null : (latest?.reviewRevision ?? null),
        decisions,
        requestId: requestId.current,
      });
    },
    onSuccess: closeOnSuccess,
  });
  const { closeDisabled, close } = useProjectActionClose({ onClose, pending: mutation.isPending });
  const boards = action.selectedBoardId
    ? action.workflow.boards.filter((board) => board.id === action.selectedBoardId)
    : action.workflow.boards;
  const setChoice = (board: WorkflowBoard, choice: Choice | null) => {
    setConfirm(false);
    setError("");
    requestId.current = crypto.randomUUID();
    setChoices((current) => {
      const next = { ...current };
      if (choice) next[board.id] = choice;
      else delete next[board.id];
      return next;
    });
  };
  const update = (board: WorkflowBoard, patch: Partial<ProductionBriefContent>) => {
    const current = choices[board.id];
    if (current) setChoice(board, { ...current, content: { ...current.content, ...patch } });
  };
  const prepare = () => {
    const continuing = Object.values(choices).filter((item) => item.action === "continue");
    if (!continuing.length) {
      setError("Continue work on at least one board.");
      return;
    }
    for (const choice of continuing) {
      const parsed = productionBriefSchema.safeParse(choice.content);
      if (!parsed.success || !parsed.data.deliverables.length || !parsed.data.overview.trim()) {
        setError(
          "Each continuing board needs valid production instructions, an overview and a deliverable.",
        );
        return;
      }
    }
    setError("");
    setConfirm(true);
  };
  return (
    <ProjectActionShell
      open
      title={action.selectedBoardId ? "Request changes" : "Send to designers"}
      closeDisabled={closeDisabled}
      onModalClose={close}
      onCancelClick={close}
      cancelDisabled={closeDisabled}
      onSubmit={(event) => {
        event.preventDefault();
        if (confirm) mutation.mutate();
        else prepare();
      }}
      submitLabel={mutation.isPending ? "Sending…" : confirm ? "Confirm handoff" : "Review handoff"}
      submitDisabled={mutation.isPending}
      error={error || mutation.error?.message}
    >
      {confirm ? (
        <div className="workflow-handoff-confirm">
          <p>Confirm these board decisions. Boards not listed stay unchanged.</p>
          <ul>
            {boards
              .filter((board) => choices[board.id])
              .map((board) => (
                <li key={board.id}>
                  <strong>{board.name}</strong> ·{" "}
                  {action.designerNames[board.id] ?? "Designer unavailable"} ·{" "}
                  {choices[board.id].action === "continue"
                    ? "Continue working"
                    : "No further work needed"}
                </li>
              ))}
          </ul>
          <button type="button" className="button quiet" onClick={() => setConfirm(false)}>
            Edit decisions
          </button>
        </div>
      ) : (
        <div className="workflow-handoff-boards">
          <p>
            Choose only the boards affected by this handoff. Each designer receives their own
            production instructions.
          </p>
          {boards.map((board) => {
            const choice = choices[board.id];
            return (
              <fieldset key={board.id}>
                <legend>
                  {board.name} · {action.designerNames[board.id] ?? "Designer unavailable"}
                </legend>
                <label>
                  Decision
                  <select
                    value={choice?.action ?? "omit"}
                    onChange={(event) => {
                      const value = event.target.value;
                      setChoice(
                        board,
                        value === "omit"
                          ? null
                          : {
                              action: value as Choice["action"],
                              content:
                                choice?.content ??
                                board.briefContent ??
                                emptyProductionBrief(board.name, "design", null),
                            },
                      );
                    }}
                  >
                    <option value="omit">Leave unchanged</option>
                    <option value="continue">Continue working</option>
                    <option value="close">No further work needed</option>
                  </select>
                </label>
                {choice?.action === "continue" && (
                  <div className="workflow-handoff-content">
                    <label>
                      Production title
                      <input
                        required
                        value={choice.content.title}
                        onChange={(event) => update(board, { title: event.target.value })}
                      />
                    </label>
                    <label>
                      Service
                      <select
                        value={choice.content.serviceId}
                        onChange={(event) => update(board, { serviceId: event.target.value })}
                      >
                        {services.map((service) => (
                          <option key={service.id} value={service.id}>
                            {service.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Production overview
                      <textarea
                        required
                        rows={3}
                        value={choice.content.overview}
                        onChange={(event) => update(board, { overview: event.target.value })}
                      />
                    </label>
                    <label>
                      Goals
                      <textarea
                        rows={2}
                        value={choice.content.goals}
                        onChange={(event) => update(board, { goals: event.target.value })}
                      />
                    </label>
                    <label>
                      Change instructions
                      <textarea
                        rows={3}
                        value={choice.content.direction.notes ?? ""}
                        onChange={(event) =>
                          update(board, {
                            direction: { ...choice.content.direction, notes: event.target.value },
                          })
                        }
                      />
                    </label>
                    <p>Production deliverables</p>
                    {choice.content.deliverables.map((item, index) => (
                      <div key={index} className="workflow-handoff-deliverable">
                        <input
                          aria-label={`Deliverable ${index + 1} name`}
                          value={item.name}
                          onChange={(event) =>
                            update(board, {
                              deliverables: choice.content.deliverables.map((current, i) =>
                                i === index ? { ...current, name: event.target.value } : current,
                              ),
                            })
                          }
                        />
                        <input
                          aria-label={`Deliverable ${index + 1} quantity`}
                          type="number"
                          min={1}
                          max={100}
                          value={item.quantity}
                          onChange={(event) =>
                            update(board, {
                              deliverables: choice.content.deliverables.map((current, i) =>
                                i === index
                                  ? { ...current, quantity: Number(event.target.value) }
                                  : current,
                              ),
                            })
                          }
                        />
                        <button
                          type="button"
                          className="button quiet"
                          onClick={() =>
                            update(board, {
                              deliverables: choice.content.deliverables.filter(
                                (_, i) => i !== index,
                              ),
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <label>
                      Add deliverable format{" "}
                      <select
                        aria-label={`New deliverable format for ${board.name}`}
                        id={`format-${board.id}`}
                        defaultValue={formats[0].id}
                      >
                        {formats.map((format) => (
                          <option key={format.id} value={format.id}>
                            {format.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="button quiet"
                      onClick={() => {
                        const element = document.getElementById(
                          `format-${board.id}`,
                        ) as HTMLSelectElement;
                        update(board, {
                          deliverables: [
                            ...choice.content.deliverables,
                            newDeliverable(element.value),
                          ],
                        });
                      }}
                    >
                      Add deliverable
                    </button>
                  </div>
                )}
              </fieldset>
            );
          })}
        </div>
      )}
    </ProjectActionShell>
  );
}

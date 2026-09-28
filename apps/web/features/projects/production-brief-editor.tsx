"use client";

import { useId, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import { useBriefings } from "@/features/briefings/briefing-data";
import {
  directionFields,
  formats,
  newDeliverable,
  services,
} from "@/features/briefings/briefing-model";
import { BriefingDeliverableEditor } from "@/features/briefings/briefing-deliverable-editor";
import { Modal } from "@/features/shared/modal";
import { FormError } from "@/features/shared/form-error";
import {
  saveProductionBrief,
  useInvalidateProductionBrief,
  type DesignBoard,
  type TableRow,
  type WorkflowBoard,
} from "./project-data";
import {
  copyClientBrief,
  emptyProductionBrief,
  productionBriefSchema,
  type ProductionBriefContent,
  type ProductionBriefRecord,
} from "./production-brief-model";

export function ProductionBriefEditor({
  board,
  project,
  saved,
  workflowBoard,
  onClose,
}: {
  board: DesignBoard;
  project: TableRow<"projects">;
  saved: ProductionBriefRecord | null;
  workflowBoard?: WorkflowBoard;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const formId = useId();
  const source = useBriefings(project.client_id);
  const original = source.data?.find((item) => item.id === project.briefing_id);
  const invalidate = useInvalidateProductionBrief();
  const [content, setContent] = useState<ProductionBriefContent>(
    () => saved?.content ?? emptyProductionBrief(board.name, project.service_type, board.dueDate),
  );
  const [expectedRevision] = useState(saved?.revision ?? 0);
  const [formatId, setFormatId] = useState("feed");
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const attempt = useRef<{ id: string; payload: string } | null>(null);
  const change = (patch: Partial<ProductionBriefContent>) => {
    setContent((current) => ({ ...current, ...patch }));
    setDirty(true);
  };
  const service = services.find((item) => item.id === content.serviceId);
  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const parsed = productionBriefSchema.safeParse(content);
      if (!parsed.success)
        throw new Error(parsed.error.issues.map((issue) => issue.message).join(" "));
      if (publish && !parsed.data.deliverables.length)
        throw new Error("Add at least one production deliverable before sending.");
      if (publish && !workflowBoard) throw new Error("Board workflow is still loading. Try again.");
      if (project.due_date && content.dueDate > project.due_date)
        throw new Error("The internal deadline must be on or before the project deadline.");
      const payload = JSON.stringify({ content: parsed.data, publish });
      if (attempt.current?.payload !== payload)
        attempt.current = { id: crypto.randomUUID(), payload };
      return saveProductionBrief(database, {
        boardId: board.id,
        content: parsed.data,
        expectedRevision,
        publish,
        requestId: attempt.current.id,
        boardRevision: workflowBoard?.workflowRevision,
        assignmentGeneration: workflowBoard?.assignmentGeneration,
      });
    },
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });
  const close = () => {
    if (save.isPending) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  };
  return (
    <Modal
      title="Production brief"
      open
      onClose={close}
      closeDisabled={save.isPending}
      size="lg"
      footer={
        confirmClose ? (
          <div className="production-brief-discard" role="alert">
            <p>Discard your unsaved changes?</p>
            <button type="button" className="button" onClick={() => setConfirmClose(false)}>
              Keep editing
            </button>
            <button type="button" className="button danger" onClick={onClose}>
              Discard changes
            </button>
          </div>
        ) : (
          <div className="production-brief-actions">
            <button
              type="button"
              className="button quiet"
              disabled={save.isPending}
              onClick={close}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button"
              disabled={save.isPending}
              onClick={() => save.mutate(false)}
            >
              Save draft
            </button>
            <button
              form={formId}
              type="submit"
              className="button primary"
              disabled={save.isPending}
            >
              {save.isPending ? "Saving…" : "Send to designer"}
            </button>
          </div>
        )
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(true);
        }}
      >
        <p className="production-brief-intro">
          Prepare the instructions for {board.name}. Drafts stay with the studio until you send them
          to the designer.
        </p>
        <fieldset disabled={save.isPending} className="production-brief-form">
          {original && !dirty && (
            <button
              type="button"
              className="button quiet"
              onClick={() => {
                change(copyClientBrief(original, board.dueDate));
              }}
            >
              Use client briefing as a starting point
            </button>
          )}
          <label>
            Production title
            <input
              maxLength={200}
              required
              value={content.title}
              onChange={(event) => change({ title: event.target.value })}
            />
          </label>
          <label>
            Service
            <select
              value={content.serviceId}
              onChange={(event) => change({ serviceId: event.target.value })}
            >
              {services.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Overview
            <textarea
              rows={3}
              maxLength={12000}
              value={content.overview}
              onChange={(event) => change({ overview: event.target.value })}
            />
          </label>
          <label>
            Goals
            <textarea
              rows={2}
              maxLength={12000}
              value={content.goals}
              onChange={(event) => change({ goals: event.target.value })}
            />
          </label>
          <section className="production-brief-fields">
            <h3>Production deliverables</h3>
            <p>
              Set the quantities the designer should produce, including extra concepts and
              adaptations.
            </p>
            {content.deliverables.map((item, index) => (
              <div key={index} className="production-brief-output">
                <label>
                  Format
                  <select
                    value={item.format}
                    onChange={(event) => {
                      const replacement = newDeliverable(event.target.value);
                      change({
                        deliverables: content.deliverables.map((value, i) =>
                          i === index
                            ? {
                                ...replacement,
                                name: value.name,
                                quantity: value.quantity,
                                scope: value.scope,
                              }
                            : value,
                        ),
                      });
                    }}
                  >
                    {formats.map((format) => (
                      <option key={format.id} value={format.id}>
                        {format.name}
                      </option>
                    ))}
                  </select>
                </label>
                <BriefingDeliverableEditor
                  item={item}
                  onChange={(patch) =>
                    change({
                      deliverables: content.deliverables.map((value, i) =>
                        i === index ? { ...value, ...patch } : value,
                      ),
                    })
                  }
                  onRemove={() =>
                    change({ deliverables: content.deliverables.filter((_, i) => i !== index) })
                  }
                />
              </div>
            ))}
            <div className="production-brief-add">
              <label>
                Add format
                <select value={formatId} onChange={(event) => setFormatId(event.target.value)}>
                  {formats.map((format) => (
                    <option key={format.id} value={format.id}>
                      {format.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="button"
                disabled={content.deliverables.length >= 50}
                onClick={() =>
                  change({ deliverables: [...content.deliverables, newDeliverable(formatId)] })
                }
              >
                <Plus size={14} />
                Add deliverable
              </button>
            </div>
          </section>
          <section className="production-brief-fields">
            <h3>Creative direction</h3>
            {directionFields.map(({ id, label }) => (
              <label key={id}>
                {label}
                <textarea
                  rows={2}
                  maxLength={12000}
                  value={content.direction[id] ?? ""}
                  onChange={(event) =>
                    change({ direction: { ...content.direction, [id]: event.target.value } })
                  }
                />
              </label>
            ))}
            {service?.questions.map((question) => (
              <label key={question.id}>
                {question.label}
                <textarea
                  rows={2}
                  maxLength={12000}
                  value={content.direction.questions?.[question.id] ?? ""}
                  onChange={(event) =>
                    change({
                      direction: {
                        ...content.direction,
                        questions: {
                          ...content.direction.questions,
                          [question.id]: event.target.value,
                        },
                      },
                    })
                  }
                />
              </label>
            ))}
          </section>
          <section className="production-brief-fields">
            <h3>References</h3>
            <p>Add links to the files, folders or references the designer should use.</p>
            {content.references.map((item, index) => (
              <div className="production-brief-reference" key={index}>
                <label>
                  Reference name
                  <input
                    required
                    maxLength={200}
                    value={item.name}
                    onChange={(event) =>
                      change({
                        references: content.references.map((value, i) =>
                          i === index ? { ...value, name: event.target.value } : value,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Reference link
                  <input
                    required
                    type="url"
                    placeholder="https://"
                    value={item.url}
                    onChange={(event) =>
                      change({
                        references: content.references.map((value, i) =>
                          i === index ? { ...value, url: event.target.value } : value,
                        ),
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove reference ${index + 1}`}
                  onClick={() =>
                    change({ references: content.references.filter((_, i) => i !== index) })
                  }
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button quiet"
              disabled={content.references.length >= 30}
              onClick={() => change({ references: [...content.references, { name: "", url: "" }] })}
            >
              <Plus size={14} />
              Add reference
            </button>
          </section>
          <label>
            Board due date
            <input
              type="date"
              max={project.due_date ?? undefined}
              value={content.dueDate}
              onChange={(event) => change({ dueDate: event.target.value })}
            />
          </label>
        </fieldset>
        {save.error && <FormError>{save.error.message}</FormError>}
      </form>
    </Modal>
  );
}

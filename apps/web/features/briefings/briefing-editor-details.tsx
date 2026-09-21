"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import {
  directionFields,
  formatSize,
  formats,
  newDeliverable,
  nextVariation,
  type BriefingDirection,
  type BriefingDraft,
  type Campaign,
  type RequestedDeliverable,
  type ServiceDefinition,
} from "./briefing-model";
import { BriefingAttachments } from "./briefing-attachments";
import { Modal } from "@/features/shared/modal";

/**
 * The "Details" step (step 1) of the briefing editor: campaign selection, deliverables, the
 * briefing questions and brand direction, and timing/attachments. Split out of
 * `briefing-editor-form.tsx` because it was, by far, the largest single step of what had been the
 * largest component in the repository — all its state stays in `BriefingEditor`, which owns the
 * draft and passes it down with the handlers this step calls.
 */
export function BriefingEditorDetails({
  service,
  draft,
  campaigns,
  campaignSearch,
  onCampaignSearchChange,
  onOpenCampaignDialog,
  onChangeService,
  onUpdate,
  onUpdateDirection,
  onUpdateDeliverable,
  defaults,
  savedId,
}: {
  service: ServiceDefinition | undefined;
  draft: BriefingDraft;
  campaigns: Campaign[];
  campaignSearch: string;
  onCampaignSearchChange: (value: string) => void;
  onOpenCampaignDialog: () => void;
  onChangeService: () => void;
  onUpdate: (patch: Partial<BriefingDraft>) => void;
  onUpdateDirection: (patch: Partial<BriefingDirection>) => void;
  onUpdateDeliverable: (index: number, patch: Partial<RequestedDeliverable>) => void;
  defaults: BriefingDirection;
  savedId: string | null;
}) {
  const [removing, setRemoving] = useState<number | null>(null);
  const removingDeliverable = removing === null ? undefined : draft.deliverables[removing];
  return (
    <div className="briefing-form">
      <div className="briefing-service-summary">
        <div>
          <span className="eyebrow">Selected service</span>
          <h2>{service?.name}</h2>
        </div>
        <button className="button quiet" onClick={onChangeService}>
          Change
        </button>
      </div>
      <section className="briefing-form-section">
        <h2>Campaign</h2>
        <p>Choose where this project belongs.</p>
        <div className="briefing-form-grid">
          <label>
            Find a campaign
            <input
              value={campaignSearch}
              onChange={(event) => onCampaignSearchChange(event.target.value)}
              placeholder="Search campaigns…"
            />
          </label>
          <label>
            Campaign
            <select
              value={draft.campaignId}
              onChange={(event) => onUpdate({ campaignId: event.target.value })}
            >
              <option value="">Choose a campaign</option>
              {campaigns
                .filter(
                  (item) =>
                    item.id === draft.campaignId ||
                    item.title.toLowerCase().includes(campaignSearch.toLowerCase()),
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {campaignSearch &&
          !campaigns.some((item) =>
            item.title.toLowerCase().includes(campaignSearch.toLowerCase()),
          ) && <p className="briefing-note">No matching campaigns. Create one below.</p>}
        <button className="button quiet" onClick={onOpenCampaignDialog}>
          <Plus size={15} />
          New campaign
        </button>
        <label>
          Project title
          <input
            maxLength={200}
            value={draft.title}
            onChange={(event) => onUpdate({ title: event.target.value })}
            placeholder="Give this idea a name"
          />
        </label>
      </section>
      <section className="briefing-form-section">
        <h2>Deliverables</h2>
        <p>Choose your formats, then define each piece.</p>
        <div className="format-badges">
          {service?.formats.map((id) => (
            <button
              className="button"
              key={id}
              onClick={() =>
                onUpdate({
                  deliverables: [
                    ...draft.deliverables,
                    newDeliverable(id, nextVariation(draft.deliverables, id)),
                  ],
                })
              }
            >
              <Plus size={13} />
              {formats.find((item) => item.id === id)?.name}
            </button>
          ))}
        </div>
        {draft.deliverables.length === 0 && <p className="briefing-note">No formats added yet.</p>}
        {draft.deliverables.map((item, index) => {
          const format = formats.find((value) => value.id === item.format);
          return (
            <div className="deliverable-editor" key={item.id ?? `${item.format}-${index}`}>
              <div className="deliverable-editor-heading">
                <span className="eyebrow">
                  {format?.name ?? item.format} · {formatSize(item)}
                </span>
                <button
                  className="button quiet"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => setRemoving(index)}
                >
                  <X size={15} />
                </button>
              </div>
              <label>
                Custom name
                <input
                  value={item.name}
                  onChange={(event) => onUpdateDeliverable(index, { name: event.target.value })}
                />
              </label>
              <div className="deliverable-fields">
                {format?.layout !== "none" && (
                  <label>
                    Width ({format?.unit})
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={item.width ?? ""}
                      onChange={(event) =>
                        onUpdateDeliverable(index, {
                          width: event.target.value ? Number(event.target.value) : undefined,
                        })
                      }
                    />
                  </label>
                )}
                {format?.layout === "fixed" && (
                  <label>
                    Height ({format.unit})
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={item.height ?? ""}
                      onChange={(event) =>
                        onUpdateDeliverable(index, {
                          height: event.target.value ? Number(event.target.value) : undefined,
                        })
                      }
                    />
                  </label>
                )}
                <label>
                  Quantity
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={item.quantity}
                    onChange={(event) =>
                      onUpdateDeliverable(index, { quantity: Number(event.target.value) })
                    }
                  />
                </label>
                <label>
                  Creative scope
                  <select
                    value={item.scope}
                    onChange={(event) =>
                      onUpdateDeliverable(index, {
                        scope: event.target.value as RequestedDeliverable["scope"],
                      })
                    }
                  >
                    <option value="original">Original</option>
                    <option value="adaptation">Adaptation</option>
                  </select>
                </label>
              </div>
            </div>
          );
        })}
      </section>
      <section className="briefing-form-section">
        <h2>Briefing</h2>
        <label>
          Overview
          <textarea
            rows={4}
            value={draft.overview}
            onChange={(event) => onUpdate({ overview: event.target.value })}
            placeholder="What are we creating, and what should it achieve?"
          />
        </label>
        <label>
          Goals
          <textarea
            rows={2}
            value={draft.goals}
            onChange={(event) => onUpdate({ goals: event.target.value })}
            placeholder="The outcome you want to make possible"
          />
        </label>
        {service?.questions.map((question) => (
          <label key={question.id}>
            {question.label}
            {question.options ? (
              <select
                value={draft.direction.questions?.[question.id] ?? ""}
                onChange={(event) =>
                  onUpdateDirection({
                    questions: {
                      ...draft.direction.questions,
                      [question.id]: event.target.value,
                    },
                  })
                }
              >
                <option value="">Choose an option</option>
                {question.options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                type={question.id === "pages" ? "number" : "text"}
                min={question.id === "pages" ? 1 : undefined}
                placeholder={question.placeholder}
                value={draft.direction.questions?.[question.id] ?? ""}
                onChange={(event) =>
                  onUpdateDirection({
                    questions: {
                      ...draft.direction.questions,
                      [question.id]: event.target.value,
                    },
                  })
                }
              />
            )}
          </label>
        ))}
        <details className="briefing-direction">
          <summary>Brand direction & additional details</summary>
          <div className="briefing-brand-note">
            <span>
              {draft.direction.source === "brand_hub"
                ? "From Brand Hub"
                : "Customized for this project"}
            </span>
            <button
              className="button quiet"
              onClick={() =>
                onUpdateDirection({
                  ...defaults,
                  questions: draft.direction.questions,
                  resources: draft.direction.resources,
                  inspirations: draft.direction.inspirations,
                  notes: draft.direction.notes,
                })
              }
            >
              Use brand defaults
            </button>
          </div>
          {directionFields.map(({ id, label }) => (
            <label key={id}>
              <span className="briefing-field-name">{label}</span>
              <textarea
                rows={2}
                value={draft.direction[id] ?? ""}
                onChange={(event) =>
                  onUpdateDirection({ [id]: event.target.value, source: "project" })
                }
              />
            </label>
          ))}
        </details>
      </section>
      <section className="briefing-form-section">
        <h2>Timing & files</h2>
        <label>
          Target due date <span className="muted">(optional)</span>
          <input
            type="date"
            value={draft.dueDate}
            onChange={(event) => onUpdate({ dueDate: event.target.value })}
          />
        </label>
        {savedId ? (
          <BriefingAttachments briefingId={savedId} editable />
        ) : (
          <p className="briefing-note">
            Save your draft to attach files. Reference links can be added under Resources.
          </p>
        )}
      </section>
      {/* Removing a deliverable discards everything typed into it, so it asks first. */}
      <Modal
        open={removing !== null}
        title="Remove this deliverable?"
        description={
          removingDeliverable
            ? `${removingDeliverable.name || "This deliverable"} and its details will be removed from the briefing.`
            : undefined
        }
        onClose={() => setRemoving(null)}
      >
        <div className="form-actions">
          <button className="button" onClick={() => setRemoving(null)}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={() => {
              onUpdate({
                deliverables: draft.deliverables.filter((_, position) => position !== removing),
              });
              setRemoving(null);
            }}
          >
            Remove deliverable
          </button>
        </div>
      </Modal>
    </div>
  );
}

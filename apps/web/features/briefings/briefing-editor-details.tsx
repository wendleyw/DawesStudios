"use client";

import { Plus } from "lucide-react";
import {
  directionFields,
  formats,
  newDeliverable,
  nextVariation,
  type BriefingDirection,
  type BriefingDraft,
  type Campaign,
  type RequestedDeliverable,
  type ServiceDefinition,
} from "./briefing-model";
import { BriefingDeliverableEditor } from "./briefing-deliverable-editor";
import { BriefingAttachments } from "./briefing-attachments";

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
  onSaveDraft,
  saving,
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
  onSaveDraft: () => void;
  saving: boolean;
}) {
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
        <h2>Project basics</h2>
        <p>Give your project a name and choose a campaign to keep related work together.</p>
        <label>
          Project title
          <input
            maxLength={200}
            value={draft.title}
            onChange={(event) => onUpdate({ title: event.target.value })}
            placeholder="Give this idea a name"
          />
        </label>
        <div className="briefing-campaign-field">
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
        <details className="briefing-campaign-search">
          <summary>Search campaigns</summary>
          <label>
            Find a campaign
            <input
              value={campaignSearch}
              onChange={(event) => onCampaignSearchChange(event.target.value)}
              placeholder="Search campaigns…"
            />
          </label>
        </details>
        {campaignSearch &&
          !campaigns.some((item) =>
            item.title.toLowerCase().includes(campaignSearch.toLowerCase()),
          ) && <p className="briefing-note">No matching campaigns. Create one below.</p>}
        <button className="button quiet" onClick={onOpenCampaignDialog}>
          <Plus size={15} />
          New campaign
        </button>
      </section>
      <section className="briefing-form-section">
        <h2>Tell us what you have in mind</h2>
        <p>A short description is enough to start. Goals are optional.</p>
        <label>
          Overview
          <textarea
            rows={4}
            value={draft.overview}
            onChange={(event) => onUpdate({ overview: event.target.value })}
            placeholder="What should we create, who is it for, and what should it communicate?"
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
        <p className="briefing-note">
          Your Brand Hub guidance is already included. Add references or adjust it below only if
          needed.
        </p>
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
              <span>{label}</span>
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
        <h2>What do you need?</h2>
        <p>Add a format for each piece. Standard sizes and names are filled in for you.</p>
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
        {draft.deliverables.length === 0 && (
          <p className="briefing-note">
            Choose at least one format above. You can add the same format again for another
            variation.
          </p>
        )}
        {draft.deliverables.map((item, index) => (
          <BriefingDeliverableEditor
            key={item.id ?? `${item.format}-${index}`}
            item={item}
            onChange={(patch) => onUpdateDeliverable(index, patch)}
            onRemove={() =>
              onUpdate({
                deliverables: draft.deliverables.filter((_, position) => position !== index),
              })
            }
          />
        ))}
      </section>
      <section className="briefing-form-section">
        <h2>Timing & files</h2>
        <label>
          <span>
            Target due date <span className="muted">(optional)</span>
          </span>
          <input
            type="date"
            value={draft.dueDate}
            onChange={(event) => onUpdate({ dueDate: event.target.value })}
          />
        </label>
        {savedId ? (
          <BriefingAttachments briefingId={savedId} editable />
        ) : (
          <div className="briefing-file-prompt">
            <p className="briefing-note">
              Have reference images or documents? Save your progress to add them. You can continue
              editing afterward.
            </p>
            <button className="button" disabled={saving} onClick={onSaveDraft}>
              {saving ? "Saving…" : "Save draft to add files"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

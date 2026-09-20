"use client";

import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { CampaignDialog } from "@/features/campaigns/campaign-dialog";
import { useClients } from "@/features/workspace/workspace-data";
import { assertResult } from "@/lib/supabase";
import { useBriefingBrand, useBriefings, useCampaigns, useServicePresets } from "./briefing-data";
import {
  brandDefaults,
  briefingPayload,
  catalogWithPresets,
  estimateLabel,
  formats,
  formatSize,
  initialDraft,
  directionFields,
  newDeliverable,
  nextVariation,
  serviceEstimate,
  validateBriefing,
  type Briefing,
  type BriefingDirection,
  type BriefingDraft,
  type Campaign,
  type RequestedDeliverable,
  type ServiceDefinition,
} from "./briefing-model";
import { BriefingAttachments } from "./briefing-attachments";
import { BriefingSummary } from "./briefing-summary";
import "./briefings.css";

export function BriefingEditorPage({
  clientId,
  briefingId,
}: {
  clientId: string;
  briefingId?: string;
}) {
  const { profile } = useAuth();
  const clients = useClients();
  const briefings = useBriefings(clientId);
  const campaigns = useCampaigns(clientId);
  const brand = useBriefingBrand(clientId);
  const presets = useServicePresets();
  if (profile?.role === "designer")
    return (
      <div className="page-content">
        <h1>Briefings are managed by the studio.</h1>
        <Link href="/home" className="button">
          Back to your work
        </Link>
      </div>
    );
  if (
    clients.isPending ||
    campaigns.isPending ||
    brand.isPending ||
    presets.isPending ||
    (briefingId && briefings.isPending)
  )
    return (
      <div className="page-content" role="status">
        Preparing your briefing…
      </div>
    );
  const client = clients.data?.find((item) => item.id === clientId);
  const briefing = briefings.data?.find((item) => item.id === briefingId);
  if (
    !client ||
    campaigns.error ||
    brand.error ||
    presets.error ||
    briefings.error ||
    (briefingId && !briefing)
  )
    return (
      <div className="page-content">
        <h1>Briefing unavailable.</h1>
        <p>We could not load this briefing or its brand context.</p>
        <button
          className="button"
          onClick={() => {
            void clients.refetch();
            void campaigns.refetch();
            void brand.refetch();
            void presets.refetch();
            void briefings.refetch();
          }}
        >
          Try again
        </button>
        <Link className="button quiet" href={`/clients/${clientId}/briefings`}>
          Back to briefings
        </Link>
      </div>
    );
  if (briefing && briefing.status !== "draft")
    return (
      <div className="page-content">
        <h1>This briefing has been submitted.</h1>
        <p>Your submitted scope is saved for review.</p>
        <Link href={`/clients/${clientId}/briefings/${briefing.id}`} className="button">
          View briefing
        </Link>
      </div>
    );
  return (
    <BriefingEditor
      key={briefingId ?? clientId}
      clientId={clientId}
      clientName={client.name}
      briefing={briefing}
      campaigns={campaigns.data ?? []}
      defaults={brandDefaults(brand.data ?? [])}
      serviceCatalog={catalogWithPresets(presets.data ?? [])}
    />
  );
}

function BriefingEditor({
  clientId,
  clientName,
  briefing,
  campaigns,
  defaults,
  serviceCatalog,
}: {
  clientId: string;
  clientName: string;
  briefing?: Briefing;
  campaigns: Campaign[];
  defaults: BriefingDirection;
  serviceCatalog: ServiceDefinition[];
}) {
  const { database } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [draft, setDraft] = useState(() => initialDraft(briefing, defaults));
  const [step, setStep] = useState(briefing?.service_type ? 1 : 0);
  const [savedId, setSavedId] = useState(briefing?.id ?? null);
  const [expectedRevision, setExpectedRevision] = useState(briefing?.updated_at);
  const [errors, setErrors] = useState<string[]>([]);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaignSearch, setCampaignSearch] = useState("");
  const [typeNote, setTypeNote] = useState("");
  const [saved, setSaved] = useState(false);
  const fileWrites = useIsMutating({ mutationKey: ["briefing-file", savedId] });
  const service = serviceCatalog.find((item) => item.id === draft.serviceId);
  const update = (patch: Partial<BriefingDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setSaved(false);
  };
  const updateDirection = (patch: Partial<BriefingDirection>) =>
    update({ direction: { ...draft.direction, ...patch } });
  const save = useMutation({
    mutationFn: async (submit: boolean) => {
      if (!draft.serviceId) throw new Error("Choose a service before saving your draft.");
      const validation = submit ? validateBriefing(draft) : [];
      if (validation.length) {
        setErrors(validation);
        throw new Error("Review the highlighted briefing requirements.");
      }
      const stored = assertResult(
        await database.rpc("save_briefing_revision", {
          ...briefingPayload(
            clientId,
            { ...draft, direction: { ...draft.direction, preset_revision: service?.revision } },
            savedId,
            serviceEstimate(service),
          ),
          ...(expectedRevision ? { p_expected_updated_at: expectedRevision } : {}),
        }),
      );
      if (
        !stored ||
        typeof stored !== "object" ||
        Array.isArray(stored) ||
        typeof stored.id !== "string" ||
        typeof stored.updated_at !== "string"
      )
        throw new Error("The saved draft could not be confirmed. Reload before saving again.");
      const id = stored.id;
      setSavedId(id);
      setExpectedRevision(stored.updated_at);
      if (submit) assertResult(await database.rpc("submit_briefing", { p_briefing_id: id }));
      return { id, submit };
    },
    onSuccess: ({ id, submit }) => {
      setSaved(true);
      setErrors([]);
      void queryClient.invalidateQueries({ queryKey: ["briefings"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (submit) router.push(`/clients/${clientId}/briefings/${id}`);
      else router.replace(`/clients/${clientId}/briefings/${id}/edit`);
    },
  });
  function selectService(id: string) {
    const next = serviceCatalog.find((item) => item.id === id)!;
    const compatible = draft.deliverables.filter((item) => next.formats.includes(item.format));
    if (compatible.length < draft.deliverables.length)
      setTypeNote(
        "The service has changed. Formats outside its scope were removed; review your deliverables.",
      );
    update({
      serviceId: id,
      deliverables: compatible,
      direction: {
        ...draft.direction,
        questions: Object.fromEntries(
          Object.entries(draft.direction.questions ?? {}).filter(([key]) =>
            next.questions.some((question) => question.id === key),
          ),
        ),
      },
    });
  }
  function updateDeliverable(index: number, patch: Partial<RequestedDeliverable>) {
    update({
      deliverables: draft.deliverables.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    });
  }
  function review() {
    const validation = validateBriefing(draft);
    setErrors(validation);
    if (!validation.length) {
      setStep(2);
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }

  return (
    <div className="page-content briefing-editor">
      <header className="briefing-editor-header">
        <Link href={`/clients/${clientId}/briefings`} className="button quiet">
          <ArrowLeft size={16} />
          Briefings
        </Link>
        <span className="eyebrow">{clientName}</span>
        <button
          className="button"
          disabled={save.isPending || !!fileWrites || !service}
          onClick={() => save.mutate(false)}
        >
          {save.isPending ? "Saving…" : "Save draft"}
        </button>
      </header>
      <h1 className="briefing-editor-title">{briefing ? "Edit briefing" : "New briefing"}</h1>
      <nav className="briefing-progress" aria-label="Briefing steps">
        {["Type", "Details", "Review"].map((label, index) => (
          <button
            key={label}
            aria-current={step === index ? "step" : undefined}
            className={step === index ? "active" : ""}
            disabled={index > 0 && !service}
            onClick={() => (index === 2 ? review() : setStep(index))}
          >
            <span>{index < step ? <Check size={14} /> : index + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      {saved && (
        <p className="briefing-save-status" role="status">
          Draft saved.
        </p>
      )}
      {save.error && (
        <p className="form-error" role="alert">
          {save.error.message}
        </p>
      )}
      {errors.length > 0 && (
        <div className="briefing-validation" role="alert">
          <strong>A few details need your attention.</strong>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      {typeNote && (
        <p className="briefing-note" role="status">
          {typeNote}
        </p>
      )}
      {step === 0 ? (
        <div className="service-grid">
          {serviceCatalog.map((item) => (
            <button
              key={item.id}
              className={`service-card ${draft.serviceId === item.id ? "selected" : ""}`}
              aria-pressed={draft.serviceId === item.id}
              onClick={() => selectService(item.id)}
            >
              <span className="eyebrow">{item.category}</span>
              <h2>{item.name}</h2>
              <p>{item.description}</p>
              <span className="service-card-meta">
                {estimateLabel(item)}
                <span>{item.days ? `${item.days} days` : "Timing to be agreed"}</span>
              </span>
            </button>
          ))}
        </div>
      ) : step === 1 ? (
        <div className="briefing-form">
          <div className="briefing-service-summary">
            <div>
              <span className="eyebrow">Selected service</span>
              <h2>{service?.name}</h2>
            </div>
            <button className="button quiet" onClick={() => setStep(0)}>
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
                  onChange={(event) => setCampaignSearch(event.target.value)}
                  placeholder="Search campaigns…"
                />
              </label>
              <label>
                Campaign
                <select
                  value={draft.campaignId}
                  onChange={(event) => update({ campaignId: event.target.value })}
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
            <button className="button quiet" onClick={() => setCampaignOpen(true)}>
              <Plus size={15} />
              New campaign
            </button>
            <label>
              Project title
              <input
                maxLength={200}
                value={draft.title}
                onChange={(event) => update({ title: event.target.value })}
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
                    update({
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
              <p className="briefing-note">No formats added yet.</p>
            )}
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
                      onClick={() =>
                        update({
                          deliverables: draft.deliverables.filter(
                            (_, position) => position !== index,
                          ),
                        })
                      }
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <label>
                    Custom name
                    <input
                      value={item.name}
                      onChange={(event) => updateDeliverable(index, { name: event.target.value })}
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
                            updateDeliverable(index, {
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
                            updateDeliverable(index, {
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
                          updateDeliverable(index, { quantity: Number(event.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Creative scope
                      <select
                        value={item.scope}
                        onChange={(event) =>
                          updateDeliverable(index, {
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
                onChange={(event) => update({ overview: event.target.value })}
                placeholder="What are we creating, and what should it achieve?"
              />
            </label>
            <label>
              Goals
              <textarea
                rows={2}
                value={draft.goals}
                onChange={(event) => update({ goals: event.target.value })}
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
                      updateDirection({
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
                      updateDirection({
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
                    updateDirection({
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
                      updateDirection({ [id]: event.target.value, source: "project" })
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
                onChange={(event) => update({ dueDate: event.target.value })}
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
        </div>
      ) : (
        <div className="briefing-review">
          <BriefingSummary
            draft={draft}
            campaignName={campaigns.find((item) => item.id === draft.campaignId)?.title}
          />
          {savedId && <BriefingAttachments briefingId={savedId} />}
          <div className="briefing-estimate">
            <span>{estimateLabel(service)}</span>
            <p>
              The studio will confirm one project total before work begins. Sending this briefing
              does not use credits.
            </p>
          </div>
        </div>
      )}
      <footer className="briefing-editor-footer">
        <button
          className="button quiet"
          disabled={step === 0 || save.isPending}
          onClick={() => setStep((current) => Math.max(0, current - 1))}
        >
          <ArrowLeft size={15} />
          Back
        </button>
        {step < 2 ? (
          <button
            className="button primary"
            disabled={!service}
            onClick={() => (step === 0 ? setStep(1) : review())}
          >
            {step === 0 ? "Continue to details" : "Review briefing"}
          </button>
        ) : (
          <button
            className="button primary"
            disabled={save.isPending || !!fileWrites}
            onClick={() => save.mutate(true)}
          >
            {save.isPending ? "Sending…" : "Send briefing"}
          </button>
        )}
      </footer>
      {campaignOpen && (
        <CampaignDialog
          onClose={() => setCampaignOpen(false)}
          clientId={clientId}
          onCreated={(id) => {
            update({ campaignId: id });
            setCampaignSearch("");
            setCampaignOpen(false);
          }}
        />
      )}
    </div>
  );
}

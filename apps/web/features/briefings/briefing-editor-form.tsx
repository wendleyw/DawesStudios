"use client";

import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { CampaignDialog } from "@/features/campaigns/campaign-dialog";
import { useInvalidateNotifications } from "@/features/workspace/workspace-data";
import { briefingQueryKeys, saveBriefingRevision, submitBriefing } from "./briefing-data";
import type { ClientPerson } from "@/features/team/client-people";
import {
  briefingPayload,
  estimateLabel,
  initialDraft,
  initialRequester,
  requesterErrors,
  serviceEstimate,
  validateBriefing,
  type Briefing,
  type BriefingDirection,
  type BriefingDraft,
  type Campaign,
  type RequestedDeliverable,
  type ServiceDefinition,
} from "./briefing-model";
import { BriefingEditorDetails } from "./briefing-editor-details";
import { BriefingServicePicker } from "./briefing-service-picker";
import { BriefingAttachments } from "./briefing-attachments";
import { BriefingSummary } from "./briefing-summary";
import { FormError } from "@/features/shared/form-error";

export type BriefingDialogOptions = {
  onStateChange: (state: { busy: boolean; dirty: boolean }) => void;
  /** Called with the submitted briefing's id. */
  onSubmitted: (briefingId: string) => void;
};

/**
 * The three-step briefing editor: choosing a service, filling in details (delegated to
 * `BriefingEditorDetails`), and reviewing before saving or sending. `BriefingEditorPage` (in
 * `briefing-editor.tsx`) resolves the client, briefing, brand defaults and service catalog first
 * and renders this once every prerequisite is ready.
 */
export function BriefingEditor({
  clientId,
  clientName,
  briefing,
  campaigns,
  defaults,
  serviceCatalog,
  dialog,
  people,
}: {
  clientId: string;
  clientName: string;
  briefing?: Briefing;
  campaigns: Campaign[];
  defaults: BriefingDirection;
  serviceCatalog: ServiceDefinition[];
  dialog?: BriefingDialogOptions;
  /**
   * The client's people, for the studio's Requested by picker. A client person never gets it: they
   * are always the requester of what they file, and `save_briefing` ignores any other choice.
   */
  people?: ClientPerson[];
}) {
  const { database } = useAuth();
  const queryClient = useQueryClient();
  const invalidateNotifications = useInvalidateNotifications();
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
  const [dirty, setDirty] = useState(false);
  const editor = useRef<HTMLDivElement>(null);
  const validation = useRef<HTMLDivElement>(null);
  const fileWrites = useIsMutating({ mutationKey: ["briefing-file", savedId] });
  const service = serviceCatalog.find((item) => item.id === draft.serviceId);
  const [requestedBy, setRequestedBy] = useState(() =>
    people ? initialRequester(briefing?.requested_by, people) : "",
  );
  /** Any edit clears an obsolete validation summary and the saved notice. */
  const touch = () => {
    if (errors.length) setErrors([]);
    setSaved(false);
    setDirty(true);
  };
  const update = (patch: Partial<BriefingDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    touch();
  };
  const chooseRequester = (id: string) => {
    setRequestedBy(id);
    touch();
  };
  const updateDirection = (patch: Partial<BriefingDirection>) =>
    update({ direction: { ...draft.direction, ...patch } });
  const save = useMutation({
    mutationFn: async (submit: boolean) => {
      if (!draft.serviceId) throw new Error("Choose a service before saving your draft.");
      const validation = [
        ...requesterErrors(requestedBy, people),
        ...(submit ? validateBriefing(draft) : []),
      ];
      if (validation.length) {
        setErrors(validation);
        throw new Error("Review the highlighted briefing requirements.");
      }
      const stored = await saveBriefingRevision(database, {
        payload: briefingPayload(
          clientId,
          { ...draft, direction: { ...draft.direction, preset_revision: service?.revision } },
          savedId,
          serviceEstimate(service),
          requestedBy,
        ),
        expectedRevision,
      });
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
      if (submit) await submitBriefing(database, { briefingId: id });
      return { id, submit };
    },
    onSuccess: ({ id, submit }) => {
      setSaved(true);
      setDirty(false);
      setErrors([]);
      // Saving or submitting changes the briefing row and, on submit, notifies the studio. The
      // briefing's own attachments and brand guidance are untouched, so only `briefings` is taken
      // from this feature's keys. `notifications` is owned by `workspace/workspace-data.ts`, whose
      // `notificationsQueryKeys` is exactly `["notifications"]` — the same single key this call
      // already invalidated — so its helper is non-widening here, as in `briefing-detail.tsx`.
      void queryClient.invalidateQueries({ queryKey: [briefingQueryKeys.briefings] });
      void invalidateNotifications();
      if (dialog) {
        if (submit) dialog.onSubmitted(id);
      } else if (submit) router.push(`/clients/${clientId}/briefings/${id}`);
      else router.replace(`/clients/${clientId}/briefings/${id}/edit`);
    },
  });
  const busy = save.isPending || !!fileWrites;
  const onStateChange = dialog?.onStateChange;
  const inDialog = !!dialog;
  useEffect(() => {
    onStateChange?.({ busy, dirty });
  }, [onStateChange, busy, dirty]);
  useEffect(() => {
    if (inDialog) editor.current?.closest(".modal-body")?.scrollTo({ top: 0 });
  }, [step, inDialog]);
  useEffect(() => {
    if (!errors.length) return;
    validation.current?.scrollIntoView({ block: "start" });
    validation.current?.focus({ preventScroll: true });
  }, [errors]);
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
    const validation = [...requesterErrors(requestedBy, people), ...validateBriefing(draft)];
    setErrors(validation);
    if (!validation.length) {
      setStep(2);
      if (!dialog) editor.current?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }

  const progress = (
    <nav className="briefing-progress" aria-label="Briefing steps">
      {["Service", "Details", "Review"].map((label, index) => (
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
  );

  return (
    <div
      ref={editor}
      className={`page-content briefing-editor ${dialog ? "briefing-editor-modal" : ""}`}
    >
      <header className={dialog ? "briefing-editor-header" : "page-heading card-heading"}>
        {dialog ? (
          <span className="eyebrow">{clientName}</span>
        ) : (
          <div className="page-title-row">
            <Link
              href={`/clients/${clientId}/briefings`}
              className="icon-button"
              aria-label="Briefings"
              title="Briefings"
            >
              <ArrowLeft size={16} />
            </Link>
            <h1>{briefing ? "Edit briefing" : "New briefing"}</h1>
          </div>
        )}
        {dialog && progress}
        <div className="page-actions">
          {service && (
            <button
              className="button"
              disabled={save.isPending || !!fileWrites || !service}
              onClick={() => save.mutate(false)}
            >
              {save.isPending ? "Saving…" : "Save draft"}
            </button>
          )}
        </div>
      </header>
      {!dialog && progress}
      {saved && (
        <p className="briefing-save-status" role="status">
          Draft saved.
        </p>
      )}
      {save.error && <FormError>{save.error.message}</FormError>}
      {errors.length > 0 && (
        <div className="briefing-validation" role="alert" ref={validation} tabIndex={-1}>
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
        <BriefingServicePicker
          catalog={serviceCatalog}
          selectedId={draft.serviceId}
          onSelect={selectService}
        />
      ) : step === 1 ? (
        <BriefingEditorDetails
          service={service}
          draft={draft}
          campaigns={campaigns}
          campaignSearch={campaignSearch}
          onCampaignSearchChange={setCampaignSearch}
          onOpenCampaignDialog={() => setCampaignOpen(true)}
          onChangeService={() => setStep(0)}
          onUpdate={update}
          onUpdateDirection={updateDirection}
          onUpdateDeliverable={updateDeliverable}
          defaults={defaults}
          savedId={savedId}
          onSaveDraft={() => save.mutate(false)}
          saving={busy}
          requester={
            people
              ? { people, value: requestedBy, clientName, onChange: chooseRequester }
              : undefined
          }
        />
      ) : (
        <div className="briefing-review">
          <div className="briefing-step-intro">
            <h2>Ready to send?</h2>
            <p>
              Check the details below. The studio will review your request before confirming the
              budget.
            </p>
          </div>
          <BriefingSummary
            draft={draft}
            campaignName={campaigns.find((item) => item.id === draft.campaignId)?.title}
          />
          {/* Beside the summary in the modal; elsewhere `display: contents`. */}
          <div className="briefing-review-side">
            {savedId && <BriefingAttachments briefingId={savedId} />}
            <div className="briefing-estimate">
              <span>{estimateLabel(service)}</span>
              <p>
                The studio will confirm one project total before work begins. Sending this briefing
                does not use credits.
              </p>
            </div>
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

"use client";

import { useDateFormat } from "@/features/workspace/workspace-data";
import {
  directionFields,
  formats,
  formatSize,
  services,
  type BriefingDraft,
} from "./briefing-model";

export function BriefingSummary({
  draft,
  campaignName,
  showTitle = true,
}: {
  draft: BriefingDraft;
  campaignName?: string;
  showTitle?: boolean;
}) {
  const { formatDate } = useDateFormat();
  const service = services.find((item) => item.id === draft.serviceId);
  return (
    <div className="briefing-summary">
      <section>
        <span className="eyebrow">{campaignName ?? "Campaign not chosen"}</span>
        <h2 className={showTitle ? undefined : "visually-hidden"}>
          {showTitle ? draft.title || "Untitled briefing" : "Briefing summary"}
        </h2>
        <p>{service?.name ?? "Service not chosen"}</p>
      </section>
      <section>
        <h3>Deliverables</h3>
        {draft.deliverables.length ? (
          draft.deliverables.map((item, index) => (
            <div className="briefing-deliverable-summary" key={item.id ?? index}>
              <strong>{item.name}</strong>
              <span>
                {formats.find((format) => format.id === item.format)?.name ?? item.format} ·{" "}
                {formatSize(item)}
              </span>
              <span>
                {item.quantity} {item.scope === "adaptation" ? "adaptation" : "original"}
                {item.quantity === 1 ? "" : "s"}
              </span>
            </div>
          ))
        ) : (
          <p>No deliverables added.</p>
        )}
      </section>
      <section>
        <h3>Creative direction</h3>
        {/* Each value keeps the label the editor gave its field, the overview included. */}
        <dl className="briefing-summary-fields">
          <SummaryField label="Overview" value={draft.overview || "No overview added."} />
          {draft.goals && <SummaryField label="Goals" value={draft.goals} />}
          {directionFields.map(({ id, label }) => {
            const value = draft.direction[id as keyof typeof draft.direction];
            return typeof value === "string" && value ? (
              <SummaryField key={id} label={label} value={value} />
            ) : null;
          })}
          {service?.questions.map((question) => (
            <SummaryField
              key={question.id}
              label={question.label}
              value={draft.direction.questions?.[question.id] || "Not provided"}
            />
          ))}
        </dl>
      </section>
      <section>
        <h3>Timing</h3>
        <p>{formatDate(draft.dueDate, "No target date. We will agree on timing together.")}</p>
      </section>
    </div>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="preserve-lines">{value}</dd>
    </div>
  );
}

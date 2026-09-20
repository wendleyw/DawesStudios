import { formats, formatSize, services, type BriefingDraft } from "./briefing-model";

export function BriefingSummary({
  draft,
  campaignName,
}: {
  draft: BriefingDraft;
  campaignName?: string;
}) {
  const service = services.find((item) => item.id === draft.serviceId);
  return (
    <div className="briefing-summary">
      <section>
        <span className="eyebrow">{campaignName ?? "Campaign not chosen"}</span>
        <h2>{draft.title || "Untitled briefing"}</h2>
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
        <p className="preserve-lines">{draft.overview || "No overview added."}</p>
        {draft.goals && (
          <p>
            <strong>Goals</strong>
            <br />
            {draft.goals}
          </p>
        )}
        {["audience", "messaging", "resources", "inspirations", "style", "notes"].map((key) => {
          const value = draft.direction[key as keyof typeof draft.direction];
          return typeof value === "string" && value ? (
            <p className="preserve-lines" key={key}>
              <strong className="briefing-field-name">{key}</strong>
              <br />
              {value}
            </p>
          ) : null;
        })}
        {service?.questions.map((question) => (
          <p className="preserve-lines" key={question.id}>
            <strong>{question.label}</strong>
            <br />
            {draft.direction.questions?.[question.id] || "Not provided"}
          </p>
        ))}
      </section>
      <section>
        <h3>Timing</h3>
        <p>
          {draft.dueDate
            ? new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(
                new Date(draft.dueDate),
              )
            : "No target date. We will agree on timing together."}
        </p>
      </section>
    </div>
  );
}

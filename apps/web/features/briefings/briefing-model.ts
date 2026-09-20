import catalog from "./service-catalog.json";
import { z } from "zod";
import type { Database } from "@database";

export type ServiceQuestion = {
  id: string;
  label: string;
  placeholder?: string;
  options?: string[];
};
export type ServiceDefinition = {
  id: string;
  name: string;
  category: string;
  description: string;
  min?: number;
  max?: number;
  days?: number;
  revision?: number;
  formats: string[];
  questions: ServiceQuestion[];
};
export type FormatDefinition = {
  id: string;
  name: string;
  unit: "px" | "mm" | "none";
  layout: "fixed" | "fluid" | "none";
  width?: number;
  height?: number;
  sizeLabel?: string;
};
export const services = catalog.types as ServiceDefinition[];
export const formats = catalog.formats as FormatDefinition[];
export type RequestedDeliverable = {
  id?: string;
  name: string;
  format: string;
  width?: number;
  height?: number;
  quantity: number;
  scope: "original" | "adaptation";
};
export type BriefingDirection = {
  source?: string;
  preset_revision?: number;
  audience?: string;
  messaging?: string;
  resources?: string;
  inspirations?: string;
  style?: string;
  notes?: string;
  questions?: Record<string, string>;
};
export type Briefing = {
  id: string;
  client_id: string;
  campaign_id: string | null;
  title: string;
  service_type: string;
  status: "draft" | "awaiting_review" | "budget_confirmed" | "accepted";
  overview: string;
  goals: string;
  direction: BriefingDirection;
  requested_deliverables: RequestedDeliverable[];
  due_date: string | null;
  estimated_credits?: number;
  confirmed_credits?: number | null;
  budget_note?: string | null;
  created_at: string;
  updated_at: string;
};
export type BriefingDraft = {
  serviceId: string;
  campaignId: string;
  title: string;
  overview: string;
  goals: string;
  direction: BriefingDirection;
  deliverables: RequestedDeliverable[];
  dueDate: string;
};
export type Campaign = {
  id: string;
  title: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
};
export type BrandSection = { section: string; content: Record<string, unknown> };

const deliverableSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  format: z.string(),
  width: z
    .number()
    .nullish()
    .transform((value) => value ?? undefined),
  height: z
    .number()
    .nullish()
    .transform((value) => value ?? undefined),
  quantity: z.number(),
  scope: z.enum(["original", "adaptation"]),
});
const directionSchema = z.object({
  source: z.string().optional(),
  preset_revision: z.number().int().positive().optional(),
  audience: z.string().optional(),
  messaging: z.string().optional(),
  resources: z.string().optional(),
  inspirations: z.string().optional(),
  style: z.string().optional(),
  notes: z.string().optional(),
  questions: z.record(z.string(), z.string()).optional(),
});

export function decodeBriefing(row: Database["public"]["Tables"]["briefings"]["Row"]): Briefing {
  return {
    ...row,
    direction: directionSchema.parse(row.direction),
    requested_deliverables: z.array(deliverableSchema).parse(row.requested_deliverables),
  };
}

export function decodeAssignedBriefing(
  row: Database["public"]["Functions"]["get_assigned_briefings"]["Returns"][number],
): Briefing {
  return {
    ...row,
    direction: directionSchema.parse(row.direction),
    requested_deliverables: z.array(deliverableSchema).parse(row.requested_deliverables),
  };
}

export const briefingStatusLabels: Record<Briefing["status"], string> = {
  draft: "Draft",
  awaiting_review: "Awaiting review",
  budget_confirmed: "Budget confirmed",
  accepted: "In progress",
};

export function serviceEstimate(service: ServiceDefinition | undefined) {
  return service?.min ? Math.round((service.min + (service.max ?? service.min)) / 2) : 1;
}

export function catalogWithPresets(
  presets: {
    service_type: string;
    min_credits: number | null;
    max_credits: number | null;
    due_days: number | null;
    revision: number;
  }[],
): ServiceDefinition[] {
  return services.map((service) => {
    const preset = presets.find((item) => item.service_type === service.id);
    if (!preset || service.id === "other") return { ...service };
    return {
      ...service,
      min: preset.min_credits ?? service.min,
      max: preset.max_credits ?? service.max,
      days: preset.due_days ?? service.days,
      revision: preset.revision,
    };
  });
}

export function estimateLabel(service: ServiceDefinition | undefined) {
  if (!service?.min) return "Estimate required";
  return `${service.min === service.max ? service.min : `${service.min}–${service.max}`} credits`;
}

export function formatSize(deliverable: Pick<RequestedDeliverable, "format" | "width" | "height">) {
  const format = formats.find((item) => item.id === deliverable.format);
  if (!format || format.layout === "none") return format?.sizeLabel ?? deliverable.format;
  return `${deliverable.width ?? format.width}${format.layout === "fixed" ? ` × ${deliverable.height ?? format.height}` : " wide"} ${format.unit}`;
}

export function brandDefaults(sections: BrandSection[]): BriefingDirection {
  const overview = sections.find((item) => item.section === "overview")?.content ?? {};
  const visual = sections.find((item) => item.section === "visual-style")?.content ?? {};
  const messaging = sections.find((item) => item.section === "messaging")?.content ?? {};
  return {
    source: "brand_hub",
    audience: typeof overview.audience === "string" ? overview.audience : "",
    style: typeof visual.photography === "string" ? visual.photography : "",
    messaging: typeof messaging.headline === "string" ? messaging.headline : "",
    questions: {},
  };
}

export function initialDraft(
  briefing: Briefing | undefined,
  defaults: BriefingDirection,
): BriefingDraft {
  return briefing
    ? {
        serviceId: briefing.service_type,
        campaignId: briefing.campaign_id ?? "",
        title: briefing.title,
        overview: briefing.overview,
        goals: briefing.goals,
        direction: briefing.direction ?? {},
        deliverables: briefing.requested_deliverables ?? [],
        dueDate: briefing.due_date ?? "",
      }
    : {
        serviceId: "",
        campaignId: "",
        title: "",
        overview: "",
        goals: "",
        direction: defaults,
        deliverables: [],
        dueDate: "",
      };
}

export function newDeliverable(formatId: string, sequence = 1): RequestedDeliverable {
  const format = formats.find((item) => item.id === formatId);
  if (!format) throw new Error("Choose an available format.");
  return {
    id: crypto.randomUUID(),
    name: `${format.name}${sequence > 1 ? ` / Variation ${sequence}` : ""}`,
    format: format.id,
    width: format.layout === "none" ? undefined : format.width,
    height: format.layout === "fixed" ? format.height : undefined,
    quantity: 1,
    scope: sequence > 1 ? "adaptation" : "original",
  };
}

export function validateBriefing(draft: BriefingDraft): string[] {
  const errors: string[] = [];
  const service = services.find((item) => item.id === draft.serviceId);
  if (!service) errors.push("Choose a service.");
  if (!draft.campaignId) errors.push("Choose or create a campaign.");
  if (!draft.title.trim()) errors.push("Give your project a title.");
  if (draft.title.length > 200) errors.push("Keep the project title under 200 characters.");
  if (!draft.overview.trim()) errors.push("Describe what you would like to create.");
  if (draft.deliverables.length === 0) errors.push("Add at least one deliverable.");
  for (const [index, item] of draft.deliverables.entries()) {
    const format = formats.find((candidate) => candidate.id === item.format);
    const label = `Deliverable ${index + 1}`;
    if (!item.name.trim()) errors.push(`${label} needs a name.`);
    if (!format || !service?.formats.includes(item.format))
      errors.push(`${label} needs a format supported by this service.`);
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100)
      errors.push(`${label} needs a quantity from 1 to 100.`);
    if (format?.layout !== "none" && (!Number.isInteger(item.width) || (item.width ?? 0) <= 0))
      errors.push(`${label} needs a positive whole-number width.`);
    if (format?.layout === "fixed" && (!Number.isInteger(item.height) || (item.height ?? 0) <= 0))
      errors.push(`${label} needs a positive whole-number height.`);
    if (item.scope !== "original" && item.scope !== "adaptation")
      errors.push(`${label} needs a creative scope.`);
  }
  for (const question of service?.questions ?? []) {
    const answer = draft.direction.questions?.[question.id]?.trim();
    if (!answer) errors.push(`Complete “${question.label}”.`);
    else if (question.options && !question.options.includes(answer))
      errors.push(`Choose an available option for “${question.label}”.`);
    else if (question.id === "pages" && (!/^\d+$/.test(answer) || Number(answer) < 1))
      errors.push(`“${question.label}” needs a positive whole number.`);
  }
  if (
    draft.dueDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate) ||
      Number.isNaN(Date.parse(draft.dueDate)) ||
      new Date(draft.dueDate).toISOString().slice(0, 10) !== draft.dueDate)
  )
    errors.push("Choose a valid due date.");
  return errors;
}

export function briefingPayload(
  clientId: string,
  draft: BriefingDraft,
  briefingId: string | null,
  estimatedCredits?: number,
): Database["public"]["Functions"]["save_briefing"]["Args"] {
  return {
    p_client_id: clientId,
    p_service_type: draft.serviceId,
    p_title: draft.title.trim(),
    ...(draft.campaignId ? { p_campaign_id: draft.campaignId } : {}),
    p_overview: draft.overview.trim(),
    p_goals: draft.goals.trim(),
    p_direction: draft.direction,
    p_deliverables: draft.deliverables.map((item) => ({
      name: item.name,
      format: item.format,
      width: item.width,
      height: item.height,
      quantity: item.quantity,
      scope: item.scope,
    })),
    ...(draft.dueDate ? { p_due_date: draft.dueDate } : {}),
    p_estimated_credits:
      estimatedCredits ?? serviceEstimate(services.find((item) => item.id === draft.serviceId)),
    ...(briefingId ? { p_briefing_id: briefingId } : {}),
  };
}

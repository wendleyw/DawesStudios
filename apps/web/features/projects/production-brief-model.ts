import { z } from "@/lib/zod";
import {
  directionFields,
  initialDraft,
  formats,
  type Briefing,
  type BriefingDraft,
} from "@/features/briefings/briefing-model";

const text = z.string().max(12000);
export const productionBriefSchema = z.object({
  title: z.string().trim().min(1, "Add a production title.").max(200),
  serviceId: z.string().min(1, "Choose a service."),
  overview: text,
  goals: text,
  dueDate: z.string(),
  direction: z.object({
    audience: text.optional(),
    messaging: text.optional(),
    style: text.optional(),
    resources: text.optional(),
    inspirations: text.optional(),
    notes: text.optional(),
    questions: z.record(z.string(), text).optional(),
  }),
  deliverables: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Name each production deliverable.").max(200),
        format: z
          .string()
          .refine((value) => formats.some((item) => item.id === value), "Choose a format."),
        quantity: z.number().int().min(1).max(100),
        scope: z.enum(["original", "adaptation"]),
        width: z.number().int().min(1).max(100000).optional(),
        height: z.number().int().min(1).max(100000).optional(),
      }),
    )
    .max(50),
  references: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Name each reference.").max(200),
        url: z
          .string()
          .trim()
          .max(2000)
          .refine((value) => {
            try {
              const url = new URL(value);
              return url.protocol === "https:" && !!url.hostname && !url.username && !url.password;
            } catch {
              return false;
            }
          }, "Use an HTTPS reference link."),
      }),
    )
    .max(30),
});
export type ProductionBriefContent = z.infer<typeof productionBriefSchema>;
export type ProductionBriefRecord = {
  board_id: string;
  content: ProductionBriefContent;
  revision: number;
  updated_at: string;
};

export function emptyProductionBrief(
  title: string,
  serviceId: string,
  dueDate: string | null,
): ProductionBriefContent {
  return {
    title,
    serviceId,
    overview: "",
    goals: "",
    direction: {},
    deliverables: [],
    dueDate: dueDate ?? "",
    references: [],
  };
}

/** Copy into the agency's editor only; sending is a separate explicit action. */
export function copyClientBrief(
  briefing: Briefing,
  dueDate: string | null,
): ProductionBriefContent {
  const draft = initialDraft(briefing, {});
  return productionBriefSchema.parse({
    ...draft,
    dueDate: dueDate ?? "",
    references: [],
    direction: {
      ...Object.fromEntries(directionFields.map(({ id }) => [id, draft.direction[id] ?? ""])),
      questions: draft.direction.questions ?? {},
    },
  });
}

export function productionSummary(content: ProductionBriefContent): BriefingDraft {
  return { ...content, campaignId: "" };
}

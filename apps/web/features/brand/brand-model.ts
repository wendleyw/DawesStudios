import { z } from "zod";
import type { Json } from "@database";
import {
  BUCKET_MAX_BYTES,
  brandUploadMimes,
  uploadExtensionMap,
  uploadSizeMessage,
  uploadTypeMessage,
} from "@/features/shared/upload-rules";

export const brandNavigation = [
  { id: "overview", label: "Overview", group: "Identity" },
  { id: "logos", label: "Logos", group: "Identity" },
  { id: "colors", label: "Colors", group: "Identity" },
  { id: "typography", label: "Typography", group: "Identity" },
  { id: "visual-style", label: "Visual style", group: "Identity" },
  { id: "products", label: "Products", group: "Resources" },
  { id: "assets", label: "Assets", group: "Resources" },
  { id: "messaging", label: "Messaging", group: "Guidance" },
  { id: "ai", label: "Brand context", group: "Guidance" },
] as const;
export type BrandSectionId = (typeof brandNavigation)[number]["id"];
export type EditableSectionId = Exclude<BrandSectionId, "assets">;
export type ColorSwatch = { name: string; hex: string };
export type BrandProduct = { name: string; description: string; specs: string; rules: string };
export type SectionField = {
  key: string;
  label: string;
  kind?: "multiline" | "lines" | "scale" | "url";
  required?: boolean;
  maxLength?: number;
};

export const sectionFields: Record<EditableSectionId, SectionField[]> = {
  overview: [
    { key: "name", label: "Brand name", required: true },
    { key: "tagline", label: "Tagline" },
    { key: "description", label: "About the brand", kind: "multiline" },
    { key: "audience", label: "Audience", kind: "multiline" },
    { key: "tone", label: "Tone of voice — one trait per line", kind: "lines" },
    { key: "rules", label: "Brand principles — one per line", kind: "lines" },
  ],
  logos: [
    { key: "guidance", label: "Logo usage guidance", kind: "multiline" },
    { key: "variants", label: "Approved variants — one per line", kind: "lines" },
  ],
  colors: [],
  typography: [
    { key: "heading", label: "Heading font", required: true },
    { key: "body", label: "Body font", required: true },
    { key: "headingSource", label: "Heading font source URL", kind: "url", maxLength: 2048 },
    { key: "bodySource", label: "Body font source URL", kind: "url", maxLength: 2048 },
    {
      key: "scale",
      label: "Type sizes in pixels, separated by commas",
      kind: "scale",
      required: true,
    },
  ],
  "visual-style": [
    { key: "principles", label: "Visual principles — one per line", kind: "lines" },
    { key: "photography", label: "Photography direction", kind: "multiline" },
    { key: "use", label: "Use — one direction per line", kind: "lines" },
    { key: "avoid", label: "Avoid — one direction per line", kind: "lines" },
  ],
  products: [],
  messaging: [
    { key: "headline", label: "Primary headline" },
    { key: "description", label: "Supporting message", kind: "multiline" },
    { key: "cta", label: "Call to action" },
    { key: "terminology", label: "Preferred terminology — one term per line", kind: "lines" },
    { key: "rules", label: "Messaging rules — one per line", kind: "lines" },
  ],
  ai: [
    {
      key: "instructions",
      label: "Reusable brand instructions",
      kind: "multiline",
      maxLength: 12000,
    },
    { key: "use", label: "Use — one instruction per line", kind: "lines" },
    { key: "never", label: "Never — one instruction per line", kind: "lines" },
  ],
};

const shortText = z.string().trim().max(300);
const longText = z.string().trim().max(6000);
const fontSource = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => !value || !!safeFontSource(value), "Use a complete HTTPS font source URL.");
const lines = z.array(shortText.min(1)).max(30);
export const hexColor = z
  .string()
  .trim()
  .regex(/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i, "Use a HEX color such as #191919.")
  .transform((value) =>
    (value.length === 4
      ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
      : value
    ).toUpperCase(),
  );
const sectionSchemas = {
  overview: z.object({
    name: shortText.min(1, "Enter a brand name."),
    tagline: shortText,
    description: longText,
    audience: longText,
    tone: lines,
    rules: lines,
  }),
  logos: z.object({ guidance: longText, variants: lines }),
  colors: z.object({
    palette: z
      .array(z.object({ name: shortText.min(1, "Name each color."), hex: hexColor }))
      .min(1, "Add at least one color.")
      .max(20),
  }),
  typography: z.object({
    heading: shortText.min(1, "Enter a heading font."),
    body: shortText.min(1, "Enter a body font."),
    headingSource: fontSource,
    bodySource: fontSource,
    scale: z
      .array(
        z
          .number()
          .int()
          .min(8, "Type sizes must be at least 8 px.")
          .max(144, "Type sizes must be 144 px or smaller."),
      )
      .min(1)
      .max(12),
  }),
  "visual-style": z.object({ principles: lines, photography: longText, use: lines, avoid: lines }),
  products: z.object({
    items: z
      .array(
        z.object({
          name: shortText.min(1, "Name each product."),
          description: longText,
          specs: longText,
          rules: longText,
        }),
      )
      .max(50),
  }),
  messaging: z.object({
    headline: shortText,
    description: longText,
    cta: shortText,
    terminology: lines,
    rules: lines,
  }),
  ai: z.object({ instructions: z.string().trim().max(12000), use: lines, never: lines }),
};

export function isBrandSection(value: string): value is BrandSectionId {
  return brandNavigation.some((item) => item.id === value);
}
export function contentRecord(content: Json | undefined): Record<string, Json | undefined> {
  return content && typeof content === "object" && !Array.isArray(content) ? content : {};
}
export function textValue(content: Json | undefined, key: string, fallback = "") {
  const value = contentRecord(content)[key];
  return typeof value === "string" ? value : fallback;
}
export function textList(content: Json | undefined, key: string): string[] {
  const value = contentRecord(content)[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
export function readPalette(content: Json | undefined): ColorSwatch[] {
  const value = contentRecord(content).palette;
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const record = contentRecord(item);
        const result = hexColor.safeParse(record.hex);
        return typeof record.name === "string" && result.success
          ? [{ name: record.name, hex: result.data }]
          : [];
      })
    : [];
}
export function readProducts(content: Json | undefined): BrandProduct[] {
  const value = contentRecord(content).items;
  return Array.isArray(value)
    ? value
        .filter((item) => typeof contentRecord(item).name === "string")
        .map((item) => ({
          name: textValue(item, "name"),
          description: textValue(item, "description"),
          specs: textValue(item, "specs"),
          rules: textValue(item, "rules"),
        }))
    : [];
}
export function readScale(content: Json | undefined): number[] {
  const scale = contentRecord(content).scale;
  return Array.isArray(scale)
    ? scale.filter(
        (value): value is number =>
          typeof value === "number" && Number.isInteger(value) && value >= 8 && value <= 144,
      )
    : [];
}
export function fieldsForSection(
  section: EditableSectionId,
  content: Json | undefined,
): Record<string, string> {
  return Object.fromEntries(
    sectionFields[section].map((field) => [
      field.key,
      field.kind === "lines"
        ? textList(content, field.key).join("\n")
        : field.kind === "scale"
          ? readScale(content).join(", ")
          : textValue(content, field.key),
    ]),
  );
}
export function parseSectionInput(
  section: EditableSectionId,
  fields: Record<string, string>,
  palette: ColorSwatch[] = [],
  products: BrandProduct[] = [],
): Json {
  const content: Record<string, Json> = {};
  for (const field of sectionFields[section]) {
    const value = fields[field.key] ?? "";
    content[field.key] =
      field.kind === "lines"
        ? value
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
        : field.kind === "scale"
          ? value.split(",").map((size) => Number(size.trim()))
          : value;
  }
  if (section === "colors") content.palette = palette;
  if (section === "products") content.items = products;
  return sectionSchemas[section].parse(content);
}
export function validationMessage(error: unknown) {
  return error instanceof z.ZodError
    ? (error.issues[0]?.message ?? "Please check the highlighted values.")
    : error instanceof Error
      ? error.message
      : "This change could not be saved. Please try again.";
}
export function colorAsRgb(hex: string) {
  const value = hexColor.parse(hex);
  return `rgb(${parseInt(value.slice(1, 3), 16)}, ${parseInt(value.slice(3, 5), 16)}, ${parseInt(value.slice(5, 7), 16)})`;
}
export type ColorCopyFormat = "hex" | "rgb" | "css" | "tailwind";
export function formatBrandColor(color: ColorSwatch, format: ColorCopyFormat): string {
  const hex = hexColor.parse(color.hex);
  const name =
    color.name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "color";
  if (format === "rgb") return colorAsRgb(hex);
  if (format === "css") return `--brand-${name}: ${hex};`;
  if (format === "tailwind") return `bg-[${hex}] text-[${hex}] border-[${hex}]`;
  return hex;
}
export function safeFontSource(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
export function safeFontFamily(font: string) {
  const clean = font.replace(/[^a-z\d \-]/gi, "").slice(0, 100);
  return clean
    ? `"${clean}", ui-sans-serif, system-ui, sans-serif`
    : "ui-sans-serif, system-ui, sans-serif";
}

const templateSchema = z.object({
  cta: z.string().max(100),
  headline: z.string().max(300),
  subheading: z.string().max(300),
  body: z.string().max(3000),
  eyebrow: z.string().max(100),
  background: hexColor,
  foreground: hexColor,
  accent: hexColor,
  layout: z.enum(["editorial", "centered", "minimal"]),
});
export type TemplateContent = z.infer<typeof templateSchema>;
export function readTemplateContent(content: Json | undefined, fallback?: Json): TemplateContent {
  const merged = { ...contentRecord(fallback), ...contentRecord(content) };
  const color = (key: string, defaultValue: string) => {
    const result = hexColor.safeParse(merged[key]);
    return result.success ? result.data : defaultValue;
  };
  return {
    cta: textValue(merged, "cta"),
    headline: textValue(merged, "headline"),
    subheading: textValue(merged, "subheading"),
    body: textValue(merged, "body"),
    eyebrow: textValue(merged, "eyebrow"),
    background: color("background", "#F7F6F2"),
    foreground: color("foreground", "#191919"),
    accent: color("accent", "#D4DCB4"),
    layout:
      merged.layout === "centered" || merged.layout === "minimal" ? merged.layout : "editorial",
  };
}
export function parseDraftInput(name: string, content: TemplateContent) {
  return z
    .object({ name: shortText.min(1, "Give your draft a name."), content: templateSchema })
    .parse({ name, content });
}
export function makeBrandContext(
  name: string,
  sections: { section: string; content: Json }[],
): string {
  const find = (key: string) => sections.find((section) => section.section === key)?.content;
  const overview = find("overview");
  const palette = readPalette(find("colors"));
  return [
    name,
    textValue(overview, "tagline"),
    textValue(overview, "description"),
    `Audience: ${textValue(overview, "audience")}`,
    `Voice: ${textList(overview, "tone").join(", ")}`,
    "Principles:",
    ...textList(overview, "rules").map((rule) => `- ${rule}`),
    `Colors: ${palette.map((color) => `${color.name} ${color.hex}`).join(", ")}`,
    `Typography: ${textValue(find("typography"), "heading")} / ${textValue(find("typography"), "body")}`,
    textValue(find("visual-style"), "photography"),
    textValue(find("messaging"), "headline"),
    textValue(find("messaging"), "description"),
    textValue(find("messaging"), "cta"),
    "Terminology:",
    ...textList(find("messaging"), "terminology").map((term) => `- ${term}`),
    "Messaging rules:",
    ...textList(find("messaging"), "rules").map((rule) => `- ${rule}`),
    textValue(find("ai"), "instructions"),
    "Use:",
    ...[...textList(find("visual-style"), "use"), ...textList(find("ai"), "use")].map(
      (rule) => `- ${rule}`,
    ),
    "Never:",
    ...[...textList(find("visual-style"), "avoid"), ...textList(find("ai"), "never")].map(
      (rule) => `- ${rule}`,
    ),
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function matchesBrandSearch(
  item: { name: string; category?: string; description?: string; tags?: string[] },
  search: string,
  category = "",
) {
  return (
    (!category || item.category === category) &&
    `${item.name} ${item.description ?? ""} ${(item.tags ?? []).join(" ")}`
      .toLocaleLowerCase("en-US")
      .includes(search.trim().toLocaleLowerCase("en-US"))
  );
}
/**
 * Brand assets are the only upload path that accepts SVG, because `brand-assets` is the only
 * bucket whose `allowed_mime_types` includes it — a logo legitimately ships as a vector.
 */
export const brandFileTypes: Record<string, string> = uploadExtensionMap(brandUploadMimes);
export function validateBrandFile(file: { type: string; size: number }): string {
  if (!brandFileTypes[file.type]) throw new Error(uploadTypeMessage(brandUploadMimes));
  if (file.size <= 0) throw new Error("Choose a file that contains content.");
  if (file.size > BUCKET_MAX_BYTES) throw new Error(uploadSizeMessage());
  return brandFileTypes[file.type];
}

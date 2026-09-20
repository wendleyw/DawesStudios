import { describe, expect, it } from "vitest";
import { colorAsRgb, formatBrandColor, makeBrandContext, matchesBrandSearch, parseDraftInput, parseSectionInput, readPalette, readTemplateContent, safeFontSource, validateBrandFile } from "./brand-model";

describe("shared brand editing", () => {
  it("normalizes shorthand HEX values while retaining named palette order", () => {
    expect(parseSectionInput("colors", {}, [{ name: " Paper ", hex: "#fff" }, { name: "Ink", hex: "#1a2b3c" }])).toEqual({ palette: [{ name: "Paper", hex: "#FFFFFF" }, { name: "Ink", hex: "#1A2B3C" }] });
  });
  it("rejects invalid color content instead of persisting arbitrary CSS", () => {
    expect(() => parseSectionInput("colors", {}, [{ name: "Accent", hex: "url(https://example.com)" }])).toThrow();
    expect(() => parseSectionInput("colors", {}, [])).toThrow();
  });
  it("rejects empty or invalid typography scales", () => {
    for (const scale of ["", "0, 14", "12, abc", "12.5, 14", "16, 200"]) expect(() => parseSectionInput("typography", { heading: "Inter", body: "Inter", scale })).toThrow();
  });
  it("turns human-readable list fields into trimmed entries without empty rows", () => {
    expect(parseSectionInput("logos", { guidance: " Keep clear space. ", variants: "Primary\n\n Compact \n" })).toEqual({ guidance: "Keep clear space.", variants: ["Primary", "Compact"] });
  });
  it("does not render malformed palette entries as styles", () => {
    expect(readPalette({ palette: [null, { name: "Bad", hex: "red" }, { name: "Valid", hex: "#000" }] })).toEqual([{ name: "Valid", hex: "#000000" }]);
  });
  it("converts colors to correct reusable RGB text", () => { expect(colorAsRgb("#1a2b3c")).toBe("rgb(26, 43, 60)"); });
  it("exports safe CSS names and complete Tailwind color utilities", () => {
    expect(formatBrandColor({ name: "Paper / Warm", hex: "#abc" }, "css")).toBe("--brand-paper-warm: #AABBCC;");
    expect(formatBrandColor({ name: "Ink", hex: "#123456" }, "tailwind")).toBe("bg-[#123456] text-[#123456] border-[#123456]");
  });
  it("accepts optional HTTPS font references and rejects executable or credentialed URLs", () => {
    expect(safeFontSource("https://fonts.google.com/specimen/Inter")).toBe("https://fonts.google.com/specimen/Inter");
    for (const url of ["javascript:alert(1)", "http://example.com/font", "https://user:pass@example.com/font"]) {
      expect(safeFontSource(url)).toBeNull();
      expect(() => parseSectionInput("typography", { heading: "Inter", body: "Inter", scale: "14, 20", headingSource: url })).toThrow();
    }
    expect(parseSectionInput("typography", { heading: "Inter", body: "Inter", scale: "14, 20" })).toMatchObject({ headingSource: "", bodySource: "" });
  });
  it("persists terminology and explicit use/never guidance as trimmed lists", () => {
    expect(parseSectionInput("messaging", { headline: "Hello", description: "Welcome", cta: "Explore", terminology: " Studio\nClient ", rules: "Be specific" })).toMatchObject({ terminology: ["Studio", "Client"], rules: ["Be specific"] });
    expect(parseSectionInput("ai", { instructions: "Keep the brand consistent.", use: "Plain language", never: "Invent claims" })).toMatchObject({ use: ["Plain language"], never: ["Invent claims"] });
  });
});

describe("personal template content", () => {
  it("merges legacy partial drafts with their template without mutating either", () => {
    const base = { headline: "Original", background: "#fff", foreground: "#111", accent: "#abc", layout: "centered" };
    const draft = { headline: "My exploration" };
    const result = readTemplateContent(draft, base);
    expect(result).toMatchObject({ headline: "My exploration", background: "#FFFFFF", foreground: "#111111", accent: "#AABBCC", layout: "centered" });
    expect(base.headline).toBe("Original");
    expect(draft).toEqual({ headline: "My exploration" });
  });
  it("keeps only editable design content and never copies identity fields", () => {
    const content = readTemplateContent({ headline: "Hello", owner_id: "private-owner", project_id: "private-project", notes: "private", background: "javascript:bad" });
    expect(content).not.toHaveProperty("owner_id");
    expect(content).not.toHaveProperty("project_id");
    expect(content).not.toHaveProperty("notes");
    expect(content.background).toBe("#F7F6F2");
  });
  it("requires a meaningful draft name before save", () => { expect(() => parseDraftInput("  ", readTemplateContent({}))).toThrow(); });
  it("preserves the draft call to action and defaults legacy drafts to an empty value", () => {
    expect(readTemplateContent({}).cta).toBe("");
    expect(parseDraftInput("My draft", readTemplateContent({ cta: "Explore the collection" })).content.cta).toBe("Explore the collection");
  });
});

describe("brand resource handling", () => {
  it("searches asset tags and description within the selected category", () => {
    const asset = { name: "Wordmark", category: "Logo", description: "For dark surfaces", tags: ["Approved"] };
    expect(matchesBrandSearch(asset, " approved ", "Logo")).toBe(true);
    expect(matchesBrandSearch(asset, "dark", "Photography")).toBe(false);
  });
  it("accepts files at the supported maximum size", () => { expect(validateBrandFile({ type: "application/pdf", size: 50 * 1024 * 1024 })).toBe("pdf"); });
  it("rejects oversized, empty, and unsupported files before upload", () => {
    expect(() => validateBrandFile({ type: "image/png", size: 50 * 1024 * 1024 + 1 })).toThrow("50 MB");
    expect(() => validateBrandFile({ type: "image/png", size: 0 })).toThrow("content");
    expect(() => validateBrandFile({ type: "text/html", size: 100 })).toThrow("Choose a PNG");
  });
  it("builds reusable context from an explicit content allowlist", () => {
    const result = makeBrandContext("Acme", [{ section: "overview", content: { audience: "Designers", tone: ["Clear"], owner_id: "secret-user", rules: ["Use whitespace"] } }, { section: "internal", content: { message: "private conversation" } }]);
    expect(result).toContain("Voice: Clear");
    expect(result).toContain("Use whitespace");
    expect(result).not.toContain("secret-user");
    expect(result).not.toContain("private conversation");
  });
  it("exports use/never and messaging guidance in the current brand context", () => {
    const result = makeBrandContext("Acme", [{ section: "ai", content: { use: ["Plain language"], never: ["Invent claims"] } }, { section: "messaging", content: { terminology: ["Studio"], rules: ["Be specific"] } }]);
    expect(result).toContain("Use:\n\n- Plain language");
    expect(result).toContain("Never:\n\n- Invent claims");
    expect(result).toContain("Terminology:\n\n- Studio");
    expect(result).toContain("Be specific");
  });
});

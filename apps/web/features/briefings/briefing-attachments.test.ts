import { describe, expect, it } from "vitest";
import { validateAttachment } from "./briefing-attachments";

describe("briefing attachments", () => {
  it("accepts supported files up to the configured limit", () => {
    expect(
      validateAttachment({
        name: "Direction.PDF",
        type: "application/pdf",
        size: 50 * 1024 * 1024,
      }),
    ).toBe("pdf");
  });
  it("rejects a misleading extension or unsupported media type", () => {
    expect(() =>
      validateAttachment({ name: "Reference.html", type: "image/png", size: 100 }),
    ).toThrow("Choose a PNG, JPG, WebP, or PDF file.");
  });
  it("rejects oversized and empty files", () => {
    expect(() =>
      validateAttachment({ name: "Reference.png", type: "image/png", size: 50 * 1024 * 1024 + 1 }),
    ).toThrow("50 MB");
    expect(() => validateAttachment({ name: "Reference.png", type: "image/png", size: 0 })).toThrow(
      "empty",
    );
  });
});

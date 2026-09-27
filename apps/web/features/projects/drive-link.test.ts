import { describe, expect, it } from "vitest";
import { parseDriveUrl } from "./drive-link";

describe("parseDriveUrl", () => {
  it("returns null for a blank value, clearing the link", () => {
    expect(parseDriveUrl("")).toBeNull();
    expect(parseDriveUrl("   ")).toBeNull();
  });

  it("trims and accepts a Drive link", () => {
    expect(parseDriveUrl("  https://drive.google.com/drive/folders/1abc  ")).toBe(
      "https://drive.google.com/drive/folders/1abc",
    );
  });

  it("accepts the bare host with no path", () => {
    expect(parseDriveUrl("https://drive.google.com")).toBe("https://drive.google.com");
  });

  it.each([
    "http://drive.google.com/drive/folders/1",
    "https://drive.google.com.evil.example/drive/folders/1",
    "https://evil.example/drive.google.com",
    "https://drive.google.com@evil.com/x",
    "https://drive.google.com./x",
    "javascript:alert(1)",
    "not a url",
  ])("refuses %s", (url) => {
    expect(parseDriveUrl(url)).toBe(false);
  });
});

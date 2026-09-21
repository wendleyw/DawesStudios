import { describe, expect, it } from "vitest";
import { assertResult } from "./supabase";

describe("assertResult", () => {
  it("returns the data when there is no error", () => {
    expect(assertResult({ data: { id: "1" }, error: null })).toEqual({ id: "1" });
  });

  it("translates a Chromium/Firefox transport failure into a plain-language retry message", () => {
    expect(() =>
      assertResult({ data: null, error: { message: "TypeError: Failed to fetch" } }),
    ).toThrowError("The connection failed and your changes were not saved — try again.");
  });

  it("translates a Safari transport failure into the same retry message", () => {
    expect(() =>
      assertResult({ data: null, error: { message: "TypeError: Load failed" } }),
    ).toThrowError("The connection failed and your changes were not saved — try again.");
  });

  it("leaves a Postgres or RLS error message untouched", () => {
    expect(() =>
      assertResult({
        data: null,
        error: { message: 'duplicate key value violates unique constraint "clients_slug_key"' },
      }),
    ).toThrowError('duplicate key value violates unique constraint "clients_slug_key"');
  });

  it("leaves a validation message untouched", () => {
    expect(() =>
      assertResult({ data: null, error: { message: "Choose a file that contains content." } }),
    ).toThrowError("Choose a file that contains content.");
  });
});

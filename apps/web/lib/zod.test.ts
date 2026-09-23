import { describe, expect, it } from "vitest";
import { z } from "./zod";

describe("the shared zod instance", () => {
  it("is jitless, so it never probes eval under the strict Content-Security-Policy", () => {
    expect(z.config().jitless).toBe(true);
  });

  it("still parses and rejects like the default instance", () => {
    const schema = z.object({ name: z.string().min(1) });
    expect(schema.parse({ name: "Studio" })).toEqual({ name: "Studio" });
    expect(schema.safeParse({ name: "" }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { nextCommentAttempt } from "./comment-panel";

/**
 * `nextCommentAttempt` is the decision the brief's own retry test (Task 8, step 6) failed to
 * exercise: its snippet fed `postComment` the same `idempotencyKey` by hand on both calls, which
 * proves only that `postComment` forwards whatever key it is given — a ref keyed on the component's
 * mount would pass that test too. What actually matters, and what a mount-keyed ref gets wrong, is
 * the *decision* of when to mint a new key: reuse across a retry of the same comment, mint fresh
 * when the person edits the text or moves the pin before resubmitting. These tests exercise that
 * decision directly.
 */
describe("nextCommentAttempt", () => {
  it("mints a key on the first attempt", () => {
    const attempt = nextCommentAttempt(null, "same payload");
    expect(attempt.payload).toBe("same payload");
    expect(attempt.key).toMatch(/^comment:/);
  });

  it("reuses the same key when a retry resends the same payload", () => {
    const first = nextCommentAttempt(null, "same payload");
    const second = nextCommentAttempt(first, "same payload");
    expect(second.key).toBe(first.key);
    expect(second).toBe(first);
  });

  it("mints a new key when the payload changes between attempts", () => {
    const first = nextCommentAttempt(null, "Logo lands too late");
    const second = nextCommentAttempt(first, "Logo lands too late, move it earlier");
    expect(second.key).not.toBe(first.key);
    expect(second.payload).toBe("Logo lands too late, move it earlier");
  });
});

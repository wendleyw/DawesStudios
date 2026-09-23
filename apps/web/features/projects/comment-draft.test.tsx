// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";

// `useCommentDraft` reads `useAuth()` only for the signed-in user's id, which scopes the draft's
// cache key. Everything else in the auth provider is irrelevant here, so it is stubbed rather than
// stood up.
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ session: { user: { id: "user-1" } } }),
}));

const { useCommentDraft } = await import("./comment-draft");

/**
 * The draft outliving its panel is the whole point of these tests, so each one renders the hook
 * twice against one `QueryClient` — the second render is the remount. A `QueryClient` per test
 * keeps them independent.
 */
function mountDraft(client: QueryClient) {
  return renderHook(() => useCommentDraft("project-1", "internal", "design-1"), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe("the comment draft survives its panel", () => {
  it("isolates version discussion from project messages and pinned design drafts", () => {
    const client = new QueryClient();
    function mount(designId?: string, versionId?: string) {
      return renderHook(() => useCommentDraft("project-1", "client", designId, versionId), {
        wrapper: ({ children }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      });
    }
    const firstVersion = mount(undefined, "version-1");
    act(() => firstVersion.result.current.update({ body: "Apply this to both designs." }));
    firstVersion.unmount();
    const image = mount("design-1", "version-1");
    expect(image.result.current.draft.body).toBe("");
    act(() =>
      image.result.current.update({ body: "Move this headline.", pin: { x: 0.2, y: 0.3 } }),
    );
    image.unmount();
    for (const versionId of [undefined, "version-2"]) {
      const separate = mount(undefined, versionId);
      expect(separate.result.current.draft).toMatchObject({ body: "", pin: null });
      separate.unmount();
    }
    const restoredVersion = mount(undefined, "version-1");
    expect(restoredVersion.result.current.draft).toMatchObject({
      body: "Apply this to both designs.",
      pin: null,
    });
    restoredVersion.unmount();
    const restoredImage = mount("design-1", "version-1");
    expect(restoredImage.result.current.draft).toMatchObject({
      body: "Move this headline.",
      pin: { x: 0.2, y: 0.3 },
    });
  });

  it("carries the idempotency attempt across a remount", () => {
    // The defect this guards: the attempt used to live in the panel's own ref. Someone whose write
    // failed, closed the dialog and reopened it to retry got a *fresh* key, so a write that had in
    // fact committed server-side before the error became a second comment — precisely the
    // duplication `post_comment`'s replay guard exists to prevent. Measured against the live stack
    // before the fix: same key twice converged on one comment id, a different key with the same
    // body produced two.
    const client = new QueryClient();
    const first = mountDraft(client);
    act(() => {
      first.result.current.update({
        body: "Please tighten the kerning",
        attempt: { payload: "payload-A", key: "comment:key-A" },
      });
    });
    first.unmount();

    const second = mountDraft(client);
    expect(second.result.current.draft.body).toBe("Please tighten the kerning");
    expect(second.result.current.draft.attempt).toEqual({
      payload: "payload-A",
      key: "comment:key-A",
    });
  });

  it("is where `comment-panel.tsx` actually keeps the attempt", () => {
    // This assertion reads the panel's source, which needs justifying rather than assuming.
    //
    // The two tests around it prove the draft *can* carry an attempt across a remount. Neither
    // proves the panel *uses* it: revert `comment-panel.tsx` to the `useRef` it held before and
    // both still pass, because they never import the panel. A guard that stays green through the
    // exact regression it was written for is worse than no guard, so this one reads the file the
    // fix lives in. `shared/upload-rules.test.ts` parses migration SQL and
    // `shared/stylesheet-boundary.test.ts` parses CSS for the same reason: the property is about a
    // file's contents, and there is no runtime seam to observe it through short of rendering the
    // whole panel with a mocked Supabase client.
    const panel = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "comment-panel.tsx"),
      "utf8",
    );
    expect(panel).toContain("nextCommentAttempt(draft.attempt");
    expect(panel).not.toMatch(/useRef<CommentAttempt/);
    expect(panel).not.toMatch(/attempt\.current/);
  });

  it("drops the attempt when the draft is cleared, so a new comment mints a new key", () => {
    // The other half, and the reason the attempt is cleared *with* the draft rather than kept:
    // without this, someone who deliberately posts the same text twice would have the second post
    // swallowed as a replay of the first. Clearing on success is what keeps an intentional
    // duplicate a real second comment.
    const client = new QueryClient();
    const first = mountDraft(client);
    act(() => {
      first.result.current.update({
        body: "Approved",
        attempt: { payload: "payload-B", key: "comment:key-B" },
      });
    });
    act(() => first.result.current.clear());
    first.unmount();

    const second = mountDraft(client);
    expect(second.result.current.draft.body).toBe("");
    expect(second.result.current.draft.attempt).toBeNull();
  });
});

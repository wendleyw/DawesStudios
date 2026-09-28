import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommentPanel } from "./comment-panel";

const mocks = vi.hoisted(() => ({ post: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: {}, session: { user: { id: "viewer" } } }),
}));
vi.mock("@/features/workspace/workspace-data", () => ({
  useDateFormat: () => ({ formatDate: () => "Sep 27" }),
}));
vi.mock("./project-data", () => ({
  useProjectComments: (_projectId: string, _channel: string, versionId?: string) => ({
    data: [
      {
        id: "general",
        body: "Project note",
        versionId: null,
        resolved: false,
        label: "Studio",
        createdAt: "2026-09-27T12:00:00Z",
      },
      {
        id: "v1-note",
        body: "First version note",
        versionId: "v1",
        resolved: false,
        label: "Studio",
        createdAt: "2026-09-27T12:00:00Z",
      },
      {
        id: "v2-note",
        body: "Second version note",
        versionId: "v2",
        resolved: true,
        label: "Studio",
        createdAt: "2026-09-27T12:00:00Z",
      },
    ].filter((comment) => !versionId || comment.versionId === versionId),
    isPending: false,
  }),
  useInvalidateComments: () => mocks.invalidate,
  postComment: mocks.post,
  resolveComment: vi.fn(),
}));

const labels = { v1: "Version 1", v2: "Version 2" };
function mountPanel(
  currentVersion: { id: string; label: string } | undefined = { id: "v1", label: "Version 1" },
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (version: typeof currentVersion) => (
    <QueryClientProvider client={queryClient}>
      <CommentPanel
        projectId="project"
        projectTitle="Campus Welcome"
        channel="client"
        currentVersion={version}
        versionLabels={labels}
      />
    </QueryClientProvider>
  );
  const result = render(tree(currentVersion));
  return {
    ...result,
    changeVersion: (version: typeof currentVersion) => result.rerender(tree(version)),
  };
}

beforeEach(() => {
  mocks.post.mockReset().mockResolvedValue("saved-comment");
  mocks.invalidate.mockReset().mockResolvedValue(undefined);
});

describe("unified Comments", () => {
  it("returns to project scope immediately when no version is shown", async () => {
    const user = userEvent.setup();
    const panel = mountPanel();
    await user.type(screen.getByRole("textbox", { name: "Your message" }), "General draft");
    await user.click(screen.getByRole("button", { name: "This version" }));
    await user.type(screen.getByRole("textbox", { name: "Your message" }), "Version draft");
    panel.changeVersion(undefined);
    expect(screen.queryByRole("button", { name: "This version" })).toBeNull();
    expect(screen.getByRole("button", { name: "All activity" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "Your message" })).toHaveValue("General draft");
    expect(screen.getByText("Posting to", { exact: false })).toHaveTextContent(
      "Posting to Campus Welcome",
    );
  });

  it("preserves a follow-up typed while its earlier message is being sent", async () => {
    let finish!: (id: string) => void;
    mocks.post.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    mountPanel();
    const composer = screen.getByRole("textbox", { name: "Your message" });
    await user.type(composer, "First message");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    await user.clear(composer);
    await user.type(composer, "Keep this follow-up");
    finish("saved");
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalled());
    expect(composer).toHaveValue("Keep this follow-up");
  });

  it("shows one history with version labels and an explicit project destination", async () => {
    mountPanel();
    expect(screen.getByRole("heading", { name: "Comments" })).toBeVisible();
    expect(screen.getByRole("button", { name: "All activity" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Posting to", { exact: false })).toHaveTextContent(
      "Posting to Campus Welcome",
    );
    const history = screen.getByRole("region", { name: "Comment history" });
    expect(within(history).getByText("Project")).toBeVisible();
    expect(within(history).getByText("Version 1")).toBeVisible();
    expect(within(history).queryByText("Second version note")).toBeNull();
    await userEvent.setup().click(screen.getByRole("checkbox", { name: "Show resolved" }));
    expect(within(history).getByText("Version 2")).toBeVisible();
  });

  it("preserves separate drafts and posts to the selected version only", async () => {
    const user = userEvent.setup();
    mountPanel();
    await user.type(screen.getByRole("textbox", { name: "Your message" }), "General draft");
    await user.click(screen.getByRole("button", { name: "This version" }));
    expect(screen.getByRole("button", { name: "This version" })).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Your message" })).toHaveValue("");
    expect(screen.queryByText("Project note")).toBeNull();
    expect(screen.getByText("Posting to", { exact: false })).toHaveTextContent(
      "Posting to Campus Welcome [Version 1]",
    );
    await user.type(screen.getByRole("textbox", { name: "Your message" }), "Version draft");
    await user.click(screen.getByRole("button", { name: "All activity" }));
    expect(screen.getByRole("textbox", { name: "Your message" })).toHaveValue("General draft");
    await user.click(screen.getByRole("button", { name: "This version" }));
    expect(screen.getByRole("textbox", { name: "Your message" })).toHaveValue("Version draft");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          projectId: "project",
          channel: "client",
          versionId: "v1",
          body: "Version draft",
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Your message" })).toHaveValue(""),
    );
    await user.click(screen.getByRole("button", { name: "All activity" }));
    expect(screen.getByRole("textbox", { name: "Your message" })).toHaveValue("General draft");
  });

  it("follows the version on screen and restores its draft when returning", async () => {
    const user = userEvent.setup();
    const panel = mountPanel();
    await user.click(screen.getByRole("button", { name: "This version" }));
    await user.type(screen.getByRole("textbox", { name: "Your message" }), "V1 draft");
    panel.changeVersion({ id: "v2", label: "Version 2" });
    expect(screen.getByRole("button", { name: "This version" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "Your message" })).toHaveValue("");
    expect(screen.getByText("Posting to", { exact: false })).toHaveTextContent(
      "Posting to Campus Welcome [Version 2]",
    );
    panel.changeVersion({ id: "v1", label: "Version 1" });
    expect(screen.getByRole("textbox", { name: "Your message" })).toHaveValue("V1 draft");
  });

  it("keeps a late successful post from clearing another scope's draft", async () => {
    let finish!: (id: string) => void;
    mocks.post.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    mountPanel();
    await user.type(screen.getByRole("textbox", { name: "Your message" }), "Keep general draft");
    await user.click(screen.getByRole("button", { name: "This version" }));
    await user.type(screen.getByRole("textbox", { name: "Your message" }), "Pending version note");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "All activity" }));
    finish("saved");
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalled());
    expect(screen.getByRole("textbox", { name: "Your message" })).toHaveValue("Keep general draft");
    await user.click(screen.getByRole("button", { name: "This version" }));
    expect(screen.getByRole("textbox", { name: "Your message" })).toHaveValue("");
  });
});

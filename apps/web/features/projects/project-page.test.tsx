import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ProjectWorkspaceProps } from "./project-workspace";

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ profile: { id: "viewer-1", role: "agency" } }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("./project-events", () => ({ useProjectEvents: () => {} }));

// The `useProjectDetail(projectId, channel)` read is pending exactly while `pendingChannel.current`
// names the requested channel — the state under test switching Working files to a still-loading
// Shared with client read, and back.
const pendingChannel = { current: null as "internal" | "client" | null };
const projectData = {
  project: { id: "p", client_id: "c", title: "Campaign", status: "in_progress", due_date: null },
  versions: [],
  deliverables: [],
};
vi.mock("./project-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./project-data")>()),
  useDesignBoards: () => ({ data: [], isPending: false, fetchStatus: "idle", error: null }),
  useProjectDetail: (_projectId: string, channel: "internal" | "client") => {
    const isPending = pendingChannel.current === channel;
    return { isPending, data: isPending ? undefined : projectData, error: null, refetch: vi.fn() };
  },
}));

vi.mock("./project-workspace", () => ({
  ProjectWorkspace: ({ panels, onChannel }: ProjectWorkspaceProps) => (
    <div>
      <p>{panels.panel ? `${panels.panel} panel open` : "no panel open"}</p>
      <button onClick={() => panels.changePanel("comments")}>Open comments</button>
      <button onClick={() => onChannel("client")}>Switch to Shared with client</button>
    </div>
  ),
}));

import { ProjectPage } from "./project-page";

describe("ProjectPage", () => {
  it("keeps the open panel across a channel switch that unmounts the body while it loads", async () => {
    const user = userEvent.setup();
    pendingChannel.current = null;
    const { rerender } = render(<ProjectPage projectId="p" />);

    await user.click(screen.getByRole("button", { name: "Open comments" }));
    expect(screen.getByText("comments panel open")).toBeInTheDocument();

    // Switching channel makes the read for "client" pending, which unmounts the body below
    // `ProjectPage`'s early return — the bug this test guards against.
    pendingChannel.current = "client";
    await user.click(screen.getByRole("button", { name: "Switch to Shared with client" }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading the project…");
    expect(screen.queryByText("comments panel open")).toBeNull();

    // The read resolves; the body remounts and must still find the panel open, because
    // `project-page.tsx` owns it above the early return that just unmounted the body.
    pendingChannel.current = null;
    rerender(<ProjectPage projectId="p" />);
    expect(screen.getByText("comments panel open")).toBeInTheDocument();
  });
});

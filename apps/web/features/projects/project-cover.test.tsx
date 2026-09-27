import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  database: {},
  mediaUrl: "http://media.test",
  profile: { id: "viewer-1", role: "agency" as "agency" | "designer" | "client" },
}));
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => auth }));

const mediaClient = vi.hoisted(() => ({
  prepareProjectCover: vi.fn(),
  clearProjectCover: vi.fn(),
}));
vi.mock("./media-client", () => mediaClient);

const projectData = vi.hoisted(() => ({
  cover: null as { storagePath: string; clientVisible: boolean; url: string } | null,
  invalidate: vi.fn(),
  setProjectCoverVisibility: vi.fn(),
}));
vi.mock("./project-data", () => ({
  useProjectCover: () => ({ data: projectData.cover, isPending: false, error: null }),
  useInvalidateProject: () => projectData.invalidate,
  setProjectCoverVisibility: (...args: unknown[]) => projectData.setProjectCoverVisibility(...args),
}));

import { ProjectCover } from "./project-cover";

// jsdom has no native dialog/top-layer implementation; real focus isolation is covered in E2E.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  },
  close: {
    configurable: true,
    value() {
      this.removeAttribute("open");
    },
  },
});

function renderCover() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ProjectCover projectId="project-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.profile.role = "agency";
  projectData.cover = null;
  projectData.invalidate.mockResolvedValue(undefined);
  mediaClient.prepareProjectCover.mockResolvedValue({ path: "project-1/cover.png" });
  mediaClient.clearProjectCover.mockResolvedValue(true);
  projectData.setProjectCoverVisibility.mockResolvedValue(undefined);
});

describe("ProjectCover by role", () => {
  it("gives the agency Set cover with no switch or Remove when there is no cover yet", () => {
    renderCover();
    expect(screen.getByText("No cover set yet.")).toBeInTheDocument();
    expect(screen.getByText("Set cover")).toBeInTheDocument();
    expect(screen.queryByText("Visible to the client")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("gives the agency Replace, the visibility switch and Remove once a cover exists", () => {
    projectData.cover = { storagePath: "project-1/cover.png", clientVisible: true, url: "signed" };
    renderCover();
    expect(screen.getByAltText("Project cover")).toHaveAttribute("src", "signed");
    expect(screen.getByText("Replace")).toBeInTheDocument();
    const toggle = screen.getByRole("switch", { name: "Visible to the client" });
    expect(toggle).toBeChecked();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("gives a designer a read-only preview and never renders the agency's controls", () => {
    auth.profile.role = "designer";
    projectData.cover = { storagePath: "project-1/cover.png", clientVisible: true, url: "signed" };
    renderCover();
    expect(screen.getByAltText("Project cover")).toBeInTheDocument();
    expect(screen.queryByText("Replace")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("renders nothing for a designer when no cover exists", () => {
    auth.profile.role = "designer";
    const { container } = renderCover();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a client the preview once the row is readable", () => {
    auth.profile.role = "client";
    projectData.cover = { storagePath: "project-1/cover.png", clientVisible: true, url: "signed" };
    renderCover();
    expect(screen.getByAltText("Project cover")).toBeInTheDocument();
    expect(screen.queryByText(/Set cover|Replace/)).not.toBeInTheDocument();
  });

  it("renders nothing at all for a client the row does not reach, not an empty placeholder", () => {
    auth.profile.role = "client";
    projectData.cover = null;
    const { container } = renderCover();
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ProjectCover writes", () => {
  it("uploads a first cover with visibility false, since none exists to carry forward", async () => {
    renderCover();
    const file = new File([new Uint8Array(4)], "cover.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Set cover"), { target: { files: [file] } });
    await waitFor(() =>
      expect(mediaClient.prepareProjectCover).toHaveBeenCalledWith(
        auth.database,
        auth.mediaUrl,
        "project-1",
        file,
        false,
      ),
    );
    await waitFor(() => expect(projectData.invalidate).toHaveBeenCalled());
  });

  it("replaces a cover carrying its current visibility forward, not the RPC's own false default", async () => {
    projectData.cover = { storagePath: "project-1/cover.png", clientVisible: true, url: "signed" };
    renderCover();
    const file = new File([new Uint8Array(4)], "cover.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Replace"), { target: { files: [file] } });
    await waitFor(() =>
      expect(mediaClient.prepareProjectCover).toHaveBeenCalledWith(
        auth.database,
        auth.mediaUrl,
        "project-1",
        file,
        true,
      ),
    );
  });

  it("shows the media service's own message when preparation fails", async () => {
    mediaClient.prepareProjectCover.mockRejectedValue(
      new Error("Covers support PNG, JPEG and WebP images only."),
    );
    renderCover();
    const file = new File([new Uint8Array(4)], "cover.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Set cover"), { target: { files: [file] } });
    expect(
      await screen.findByText("Covers support PNG, JPEG and WebP images only."),
    ).toBeInTheDocument();
  });

  it("toggles client visibility from the switch", async () => {
    projectData.cover = { storagePath: "project-1/cover.png", clientVisible: false, url: "signed" };
    renderCover();
    fireEvent.click(screen.getByRole("switch", { name: "Visible to the client" }));
    await waitFor(() =>
      expect(projectData.setProjectCoverVisibility).toHaveBeenCalledWith(auth.database, {
        projectId: "project-1",
        visible: true,
      }),
    );
    await waitFor(() => expect(projectData.invalidate).toHaveBeenCalled());
  });

  it("removes the cover only after the confirm dialog is accepted", async () => {
    projectData.cover = { storagePath: "project-1/cover.png", clientVisible: true, url: "signed" };
    renderCover();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(mediaClient.clearProjectCover).not.toHaveBeenCalled();
    expect(await screen.findByText("Remove this cover?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove cover" }));
    await waitFor(() =>
      expect(mediaClient.clearProjectCover).toHaveBeenCalledWith(
        auth.database,
        auth.mediaUrl,
        "project-1",
      ),
    );
    await waitFor(() => expect(projectData.invalidate).toHaveBeenCalled());
  });
});

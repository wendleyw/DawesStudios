import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/features/auth/auth-provider", () => auth);

const projectData = vi.hoisted(() => ({
  createDesignVersion: vi.fn(),
  useInvalidateProject: () => vi.fn(),
}));
vi.mock("./project-data", () => projectData);

const { ProjectActionVersion } = await import("./project-action-version");

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

beforeEach(() => {
  vi.clearAllMocks();
  auth.useAuth.mockReturnValue({ database: {} });
  projectData.createDesignVersion.mockResolvedValue(undefined);
});

// The dialog's own test file (`project-action-dialog.test.tsx`) never exercises `kind: "version"`;
// this fills that gap for the extracted component.
describe("ProjectActionVersion", () => {
  it("creates a version copied from the given source and closes on success", async () => {
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProjectActionVersion
          action={{ kind: "version", deliverableId: "d-1", sourceVersionId: "v-1" }}
          suspended={false}
          onClose={onClose}
        />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText(/version note/i), {
      target: { value: "Exploring a bolder headline" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create version/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(projectData.createDesignVersion).toHaveBeenCalledWith(
      {},
      { deliverableId: "d-1", notes: "Exploring a bolder headline", copyVersionId: "v-1" },
    );
  });
});

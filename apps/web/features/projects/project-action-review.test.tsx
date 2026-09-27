import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasVersion } from "./project-data";

const auth = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/features/auth/auth-provider", () => auth);

const projectData = vi.hoisted(() => ({
  reviewPublication: vi.fn(),
  useInvalidateProject: () => vi.fn(),
}));
vi.mock("./project-data", () => projectData);

const { ProjectActionReview } = await import("./project-action-review");

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

const version = { id: "pub-1", number: 3 } as unknown as CanvasVersion;

beforeEach(() => {
  vi.clearAllMocks();
  auth.useAuth.mockReturnValue({ database: {} });
  projectData.reviewPublication.mockResolvedValue(undefined);
});

// The dialog's own test file (`project-action-dialog.test.tsx`) never exercises `kind: "review"`;
// this fills that gap for the extracted component.
describe("ProjectActionReview", () => {
  it("sends a changes-requested decision with its feedback and closes on success", async () => {
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProjectActionReview action={{ kind: "review", version }} onClose={onClose} />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText(/your decision/i), {
      target: { value: "changes_requested" },
    });
    fireEvent.change(screen.getByLabelText(/feedback/i), {
      target: { value: "Please try a lighter background." },
    });
    fireEvent.click(screen.getByRole("button", { name: /send review/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(projectData.reviewPublication).toHaveBeenCalledWith(
      {},
      {
        publicationId: "pub-1",
        decision: "changes_requested",
        feedback: "Please try a lighter background.",
      },
    );
  });
});

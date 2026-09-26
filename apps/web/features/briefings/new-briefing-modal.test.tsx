import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewBriefingModal } from "./new-briefing-modal";

const fixture = vi.hoisted(() => ({
  role: "agency" as "agency" | "client",
  push: vi.fn(),
  back: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: fixture.push, back: fixture.back }),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ profile: { id: "viewer-1", role: fixture.role } }),
}));
// The editor itself is covered by its own tests; here it only reports a submission.
vi.mock("./briefing-editor", () => ({
  BriefingEditorPage: ({ dialog }: { dialog: { onSubmitted: (id: string) => void } }) => (
    <button onClick={() => dialog.onSubmitted("briefing-9")}>Send request</button>
  ),
}));

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
  fixture.push.mockReset();
  fixture.back.mockReset();
});

describe("NewBriefingModal", () => {
  it("takes the studio from its own submission to the budget review", async () => {
    fixture.role = "agency";
    const user = userEvent.setup();
    render(<NewBriefingModal clientId="client-1" />);
    await user.click(screen.getByRole("button", { name: "Send request" }));
    expect(screen.getByText(/Confirm its budget to create the project/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review budget" }));
    expect(fixture.push).toHaveBeenCalledWith("/clients/client-1/briefings/briefing-9");
  });

  it("tells a client the studio will review, with no budget action", async () => {
    fixture.role = "client";
    const user = userEvent.setup();
    render(<NewBriefingModal clientId="client-1" />);
    await user.click(screen.getByRole("button", { name: "Send request" }));
    expect(screen.getByText(/ready for the studio to review/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review budget" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(fixture.back).toHaveBeenCalled();
  });
});

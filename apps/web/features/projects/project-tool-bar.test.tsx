import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
// The animated mark is decorative and needs a browser's matchMedia; its own test covers it.
vi.mock("@/features/shared/brand-mark", () => ({ BrandMark: () => null }));

import { ProjectToolBar } from "./project-tool-bar";

const playground = (
  <button type="button" className="icon-button" aria-label="Playground">
    P
  </button>
);

describe("ProjectToolBar", () => {
  it("groups details, conversation and the page's own actions in that order", () => {
    render(
      <ProjectToolBar panel={null} onPanel={vi.fn()} disabled={false}>
        {playground}
      </ProjectToolBar>,
    );
    const group = screen.getByRole("group", { name: "Project actions" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Project details", "Conversation", "Playground"]);
  });

  it("opens a closed panel and closes the open one", async () => {
    const user = userEvent.setup();
    const onPanel = vi.fn();
    const { rerender } = render(
      <ProjectToolBar panel={null} onPanel={onPanel} disabled={false}>
        {playground}
      </ProjectToolBar>,
    );
    await user.click(screen.getByRole("button", { name: "Conversation" }));
    expect(onPanel).toHaveBeenLastCalledWith("conversation");
    rerender(
      <ProjectToolBar panel="conversation" onPanel={onPanel} disabled={false}>
        {playground}
      </ProjectToolBar>,
    );
    const conversation = screen.getByRole("button", { name: "Conversation" });
    expect(conversation).toHaveAttribute("aria-expanded", "true");
    expect(conversation).toHaveClass("selected");
    expect(screen.getByRole("button", { name: "Project details" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await user.click(conversation);
    expect(onPanel).toHaveBeenLastCalledWith(null);
    await user.click(screen.getByRole("button", { name: "Project details" }));
    expect(onPanel).toHaveBeenLastCalledWith("details");
  });

  it("disables both panel buttons while the Playground covers the project", () => {
    render(
      <ProjectToolBar panel={null} onPanel={vi.fn()} disabled>
        {playground}
      </ProjectToolBar>,
    );
    expect(screen.getByRole("button", { name: "Project details" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Conversation" })).toBeDisabled();
  });

  it("shows Feedback only when a workspace item is shown", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender } = render(
      <ProjectToolBar panel={null} onPanel={vi.fn()} disabled={false}>
        {null}
      </ProjectToolBar>,
    );
    expect(screen.queryByRole("button", { name: "Feedback" })).toBeNull();
    rerender(
      <ProjectToolBar
        panel={null}
        onPanel={vi.fn()}
        disabled={false}
        feedback={{ open: false, onToggle }}
      >
        {null}
      </ProjectToolBar>,
    );
    await user.click(screen.getByRole("button", { name: "Feedback" }));
    expect(onToggle).toHaveBeenCalled();
  });
});

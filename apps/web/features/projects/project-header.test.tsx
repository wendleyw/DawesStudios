import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectChannelLead } from "./project-header";

describe("ProjectChannelLead", () => {
  it("gives the agency both channels as tabs", () => {
    const onChannel = vi.fn();
    render(<ProjectChannelLead role="agency" channel="internal" onChannel={onChannel} />);
    const tabs = screen.getByRole("group", { name: "Project channel" });
    expect(within(tabs).getByRole("button", { name: "Working files" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(within(tabs).getByRole("button", { name: "Shared with client" }));
    expect(onChannel).toHaveBeenCalledWith("client");
  });

  it("labels a designer's channel Internal without a switch", () => {
    render(<ProjectChannelLead role="designer" channel="internal" onChannel={() => {}} />);
    expect(screen.getByText("Internal")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Project channel" })).toBeNull();
  });

  it("shows a client nothing", () => {
    const { container } = render(
      <ProjectChannelLead role="client" channel="client" onChannel={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

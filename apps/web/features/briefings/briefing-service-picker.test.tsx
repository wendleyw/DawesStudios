import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { services as serviceCatalog } from "./briefing-model";
import { BriefingServicePicker } from "./briefing-service-picker";

function renderPicker(selectedId = "") {
  const onSelect = vi.fn();
  render(
    <BriefingServicePicker catalog={serviceCatalog} selectedId={selectedId} onSelect={onSelect} />,
  );
  return onSelect;
}

describe("BriefingServicePicker", () => {
  it("opens on the categories and shows only the chosen category's services", async () => {
    const user = userEvent.setup();
    const onSelect = renderPicker();
    expect(
      screen.queryByRole("button", { name: /Short Video \/ Reel/, pressed: false }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Video/ }));
    expect(screen.getByRole("heading", { name: "Video", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Digital Ad \(Static\)/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: /Short Video \/ Reel/ }));
    expect(onSelect).toHaveBeenCalledWith("reel");
    await user.click(screen.getByRole("button", { name: "All categories" }));
    expect(screen.getByRole("button", { name: /^Social & ads/ })).toBeInTheDocument();
  });

  it("searches across every category", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.type(screen.getByRole("textbox", { name: "Find a service" }), "email");
    expect(screen.getByRole("button", { name: /Full Email Design/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Email Hero/ })).toBeInTheDocument();
  });

  it("opens a draft on its service's category with the service selected", () => {
    renderPicker("branding");
    expect(screen.getByRole("heading", { name: "Brand & print", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Simple Branding Package/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

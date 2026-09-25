import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "./workspace-data";

vi.mock("next/navigation", () => ({ usePathname: () => "/clients/c1/overview" }));

import { ClientNavigation } from "./client-navigation";

const client = { id: "c1", name: "SABRE" } as Client;
const labels = () =>
  within(screen.getByRole("navigation", { name: "SABRE navigation" }))
    .getAllByRole("link")
    .map((link) => link.textContent);

describe("ClientNavigation", () => {
  it("opens with Overview for clients and the studio", () => {
    render(<ClientNavigation client={client} role="client" />);
    expect(labels()).toEqual([
      "Overview",
      "Board",
      "Briefings",
      "Reviews",
      "Files",
      "Brand Hub",
      "Credits",
    ]);
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/clients/c1/overview",
    );
  });

  it("keeps designers on their five destinations", () => {
    render(<ClientNavigation client={client} role="designer" />);
    expect(labels()).toEqual(["Board", "Briefings", "Reviews", "Files", "Brand Hub"]);
  });
});

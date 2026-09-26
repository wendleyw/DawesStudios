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
  it("leaves Overview to the sidebar for clients and the studio", () => {
    render(<ClientNavigation client={client} role="client" />);
    expect(labels()).toEqual(["Board", "Briefings", "Reviews", "Brand Hub", "Credits"]);
  });

  it("keeps designers on their four destinations", () => {
    render(<ClientNavigation client={client} role="designer" />);
    expect(labels()).toEqual(["Board", "Briefings", "Reviews", "Brand Hub"]);
  });
});

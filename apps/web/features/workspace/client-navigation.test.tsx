import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "./workspace-data";

vi.mock("next/navigation", () => ({ usePathname: () => "/clients/c1/overview" }));
const preferences = vi.hoisted(() => ({ data: null as string | null }));
vi.mock("@/features/board/board-data", () => ({ useBoardPreferences: () => preferences }));

import { ClientNavigation } from "./client-navigation";

const client = { id: "c1", name: "SABRE" } as Client;
const labels = () =>
  within(screen.getByRole("navigation", { name: "SABRE navigation" }))
    .getAllByRole("link")
    .map((link) => link.textContent);

describe("ClientNavigation", () => {
  it("names the board link after the saved board view, List until one is chosen", () => {
    preferences.data = "kanban";
    render(<ClientNavigation client={client} role="client" />);
    expect(labels()[0]).toBe("Kanban");
    preferences.data = null;
  });

  it("leaves Overview to the sidebar for clients and the studio", () => {
    render(<ClientNavigation client={client} role="client" />);
    expect(labels()).toEqual(["List", "Briefings", "Reviews", "Brand Hub", "Credits"]);
  });

  it("keeps designers on their four destinations", () => {
    render(<ClientNavigation client={client} role="designer" />);
    expect(labels()).toEqual(["List", "Briefings", "Reviews", "Brand Hub"]);
  });
});

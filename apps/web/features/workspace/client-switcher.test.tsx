import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "./workspace-data";

const viewer = vi.hoisted(() => ({ role: "agency" }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ profile: { role: viewer.role } }),
}));

vi.mock("@/features/brand/brand-data", () => ({ useClientLogo: () => ({ data: undefined }) }));

import { ClientSwitcher } from "./client-switcher";

const clients: Client[] = [
  { id: "c1", name: "SABRE" } as Client,
  { id: "c2", name: "Acme" } as Client,
];

function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: "Select a client" }));
}

describe("ClientSwitcher options", () => {
  it("sends a client to each workspace's Overview from the switcher", () => {
    viewer.role = "client";
    render(<ClientSwitcher clients={clients} loading={false} failed={false} onRetry={vi.fn()} />);
    openPanel();
    expect(screen.getByRole("link", { name: "SABRE" })).toHaveAttribute(
      "href",
      "/clients/c1/overview",
    );
  });

  it("keeps the studio and designers on the board from the switcher", () => {
    viewer.role = "agency";
    render(<ClientSwitcher clients={clients} loading={false} failed={false} onRetry={vi.fn()} />);
    openPanel();
    expect(screen.getByRole("link", { name: "SABRE" })).toHaveAttribute(
      "href",
      "/clients/c1/board",
    );
  });
});

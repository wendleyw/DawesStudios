import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, Project } from "./workspace-data";

/**
 * A client with several workspaces stays on `/home` and opens each workspace's Overview from
 * there (spec non-goal); the studio and designers keep opening a workspace on its Board.
 */
const viewer = vi.hoisted(() => ({ role: "agency" }));
const query = (value: unknown) => ({
  data: value,
  isPending: false,
  error: null,
  refetch: vi.fn(),
});
const clients: Client[] = [
  { id: "c1", name: "SABRE" } as Client,
  { id: "c2", name: "Acme" } as Client,
];

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ profile: { role: viewer.role, display_name: "Beth Morgan" } }),
}));
vi.mock("./workspace-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./workspace-data")>();
  return {
    ...actual,
    useClients: () => query(clients),
    useProjects: () => query([] as Project[]),
    useWorkspaceCampaigns: () => query([]),
    useDateFormat: () => actual.createDateFormatters("UTC"),
  };
});

import { HomePage } from "./home-page";

describe("HomePage workspace cards", () => {
  it("opens a client's Overview from its card, for a client with several workspaces", () => {
    viewer.role = "client";
    render(<HomePage />);
    expect(screen.getByRole("link", { name: /SABRE/ })).toHaveAttribute(
      "href",
      "/clients/c1/overview",
    );
  });

  it("opens a client's board from its card, for the studio", () => {
    viewer.role = "agency";
    render(<HomePage />);
    expect(screen.getByRole("link", { name: /SABRE/ })).toHaveAttribute(
      "href",
      "/clients/c1/board",
    );
  });
});

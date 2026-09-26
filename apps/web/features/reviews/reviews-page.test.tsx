import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewRow } from "./review-data";

const state = vi.hoisted(() => ({
  role: "agency" as "agency" | "client",
  rows: [] as ReviewRow[],
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ profile: { role: state.role } }),
}));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/workspace/workspace-data")>();
  return {
    ...actual,
    useClients: () => ({ data: [{ id: "c1", name: "SABRE" }], isPending: false }),
    useDateFormat: () => actual.createDateFormatters("UTC"),
  };
});
vi.mock("./review-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./review-data")>()),
  useReviews: () => ({ data: state.rows, isPending: false, error: null, refetch: vi.fn() }),
}));
vi.mock("@/features/team/team-data", () => ({
  useClientPeople: () => ({
    data: {
      team: [{ user_id: "ana", display_name: "Ana Lima", email: "ana@sabre.test" }],
      names: state.role === "agency" ? { ana: "Ana Lima", ben: "Ben Cole" } : {},
    },
  }),
}));

import { ReviewsPage } from "./reviews-page";

const row = (overrides: Partial<ReviewRow>): ReviewRow => ({
  id: "v1",
  projectId: "p1",
  title: "Campus Welcome",
  deliverable: "Portrait Feed",
  version: 2,
  status: "approved",
  date: "2026-09-20T00:00:00Z",
  note: "Second round.",
  internal: false,
  reviewedBy: "ana",
  reviewedAt: "2026-09-24T10:00:00Z",
  ...overrides,
});

beforeEach(() => {
  state.role = "agency";
  state.rows = [
    row({}),
    row({
      id: "v2",
      projectId: "p2",
      title: "Holiday Poster",
      status: "changes_requested",
      note: "First round.",
      reviewedBy: "ben",
      reviewedAt: "2026-09-23T10:00:00Z",
    }),
    row({
      id: "v3",
      projectId: "p3",
      title: "Spring Sale",
      note: "Older round.",
      reviewedBy: null,
      reviewedAt: null,
    }),
  ];
});

describe("ReviewsPage decisions", () => {
  it("names who decided and when, and keeps the release note in the tooltip", async () => {
    render(<ReviewsPage clientId="c1" />);
    expect(screen.getByText("Changes requested by Ben Cole (left) · Sep 23")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Approved" }));
    expect(screen.getByText("Approved by Ana Lima · Sep 24")).toHaveAttribute(
      "title",
      "Second round.",
    );
    expect(screen.getByText("Older round.")).toBeInTheDocument();
  });

  it("tells a client a former member decided", async () => {
    state.role = "client";
    render(<ReviewsPage clientId="c1" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "With the studio" }));
    expect(screen.getByText("Changes requested by Former member · Sep 23")).toBeInTheDocument();
  });
});

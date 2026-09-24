import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PresetSettings } from "./preset-settings";

const briefingBackend = vi.hoisted(() => ({ useServicePresets: vi.fn() }));
vi.mock("@/features/briefings/briefing-data", () => briefingBackend);
vi.mock("./settings-data", () => ({
  saveServicePreset: vi.fn(),
  useInvalidatePresets: () => vi.fn(),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: {}, profile: { role: "agency" } }),
}));

function renderPresets(
  presets: {
    service_type: string;
    min_credits: number | null;
    max_credits: number | null;
    due_days: number | null;
    revision: number;
  }[],
) {
  briefingBackend.useServicePresets.mockReturnValue({
    isPending: false,
    error: null,
    data: presets,
    refetch: vi.fn(),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PresetSettings />
    </QueryClientProvider>,
  );
}

function row(name: string) {
  return screen.getByText(name).closest(".settings-preset-row") as HTMLElement;
}

describe("PresetSettings estimates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("states a fixed estimate once, the way the briefing editor does", () => {
    renderPresets([
      { service_type: "blog", min_credits: 12, max_credits: 12, due_days: 1, revision: 3 },
    ]);
    const blog = row("Blog Design / Infographic");
    expect(within(blog).getByText("12 credits")).toBeInTheDocument();
    expect(within(blog).queryByText("12–12 credits")).not.toBeInTheDocument();
    expect(within(blog).getByText("1 day")).toBeInTheDocument();
  });

  it("keeps a range for a service without a preset, from the catalog", () => {
    renderPresets([]);
    const guidelines = row("Brand Guidelines");
    expect(within(guidelines).getByText("10–15 credits")).toBeInTheDocument();
    expect(within(guidelines).getByText("14 days")).toBeInTheDocument();
  });
});

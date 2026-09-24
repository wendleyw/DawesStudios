import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompetitorScreen } from "./competitor-screen";
import type { Competitor } from "./competitors-model";

const backend = vi.hoisted(() => ({
  ads: {} as Record<string, unknown>,
  deleteCompetitor: vi.fn(),
  invalidate: vi.fn(async () => undefined),
}));
vi.mock("./competitors-data", () => ({
  useCompetitorAds: () => backend.ads,
  deleteCompetitor: backend.deleteCompetitor,
  useInvalidateCompetitors: () => backend.invalidate,
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: { name: "database" }, profile: { role: "agency" } }),
}));
vi.mock("@/features/workspace/workspace-data", () => ({
  useDateFormat: () => ({ formatDate: (date: string | null) => `on ${date}` }),
}));

// jsdom has no native dialog/top-layer implementation; real focus isolation is covered in E2E.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  },
  close: {
    configurable: true,
    value() {
      this.removeAttribute("open");
    },
  },
});

const rival: Competitor = {
  id: "c1",
  client_id: "client-1",
  name: "Rival Co",
  website: "https://www.rival.example",
  meta_page_id: "123456789",
  google_advertiser_id: null,
  tiktok_advertiser: null,
};

function renderScreen(props: Partial<Parameters<typeof CompetitorScreen>[0]> = {}) {
  const onClose = vi.fn();
  const onEdit = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CompetitorScreen competitor={rival} canEdit onEdit={onEdit} onClose={onClose} {...props} />
    </QueryClientProvider>,
  );
  return { onClose, onEdit };
}

beforeEach(() => {
  vi.clearAllMocks();
  backend.ads = {
    isPending: false,
    error: null,
    data: { status: "not_configured" },
    refetch: vi.fn(),
  };
});

describe("CompetitorScreen libraries", () => {
  it("links each official library in a new tab", async () => {
    renderScreen();
    const user = userEvent.setup();
    const meta = screen.getByRole("link", { name: "Open in Meta Ad Library" });
    expect(meta).toHaveAttribute(
      "href",
      "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&media_type=all&search_type=page&view_all_page_id=123456789",
    );
    expect(meta).toHaveAttribute("target", "_blank");
    expect(meta).toHaveAttribute("rel", "noopener noreferrer");
    await user.click(screen.getByRole("button", { name: "TikTok" }));
    expect(screen.getByRole("link", { name: "Open in TikTok Ad Library" })).toHaveAttribute(
      "href",
      "https://library.tiktok.com/ads?region=all&adv_name=Rival+Co",
    );
    expect(
      screen.getByText("TikTok's library covers ads shown in the EU, the UK and Switzerland."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Google" }));
    expect(
      screen.getByRole("link", { name: "Open in Google Ads Transparency Center" }),
    ).toHaveAttribute(
      "href",
      "https://adstransparency.google.com/?region=anywhere&domain=rival.example",
    );
  });

  it("asks for a website or advertiser ID when Google has neither", async () => {
    renderScreen({ competitor: { ...rival, website: null } });
    await userEvent.setup().click(screen.getByRole("button", { name: "Google" }));
    expect(
      screen.getByText("Add the competitor's website or Google advertiser ID for a direct link."),
    ).toBeInTheDocument();
  });
});

describe("CompetitorScreen Meta previews", () => {
  it("says previews are off, and tells only the agency how to turn them on", () => {
    renderScreen();
    expect(
      screen.getByText(/In-app previews are off\. The Ad Library shows every active ad\./),
    ).toHaveTextContent("Add a Meta Ad Library token on the server to preview ads here.");
  });

  it("keeps the setup hint from a designer", () => {
    renderScreen({ canEdit: false });
    expect(screen.getByText(/In-app previews are off/)).not.toHaveTextContent("token");
  });

  it("shows loading, then explains an empty answer", () => {
    backend.ads = { isPending: true, error: null, data: undefined, refetch: vi.fn() };
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <CompetitorScreen competitor={rival} canEdit onEdit={vi.fn()} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading ads from Meta…");
    unmount();
    backend.ads = {
      isPending: false,
      error: null,
      data: { status: "ready", ads: [], fetchedAt: "" },
      refetch: vi.fn(),
    };
    renderScreen();
    expect(
      screen.getByText(/Meta's API returned no active ads for this competitor\./),
    ).toBeInTheDocument();
  });

  it("renders only the parts an ad has, each with its Ad Library link", () => {
    backend.ads = {
      isPending: false,
      error: null,
      refetch: vi.fn(),
      data: {
        status: "ready",
        fetchedAt: "2026-09-24T06:00:00.000Z",
        ads: [
          {
            id: "111",
            pageName: "Rival Co",
            platforms: ["Facebook", "Instagram"],
            body: "Autumn sale",
            title: "Shop now",
            description: null,
            caption: "rival.example",
            startedOn: "2026-09-03",
            libraryUrl: "https://www.facebook.com/ads/library/?id=111",
          },
          {
            id: "222",
            pageName: "",
            platforms: [],
            body: null,
            title: null,
            description: null,
            caption: null,
            startedOn: null,
            libraryUrl: "https://www.facebook.com/ads/library/?id=222",
          },
        ],
      },
    };
    renderScreen();
    const [full, bare] = within(
      screen.getByRole("list", { name: "Rival Co ads from Meta" }),
    ).getAllByRole("listitem");
    expect(full).toHaveTextContent("Facebook · Instagram");
    expect(full).toHaveTextContent("Running since on 2026-09-03");
    expect(full).toHaveTextContent("Autumn sale");
    expect(full).toHaveTextContent("Shop now · rival.example");
    expect(within(full).getByRole("link", { name: "View in Ad Library" })).toHaveAttribute(
      "href",
      "https://www.facebook.com/ads/library/?id=111",
    );
    expect(bare).toHaveTextContent("Rival Co");
    expect(bare).not.toHaveTextContent("Running since");
    expect(bare).not.toHaveTextContent("undefined");
    expect(bare.querySelectorAll("p")).toHaveLength(0);
  });

  it("shows a failed preview's message with Try again, and keeps the library link", async () => {
    const refetch = vi.fn();
    backend.ads = {
      isPending: false,
      error: new Error("Your session has expired. Sign in again."),
      data: undefined,
      refetch,
    };
    renderScreen();
    expect(screen.getByRole("alert")).toHaveTextContent("Your session has expired. Sign in again.");
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Open in Meta Ad Library" })).toBeInTheDocument();
  });
});

describe("CompetitorScreen actions", () => {
  it("lets the agency edit, and remove after confirming", async () => {
    backend.deleteCompetitor.mockResolvedValue(undefined);
    const { onClose, onEdit } = renderScreen();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove competitor" }));
    expect(screen.getByText("Remove Rival Co from this client's competitors?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(backend.deleteCompetitor).toHaveBeenCalledWith({ name: "database" }, { id: "c1" });
    expect(backend.invalidate).toHaveBeenCalled();
  });

  it("gives a designer no edit or removal", () => {
    renderScreen({ canEdit: false });
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove competitor" })).not.toBeInTheDocument();
  });
});

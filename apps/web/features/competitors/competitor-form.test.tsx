import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompetitorForm } from "./competitor-form";

const backend = vi.hoisted(() => ({
  createCompetitor: vi.fn(),
  updateCompetitor: vi.fn(),
  invalidate: vi.fn(async () => undefined),
}));
vi.mock("./competitors-data", () => ({
  createCompetitor: backend.createCompetitor,
  updateCompetitor: backend.updateCompetitor,
  useInvalidateCompetitors: () => backend.invalidate,
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: { name: "database" }, profile: { role: "agency" } }),
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

function renderForm(props: Partial<Parameters<typeof CompetitorForm>[0]> = {}) {
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CompetitorForm clientId="client-1" onClose={onClose} {...props} />
    </QueryClientProvider>,
  );
  return { onClose };
}

beforeEach(() => vi.clearAllMocks());

describe("CompetitorForm", () => {
  it("adds a competitor with trimmed values and closes", async () => {
    backend.createCompetitor.mockResolvedValue({ id: "c1" });
    const { onClose } = renderForm();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "  Rival Co ");
    await user.type(screen.getByLabelText(/Website/), "https://rival.example");
    await user.type(screen.getByLabelText(/Facebook Page ID/), "123456789");
    await user.click(screen.getByRole("button", { name: "Add competitor" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(backend.createCompetitor).toHaveBeenCalledWith(
      { name: "database" },
      {
        clientId: "client-1",
        name: "Rival Co",
        website: "https://rival.example",
        metaPageId: "123456789",
        googleAdvertiserId: null,
        tiktokAdvertiser: null,
      },
    );
    expect(backend.invalidate).toHaveBeenCalled();
  });

  it("explains a malformed field before writing anything", async () => {
    renderForm();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "Rival Co");
    await user.type(screen.getByLabelText(/Google advertiser ID/), "CR123");
    await user.click(screen.getByRole("button", { name: "Add competitor" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A Google advertiser ID starts with AR, followed by digits.",
    );
    expect(backend.createCompetitor).not.toHaveBeenCalled();
  });

  it("names a duplicate in the person's words and keeps the form open", async () => {
    backend.createCompetitor.mockRejectedValue(
      new Error('duplicate key value violates unique constraint "competitors_client_name_key"'),
    );
    const { onClose } = renderForm();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "Rival Co");
    await user.click(screen.getByRole("button", { name: "Add competitor" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This client already follows Rival Co.",
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("edits an existing competitor in place", async () => {
    backend.updateCompetitor.mockResolvedValue({ id: "c1" });
    const { onClose } = renderForm({
      competitor: {
        id: "c1",
        client_id: "client-1",
        name: "Rival Co",
        website: null,
        meta_page_id: null,
        google_advertiser_id: null,
        tiktok_advertiser: "Rival Official",
      },
    });
    const user = userEvent.setup();
    expect(screen.getByLabelText("Name")).toHaveValue("Rival Co");
    expect(screen.getByLabelText(/TikTok advertiser name/)).toHaveValue("Rival Official");
    await user.clear(screen.getByLabelText(/TikTok advertiser name/));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(backend.updateCompetitor).toHaveBeenCalledWith(
      { name: "database" },
      {
        id: "c1",
        name: "Rival Co",
        website: null,
        metaPageId: null,
        googleAdvertiserId: null,
        tiktokAdvertiser: null,
      },
    );
  });
});

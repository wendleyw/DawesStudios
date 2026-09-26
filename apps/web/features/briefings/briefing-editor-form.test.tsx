import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientPerson } from "@/features/team/client-people";
import type { Briefing } from "./briefing-model";

const backend = vi.hoisted(() => ({ save: vi.fn(), submit: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: { name: "database" } }),
}));
vi.mock("@/features/workspace/workspace-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/workspace/workspace-data")>()),
  useInvalidateNotifications: () => vi.fn(),
}));
vi.mock("./briefing-attachments", () => ({ BriefingAttachments: () => null }));
vi.mock("./briefing-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./briefing-data")>()),
  saveBriefingRevision: backend.save,
  submitBriefing: backend.submit,
}));

import { BriefingEditor } from "./briefing-editor-form";
import { services } from "./briefing-model";

// jsdom has no `scrollIntoView` (jsdom/jsdom#1695); the editor's validation-summary effect calls it
// once a saved requester validation error renders, so an unstubbed call would throw during commit
// and unmount the tree. `focus` is implemented and left alone.
Element.prototype.scrollIntoView = () => {};

const draft: Briefing = {
  id: "briefing-1",
  client_id: "client-1",
  campaign_id: null,
  title: "Autumn launch",
  service_type: "static-ad",
  status: "draft",
  overview: "",
  goals: "",
  direction: {},
  requested_deliverables: [],
  due_date: null,
  requested_by: null,
  created_at: "2026-09-20T00:00:00Z",
  updated_at: "2026-09-20T00:00:00Z",
};
const ana: ClientPerson = { user_id: "ana", display_name: "Ana Lima", email: "ana@sabre.test" };
const ben: ClientPerson = { user_id: "ben", display_name: "Ben Cole", email: "ben@sabre.test" };

function renderEditor(people?: ClientPerson[]) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BriefingEditor
        clientId="client-1"
        clientName="SABRE"
        briefing={draft}
        campaigns={[]}
        defaults={{}}
        serviceCatalog={services}
        people={people}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  backend.save.mockResolvedValue({ id: "briefing-1", updated_at: "2026-09-20T01:00:00Z" });
});

describe("the studio's Requested by", () => {
  it("asks the studio who requested the briefing before saving it", async () => {
    renderEditor([ana, ben]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Choose who requested this briefing.")).toBeInTheDocument();
    expect(backend.save).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Requested by" }), "ben");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(backend.save).toHaveBeenCalledTimes(1));
    expect(backend.save.mock.calls[0][1].payload).toMatchObject({
      p_briefing_id: "briefing-1",
      p_requested_by: "ben",
    });
  });

  it("opens on the client's only person", () => {
    renderEditor([ana]);
    expect(screen.getByRole("combobox", { name: "Requested by" })).toHaveValue("ana");
  });

  it("explains a client with nobody and saves without a requester", async () => {
    renderEditor([]);
    expect(
      screen.getByText("Nobody at SABRE has an account yet, so this briefing has no requester."),
    ).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(backend.save).toHaveBeenCalledTimes(1));
    expect(backend.save.mock.calls[0][1].payload).not.toHaveProperty("p_requested_by");
  });

  it("never asks a client person, who is always the requester of what they file", async () => {
    renderEditor();
    expect(screen.queryByRole("combobox", { name: "Requested by" })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(backend.save).toHaveBeenCalledTimes(1));
    expect(backend.save.mock.calls[0][1].payload).not.toHaveProperty("p_requested_by");
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ProductionBriefEditor } from "./production-brief-editor";
import { emptyProductionBrief } from "./production-brief-model";
import type { DesignBoard, TableRow } from "./project-data";

const state = vi.hoisted(() => ({ save: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: {} }),
}));
vi.mock("@/features/briefings/briefing-data", () => ({
  useBriefings: () => ({ data: [] }),
}));
vi.mock("./project-data", () => ({
  saveProductionBrief: state.save,
  useInvalidateProductionBrief: () => state.invalidate,
}));

// jsdom has no native dialog; browser coverage checks real focus isolation.
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

it("keeps the opening revision after a background refresh so stale edits cannot overwrite newer work", async () => {
  state.save.mockImplementation(async (_database, input) => {
    if (input.expectedRevision !== 2) throw new Error("Production brief changed. Reopen it.");
    return 3;
  });
  const close = vi.fn();
  const board = { id: "board", name: "Concepts", dueDate: null } as DesignBoard;
  const project = { id: "project", client_id: "client", due_date: null } as TableRow<"projects">;
  const saved = {
    board_id: board.id,
    content: emptyProductionBrief("First revision", "social", null),
    revision: 1,
    updated_at: "2026-09-28",
  };
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const editor = (revision: number) => (
    <QueryClientProvider client={queryClient}>
      <ProductionBriefEditor
        board={board}
        project={project}
        saved={{ ...saved, revision }}
        onClose={close}
      />
    </QueryClientProvider>
  );
  const { rerender } = render(editor(1));
  const user = userEvent.setup();
  await user.clear(screen.getByRole("textbox", { name: "Production title" }));
  await user.type(screen.getByRole("textbox", { name: "Production title" }), "My unsaved work");

  rerender(editor(2));
  await user.click(screen.getByRole("button", { name: "Save draft" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Production brief changed. Reopen it.",
  );
  expect(screen.getByRole("textbox", { name: "Production title" })).toHaveValue("My unsaved work");
  expect(close).not.toHaveBeenCalled();
  expect(state.invalidate).not.toHaveBeenCalled();
});

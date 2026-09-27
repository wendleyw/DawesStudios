import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CanvasVersion } from "./project-data";
import { MiroWorkspaceBar, type MiroWorkspaceBarProps } from "./miro-workspace-bar";

const link = { boardId: "uXjVBoard01=", widgetId: null };
const boardA = { id: "a", projectId: "p", name: "Alpha", designerId: "d1", miro: link };
const boardB = { id: "b", projectId: "p", name: "Beta", designerId: "d2", miro: link };
const round = {
  id: "r1",
  number: 1,
  status: "submitted",
  miro: link,
  boardId: "a",
  deliverableId: null,
} as CanvasVersion;
const shared = {
  id: "s1",
  number: 1,
  status: "pending",
  miro: link,
  boardId: null,
  deliverableId: null,
} as CanvasVersion;
function props(overrides: Partial<MiroWorkspaceBarProps>): MiroWorkspaceBarProps {
  return {
    back: <button>Back</button>,
    title: "Campaign",
    channel: "internal",
    role: "agency",
    viewerId: "agency",
    dueLabel: "Due Sep 30",
    boards: [boardA, boardB],
    board: boardA,
    rounds: [round],
    round: null,
    shared: [shared],
    version: shared,
    onBoard: vi.fn(),
    onRound: vi.fn(),
    onVersion: vi.fn(),
    onAddBoard: vi.fn(),
    onEditBoard: vi.fn(),
    onSendRound: vi.fn(),
    onShareRound: vi.fn(),
    onAddVersion: vi.fn(),
    onEditLink: vi.fn(),
    lead: <span>channel</span>,
    viewControl: null,
    menu: null,
    ...overrides,
  };
}

describe("MiroWorkspaceBar in Working files", () => {
  it("lets the agency pick boards and rounds, add and edit boards, and share a round", async () => {
    const user = userEvent.setup();
    const onRound = vi.fn();
    const onShareRound = vi.fn();
    render(<MiroWorkspaceBar {...props({ round, onRound, onShareRound })} />);
    expect(screen.getByRole("combobox", { name: "Design board" })).toHaveValue("a");
    const rounds = screen.getByRole("group", { name: "Rounds" });
    await user.click(within(rounds).getByRole("button", { name: "Board" }));
    expect(onRound).toHaveBeenCalledWith(null);
    await user.click(screen.getByRole("button", { name: "Share with client" }));
    expect(onShareRound).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add design board" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send to studio" })).toBeNull();
  });
  it("gives the board's designer Send to studio and nothing of the agency's", () => {
    render(<MiroWorkspaceBar {...props({ role: "designer", viewerId: "d1", boards: [boardA] })} />);
    // One board needs no picker.
    expect(screen.queryByRole("combobox", { name: "Design board" })).toBeNull();
    expect(screen.getByRole("button", { name: "Send to studio" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share with client" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add design board" })).toBeNull();
  });
  it("leaves adding the first board to the empty state", () => {
    render(<MiroWorkspaceBar {...props({ boards: [], board: null, rounds: [] })} />);
    expect(screen.queryByRole("button", { name: "Add design board" })).toBeNull();
  });
  it("hides Share with client until a round is shown", () => {
    render(<MiroWorkspaceBar {...props({ round: null })} />);
    expect(screen.queryByRole("button", { name: "Share with client" })).toBeNull();
  });
});

describe("MiroWorkspaceBar in Shared with client", () => {
  it("shows the versions, status and due date, and the agency's add button", () => {
    render(<MiroWorkspaceBar {...props({ channel: "client" })} />);
    expect(screen.getByRole("group", { name: "Client versions" })).toHaveTextContent("V1");
    expect(screen.getByText("In review")).toBeInTheDocument();
    expect(screen.getByText("Due Sep 30")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New client version" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Design board" })).toBeNull();
  });
  it("leaves the first client version to the empty state", () => {
    render(<MiroWorkspaceBar {...props({ channel: "client", shared: [], version: null })} />);
    expect(screen.queryByRole("button", { name: "New client version" })).toBeNull();
  });
  it("gives the client no agency controls", () => {
    render(<MiroWorkspaceBar {...props({ channel: "client", role: "client", viewerId: "c" })} />);
    expect(screen.queryByRole("button", { name: "New client version" })).toBeNull();
  });
});

describe("MiroWorkspaceBar's tint", () => {
  it("marks Working files and the agency's client view apart, and leaves the client's plain", () => {
    const { container, rerender } = render(<MiroWorkspaceBar {...props({})} />);
    const bar = () => container.querySelector(".miro-bar");
    expect(bar()).toHaveClass("is-internal");
    rerender(<MiroWorkspaceBar {...props({ channel: "client" })} />);
    expect(bar()).toHaveClass("is-client");
    rerender(<MiroWorkspaceBar {...props({ channel: "client", role: "client", lead: null })} />);
    expect(bar()).not.toHaveClass("is-internal");
    expect(bar()).not.toHaveClass("is-client");
  });
  it("leaves out the second row for a client with nothing shared", () => {
    const { container } = render(
      <MiroWorkspaceBar
        {...props({ channel: "client", role: "client", lead: null, shared: [], version: null })}
      />,
    );
    expect(container.querySelector(".miro-bar-context")).toBeNull();
  });
});

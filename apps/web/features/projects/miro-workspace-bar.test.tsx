import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CanvasVersion } from "./project-data";
import { MiroWorkspaceBar, type MiroWorkspaceBarProps } from "./miro-workspace-bar";

const link = { boardId: "uXjVBoard01=", widgetId: null };
const boardA = {
  id: "a",
  projectId: "p",
  name: "Alpha",
  designerId: "d1",
  designerName: "Alex Morgan",
  dueDate: null,
  miro: link,
};
const boardB = {
  id: "b",
  projectId: "p",
  name: "Beta",
  designerId: "d2",
  designerName: "Jordan Reed",
  dueDate: null,
  miro: link,
};
const round = {
  id: "r1",
  number: 1,
  status: "submitted",
  miro: link,
  boardId: "a",
} as CanvasVersion;
const shared = {
  id: "s1",
  number: 1,
  status: "pending",
  miro: link,
  boardId: null,
} as CanvasVersion;
function props(overrides: Partial<MiroWorkspaceBarProps>): MiroWorkspaceBarProps {
  return {
    back: <button>Back</button>,
    channel: "internal",
    role: "agency",
    delivered: false,
    viewerId: "agency",
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
    menu: null,
    driveUrl: null,
    ...overrides,
  };
}

describe("MiroWorkspaceBar in Working files", () => {
  it("names the board with its designer for the agency, even when there is only one board", () => {
    const { rerender } = render(<MiroWorkspaceBar {...props({ boards: [boardA] })} />);
    expect(screen.getByText("Alpha · Alex Morgan")).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Design board" })).toBeNull();

    rerender(<MiroWorkspaceBar {...props({ board: boardB })} />);
    const picker = screen.getByRole("combobox", { name: "Design board" });
    expect(picker).toHaveValue("b");
    expect(within(picker).getByRole("option", { name: "Beta · Jordan Reed" })).toBeInTheDocument();
    expect(within(picker).getByRole("option", { name: "Alpha · Alex Morgan" })).toBeInTheDocument();
  });
  it("keeps designer identity out of client views and the designer's own controls", () => {
    const { rerender } = render(
      <MiroWorkspaceBar {...props({ channel: "client", role: "client" })} />,
    );
    expect(screen.queryByText(/Alex Morgan/)).toBeNull();
    rerender(<MiroWorkspaceBar {...props({ channel: "client" })} />);
    expect(screen.queryByText(/Alex Morgan/)).toBeNull();
    rerender(<MiroWorkspaceBar {...props({ role: "designer", boards: [boardA] })} />);
    expect(screen.getByText("Alpha")).toBeVisible();
    expect(screen.queryByText(/Alex Morgan/)).toBeNull();
  });
  it("does not substitute a private identifier when the designer name is unavailable", () => {
    const unnamed = { ...boardA, designerName: null };
    render(<MiroWorkspaceBar {...props({ boards: [unnamed], board: unnamed })} />);
    expect(screen.getByText("Alpha · Designer unavailable")).toBeVisible();
    expect(screen.queryByText("d1")).toBeNull();
  });
  it("lets the agency pick boards and rounds while advances stay in the action bar", async () => {
    const user = userEvent.setup();
    const onRound = vi.fn();
    const onShareRound = vi.fn();
    render(<MiroWorkspaceBar {...props({ round, onRound, onShareRound })} />);
    expect(screen.getByRole("combobox", { name: "Design board" })).toHaveValue("a");
    const rounds = screen.getByRole("group", { name: "Rounds" });
    await user.click(within(rounds).getByRole("button", { name: "Live" }));
    expect(onRound).toHaveBeenCalledWith(null);
    expect(screen.queryByRole("button", { name: "Share with client" })).toBeNull();
    expect(onShareRound).not.toHaveBeenCalled();
    // Board management lives in the More menu, not beside the board.
    expect(screen.queryByRole("button", { name: "Add design board" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("button", { name: "Add design board" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit board" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send to studio" })).toBeNull();
  });
  it("shows the designer's board navigation without an advance control", () => {
    render(<MiroWorkspaceBar {...props({ role: "designer", viewerId: "d1", boards: [boardA] })} />);
    // One board needs no picker.
    expect(screen.queryByRole("combobox", { name: "Design board" })).toBeNull();
    expect(screen.getByText("Alpha")).toBeVisible();
    // The designer's live board is their work; sent rounds are the agency's review history.
    expect(screen.queryByRole("group", { name: "Rounds" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send to studio" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Share with client" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add design board" })).toBeNull();
  });
  it("leaves adding the first board to the empty state", () => {
    render(<MiroWorkspaceBar {...props({ boards: [], board: null, rounds: [] })} />);
    expect(screen.queryByRole("button", { name: "Add design board" })).toBeNull();
  });
  it("offers no new round or share action after delivery", () => {
    const { rerender } = render(
      <MiroWorkspaceBar {...props({ role: "designer", viewerId: "d1", delivered: true })} />,
    );
    expect(screen.queryByRole("button", { name: "Send to studio" })).toBeNull();
    rerender(<MiroWorkspaceBar {...props({ delivered: true, round })} />);
    expect(screen.queryByRole("button", { name: "Share with client" })).toBeNull();
    rerender(<MiroWorkspaceBar {...props({ delivered: true, channel: "client" })} />);
    expect(screen.queryByRole("button", { name: "New client version" })).toBeNull();
    expect(screen.getByRole("group", { name: "Client versions" })).toBeInTheDocument();
  });
  it("links a delivered project to its final files, and nothing before delivery", () => {
    const href = "/clients/c/brand/files?project=p";
    const { rerender } = render(<MiroWorkspaceBar {...props({ deliverableHref: href })} />);
    expect(screen.queryByRole("link", { name: "Deliverable" })).toBeNull();
    rerender(
      <MiroWorkspaceBar
        {...props({ delivered: true, channel: "client", deliverableHref: href })}
      />,
    );
    expect(screen.getByRole("link", { name: "Deliverable" })).toHaveAttribute("href", href);
    rerender(<MiroWorkspaceBar {...props({ delivered: true, deliverableHref: null })} />);
    expect(screen.queryByRole("link", { name: "Deliverable" })).toBeNull();
  });
  it("shows the agency the board's internal due date on the board's row", () => {
    const { container } = render(
      <MiroWorkspaceBar {...props({ boardDueLabel: "Board due Oct 3" })} />,
    );
    expect(container.querySelector(".miro-bar-context")).toHaveTextContent("Board due Oct 3");
  });
  it("hides Share with client until a round is shown", () => {
    render(<MiroWorkspaceBar {...props({ round: null })} />);
    expect(screen.queryByRole("button", { name: "Share with client" })).toBeNull();
  });
  it("keeps an already shared round readable without offering to share it again", () => {
    render(<MiroWorkspaceBar {...props({ round: { ...round, status: "reviewed" } })} />);
    // The round's state is read once, in the action bar below the board.
    expect(screen.queryByText("Shared")).toBeNull();
    expect(screen.queryByRole("button", { name: "Share with client" })).toBeNull();
    expect(screen.getByRole("button", { name: "Round 1" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("MiroWorkspaceBar in Shared with client", () => {
  it("shows the versions without repeating their status or a second publication control", () => {
    render(<MiroWorkspaceBar {...props({ channel: "client" })} />);
    expect(screen.getByRole("group", { name: "Client versions" })).toHaveTextContent("V1");
    expect(screen.queryByText("In review")).toBeNull();
    expect(screen.queryByRole("button", { name: "New client version" })).toBeNull();
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

describe("MiroWorkspaceBar's Drive link in the More menu", () => {
  it("shows the internal folder link on the internal channel, opening in a new tab", async () => {
    const user = userEvent.setup();
    render(
      <MiroWorkspaceBar
        {...props({ channel: "internal", driveUrl: "https://drive.google.com/drive/folders/1" })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    const link = screen.getByRole("link", { name: "Open internal Drive folder" });
    expect(link).toHaveAttribute("href", "https://drive.google.com/drive/folders/1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByRole("link", { name: "Open client Drive folder" })).toBeNull();
  });
  it("shows the client folder link on the client channel, never the internal one", async () => {
    const user = userEvent.setup();
    render(
      <MiroWorkspaceBar
        {...props({
          channel: "client",
          role: "client",
          viewerId: "c",
          driveUrl: "https://drive.google.com/drive/folders/2",
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    const link = screen.getByRole("link", { name: "Open client Drive folder" });
    expect(link).toHaveAttribute("href", "https://drive.google.com/drive/folders/2");
    expect(screen.queryByRole("link", { name: "Open internal Drive folder" })).toBeNull();
  });
  it("hides the icon link when the channel on screen has no Drive link", async () => {
    const user = userEvent.setup();
    render(<MiroWorkspaceBar {...props({ driveUrl: null })} />);
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.queryByRole("link", { name: "Open internal Drive folder" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open client Drive folder" })).toBeNull();
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
  it("keeps navigation available for a client with nothing shared", () => {
    render(
      <MiroWorkspaceBar
        {...props({ channel: "client", role: "client", lead: null, shared: [], version: null })}
      />,
    );
    expect(screen.getByRole("button", { name: "Back" })).toBeVisible();
    expect(screen.getByRole("button", { name: "More" })).toBeVisible();
    expect(screen.queryByRole("group", { name: "Client versions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New client version" })).not.toBeInTheDocument();
  });
});

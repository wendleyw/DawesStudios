import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MiroBarShell, MiroEmbed, MiroReviewBar } from "./miro-view";

const link = { boardId: "uXjVKabc123=", widgetId: "345" };

describe("MiroEmbed", () => {
  it("embeds the link with autoplay", () => {
    render(<MiroEmbed title="Miro board · V3" link={link} frameKey="v3" />);
    expect(screen.getByTitle("Miro board · V3")).toHaveAttribute(
      "src",
      "https://miro.com/app/live-embed/uXjVKabc123%3D/?autoplay=true&moveToWidget=345",
    );
  });

  it("renders the asset strip when given", () => {
    render(<MiroEmbed title="Miro" link={link} frameKey="v3" strip={<p>strip</p>} />);
    expect(screen.getByText("strip")).toBeInTheDocument();
  });
});

describe("MiroBarShell", () => {
  function renderBar() {
    render(
      <MiroBarShell
        back={<button>Back</button>}
        title="Campaign"
        due="Due Nov 29"
        tone="client"
        lead={<span>channel tabs</span>}
        link={link}
        menu={() => <span>menu content</span>}
      />,
    );
  }

  it("names the project and offers the shown link in Miro", () => {
    renderBar();
    expect(screen.getByRole("heading", { name: "Campaign" })).toBeInTheDocument();
    expect(screen.getByText("Due Nov 29")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open in Miro/ })).toHaveAttribute(
      "href",
      "https://miro.com/app/board/uXjVKabc123%3D/?moveToWidget=345",
    );
    expect(screen.getByText("channel tabs")).toBeInTheDocument();
  });

  it("keeps secondary items behind More", () => {
    renderBar();
    const more = screen.getByRole("button", { name: "More" });
    expect(screen.queryByText("menu content")).not.toBeInTheDocument();
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("menu content")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByText("menu content"), { key: "Escape" });
    expect(screen.queryByText("menu content")).not.toBeInTheDocument();
  });

  it("returns focus to More when Escape closes the menu", () => {
    renderBar();
    const more = screen.getByRole("button", { name: "More" });
    fireEvent.click(more);
    fireEvent.keyDown(screen.getByText("menu content"), { key: "Escape" });
    expect(more).toHaveFocus();
    expect(more).toHaveAttribute("aria-expanded", "false");
  });
});

describe("MiroReviewBar", () => {
  it("asks for a decision on the shown version", () => {
    const onDecide = vi.fn();
    render(<MiroReviewBar label="V3" onDecide={onDecide} />);
    const bar = screen.getByRole("group", { name: "Review this version" });
    expect(bar).toHaveTextContent("V3");
    fireEvent.click(within(bar).getByRole("button", { name: "Request changes" }));
    expect(onDecide).toHaveBeenLastCalledWith("changes_requested");
    fireEvent.click(within(bar).getByRole("button", { name: "Approve" }));
    expect(onDecide).toHaveBeenLastCalledWith("approved");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WelcomeHeader, welcomeTitle } from "./welcome-header";

describe("welcomeTitle", () => {
  it("greets the viewer by the first word of their display name", () => {
    expect(welcomeTitle("Beth Morgan")).toBe("Welcome back, Beth");
    expect(welcomeTitle("  Ana  ")).toBe("Welcome back, Ana");
  });

  it("drops the name when there is none", () => {
    expect(welcomeTitle("")).toBe("Welcome back");
    expect(welcomeTitle(null)).toBe("Welcome back");
  });
});

describe("WelcomeHeader", () => {
  it("shows the role name above the greeting, the subtitle and the actions", () => {
    render(
      <WelcomeHeader
        eyebrow="Overview"
        title="Welcome back, Beth"
        subtitle="Friday, September 25"
        actions={<button type="button">New briefing</button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Welcome back, Beth");
    expect(screen.getByText("Overview")).toHaveClass("eyebrow");
    expect(screen.getByText("Friday, September 25")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New briefing" })).toBeInTheDocument();
  });

  it("uses the client header card on client routes", () => {
    const { container } = render(<WelcomeHeader card eyebrow="Overview" title="Welcome back" />);
    expect(container.querySelector("header")).toHaveClass("page-heading", "client-page-heading");
  });
});

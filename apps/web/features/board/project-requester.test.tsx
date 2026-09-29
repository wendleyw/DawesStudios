import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CardRequester, ProjectRequester, initialsOf } from "./project-requester";

describe("initialsOf", () => {
  it("takes the first letter of up to two words", () => {
    expect(initialsOf("Maya Chen")).toBe("MC");
    expect(initialsOf("SABRE Team (left)")).toBe("ST");
    expect(initialsOf("ana")).toBe("A");
  });
});

describe("ProjectRequester", () => {
  it("shows the name beside the avatar", () => {
    render(<ProjectRequester name="Maya Chen" />);
    expect(screen.getByText("Maya Chen")).toBeInTheDocument();
  });

  it("names the requester through the avatar when compact", () => {
    render(<ProjectRequester name="Maya Chen" compact />);
    expect(screen.getByRole("img", { name: "Requested by Maya Chen" })).toHaveTextContent("MC");
    expect(screen.queryByText("Maya Chen")).not.toBeInTheDocument();
  });
});

describe("CardRequester", () => {
  it("renders nothing without a name", () => {
    const { container } = render(<CardRequester name={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

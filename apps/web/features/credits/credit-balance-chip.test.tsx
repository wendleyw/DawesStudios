// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/supabase";
import { CreditBalanceChip } from "./credit-balance-chip";

const fixture = vi.hoisted(() => ({
  balance: 120,
  isPending: false,
  isError: false,
}));
vi.mock("./credit-data", () => ({
  useCreditAccount: () => ({
    isPending: fixture.isPending,
    isError: fixture.isError,
    data: fixture.isPending || fixture.isError ? undefined : { balance: fixture.balance },
  }),
}));

function viewer(role: Profile["role"]): Profile {
  return { id: "viewer-1", display_name: "Ada Lovelace", role, avatar_url: null };
}

describe("CreditBalanceChip", () => {
  it("renders the balance as a link to the client's credits page for a client viewer", () => {
    fixture.balance = 120;
    render(<CreditBalanceChip clientId="client-1" viewer={viewer("client")} />);
    const link = screen.getByRole("link", { name: "Credit balance: 120 credits. Open credits" });
    expect(link).toHaveAttribute("href", "/clients/client-1/credits");
    expect(link).toHaveTextContent("120");
    expect(link).not.toHaveClass("credit-balance-chip-attention");
  });

  it("renders for an agency viewer too", () => {
    fixture.balance = 1;
    render(<CreditBalanceChip clientId="client-1" viewer={viewer("agency")} />);
    expect(
      screen.getByRole("link", { name: "Credit balance: 1 credit. Open credits" }),
    ).toBeInTheDocument();
  });

  it("renders nothing for a designer viewer", () => {
    fixture.balance = 120;
    render(<CreditBalanceChip clientId="client-1" viewer={viewer("designer")} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders nothing when there is no signed-in viewer", () => {
    render(<CreditBalanceChip clientId="client-1" viewer={null} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders nothing while loading and nothing on error", () => {
    fixture.isPending = true;
    const { rerender } = render(
      <CreditBalanceChip clientId="client-1" viewer={viewer("client")} />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    fixture.isPending = false;
    fixture.isError = true;
    rerender(<CreditBalanceChip clientId="client-1" viewer={viewer("client")} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    fixture.isError = false;
  });

  it("marks a zero balance for attention", () => {
    fixture.balance = 0;
    render(<CreditBalanceChip clientId="client-1" viewer={viewer("client")} />);
    expect(screen.getByRole("link")).toHaveClass("credit-balance-chip-attention");
  });
});

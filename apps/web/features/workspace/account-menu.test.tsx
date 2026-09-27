// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/supabase";
import { AccountMenu } from "./account-menu";

type Meter = {
  balance: number;
  ratio: number | null;
  attention: boolean;
  expiring: { amount: number; on: string } | null;
};
const meter = vi.hoisted(() => ({
  value: { balance: 532, ratio: 0.5, attention: false, expiring: null } as Meter | null,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/clients/client-1/board",
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: { auth: { signOut: vi.fn() } } }),
}));
vi.mock("@/features/credits/credit-actions", () => ({ CreditActionDialog: () => null }));
vi.mock("@/features/workspace/workspace-data", () => ({
  useDateFormat: () => ({ formatDateLong: () => "Sep 30, 2026" }),
}));
vi.mock("@/features/credits/credit-meter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/credits/credit-meter")>()),
  useCreditMeter: (_clientId: string, viewer: Profile | null) =>
    viewer?.role === "designer" ? null : meter.value,
}));

// jsdom leaves a closed popover out of the accessibility tree, so the menu is found by its class.
const menu = () => document.querySelector(".account-menu-popover")!;

function viewer(role: Profile["role"]): Profile {
  return { id: "viewer-1", display_name: "Ada Lovelace", role, avatar_url: null };
}

describe("AccountMenu", () => {
  it("rings a client's avatar and lists credits, settings and sign out", () => {
    render(<AccountMenu clientId="client-1" viewer={viewer("client")} />);
    expect(screen.getByRole("button", { name: "Account menu: Ada Lovelace" })).toHaveAttribute(
      "aria-haspopup",
      "dialog",
    );
    expect(document.querySelectorAll(".board-profile .credit-ring svg")).toHaveLength(1);
    expect(menu()).toHaveAttribute("role", "dialog");
    expect(menu()).toHaveTextContent("Client");
    expect(menu()).toHaveTextContent("532 left");
    expect(screen.getByRole("button", { name: "Request credits", hidden: true })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Account settings", hidden: true })).toHaveAttribute(
      "href",
      "/settings/account",
    );
    expect(screen.getByRole("button", { name: "Sign out", hidden: true })).toBeTruthy();
  });

  it("shows a designer neither the ring nor the Credits block", () => {
    render(<AccountMenu clientId="client-1" viewer={viewer("designer")} />);
    expect(document.querySelector(".credit-ring svg")).toBeNull();
    expect(screen.queryByRole("region", { name: "Credits", hidden: true })).toBeNull();
    expect(menu()).toHaveTextContent("Designer");
  });

  it("drops the ring but keeps the amount when there is no top-up to measure against", () => {
    meter.value = { balance: 40, ratio: null, attention: false, expiring: null };
    render(<AccountMenu clientId="client-1" viewer={viewer("agency")} />);
    expect(document.querySelector(".credit-ring svg")).toBeNull();
    expect(menu()).toHaveTextContent("40 left");
  });

  it("flags credits expiring at the end of the month on the trigger, the ring and the menu", () => {
    meter.value = {
      balance: 12,
      ratio: 0.1,
      attention: false,
      expiring: { amount: 12, on: "2026-09-30" },
    };
    render(<AccountMenu clientId="client-1" viewer={viewer("client")} />);
    expect(
      screen.getByRole("button", {
        name: "Account menu: Ada Lovelace. 12 credits expiring this month",
      }),
    ).toBeTruthy();
    expect(document.querySelector(".board-profile .credit-ring-expiring")).not.toBeNull();
    expect(menu()).toHaveTextContent("12 credits expire on Sep 30, 2026");
  });
});

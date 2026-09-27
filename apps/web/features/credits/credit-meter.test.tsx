// @vitest-environment jsdom
import { render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/supabase";
import { CreditMeterPanel, useCreditMeter, type CreditMeter } from "./credit-meter";

const fixture = vi.hoisted(() => ({
  balance: 120,
  topUp: 200 as number | null,
  isPending: false,
  isError: false,
}));
vi.mock("./credit-data", () => ({
  useCreditAccount: () => ({
    isPending: fixture.isPending,
    isError: fixture.isError,
    data: fixture.isPending || fixture.isError ? undefined : { balance: fixture.balance },
  }),
  useLatestTopUp: () => ({ data: fixture.topUp }),
}));

function viewer(role: Profile["role"]): Profile {
  return { id: "viewer-1", display_name: "Ada Lovelace", role, avatar_url: null };
}

const meterFor = (profile: Profile | null) =>
  renderHook(() => useCreditMeter("client-1", profile)).result.current;

describe("useCreditMeter", () => {
  it("measures the balance against the balance after the latest top-up", () => {
    fixture.balance = 50;
    fixture.topUp = 200;
    expect(meterFor(viewer("client"))).toEqual({ balance: 50, ratio: 0.25, attention: false });
  });

  it("is null for a designer, a missing viewer, while loading and on error", () => {
    expect(meterFor(viewer("designer"))).toBeNull();
    expect(meterFor(null)).toBeNull();
    fixture.isPending = true;
    expect(meterFor(viewer("client"))).toBeNull();
    fixture.isPending = false;
    fixture.isError = true;
    expect(meterFor(viewer("agency"))).toBeNull();
    fixture.isError = false;
  });

  it("keeps the amount without a ratio when there was never a top-up", () => {
    fixture.balance = 0;
    fixture.topUp = null;
    expect(meterFor(viewer("client"))).toEqual({ balance: 0, ratio: null, attention: true });
  });
});

describe("CreditMeterPanel", () => {
  const meter: CreditMeter = { balance: 532, ratio: 0.5, attention: false };

  it("links the amount left to the credit history and offers a client request", () => {
    const onAction = vi.fn();
    render(
      <CreditMeterPanel
        clientId="client-1"
        role="client"
        meter={meter}
        onNavigate={vi.fn()}
        onAction={onAction}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Credits: 532 left. Open credit history" }),
    ).toHaveAttribute("href", "/clients/client-1/credits");
    expect(document.querySelectorAll(".credit-meter-dots .is-filled")).toHaveLength(12);
    screen.getByRole("button", { name: "Request credits" }).click();
    expect(onAction).toHaveBeenCalledWith("request");
  });

  it("offers the agency an adjustment instead", () => {
    const onAction = vi.fn();
    render(
      <CreditMeterPanel
        clientId="client-1"
        role="agency"
        meter={meter}
        onNavigate={vi.fn()}
        onAction={onAction}
      />,
    );
    screen.getByRole("button", { name: "Adjust credits" }).click();
    expect(onAction).toHaveBeenCalledWith("adjust");
  });

  it("omits the dot bar without a ratio", () => {
    render(
      <CreditMeterPanel
        clientId="client-1"
        role="client"
        meter={{ balance: 10, ratio: null, attention: false }}
        onNavigate={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    expect(document.querySelector(".credit-meter-dots")).toBeNull();
  });
});

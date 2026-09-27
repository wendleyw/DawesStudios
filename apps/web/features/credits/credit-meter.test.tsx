// @vitest-environment jsdom
import { render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/supabase";
import { CreditMeterPanel, useCreditMeter, type CreditMeter } from "./credit-meter";

const fixture = vi.hoisted(() => ({
  available: 120,
  received: 200,
  expiring: 120,
  month: "",
  isPending: false,
  isError: false,
  isPlaceholderData: false,
}));
vi.mock("./credit-data", () => ({
  useCreditMonthSummary: (_clientId: string, month: string) => {
    fixture.month = month;
    return {
      isPending: fixture.isPending,
      isError: fixture.isError,
      isPlaceholderData: fixture.isPlaceholderData,
      data:
        fixture.isPending || fixture.isError
          ? undefined
          : {
              month,
              status: "open",
              available: fixture.available,
              allowance: fixture.received,
              extras: 0,
              used: 0,
              transferred: 0,
              expiring: fixture.expiring,
              expired: 0,
              expires_on: "2026-09-30",
            },
    };
  },
}));
vi.mock("@/features/workspace/workspace-data", () => ({
  useDateFormat: () => ({ formatDateLong: (date: string) => `long:${date}` }),
}));

function viewer(role: Profile["role"]): Profile {
  return { id: "viewer-1", display_name: "Ada Lovelace", role, avatar_url: null };
}

const midMonth = new Date("2026-09-15T12:00:00Z");
const meterFor = (profile: Profile | null, now = midMonth) =>
  renderHook(() => useCreditMeter("client-1", profile, now)).result.current;

describe("useCreditMeter", () => {
  it("reads the current UTC month and measures it against what the month received", () => {
    fixture.available = 50;
    fixture.expiring = 50;
    fixture.received = 200;
    expect(meterFor(viewer("client"))).toEqual({
      balance: 50,
      ratio: 0.25,
      attention: false,
      expiring: null,
    });
    expect(fixture.month).toBe("2026-09-01");
  });

  it("carries the expiring amount in the month's last 7 days", () => {
    expect(meterFor(viewer("client"), new Date("2026-09-25T09:00:00Z"))?.expiring).toEqual({
      amount: 50,
      on: "2026-09-30",
    });
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

  it("is null while the summary still shows another month's placeholder figures", () => {
    // The account menu stays mounted across a client switch; without this check it would show
    // client A's credits for client B until the new month's figures actually arrive.
    fixture.isPlaceholderData = true;
    expect(meterFor(viewer("client"))).toBeNull();
    fixture.isPlaceholderData = false;
  });

  it("keeps the amount without a ratio when the month received nothing", () => {
    fixture.available = 0;
    fixture.expiring = 0;
    fixture.received = 0;
    expect(meterFor(viewer("client"))).toEqual({
      balance: 0,
      ratio: null,
      attention: true,
      expiring: null,
    });
  });
});

describe("CreditMeterPanel", () => {
  const meter: CreditMeter = { balance: 532, ratio: 0.5, attention: false, expiring: null };

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
      screen.getByRole("link", { name: "Credits: 532 left this month. Open credit history" }),
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
        meter={{ balance: 10, ratio: null, attention: false, expiring: null }}
        onNavigate={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    expect(document.querySelector(".credit-meter-dots")).toBeNull();
  });

  it("names what expires and when, only when the meter carries it", () => {
    const { rerender } = render(
      <CreditMeterPanel
        clientId="client-1"
        role="client"
        meter={meter}
        onNavigate={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    expect(document.querySelector(".credit-meter-expiring")).toBeNull();
    rerender(
      <CreditMeterPanel
        clientId="client-1"
        role="client"
        meter={{ ...meter, expiring: { amount: 1, on: "2026-09-30" } }}
        onNavigate={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByText("1 credit expires on long:2026-09-30")).toBeTruthy();
  });
});

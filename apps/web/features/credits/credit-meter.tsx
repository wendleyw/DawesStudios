"use client";

import Link from "next/link";
import { ChevronRight, Coins } from "lucide-react";
import type { ReactNode } from "react";
import type { Profile } from "@/lib/supabase";
import { useCreditAccount, useLatestTopUp } from "./credit-data";
import { creditRemainingRatio, formatCredits } from "./credit-model";
import "./credit-meter.css";

export type CreditMeter = {
  balance: number;
  /** Share of the balance after the latest top-up still left, or null without one. */
  ratio: number | null;
  /** A zero or negative balance. */
  attention: boolean;
};

const DOT_COUNT = 24;

/**
 * The viewer's credit state for the account menu in `features/workspace/account-menu.tsx`. Null for
 * designers, a missing viewer, and while the account is loading or failed, so the menu never shows
 * a stale or placeholder amount. The ratio waits on its own read and stays null until it resolves.
 */
export function useCreditMeter(clientId: string, viewer: Profile | null): CreditMeter | null {
  const account = useCreditAccount(clientId);
  const topUp = useLatestTopUp(clientId);
  if (!viewer || viewer.role === "designer") return null;
  if (account.isPending || account.isError || !account.data) return null;
  const balance = account.data.balance;
  return {
    balance,
    ratio: creditRemainingRatio(balance, topUp.data ?? null),
    attention: balance <= 0,
  };
}

/** A ring around the avatar showing how much of the latest top-up is left. */
export function CreditRing({
  meter,
  size,
  children,
}: {
  meter: CreditMeter | null;
  size: number;
  children: ReactNode;
}) {
  const ratio = meter?.ratio;
  return (
    <span
      className={`credit-ring${meter?.attention ? " credit-ring-attention" : ""}`}
      style={{ width: size, height: size }}
    >
      {ratio != null && (
        <svg viewBox="0 0 36 36" aria-hidden="true">
          <circle className="credit-ring-track" cx="18" cy="18" r="16.5" pathLength={100} />
          <circle
            className="credit-ring-fill"
            cx="18"
            cy="18"
            r="16.5"
            pathLength={100}
            strokeDasharray={`${ratio * 100} 100`}
          />
        </svg>
      )}
      {children}
    </span>
  );
}

/**
 * The Credits block inside the account menu: what is left, a dot bar for the same share as the ring,
 * a link to the history and one role-specific action the menu opens as a dialog.
 */
export function CreditMeterPanel({
  clientId,
  role,
  meter,
  onNavigate,
  onAction,
}: {
  clientId: string;
  role: Profile["role"];
  meter: CreditMeter;
  onNavigate: () => void;
  onAction: (mode: "request" | "adjust") => void;
}) {
  const { amount } = formatCredits(meter.balance);
  const filled =
    meter.ratio == null
      ? 0
      : Math.max(meter.ratio > 0 ? 1 : 0, Math.round(meter.ratio * DOT_COUNT));
  const mode = role === "agency" ? "adjust" : "request";
  return (
    <section
      className={`credit-meter${meter.attention ? " credit-meter-attention" : ""}`}
      aria-label="Credits"
    >
      <Link
        className="credit-meter-summary"
        href={`/clients/${clientId}/credits`}
        onClick={onNavigate}
        aria-label={`Credits: ${amount} left. Open credit history`}
      >
        <span>Credits</span>
        <span className="credit-meter-left">
          {amount} left
          <ChevronRight size={15} aria-hidden="true" />
        </span>
      </Link>
      {meter.ratio != null && (
        <span className="credit-meter-dots" aria-hidden="true">
          {Array.from({ length: DOT_COUNT }, (_, index) => (
            <span key={index} className={index < filled ? "is-filled" : undefined} />
          ))}
        </span>
      )}
      <button type="button" className="credit-meter-action" onClick={() => onAction(mode)}>
        <Coins size={16} aria-hidden="true" />
        <span>{mode === "adjust" ? "Adjust credits" : "Request credits"}</span>
      </button>
    </section>
  );
}

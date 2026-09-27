"use client";

import Link from "next/link";
import { ChevronRight, Coins } from "lucide-react";
import type { ReactNode } from "react";
import type { Profile } from "@/lib/supabase";
import { useDateFormat } from "@/features/workspace/workspace-data";
import { useCreditMonthSummary } from "./credit-data";
import {
  creditMonthOf,
  creditRemainingRatio,
  expiringNotice,
  formatCredits,
  monthCreditsReceived,
} from "./credit-model";
import "./credit-meter.css";

export type CreditMeter = {
  /** The current month's available credits. */
  balance: number;
  /** Share of what the current month received that is still left, or null when it received none. */
  ratio: number | null;
  /** A zero or negative balance. */
  attention: boolean;
  /** What expires when the current month ends, only during its last 7 days. */
  expiring: { amount: number; on: string } | null;
};

const DOT_COUNT = 24;

/**
 * The viewer's credit state for the account menu in `features/workspace/account-menu.tsx`, from the
 * current UTC month's summary. Null for designers, a missing viewer, and while the month is loading
 * or failed, so the menu never shows a stale or placeholder amount.
 */
export function useCreditMeter(
  clientId: string,
  viewer: Profile | null,
  now: Date = new Date(),
): CreditMeter | null {
  const summary = useCreditMonthSummary(clientId, creditMonthOf(now));
  if (!viewer || viewer.role === "designer") return null;
  if (summary.isPending || summary.isError || !summary.data) return null;
  const balance = summary.data.available;
  return {
    balance,
    ratio: creditRemainingRatio(balance, monthCreditsReceived(summary.data)),
    attention: balance <= 0,
    expiring: expiringNotice(summary.data, now),
  };
}

/**
 * A ring around the avatar showing how much of the current month's credits is left; its track turns
 * to the attention tone when the balance is spent or credits expire within the month's last 7 days.
 */
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
      className={`credit-ring${meter?.attention ? " credit-ring-attention" : ""}${meter?.expiring ? " credit-ring-expiring" : ""}`}
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
 * The Credits block inside the account menu: what is left this month, a dot bar for the same share
 * as the ring, the expiring amount in the month's last 7 days, a link to the history and one
 * role-specific action the menu opens as a dialog.
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
  const { formatDateLong } = useDateFormat();
  const { amount } = formatCredits(meter.balance);
  const expiring = meter.expiring && formatCredits(meter.expiring.amount);
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
        aria-label={`Credits: ${amount} left this month. Open credit history`}
      >
        <span>Credits this month</span>
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
      {expiring && meter.expiring && (
        <p className="credit-meter-expiring">
          {expiring.amount} {expiring.word} {meter.expiring.amount === 1 ? "expires" : "expire"} on{" "}
          {formatDateLong(meter.expiring.on)}
        </p>
      )}
      <button type="button" className="credit-meter-action" onClick={() => onAction(mode)}>
        <Coins size={16} aria-hidden="true" />
        <span>{mode === "adjust" ? "Adjust credits" : "Request credits"}</span>
      </button>
    </section>
  );
}

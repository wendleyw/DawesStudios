"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import type { Profile } from "@/lib/supabase";
import { useCreditAccount } from "./credit-data";
import { formatCredits } from "./credit-model";
import "./credit-chip.css";
import "./credit-balance-chip.css";

/**
 * Compact balance indicator in `canvas-header.tsx`'s account card, directly left of the
 * notification bell. Reads `useCreditAccount`, which is already gated to non-designer roles by
 * RLS and by that hook's own `enabled` check, but designers and a missing viewer render nothing
 * here too so the chip never flashes before that gate resolves. It also stays hidden while the
 * account is loading or failed to load, rather than showing a stale or placeholder amount.
 */
export function CreditBalanceChip({
  clientId,
  viewer,
}: {
  clientId: string;
  viewer: Profile | null;
}) {
  const account = useCreditAccount(clientId);
  if (!viewer || viewer.role === "designer") return null;
  if (account.isPending || account.isError || !account.data) return null;

  const balance = account.data.balance;
  const { amount, word } = formatCredits(balance);
  const label = `${amount} ${word}`;
  const needsAttention = balance <= 0;

  return (
    <Link
      href={`/clients/${clientId}/credits`}
      className={`credit-chip credit-balance-chip${needsAttention ? " credit-balance-chip-attention" : ""}`}
      aria-label={`Credit balance: ${label}. Open credits`}
      title={`Credit balance: ${label}`}
    >
      <Coins size={15} aria-hidden="true" />
      <span className="credit-chip-amount">{amount}</span>
      <span className="credit-balance-chip-word">{word}</span>
    </Link>
  );
}

"use client";

import { Coins } from "lucide-react";
import type { Profile } from "@/lib/supabase";
import { useProjectCreditUse } from "./credit-data";
import { formatCredits } from "./credit-model";
import "./credit-chip.css";
import "./project-credits-chip.css";

/**
 * The credits a project used, in the right corner of its title card, so a client knows what the
 * project is worth. Information only, not a link. Designers never see billing: this renders nothing
 * for them, and `useProjectCreditUse` does not query for them either. It also stays hidden while
 * loading, after an error, and for a project without a debit.
 */
export function ProjectCreditsChip({
  projectId,
  viewer,
}: {
  projectId: string;
  viewer: Profile | null;
}) {
  const credits = useProjectCreditUse(projectId);
  if (!viewer || viewer.role === "designer") return null;
  if (credits.isPending || credits.isError || credits.data == null) return null;
  const { amount, word } = formatCredits(credits.data);
  return (
    <span className="credit-chip project-credits-chip" title="Credits used by this project">
      <Coins size={15} aria-hidden="true" />
      <span className="credit-chip-amount">{amount}</span>{" "}
      <span className="credit-chip-word">{word}</span>
      <span className="visually-hidden"> used by this project</span>
    </span>
  );
}

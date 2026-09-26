"use client";

import Link from "next/link";
import { useAuth } from "@/features/auth/auth-provider";
import { useClientPeople } from "@/features/team/team-data";
import { useClients } from "@/features/workspace/workspace-data";
import { useBriefingBrand, useBriefings, useCampaigns, useServicePresets } from "./briefing-data";
import { brandDefaults, catalogWithPresets } from "./briefing-model";
import { BriefingEditor, type BriefingDialogOptions } from "./briefing-editor-form";
import "./briefings.css";
import { PageStatus } from "@/features/shared/page-status";
import { StudioManagedNotice } from "@/features/shared/studio-managed-notice";

/**
 * Resolves every prerequisite the editor needs — the client, an existing draft (when editing), the
 * campaign list, brand defaults, the service catalog with any preset overrides and, for the studio,
 * the client's people for Requested by — and gates on a designer session or an already-submitted
 * briefing before handing off to `BriefingEditor` (in `briefing-editor-form.tsx`), which owns the
 * actual multi-step form.
 */
export function BriefingEditorPage({
  clientId,
  briefingId,
  dialog,
}: {
  clientId: string;
  briefingId?: string;
  dialog?: BriefingDialogOptions;
}) {
  const { profile } = useAuth();
  const clients = useClients();
  const briefings = useBriefings(clientId);
  const campaigns = useCampaigns(clientId);
  const brand = useBriefingBrand(clientId);
  const presets = useServicePresets();
  const people = useClientPeople(clientId);
  // Only the studio names a requester; a client person is always the requester of what they file.
  const studio = profile?.role === "agency";
  if (profile?.role === "designer") return <StudioManagedNotice area="Briefings" />;
  if (
    !profile ||
    clients.isPending ||
    campaigns.isPending ||
    brand.isPending ||
    presets.isPending ||
    (briefingId && briefings.isPending) ||
    (studio && people.isPending)
  )
    return <PageStatus>Loading your briefing…</PageStatus>;
  const client = clients.data?.find((item) => item.id === clientId);
  const briefing = briefings.data?.find((item) => item.id === briefingId);
  if (
    !client ||
    campaigns.error ||
    brand.error ||
    presets.error ||
    briefings.error ||
    (studio && people.error) ||
    (briefingId && !briefing)
  )
    return (
      <div className="page-content">
        <h1>Briefing unavailable.</h1>
        <p>We could not load this briefing or its brand context.</p>
        <button
          className="button"
          onClick={() => {
            void clients.refetch();
            void campaigns.refetch();
            void brand.refetch();
            void presets.refetch();
            void briefings.refetch();
            void people.refetch();
          }}
        >
          Try again
        </button>
        <Link className="button quiet" href={`/clients/${clientId}/briefings`}>
          Back to briefings
        </Link>
      </div>
    );
  if (briefing && briefing.status !== "draft")
    return (
      <div className="page-content">
        <h1>This briefing has been submitted.</h1>
        <p>Your submitted scope is saved for review.</p>
        <Link href={`/clients/${clientId}/briefings/${briefing.id}`} className="button">
          View briefing
        </Link>
      </div>
    );
  return (
    <BriefingEditor
      key={briefingId ?? clientId}
      clientId={clientId}
      clientName={client.name}
      briefing={briefing}
      campaigns={campaigns.data ?? []}
      defaults={brandDefaults(brand.data ?? [])}
      serviceCatalog={catalogWithPresets(presets.data ?? [])}
      dialog={dialog}
      people={studio ? people.data?.team : undefined}
    />
  );
}

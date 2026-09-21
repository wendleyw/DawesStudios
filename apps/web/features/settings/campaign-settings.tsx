"use client";

import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useCampaigns } from "@/features/briefings/briefing-data";
import type { Campaign } from "@/features/briefings/briefing-model";
import { Modal } from "@/features/shared/modal";
import { saveCampaign, useInvalidateCampaigns } from "./settings-data";
import { FormError } from "@/features/shared/form-error";

export function CampaignSettings({
  clientId,
  clientName,
  onClose,
}: {
  clientId: string;
  clientName: string;
  onClose: () => void;
}) {
  const campaigns = useCampaigns(clientId);
  const [editing, setEditing] = useState<Campaign | "new" | null>(null);
  return (
    <Modal
      open
      onClose={onClose}
      title={`${clientName} campaigns`}
      description="Group related projects around a shared goal."
      size="lg"
    >
      {editing ? (
        <CampaignForm
          key={editing === "new" ? "new" : editing.id}
          clientId={clientId}
          campaign={editing === "new" ? undefined : editing}
          onSaved={() => setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <>
          <button className="button" onClick={() => setEditing("new")}>
            <Plus size={15} />
            New campaign
          </button>
          {campaigns.isPending ? (
            <p role="status">Loading campaigns…</p>
          ) : campaigns.error ? (
            <FormError>
              Campaigns could not be loaded.{" "}
              <button className="button quiet" onClick={() => void campaigns.refetch()}>
                Try again
              </button>
            </FormError>
          ) : campaigns.data?.length ? (
            <div className="settings-list">
              {campaigns.data.map((campaign) => (
                <div key={campaign.id} className="settings-list-row">
                  <div>
                    <strong>{campaign.title}</strong>
                    <p>{campaign.description || "No campaign goal added."}</p>
                    <p>
                      {campaign.start_date || "No start date"} ·{" "}
                      {campaign.end_date || "No end date"}
                    </p>
                  </div>
                  <button className="button quiet" onClick={() => setEditing(campaign)}>
                    Edit
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="settings-note">No campaigns yet. Add a home for the next project.</p>
          )}
        </>
      )}
    </Modal>
  );
}

function CampaignForm({
  clientId,
  campaign,
  onSaved,
  onCancel,
}: {
  clientId: string;
  campaign?: Campaign;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { database } = useAuth();
  const invalidateCampaigns = useInvalidateCampaigns();
  const [title, setTitle] = useState(campaign?.title ?? "");
  const [description, setDescription] = useState(campaign?.description ?? "");
  const [start, setStart] = useState(campaign?.start_date ?? "");
  const [end, setEnd] = useState(campaign?.end_date ?? "");
  // As in `ClientEditor`: the revision the form opened on, never refreshed while it stays open.
  const [revision] = useState(campaign?.updated_at);
  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Give the campaign a name.");
      if (start && end && end < start)
        throw new Error("The end date cannot be before the start date.");
      const fields = {
        clientId,
        title: title.trim(),
        description: description.trim(),
        startDate: start || null,
        endDate: end || null,
      };
      if (campaign)
        await saveCampaign(database, { mode: "update", id: campaign.id, revision, ...fields });
      else await saveCampaign(database, { mode: "create", ...fields });
    },
    onSuccess: async () => {
      await invalidateCampaigns();
      onSaved();
    },
  });
  return (
    <form
      className="settings-form"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <label>
        Campaign name
        <input
          maxLength={200}
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label>
        Goal
        <textarea
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <div className="settings-form-columns">
        <label>
          Start date
          <input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
        </label>
        <label>
          End date
          <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
        </label>
      </div>
      {save.error && <FormError>{save.error.message}</FormError>}
      <div className="settings-dialog-actions">
        <button className="button" type="button" onClick={onCancel} disabled={save.isPending}>
          Back to campaigns
        </button>
        <button className="button primary" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save campaign"}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { FormError } from "@/features/shared/form-error";
import { createCampaign, useInvalidateCampaigns } from "./campaign-data";

export function CampaignDialog({
  clientId,
  onClose,
  onCreated,
}: {
  clientId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { database } = useAuth();
  const invalidateCampaigns = useInvalidateCampaigns();
  const create = useMutation({
    mutationFn: async (form: FormData) => {
      const start = String(form.get("start")) || null;
      const end = String(form.get("end")) || null;
      const title = String(form.get("title")).trim();
      if (!title) throw new Error("Add a campaign name.");
      if (start && end && end < start)
        throw new Error("The end date must be on or after the start date.");
      return createCampaign(database, {
        clientId,
        title,
        description: String(form.get("description") ?? "").trim(),
        startDate: start,
        endDate: end,
      });
    },
    onSuccess: async (result) => {
      await invalidateCampaigns();
      onCreated(result.id);
      onClose();
    },
  });
  return (
    <Modal
      open
      title="New campaign"
      description="Group related projects around a shared goal."
      onClose={() => {
        if (!create.isPending) onClose();
      }}
    >
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate(new FormData(event.currentTarget));
        }}
      >
        <label>
          Campaign name
          <input name="title" required maxLength={200} placeholder="Fall launch" />
        </label>
        <label>
          <span>
            Campaign goal <span className="muted">(optional)</span>
          </span>
          <textarea name="description" rows={3} maxLength={3000} />
        </label>
        <div className="form-row">
          <label>
            Start date
            <input name="start" type="date" />
          </label>
          <label>
            End date
            <input name="end" type="date" />
          </label>
        </div>
        {create.error && <FormError>{create.error.message}</FormError>}
        <div className="form-actions">
          <button className="button" type="button" disabled={create.isPending} onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={create.isPending}>
            Create campaign
          </button>
        </div>
      </form>
    </Modal>
  );
}

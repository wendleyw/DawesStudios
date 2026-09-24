"use client";

import { useMutation } from "@tanstack/react-query";
import { useId } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { FormError } from "@/features/shared/form-error";
import { Modal } from "@/features/shared/modal";
import { createCompetitor, updateCompetitor, useInvalidateCompetitors } from "./competitors-data";
import { competitorWriteMessage, parseCompetitorForm, type Competitor } from "./competitors-model";

/** Adds a competitor to a client, or edits one; validation and trimming happen here. */
export function CompetitorForm({
  clientId,
  competitor,
  onClose,
}: {
  clientId: string;
  competitor?: Competitor;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const invalidate = useInvalidateCompetitors();
  const hints = useId();
  const save = useMutation({
    mutationFn: async (form: FormData) => {
      const parsed = parseCompetitorForm({
        name: String(form.get("name") ?? ""),
        website: String(form.get("website") ?? ""),
        metaPageId: String(form.get("metaPageId") ?? ""),
        googleAdvertiserId: String(form.get("googleAdvertiserId") ?? ""),
        tiktokAdvertiser: String(form.get("tiktokAdvertiser") ?? ""),
      });
      if ("error" in parsed) throw new Error(parsed.error);
      try {
        return competitor
          ? await updateCompetitor(database, { id: competitor.id, ...parsed.input })
          : await createCompetitor(database, { clientId, ...parsed.input });
      } catch (error) {
        throw new Error(competitorWriteMessage(error as Error, parsed.input.name));
      }
    },
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });
  return (
    <Modal
      open
      title={competitor ? "Edit competitor" : "Add competitor"}
      description="Links and previews come from each platform's official ad library."
      closeDisabled={save.isPending}
      onClose={() => {
        if (!save.isPending) onClose();
      }}
    >
      <form
        className="stack-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(new FormData(event.currentTarget));
        }}
      >
        <label>
          Name
          <input name="name" maxLength={80} autoComplete="off" defaultValue={competitor?.name} />
        </label>
        <label>
          Website <span className="muted">(optional)</span>
          <input
            name="website"
            type="url"
            maxLength={200}
            placeholder="https://"
            defaultValue={competitor?.website ?? ""}
          />
        </label>
        <label>
          Facebook Page ID <span className="muted">(optional)</span>
          <input
            name="metaPageId"
            inputMode="numeric"
            maxLength={20}
            aria-describedby={`${hints}-meta`}
            defaultValue={competitor?.meta_page_id ?? ""}
          />
          <small id={`${hints}-meta`}>
            The number after view_all_page_id= in the page&apos;s Ad Library link.
          </small>
        </label>
        <label>
          Google advertiser ID <span className="muted">(optional)</span>
          <input
            name="googleAdvertiserId"
            maxLength={32}
            aria-describedby={`${hints}-google`}
            defaultValue={competitor?.google_advertiser_id ?? ""}
          />
          <small id={`${hints}-google`}>
            From the advertiser&apos;s page in the Ads Transparency Center.
          </small>
        </label>
        <label>
          TikTok advertiser name <span className="muted">(optional)</span>
          <input
            name="tiktokAdvertiser"
            maxLength={80}
            aria-describedby={`${hints}-tiktok`}
            defaultValue={competitor?.tiktok_advertiser ?? ""}
          />
          <small id={`${hints}-tiktok`}>Leave empty to search by the competitor&apos;s name.</small>
        </label>
        {save.error && <FormError>{save.error.message}</FormError>}
        <div className="form-actions">
          <button className="button" type="button" disabled={save.isPending} onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={save.isPending}>
            {competitor ? "Save changes" : "Add competitor"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

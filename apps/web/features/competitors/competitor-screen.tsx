"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { FormError } from "@/features/shared/form-error";
import { Modal } from "@/features/shared/modal";
import { useDateFormat } from "@/features/workspace/workspace-data";
import { deleteCompetitor, useCompetitorAds, useInvalidateCompetitors } from "./competitors-data";
import { libraryLinks, websiteHost, type Competitor } from "./competitors-model";

type Library = "meta" | "tiktok" | "google";
const libraries: { id: Library; label: string }[] = [
  { id: "meta", label: "Facebook & Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "google", label: "Google" },
];

/** One competitor's ads: a tab per official library, each with its direct link. */
export function CompetitorScreen({
  competitor,
  canEdit,
  onEdit,
  onClose,
}: {
  competitor: Competitor;
  canEdit: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const invalidate = useInvalidateCompetitors();
  const [library, setLibrary] = useState<Library>("meta");
  const [confirming, setConfirming] = useState(false);
  const links = libraryLinks(competitor);
  const remove = useMutation({
    mutationFn: () => deleteCompetitor(database, { id: competitor.id }),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });
  return (
    <Modal
      open
      size="lg"
      title={competitor.name}
      description={websiteHost(competitor.website) ?? undefined}
      closeDisabled={remove.isPending}
      onClose={() => {
        if (!remove.isPending) onClose();
      }}
      footer={
        canEdit ? (
          <div className="competitor-screen-actions">
            {confirming ? (
              <>
                <span>Remove {competitor.name} from this client&apos;s competitors?</span>
                <span className="competitor-screen-confirm">
                  <button
                    className="button"
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => setConfirming(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="button primary"
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate()}
                  >
                    Remove
                  </button>
                </span>
              </>
            ) : (
              <>
                <button className="button quiet" type="button" onClick={() => setConfirming(true)}>
                  Remove competitor
                </button>
                <button className="button" type="button" onClick={onEdit}>
                  Edit
                </button>
              </>
            )}
          </div>
        ) : undefined
      }
    >
      <div
        className="segmented-control competitor-screen-tabs"
        role="group"
        aria-label="Ad library"
      >
        {libraries.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={library === item.id}
            onClick={() => setLibrary(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {remove.error && <FormError>{remove.error.message}</FormError>}
      {library === "meta" ? (
        <MetaLibrary competitor={competitor} href={links.meta} canEdit={canEdit} />
      ) : library === "tiktok" ? (
        <div className="competitor-library">
          <LibraryLink href={links.tiktok}>Open in TikTok Ad Library</LibraryLink>
          <p className="competitor-note">
            TikTok&apos;s library covers ads shown in the EU, the UK and Switzerland.
          </p>
        </div>
      ) : (
        <div className="competitor-library">
          <LibraryLink href={links.google}>Open in Google Ads Transparency Center</LibraryLink>
          {!competitor.google_advertiser_id && !websiteHost(competitor.website) && (
            <p className="competitor-note">
              Add the competitor&apos;s website or Google advertiser ID for a direct link.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

function LibraryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="button" href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <ArrowUpRight size={15} aria-hidden="true" />
    </a>
  );
}

function MetaLibrary({
  competitor,
  href,
  canEdit,
}: {
  competitor: Competitor;
  href: string;
  canEdit: boolean;
}) {
  const ads = useCompetitorAds(competitor.id);
  const { formatDate } = useDateFormat();
  return (
    <div className="competitor-library">
      <LibraryLink href={href}>Open in Meta Ad Library</LibraryLink>
      {ads.isPending ? (
        <p className="competitor-note" role="status">
          Loading ads from Meta…
        </p>
      ) : ads.error ? (
        <FormError>
          {ads.error.message}{" "}
          <button type="button" className="button quiet" onClick={() => void ads.refetch()}>
            Try again
          </button>
        </FormError>
      ) : ads.data.status === "not_configured" ? (
        <p className="competitor-note">
          In-app previews are off. The Ad Library shows every active ad.
          {canEdit ? " Add a Meta Ad Library token on the server to preview ads here." : ""}
        </p>
      ) : ads.data.ads.length === 0 ? (
        <p className="competitor-note">
          Meta&apos;s API returned no active ads for this competitor. It lists ordinary ads only
          where they reached the EU; the Ad Library shows every active ad.
        </p>
      ) : (
        <ul className="competitor-ads" aria-label={`${competitor.name} ads from Meta`}>
          {ads.data.ads.map((ad) => (
            <li className="competitor-ad" key={ad.id}>
              <header>
                <strong>{ad.pageName || competitor.name}</strong>
                {ad.platforms.length > 0 && <span>{ad.platforms.join(" · ")}</span>}
              </header>
              {ad.startedOn && (
                <p className="competitor-ad-meta">Running since {formatDate(ad.startedOn)}</p>
              )}
              {ad.body && <p className="competitor-ad-body">{ad.body}</p>}
              {(ad.title || ad.caption) && (
                <p className="competitor-ad-meta">
                  {[ad.title, ad.caption].filter(Boolean).join(" · ")}
                </p>
              )}
              <a href={ad.libraryUrl} target="_blank" rel="noopener noreferrer">
                View in Ad Library
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

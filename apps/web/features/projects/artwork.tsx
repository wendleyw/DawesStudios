"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult } from "@/lib/supabase";
import type { CanvasDesign, ProjectChannel } from "./project-data";

export function Artwork({
  design,
  channel,
  thumbnail = false,
}: {
  design: CanvasDesign;
  channel: ProjectChannel;
  thumbnail?: boolean;
}) {
  const { database, session } = useAuth();
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const asset = useQuery({
    queryKey: ["asset-url", session?.user.id, channel, design.assetPath],
    enabled: !!design.assetPath,
    staleTime: 120_000,
    refetchInterval: 240_000,
    queryFn: async () =>
      assertResult(
        await database.storage
          .from(channel === "internal" ? "internal-assets" : "published-assets")
          .createSignedUrl(design.assetPath!, 300),
      ).signedUrl,
  });
  const content =
    typeof design.content === "object" && design.content && !Array.isArray(design.content)
      ? design.content
      : {};
  const field = (name: string, fallback = "") =>
    typeof content[name] === "string" ? (content[name] as string) : fallback;
  const color = (name: string, fallback: string) =>
    /^#[a-f\d]{3,8}$/i.test(field(name)) ? field(name) : fallback;
  if (design.assetPath)
    return asset.data && failedSource !== asset.data ? (
      // Private signed URLs must bypass the public image optimization cache.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="uploaded-artwork"
        src={asset.data}
        alt={design.title}
        draggable={false}
        onError={() => setFailedSource(asset.data!)}
      />
    ) : (
      <div className="artwork-loading" role="status">
        {asset.error || failedSource ? (
          <>
            <span>Preview unavailable</span>
            {!thumbnail && (
              <button
                className="button quiet nodrag"
                type="button"
                disabled={asset.isFetching}
                onClick={(event) => {
                  event.stopPropagation();
                  setFailedSource(null);
                  void asset.refetch();
                }}
              >
                Retry preview
              </button>
            )}
          </>
        ) : (
          "Loading artwork…"
        )}
      </div>
    );
  return (
    <div
      className={`artwork ${thumbnail ? "artwork-thumbnail" : ""}`}
      style={{
        backgroundColor: color("background", "#efeee8"),
        color: color("foreground", "#242822"),
      }}
    >
      <span className="artwork-brand">{field("eyebrow", "CREATIVE STUDIO")}</span>
      <div className="artwork-composition">
        <div className="artwork-shape" style={{ backgroundColor: color("accent", "#c8cbb9") }} />
        <div className="artwork-title">{field("headline", design.title)}</div>
      </div>
      <div className="artwork-copy">
        <span>{field("subheading")}</span>
        <p>{field("body")}</p>
      </div>
      <span className="artwork-mark">↗</span>
    </div>
  );
}

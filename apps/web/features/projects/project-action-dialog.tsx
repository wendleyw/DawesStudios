"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { assertResult } from "@/lib/supabase";
import { uploadArtwork } from "./artwork-files";
import { discardPreparedAssets, preparePublicationAssets } from "./media-client";
import { useInvalidateProject, type CanvasDesign, type CanvasVersion } from "./project-data";

export type ProjectAction =
  | { kind: "version"; deliverableId: string; sourceVersionId?: string }
  | { kind: "design" | "publish" | "submit" | "review"; version: CanvasVersion }
  | { kind: "edit-design"; version: CanvasVersion; design: CanvasDesign };
const titles = {
  version: "A fresh version.",
  design: "Add a design.",
  "edit-design": "Edit working design.",
  publish: "Share with the client.",
  submit: "Ready for the studio?",
  review: "Your thoughts make it better.",
};

export function ProjectActionDialog({
  action,
  projectId,
  onClose,
}: {
  action: ProjectAction | null;
  projectId: string;
  onClose: () => void;
}) {
  const { database, mediaUrl } = useAuth();
  const invalidate = useInvalidateProject();
  const [publicationKey] = useState(() => crypto.randomUUID());
  const [stagedArtwork, setStagedArtwork] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState("");
  async function close() {
    if (mutation.isPending || closing) return;
    setClosing(true);
    setCloseError("");
    try {
      if (stagedArtwork) {
        const rows = assertResult(
          await database.from("designs").select("id").eq("internal_asset_path", stagedArtwork),
        );
        if (!rows.length)
          assertResult(await database.storage.from("internal-assets").remove([stagedArtwork]));
      }
      onClose();
    } catch {
      setCloseError("The unfinished upload could not be removed. Please try closing again.");
    } finally {
      setClosing(false);
    }
  }
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (!action) return;
      const value = (name: string) => String(form.get(name) ?? "").trim();
      if (action.kind === "version") {
        assertResult(
          await database.rpc("create_design_version", {
            p_deliverable_id: action.deliverableId,
            p_notes: value("notes"),
            ...(form.get("copy") && action.sourceVersionId
              ? { p_copy_version_id: action.sourceVersionId }
              : {}),
          }),
        );
      } else if (action.kind === "design" || action.kind === "edit-design") {
        if (!value("title")) throw new Error("Add a design name.");
        const file = form.get("artwork");
        const path =
          stagedArtwork ??
          (file instanceof File && file.size
            ? await uploadArtwork(database, projectId, file)
            : null);
        if (path) setStagedArtwork(path);
        const designContent = {
          ...(action.kind === "edit-design" ? Object(action.design.content) : {}),
          headline: value("headline") || value("title"),
          body: value("body"),
          background: value("background"),
          foreground: value("foreground"),
          eyebrow: value("eyebrow"),
        };
        if (action.kind === "edit-design") {
          const payload = {
            title: value("title"),
            content: designContent,
            internal_asset_path: path ?? action.design.assetPath,
          };
          let same = database
            .from("designs")
            .select("id")
            .eq("id", action.design.id)
            .eq("title", payload.title)
            .eq("content", JSON.stringify(payload.content));
          same = payload.internal_asset_path
            ? same.eq("internal_asset_path", payload.internal_asset_path)
            : same.is("internal_asset_path", null);
          if (assertResult(await same).length) return;
          let update = database
            .from("designs")
            .update(payload)
            .eq("id", action.design.id)
            .eq("title", action.design.title)
            .eq("content", JSON.stringify(action.design.content));
          update = action.design.assetPath
            ? update.eq("internal_asset_path", action.design.assetPath)
            : update.is("internal_asset_path", null);
          const result = await update.select("id").single();
          if (result.error?.code === "PGRST116")
            throw new Error(
              "This design changed while you were editing. Close and reopen it before saving.",
            );
          assertResult(result);
        } else {
          const existing = path
            ? assertResult(
                await database
                  .from("designs")
                  .select("id")
                  .eq("version_id", action.version.id)
                  .eq("internal_asset_path", path),
              )
            : [];
          if (existing[0])
            assertResult(
              await database
                .from("designs")
                .update({ title: value("title"), content: designContent })
                .eq("id", existing[0].id)
                .select("id")
                .single(),
            );
          else
            assertResult(
              await database.rpc("add_design", {
                p_version_id: action.version.id,
                p_title: value("title"),
                p_content: designContent,
                ...(path ? { p_internal_asset_path: path } : {}),
              }),
            );
        }
      } else if (action.kind === "publish") {
        const assets = await preparePublicationAssets(database, mediaUrl, action.version.id);
        try {
          assertResult(
            await database.rpc("publish_version", {
              p_version_id: action.version.id,
              p_release_note: value("note"),
              p_assets: assets,
              p_idempotency_key: publicationKey,
            }),
          );
        } finally {
          // Referenced files are retained; the server also expires abandoned preparations.
          await discardPreparedAssets(database, mediaUrl, Object.values(assets)).catch(
            () => undefined,
          );
        }
      } else if (action.kind === "submit") {
        assertResult(
          await database.rpc("submit_design_version", { p_version_id: action.version.id }),
        );
      } else if (action.kind === "review") {
        assertResult(
          await database.rpc("review_publication", {
            p_publication_id: action.version.id,
            p_decision: value("decision"),
            p_feedback: value("feedback"),
          }),
        );
      }
    },
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  const current = action?.kind === "edit-design" ? action.design : null;
  const content =
    current?.content && typeof current.content === "object" && !Array.isArray(current.content)
      ? current.content
      : {};
  const field = (name: string, fallback = "") =>
    typeof content[name] === "string" ? (content[name] as string) : fallback;

  return (
    <Modal
      open={!!action}
      onClose={() => void close()}
      title={action ? titles[action.kind] : "Project action"}
    >
      {action && (
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(new FormData(event.currentTarget));
          }}
        >
          {action.kind === "version" && (
            <>
              <p>Keep earlier work intact while exploring what’s next.</p>
              <label>
                Version note
                <textarea name="notes" rows={3} placeholder="What will this version explore?" />
              </label>
              {action.sourceVersionId && (
                <label className="checkbox-label">
                  <input name="copy" type="checkbox" defaultChecked />
                  Start from the previous version
                </label>
              )}
            </>
          )}
          {(action.kind === "design" || action.kind === "edit-design") && (
            <>
              <label>
                Design name
                <input
                  name="title"
                  defaultValue={current?.title ?? ""}
                  required
                  maxLength={160}
                  placeholder="e.g. Hero — direction A"
                />
              </label>
              <label>
                Artwork file
                <input
                  name="artwork"
                  type="file"
                  disabled={!!stagedArtwork || mutation.isPending}
                  accept="image/png,image/jpeg,image/webp"
                />
                <small>PNG, JPG, or WebP. Up to 25 MB.</small>
              </label>
              <details className="design-text-options">
                <summary>Or compose a text concept</summary>
                <label>
                  Brand label
                  <input name="eyebrow" defaultValue={field("eyebrow")} maxLength={80} />
                </label>
                <label>
                  Headline
                  <textarea
                    name="headline"
                    defaultValue={field("headline")}
                    rows={2}
                    maxLength={240}
                  />
                </label>
                <label>
                  Supporting copy
                  <textarea name="body" defaultValue={field("body")} rows={2} maxLength={1000} />
                </label>
                <div className="form-row">
                  <label>
                    Background
                    <input
                      type="color"
                      name="background"
                      defaultValue={field("background", "#f2f0e8")}
                    />
                  </label>
                  <label>
                    Text
                    <input
                      type="color"
                      name="foreground"
                      defaultValue={field("foreground", "#20231f")}
                    />
                  </label>
                </div>
              </details>
            </>
          )}
          {action.kind === "publish" && (
            <>
              <p>
                The client will receive a fixed copy of this version. Future studio edits remain
                private.
              </p>
              <label>
                A note for the client
                <textarea
                  name="note"
                  rows={4}
                  placeholder="What should they look for?"
                  maxLength={2000}
                />
              </label>
            </>
          )}
          {action.kind === "submit" && (
            <p>
              Send this version to the studio for an internal review. The client will see it after
              the studio shares it.
            </p>
          )}
          {action.kind === "review" && (
            <>
              <label>
                Your decision
                <select name="decision" defaultValue="approved">
                  <option value="approved">Approve this version</option>
                  <option value="changes_requested">Request changes</option>
                </select>
              </label>
              <label>
                Feedback
                <textarea
                  name="feedback"
                  rows={4}
                  placeholder="Share a little context. Required when requesting changes."
                  maxLength={5000}
                />
              </label>
            </>
          )}
          {(mutation.error || closeError) && (
            <p className="form-error" role="alert">
              {closeError || mutation.error?.message}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button"
              type="button"
              onClick={() => void close()}
              disabled={mutation.isPending || closing}
            >
              Cancel
            </button>
            <button className="button primary" type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? "Saving…"
                : {
                    version: "Create version",
                    design: "Add design",
                    "edit-design": "Save working design",
                    publish: "Share version",
                    submit: "Send to studio",
                    review: "Send review",
                  }[action.kind]}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

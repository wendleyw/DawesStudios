"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import {
  brandQueryKeys,
  updateTemplateDraft,
  useBrandTemplates,
  useTemplateDraft,
  type BrandTemplate,
  type TemplateDraft,
} from "./brand-data";
import {
  parseDraftInput,
  readTemplateContent,
  validationMessage,
  type TemplateContent,
} from "./brand-model";
import { TemplatePreview } from "./template-preview";
import "./brand.css";
import { FormError } from "@/features/shared/form-error";
import { Modal } from "@/features/shared/modal";
import { PageStatus } from "@/features/shared/page-status";
import { NotificationsBell } from "@/features/workspace/notifications-bell";

export function DraftEditor({ clientId, draftId }: { clientId: string; draftId: string }) {
  const templates = useBrandTemplates(clientId);
  const draft = useTemplateDraft(clientId, draftId);
  if (draft.isPending || templates.isPending) return <PageStatus>Loading your draft…</PageStatus>;
  const template = templates.data?.find((item) => item.id === draft.data?.template_id);
  if (!draft.data || !template || draft.error || templates.error)
    return (
      <div className="page-content">
        <h1>This draft is unavailable.</h1>
        <p className="brand-muted">You can open your own drafts from this workspace’s templates.</p>
        <Link className="button" href={`/clients/${clientId}/brand/templates`}>
          Back to templates
        </Link>
      </div>
    );
  return <DraftEditorForm key={draft.data.id} draft={draft.data} template={template} />;
}

function DraftEditorForm({ draft, template }: { draft: TemplateDraft; template: BrandTemplate }) {
  const { database, session } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(draft.name);
  const [content, setContent] = useState(() =>
    readTemplateContent(draft.content, template.content),
  );
  const [saved, setSaved] = useState(() =>
    JSON.stringify({
      name: draft.name,
      content: readTemplateContent(draft.content, template.content),
    }),
  );
  const [revision, setRevision] = useState(draft.updated_at);
  const [zoom, setZoom] = useState(100);
  const [leaving, setLeaving] = useState(false);
  const router = useRouter();
  const templatesHref = `/clients/${draft.client_id}/brand/templates`;
  const dirty = JSON.stringify({ name, content }) !== saved;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const save = useMutation({
    mutationFn: async () => {
      const values = parseDraftInput(name, content);
      const updatedAt = await updateTemplateDraft(database, {
        id: draft.id,
        clientId: draft.client_id,
        ownerId: session!.user.id,
        revision,
        name: values.name,
        content: values.content,
      });
      return { ...values, updatedAt };
    },
    onSuccess: (result) => {
      setRevision(result.updatedAt);
      setName(result.name);
      setContent(result.content);
      setSaved(JSON.stringify({ name: result.name, content: result.content }));
      // Saving a draft changes the list entry and the open draft, and nothing else brand owns, so
      // this composes those two keys rather than taking a whole-feature helper.
      void queryClient.invalidateQueries({ queryKey: [brandQueryKeys.templateDrafts] });
      void queryClient.invalidateQueries({ queryKey: [brandQueryKeys.templateDraft] });
    },
  });
  function change<K extends keyof TemplateContent>(key: K, value: TemplateContent[K]) {
    setContent((current) => ({ ...current, [key]: value }));
  }
  return (
    <div className="page-content brand-draft-editor">
      <div className="brand-draft-topbar">
        {/* Leaving with unsaved work is the one thing this screen can lose, so it asks in the
            product's own dialog rather than in the browser's. */}
        <Link
          href={templatesHref}
          className="button quiet"
          onClick={(event) => {
            if (!dirty) return;
            event.preventDefault();
            setLeaving(true);
          }}
        >
          <ArrowLeft size={16} />
          Templates
        </Link>
        <span role="status" className="brand-save-status">
          {save.isPending ? "Saving…" : dirty ? "Unsaved changes" : "Saved to your drafts"}
        </span>
        <button
          type="submit"
          form="template-draft-form"
          className="button primary"
          disabled={!dirty || save.isPending}
        >
          <Save size={15} />
          Save draft
        </button>
        <NotificationsBell className="page-bell" />
      </div>
      <div className="brand-draft-layout">
        <form
          id="template-draft-form"
          className="brand-draft-controls"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <span className="eyebrow">PRIVATE DRAFT</span>
          <h1>Template draft</h1>
          <p className="brand-muted">Edit the content and layout. Your changes stay private.</p>
          <label>
            Draft name
            <input
              value={name}
              maxLength={300}
              required
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Headline
            <input
              value={content.headline}
              maxLength={300}
              onChange={(event) => change("headline", event.target.value)}
            />
          </label>
          <label>
            Subheading
            <input
              value={content.subheading}
              maxLength={300}
              onChange={(event) => change("subheading", event.target.value)}
            />
          </label>
          <label>
            Body copy
            <textarea
              value={content.body}
              maxLength={3000}
              onChange={(event) => change("body", event.target.value)}
            />
          </label>
          <label>
            Call to action
            <input
              value={content.cta}
              maxLength={100}
              onChange={(event) => change("cta", event.target.value)}
            />
          </label>
          <label>
            Small label
            <input
              value={content.eyebrow}
              maxLength={100}
              onChange={(event) => change("eyebrow", event.target.value)}
            />
          </label>
          <div className="brand-color-fields">
            {(
              [
                ["background", "Background"],
                ["foreground", "Text"],
                ["accent", "Accent"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="color"
                  value={content[key]}
                  onChange={(event) => change(key, event.target.value)}
                />
              </label>
            ))}
          </div>
          <label>
            Layout
            <select
              value={content.layout}
              onChange={(event) =>
                change("layout", event.target.value as TemplateContent["layout"])
              }
            >
              <option value="editorial">Editorial</option>
              <option value="centered">Centered</option>
              <option value="minimal">Minimal</option>
            </select>
          </label>
          {save.error && <FormError>{validationMessage(save.error)}</FormError>}
        </form>
        <section className="brand-draft-preview" aria-label="Template preview">
          <div className="brand-preview-toolbar">
            <span>
              {template.name} · {template.width} × {template.height}
            </span>
            <label>
              <span className="visually-hidden">Preview zoom</span>
              <select
                aria-label="Preview zoom"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              >
                <option value={50}>50%</option>
                <option value={75}>75%</option>
                <option value={100}>100%</option>
                <option value={125}>125%</option>
              </select>
            </label>
          </div>
          <div
            className="brand-preview-canvas"
            tabIndex={0}
            role="region"
            aria-label="Scrollable template preview"
          >
            <div className="brand-preview-sheet" style={{ width: `${zoom}%` }}>
              <TemplatePreview content={content} width={template.width} height={template.height} />
            </div>
          </div>
        </section>
      </div>
      <Modal
        open={leaving}
        title="Leave without saving?"
        description="Your unsaved changes to this draft will be lost."
        onClose={() => setLeaving(false)}
      >
        <div className="form-actions">
          <button className="button" onClick={() => setLeaving(false)}>
            Keep editing
          </button>
          <button className="button primary" onClick={() => router.push(templatesHref)}>
            Leave without saving
          </button>
        </div>
      </Modal>
    </div>
  );
}

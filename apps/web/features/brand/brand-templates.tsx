"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult } from "@/lib/supabase";
import { useBrandTemplates, useTemplateDrafts, type BrandTemplate } from "./brand-data";
import { matchesBrandSearch, readTemplateContent, validationMessage } from "./brand-model";
import { TemplatePreview } from "./template-preview";
import { FormError } from "@/features/shared/form-error";
import { SearchField } from "@/features/shared/search-field";

export function BrandTemplates({ clientId }: { clientId: string }) {
  const { database, session } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const templates = useBrandTemplates(clientId);
  const drafts = useTemplateDrafts(clientId);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [view, setView] = useState<"templates" | "drafts">("templates");
  const create = useMutation({
    mutationFn: async (template: BrandTemplate) =>
      assertResult<{ id: string }>(
        await database
          .from("template_drafts")
          .insert({
            client_id: clientId,
            template_id: template.id,
            owner_id: session!.user.id,
            name: `${template.name} exploration`,
            content: readTemplateContent(template.content),
          })
          .select("id")
          .single(),
      ),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["template-drafts"] });
      router.push(`/clients/${clientId}/brand/drafts/${result.id}`);
    },
  });
  if (templates.isPending || drafts.isPending)
    return <p role="status">Getting your starting points ready…</p>;
  if (templates.error || drafts.error)
    return (
      <div className="empty-state">
        <h3>We couldn’t load your templates.</h3>
        <button
          className="button"
          onClick={() => {
            void templates.refetch();
            void drafts.refetch();
          }}
        >
          Try again
        </button>
      </div>
    );
  const filteredTemplates =
    templates.data?.filter((template) => matchesBrandSearch(template, search, category)) ?? [];
  const filteredDrafts =
    drafts.data?.filter((draft) =>
      matchesBrandSearch(
        {
          ...draft,
          category: templates.data?.find((template) => template.id === draft.template_id)?.category,
        },
        search,
        category,
      ),
    ) ?? [];
  return (
    <>
      <div className="brand-resource-toolbar">
        <div className="segmented-control" aria-label="Template collection">
          <button
            type="button"
            aria-pressed={view === "templates"}
            onClick={() => setView("templates")}
          >
            Templates
          </button>
          <button type="button" aria-pressed={view === "drafts"} onClick={() => setView("drafts")}>
            My drafts ({drafts.data?.length ?? 0})
          </button>
        </div>
        <SearchField
          label="Search templates and drafts"
          value={search}
          onChange={setSearch}
          placeholder="Find a starting point…"
          iconSize={15}
        />
        <label>
          <span className="visually-hidden">Template category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {Array.from(new Set(templates.data?.map((template) => template.category)))
              .sort()
              .map((value) => (
                <option key={value}>{value}</option>
              ))}
          </select>
        </label>
      </div>
      <p className="brand-draft-note">
        Your drafts are private. Exploring a template does not start a project or use credits.
      </p>
      {create.error && <FormError>{validationMessage(create.error)}</FormError>}
      {view === "templates" ? (
        <div className="brand-template-grid">
          {filteredTemplates.map((template) => (
            <article className="brand-template-card" key={template.id}>
              <TemplatePreview
                compact
                content={readTemplateContent(template.content)}
                width={template.width}
                height={template.height}
              />
              <div className="brand-template-info">
                <span className="eyebrow">
                  {template.category} · {template.width} × {template.height}
                </span>
                <h3>{template.name}</h3>
                <button
                  className="button"
                  disabled={create.isPending}
                  onClick={() => create.mutate(template)}
                >
                  <Plus size={14} />
                  {create.isPending && create.variables.id === template.id
                    ? "Creating…"
                    : "Make it yours"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="brand-template-grid">
          {filteredDrafts.map((draft) => {
            const template = templates.data?.find((item) => item.id === draft.template_id);
            return (
              <Link
                className="brand-template-card"
                key={draft.id}
                href={`/clients/${clientId}/brand/drafts/${draft.id}`}
              >
                <TemplatePreview
                  compact
                  content={readTemplateContent(draft.content, template?.content)}
                  width={template?.width ?? 1080}
                  height={template?.height ?? 1080}
                />
                <div className="brand-template-info">
                  <span className="eyebrow">PRIVATE DRAFT</span>
                  <h3>{draft.name}</h3>
                  <span className="brand-inline-heading">
                    <span>Continue editing</span>
                    <ArrowUpRight size={15} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {!(view === "templates" ? filteredTemplates.length : filteredDrafts.length) && (
        <div className="empty-state">
          <h3>
            {view === "drafts" && !drafts.data?.length
              ? "Your next idea starts here."
              : "Nothing matches just yet."}
          </h3>
          <p>
            {view === "drafts" && !drafts.data?.length
              ? "Choose a template to create your first private draft."
              : "Try another search or category."}
          </p>
          <button
            className="button"
            onClick={() => {
              setSearch("");
              setCategory("");
              if (view === "drafts" && !drafts.data?.length) setView("templates");
            }}
          >
            {view === "drafts" && !drafts.data?.length ? "Browse templates" : "Clear filters"}
          </button>
        </div>
      )}
    </>
  );
}

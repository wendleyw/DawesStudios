"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useClients } from "@/features/workspace/workspace-data";
import { useBrandSections } from "./brand-data";
import { brandNavigation, isBrandSection } from "./brand-model";
import { BrandAssets } from "./brand-assets";
import { BrandSectionContent } from "./brand-sections";
import { BrandTemplates } from "./brand-templates";
import { SectionEditor } from "./section-editor";
import "./brand.css";
import { PageStatus } from "@/features/shared/page-status";

export function BrandPage({ clientId, section }: { clientId: string; section: string }) {
  const { profile } = useAuth();
  const clients = useClients();
  const sections = useBrandSections(clientId);
  const [editing, setEditing] = useState(false);
  const client = clients.data?.find((item) => item.id === clientId);
  if (clients.isPending || sections.isPending)
    return <PageStatus>Opening the Brand Hub…</PageStatus>;
  if (!client || sections.error || !isBrandSection(section))
    return (
      <div className="page-content">
        <h1>Brand Hub unavailable.</h1>
        <p className="brand-muted">This space is unavailable or you do not have access.</p>
        <Link className="button" href="/home">
          Back to your work
        </Link>
      </div>
    );
  const title = brandNavigation.find((item) => item.id === section)!.label;
  const content = sections.data?.find((item) => item.section === section)?.content;
  const editable = section !== "assets" && section !== "templates";
  return (
    <div className="page-content brand-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">BRAND RESOURCES</span>
          <h1>Brand Hub</h1>
          <p>Identity, resources, and guidance for consistent work.</p>
        </div>
      </div>
      {/*
        The ten sections read as one row rather than hiding inside a select: where you are and what
        else there is are the same glance. They are links because they are routes — a section opens
        in a new tab or gets its own address, which a select could never offer. The row scrolls
        sideways instead of wrapping, so the order stays the order of the groups.
      */}
      <nav className="brand-section-nav" aria-label="Brand sections">
        {brandNavigation.map((item) => (
          <Link
            key={item.id}
            href={`/clients/${clientId}/brand/${item.id}`}
            className={item.id === section ? "active" : ""}
            aria-current={item.id === section ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="brand-section-heading">
        <h2>{title}</h2>
        {profile?.role === "agency" && editable && (
          <button className="button quiet" onClick={() => setEditing(true)}>
            <Pencil size={14} />
            Edit {title.toLowerCase()}
          </button>
        )}
      </div>
      {section === "assets" ? (
        <BrandAssets key={clientId} clientId={clientId} />
      ) : section === "templates" ? (
        <BrandTemplates key={clientId} clientId={clientId} />
      ) : (
        <BrandSectionContent
          key={`${clientId}-${section}`}
          clientId={clientId}
          clientName={client.name}
          section={section}
          content={content}
          sections={sections.data ?? []}
        />
      )}
      {editing && editable && (
        <SectionEditor
          key={`${clientId}-${section}`}
          clientId={clientId}
          section={section}
          title={title}
          content={content}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

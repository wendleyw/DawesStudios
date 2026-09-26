"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { AssetsPage } from "@/features/assets/assets-page";
import { useClients } from "@/features/workspace/workspace-data";
import { useBrandSections } from "./brand-data";
import { brandNavigation, isBrandSection, type EditableSectionId } from "./brand-model";
import { BrandAssets } from "./brand-assets";
import { BrandSectionContent } from "./brand-sections";
import { SectionEditor } from "./section-editor";
import "./brand.css";
import { PageStatus } from "@/features/shared/page-status";

export function BrandPage({ clientId, section }: { clientId: string; section: string }) {
  const { profile } = useAuth();
  const clients = useClients();
  const sections = useBrandSections(clientId);
  const [editing, setEditing] = useState<EditableSectionId | null>(null);
  const client = clients.data?.find((item) => item.id === clientId);
  if (clients.isPending || sections.isPending)
    return <PageStatus>Loading the Brand Hub…</PageStatus>;
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
  const editable = section !== "assets" && section !== "files";
  const agency = profile?.role === "agency";
  const contentOf = (id: string) => sections.data?.find((item) => item.section === id)?.content;
  return (
    <div className="page-content brand-page">
      <header className="page-heading client-page-heading">
        <h1>Brand Hub</h1>
        {/*
        The nine sections read as one row beside the title rather than hiding inside a select or
        taking a row of their own: where you are and what else there is are the same glance, and
        the section itself starts higher. They are links because they are routes — a section opens
        in a new tab or gets its own address, which a select could never offer. The row scrolls
        sideways instead of wrapping, so the order stays the order of the groups.
      */}
        <nav
          className="brand-section-nav section-tabs client-page-tools"
          aria-label="Brand sections"
        >
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
      </header>
      {/* Files renders its own heading, with its upload actions and campaign back link. */}
      {section !== "files" && (
        <div className="brand-section-heading">
          <h2>{title}</h2>
          {agency && editable && (
            <button className="button quiet" onClick={() => setEditing(section)}>
              <Pencil size={14} />
              Edit {title.toLowerCase()}
            </button>
          )}
        </div>
      )}
      {section === "files" ? (
        <AssetsPage key={clientId} clientId={clientId} />
      ) : section === "assets" ? (
        <BrandAssets
          key={clientId}
          clientId={clientId}
          products={contentOf("products")}
          onEditProducts={agency ? () => setEditing("products") : undefined}
        />
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
      {editing && (
        <SectionEditor
          key={`${clientId}-${editing}`}
          clientId={clientId}
          section={editing}
          title={editing === "products" ? "Products" : title}
          content={contentOf(editing)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { HeaderActions, HeaderActionsProvider } from "@/features/shared/header-actions";
import { useAuth } from "@/features/auth/auth-provider";
import { AssetsPage } from "@/features/assets/assets-page";
import { useScrollRow } from "@/features/shared/use-scroll-row";
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
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);
  const client = clients.data?.find((item) => item.id === clientId);
  const sectionNav = useRef<HTMLElement>(null);
  // The section row scrolls sideways below desktop; it mounts once the Hub has loaded.
  useScrollRow(sectionNav, `${section}:${Boolean(client && sections.data)}`);
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
    <HeaderActionsProvider value={actionsSlot}>
      <div className="page-content brand-page">
        <header className="page-heading card-heading">
          <h1>Brand Hub</h1>
          {/* Every section's actions land here (shared/header-actions.tsx). */}
          <div className="page-actions header-actions-slot" ref={setActionsSlot} />
          {/*
        The nine sections are one row of links under the title rather than a select: they are
        routes, so a section opens in a new tab or gets its own address. The row scrolls sideways
        instead of wrapping, so the order stays the order of the groups.
      */}
          <nav
            ref={sectionNav}
            className="brand-section-nav section-tabs card-heading-tools"
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
        {/* Files renders its own heading with its campaign back link. The active tab already names
        the section; this heading stays for assistive technology. */}
        {section !== "files" && <h2 className="visually-hidden">{title}</h2>}
        {agency && editable && (
          <HeaderActions>
            <button className="button" onClick={() => setEditing(section)}>
              <Pencil size={14} />
              Edit {title.toLowerCase()}
            </button>
          </HeaderActions>
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
    </HeaderActionsProvider>
  );
}

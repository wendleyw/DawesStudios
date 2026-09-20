"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

export function BrandPage({ clientId, section }: { clientId: string; section: string }) {
  const { profile } = useAuth();
  const router = useRouter();
  const clients = useClients();
  const sections = useBrandSections(clientId);
  const [editing, setEditing] = useState(false);
  const client = clients.data?.find(item => item.id === clientId);
  if (clients.isPending || sections.isPending) return <div className="page-content" role="status">Opening the brand hub…</div>;
  if (!client || sections.error || !isBrandSection(section)) return <div className="page-content"><h1>Brand hub unavailable.</h1><p className="brand-muted">This space is unavailable or you do not have access.</p><Link className="button" href="/home">Back to your work</Link></div>;
  const title = brandNavigation.find(item => item.id === section)!.label;
  const content = sections.data?.find(item => item.section === section)?.content;
  const editable = section !== "assets" && section !== "templates";
  return <div className="page-content brand-page"><div className="page-heading"><div><span className="eyebrow">BRAND RESOURCES</span><h1>Brand Hub</h1><p>Identity, resources, and guidance for consistent work.</p></div><label className="brand-section-selector">Explore the brand<select aria-label="Brand section" value={section} onChange={event => router.push(`/clients/${clientId}/brand/${event.target.value}`)}>{["Identity", "Resources", "Guidance"].map(group => <optgroup label={group} key={group}>{brandNavigation.filter(item => item.group === group).map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</optgroup>)}</select></label></div><div className="brand-section-heading"><h2>{title}</h2>{profile?.role === "agency" && editable && <button className="button quiet" onClick={() => setEditing(true)}><Pencil size={14} />Edit {title.toLowerCase()}</button>}</div>{section === "assets" ? <BrandAssets key={clientId} clientId={clientId} /> : section === "templates" ? <BrandTemplates key={clientId} clientId={clientId} /> : <BrandSectionContent key={`${clientId}-${section}`} clientId={clientId} clientName={client.name} section={section} content={content} sections={sections.data ?? []} />}{editing && editable && <SectionEditor key={`${clientId}-${section}`} clientId={clientId} section={section} title={title} content={content} onClose={() => setEditing(false)} />}</div>;
}

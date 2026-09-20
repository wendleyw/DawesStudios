"use client";

import { Bell, CircleHelp, Home, Layers3, LogOut, Menu, PanelLeftClose, Search, Settings2, X } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { useWorkspaceSettings } from "@/features/workspace/workspace-settings";
import { useClients } from "./workspace-data";
import "./activity.css";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { database, session, profile, loading, error } = useAuth();
  const clients = useClients();
  const settings = useWorkspaceSettings();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMobileOpen(false);
        router.push("/search");
      }
    }
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [router]);

  useEffect(() => {
    if (!mobileOpen || !sidebar.current) return;
    const panel = sidebar.current;
    const returnFocus = menuButton.current;
    const previousOverflow = document.body.style.overflow;
    const desktop = window.matchMedia("(min-width: 901px)");
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex="0"]')).filter(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
    function focusFirst() { focusable()[0]?.focus({ preventScroll: true }); }
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setMobileOpen(false); }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    }
    function containFocus(event: FocusEvent) { if (event.target instanceof Node && !panel.contains(event.target)) focusFirst(); }
    function closeAfterNavigation() { setMobileOpen(false); }
    function closeOnDesktop(event: MediaQueryListEvent) { if (event.matches) setMobileOpen(false); }
    document.body.style.overflow = "hidden";
    focusFirst();
    document.addEventListener("keydown", keydown);
    document.addEventListener("focusin", containFocus);
    window.addEventListener("popstate", closeAfterNavigation);
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("focusin", containFocus);
      window.removeEventListener("popstate", closeAfterNavigation);
      desktop.removeEventListener("change", closeOnDesktop);
      document.body.style.overflow = previousOverflow;
      if (returnFocus?.isConnected && returnFocus.getClientRects().length) returnFocus.focus({ preventScroll: true });
    };
  }, [mobileOpen]);

  useEffect(() => { if (!loading && !session) router.replace(`/login?returnTo=${encodeURIComponent(pathname + window.location.search)}`); }, [session, loading, router, pathname]);
  if (loading || !session) return <main className="centered-state" role="status">Opening your workspace…</main>;
  if (error || !profile) return <main className="centered-state"><h1>We couldn’t open your workspace.</h1><p>Please try again, or ask your studio contact for help.</p><button className="button" onClick={() => window.location.reload()}>Try again</button></main>;
  const activeClientId = pathname.match(/\/clients\/([^/]+)/)?.[1];
  const activeClient = clients.data?.find(client => client.id === activeClientId);
  const homeLabel = profile.role === "agency" ? "Overview" : profile.role === "designer" ? "My work" : "Home";
  const studioName = settings.data?.studio_name || "Brianna Dawes Studios";
  const clientTabs = [{ path: "board", label: "Board" }, { path: "briefings", label: "Briefings" }, { path: "reviews", label: "Reviews" }, { path: "assets", label: "Assets" }, { path: "brand/overview", label: "Brand Hub" }, ...(profile.role !== "designer" ? [{ path: "credits", label: "Credits" }] : [])];

  return <div className={`application ${collapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "mobile-sidebar-open" : ""}`}>
    <nav aria-label="Accessibility"><a className="skip-link" href="#main-content">Skip to content</a></nav>
    {mobileOpen && <button className="sidebar-backdrop" aria-label="Close navigation" tabIndex={-1} onClick={() => setMobileOpen(false)} />}
    <div id="workspace-navigation" ref={sidebar} className="sidebar" role={mobileOpen ? "dialog" : "complementary"} aria-modal={mobileOpen || undefined} aria-label="Workspace navigation" onClickCapture={event => { if (mobileOpen && event.target instanceof Element && event.target.closest("a[href]")) setMobileOpen(false); }}>
      <Link href="/home" className="brand-link" aria-label={`${studioName} home`}><Image src="/brand/logo.webp" alt={studioName} width={2409} height={619} sizes="166px" className="brand-logo" /></Link>
      <button className="icon-button mobile-sidebar-close" aria-label="Close workspace navigation" onClick={() => setMobileOpen(false)}><X size={18} /></button>
      <button className="icon-button sidebar-collapse" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}><PanelLeftClose size={17} /></button>
      <nav aria-label="Main navigation">
        <Link className={`nav-item ${pathname === "/home" ? "active" : ""}`} aria-current={pathname === "/home" ? "page" : undefined} href="/home"><Home size={17} /><span>{homeLabel}</span></Link>
        <Link className={`nav-item ${pathname === "/search" ? "active" : ""}`} aria-current={pathname === "/search" ? "page" : undefined} href="/search"><Search size={17} /><span>Search</span><kbd>⌘ K</kbd></Link>
        <div className="nav-section-label">WORKSPACES</div>
        <div className="client-navigation">{clients.data?.map(client => <Link key={client.id} href={`/clients/${client.id}/board`} title={client.name} className={`nav-item client-nav ${activeClientId === client.id ? "active" : ""}`} aria-current={activeClientId === client.id ? "location" : undefined}><span className="client-initials" aria-hidden="true">{client.initials || client.name.slice(0, 2)}</span><span>{client.name}</span></Link>)}</div>
      </nav>
      <div className="sidebar-footer">
        {profile.role === "agency" && <Link href="/settings" className={`nav-item ${pathname === "/settings" ? "active" : ""}`}><Settings2 size={17} /><span>Studio settings</span></Link>}
        <button className="nav-item" onClick={() => { setMobileOpen(false); setHelpOpen(true); }}><CircleHelp size={17} /><span>Help & support</span></button>
        <div className="profile-bar"><Link href="/settings/account" className="profile-account" aria-label={`Account settings for ${profile.display_name}`}><span className="profile-avatar" aria-hidden="true">{profile.display_name.split(" ").map(value => value[0]).slice(0, 2).join("")}</span><div className="profile-account-copy"><strong>{profile.display_name}</strong><span>{profile.role === "agency" ? "Studio team" : profile.role === "designer" ? "Creative partner" : "Client workspace"}</span></div></Link><button className="icon-button" aria-label="Sign out" onClick={async () => { setMobileOpen(false); await database.auth.signOut(); router.replace("/login"); }}><LogOut size={16} /></button></div>
      </div>
    </div>
    <div className="workspace" inert={mobileOpen || undefined}>
      <header className="topbar"><button ref={menuButton} className="icon-button mobile-menu" aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="workspace-navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div className="topbar-breadcrumb"><Layers3 size={16} /><span>{studioName}</span>{activeClient && <><span className="separator">/</span><strong>{activeClient.name}</strong></>}</div><div className="topbar-actions"><Link href="/notifications" className="icon-button" aria-label="Notifications"><Bell size={17} /></Link></div></header>
      {activeClient && <nav className="client-tabs" aria-label={`${activeClient.name} navigation`}>{clientTabs.map(item => { const active = pathname.includes(`/clients/${activeClient.id}/${item.path.split("/")[0]}`); return <Link key={item.path} href={`/clients/${activeClient.id}/${item.path}`} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>{item.label}</Link>; })}</nav>}
      <main id="main-content" className="main-content" tabIndex={-1}>{children}</main>
    </div>
    <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Help & support" footer={<button className="button primary" onClick={() => setHelpOpen(false)}>Done</button>}><div className="form-stack"><p>Open a project to message the studio. Select a design to add feedback or place a comment pin.</p><p>For account access or a new workspace, contact your studio representative.</p></div></Modal>
  </div>;
}

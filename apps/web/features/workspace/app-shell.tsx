"use client";

import {
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Home,
  Layers3,
  LogOut,
  Menu,
  PanelLeftClose,
  Search,
  Settings2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { consumePostSignInFocus } from "@/features/auth/post-sign-in-focus";
import { Modal } from "@/features/shared/modal";
import { useWorkspaceSettings } from "@/features/workspace/workspace-settings";
import { NotificationsBell } from "./notifications-bell";
import { useClients, useProjectClient } from "./workspace-data";
import "./workspace.css";
import "./activity.css";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { database, session, profile, loading, error } = useAuth();
  const clients = useClients();
  const settings = useWorkspaceSettings();
  const pathname = usePathname();
  // Every project link in the product targets /projects/:id, which carries no client segment, so
  // the workspace has to be resolved from the project or the sidebar folds shut on arrival.
  const projectClient = useProjectClient(pathname.match(/^\/projects\/([^/]+)/)?.[1]);
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLDivElement>(null);
  const activeEntry = useRef<HTMLDivElement>(null);
  const mainContent = useRef<HTMLElement>(null);
  const focusHandled = useRef(false);

  // Only the redirect out of /login sets the flag this reads, so a direct reload or an in-app
  // navigation (the shell persists across those, re-rendering only `children`) leaves focus alone.
  // Waiting on `!loading && session` also waits for `<main>` itself: the shell renders a
  // loading/redirect placeholder without it until auth resolves.
  useEffect(() => {
    if (focusHandled.current || loading || !session) return;
    focusHandled.current = true;
    if (consumePostSignInFocus()) mainContent.current?.focus();
  }, [loading, session]);

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
    // Read the panel live rather than capturing it: the drawer's contents mount asynchronously as
    // the workspace and client queries resolve, and a captured node can be replaced underneath the
    // trap, leaving every containment check false and focus stranded on the document.
    const panelRef = () => sidebar.current;
    const panel = sidebar.current;
    const returnFocus = menuButton.current;
    const previousOverflow = document.body.style.overflow;
    const desktop = window.matchMedia("(min-width: 901px)");
    const focusable = () =>
      Array.from(
        panelRef()?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),[tabindex="0"]',
        ) ?? [],
      ).filter(
        (element) =>
          element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden",
      );
    const holdsFocus = () =>
      !!document.activeElement && !!panelRef()?.contains(document.activeElement);
    function focusFirst() {
      focusable()[0]?.focus({ preventScroll: true });
    }
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && (document.activeElement === first || !holdsFocus())) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !holdsFocus())) {
        event.preventDefault();
        first?.focus();
      }
    }
    function containFocus(event: FocusEvent) {
      if (event.target instanceof Node && !panelRef()?.contains(event.target)) focusFirst();
    }
    // Focus moving to document.body raises no focusin, so a re-render that removes the focused link
    // would otherwise strand the trap. focusout does fire, with a null relatedTarget, and it fires
    // synchronously with the focus change — so it closes the window the observer alone would leave.
    function keepFocus(event: FocusEvent) {
      const next = event.relatedTarget;
      if (next instanceof Node && panelRef()?.contains(next)) return;
      queueMicrotask(() => {
        if (mobileOpen && !holdsFocus()) focusFirst();
      });
    }
    const watcher = new MutationObserver(() => {
      if (!holdsFocus()) focusFirst();
    });
    function closeAfterNavigation() {
      setMobileOpen(false);
    }
    function closeOnDesktop(event: MediaQueryListEvent) {
      if (event.matches) setMobileOpen(false);
    }
    document.body.style.overflow = "hidden";
    focusFirst();
    document.addEventListener("keydown", keydown);
    document.addEventListener("focusin", containFocus);
    document.addEventListener("focusout", keepFocus);
    if (panel) watcher.observe(panel, { childList: true, subtree: true });
    window.addEventListener("popstate", closeAfterNavigation);
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      watcher.disconnect();
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("focusin", containFocus);
      document.removeEventListener("focusout", keepFocus);
      window.removeEventListener("popstate", closeAfterNavigation);
      desktop.removeEventListener("change", closeOnDesktop);
      document.body.style.overflow = previousOverflow;
      if (returnFocus?.isConnected && returnFocus.getClientRects().length)
        returnFocus.focus({ preventScroll: true });
    };
  }, [mobileOpen]);

  // With ten workspaces the expanded client can open below the fold, hiding its own destinations.
  useEffect(() => {
    activeEntry.current?.scrollIntoView({ block: "nearest" });
  }, [pathname]);

  useEffect(() => {
    if (!loading && !session)
      router.replace(`/login?returnTo=${encodeURIComponent(pathname + window.location.search)}`);
  }, [session, loading, router, pathname]);
  if (loading || !session)
    return (
      <main className="centered-state" role="status">
        Opening your workspace…
      </main>
    );
  if (error || !profile)
    return (
      <main className="centered-state">
        <h1>We couldn’t open your workspace.</h1>
        <p>Please try again, or ask your studio contact for help.</p>
        <button className="button" onClick={() => window.location.reload()}>
          Try again
        </button>
      </main>
    );
  const activeClientId = pathname.match(/\/clients\/([^/]+)/)?.[1] ?? projectClient.data?.client_id;
  const activeClient = clients.data?.find((client) => client.id === activeClientId);
  const homeLabel =
    profile.role === "agency" ? "Overview" : profile.role === "designer" ? "My work" : "Home";
  const studioName = settings.data?.studio_name || "Brianna Dawes Studios";
  const clientTabs = [
    { path: "board", label: "Board" },
    { path: "briefings", label: "Briefings" },
    { path: "reviews", label: "Reviews" },
    { path: "assets", label: "Assets" },
    { path: "brand/overview", label: "Brand Hub" },
    ...(profile.role !== "designer" ? [{ path: "credits", label: "Credits" }] : []),
  ];

  return (
    <div
      className={`application ${collapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "mobile-sidebar-open" : ""}`}
    >
      <nav aria-label="Accessibility">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
      </nav>
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          tabIndex={-1}
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div
        id="workspace-navigation"
        ref={sidebar}
        className="sidebar"
        role={mobileOpen ? "dialog" : "complementary"}
        aria-modal={mobileOpen || undefined}
        aria-label="Workspace navigation"
        onClickCapture={(event) => {
          if (mobileOpen && event.target instanceof Element && event.target.closest("a[href]"))
            setMobileOpen(false);
        }}
      >
        <Link href="/home" className="brand-link" aria-label={`${studioName} home`}>
          <Image
            src="/brand/logo.webp"
            alt={studioName}
            width={2409}
            height={619}
            sizes="166px"
            className="brand-logo"
          />
        </Link>
        <button
          className="icon-button mobile-sidebar-close"
          aria-label="Close workspace navigation"
          onClick={() => setMobileOpen(false)}
        >
          <X size={18} />
        </button>
        <button
          className="icon-button sidebar-collapse"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed(!collapsed)}
        >
          <PanelLeftClose size={17} />
        </button>
        <nav aria-label="Main navigation">
          <Link
            className={`nav-item ${pathname === "/home" ? "active" : ""}`}
            aria-current={pathname === "/home" ? "page" : undefined}
            href="/home"
          >
            <Home size={17} />
            <span>{homeLabel}</span>
          </Link>
          <Link
            className={`nav-item ${pathname === "/search" ? "active" : ""}`}
            aria-current={pathname === "/search" ? "page" : undefined}
            href="/search"
          >
            <Search size={17} />
            <span>Search</span>
            <kbd>⌘ K</kbd>
          </Link>
          <div className="nav-section-label">WORKSPACES</div>
          <div className="client-navigation">
            {clients.data?.map((client) => {
              const open = activeClientId === client.id;
              return (
                <div
                  key={client.id}
                  ref={open ? activeEntry : undefined}
                  className={`client-entry ${open ? "expanded" : ""}`}
                >
                  <Link
                    href={`/clients/${client.id}/board`}
                    title={client.name}
                    className={`nav-item client-nav ${open ? "active" : ""}`}
                    aria-current={open ? "location" : undefined}
                  >
                    <span className="client-initials" aria-hidden="true">
                      {client.initials || client.name.slice(0, 2)}
                    </span>
                    <span>{client.name}</span>
                    <span className="client-chevron" aria-hidden="true">
                      {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </span>
                  </Link>
                  {open && (
                    <nav className="client-destinations" aria-label={`${client.name} navigation`}>
                      {clientTabs.map((item) => {
                        const active = pathname.includes(
                          `/clients/${client.id}/${item.path.split("/")[0]}`,
                        );
                        return (
                          <Link
                            key={item.path}
                            href={`/clients/${client.id}/${item.path}`}
                            className={`client-destination ${active ? "active" : ""}`}
                            aria-current={active ? "page" : undefined}
                          >
                            {item.label}
                          </Link>
                        );
                      })}
                    </nav>
                  )}
                </div>
              );
            })}
          </div>
        </nav>
        <div className="sidebar-footer">
          {profile.role === "agency" && (
            <Link
              href="/settings"
              className={`nav-item ${pathname === "/settings" ? "active" : ""}`}
            >
              <Settings2 size={17} />
              <span>Studio settings</span>
            </Link>
          )}
          {profile.role === "agency" && (
            /* The same page Studio settings opens on its Team tab, given a way in of its own:
               who is in the studio is a thing you look for by name, not a setting you tune. */
            <Link
              href="/settings/team"
              className={`nav-item ${pathname === "/settings/team" ? "active" : ""}`}
            >
              <Users size={17} />
              <span>Team</span>
            </Link>
          )}
          <button
            className="nav-item"
            onClick={() => {
              setMobileOpen(false);
              setHelpOpen(true);
            }}
          >
            <CircleHelp size={17} />
            <span>Help & support</span>
          </button>
          <div className="profile-bar">
            <Link
              href="/settings/account"
              className="profile-account"
              aria-label={`Account settings for ${profile.display_name}`}
            >
              <span className="profile-avatar" aria-hidden="true">
                {profile.display_name
                  .split(" ")
                  .map((value) => value[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <div className="profile-account-copy">
                <strong>{profile.display_name}</strong>
                <span>
                  {profile.role === "agency"
                    ? "Studio team"
                    : profile.role === "designer"
                      ? "Creative partner"
                      : "Client workspace"}
                </span>
              </div>
            </Link>
          </div>
          <button
            className="nav-item"
            onClick={async () => {
              setMobileOpen(false);
              await database.auth.signOut();
              router.replace("/login");
            }}
          >
            <LogOut size={17} />
            <span>Sign out</span>
          </button>
        </div>
      </div>
      <div className="workspace" inert={mobileOpen || undefined}>
        <header className="topbar">
          <button
            ref={menuButton}
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            aria-controls="workspace-navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={20} />
          </button>
          {/* Inside a client workspace the page titles itself — the board with that client's own
              mark and name — so the topbar carries only the global actions. */}
          {!activeClient && (
            <div className="topbar-identity">
              <Layers3 size={16} />
              <strong>{studioName}</strong>
            </div>
          )}
          <div className="topbar-actions">
            <NotificationsBell />
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1} ref={mainContent}>
          {children}
        </main>
      </div>
      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Help & support"
        footer={
          <button className="button primary" onClick={() => setHelpOpen(false)}>
            Done
          </button>
        }
      >
        <div className="form-stack">
          <p>
            Open a project to message the studio. Select a design to add feedback or place a comment
            pin.
          </p>
          <p>For account access or a new workspace, contact your studio representative.</p>
        </div>
      </Modal>
    </div>
  );
}

"use client";

import { Home, Menu, PanelLeftClose, Settings2, Users, X } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSelectedLayoutSegments } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { consumePostSignInFocus } from "@/features/auth/post-sign-in-focus";
import { CanvasHeader, StudioHeader } from "./canvas-header";
import { ClientIdentityProvider } from "./client-identity";
import { PageStatus } from "@/features/shared/page-status";
import { useWorkspaceSettings } from "@/features/workspace/workspace-settings";
import { BrandMark } from "@/features/shared/brand-mark";
import { AnimatedFavicon } from "./animated-favicon";
import { ClientSwitcher } from "./client-switcher";
import { FontToggle } from "./font-toggle";
import { ThemeToggle } from "./theme-toggle";
import { useClients, useProjectClient } from "./workspace-data";
import "./workspace.css";

/**
 * Lets a page fold the sidebar while it needs the width (the project page's Miro mode). The call
 * collapses it and returns the restore; the person can still expand it by hand meanwhile.
 */
const SidebarFold = createContext<() => () => void>(() => () => {});

export function useFoldSidebarWhile(active: boolean) {
  const fold = useContext(SidebarFold);
  useEffect(() => (active ? fold() : undefined), [active, fold]);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, error } = useAuth();
  const clients = useClients();
  const settings = useWorkspaceSettings();
  const pathname = usePathname();
  // Read the primary slot: opening an intercepted briefing must keep the board shell underneath.
  const segments = useSelectedLayoutSegments();
  const boardRoute = segments[0] === "clients" && segments.at(-1) === "board";
  const canvasRoute = boardRoute || segments[0] === "projects";
  // Every project link in the product targets /projects/:id, which carries no client segment, so
  // the workspace has to be resolved from the project or the sidebar folds shut on arrival.
  const projectClient = useProjectClient(pathname.match(/^\/projects\/([^/]+)/)?.[1]);
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const collapsedNow = useRef(collapsed);
  useEffect(() => {
    collapsedNow.current = collapsed;
  }, [collapsed]);
  const foldSidebar = useCallback(() => {
    const before = collapsedNow.current;
    setCollapsed(true);
    return () => setCollapsed(before);
  }, []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLDivElement>(null);
  const mainContent = useRef<HTMLElement>(null);
  const clientChrome = useRef<HTMLDivElement>(null);
  const focusHandled = useRef(false);

  useEffect(() => {
    if (!canvasRoute) mainContent.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname, canvasRoute]);

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
          'a[href],button:not([disabled]),input:not([disabled]),[tabindex="0"]',
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
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        if (event.target instanceof Element && event.target.closest(".client-switcher-panel"))
          return;
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

  useEffect(() => {
    if (!loading && !session)
      router.replace(`/login?returnTo=${encodeURIComponent(pathname + window.location.search)}`);
  }, [session, loading, router, pathname]);
  const activeClientId = pathname.match(/\/clients\/([^/]+)/)?.[1] ?? projectClient.data?.client_id;
  const activeClient = clients.data?.find((client) => client.id === activeClientId);
  const chromeShown = !canvasRoute;
  // The client header is sticky over the page; its measured height becomes the scroller's
  // scroll-padding, so anything scrolled into view (a validation summary, a step) lands below it.
  useEffect(() => {
    const chrome = clientChrome.current;
    const scroller = chrome?.parentElement;
    if (!chrome || !scroller || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(() =>
      scroller.style.setProperty("--client-chrome-height", `${chrome.offsetHeight}px`),
    );
    observer.observe(chrome);
    return () => observer.disconnect();
  }, [chromeShown]);
  const studioName = settings.data?.studio_name || "Brianna Dawes Studios";
  // The tab names the client first inside a client workspace, then the studio: "Client | Studio".
  const tabTitle = activeClient ? `${activeClient.name} | ${studioName}` : studioName;
  // Next.js re-applies the root metadata title on in-app navigation, so the shell puts its own back
  // whenever the head's <title> changes.
  useEffect(() => {
    const apply = () => {
      if (document.title !== tabTitle) document.title = tabTitle;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [tabTitle]);
  // The shell's wait and the first route's wait are the same navigation, so they render the same
  // component in the same layout rather than two descriptions of one wait in two frames.
  // `centered-state` stays for the pre-shell routes and for the app-level failure below.
  if (loading || !session)
    return (
      <main className="main-content">
        <PageStatus>Loading your workspace…</PageStatus>
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
  // Inside a client workspace the sidebar's first item is that client's Overview (the top navigation
  // has none); elsewhere it is the viewer's home. Designers have no client Overview.
  const clientOverview =
    activeClient && profile.role !== "designer" ? `/clients/${activeClient.id}/overview` : null;
  const homeHref = clientOverview ?? "/home";
  const homeLabel = clientOverview
    ? "Overview"
    : profile.role === "agency"
      ? "Overview"
      : profile.role === "designer"
        ? "My work"
        : "Home";

  return (
    <SidebarFold.Provider value={foldSidebar}>
      <div
        className={`application ${activeClient ? "has-client-context" : ""} ${canvasRoute ? "board-workspace" : ""} ${collapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "mobile-sidebar-open" : ""}`}
      >
        <AnimatedFavicon />
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
            <BrandMark />
            <Image
              src="/brand/wordmark.webp"
              alt=""
              width={1820}
              height={619}
              sizes="126px"
              className="brand-wordmark"
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
          <ClientSwitcher
            key={pathname}
            clients={clients.data ?? []}
            activeClientId={activeClientId}
            loading={clients.isPending}
            failed={clients.isError}
            onRetry={() => void clients.refetch()}
          />
          <nav aria-label="Main navigation">
            <Link
              className={`nav-item ${pathname === homeHref ? "active" : ""}`}
              aria-current={pathname === homeHref ? "page" : undefined}
              href={homeHref}
            >
              <Home size={17} />
              <span>{homeLabel}</span>
            </Link>
          </nav>
          <div className="sidebar-footer">
            {profile.role === "agency" && (
              <Link
                href="/settings"
                className={`nav-item ${pathname.startsWith("/settings") && pathname !== "/settings/account" ? "active" : ""}`}
                aria-current={
                  pathname.startsWith("/settings") && pathname !== "/settings/account"
                    ? "location"
                    : undefined
                }
              >
                <Settings2 size={17} />
                <span>Studio settings</span>
              </Link>
            )}
            {profile.role === "agency" && (
              <Link
                href="/team"
                className={`nav-item ${pathname === "/team" ? "active" : ""}`}
                aria-current={pathname === "/team" ? "page" : undefined}
              >
                <Users size={17} />
                <span>Team</span>
              </Link>
            )}
            <FontToggle />
            <ThemeToggle />
          </div>
        </div>
        {/* Every page shares the floating header cards; each canvas owns its own placement. */}
        <div
          className={`workspace ${activeClient ? "client-workspace" : ""} ${canvasRoute ? "" : "card-workspace"}`}
          inert={mobileOpen || undefined}
        >
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
          </header>
          <ClientIdentityProvider>
            <main id="main-content" className="main-content" tabIndex={-1} ref={mainContent}>
              {chromeShown && (
                <div className="page-chrome" ref={clientChrome}>
                  {activeClient ? (
                    <CanvasHeader
                      client={activeClient}
                      viewer={profile}
                      showIdentity={pathname !== clientOverview}
                    />
                  ) : (
                    <StudioHeader studioName={studioName} viewer={profile} />
                  )}
                </div>
              )}
              {children}
            </main>
          </ClientIdentityProvider>
        </div>
      </div>
    </SidebarFold.Provider>
  );
}

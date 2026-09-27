"use client";

import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { CreditActionDialog } from "@/features/credits/credit-actions";
import { CreditMeterPanel, CreditRing, useCreditMeter } from "@/features/credits/credit-meter";
import { formatCredits } from "@/features/credits/credit-model";
import type { Profile } from "@/lib/supabase";

const HOVER_OPEN_DELAY = 120;
const HOVER_CLOSE_DELAY = 220;

/**
 * The signed-in viewer's avatar in the shared header, ringed by the current month's remaining
 * credits (the header's credits chip; the ring turns to the attention tone when credits expire
 * within the month's last 7 days), with
 * a menu that opens on hover (mouse) or click/tap/Enter: profile, the Credits block, account
 * settings and sign out. Designers get the same menu without the ring or the Credits block. It is a
 * native nonmodal popover, like the notifications feed, so it stays above the canvas.
 */
export function AccountMenu({ clientId, viewer }: { clientId: string; viewer: Profile | null }) {
  const id = useId();
  const pathname = usePathname();
  const router = useRouter();
  const { database } = useAuth();
  const meter = useCreditMeter(clientId, viewer);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  // Opened by hovering: it closes again when the pointer leaves. A click pins it open.
  const fromHover = useRef(false);
  const [open, setOpen] = useState(false);
  const [creditAction, setCreditAction] = useState<"request" | "adjust" | null>(null);

  const name = viewer?.display_name || "Your account";
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  // In the current month's last 7 days the trigger also says what is about to expire.
  const expiring = meter?.expiring && formatCredits(meter.expiring.amount);
  const triggerLabel = `Account menu: ${name}${expiring ? `. ${expiring.amount} ${expiring.word} expiring this month` : ""}`;
  const roleLabel =
    viewer?.role === "agency" ? "Studio team" : viewer?.role === "designer" ? "Designer" : "Client";

  function position() {
    const anchor = trigger.current?.closest(".board-account")?.getBoundingClientRect();
    const element = popup.current;
    if (!anchor || !element) return;
    const width = Math.min(300, window.innerWidth - 24);
    const top = anchor.bottom + 8;
    element.style.width = `${width}px`;
    element.style.left = `${Math.max(12, Math.min(anchor.right - width, window.innerWidth - width - 12))}px`;
    element.style.top = `${top}px`;
    element.style.maxHeight = `${Math.max(100, window.innerHeight - top - 12)}px`;
  }
  function show(hover: boolean) {
    fromHover.current = hover;
    if (popup.current?.matches(":popover-open")) return;
    position();
    popup.current?.showPopover?.();
  }
  function hide() {
    popup.current?.hidePopover?.();
  }
  function schedule(action: () => void, delay: number) {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(action, delay);
  }

  useEffect(() => hide(), [pathname]);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  useEffect(() => {
    if (!open) return;
    const observer = new ResizeObserver(position);
    if (trigger.current) observer.observe(trigger.current);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  const avatar = (size: number, className: string) => (
    <CreditRing meter={meter} size={size}>
      <span className={className} aria-hidden="true">
        {viewer?.avatar_url ? (
          // The signed-in viewer's avatar can be a private URL; avoid the shared image cache.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={viewer.avatar_url} alt="" />
        ) : (
          initials
        )}
      </span>
    </CreditRing>
  );

  return (
    <div
      className="account-menu"
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse") return;
        if (open) window.clearTimeout(hoverTimer.current);
        else schedule(() => show(true), HOVER_OPEN_DELAY);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        if (open && !fromHover.current) window.clearTimeout(hoverTimer.current);
        else schedule(hide, HOVER_CLOSE_DELAY);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="board-profile"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        aria-label={triggerLabel}
        onClick={() => {
          window.clearTimeout(hoverTimer.current);
          if (open && fromHover.current) fromHover.current = false;
          else if (open) hide();
          else show(false);
        }}
      >
        {avatar(38, "board-profile-avatar")}
        <span className="board-profile-name">{name}</span>
      </button>
      <div
        ref={popup}
        id={id}
        popover="auto"
        role="dialog"
        aria-label="Account"
        className="account-menu-popover"
        onToggle={(event) => {
          const next = event.newState === "open";
          setOpen(next);
        }}
      >
        <div className="account-menu-identity">
          {avatar(48, "board-profile-avatar account-menu-avatar")}
          <div>
            <strong>{name}</strong>
            <span>{roleLabel}</span>
          </div>
        </div>
        {meter && viewer && (
          <CreditMeterPanel
            clientId={clientId}
            role={viewer.role}
            meter={meter}
            onNavigate={hide}
            onAction={(mode) => {
              hide();
              setCreditAction(mode);
            }}
          />
        )}
        <div className="account-menu-links">
          <Link href="/settings/account" onClick={hide}>
            <Settings size={16} aria-hidden="true" />
            <span>Account settings</span>
          </Link>
          <button
            type="button"
            onClick={async () => {
              hide();
              await database.auth.signOut();
              router.replace("/login");
            }}
          >
            <LogOut size={16} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
      {creditAction && (
        <CreditActionDialog
          clientId={clientId}
          mode={creditAction}
          onClose={() => setCreditAction(null)}
        />
      )}
    </div>
  );
}

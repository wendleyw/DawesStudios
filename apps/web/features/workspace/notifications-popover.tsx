"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { NotificationsBell } from "./notifications-bell";
import { NotificationFeed } from "./notification-feed";

/** A native nonmodal popover keeps the feed above canvas and sticky page containers. */
export function NotificationsPopover() {
  const id = useId();
  const pathname = usePathname();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  function position() {
    const anchor = trigger.current?.closest(".board-account")?.getBoundingClientRect();
    const element = popup.current;
    if (!anchor || !element) return;
    const width = Math.min(400, window.innerWidth - 24);
    const top = anchor.bottom + 8;
    element.style.width = `${width}px`;
    element.style.left = `${Math.max(12, Math.min(anchor.right - width, window.innerWidth - width - 12))}px`;
    element.style.top = `${top}px`;
    element.style.maxHeight = `${Math.max(100, window.innerHeight - top - 12)}px`;
  }
  useEffect(() => {
    popup.current?.hidePopover?.();
  }, [pathname]);
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
  function close() {
    popup.current?.hidePopover?.();
    trigger.current?.focus({ preventScroll: true });
  }
  return (
    <>
      <NotificationsBell
        buttonRef={trigger}
        controls={id}
        expanded={open}
        onClick={() => {
          position();
          popup.current?.togglePopover();
        }}
      />
      <div
        ref={popup}
        id={id}
        popover="auto"
        role="dialog"
        aria-label="Notifications"
        className="notifications-popover"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
        onToggle={(event) => {
          const next = event.newState === "open";
          setOpen(next);
          if (next) closeButton.current?.focus({ preventScroll: true });
        }}
      >
        <header>
          <h2>Notifications</h2>
          <button
            ref={closeButton}
            className="icon-button"
            aria-label="Close notifications"
            onClick={close}
          >
            <X size={17} />
          </button>
        </header>
        {open && <NotificationFeed compact />}
        <Link className="notifications-popover-footer" href="/notifications" onClick={close}>
          View all notifications
        </Link>
      </div>
    </>
  );
}

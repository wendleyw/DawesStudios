"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { ClientMark } from "./client-mark";
import type { Client } from "./workspace-data";

type Position = {
  clientId: string;
  placement: "overview" | "navigation";
  rect: DOMRect;
  capturedAt: number;
  consumed: boolean;
};

const IdentityPosition = createContext<RefObject<Position | null> | null>(null);

/** Keep only the departing logo's geometry across routes, never a second rendered logo. */
export function ClientIdentityProvider({ children }: { children: ReactNode }) {
  const position = useRef<Position | null>(null);
  return <IdentityPosition.Provider value={position}>{children}</IdentityPosition.Provider>;
}

export function ClientIdentity({
  client,
  href,
  placement = "navigation",
}: {
  client: Client;
  href: string;
  placement?: Position["placement"];
}) {
  const position = useContext(IdentityPosition);
  const link = useRef<HTMLAnchorElement>(null);

  useLayoutEffect(() => {
    const node = link.current;
    if (!node || !position) return;
    const previous = position.current;
    let animation: Animation | undefined;
    let rendered = false;
    // Measure after the new route's layout settles, including its floating navigation.
    const frame = requestAnimationFrame(() => {
      const to = node.getBoundingClientRect();
      rendered = to.width > 0 && to.height > 0;
      if (
        !previous ||
        previous.consumed ||
        previous.clientId !== client.id ||
        previous.placement === placement ||
        performance.now() - previous.capturedAt > 2000 ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        !node.animate
      )
        return;
      const from = previous.rect;
      if (
        !from.width ||
        !from.height ||
        !to.width ||
        !to.height ||
        from.bottom <= 0 ||
        from.top >= window.innerHeight
      )
        return;
      previous.consumed = true;
      animation = node.animate(
        [
          {
            transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.width / to.width}, ${from.height / to.height})`,
          },
          { transform: "none" },
        ],
        { duration: 460, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    });
    return () => {
      // Strict Mode can clean up before the first frame; hidden route-cache entries have no
      // geometry. Neither should replace the last visible departure or replay an old move.
      if (rendered)
        position.current = {
          clientId: client.id,
          placement,
          rect: node.getBoundingClientRect(),
          capturedAt: performance.now(),
          consumed: false,
        };
      cancelAnimationFrame(frame);
      animation?.cancel();
    };
  }, [client.id, placement, position]);

  return (
    <Link ref={link} className="board-identity-logo" href={href} title={client.name}>
      <ClientMark client={client} className="board-identity-mark" alt={client.name} />
    </Link>
  );
}

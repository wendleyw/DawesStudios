import type { ReactNode } from "react";

/** "Welcome back, Beth" from "Beth Morgan"; just "Welcome back" when there is no name. */
export function welcomeTitle(displayName: string | null | undefined): string {
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? `Welcome back, ${first}` : "Welcome back";
}

/**
 * The greeting at the top of a dashboard: the page's role name as an eyebrow, the greeting, a
 * subtitle and the page's actions. On a client route it is the white client header card; on `/home`
 * it keeps that page's plain heading. Callers wrap `actions` in their own container.
 */
export function WelcomeHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  card = false,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  card?: boolean;
}) {
  return (
    <header className={card ? "page-heading client-page-heading" : "page-heading"}>
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

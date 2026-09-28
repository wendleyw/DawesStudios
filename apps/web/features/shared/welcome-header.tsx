import type { ReactNode } from "react";

/** "Welcome back, Beth" from "Beth Morgan"; just "Welcome back" when there is no name. */
export function welcomeTitle(displayName: string | null | undefined): string {
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? `Welcome back, ${first}` : "Welcome back";
}

/**
 * The greeting at the top of a dashboard: the page's role name as an eyebrow, the greeting, a
 * subtitle and the page's actions, in the white title card every page shares. Callers wrap `actions`
 * in their own container.
 */
export function WelcomeHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-heading card-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

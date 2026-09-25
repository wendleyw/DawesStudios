import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Children, useId, type ReactNode } from "react";

/** One dashboard column: an eyebrow, a title, an optional "See all" and up to five one-line rows. */
export function OverviewPanel({
  eyebrow,
  title,
  seeAll,
  empty,
  children,
}: {
  eyebrow: string;
  title: string;
  seeAll?: string;
  empty: string;
  children?: ReactNode;
}) {
  const id = useId();
  const rows = Children.toArray(children);
  return (
    <section className="overview-panel" aria-labelledby={id}>
      <header className="overview-panel-head">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2 id={id}>{title}</h2>
        </div>
        {seeAll && (
          <Link className="overview-see-all" href={seeAll} aria-label={`${title}: see all`}>
            See all <ArrowRight size={14} />
          </Link>
        )}
      </header>
      {rows.length ? rows : <p className="overview-empty">{empty}</p>}
    </section>
  );
}

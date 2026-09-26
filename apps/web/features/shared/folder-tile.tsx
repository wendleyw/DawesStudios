import { Folder } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * One folder in a directory view: an icon, its name and a count, compact and the same everywhere.
 * A route opens it as a link (Files campaigns); an in-page directory opens it with `onOpen`
 * (Brand Hub Assets). Consumers: `assets/assets-page`, `brand/brand-assets`.
 */
export function FolderTile({
  name,
  meta,
  href,
  onOpen,
  icon = <Folder size={20} aria-hidden="true" />,
}: {
  name: string;
  meta: ReactNode;
  href?: string;
  onOpen?: () => void;
  icon?: ReactNode;
}) {
  const body = (
    <>
      <span className="folder-tile-icon">{icon}</span>
      <span className="folder-tile-text">
        <strong>{name}</strong>
        <span>{meta}</span>
      </span>
    </>
  );
  return href ? (
    <Link className="folder-tile" href={href}>
      {body}
    </Link>
  ) : (
    <button type="button" className="folder-tile" onClick={onOpen}>
      {body}
    </button>
  );
}

import { Search } from "lucide-react";
import type { RefObject } from "react";

/**
 * The search input used by the board, the workspace search and the list pages.
 * The label wraps the icon and the input so the whole control stays clickable,
 * and the input always carries its own accessible name.
 */
export function SearchField({
  label,
  value,
  onChange,
  placeholder,
  iconSize,
  className,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  iconSize: number;
  className?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <label className={className ? `search-field ${className}` : "search-field"}>
      <Search size={iconSize} />
      <input
        ref={inputRef}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

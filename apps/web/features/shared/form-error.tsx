import type { ReactNode } from "react";

/**
 * The inline error paragraph used by forms, dialogs and data-loading failures.
 * It pairs the `form-error` style with `role="alert"` so the message is always
 * announced by assistive technology.
 */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p className="form-error" role="alert">
      {children}
    </p>
  );
}

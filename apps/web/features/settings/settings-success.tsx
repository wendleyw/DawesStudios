import type { ReactNode } from "react";

/**
 * `<p className="settings-success" role="status">{children}</p>`. The inline success message shown
 * after a settings save, invite or reset completes.
 *
 * `shared/README.md` evaluated this markup and rejected it for `features/shared/`: every one of its
 * 8 call sites is inside `features/settings`, so it belongs here rather than in a directory reserved
 * for primitives with two or more consuming features. It is still worth its own component within
 * this feature, on the same grounds as `FormError` in `features/shared/form-error.tsx`: the markup is
 * fixed and the only variation is the message.
 */
export function SettingsSuccess({ children }: { children: ReactNode }) {
  return (
    <p className="settings-success" role="status">
      {children}
    </p>
  );
}

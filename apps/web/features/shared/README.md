# Shared UI primitives

Everything in this directory is used by **two or more features**. The consumer
list under each entry is the justification for the primitive living here: a
primitive that drops to a single consumer should move back into that feature.

A candidate only becomes a shared primitive when the shared markup is the
substance of the call site — the component body is fixed markup and the
variation is leaf values. A container class wrapped around arbitrary children is
not a primitive; it adds an import and an indirection without removing
duplication.

Each primitive reproduces the markup, class names and accessibility attributes
its consumers used before extraction, exactly. Where consumers differ, the
difference is a prop, never a normalisation.

## Components

### `Modal` — `modal.tsx`

The native `<dialog>` overlay: focus trap, scroll lock, focus restore on close
and light dismiss.

| Prop              | Type                             | Default | Notes                                                |
| ----------------- | -------------------------------- | ------- | ---------------------------------------------------- |
| `open`            | `boolean`                        | —       | Opens and closes the dialog.                         |
| `onClose`         | `() => void`                     | —       | Called by the close button, Escape and the backdrop. |
| `title`           | `string`                         | —       | Labels the dialog through `aria-labelledby`.         |
| `description`     | `string`                         | —       | Describes it through `aria-describedby`.             |
| `children`        | `ReactNode`                      | —       | The dialog body.                                     |
| `footer`          | `ReactNode`                      | —       | The action row.                                      |
| `size`            | `"sm" \| "md" \| "lg"`           | `"md"`  | Width class.                                         |
| `initialFocusRef` | `RefObject<HTMLElement \| null>` | —       | Element focused on open.                             |

Consumers: `assets/assets-page`, `assets/upload-file-dialog`,
`brand/brand-assets`, `brand/section-editor`, `campaigns/campaign-dialog`,
`credits/credit-actions`, `credits/credits-page`,
`projects/project-action-dialog`, `projects/project-details`,
`settings/campaign-settings`, `settings/client-settings`,
`settings/preset-settings`, `settings/team-settings`, `shared/copy-button`,
`workspace/app-shell`.

### `CopyButton` — `copy-button.tsx`

Copies text to the clipboard, announces the result, and falls back to a
selectable textarea in a `Modal` when the clipboard is unavailable.

| Prop        | Type     | Default          |
| ----------- | -------- | ---------------- |
| `text`      | `string` | —                |
| `label`     | `string` | `"Copy"`         |
| `className` | `string` | `"button quiet"` |

Consumers: `brand/brand-assets`, `brand/brand-sections`,
`projects/project-details`.

### `FormError` — `form-error.tsx`

`<p className="form-error" role="alert">{children}</p>`. The inline error
paragraph used by forms, dialogs and data-loading failures. It pairs the
`form-error` style with `role="alert"` so the message is always announced.

| Prop       | Type        | Default |
| ---------- | ----------- | ------- |
| `children` | `ReactNode` | —       |

Consumers (46 call sites in 27 files): `assets/assets-page`,
`assets/upload-file-dialog`, `auth/login-page`, `board/board-page`,
`brand/brand-assets`, `brand/brand-templates`, `brand/draft-editor`,
`brand/section-editor`, `briefings/briefing-attachments`,
`briefings/briefing-detail`, `briefings/briefing-editor`,
`briefings/briefings-page`, `campaigns/campaign-dialog`,
`credits/credit-actions`, `credits/credits-page`, `projects/comment-panel`,
`projects/project-action-dialog`, `projects/project-details`,
`settings/account-recovery`, `settings/account-settings`,
`settings/campaign-settings`, `settings/client-settings`,
`settings/invitation-acceptance`, `settings/preset-settings`,
`settings/team-settings`, `settings/workspace-settings`,
`workspace/notifications-page`.

Three `form-error` paragraphs are deliberately **not** `FormError`:
`workspace/search-page` and `workspace/notifications-page` nest theirs inside a
`<div role="alert">` that already announces the whole block, and
`briefings/briefing-detail` shows a standing balance note that is not an alert.
Turning those into `FormError` would add a live region each site does not have
today.

### `PageStatus` — `page-status.tsx`

`<div className="page-content" role="status">{children}</div>`. The full-page
status message shown while a route loads its data.

| Prop       | Type        | Default |
| ---------- | ----------- | ------- |
| `children` | `ReactNode` | —       |

Consumers: `assets/assets-page`, `board/board-page`, `brand/brand-page`,
`brand/draft-editor`, `briefings/briefing-detail`, `briefings/briefing-editor`,
`briefings/briefings-page`, `credits/credits-page`, `projects/project-page`,
`reviews/reviews-page`, `settings/settings-page`, `workspace/home-page`.

### `SearchField` — `search-field.tsx`

The search input of the board and the list pages: a `label.search-field`
wrapping the magnifier icon and the input, so the whole control is clickable and
the input always carries its own accessible name.

| Prop          | Type                                  | Default | Notes                                                                                                   |
| ------------- | ------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| `label`       | `string`                              | —       | The input's `aria-label`.                                                                               |
| `value`       | `string`                              | —       |                                                                                                         |
| `onChange`    | `(value: string) => void`             | —       | Receives the new input value.                                                                           |
| `placeholder` | `string`                              | —       |                                                                                                         |
| `iconSize`    | `number`                              | —       | Required: the icon size differs per page (15–20) and is preserved per call site rather than normalised. |
| `className`   | `string`                              | —       | Appended to `search-field`.                                                                             |
| `inputRef`    | `RefObject<HTMLInputElement \| null>` | —       | For pages that focus the field on mount.                                                                |

Consumers: `assets/assets-page`, `board/board-page`, `brand/brand-assets`,
`brand/brand-templates`, `credits/credits-page`, `workspace/search-page`.

## Non-component modules

| Module          | Purpose                                                                           | Consumers                                      |
| --------------- | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| `canvas-fit.ts` | Viewport fit maths for the board and project canvases.                            | `board/board-layout`, `projects/canvas-layout` |
| `forms.css`     | The `stack-form`, `form-row`, `checkbox-label` and `form-actions` layout classes. | Loaded once globally by `app/layout.tsx`.      |

## Repository-wide invariant tests

Two test files live here because the invariant they check spans every feature, so
there is no single feature that owns them.

| Test                            | Invariant                                                                                                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stylesheet-boundary.test.ts`   | No two feature stylesheets declare the same selector, which is what makes their global load order irrelevant.                                                                                                        |
| `invalidation-boundary.test.ts` | Cache keys are declared once, in the owning feature's `<feature>-data.ts`, and composed at the call site — so an invalidation set cannot silently widen. See [rule 5](../../../../docs/architecture/data-access.md). |

`invalidation-boundary.test.ts` checks four things: that no file outside a
`*-data.ts` module invalidates a bare string-literal query key (with a small
allowlist that names both the call site and the key, and that fails once that
call site stops using it); that the one keyless whole-cache clear, in
`settings/invitation-acceptance.tsx`, stays the only one; that the five-key
realtime fan-out in `projects/project-events.ts` is pinned, since it matches no
exported key set and has no non-widening constant to route through; and that
`brandQueryKeys`, `briefingQueryKeys` and `assetQueryKeys` still hold the exact
strings their call sites were measured against.

## Candidates that were evaluated and rejected

Recorded so they are not re-proposed:

- **`empty-state`** (14 call sites) — only the wrapper `<div>` is common. The
  call sites differ in whether they have an icon, which icon and size, whether
  the heading is `h2` or `h3` or absent, whether there is a paragraph, and
  whether there is an action button. Reproducing them needs five
  content-injection props, at which point the component contributes one class
  name.
- **`centered-state`** (3 call sites) — a `<main>` wrapper around arbitrary
  children, one of which also carries `role="status"`.
- **`form-actions`** (6 call sites) — a `<div>` wrapper; the button rows differ
  in count, in `type="submit"` versus `onClick`, and in every label and disabled
  expression.
- **Plain `<p role="status">` loading text** (15 call sites) — a bare HTML
  element with one ARIA attribute and no class contract. There is no shared
  decision for the component to encapsulate.
- **`settings-success`** (8 call sites) — identical markup, but every consumer
  is inside `features/settings`. It belongs to that feature, not here.
- **`button`** — `className="button"` is a style, not a component; the children,
  handlers and types differ at every call site.
- **`field`** — no consumers. The class is not applied anywhere and is not
  defined in `forms.css`.

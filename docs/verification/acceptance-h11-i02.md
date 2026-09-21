# H11 and the I02 build half

Measured 2026-09-21 against `main` at `e3e2b64`, by production build and source inspection. **No
browser measurement was taken and none should be read in:** the container on `3003` was rebuilt at
21:09Z from the concurrent `feature/video-designs-and-feedback` branch, so it serves that tree. A
pass or failure observed there would describe the other branch.

## H11 — account and help actions are accurate; preview/reset controls are confined

> Account/help actions are accurate; preview/reset controls, if present, are confined to their
> documented safe purpose.

**Verdict: Verified.**

### The preview/reset clause is satisfied by absence

The requirement is conditional — *if present*. They are not present. The project instructions are
explicit that "prototype simulations, role previews, browser filters, and toast-only actions are not
production implementations", so the product was swept for exactly those:

| Searched for | Result |
| --- | --- |
| `view as`, `preview as`, `impersonat`, `simulate`, `switch role`, `act as` | **0 matches** in `features/` and `app/` |
| `reset demo`, `reset data`, `seed data`, `demo mode`, `factory reset` | **0 matches** in any `.tsx` |

The only `preview` hits in the product are `AssetPreview` in `brand/brand-assets.tsx:126` and `:188`,
which renders a brand asset image. That is an image preview, not a role preview, and it carries no
capability a viewer does not already hold.

Absence is the strongest form this clause can take: there is no control to confine, so there is
nothing that can drift out of its documented purpose.

### The help dialog makes three factual claims, and all three are true

The dialog lives at `workspace/app-shell.tsx:418-436`, opened from the `Help & support` entry at
`:344`. Its body makes three claims, each checked against the implementation rather than accepted as
copy:

| Claim | Verified against |
| --- | --- |
| "Open a project to message the studio." | `projects/comment-panel.tsx` renders a `client` channel labelled *"With the studio"* / *"Shared with the studio"* (`:80`, `:85`, `:185`), written through `post_comment` in `project-data.ts:350`. |
| "Select a design to add feedback or place a comment pin." | `projects/design-viewer.tsx` exposes `onPin` (`:26`, `:47`, `:54`, `:134`), and 18 client pins exist in the dataset. |
| "For account access or a new client, contact your studio representative." | `public.create_client` and `public.create_invitation` both open with `perform private.assert_agency()`. A client genuinely cannot self-serve either, so the dialog is directing them to the only path that exists. |

The third is the one worth stating plainly: the dialog could have been *politely wrong* — telling a
client to ask someone else for something they could in fact do themselves, or promising a route that
is closed. It is neither. `assert_agency()` appears 35 times across 14 migrations, and these two
functions are inside that set.

### Recorded limit

The dialog's content and its three claims were verified by reading the source and checking each claim
against the implementation. **The dialog was not opened in a browser today**, because no container
currently serves `main`. Its rendering is covered by the passing browser suite at `b3f4ea5`, and the
product code is unchanged since — the only `apps/` changes since that run are two `README.md` files —
but a click-through was not performed in this pass and is not claimed.

## I02 — the build and check half

> Production app build, type/lint checks, relevant domain/integration/browser tests all pass; no
> runtime console errors.

**Verdict: still Unverified, and the remaining gap is now narrower and named.**

Measured on `main` at `e3e2b64`:

| Check | Result |
| --- | --- |
| `npm run build` | **exit 0**, all routes compiled, static and dynamic segments as expected |
| Build diagnostics | no errors, no warnings from project code — the only warning is Node's `DEP0205 module.register()` deprecation, raised by a dependency |
| `npm run check` | **457 / 457** across 33 files |
| `npm run db:test` | **158** assertions across 6 files |
| `npm run test:e2e` | **25 / 25**, measured at `b3f4ea5` against a container built from `main` |

The row previously cited `e6b4fe8` with **444 unit tests in 32 files**; the current figures are 457
across 33, and a production build had not been run today at all until this pass.

**What still blocks it: runtime console errors have never been measured.** The requirement asks for
their absence, and no check in this repository looks for them — `design-audit.spec.ts` captures
responsive layout and accessibility, not console output. This is a missing measurement rather than a
known failure, and closing it needs a browser run against a container serving `main`, which also
resolves the staleness of the e2e figure above.

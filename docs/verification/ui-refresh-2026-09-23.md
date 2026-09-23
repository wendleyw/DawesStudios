# Unified UI and repository development verification

Verified on 2026-09-23 in `/Users/wendleywilson/DawesStudios`, serving
`http://localhost:3003`. This is a bounded visual and local-runtime revision, not completion of
the broader J10 production audit.

## Source and runtime

The active application belongs to this Git repository. The separate `CanvaDawes` checkout is a
different implementation; edits there cannot update this application. The previous Compose web
service used a compiled image without a source mount, which also required rebuilding after edits.

The final runtime is now `npm run dev` from this repository, using the existing ignored
`apps/web/.env.local`. Only the Compose web service was stopped. Supabase and the healthy trusted
media container remain available with the same configuration and data. No database reset or
canonical fixture provisioning was performed. Prior uncommitted work is preserved; no commit,
remote push or public deployment was performed.

A temporary CSS property was added to `apps/web/app/globals.css`, observed in the open browser
through live updates, and removed. The original stylesheet was restored byte for byte and the
property disappeared without navigating. See [repository runtime evidence](ui-refresh/repository-runtime.json).
The runtime-switch commands are documented in the [root README](../../README.md),
[web README](../../apps/web/README.md#development-from-the-repository) and
[operations guide](../operations/README.md#web-development-and-backend-containers).

## Delivered changes

- One neutral palette and shared typography, 40 px desktop gutter, 32 px section spacing and
  24 px panel padding; restrained white panels, 12 px panel corners and consistent controls.
- Matching underline navigation in Brand Hub, briefings, credits and settings, preserving their
  respective link/filter semantics. The shared primitive has four actual consumers.
- Consistent overview metrics, list/table treatments, forms, dialogs, genuine empty states,
  authentication panels and canvas headers. Feature rules remain in their owning stylesheets.
- The active client's menu scrolls into view after asynchronous context loads. Project routes
  retain Board selection, and nested studio settings retain the settings selection.
- Even mobile metric padding and a corrected word boundary in the mobile sign-in heading.
  Original navigation branding, artwork dimensions, canvas geometry, grid/pan/zoom behavior and
  Playground's darker canvas remain intact.

The design-audit test now derives campaign count and widget visibility from authorized live data.
Its earlier failures expected three campaigns and always-visible widgets, while this workspace had
four campaigns and saved hidden widgets. The correction validates the persisted state without
changing campaigns or viewer preferences; independent widget combinations remain covered by the
existing isolated widget suite.

## Executed checks

| Check | Final result |
| --- | --- |
| `npm run check` after the final source edit | 593 tests in 49 files passed; TypeScript and formatting passed; zero lint errors, one existing board hook warning |
| Production web rebuild and local preview | Built and served the visual revision successfully before switching to development |
| Focused production-preview browser suite | 7/7 passed in 39.4 s: layout/accessibility, Brand Hub, keyboard focus, three-role console coverage and workspace isolation |
| Responsive design audit | 38 captured surface/viewport combinations; zero document overflow and zero axe violations |
| Repository development browser smoke | Agency and client workspace journeys: 2/2 passed in 4.2 s |
| Additional development visual/a11y probe | 7 combinations passed: sign-in at 320/768 px, team/client settings/presets at 390 px, Playground at 1600/390 px |
| Live source update and active navigation | CSS update/removal observed; Brand Hub and project Board links selected and visible |

Focused browser command from the repository root:

```bash
npm --prefix apps/web run test:e2e -- design-audit.spec.ts brand-accessibility.spec.ts workspace.spec.ts console-errors.spec.ts --grep 'representative task surfaces|brand sections remain accessible|mobile navigation and shared dialogs|agency signs in|client sees only|no surface logs|own surfaces are equally quiet'
```

The development smoke used `workspace.spec.ts --grep 'agency signs in|client sees only'`. The
broader browser suite was not repeated after switching runtime. Automated accessibility results
apply to the states checked and do not establish complete accessibility conformance.

## Visual evidence

Before/after captures are in [ui-refresh](ui-refresh/). Desktop overview, board, project, Brand Hub,
credits, settings and team, plus mobile overview, settings, feedback, login and Playground were
manually inspected for hierarchy, spacing, reading order and clipping. The remaining layouts were
covered by browser assertions and screenshots.

- [Overview before](ui-refresh/before-home.png) / [after](ui-refresh/after-home.png)
- [Brand Hub after](ui-refresh/after-brand.png)
- [Settings after](ui-refresh/after-settings.png)
- [Mobile settings](screenshots/design-settings-390.png)
- [Mobile login](ui-refresh/after-login-320.png)
- [Responsive audit](design-audit.json)
- [Additional surfaces](ui-refresh/additional-surfaces.json)
- [Loaded tokens and navigation](ui-refresh/browser-evidence.json)

The superseded production preview image is
`sha256:440a7421533c4ec4fb9287adee76ec82d2bcdbfe2808b49c76c9f9999bfeae1d`.
It predates the final mobile-heading whitespace correction and is stopped; the live repository
development server contains the final source. Rebuild that optional preview before using it again.

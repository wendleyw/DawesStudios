# Themes, Dotted Canvas and Project Tool Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the whole product a System / Light / Dark theme, draw every xyflow canvas as a
Higgsfield-style dot grid with a horizontal zoom pill, move the project's tool icons into a bar at
the bottom of the canvas, and make the Playground rise from the bottom.

**Architecture:** Every colour becomes a `light-dark(<light>, <dark>)` pair, and `color-scheme` on
`<html>` chooses the side: `light dark` follows the operating system, `data-theme="light|dark"`
pins one. An inline `<head>` script applies the saved choice before the first paint, and a sidebar
button changes it. The canvas primitives in `features/shared` change once for all four canvases. The
project page renders a new `ProjectToolBar` inside its canvas instead of icons in the header.

**Tech Stack:** Next.js 16.3.5 App Router, React 19.2.8, @xyflow/react 12.11.6, lucide-react,
Vitest 5 with Testing Library (jsdom), Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-09-24-themes-and-canvas-design.md`

## Global Constraints

- All code, identifiers, comments, UI copy and documentation are in English.
- No new dependencies.
- Theme storage key `dawes-theme`; preferences `system` | `light` | `dark`; default `system`; `system`
  removes `data-theme` from `<html>`.
- `light-dark()` minimums: Chrome 123, Safari 17.5, Firefox 120.
- Dark palette: page `#131416`, cards and bars `#1c1e21`, borders `#28292c`, canvas `#131416` with
  `#363739` dots. The light canvas keeps `#f3f4f6`, with `#c5c9d0` dots.
- Application chrome stays monochrome (no Higgsfield lime). Artwork and uploaded images are never
  recoloured or filtered.
- Styling boundary: shared tokens and shared-primitive styles live in `apps/web/app/globals.css`;
  feature rules live in `apps/web/features/<feature>/<feature>.css`. No selector may appear in two
  feature stylesheets, or in a feature stylesheet and `globals.css`
  (`features/shared/stylesheet-boundary.test.ts`).
- Accessible names stay the same: `Project details`, `Conversation`, `Playground`, `Zoom In`,
  `Zoom Out`, `Fit View`, `Fit board to view`. The bottom bar is the group `Project actions`.
- Commands run from `apps/web` unless stated. The dev server already runs on
  http://localhost:3003; never start another. If CSS edits stop showing, clear
  `apps/web/.next/dev/cache` and restart it on the same port as `docs/engineering/handoff.md`
  describes.
- Playwright: always pass a private `--output` directory (for example
  `--output=../outputs/pw-theme`), because runs clear `test-results/` and other sessions use this
  tree. `workspace-actions`, `design-audit`, `canonical-workspaces` and both `workspace` specs fail
  on the SABRE overlay's counts by design (see the handoff's Evidence); any other failure is real.
- Other sessions edit this tree: stage explicit paths only, never `git add -A` or `git add .`.
- `npm run check` includes `prettier --check` over `app features lib tests`, so run
  `npx prettier --write <touched files under apps/web>` before it.
- Every task ends with `npm run check` passing and a Conventional Commit of that task's files. Each
  commit message ends with the line
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. This gives one commit per
  task; the spec's three stages are Tasks 1–5 (theme), 6–7 (canvas) and 8–9 (project).

## Review Focus

1. Storage blocked (a private window, disabled site data): the chosen theme still applies for the
   page and nothing throws. Pinned in Task 1.
2. A theme change in another tab: this tab's colours and the switch label follow. Pinned in Task 2.
3. A literal colour left in any stylesheet shows as a light patch in dark mode. The gate in Tasks
   3–4 fails on it.
4. A 320 px phone: the zoom pill and the tool bar must neither overlap nor leave the viewport.
   Pinned in Task 8.
5. Closing the Playground (button, Escape, reduced motion): the layer slides back down and focus
   returns to the Playground button, which now sits in the bottom bar. Pinned in Task 9.

---

### Task 1: Theme preference and pre-paint script

**Files:**
- Create: `apps/web/features/workspace/theme.ts`
- Test: `apps/web/features/workspace/theme.test.ts`
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces (Task 2 and `app/layout.tsx` use these exact names):
  - `type ThemePreference = "system" | "light" | "dark"`
  - `const THEME_STORAGE_KEY = "dawes-theme"`, `const THEME_CHANGE_EVENT = "dawes-theme-change"`
  - `parseThemePreference(value: unknown): ThemePreference`
  - `nextThemePreference(current: ThemePreference): ThemePreference`
  - `currentThemePreference(root?: HTMLElement): ThemePreference`
  - `applyThemePreference(preference: ThemePreference, root?: HTMLElement): void`
  - `saveThemePreference(preference: ThemePreference): void`
  - `const themeScript: string`

- [ ] **Step 1: Write the failing test**

Create `apps/web/features/workspace/theme.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  applyThemePreference,
  currentThemePreference,
  nextThemePreference,
  parseThemePreference,
  saveThemePreference,
  themeScript,
} from "./theme";

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("theme preference", () => {
  it("reads missing and unknown values as system", () => {
    expect(parseThemePreference(null)).toBe("system");
    expect(parseThemePreference("sepia")).toBe("system");
    expect(parseThemePreference("dark")).toBe("dark");
  });

  it("cycles system, light, dark and back to system", () => {
    expect(nextThemePreference("system")).toBe("light");
    expect(nextThemePreference("light")).toBe("dark");
    expect(nextThemePreference("dark")).toBe("system");
  });

  it("pins light or dark on the root and removes the pin for system", () => {
    applyThemePreference("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(currentThemePreference()).toBe("dark");
    applyThemePreference("system");
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(currentThemePreference()).toBe("system");
  });

  it("saves, applies and announces a choice", () => {
    const listener = vi.fn();
    window.addEventListener(THEME_CHANGE_EVENT, listener);
    saveThemePreference("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    saveThemePreference("system");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(listener).toHaveBeenCalledTimes(2);
    window.removeEventListener(THEME_CHANGE_EVENT, listener);
  });

  it("still applies a choice when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(() => saveThemePreference("dark")).not.toThrow();
    expect(currentThemePreference()).toBe("dark");
  });

  it("applies only a known stored choice from the head script", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    new Function(themeScript)();
    expect(document.documentElement.dataset.theme).toBe("dark");
    delete document.documentElement.dataset.theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, "</script><script>alert(1)</script>");
    new Function(themeScript)();
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run features/workspace/theme.test.ts`
Expected: FAIL, `Failed to resolve import "./theme"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/features/workspace/theme.ts`:

```ts
/**
 * The colour theme: `system` follows the operating system, `light` and `dark` pin one. The choice
 * is kept in this browser only. `app/layout.tsx` runs `themeScript` in `<head>`, so a saved choice
 * is on `<html data-theme>` before the first paint. That attribute is the single source of truth
 * for the page: `color-scheme` in `app/globals.css` reads it, and so does the sidebar switch.
 */
export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "dawes-theme";
/** Fired on `window` after this tab changes the theme, so every reader re-renders. */
export const THEME_CHANGE_EVENT = "dawes-theme-change";

const order: readonly ThemePreference[] = ["system", "light", "dark"];

export function parseThemePreference(value: unknown): ThemePreference {
  return order.find((preference) => preference === value) ?? "system";
}

/** The sidebar switch's order: System, Light, Dark, then System again. */
export function nextThemePreference(current: ThemePreference): ThemePreference {
  return order[(order.indexOf(current) + 1) % order.length];
}

export function currentThemePreference(root: HTMLElement = document.documentElement) {
  return parseThemePreference(root.dataset.theme);
}

export function applyThemePreference(
  preference: ThemePreference,
  root: HTMLElement = document.documentElement,
) {
  if (preference === "system") delete root.dataset.theme;
  else root.dataset.theme = preference;
}

export function saveThemePreference(preference: ThemePreference) {
  try {
    if (preference === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Blocked storage (a private window, disabled site data) still gets the theme for this page.
  }
  applyThemePreference(preference);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/** `parseThemePreference` and `applyThemePreference` in plain script, run before any bundle. */
export const themeScript = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run features/workspace/theme.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the script in the root layout**

In `apps/web/app/layout.tsx`, add the import below the `ApplicationProviders` import:

```tsx
import { themeScript } from "@/features/workspace/theme";
```

and replace

```tsx
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
```

with

```tsx
    // The head script sets `data-theme` before hydration, so this element differs from the server's.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
```

The content security policy already allows inline scripts (`next.config.ts`, `script-src 'self'
'unsafe-inline'`), so it needs no change.

- [ ] **Step 6: Confirm the served HTML carries the script**

Run: `curl -s http://localhost:3003/login | grep -o 'dawes-theme' | head -1`
Expected: `dawes-theme`

- [ ] **Step 7: Run the gate and commit**

Run: `npm run check`
Expected: typecheck, lint, format and every unit test pass.

```bash
git add apps/web/features/workspace/theme.ts apps/web/features/workspace/theme.test.ts apps/web/app/layout.tsx
git commit -m "feat(theme): apply a saved light or dark theme before the first paint" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Sidebar theme switch

**Files:**
- Create: `apps/web/features/workspace/theme-toggle.tsx`
- Test: `apps/web/features/workspace/theme-toggle.test.tsx`
- Modify: `apps/web/features/workspace/app-shell.tsx` (one import; the sidebar footer)
- Modify: `apps/web/features/workspace/README.md` (new "Theme" section)

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces: `ThemeToggle(): JSX.Element` with no props.

- [ ] **Step 1: Write the failing test**

Create `apps/web/features/workspace/theme-toggle.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY } from "./theme";
import { ThemeToggle } from "./theme-toggle";

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("ThemeToggle", () => {
  it("shows the theme in force and cycles System, Light, Dark", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const toggle = screen.getByRole("button", { name: "Theme: System" });
    await user.click(toggle);
    expect(toggle).toHaveAccessibleName("Theme: Light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    await user.click(toggle);
    expect(toggle).toHaveAccessibleName("Theme: Dark");
    await user.click(toggle);
    expect(toggle).toHaveAccessibleName("Theme: System");
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });

  it("starts from the theme the head script applied", () => {
    document.documentElement.dataset.theme = "dark";
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Theme: Dark" })).toBeInTheDocument();
  });

  it("follows a change made in another tab", () => {
    render(<ThemeToggle />);
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "dark" }),
      );
    });
    expect(screen.getByRole("button", { name: "Theme: Dark" })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run features/workspace/theme-toggle.test.tsx`
Expected: FAIL, `Failed to resolve import "./theme-toggle"`.

- [ ] **Step 3: Write the component**

Create `apps/web/features/workspace/theme-toggle.tsx`:

```tsx
"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  applyThemePreference,
  currentThemePreference,
  nextThemePreference,
  parseThemePreference,
  saveThemePreference,
  type ThemePreference,
} from "./theme";

const labels: Record<ThemePreference, string> = { system: "System", light: "Light", dark: "Dark" };
const icons = { system: Monitor, light: Sun, dark: Moon } as const;

function subscribe(onChange: () => void) {
  // Another tab's choice arrives as a storage event; apply it here too, then re-read.
  const fromOtherTab = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    applyThemePreference(parseThemePreference(event.newValue));
    onChange();
  };
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", fromOtherTab);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", fromOtherTab);
  };
}

/**
 * One sidebar row showing the theme in force; each click moves to the next choice. The server
 * cannot know the stored choice, so it renders System and the real one appears after hydration.
 */
export function ThemeToggle() {
  const preference = useSyncExternalStore(
    subscribe,
    currentThemePreference,
    (): ThemePreference => "system",
  );
  const Icon = icons[preference];
  return (
    <button
      type="button"
      className="nav-item"
      onClick={() => saveThemePreference(nextThemePreference(preference))}
    >
      <Icon size={17} />
      <span>Theme: {labels[preference]}</span>
    </button>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run features/workspace/theme-toggle.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Put the switch in the sidebar footer**

In `apps/web/features/workspace/app-shell.tsx`, add below
`import { NotificationsBell } from "./notifications-bell";`:

```tsx
import { ThemeToggle } from "./theme-toggle";
```

In the `sidebar-footer`, insert `<ThemeToggle />` directly before the Help & support button, so the
block reads:

```tsx
          <ThemeToggle />
          <button
            className="nav-item"
            onClick={() => {
              setMobileOpen(false);
              setHelpOpen(true);
            }}
          >
            <CircleHelp size={17} />
            <span>Help & support</span>
          </button>
```

The collapsed rail already hides `.nav-item > span` visually while keeping it for assistive
technology (`features/workspace/workspace.css`), so no CSS is needed.

- [ ] **Step 6: Document the switch**

In `apps/web/features/workspace/README.md`, add this section after "## Visual layout and active
navigation" and its paragraphs:

```md
## Theme

`theme-toggle.tsx` adds **Theme: System / Light / Dark** to the sidebar footer, above Help &
support, for every role; each click moves to the next choice in that order. `theme.ts` keeps the
choice in this browser (`localStorage` key `dawes-theme`; System removes the key) and sets
`<html data-theme>`, which `color-scheme` in `app/globals.css` reads. Every colour token is a
`light-dark()` pair, so System needs no script. `app/layout.tsx` runs the same logic as an inline
`<head>` script, so a reload never flashes the other theme, and other open tabs follow through the
`storage` event. Blocked storage still applies the choice for the current page. The collapsed rail
keeps the label for assistive technology, like the other sidebar items.
```

- [ ] **Step 7: Run the gate and commit**

Run: `npm run check`
Expected: PASS.

```bash
git add apps/web/features/workspace/theme-toggle.tsx apps/web/features/workspace/theme-toggle.test.tsx apps/web/features/workspace/app-shell.tsx apps/web/features/workspace/README.md
git commit -m "feat(theme): add a System, Light and Dark switch to the sidebar" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Dark tokens in `globals.css`, the colour gate and the contrast check

**Files:**
- Create: `apps/web/features/shared/theme-colors.test.ts`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: `data-theme` on `<html>` (Task 1).
- Produces: every colour token as a `light-dark()` pair, plus the new token `--on-ink` (text on an
  `--ink` fill; Task 4 uses `var(--on-ink)`). The test file defines `stylesheets`,
  `themeIndependent`, `declarations`, `violations`, `sides`, `token` and `contrast`; Task 4
  extends it.

- [ ] **Step 1: Write the failing test**

Create `apps/web/features/shared/theme-colors.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * Dark mode works because every colour is written once, as `light-dark(<light>, <dark>)`, and
 * `color-scheme` on the root picks a side. A literal colour written anywhere else keeps its light
 * value in dark mode, so this gate fails on one unless it is black used in a shadow, or it sits on
 * a surface that looks the same in both themes (`themeIndependent`, each with its reason).
 */
const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path: string) => readFileSync(join(webRoot, path), "utf8");

const stylesheets = ["app/globals.css"];

const themeIndependent: Record<string, string> = {
  "::selection": "White on the dark olive highlight reads on either theme.",
};

type Declaration = { selector: string; property: string; value: string };

/** Every declaration with its innermost selector: enough CSS to say where each colour is. */
function declarations(css: string): Declaration[] {
  const found: Declaration[] = [];
  const selectors: string[] = [];
  let buffer = "";
  const record = () => {
    const colon = buffer.indexOf(":");
    if (colon > 0 && selectors.length)
      found.push({
        selector: selectors[selectors.length - 1],
        property: buffer.slice(0, colon).trim(),
        value: buffer.slice(colon + 1).trim(),
      });
    buffer = "";
  };
  for (const character of css.replace(/\/\*[\s\S]*?\*\//g, "")) {
    if (character === "{") {
      selectors.push(buffer.trim());
      buffer = "";
    } else if (character === "}") {
      record();
      selectors.pop();
    } else if (character === ";") record();
    else buffer += character;
  }
  return found;
}

/** Drops each `light-dark(…)` call: its two colours are exactly what the gate asks for. */
function withoutLightDark(value: string) {
  let result = "";
  let index = 0;
  for (;;) {
    const start = value.indexOf("light-dark(", index);
    if (start < 0) return result + value.slice(index);
    result += value.slice(index, start);
    let depth = 0;
    let cursor = start + "light-dark".length;
    do {
      if (value[cursor] === "(") depth++;
      else if (value[cursor] === ")") depth--;
      cursor++;
    } while (depth > 0 && cursor < value.length);
    index = cursor;
  }
}

const colourLiteral = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)|\b(?:white|black)\b/gi;
const blackShadow = /^(?:#0{3}[0-9a-f]|#0{6}[0-9a-f]{2}|rgba?\(\s*0[\s,]+0[\s,]+0\s*[,/][^)]*\))$/i;

function violations(path: string) {
  return declarations(read(path)).flatMap(({ selector, property, value }) => {
    if (themeIndependent[selector]) return [];
    const literals = withoutLightDark(value).match(colourLiteral) ?? [];
    const offending = property.endsWith("shadow")
      ? literals.filter((literal) => !blackShadow.test(literal))
      : literals;
    return offending.map((literal) => `${path} ${selector} { ${property}: ${literal} }`);
  });
}

function channel(value: number) {
  const unit = value / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const digits = hex.slice(1);
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits;
  const [red, green, blue] = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16));
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(first: string, second: string) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The two sides of a `light-dark(#light, #dark)` value. */
function sides(value: string): [string, string] {
  const match = value.match(/^light-dark\(\s*(#[0-9a-f]{3,6})\s*,\s*(#[0-9a-f]{3,6})\s*\)$/i);
  if (!match) throw new Error(`Expected light-dark(#hex, #hex), found "${value}"`);
  return [match[1], match[2]];
}

const tokens = new Map(
  declarations(read("app/globals.css"))
    .filter(({ selector, property }) => selector === ":root" && property.startsWith("--"))
    .map(({ property, value }) => [property, value] as const),
);
const token = (name: string) => sides(tokens.get(name) ?? "");

describe("every colour has a dark value", () => {
  it.each(stylesheets)("%s writes each colour for both themes", (path) => {
    expect(violations(path)).toEqual([]);
  });
});

describe("text keeps WCAG AA contrast in both themes", () => {
  it.each([
    ["--foreground", "--background"],
    ["--foreground", "--surface"],
    ["--foreground", "--surface-subtle"],
    ["--muted", "--background"],
    ["--muted", "--surface"],
    ["--muted", "--surface-subtle"],
    ["--muted", "--canvas-background"],
    ["--on-ink", "--ink"],
    ["--on-ink", "--ink-hover"],
    ["--sidebar-muted", "--sidebar"],
    ["--sidebar-text", "--sidebar-active"],
    ["--tone-active-fg", "--tone-active-bg"],
    ["--tone-attention-fg", "--tone-attention-bg"],
    ["--tone-complete-fg", "--tone-complete-bg"],
  ])("%s on %s", (text, surface) => {
    const [lightText, darkText] = token(text);
    const [lightSurface, darkSurface] = token(surface);
    expect(contrast(lightText, lightSurface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkText, darkSurface)).toBeGreaterThanOrEqual(4.5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run features/shared/theme-colors.test.ts`
Expected: FAIL. The gate lists literals such as
`app/globals.css :root { --background: #f7f8fa }`, and every contrast case throws
`Expected light-dark(#hex, #hex)`.

- [ ] **Step 3: Give every `:root` colour token its dark value**

In `apps/web/app/globals.css`, inside `:root`, make these replacements (keep every other line):

| Current line | Replacement |
| --- | --- |
| `color-scheme: light;` | `color-scheme: light dark;` |
| `--background: #f7f8fa;` | `--background: light-dark(#f7f8fa, #131416);` |
| `--foreground: #272a30;` | `--foreground: light-dark(#272a30, #ececee);` |
| `--surface: #fff;` | `--surface: light-dark(#fff, #1c1e21);` |
| `--surface-subtle: #f2f3f5;` | `--surface-subtle: light-dark(#f2f3f5, #25272b);` |
| `--canvas-background: #f3f4f6;` | `--canvas-background: light-dark(#f3f4f6, #131416);` |
| `--canvas-grid: #dcdfe4;` | `--canvas-grid: light-dark(#dcdfe4, #363739);` |
| `--muted: #636872;` | `--muted: light-dark(#636872, #9ea1a8);` |
| `--border: #e5e7eb;` | `--border: light-dark(#e5e7eb, #28292c);` |
| `--border-strong: #ccd0d7;` | `--border-strong: light-dark(#ccd0d7, #3a3c41);` |
| `--ink: #272a30;` | `--ink: light-dark(#272a30, #ececee);` followed by a new line `--on-ink: light-dark(#fff, #131416);` |
| `--sidebar: #202226;` | `--sidebar: light-dark(#202226, #0f1012);` |
| `--sidebar-active: #36393f;` | `--sidebar-active: light-dark(#36393f, #25272b);` |
| `--sidebar-border: #3a3d44;` | `--sidebar-border: light-dark(#3a3d44, #28292c);` |
| `--sidebar-muted: #b4b8c1;` | `--sidebar-muted: light-dark(#b4b8c1, #a3a6ae);` |
| `--sidebar-text: #f5f6f8;` | `--sidebar-text: light-dark(#f5f6f8, #ececee);` |
| `--surface-hover: #fafbfc;` | `--surface-hover: light-dark(#fafbfc, #212327);` |
| `--ink-hover: #40444c;` | `--ink-hover: light-dark(#40444c, #d4d5d9);` |
| `--focus-ring: rgb(39 42 48 / 8%);` | `--focus-ring: light-dark(rgb(39 42 48 / 8%), rgb(236 236 238 / 14%));` |
| `--overlay-shadow: 0 20px 64px rgb(20 23 29 / 16%);` | `--overlay-shadow: 0 20px 64px light-dark(rgb(20 23 29 / 16%), rgb(0 0 0 / 55%));` |
| `--overlay-scrim: rgb(20 23 29 / 36%);` | `--overlay-scrim: light-dark(rgb(20 23 29 / 36%), rgb(0 0 0 / 60%));` |
| `--tone-active-fg: #1d4e89;` | `--tone-active-fg: light-dark(#1d4e89, #9cc3f2);` |
| `--tone-active-bg: #e7f0fb;` | `--tone-active-bg: light-dark(#e7f0fb, #16263a);` |
| `--tone-active-border: #a9c6ea;` | `--tone-active-border: light-dark(#a9c6ea, #2d4b72);` |
| `--tone-attention-fg: #7a5400;` | `--tone-attention-fg: light-dark(#7a5400, #efc56a);` |
| `--tone-attention-bg: #fbf1dc;` | `--tone-attention-bg: light-dark(#fbf1dc, #2d2410);` |
| `--tone-attention-border: #e3bd6e;` | `--tone-attention-border: light-dark(#e3bd6e, #6b5321);` |
| `--tone-complete-fg: #2f5d34;` | `--tone-complete-fg: light-dark(#2f5d34, #a8d08e);` |
| `--tone-complete-bg: #e7f0df;` | `--tone-complete-bg: light-dark(#e7f0df, #1a2716);` |
| `--tone-complete-border: #a9c48a;` | `--tone-complete-border: light-dark(#a9c48a, #3e5b32);` |

Contrast measured for these pairs (the test re-checks them): muted text 5.04–7.12:1, the three
tones 8.38–9.38:1 in dark, on-ink 9.77:1 or better.

- [ ] **Step 4: Let a saved choice pin the scheme**

Directly after the closing `}` of `:root` (before `@theme inline`), add:

```css
/* `app/layout.tsx` pins a saved choice before the first paint; without it the system decides. */
:root[data-theme="light"] {
  color-scheme: light;
}
:root[data-theme="dark"] {
  color-scheme: dark;
}
```

- [ ] **Step 5: Replace the remaining literals in `globals.css`**

| Rule | Current | Replacement |
| --- | --- | --- |
| `.button.primary` | `color: #fff;` | `color: var(--on-ink);` |
| `input::placeholder, textarea::placeholder` | `color: #82827b;` | `color: light-dark(#82827b, #85878e);` |
| `input:disabled, textarea:disabled, select:disabled` | `color: #777970;` | `color: light-dark(#777970, #7a7c83);` |
| `.form-error` | `background: #eeeee8;` | `background: light-dark(#eeeee8, #26272a);` |
| `.topbar` | `background: rgb(255 255 255 / 96%);` | `background: light-dark(rgb(255 255 255 / 96%), rgb(28 30 33 / 96%));` |
| `.modal-backdrop` | `background: rgb(25 27 21 / 35%);` | `background: var(--overlay-scrim);` |
| `.modal` | `box-shadow: 0 20px 64px rgb(25 27 21 / 16%);` | `box-shadow: var(--overlay-shadow);` |

Leave `::selection` as it is (listed in `themeIndependent`) and leave the black shadows
(`rgb(0 0 0 / 7%)`), which the gate allows.

- [ ] **Step 6: Seat client logos on a light plate in dark mode**

Directly after the `.client-mark-initials { … }` rule, add:

```css
/* Uploaded logos are often dark marks on transparency, so dark mode seats them on a light plate. */
img.client-mark {
  background: light-dark(transparent, #f4f4f5);
  box-shadow: 0 0 0 3px light-dark(transparent, #f4f4f5);
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run features/shared/theme-colors.test.ts features/shared/stylesheet-boundary.test.ts`
Expected: PASS (1 gate case, 14 contrast cases, and the boundary tests).

- [ ] **Step 8: Look at it once**

Open http://localhost:3003/home signed in as `studio@dawes.local`, click **Theme: System** twice so
it reads **Theme: Dark**, and confirm the page, cards, sidebar, buttons and inputs turn dark. Feature
areas (board cards, timeline, Playground notes) still show light patches until Task 4. Click once
more to return to System.

- [ ] **Step 9: Run the gate and commit**

Run: `npm run check`
Expected: PASS.

```bash
git add apps/web/app/globals.css apps/web/features/shared/theme-colors.test.ts
git commit -m "feat(theme): give every shared colour token a dark value" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Dark values for every feature stylesheet

**Files:**
- Modify: `apps/web/features/shared/theme-colors.test.ts`
- Modify: `apps/web/features/board/board.css`, `apps/web/features/board/timeline.css`,
  `apps/web/features/briefings/briefings.css`, `apps/web/features/competitors/competitors.css`,
  `apps/web/features/credits/credits.css`, `apps/web/features/playground/playground.css`,
  `apps/web/features/projects/projects.css`, `apps/web/features/settings/settings.css`,
  `apps/web/features/team/team.css`, `apps/web/features/workspace/workspace.css`

**Interfaces:**
- Consumes: `--on-ink`, `--ink`, `--surface`, `--overlay-scrim`, `--sidebar-border` (Task 3).
- Produces: Playground-scoped `--playground-accent` and `--playground-on-accent` on
  `.playground-board` (Tasks 6 and 7 leave them as they are).

- [ ] **Step 1: Extend the gate to every stylesheet**

In `apps/web/features/shared/theme-colors.test.ts`:

1. Change the first import to `import { readdirSync, readFileSync } from "node:fs";`.
2. Replace `const stylesheets = ["app/globals.css"];` with:

```ts
const stylesheets = [
  "app/globals.css",
  ...readdirSync(join(webRoot, "features"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((feature) =>
      readdirSync(join(webRoot, "features", feature.name))
        .filter((name) => name.endsWith(".css"))
        .map((name) => `features/${feature.name}/${name}`),
    ),
];
```

3. Replace the `themeIndependent` object with:

```ts
const themeIndependent: Record<string, string> = {
  "::selection": "White on the dark olive highlight reads on either theme.",
  ".login-story": "The login story panel always uses the dark sidebar colour.",
  ".sidebar-collapse:hover:not(:disabled)": "The sidebar is dark in both themes.",
  ".profile-bar strong": "The sidebar is dark in both themes.",
  ".profile-bar .icon-button:hover": "The sidebar is dark in both themes.",
  ".mobile-sidebar-close:hover:not(:disabled)": "The sidebar is dark in both themes.",
  ".artwork-video": "Video letterboxing is black in any theme.",
  ".video-pin-marker": "Comment pins keep one look over artwork and on the video track.",
  ".video-pin-marker.selected": "Comment pins keep one look over artwork and on the video track.",
  ".artwork-pin": "Comment pins keep one look over artwork.",
  ".artwork-pin.selected": "Comment pins keep one look over artwork.",
  ".artwork-pin.pending": "Comment pins keep one look over artwork.",
};
```

4. Append at the end of the file:

```ts
describe("timeline bars stay legible in both themes", () => {
  const bars = new Map<string, Map<string, string>>();
  for (const { selector, property, value } of declarations(read("features/board/timeline.css")))
    if (property.startsWith("--bar-")) {
      if (!bars.has(selector)) bars.set(selector, new Map());
      bars.get(selector)!.set(property, value);
    }

  it("finds the default bar and its seven statuses", () => {
    expect(bars.size).toBe(8);
  });

  it.each([...bars.keys()])("%s", (selector) => {
    const bar = bars.get(selector)!;
    const [lightFill, darkFill] = sides(bar.get("--bar-fill") ?? "");
    const [lightInk, darkInk] = sides(bar.get("--bar-ink") ?? "");
    const [lightEdge, darkEdge] = sides(bar.get("--bar-edge") ?? "");
    const [lightLane, darkLane] = token("--surface");
    expect(contrast(lightInk, lightFill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkInk, darkFill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(lightEdge, lightLane)).toBeGreaterThanOrEqual(3);
    expect(contrast(darkEdge, darkLane)).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run features/shared/theme-colors.test.ts`
Expected: FAIL. Each feature stylesheet case lists its literals, for example
`features/board/board.css .board-card { border: #d9d9d2 }`; the eight bar cases throw
`Expected light-dark(#hex, #hex)`.

- [ ] **Step 3: `board/board.css`**

| Rule | Current | Replacement |
| --- | --- | --- |
| `.board-canvas .react-flow__node.selected .board-card` | `border-color: #888b7d;` | `border-color: light-dark(#888b7d, #8d9084);` |
| same rule | `box-shadow: 0 0 0 1px #888b7d;` | `box-shadow: 0 0 0 1px light-dark(#888b7d, #8d9084);` |
| `.board-card` | `border: 1px solid #d9d9d2;` | `border: 1px solid light-dark(#d9d9d2, #303236);` |
| `.board-card-grip` | `color: #a3a397;` | `color: light-dark(#a3a397, #5d5f64);` |
| `.board-campaign` | `background: #f6f5f4;` | `background: light-dark(#f6f5f4, #17181b);` |
| `.board-card-media` | `background: #f1f1ec;` | `background: light-dark(#f1f1ec, #232428);` |
| same rule | `color: #b4b4a7;` | `color: light-dark(#b4b4a7, #55575c);` |

- [ ] **Step 4: `board/timeline.css`**

| Rule | Current | Replacement |
| --- | --- | --- |
| `.timeline-lane + .timeline-lane` | `border-top: 1px solid #f1f1ec;` | `border-top: 1px solid light-dark(#f1f1ec, #222327);` |
| `.timeline-day` | `border-right: 1px solid #efefe9;` | `border-right: 1px solid light-dark(#efefe9, #232428);` |
| same rule | `color: #66665f;` | `color: light-dark(#66665f, #9a9ca3);` |
| `.timeline-day.today` | `background: #ecefe3;` | `background: light-dark(#ecefe3, #262a1f);` |
| same rule | `color: #222;` | `color: light-dark(#222, #eef0e6);` |
| `.timeline-cell` | `border-right: 1px solid #f0f0eb;` | `border-right: 1px solid light-dark(#f0f0eb, #202125);` |
| `.timeline-cell.weekend, .timeline-day.weekend` | `background: #fafaf7;` | `background: light-dark(#fafaf7, #17181b);` |
| `.timeline-cell.today` | `background: #f4f6ef;` | `background: light-dark(#f4f6ef, #1d2019);` |
| same rule | `border-right-color: #dfe3d3;` | `border-right-color: light-dark(#dfe3d3, #3a4030);` |
| `.timeline-no-work` | `color: #74746d;` | `color: light-dark(#74746d, #8f9097);` |

Bars (`--bar-fill` / `--bar-edge` / `--bar-ink`), each value `light-dark(<current>, <dark>)`:

| Rule | `--bar-fill` | `--bar-edge` | `--bar-ink` |
| --- | --- | --- | --- |
| `.timeline-project-bar` | `#eef1e7, #232a1a` | `#87975f, #8a9c5c` | `#3b4828, #d6e0c0` |
| `.planned` | `#fff, #1c1e21` | `#93938a, #86867f` | `#5d5d57, #c9c9c2` |
| `.in_progress` | `#d3dcbc, #2f3a1f` | `#7f9152, #93a664` | `#333f1e, #e0e9c9` |
| `.internal_review` | `#e7ebde, #262b1e` | `#8b9a6b, #86956a` | `#3f4d2c, #d3dcc0` |
| `.client_review` | `#e0e7d0, #29321c` | `#87975f, #8fa062` | `#3b4828, #d7e2bf` |
| `.changes_requested` | `#f6ead0, #33280f` | `#b08b2f, #b6923a` | `#61470e, #f0d99c` |
| `.approved` | `#e8e8e0, #28292a` | `#93938a, #8a8a83` | `#45453f, #d6d6cf` |
| `.delivered` | `#dededa, #2c2c2e` | `#8e8e86, #85857e` | `#4c4c45, #cfcfc8` |

For example, the first rule becomes:

```css
.timeline-project-bar {
  --bar-fill: light-dark(#eef1e7, #232a1a);
  --bar-edge: light-dark(#87975f, #8a9c5c);
  --bar-ink: light-dark(#3b4828, #d6e0c0);
```

Measured in dark: text 8.90–10.78:1 on its fill, edges 4.50–6.27:1 on the lane.

- [ ] **Step 5: `briefings/briefings.css`, `competitors/competitors.css`, `credits/credits.css`, `settings/settings.css`, `team/team.css`**

| File | Rule | Current | Replacement |
| --- | --- | --- | --- |
| briefings | `.briefing-progress button.active span` | `background: #252525;` | `background: var(--ink);` |
| briefings | same rule | `color: white;` | `color: var(--on-ink);` |
| briefings | same rule | `border-color: #252525;` | `border-color: var(--ink);` |
| briefings | `.service-card:hover` | `border-color: #aaa;` | `border-color: light-dark(#aaa, #55575d);` |
| briefings | `.service-card.selected` | `border-color: #252525;` | `border-color: var(--ink);` |
| briefings | same rule | `box-shadow: inset 0 0 0 1px #252525;` | `box-shadow: inset 0 0 0 1px var(--ink);` |
| briefings | `.briefing-summary strong` | `color: #343430;` | `color: light-dark(#343430, #dcdcd6);` |
| briefings | `.briefing-summary-fields dt` | `color: #343430;` | `color: light-dark(#343430, #dcdcd6);` |
| briefings | `.briefing-validation` | `border: 1px solid #d3bfb4;` | `border: 1px solid light-dark(#d3bfb4, #5a4238);` |
| briefings | same rule | `background: #fcf5f1;` | `background: light-dark(#fcf5f1, #2a1f1a);` |
| briefings | `.briefing-save-status` | `color: #52604a;` | `color: light-dark(#52604a, #a9b99e);` |
| competitors | `.competitor-widget` | `background: #f6f5f4;` | `background: light-dark(#f6f5f4, #17181b);` |
| competitors | `.competitor-tile:hover` | `border-color: #b9b9b1;` | `border-color: light-dark(#b9b9b1, #4a4b50);` |
| competitors | `.competitor-initial` | `background: #e6ebe4;` | `background: light-dark(#e6ebe4, #252c24);` |
| competitors | same rule | `color: #3d4a3d;` | `color: light-dark(#3d4a3d, #c3d0c1);` |
| credits | `.credit-packages button.selected` | `border-color: #292927;` | `border-color: var(--ink);` |
| settings | `.settings-success` | `color: #53694f;` | `color: light-dark(#53694f, #a7c09f);` |
| team | `.settings-avatar` | `color: #65655e;` | `color: light-dark(#65655e, #a3a39b);` |

- [ ] **Step 6: `playground/playground.css`**

Add two declarations at the end of the `.playground-board { … }` rule (after `overflow: hidden;`):

```css
  --playground-accent: light-dark(#526052, #9fb39f);
  --playground-on-accent: light-dark(#fff, #0f1012);
```

Then:

| Rule | Current | Replacement |
| --- | --- | --- |
| `.playground-canvas` | `--canvas-background: #e9e9e2;` | `--canvas-background: light-dark(#e9e9e2, #0f1012);` |
| same rule | `--canvas-grid: #cdcdc3;` | `--canvas-grid: light-dark(#cdcdc3, #2a2b2f);` |
| `.playground-canvas .react-flow__node-playgroundItem.selected` | `outline: 2px solid #526052;` | `outline: 2px solid var(--playground-accent);` |
| `.playground-item-note` | `background: #fcf5ce;` | `background: light-dark(#fcf5ce, #3a3522);` |
| same rule | `border-color: #dfd6ab;` | `border-color: light-dark(#dfd6ab, #5c5433);` |
| `.playground-item.has-error` | `border-color: #ae4639;` | `border-color: light-dark(#ae4639, #d0705f);` |
| `.playground-item-header` | `border-bottom: 1px solid #0000000b;` | `border-bottom: 1px solid light-dark(#0000000b, #ffffff14);` |
| `.playground-image` | `background: #f1f1ed;` | `background: light-dark(#f1f1ed, #232428);` |
| `.playground-item-status` | `color: #65655d;` | `color: light-dark(#65655d, #9d9d95);` |
| `.playground-item-status.is-error` | `color: #9a332a;` | `color: light-dark(#9a332a, #f08a7c);` |
| `.playground-resize-handle` | `border-color: white !important;` | `border-color: var(--surface) !important;` |
| same rule | `background: #526052 !important;` | `background: var(--playground-accent) !important;` |
| `.playground-drop-hint` | `border: 2px dashed #526052;` | `border: 2px dashed var(--playground-accent);` |
| same rule | `background: #f7faf3e8;` | `background: light-dark(#f7faf3e8, #1b2019e8);` |
| `.playground-banner` | `background: #fcf5de;` | `background: light-dark(#fcf5de, #2e2815);` |
| `.playground-upload-issues` | `background: #fff5f2;` | `background: light-dark(#fff5f2, #2e1c18);` |
| `.playground-album-chip.is-open` | `background: #526052;` | `background: var(--playground-accent);` |
| same rule | `border-color: #526052;` | `border-color: var(--playground-accent);` |
| same rule | `color: #fff;` | `color: var(--playground-on-accent);` |
| `.playground-album-thumb` | `background: var(--canvas-background, #e9e9e2);` | `background: var(--canvas-background);` |
| `.playground-album-thumb.is-selected` | `border-color: #526052;` | `border-color: var(--playground-accent);` |
| `.playground-album-thumb-reason` | `color: #fff;` | `color: var(--on-ink);` |

The album thumbnails sit outside `.playground-canvas`, so their fallback never applied: the root
token is always defined.

- [ ] **Step 7: `projects/projects.css` and `workspace/workspace.css`**

| File | Rule | Current | Replacement |
| --- | --- | --- | --- |
| projects | `.canvas-hint` | `background: #242424;` | `background: var(--ink);` |
| projects | same rule | `color: #fff;` | `color: var(--on-ink);` |
| projects | `.send-comment` | `background: #242424 !important;` | `background: var(--ink) !important;` |
| projects | same rule | `color: white !important;` | `color: var(--on-ink) !important;` |
| workspace | `.sidebar-backdrop` (inside `@media (max-width: 900px)`) | `background: rgb(25 27 21 / 35%);` | `background: var(--overlay-scrim);` |

In `workspace.css`, add this declaration at the end of the `.sidebar { … }` rule (after the
`transition` declaration), so the dark sidebar keeps an edge against the dark page:

```css
  box-shadow: inset -1px 0 0 light-dark(transparent, var(--sidebar-border));
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run features/shared/theme-colors.test.ts features/shared/stylesheet-boundary.test.ts`
Expected: PASS: one gate case per stylesheet (20), 14 token contrast cases, 9 timeline cases and
the boundary tests.

- [ ] **Step 9: Look at it once**

With **Theme: Dark** chosen, open the SABRE board in Timeline view, a project, and its Playground.
Confirm that no light patches remain: board cards, campaign frames, timeline lanes and bars,
Playground notes, banners and album chips. Return the switch to System.

- [ ] **Step 10: Run the gate and commit**

Run: `npm run check`
Expected: PASS.

```bash
git add apps/web/features/shared/theme-colors.test.ts apps/web/features/board/board.css apps/web/features/board/timeline.css apps/web/features/briefings/briefings.css apps/web/features/competitors/competitors.css apps/web/features/credits/credits.css apps/web/features/playground/playground.css apps/web/features/projects/projects.css apps/web/features/settings/settings.css apps/web/features/team/team.css apps/web/features/workspace/workspace.css
git commit -m "feat(theme): give every feature stylesheet its dark colours" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Theme browser check

**Files:**
- Create: `apps/web/tests/e2e/theme.spec.ts`

**Interfaces:**
- Consumes: `createPlaygroundFixture()` from `tests/e2e/playground-fixture.ts` (returns
  `{ projectId, cleanup, … }`); `credentials`, `signIn` from `tests/e2e/test-support.ts`; the
  sidebar button names from Task 2.
- Produces: the test `the project canvas takes the dark canvas colour`, which Task 6 extends.

- [ ] **Step 1: Write the browser test**

Create `apps/web/tests/e2e/theme.spec.ts`:

```ts
import { test as base, expect } from "@playwright/test";
import { createPlaygroundFixture } from "./playground-fixture";
import { credentials, signIn } from "./test-support";

const test = base.extend<{ workspace: Awaited<ReturnType<typeof createPlaygroundFixture>> }>({
  workspace: async ({}, runWithFixture) => {
    const workspace = await createPlaygroundFixture();
    try {
      await runWithFixture(workspace);
    } finally {
      await workspace.cleanup();
    }
  },
});

/** `--background` in each theme, as the browser computes it on `<html>`. */
const darkPage = "rgb(19, 20, 22)";
const lightPage = "rgb(247, 248, 250)";
const rootBackground = () => getComputedStyle(document.documentElement).backgroundColor;

test("a saved theme is on the page before any script bundle runs", async ({ page }) => {
  await signIn(page, credentials.agency);
  const toggle = page.getByRole("button", { name: /^Theme: / });
  await expect(toggle).toHaveAccessibleName("Theme: System");
  await toggle.click();
  await expect(toggle).toHaveAccessibleName("Theme: Light");
  await toggle.click();
  await expect(toggle).toHaveAccessibleName("Theme: Dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // Hold every script bundle, so what follows comes from the server HTML and the head script alone.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const bundle = (url: URL) =>
    url.pathname.startsWith("/_next/static/") && url.pathname.endsWith(".js");
  await page.route(bundle, async (route) => {
    await held;
    await route.continue();
  });
  await page.reload({ waitUntil: "commit" });
  await page.waitForFunction(() => document.body !== null);
  await page.waitForFunction(
    () => getComputedStyle(document.documentElement).backgroundColor !== "rgba(0, 0, 0, 0)",
  );
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  expect(await page.evaluate(rootBackground)).toBe(darkPage);
  release();
  await page.unroute(bundle);
  await expect(page.getByRole("button", { name: "Theme: Dark" })).toBeVisible();
});

test("System follows the operating system's colour scheme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await expect.poll(() => page.evaluate(rootBackground)).toBe(darkPage);
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => page.evaluate(rootBackground)).toBe(lightPage);
});

test("the project canvas takes the dark canvas colour", async ({ page, workspace }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await signIn(page, credentials.agency);
  await page.goto(`/projects/${workspace.projectId}`);
  const background = page.locator(".project-canvas .react-flow__background");
  await expect(background).toBeVisible();
  expect(await background.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
    darkPage,
  );
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/theme.spec.ts --output=../outputs/pw-theme`
Expected: 3 passed. If the first test stalls on `reload`, a bundle is render-blocking: confirm the
matcher holds `.js` files only (CSS must still load), and read the failure trace in
`../outputs/pw-theme`.

- [ ] **Step 3: Check that the shell still logs no errors**

Run: `npx playwright test tests/e2e/console-errors.spec.ts tests/e2e/client-navigation.spec.ts --output=../outputs/pw-theme-shell`
Expected: all pass. A React warning about the `<script>` tag in `app/layout.tsx` would fail
`console-errors`; if it appears, report it rather than suppressing it.

- [ ] **Step 4: Run the gate and commit**

Run: `npm run check`
Expected: PASS.

```bash
git add apps/web/tests/e2e/theme.spec.ts
git commit -m "test(theme): check the saved theme, the system theme and the dark canvas in a browser" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Dot grid on every canvas

**Files:**
- Modify: `apps/web/features/shared/canvas-background.tsx`
- Test: `apps/web/features/shared/canvas-background.test.tsx` (create)
- Modify: `apps/web/tests/e2e/theme.spec.ts` (the canvas test)
- Modify: `apps/web/app/globals.css` (`--canvas-grid` light side)
- Modify: `apps/web/features/playground/playground.css` (`--canvas-grid`)
- Modify docs: `apps/web/features/shared/README.md`, `apps/web/features/board/README.md`,
  `apps/web/features/playground/README.md`, `docs/architecture/design-system.md`

**Interfaces:**
- Consumes: `--canvas-grid` and `--canvas-background` (Tasks 3–4).
- Produces: `CanvasBackground()`, unchanged signature; it now draws dots.

- [ ] **Step 1: Write the failing unit test**

Create `apps/web/features/shared/canvas-background.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const background = vi.hoisted(() => vi.fn());
vi.mock("@xyflow/react", () => ({
  BackgroundVariant: { Dots: "dots", Lines: "lines", Cross: "cross" },
  Background: (props: Record<string, unknown>) => {
    background(props);
    return null;
  },
}));

import { CanvasBackground } from "./canvas-background";

describe("CanvasBackground", () => {
  it("draws the shared dot grid from the theme tokens", () => {
    render(<CanvasBackground />);
    expect(background).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "dots",
        gap: 24,
        size: 1.5,
        color: "var(--canvas-grid)",
        bgColor: "var(--canvas-background)",
      }),
    );
  });

  it("gives each mounted canvas its own pattern id", () => {
    render(
      <>
        <CanvasBackground />
        <CanvasBackground />
      </>,
    );
    const ids = background.mock.calls.map(([props]) => props.id);
    expect(new Set(ids).size).toBe(2);
  });
});
```

- [ ] **Step 2: Add the browser expectation**

In `apps/web/tests/e2e/theme.spec.ts`, rename the third test to
`"the project canvas takes the dark canvas colour and dot grid"` and add, after its colour
expectation:

```ts
  await expect(background.locator("pattern circle")).toHaveCount(1);
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npx vitest run features/shared/canvas-background.test.tsx`
Expected: FAIL, the first test receives `variant: "lines"` and `lineWidth: 0.75`.

Run: `npx playwright test tests/e2e/theme.spec.ts -g "dot grid" --output=../outputs/pw-dots`
Expected: FAIL, `pattern circle` count 0 (the pattern is a path).

- [ ] **Step 4: Draw dots**

Replace `apps/web/features/shared/canvas-background.tsx` with:

```tsx
"use client";

import { Background, BackgroundVariant } from "@xyflow/react";
import { useId } from "react";

/** The shared dot grid: 24-unit spacing that follows pan and zoom, coloured by the theme tokens. */
export function CanvasBackground() {
  const id = useId();
  return (
    <Background
      id={id}
      variant={BackgroundVariant.Dots}
      gap={24}
      size={1.5}
      color="var(--canvas-grid)"
      bgColor="var(--canvas-background)"
    />
  );
}
```

- [ ] **Step 5: Give dots their colours**

Small dots need more contrast than continuous lines. In `apps/web/app/globals.css` change
`--canvas-grid: light-dark(#dcdfe4, #363739);` to `--canvas-grid: light-dark(#c5c9d0, #363739);`
(1.51:1 in light, 1.55:1 in dark, the Higgsfield ratio). In
`apps/web/features/playground/playground.css` change the Playground's
`--canvas-grid: light-dark(#cdcdc3, #2a2b2f);` to `--canvas-grid: light-dark(#bdbdb2, #333438);`.

- [ ] **Step 6: Run both to verify they pass**

Run: `npx vitest run features/shared/canvas-background.test.tsx features/shared/theme-colors.test.ts`
Expected: PASS.

Run: `npx playwright test tests/e2e/theme.spec.ts --output=../outputs/pw-dots`
Expected: 3 passed.

- [ ] **Step 7: Update the documentation**

- `apps/web/features/shared/README.md`, "Canvas background and controls": replace "renders a
  24-unit line grid using" with "renders a 24-unit dot grid (1.5-unit dots, after the Higgsfield
  canvas the user chose) using". The rest of that paragraph stays.
- `apps/web/features/board/README.md`: replace "It uses the shared 24-unit line grid" with "It
  uses the shared 24-unit dot grid".
- `apps/web/features/playground/README.md`: replace "The canvas uses the shared 24-unit line grid
  with a slightly darker background and grid than the project beneath it." with "The canvas uses the
  shared 24-unit dot grid with a slightly darker background and dots than the project beneath it, in
  both themes."
- `docs/architecture/design-system.md`:
  - Token table row `--canvas-grid`: value `#c5c9d0` / dark `#363739`; basis "Shared 24-unit dot
    grid, 1.5-unit dots; follows pan/zoom". Row `--canvas-background`: add "dark `#131416`". Row
    "Playground canvas overrides": `#e9e9e2` / `#bdbdb2` light, `#0f1012` / `#333438` dark;
    "Slightly darker background and dots, scoped to the Playground canvas".
  - "Unified document surfaces": replace "The line grid stays on the xyflow canvases" with "The dot
    grid stays on the xyflow canvases".
  - "Board and project canvas": replace "a subtle line-grid background" with "a subtle dot-grid
    background".

- [ ] **Step 8: Run the gate and commit**

Run: `npm run check`
Expected: PASS.

```bash
git add apps/web/features/shared/canvas-background.tsx apps/web/features/shared/canvas-background.test.tsx apps/web/tests/e2e/theme.spec.ts apps/web/app/globals.css apps/web/features/playground/playground.css apps/web/features/shared/README.md apps/web/features/board/README.md apps/web/features/playground/README.md docs/architecture/design-system.md
git commit -m "feat(canvas): draw every canvas as a dot grid" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Horizontal zoom pill

**Files:**
- Modify: `apps/web/features/shared/canvas-controls.tsx`
- Test: `apps/web/features/shared/canvas-controls.test.tsx` (create)
- Modify: `apps/web/app/globals.css` (the shared pill styles)
- Modify: `apps/web/features/board/board.css` (dock placement; remove the old zoom-card styles)
- Modify: `apps/web/features/board/board-canvas-controls.tsx` (icon size)
- Modify: `apps/web/features/playground/playground.css` (remove the controls overrides)
- Modify: `apps/web/tests/e2e/board-views.spec.ts` (assert the bottom-left placement)
- Modify docs: `apps/web/features/shared/README.md`, `apps/web/features/board/README.md`,
  `docs/architecture/design-system.md`

**Interfaces:**
- Consumes: xyflow `Controls`, `ControlButton`, `useReactFlow`, `useStore`.
- Produces: `CanvasControls({ onFit?, fitLabel?, fitIcon?, portalTarget? })`, same props as
  today. It renders `.react-flow__controls.canvas-zoom.horizontal` containing, in order: Zoom Out,
  `.canvas-zoom-level` (visually hidden "Zoom " plus the whole percentage), Zoom In,
  `.canvas-zoom-divider`, the fit button. Task 8 relies on the `.canvas-zoom` class.

- [ ] **Step 1: Write the failing test**

Create `apps/web/features/shared/canvas-controls.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider, useStoreApi } from "@xyflow/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import { CanvasControls } from "./canvas-controls";

function Harness({ zoom, minZoom = 0.5, maxZoom = 2 }: { zoom: number; minZoom?: number; maxZoom?: number }) {
  const store = useStoreApi();
  useEffect(() => {
    store.setState({ transform: [0, 0, zoom], minZoom, maxZoom });
  }, [store, zoom, minZoom, maxZoom]);
  return <CanvasControls />;
}

describe("CanvasControls", () => {
  it("reads zoom out, the zoom level, zoom in, then fit, in one horizontal pill", () => {
    const { container } = render(
      <ReactFlowProvider>
        <Harness zoom={0.514} />
      </ReactFlowProvider>,
    );
    const pill = container.querySelector(".react-flow__controls.canvas-zoom.horizontal");
    expect(pill).not.toBeNull();
    expect(pill).toHaveTextContent("Zoom 51%");
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(
      ["Zoom Out", "Zoom In", "Fit View"],
    );
  });

  it("follows the canvas zoom", () => {
    const { container, rerender } = render(
      <ReactFlowProvider>
        <Harness zoom={1} />
      </ReactFlowProvider>,
    );
    expect(container.querySelector(".canvas-zoom-level")).toHaveTextContent("Zoom 100%");
    rerender(
      <ReactFlowProvider>
        <Harness zoom={1.2} />
      </ReactFlowProvider>,
    );
    expect(container.querySelector(".canvas-zoom-level")).toHaveTextContent("Zoom 120%");
  });

  it("disables zoom out at the minimum and zoom in at the maximum", () => {
    const { rerender } = render(
      <ReactFlowProvider>
        <Harness zoom={0.5} />
      </ReactFlowProvider>,
    );
    expect(screen.getByRole("button", { name: "Zoom Out" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Zoom In" })).toBeEnabled();
    rerender(
      <ReactFlowProvider>
        <Harness zoom={2} />
      </ReactFlowProvider>,
    );
    expect(screen.getByRole("button", { name: "Zoom In" })).toBeDisabled();
  });

  it("keeps a consumer's own fit label", () => {
    render(
      <ReactFlowProvider>
        <CanvasControls fitLabel="Fit board to view" />
      </ReactFlowProvider>,
    );
    expect(screen.getByRole("button", { name: "Fit board to view" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run features/shared/canvas-controls.test.tsx`
Expected: FAIL. There is no `.canvas-zoom` pill, the text is empty and the button order is
`["Zoom In", "Zoom Out", "Fit View"]`.

- [ ] **Step 3: Write the pill**

Replace `apps/web/features/shared/canvas-controls.tsx` with:

```tsx
"use client";

import { ControlButton, Controls, useReactFlow, useStore } from "@xyflow/react";
import { Maximize, Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

const motionDuration = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200;

/**
 * The zoom pill every canvas shares: zoom out, the live zoom level, zoom in and fit, in one
 * horizontal card at the bottom left. Its look lives in `app/globals.css` (`.canvas-zoom`).
 */
export function CanvasControls({
  onFit,
  fitLabel = "Fit View",
  fitIcon = <Maximize size={16} />,
  portalTarget,
}: {
  onFit?: (duration: number) => void;
  fitLabel?: string;
  fitIcon?: ReactNode;
  /** A dock outside the canvas can host the controls while retaining the xyflow context. */
  portalTarget?: HTMLElement | null;
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const minZoomReached = useStore((state) => state.transform[2] <= state.minZoom);
  const maxZoomReached = useStore((state) => state.transform[2] >= state.maxZoom);
  const zoomLevel = useStore((state) => Math.round(state.transform[2] * 100));
  const controls = (
    <Controls
      showZoom={false}
      showFitView={false}
      showInteractive={false}
      orientation="horizontal"
      position="bottom-left"
      className={portalTarget ? "canvas-zoom canvas-controls-docked" : "canvas-zoom"}
      style={portalTarget ? { position: "static", margin: 0 } : undefined}
    >
      <ControlButton
        className="react-flow__controls-zoomout"
        title="Zoom Out"
        aria-label="Zoom Out"
        disabled={minZoomReached}
        onClick={() => void zoomOut({ duration: motionDuration() })}
      >
        <Minus size={16} />
      </ControlButton>
      <span className="canvas-zoom-level">
        <span className="visually-hidden">Zoom </span>
        {zoomLevel}%
      </span>
      <ControlButton
        className="react-flow__controls-zoomin"
        title="Zoom In"
        aria-label="Zoom In"
        disabled={maxZoomReached}
        onClick={() => void zoomIn({ duration: motionDuration() })}
      >
        <Plus size={16} />
      </ControlButton>
      <span className="canvas-zoom-divider" aria-hidden="true" />
      <ControlButton
        className="react-flow__controls-fitview"
        title={fitLabel}
        aria-label={fitLabel}
        onClick={() => {
          const duration = motionDuration();
          if (onFit) onFit(duration);
          else void fitView({ duration });
        }}
      >
        {fitIcon}
      </ControlButton>
    </Controls>
  );
  if (portalTarget === null) return null;
  return portalTarget ? createPortal(controls, portalTarget) : controls;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run features/shared/canvas-controls.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Style the pill once for every canvas**

`app/layout.tsx` imports xyflow's stylesheet after `globals.css`, so the button rule needs four
classes to outrank xyflow's own horizontal border rule. Add to `apps/web/app/globals.css`,
directly after the `.react-flow .react-flow__attribution a { … }` rule:

```css
/*
 * The zoom pill every xyflow canvas shares (`features/shared/canvas-controls.tsx`). xyflow's own
 * variables carry its colours, so it follows the theme tokens. The four-class button selector
 * outranks xyflow's horizontal button border, which loads after this file.
 */
.react-flow__controls.canvas-zoom {
  --xy-controls-button-background-color: transparent;
  --xy-controls-button-background-color-hover: var(--surface-subtle);
  --xy-controls-button-color: var(--muted);
  --xy-controls-button-color-hover: var(--foreground);
  --xy-controls-box-shadow: 0 4px 18px rgb(0 0 0 / 8%);
  align-items: center;
  gap: 2px;
  margin: 16px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
}
.react-flow__controls.canvas-zoom.horizontal .react-flow__controls-button {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
}
.react-flow__controls.canvas-zoom .react-flow__controls-button:disabled {
  opacity: 0.4;
}
.react-flow__controls.canvas-zoom .react-flow__controls-button svg {
  width: 16px;
  height: 16px;
  max-width: none;
  max-height: none;
  fill: none;
}
.canvas-zoom-level {
  min-width: 44px;
  color: var(--muted);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.canvas-zoom-divider {
  width: 1px;
  height: 20px;
  margin-inline: 4px;
  background: var(--border);
}
/* Phones need both the pill and the project's tool bar on one row. */
@media (max-width: 380px) {
  .canvas-zoom-level,
  .canvas-zoom-divider {
    display: none;
  }
}
```

- [ ] **Step 6: Place the board's pill at the bottom left**

In `apps/web/features/board/board.css`:

1. In `.board-tool-dock { … }` (the desktop rule), change `align-items: center;` to
   `align-items: flex-start;` and add `bottom: 16px;` after `top: var(--board-header-space);`.
2. Delete the whole block that starts with the comment
   `/* The canvas remains full bleed beneath two floating control cards. */`: the rules
   `.board-zoom-dock .react-flow__controls`, `.board-zoom-dock .react-flow__controls-button`,
   `.board-zoom-dock .react-flow__controls-button:hover`,
   `.board-zoom-dock .react-flow__controls-button svg`, and the
   `@media (max-width: 900px), (max-height: 700px) { .board-zoom-dock .react-flow__controls { … } }`
   that follows them. In its place add:

```css
/* On a wide board the rail's column runs to the bottom, where the shared zoom pill sits. */
.board-zoom-dock {
  margin-top: auto;
}
```

3. In the `@media (max-width: 900px), (max-height: 700px)` rule for `.board-tool-dock` (the one that
   sets `top: auto; bottom: 12px; left: 50%;`), add `align-items: center;`. There the rail is a
   bottom bar and the pill stays centred below it, as before.

In `apps/web/features/board/board-canvas-controls.tsx`, change
`fitIcon={<CornerUpLeft size={13} />}` to `fitIcon={<CornerUpLeft size={16} />}`.

- [ ] **Step 7: Let the Playground use the shared pill**

In `apps/web/features/playground/playground.css`, delete the rules
`.playground-canvas .react-flow__controls { … }` and
`.playground-canvas .react-flow__controls-button { … }`.

- [ ] **Step 8: Assert the board placement in the browser**

In `apps/web/tests/e2e/board-views.spec.ts`, inside the `geometry` object returned by
`page.locator(".board-page").evaluate(...)`, add after `zoomBelowToolbar`:

```ts
            zoomAtBottomLeft:
              !zoom ||
              innerWidth <= 900 ||
              innerHeight <= 700 ||
              (Math.abs(workArea.bottom - 16 - zoom.bottom) <= 1 &&
                Math.abs(zoom.left - dock.left) <= 1),
```

and after `expect(geometry.zoomBelowToolbar).toBe(true);` add
`expect(geometry.zoomAtBottomLeft).toBe(true);`.

- [ ] **Step 9: Run the unit gate and the browser suites that drive zoom**

Run: `npx vitest run features/shared features/board features/playground`
Expected: PASS.

Run: `npx playwright test tests/e2e/board-views.spec.ts tests/e2e/brand-canvas-final.spec.ts tests/e2e/project-creation-cards.spec.ts tests/e2e/playground.spec.ts --output=../outputs/pw-zoom`
Expected: all pass (`playground.spec.ts` still expects the old slide keyframes and passes until
Task 9).

- [ ] **Step 10: Update the documentation**

- `apps/web/features/shared/README.md`: replace the `CanvasControls` paragraph with:

```md
`CanvasControls` (`canvas-controls.tsx`) is one horizontal pill at the bottom left: Zoom Out, the
live zoom level (a whole percent in tabular figures, hidden at 380 px and narrower), Zoom In, a
divider and the fit button. Moves animate over 200 ms, or immediately when reduced motion is
requested. Zoom buttons respect the current canvas limits. The optional `onFit(duration)`,
`fitLabel` and `fitIcon` preserve the board's custom readable framing and return icon. Its look
lives in `app/globals.css` (`.canvas-zoom`) and takes its colours from the theme tokens through
xyflow's variables. The optional `portalTarget` mounts the same pill in the board's tool dock,
which places it at the bottom left of a wide board and below the rail's bottom bar on small
screens; a null target waits for the dock to mount, and omitting it keeps the in-canvas position
for the other consumers.
```

- `apps/web/features/board/README.md`: replace "reduced-motion-aware zoom/fit controls" with "the
  shared zoom pill (bottom left on wide boards, below the rail's bottom bar on small screens)".
- `docs/architecture/design-system.md`, "Canvas identity header": replace "Canvas has a second
  floating card for zoom and fit directly below the main toolbar." with "Canvas has the shared zoom
  pill (zoom out, zoom level, zoom in, fit) at the bottom left of the work area, under the rail's
  column."; in "Canvas grid and navigation" replace "The shared zoom/fit controls animate over
  200 ms" with "The shared zoom pill (zoom out, live zoom level, zoom in, fit) animates over 200 ms".

- [ ] **Step 11: Run the gate and commit**

Run: `npm run check`
Expected: PASS.

```bash
git add apps/web/features/shared/canvas-controls.tsx apps/web/features/shared/canvas-controls.test.tsx apps/web/app/globals.css apps/web/features/board/board.css apps/web/features/board/board-canvas-controls.tsx apps/web/features/playground/playground.css apps/web/tests/e2e/board-views.spec.ts apps/web/features/shared/README.md apps/web/features/board/README.md docs/architecture/design-system.md
git commit -m "feat(canvas): show zoom as one horizontal pill with the live level on every canvas" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Project tool bar at the bottom of the canvas

**Files:**
- Create: `apps/web/features/projects/project-tool-bar.tsx`
- Test: `apps/web/features/projects/project-tool-bar.test.tsx` (create)
- Modify: `apps/web/features/projects/project-header.tsx`
- Modify: `apps/web/features/projects/project-page.tsx`
- Modify: `apps/web/features/projects/projects.css`
- Modify: `apps/web/tests/e2e/project-feedback.spec.ts`
- Modify docs: `apps/web/features/projects/README.md`, `docs/architecture/design-system.md`

**Interfaces:**
- Consumes: `ProjectPanelKind` from `./project-panel`; the page's `changePanel`, `panel` and
  `quickActions` (the Playground button, which carries `playgroundTrigger`); `.canvas-zoom`
  (Task 7) in the browser test.
- Produces:
  `ProjectToolBar({ panel, onPanel, disabled, children }: { panel: ProjectPanelKind | null; onPanel: (panel: ProjectPanelKind | null) => void; disabled: boolean; children: ReactNode })`.
  `ProjectHeader` loses its `panel`, `onPanel` and `quickActions` props.

- [ ] **Step 1: Write the failing test**

Create `apps/web/features/projects/project-tool-bar.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectToolBar } from "./project-tool-bar";

const playground = (
  <button type="button" className="icon-button" aria-label="Playground">
    P
  </button>
);

describe("ProjectToolBar", () => {
  it("groups details, conversation and the page's own actions in that order", () => {
    render(
      <ProjectToolBar panel={null} onPanel={vi.fn()} disabled={false}>
        {playground}
      </ProjectToolBar>,
    );
    const group = screen.getByRole("group", { name: "Project actions" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Project details", "Conversation", "Playground"]);
  });

  it("opens a closed panel and closes the open one", async () => {
    const user = userEvent.setup();
    const onPanel = vi.fn();
    const { rerender } = render(
      <ProjectToolBar panel={null} onPanel={onPanel} disabled={false}>
        {playground}
      </ProjectToolBar>,
    );
    await user.click(screen.getByRole("button", { name: "Conversation" }));
    expect(onPanel).toHaveBeenLastCalledWith("conversation");
    rerender(
      <ProjectToolBar panel="conversation" onPanel={onPanel} disabled={false}>
        {playground}
      </ProjectToolBar>,
    );
    const conversation = screen.getByRole("button", { name: "Conversation" });
    expect(conversation).toHaveAttribute("aria-expanded", "true");
    expect(conversation).toHaveClass("selected");
    expect(screen.getByRole("button", { name: "Project details" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await user.click(conversation);
    expect(onPanel).toHaveBeenLastCalledWith(null);
    await user.click(screen.getByRole("button", { name: "Project details" }));
    expect(onPanel).toHaveBeenLastCalledWith("details");
  });

  it("disables both panel buttons while the Playground covers the project", () => {
    render(
      <ProjectToolBar panel={null} onPanel={vi.fn()} disabled>
        {playground}
      </ProjectToolBar>,
    );
    expect(screen.getByRole("button", { name: "Project details" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Conversation" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run features/projects/project-tool-bar.test.tsx`
Expected: FAIL, `Failed to resolve import "./project-tool-bar"`.

- [ ] **Step 3: Write the bar**

Create `apps/web/features/projects/project-tool-bar.tsx`:

```tsx
"use client";

import { Info, MessageSquare } from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectPanelKind } from "./project-panel";

/**
 * The project's tools float at the bottom of its canvas, as on a design canvas: the two side
 * panels, a divider, then the page's own actions (the Playground).
 */
export function ProjectToolBar({
  panel,
  onPanel,
  disabled,
  children,
}: {
  panel: ProjectPanelKind | null;
  onPanel: (panel: ProjectPanelKind | null) => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <div className="project-tool-bar" role="group" aria-label="Project actions">
      <button
        type="button"
        className={`icon-button ${panel === "details" ? "selected" : ""}`}
        disabled={disabled}
        aria-label="Project details"
        title="Project details"
        aria-expanded={panel === "details"}
        onClick={() => onPanel(panel === "details" ? null : "details")}
      >
        <Info size={20} />
      </button>
      <button
        type="button"
        className={`icon-button ${panel === "conversation" ? "selected" : ""}`}
        disabled={disabled}
        aria-label="Conversation"
        title="Conversation"
        aria-expanded={panel === "conversation"}
        onClick={() => onPanel(panel === "conversation" ? null : "conversation")}
      >
        <MessageSquare size={20} />
      </button>
      <span className="project-tool-bar-divider" aria-hidden="true" />
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run features/projects/project-tool-bar.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Take the icons out of the header**

In `apps/web/features/projects/project-header.tsx`:

1. Change the lucide import to `import { ArrowLeft } from "lucide-react";`, delete
   `import type { ProjectPanelKind } from "./project-panel";`, and change
   `import type { ReactNode, Ref } from "react";` to `import type { Ref } from "react";`.
2. Remove `panel`, `onPanel` and `quickActions` from the destructured props and from the props
   type.
3. Replace the whole `<div className="project-header-actions" role="group" aria-label="Project actions"> … </div>`
   block with:

```tsx
          <div className="project-header-actions">
            <label className="visually-hidden" htmlFor="deliverable-filter">
              Filter deliverable
            </label>
            <select
              id="deliverable-filter"
              disabled={playgroundOpen}
              value={format}
              onChange={(event) => onFormat(event.target.value)}
            >
              <option value="">All deliverables</option>
              {deliverables.map((deliverable) => (
                <option key={deliverable.id} value={deliverable.id}>
                  {deliverable.name}
                </option>
              ))}
            </select>
          </div>
```

The card no longer holds a group of actions; the name **Project actions** moves to the bottom bar.

- [ ] **Step 6: Render the bar in the project canvas**

In `apps/web/features/projects/project-page.tsx`:

1. Add `import { ProjectToolBar } from "./project-tool-bar";` below the `ProjectHeader` import.
2. In the `<ProjectHeader … />` element, delete the lines `panel={panel}`,
   `onPanel={changePanel}` and `quickActions={quickActions}`.
3. Inside `<div className={`project-canvas…`}>`, directly after the
   `{versions.length === 0 && ( … )}` block and before that div closes, add:

```tsx
                  <ProjectToolBar panel={panel} onPanel={changePanel} disabled={playgroundOpen}>
                    {quickActions}
                  </ProjectToolBar>
```

`quickActions` stays as it is and is still passed to `DesignViewer` as `actions`. Only one of the
two is mounted at a time, so `playgroundTrigger` keeps restoring focus after the Playground closes.

- [ ] **Step 7: Style the bar**

In `apps/web/features/projects/projects.css`, delete the two now-unused rules
`.project-header-actions .icon-button { … }` and `.project-header-actions .selected { … }`. Then add
after the `.canvas-drop-hint { … }` rule:

```css
/*
 * Project tools float at the bottom of the canvas, centred in whatever width the side panel leaves.
 * Icons normalise to 20 px so the page's own actions match the bar's buttons.
 */
.project-tool-bar {
  position: absolute;
  z-index: 6;
  bottom: 16px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: 0 6px 24px rgb(0 0 0 / 10%);
  transform: translateX(-50%);
}
.project-tool-bar .icon-button {
  width: var(--control-height);
  height: var(--control-height);
  flex-basis: var(--control-height);
  border-radius: 10px;
}
.project-tool-bar .icon-button svg {
  width: 20px;
  height: 20px;
}
.project-tool-bar .icon-button.selected {
  background: var(--surface-subtle);
  color: var(--foreground);
  box-shadow: inset 0 0 0 1px var(--border);
}
.project-tool-bar-divider {
  width: 1px;
  height: 24px;
  margin-inline: 4px;
  background: var(--border);
}
/* On phones the bar keeps touch-sized buttons and moves right, clear of the zoom pill. */
@media (max-width: 639px) {
  .project-tool-bar {
    right: 12px;
    bottom: 12px;
    left: auto;
    transform: none;
  }
  .project-tool-bar .icon-button {
    width: var(--control-height-touch);
    height: var(--control-height-touch);
    flex-basis: var(--control-height-touch);
  }
}
```

- [ ] **Step 8: Move the layout check to the bottom bar**

In `apps/web/tests/e2e/project-feedback.spec.ts`, in the `.project-chrome` evaluate:

1. Replace

```ts
            const actions = element
              .querySelector('[aria-label="Project actions"]')!
              .getBoundingClientRect();
            const filter = element.querySelector("select")!.getBoundingClientRect();
            const playground = element
              .querySelector('[aria-label="Playground"]')!
              .getBoundingClientRect();
```

with

```ts
            const actions = element
              .querySelector(".project-header-actions")!
              .getBoundingClientRect();
```

2. Delete the condition lines

```ts
              filter.right <= playground.left &&
              Math.abs(
                (filter.top + filter.bottom) / 2 - (playground.top + playground.bottom) / 2,
              ) < 2 &&
```

3. Directly after that `await expect.poll(…).toBe(true);` for the chrome, add:

```ts
      // The project's tools float at the bottom of the canvas, clear of the zoom pill.
      await expect
        .poll(() =>
          page.locator(".project-canvas").evaluate((canvas) => {
            const bounds = canvas.getBoundingClientRect();
            const bar = canvas.querySelector(".project-tool-bar")!.getBoundingClientRect();
            const zoom = canvas.querySelector(".canvas-zoom")!.getBoundingClientRect();
            return (
              bar.left >= bounds.left &&
              bar.right <= bounds.right &&
              bar.bottom <= Math.min(bounds.bottom, innerHeight) &&
              (bar.left >= zoom.right || bar.right <= zoom.left)
            );
          }),
        )
        .toBe(true);
      await expect(
        page
          .getByRole("group", { name: "Project actions" })
          .getByRole("button", { name: "Playground", exact: true }),
      ).toBeVisible();
```

4. Where the test asserts `await expect(page.locator(".project-toolbar")).toHaveCount(0);` while
   reviewing a design, add below it:

```ts
      await expect(page.locator(".project-tool-bar")).toHaveCount(0);
```

This test already runs at 1600×1000, 1024×700, 390×844, 320×640 and 844×390, with an axe check,
so it pins Review Focus 4.

- [ ] **Step 9: Run the checks**

Run: `npx vitest run features/projects`
Expected: PASS.

Run: `npx playwright test tests/e2e/project-feedback.spec.ts tests/e2e/playground.spec.ts tests/e2e/sabre-demo.spec.ts tests/e2e/workspace-actions.spec.ts --output=../outputs/pw-toolbar`
Expected: `project-feedback` and `playground` pass. `sabre-demo` and `workspace-actions` pass,
except for `workspace-actions`' known overlay-count assertions (compare with the handoff's
Evidence); a failure on a button name or a layout check is real.

- [ ] **Step 10: Update the documentation**

- `apps/web/features/projects/README.md`: replace "row places Working files / Shared with client
  on the left and All deliverables beside the action icons on the right. These groups wrap on narrow
  screens and remain reachable above the canvas." with "row places Working files / Shared with
  client on the left and All deliverables on the right; both wrap on narrow screens and remain
  reachable above the canvas. Project details, Conversation and Playground live in
  `project-tool-bar.tsx`, a floating bar (group **Project actions**) at the bottom centre of the
  canvas, centred in the width the side panel leaves. The open panel's button is selected. On phones
  it moves to the bottom right with touch-sized buttons, clear of the zoom pill. It is not shown
  while reviewing a design; the viewer keeps its own Playground button."
- `docs/architecture/design-system.md`, "Canvas identity header": replace "Channel controls sit
  below on the left; All deliverables, Playground, details and conversation sit on the right. During
  design review, a compact deliverable toolbar replaces this row and includes Playground." with
  "Channel controls sit below on the left and All deliverables on the right. Project details,
  Conversation and Playground sit in a floating tool bar at the bottom centre of the canvas: a
  16 px-radius pill with 40 px buttons, a divider before Playground and the open panel's button
  selected, after the Higgsfield canvas the user chose, in the product's monochrome palette. On
  phones it moves to the bottom right. During design review, a compact deliverable toolbar replaces
  the channel row and the bar, and includes Playground."

- [ ] **Step 11: Run the gate and commit**

Run: `npm run check`
Expected: PASS.

```bash
git add apps/web/features/projects/project-tool-bar.tsx apps/web/features/projects/project-tool-bar.test.tsx apps/web/features/projects/project-header.tsx apps/web/features/projects/project-page.tsx apps/web/features/projects/projects.css apps/web/tests/e2e/project-feedback.spec.ts apps/web/features/projects/README.md docs/architecture/design-system.md
git commit -m "feat(project): move project tools into a bar at the bottom of the canvas" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Playground rises from the bottom

**Files:**
- Modify: `apps/web/features/playground/playground.css` (the two keyframes)
- Modify: `apps/web/tests/e2e/playground.spec.ts` (two expectations)
- Modify docs: `apps/web/features/playground/README.md`, `apps/web/features/projects/README.md`,
  `docs/architecture/design-system.md`, `docs/architecture/sitemap.md`

**Interfaces:**
- Consumes: the `playground-layer-enter` and `playground-layer-exit` keyframe names, which
  `playground-board.test.tsx` and `use-playground-close-lifecycle.ts` rely on. Keep the names.
- Produces: nothing new.

- [ ] **Step 1: Change the browser expectations**

In `apps/web/tests/e2e/playground.spec.ts`, test "Playground slides over the entire viewport and
preserves the project underneath":

- `expect(entry).toEqual(["translateY(-100%)", "translateY(0px)"]);` becomes
  `expect(entry).toEqual(["translateY(100%)", "translateY(0px)"]);`
- `expect(exit).toEqual(["translateY(0px)", "translateY(-100%)"]);` becomes
  `expect(exit).toEqual(["translateY(0px)", "translateY(100%)"]);`

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/playground.spec.ts -g "slides over the entire viewport" --output=../outputs/pw-rise`
Expected: FAIL, received `["translateY(-100%)", "translateY(0px)"]`.

- [ ] **Step 3: Reverse the slide**

In `apps/web/features/playground/playground.css`:

```css
@keyframes playground-layer-enter {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
@keyframes playground-layer-exit {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(100%);
  }
}
```

Durations, easing, `data-phase` handling and the reduced-motion rule stay as they are.

- [ ] **Step 4: Run the Playground checks**

Run: `npx playwright test tests/e2e/playground.spec.ts --output=../outputs/pw-rise`
Expected: all pass, including focus returning to the Playground button (now in the bottom bar) and
the reduced-motion duration check.

Run: `npx vitest run features/playground`
Expected: PASS.

- [ ] **Step 5: Update the documentation**

- `apps/web/features/playground/README.md`: replace "It slides down from the screen's top edge on
  entry and up before invoking `onClose` once" with "It rises from the screen's bottom edge on
  entry, the edge its button sits at in the project's bottom bar, and slides back down before
  invoking `onClose` once".
- `apps/web/features/projects/README.md`: replace "The project-owned Playground board slides down
  over the entire viewport" with "The project-owned Playground board rises from the bottom over the
  entire viewport", and "Closing slides it up" with "Closing slides it back down".
- `docs/architecture/design-system.md`, "Playground canvas": replace "slides down over the entire
  viewport and slides up on close" with "rises from the bottom over the entire viewport and slides
  back down on close".
- `docs/architecture/sitemap.md`: replace "sliding down over the entire viewport" with "rising
  from the bottom over the entire viewport".

- [ ] **Step 6: Run the gate and commit**

Run: `npm run check`
Expected: PASS.

```bash
git add apps/web/features/playground/playground.css apps/web/tests/e2e/playground.spec.ts apps/web/features/playground/README.md apps/web/features/projects/README.md docs/architecture/design-system.md docs/architecture/sitemap.md
git commit -m "feat(playground): rise from the bottom edge and slide back down on close" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Visual audit, theming documentation and handoff (orchestrator)

**Files:**
- Modify: `docs/architecture/design-system.md` (theming section, dark column, browser minimums)
- Create: `docs/verification/themes-and-canvas-2026-09-24.md`
- Create: a few final images under `docs/verification/screenshots/themes-and-canvas/`
- Modify: `docs/engineering/handoff.md` (and move superseded entries to its history file)
- Any stylesheet the audit shows needs a fix (each fix goes in its own `fix(theme): …` commit)

**Interfaces:**
- Consumes: everything above.
- Produces: the verification record and an updated handoff.

- [ ] **Step 1: Capture both themes**

Save this as `audit.mjs` in the session's scratchpad directory, never in the repository, and run
`node audit.mjs /Users/wendleywilson/DawesStudios/outputs/canvas-theme/after` from there:

```js
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("/Users/wendleywilson/DawesStudios/apps/web/package.json");
const { chromium } = require("@playwright/test");
const env = Object.fromEntries(
  readFileSync("/Users/wendleywilson/DawesStudios/supabase/.env.local", "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^"|"$/g, "")];
    }),
);
const out = process.argv[2];
mkdirSync(out, { recursive: true });
const base = "http://localhost:3003";
const client = "e4401a17-cbe2-1d70-400d-d40f9e6b8632"; // SABRE (local demonstration data)
const project = "e40dce57-dc41-4212-a92b-7372b261f6e9"; // Campus Welcome Campaign
const browser = await chromium.launch();
for (const theme of ["light", "dark"])
  for (const [width, height] of [[1440, 900], [900, 700], [390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addInitScript((value) => localStorage.setItem("dawes-theme", value), theme);
    const page = await context.newPage();
    const shot = (name) => page.screenshot({ path: `${out}/${theme}-${name}-${width}.png` });
    await page.goto(`${base}/login`);
    await page.waitForTimeout(800);
    await shot("login");
    await page.getByLabel("Email address").fill("studio@dawes.local");
    await page.getByLabel("Password", { exact: true }).fill(env.DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(/\/(home|clients\/[^/]+\/board)$/);
    for (const [name, path] of [
      ["home", "/home"],
      ["briefings", `/clients/${client}/briefings`],
      ["reviews", `/clients/${client}/reviews`],
      ["credits", `/clients/${client}/credits`],
      ["settings", "/settings"],
    ]) {
      await page.goto(base + path);
      await page.waitForTimeout(2000);
      await shot(name);
    }
    await page.goto(`${base}/clients/${client}/board`);
    await page.waitForTimeout(2500);
    await shot("board-list");
    await page.getByRole("button", { name: "Canvas view" }).click();
    await page.waitForTimeout(2500);
    await shot("board-canvas");
    // Leave the studio's saved board view as List, the way the user left it.
    await page.getByRole("button", { name: "List view" }).click();
    await page.goto(`${base}/projects/${project}`);
    await page.waitForTimeout(3000);
    await shot("project");
    await page.getByRole("button", { name: "Conversation", exact: true }).click();
    await page.waitForTimeout(800);
    await shot("project-conversation");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Playground", exact: true }).click();
    await page.waitForTimeout(1500);
    await shot("playground");
    await page.getByRole("button", { name: "Back to project", exact: true }).click();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: /^Open Portrait Feed/ }).first().click();
    await page.waitForTimeout(2500);
    await shot("viewer");
    await context.close();
  }
await browser.close();
```

Expected: 66 images (11 views × 2 themes × 3 sizes) in `outputs/canvas-theme/after/`.

- [ ] **Step 2: Audit every image**

Check alignment, spacing, contrast, light patches in dark mode, dark patches in light mode, client
logos on their plate, native controls (selects, checkboxes, date inputs), focus rings, the zoom
pill, the tool bar and the dot density at each size. Compare the light images with
`outputs/canvas-theme/before/`: the light theme must look as it did, apart from dots, the zoom pill
and the bar. Fix each defect in its stylesheet, add the case to `theme-colors.test.ts` when a rule
can express it, re-run Step 1 for the affected view, and commit each fix separately.

- [ ] **Step 3: Run the full verification**

Run from `apps/web`:

- `npm run check`
- `npx playwright test tests/e2e/theme.spec.ts tests/e2e/playground.spec.ts tests/e2e/project-feedback.spec.ts tests/e2e/board-views.spec.ts tests/e2e/production-workflow.spec.ts tests/e2e/console-errors.spec.ts tests/e2e/video-designs.spec.ts tests/e2e/brand-canvas-final.spec.ts tests/e2e/project-creation-cards.spec.ts tests/e2e/client-navigation.spec.ts --output=../outputs/pw-final`

Expected: every check passes. Record the exact counts.

- [ ] **Step 4: Document the theming rules**

In `docs/architecture/design-system.md`:

1. Add a **Dark** column to the "Shared tokens" table with the values from Task 3 (and the canvas
   rows from Task 6), and a row for `--on-ink` (`#fff` / `#131416`: text on filled `--ink`
   controls).
2. Add a subsection **Light and dark themes** after the token table covering: `light-dark()` tokens
   with `color-scheme` on `:root`; `data-theme` pinned by the head script in `app/layout.tsx`; the
   sidebar switch; feature-only colours as `light-dark()` in their own stylesheet and shared ones as
   tokens; the surfaces that stay the same in both themes (dark sidebar, comment pins, video
   letterboxing, text selection); black-only shadows; the client-logo plate; the gate
   `features/shared/theme-colors.test.ts`; and the browser minimums (Chrome 123, Safari 17.5,
   Firefox 120), beside the product's existing reliance on the top-layer `<dialog>` and `inert`.
3. Replace "Client artwork may have its own brand colors; application navigation, buttons, charts,
   and canvas controls remain monochrome." with the same sentence followed by "Both themes keep that
   rule; neither recolours artwork."

- [ ] **Step 5: Write the verification record**

Copy five final images to `docs/verification/screenshots/themes-and-canvas/` (dark project at 1440,
light project at 1440, dark board canvas at 1440, dark Playground at 1440, dark project at 390) and
write `docs/verification/themes-and-canvas-2026-09-24.md` with: scope (spec and plan links), checks
executed with their results (Step 3), the images cited, audit findings and fixes, and remaining
gaps. Commit only the cited images.

- [ ] **Step 6: Update the handoff**

Update `docs/engineering/handoff.md` (100 lines or fewer): add the commits of this plan to "Done
today", record the checks from Step 3 under Evidence as run in this session, and set the next
action. Move superseded entries to the current history file.

- [ ] **Step 7: Commit**

```bash
git add docs/architecture/design-system.md docs/verification/themes-and-canvas-2026-09-24.md docs/verification/screenshots/themes-and-canvas docs/engineering/handoff.md docs/engineering/history
git commit -m "docs(theme): record the theming rules, the audit and the handoff" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

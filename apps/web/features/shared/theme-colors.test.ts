import { readdirSync, readFileSync } from "node:fs";
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

function cssUnder(directory: string): string[] {
  return readdirSync(join(webRoot, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : cssUnder(path);
    return entry.name.endsWith(".css") ? [path] : [];
  });
}
const stylesheets = [...cssUnder("app"), ...cssUnder("features")];

const themeIndependent: Record<string, string> = {
  "::selection": "White on the dark olive highlight reads on either theme.",
  ".login-story": "The login story panel always uses the dark sidebar colour.",
  ".sidebar-collapse:hover:not(:disabled)": "The sidebar is dark in both themes.",
  ".profile-bar strong": "The sidebar is dark in both themes.",
  ".profile-bar .icon-button:hover": "The sidebar is dark in both themes.",
  ".mobile-sidebar-close:hover:not(:disabled)": "The sidebar is dark in both themes.",
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
    // A shadow's or mask's black is only an opacity ramp, so it reads the same on either theme.
    const offending =
      property.endsWith("shadow") || property.startsWith("mask")
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
    // The token block's selector list also names `.dark-surface`, which re-declares the same tokens.
    .filter(
      ({ selector, property }) =>
        selector.split(",").some((part) => part.trim() === ":root") && property.startsWith("--"),
    )
    .map(({ property, value }) => [property, value] as const),
);
const token = (name: string) => sides(tokens.get(name) ?? "");

describe("every colour has a dark value", () => {
  it.each(stylesheets)("%s writes each colour for both themes", (path) => {
    expect(violations(path)).toEqual([]);
  });

  it("finds every stylesheet", () => {
    expect(stylesheets).toContain("app/globals.css");
    expect(stylesheets.length).toBeGreaterThanOrEqual(19);
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

/** A pair side: a `light-dark()` value on a stylesheet rule, or a `:root` token. */
function colourOf(path: string, selector: string, property: string): [string, string] {
  if (selector === ":root") return token(property);
  const found = declarations(read(path)).find(
    (declaration) => declaration.selector === selector && declaration.property === property,
  );
  if (!found) throw new Error(`No ${property} on ${selector} in ${path}`);
  return sides(found.value.match(/light-dark\([^()]*\)/)?.[0] ?? found.value);
}

describe("feature text keeps WCAG AA contrast in both themes", () => {
  const playground = "features/playground/playground.css";
  const timeline = "features/board/timeline.css";
  const briefings = "features/briefings/briefings.css";
  it.each([
    [
      playground,
      ".playground-item-status",
      "color",
      playground,
      ".playground-item-note",
      "background",
    ],
    [playground, ".playground-item-status", "color", "", ":root", "--surface"],
    [
      playground,
      ".playground-item-status.is-error",
      "color",
      playground,
      ".playground-item-note",
      "background",
    ],
    [playground, ".playground-item-status.is-error", "color", "", ":root", "--surface"],
    [timeline, ".timeline-day", "color", "", ":root", "--surface"],
    [timeline, ".timeline-day.today", "color", timeline, ".timeline-day.today", "background"],
    [timeline, ".timeline-no-work", "color", "", ":root", "--surface"],
    [briefings, ".briefing-summary strong", "color", "", ":root", "--surface"],
    [briefings, ".briefing-save-status", "color", "", ":root", "--surface"],
    [
      "features/competitors/competitors.css",
      ".competitor-initial",
      "color",
      "features/competitors/competitors.css",
      ".competitor-initial",
      "background",
    ],
    ["features/settings/settings.css", ".settings-success", "color", "", ":root", "--surface"],
  ])(
    "%s %s on %s %s",
    (textPath, textSelector, textProperty, surfacePath, surfaceSelector, surfaceProperty) => {
      const [lightText, darkText] = colourOf(textPath, textSelector, textProperty);
      const [lightSurface, darkSurface] = colourOf(surfacePath, surfaceSelector, surfaceProperty);
      expect(contrast(lightText, lightSurface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(darkText, darkSurface)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

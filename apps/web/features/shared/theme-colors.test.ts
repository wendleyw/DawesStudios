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

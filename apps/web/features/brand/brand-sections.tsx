"use client";

import Link from "next/link";
import { ArrowUpRight, BookOpen, Type } from "lucide-react";
import { useId, useState } from "react";
import type { Json } from "@database";
import {
  formatBrandColor,
  makeBrandContext,
  matchesBrandSearch,
  readPalette,
  readProducts,
  readScale,
  safeFontFamily,
  safeFontSource,
  textList,
  textValue,
  type ColorCopyFormat,
  type EditableSectionId,
} from "./brand-model";
import { AssetPreview } from "./brand-assets";
import { useBrandAssets, type BrandSection } from "./brand-data";
import { CopyButton } from "@/features/shared/copy-button";

/** Sections whose reference link is filtered, and so need to know whether it resolves to anything. */
const sectionsLinkingFilteredAssets = new Set(["logos", "visual-style", "products"]);

function GuidanceList({
  title,
  items,
  copyable = false,
}: {
  title: string;
  items: string[];
  copyable?: boolean;
}) {
  return (
    <section className="brand-panel">
      <div className="brand-inline-heading">
        <h3>{title}</h3>
        {copyable && items.length > 0 && (
          <CopyButton text={items.join("\n")} label={`Copy ${title.toLowerCase()}`} />
        )}
      </div>
      {items.length ? (
        <ul className="brand-guidance-list">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="brand-muted">No guidance added yet.</p>
      )}
    </section>
  );
}

export function BrandSectionContent({
  clientId,
  clientName,
  section,
  content,
  sections,
}: {
  clientId: string;
  clientName: string;
  section: EditableSectionId;
  content: Json | undefined;
  sections: BrandSection[];
}) {
  const [colorFormat, setColorFormat] = useState<ColorCopyFormat>("hex");
  const [sample, setSample] = useState("Every detail, considered.");
  const logoFilesId = useId();
  const assets = useBrandAssets(clientId, sectionsLinkingFilteredAssets.has(section));
  const hasAssets = (category: string, search = "") =>
    (assets.data ?? []).some((asset) => matchesBrandSearch(asset, search, category));
  if (section === "overview")
    return (
      <div className="brand-content-stack">
        <section className="brand-overview-hero">
          <h2>{textValue(content, "name", clientName)}</h2>
          <p className="brand-tagline">{textValue(content, "tagline")}</p>
          <p>
            {textValue(content, "description", "Add the essentials that make this brand its own.")}
          </p>
          <div className="brand-tags">
            {textList(content, "tone").map((tone, i) => (
              <span key={i}>{tone}</span>
            ))}
          </div>
        </section>
        <div className="brand-two-columns">
          <section className="brand-panel">
            <h3>Audience</h3>
            <p>
              {textValue(content, "audience", "An audience description has not been added yet.")}
            </p>
          </section>
          <GuidanceList title="Brand principles" items={textList(content, "rules")} />
        </div>
        <Link className="brand-context-link" href={`/clients/${clientId}/brand/assets`}>
          <BookOpen size={18} />
          <span>
            <strong>Brand assets</strong>
            <span>Browse approved files and reference materials.</span>
          </span>
          <ArrowUpRight size={18} />
        </Link>
      </div>
    );
  if (section === "logos") {
    const logos = (assets.data ?? []).filter((asset) => asset.category === "Logo");
    return (
      <div className="brand-content-stack">
        <section className="brand-panel">
          <h3>Logo usage</h3>
          <p>{textValue(content, "guidance", "Logo usage guidance has not been added yet.")}</p>
        </section>
        <GuidanceList title="Approved variations" items={textList(content, "variants")} />
        {logos.length > 0 && (
          <section className="brand-panel">
            <div className="brand-inline-heading">
              <h3 id={logoFilesId}>Logo files</h3>
              <Link className="button" href={`/clients/${clientId}/brand/assets?category=Logo`}>
                Find logo files
                <ArrowUpRight size={15} />
              </Link>
            </div>
            {/* The files themselves, so the Logos page shows the logos rather than only links. */}
            <ul className="brand-logo-files" aria-labelledby={logoFilesId}>
              {logos.map((asset) => (
                <li key={asset.id}>
                  <AssetPreview asset={asset} decorative />
                  <span>{asset.name}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }
  if (section === "colors")
    return (
      <div className="brand-content-stack">
        <div className="brand-inline-heading">
          <p className="brand-muted">A consistent palette, ready to use.</p>
          <label>
            Copy format
            <select
              aria-label="Copy format"
              value={colorFormat}
              onChange={(event) => setColorFormat(event.target.value as ColorCopyFormat)}
            >
              <option value="hex">HEX</option>
              <option value="rgb">RGB</option>
              <option value="css">CSS</option>
              <option value="tailwind">Tailwind</option>
            </select>
          </label>
        </div>
        <div className="brand-palette">
          {readPalette(content).map((color, i) => (
            <article className="brand-color-card" key={i}>
              <div className="brand-swatch" style={{ backgroundColor: color.hex }} />
              <div>
                <h3>{color.name}</h3>
                <code>{formatBrandColor(color, colorFormat)}</code>
                <CopyButton
                  text={formatBrandColor(color, colorFormat)}
                  label={`Copy ${color.name}`}
                />
              </div>
            </article>
          ))}
        </div>
        {!readPalette(content).length && (
          <div className="empty-state">
            <p>No brand colors have been added yet.</p>
          </div>
        )}
      </div>
    );
  if (section === "typography")
    return (
      <div className="brand-content-stack">
        <label className="brand-sample-input">
          Try a few words
          <input
            value={sample}
            maxLength={200}
            onChange={(event) => setSample(event.target.value)}
          />
        </label>
        <div className="brand-two-columns">
          {(
            [
              ["heading", "Headings"],
              ["body", "Body copy"],
            ] as const
          ).map(([key, label]) => (
            <section className="brand-panel brand-type-card" key={key}>
              <div className="brand-inline-heading">
                <span className="eyebrow">{label}</span>
                <Type size={17} />
              </div>
              <h3>{textValue(content, key, "System sans-serif")}</h3>
              <p
                className={key === "heading" ? "brand-type-heading" : "brand-type-body"}
                style={{ fontFamily: safeFontFamily(textValue(content, key)) }}
              >
                {sample || "Your words here."}
              </p>
              {safeFontSource(textValue(content, `${key}Source`)) && (
                <a
                  className="button quiet brand-font-source"
                  href={safeFontSource(textValue(content, `${key}Source`))!}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {label} font source
                  <ArrowUpRight size={14} />
                </a>
              )}
            </section>
          ))}
        </div>
        <section className="brand-panel">
          <h3>Type scale</h3>
          <div className="brand-type-scale">
            {readScale(content).map((size, i) => (
              <span key={i}>
                <strong>{size}</strong>
                <span>px</span>
              </span>
            ))}
          </div>
          <p className="brand-muted">Font previews use fonts available on your device.</p>
        </section>
      </div>
    );
  if (section === "visual-style")
    return (
      <div className="brand-content-stack">
        <section className="brand-panel">
          <h3>Photography direction</h3>
          <p>
            {textValue(content, "photography", "Photography direction has not been added yet.")}
          </p>
        </section>
        <GuidanceList title="Visual principles" items={textList(content, "principles")} />
        <div className="brand-two-columns">
          <GuidanceList title="Use" items={textList(content, "use")} />
          <GuidanceList title="Avoid" items={textList(content, "avoid")} />
        </div>
        {hasAssets("Photography") && (
          <Link className="button" href={`/clients/${clientId}/brand/assets?category=Photography`}>
            Explore reference files
            <ArrowUpRight size={15} />
          </Link>
        )}
      </div>
    );
  if (section === "products")
    return (
      <div className="brand-content-stack">
        {readProducts(content).map((product, i) => (
          <section className="brand-panel brand-product" key={i}>
            <span className="eyebrow">Product {String(i + 1).padStart(2, "0")}</span>
            <h3>{product.name}</h3>
            <p>{product.description}</p>
            <div className="brand-two-columns">
              <div>
                <h4>Specifications</h4>
                <p>{product.specs || "No specifications added."}</p>
              </div>
              <div>
                <h4>Usage guidance</h4>
                <p>{product.rules || "No usage guidance added."}</p>
              </div>
            </div>
            {hasAssets("", product.name) && (
              <Link
                className="button quiet"
                href={`/clients/${clientId}/brand/assets?search=${encodeURIComponent(product.name)}`}
              >
                View product assets
                <ArrowUpRight size={15} />
              </Link>
            )}
          </section>
        ))}
        {!readProducts(content).length && (
          <div className="empty-state">
            <p>No products have been added yet.</p>
          </div>
        )}
      </div>
    );
  if (section === "messaging")
    return (
      <div className="brand-content-stack">
        {(
          [
            ["headline", "Headline"],
            ["description", "Supporting message"],
            ["cta", "Call to action"],
          ] as const
        ).map(([key, label]) => (
          <section key={key} className="brand-panel brand-message">
            <div className="brand-inline-heading">
              <h3>{label}</h3>
              <CopyButton text={textValue(content, key)} label="Copy text" />
            </div>
            <p>{textValue(content, key, "No approved copy added yet.")}</p>
          </section>
        ))}
        <div className="brand-two-columns">
          <GuidanceList
            title="Preferred terminology"
            items={textList(content, "terminology")}
            copyable
          />
          <GuidanceList title="Messaging rules" items={textList(content, "rules")} copyable />
        </div>
      </div>
    );
  return (
    <div className="brand-content-stack">
      <section className="brand-panel">
        <div className="brand-inline-heading">
          <h3>Take your brand context with you.</h3>
          <CopyButton text={makeBrandContext(clientName, sections)} label="Copy brand context" />
        </div>
        <p>Bring the voice, audience, and brand guidance into your next creative task.</p>
      </section>
      <section className="brand-panel">
        <h3>Brand instructions</h3>
        <p className="brand-preline">
          {textValue(content, "instructions", "No additional instructions have been added.")}
        </p>
      </section>
      <div className="brand-two-columns">
        <GuidanceList title="Use" items={textList(content, "use")} />
        <GuidanceList title="Never" items={textList(content, "never")} />
      </div>
      <details className="brand-panel">
        <summary>Preview the complete context</summary>
        <pre className="brand-context-preview">{makeBrandContext(clientName, sections)}</pre>
      </details>
    </div>
  );
}

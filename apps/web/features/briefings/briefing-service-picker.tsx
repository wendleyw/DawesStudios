"use client";

import {
  ArrowLeft,
  Check,
  Clapperboard,
  FileText,
  Megaphone,
  Monitor,
  Palette,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { SearchField } from "@/features/shared/search-field";
import { estimateLabel, type ServiceDefinition } from "./briefing-model";
import { categoryExamples, searchServices, serviceCategories } from "./service-categories";

/** A category's icon; a category the catalog adds later falls back to the generic one. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "Social & ads": Megaphone,
  Video: Clapperboard,
  "Web & email": Monitor,
  Documents: FileText,
  "Brand & print": Palette,
};

/**
 * The Service step: the catalog's categories first, then only the chosen category's services, so a
 * client reads a handful of choices at a time rather than the whole catalog. A search skips the
 * categories and matches services across all of them. A draft that already has a service opens on
 * that service's category.
 */
export function BriefingServicePicker({
  catalog,
  selectedId,
  onSelect,
}: {
  catalog: ServiceDefinition[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const selected = catalog.find((service) => service.id === selectedId);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(selected?.category ?? "");
  const categories = serviceCategories(catalog);
  const open = categories.find((item) => item.name === category);
  const searching = search.trim().length > 0;
  const visible = searching ? searchServices(catalog, search) : (open?.services ?? []);

  return (
    <section className="briefing-service-picker" aria-label="Choose a service">
      <div className="briefing-step-intro">
        <h2>What would you like to create?</h2>
        <p>
          {open && !searching
            ? "Choose a service to get started. You can change it before sending."
            : "Pick a category to see its services, or search for one."}
        </p>
      </div>
      <div className="briefing-service-filters">
        <SearchField
          label="Find a service"
          placeholder="Search services, e.g. social or video"
          iconSize={17}
          value={search}
          onChange={setSearch}
        />
      </div>
      {selected && (
        <div className="briefing-service-choice" role="status">
          <Check size={16} aria-hidden="true" />
          <span>
            Selected: <strong>{selected.name}</strong>
          </span>
        </div>
      )}
      {!searching && !open ? (
        <div className="service-category-grid">
          {categories.map((item) => {
            const Icon = CATEGORY_ICONS[item.name] ?? Sparkles;
            const holdsSelection = item.name === selected?.category;
            return (
              <button
                key={item.name}
                type="button"
                className={`service-category-card${holdsSelection ? " selected" : ""}`}
                onClick={() => setCategory(item.name)}
              >
                <span className="service-category-icon" aria-hidden="true">
                  <Icon size={20} />
                </span>
                <span className="service-category-text">
                  <h3>{item.name}</h3>
                  <span className="service-category-examples">{categoryExamples(item)}</span>
                </span>
                <span className="service-category-count">
                  {item.services.length} {item.services.length === 1 ? "service" : "services"}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          {!searching && open && (
            <div className="service-category-head">
              <button type="button" className="button quiet" onClick={() => setCategory("")}>
                <ArrowLeft size={16} aria-hidden="true" />
                All categories
              </button>
              <h3>{open.name}</h3>
            </div>
          )}
          <div className="service-grid">
            {visible.map((item) => (
              <button
                key={item.id}
                className={`service-card ${selectedId === item.id ? "selected" : ""}`}
                aria-pressed={selectedId === item.id}
                onClick={() => onSelect(item.id)}
              >
                {searching && <span className="eyebrow">{item.category}</span>}
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                <span className="service-card-meta">
                  {estimateLabel(item)}
                  <span>{item.days ? `Est. ${item.days} days` : "Timing to be agreed"}</span>
                </span>
              </button>
            ))}
          </div>
          {searching && !visible.length && (
            <div className="briefing-service-empty">
              <p>No services match your search.</p>
              <button className="button" onClick={() => setSearch("")}>
                Show all categories
              </button>
            </div>
          )}
        </>
      )}
      <p className="briefing-note">
        Sending a briefing is free. The studio will confirm the budget before work begins.
      </p>
    </section>
  );
}

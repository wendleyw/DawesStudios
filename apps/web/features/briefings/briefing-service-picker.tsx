"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { SearchField } from "@/features/shared/search-field";
import { estimateLabel, type ServiceDefinition } from "./briefing-model";

export function BriefingServicePicker({
  catalog,
  selectedId,
  onSelect,
}: {
  catalog: ServiceDefinition[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const categories = [...new Set(catalog.map((service) => service.category))];
  const selected = catalog.find((service) => service.id === selectedId);
  const visible = catalog.filter(
    (service) =>
      (!category || service.category === category) &&
      `${service.name} ${service.description} ${service.category}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <section className="briefing-service-picker" aria-label="Choose a service">
      <div className="briefing-step-intro">
        <h2>What would you like to create?</h2>
        <p>Choose a service to get started. You can change it before sending.</p>
      </div>
      <div className="briefing-service-filters">
        <SearchField
          label="Find a service"
          placeholder="Search services, e.g. social or video"
          iconSize={17}
          value={search}
          onChange={setSearch}
        />
        <select
          aria-label="Service category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
      {selected && (
        <div className="briefing-service-choice" role="status">
          <Check size={16} aria-hidden="true" />
          <span>
            Selected: <strong>{selected.name}</strong>
          </span>
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
            <span className="eyebrow">{item.category}</span>
            <h3>{item.name}</h3>
            <p>{item.description}</p>
            <span className="service-card-meta">
              {estimateLabel(item)}
              <span>{item.days ? `Est. ${item.days} days` : "Timing to be agreed"}</span>
            </span>
          </button>
        ))}
      </div>
      {!visible.length && (
        <div className="briefing-service-empty">
          <p>No services match your search.</p>
          <button
            className="button"
            onClick={() => {
              setSearch("");
              setCategory("");
            }}
          >
            Show all services
          </button>
        </div>
      )}
      <p className="briefing-note">
        Sending a briefing is free. The studio will confirm the budget before work begins.
      </p>
    </section>
  );
}

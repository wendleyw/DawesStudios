import type { ServiceDefinition } from "./briefing-model";

/** One category of the service catalog, with its services in catalog order. */
export type ServiceCategory = { name: string; services: ServiceDefinition[] };

/** The order the Service step offers categories in; one the catalog adds later goes before Other. */
const CATEGORY_ORDER = ["Social & ads", "Video", "Web & email", "Documents", "Brand & print"];
const LAST_CATEGORY = "Other";

function categoryRank(name: string): number {
  if (name === LAST_CATEGORY) return CATEGORY_ORDER.length + 1;
  const index = CATEGORY_ORDER.indexOf(name);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

/**
 * The catalog grouped by `category`, so the Service step can offer a handful of categories before
 * any individual service. Services keep catalog order inside their category.
 */
export function serviceCategories(catalog: ServiceDefinition[]): ServiceCategory[] {
  const groups = new Map<string, ServiceDefinition[]>();
  for (const service of catalog) {
    const group = groups.get(service.category);
    if (group) group.push(service);
    else groups.set(service.category, [service]);
  }
  return [...groups]
    .map(([name, services]) => ({ name, services }))
    .sort((a, b) => categoryRank(a.name) - categoryRank(b.name) || a.name.localeCompare(b.name));
}

/** A category card's hint: its first few service names, e.g. "Social post, static ad, animated ad". */
export function categoryExamples(category: ServiceCategory, count = 3): string {
  const names = category.services.slice(0, count).map((service) => service.name);
  const more = category.services.length > count ? "…" : "";
  return `${names.join(", ")}${more}`;
}

/** Services whose name, description or category contain the search, across every category. */
export function searchServices(catalog: ServiceDefinition[], search: string): ServiceDefinition[] {
  const term = search.trim().toLowerCase();
  if (!term) return catalog;
  return catalog.filter((service) =>
    `${service.name} ${service.description} ${service.category}`.toLowerCase().includes(term),
  );
}

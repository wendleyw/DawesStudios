import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { credentials, evidenceDirectory, localAgency, localCaller, signIn } from "./test-support";

test("all ten clients and twenty-five projects render with matching records and scoped navigation", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const agency = await localAgency();
  const clients = (
    await agency.from("clients").select("id,slug,name").eq("archived", false).order("name")
  ).data!;
  const projects = (
    await agency.from("projects").select("id,client_id,title,status").order("title")
  ).data!;
  const deliverables = (await agency.from("deliverables").select("id,project_id")).data!;
  expect(clients).toHaveLength(10);
  expect(projects).toHaveLength(25);
  const timings: { role: string; projectId: string; milliseconds: number }[] = [];
  const errors: string[] = [];
  const actors = [
    { email: credentials.agency, role: "agency", clientId: null },
    ...clients.map((client) => ({
      email: `${client.slug}@client.dawes.local`,
      role: "client",
      clientId: client.id,
    })),
    { email: credentials.designer, role: "designer", clientId: null },
    { email: credentials.designer2, role: "designer", clientId: null },
  ];
  for (const actor of actors) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await signIn(page, actor.email);
      if (actor.role === "designer")
        await expect(page.getByRole("heading", { level: 1 })).toHaveText("My work");
      const caller = await localCaller(actor.email);
      const allowed = (await caller.from("projects").select("id,title,client_id").order("title"))
        .data!;
      if (actor.role === "client") {
        // Nine workspaces carry the uniform pair; SABRE carries the seven the reference documents.
        expect(allowed).toHaveLength(
          projects.filter((project) => project.client_id === actor.clientId).length,
        );
        expect(allowed.every((project) => project.client_id === actor.clientId)).toBe(true);
      }
      for (const project of allowed) {
        const start = performance.now();
        await page.goto(`/projects/${project.id}`);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(project.title);
        await expect(page.locator(".project-canvas .react-flow__renderer")).toBeVisible();
        timings.push({
          role: actor.role,
          projectId: project.id,
          milliseconds: Math.round(performance.now() - start),
        });
        const count = deliverables.filter((item) => item.project_id === project.id).length;
        await expect(page.locator(".react-flow__node-deliverable")).toHaveCount(count);
        if (actor.role === "agency" && count > 1) {
          const selected = deliverables.find((item) => item.project_id === project.id)!;
          await page.getByLabel("Filter deliverable").selectOption(selected.id);
          await expect(page.locator(".react-flow__node-deliverable")).toHaveCount(1);
          await page.getByLabel("Filter deliverable").selectOption("");
          await expect(page.locator(".react-flow__node-deliverable")).toHaveCount(count);
        }
        if (actor.role === "client") {
          await expect(
            page.getByRole("button", { name: "Working files", exact: true }),
          ).toHaveCount(0);
          await page.getByRole("button", { name: "Conversation", exact: true }).click();
          await expect(page.locator(".comment-list .comment").first()).toBeVisible();
        }
      }
      if (actor.role === "client") {
        const versions = (
          await caller.from("published_versions").select("id,deliverable_id,version_number")
        ).data!;
        const reviews = (await caller.from("publication_reviews").select("publication_id,status"))
          .data!;
        const latest = new Map<string, (typeof versions)[number]>();
        for (const version of versions)
          if (
            !latest.has(version.deliverable_id) ||
            latest.get(version.deliverable_id)!.version_number < version.version_number
          )
            latest.set(version.deliverable_id, version);
        const decided = (status: string) =>
          [...latest.values()].filter(
            (version) =>
              reviews.find((review) => review.publication_id === version.id)?.status === status,
          ).length;
        const approved = decided("approved");
        const sentBack = decided("changes_requested");
        // Waiting for you holds only the versions still waiting on the client's decision; one the
        // client sent back is waiting on the studio.
        await page.goto(`/clients/${actor.clientId}/reviews`);
        await expect(page.locator(".review-card")).toHaveCount(latest.size - approved - sentBack);
        await page.getByRole("button", { name: "With the studio", exact: true }).click();
        await expect(page.locator(".review-card")).toHaveCount(sentBack);
        await page.getByRole("button", { name: "Approved", exact: true }).click();
        await expect(page.locator(".review-card")).toHaveCount(approved);
      }
      await page.goto("/search");
      const known = allowed[0];
      await page.getByLabel("Search your workspace").fill(known.title);
      await expect(page.locator(`.search-result[href="/projects/${known.id}"]`)).toBeVisible();
      if (actor.role !== "agency") {
        // The title has to match nothing this actor may read, which is not the same as belonging to
        // another workspace. SABRE's projects carry bare names like "Brand Guidelines", and search
        // covers brand assets too, so "Brand Guidelines" finds Acme's own "Sample brand
        // guidelines". A title that names another workspace cannot collide with anything in this
        // one, so the negative case is taken from those.
        const forbidden = projects.find(
          (project) =>
            !allowed.some((item) => item.id === project.id) && project.title.includes(" / "),
        )!;
        await page.getByLabel("Search your workspace").fill(forbidden.title);
        await expect(page.locator(`.search-result[href="/projects/${forbidden.id}"]`)).toHaveCount(
          0,
        );
        await expect(page.getByRole("heading", { name: "No matches yet." })).toBeVisible();
        await page.goto(`/projects/${forbidden.id}?channel=client`);
        await expect(page.getByRole("heading", { name: "Project unavailable." })).toBeVisible();
      }
    } finally {
      await context.close();
    }
  }
  expect(errors).toEqual([]);
  const sorted = timings.map((item) => item.milliseconds).sort((a, b) => a - b);
  const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)];
  expect(p95).toBeLessThan(5000);
  writeFileSync(
    join(evidenceDirectory, "canonical-browser-evidence.json"),
    JSON.stringify(
      {
        clients: clients.length,
        projects: projects.length,
        authenticatedActors: actors.length,
        projectVisits: timings.length,
        p95Milliseconds: p95,
        consoleErrors: errors,
        timings,
      },
      null,
      2,
    ) + "\n",
  );
});

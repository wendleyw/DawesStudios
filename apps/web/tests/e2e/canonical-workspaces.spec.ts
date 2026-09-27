import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { credentials, evidenceDirectory, localAgency, localCaller, signIn } from "./test-support";
import { versionGroupKey } from "@/features/shared/version-row";

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
  expect(clients).toHaveLength(10);
  expect(projects).toHaveLength(25);
  const shared = assertMiroModel(projects, await readMiroModel(agency));
  // A few canonical projects keep a Drive link, on one channel or the other (or both); every link
  // is a drive.google.com one and every row names a real channel.
  const drive = (await agency.from("project_drive_links").select("channel,url")).data!;
  expect(drive.length).toBeGreaterThanOrEqual(3);
  expect(drive.every((row) => /^https:\/\/drive\.google\.com\/\S*$/.test(row.url))).toBe(true);
  expect(drive.every((row) => row.channel === "internal" || row.channel === "client")).toBe(true);
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
      if (actor.role === "designer") {
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Welcome back/);
        await expect(page.locator(".page-heading .eyebrow")).toHaveText("My work");
      }
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
        await expect(page.getByRole("group", { name: "Project actions" })).toBeVisible();
        timings.push({
          role: actor.role,
          projectId: project.id,
          milliseconds: Math.round(performance.now() - start),
        });
        if (actor.role === "client") {
          await expect(
            page.getByRole("button", { name: "Working files", exact: true }),
          ).toHaveCount(0);
          // The client sees the client versions the studio shared, or that nothing is shared yet.
          if (shared.has(project.id))
            await expect(page.getByRole("group", { name: "Client versions" })).toContainText(
              `V${shared.get(project.id)}`,
            );
          else
            await expect(
              page.getByText("Nothing shared yet. Your studio will share designs here."),
            ).toBeVisible();
        } else {
          // Every canonical project has a design board, so the studio and its designer open on it.
          await expect(page.locator("iframe.miro-view-frame")).toHaveAttribute("src", /miro\.com/);
        }
        if (actor.role === "client") {
          await page.getByRole("button", { name: "Comments", exact: true }).click();
          await expect(page.locator(".comment-list .comment").first()).toBeVisible();
        }
      }
      if (actor.role === "client") {
        const versions = (
          await caller.from("published_versions").select("id,project_id,version_number")
        ).data!;
        const reviews = (await caller.from("publication_reviews").select("publication_id,status"))
          .data!;
        const latest = new Map<string, (typeof versions)[number]>();
        for (const version of versions) {
          const key = versionGroupKey(version);
          if (!latest.has(key) || latest.get(key)!.version_number < version.version_number)
            latest.set(key, version);
        }
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
      if (actor.role !== "agency") {
        // A project this actor may not read stays unavailable when opened by its direct URL.
        const forbidden = projects.find(
          (project) => !allowed.some((item) => item.id === project.id),
        )!;
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

type MiroModel = {
  boards: { id: string; project_id: string; designer_id: string }[];
  assignments: { project_id: string; designer_id: string }[];
  rounds: { id: string; project_id: string; board_id: string | null; status: string }[];
  versions: { id: string; project_id: string; version_number: number }[];
  reviews: { publication_id: string; status: string }[];
};

async function readMiroModel(agency: Awaited<ReturnType<typeof localAgency>>): Promise<MiroModel> {
  const read = async <T>(query: PromiseLike<{ data: T | null; error: unknown }>) => {
    const result = await query;
    expect(result.error).toBeNull();
    return result.data!;
  };
  return {
    boards: await read(agency.from("design_boards").select("id,project_id,designer_id")),
    assignments: await read(agency.from("project_assignments").select("project_id,designer_id")),
    // The author column is not readable through the API, so rounds are read by named columns.
    rounds: await read(agency.from("design_versions").select("id,project_id,board_id,status")),
    versions: await read(agency.from("published_versions").select("id,project_id,version_number")),
    reviews: await read(agency.from("publication_reviews").select("publication_id,status")),
  };
}

/**
 * The status mapping the seed replays through the real RPCs (`miro_history` in
 * supabase/scripts/build_seed.py): one design board per assigned designer on every project; planned
 * and in-progress work holds boards only; internal review keeps one or two rounds per board with
 * the studio; a later status ends on the client version whose review it names, every earlier
 * version sent back, and each version shared from one round. Returns each project's latest client
 * version number.
 */
function assertMiroModel(
  projects: { id: string; title: string; status: string }[],
  model: MiroModel,
): Map<string, number> {
  const latest = new Map<string, number>();
  const decision: Record<string, string> = {
    client_review: "pending",
    changes_requested: "changes_requested",
    approved: "approved",
    delivered: "approved",
  };
  for (const project of projects) {
    const boards = model.boards.filter((board) => board.project_id === project.id);
    const designers = model.assignments
      .filter((row) => row.project_id === project.id)
      .map((row) => row.designer_id)
      .sort();
    expect(boards.length, project.title).toBeGreaterThan(0);
    expect(boards.map((board) => board.designer_id).sort(), project.title).toEqual(designers);
    const rounds = model.rounds.filter((round) => round.project_id === project.id);
    const perBoard = boards.map(
      (board) => rounds.filter((round) => round.board_id === board.id).length,
    );
    expect(rounds.every((round) => boards.some((board) => board.id === round.board_id))).toBe(true);
    expect(new Set(perBoard).size, project.title).toBe(1);
    const versions = model.versions
      .filter((version) => version.project_id === project.id)
      .sort((a, b) => a.version_number - b.version_number);
    const decisions = versions.map(
      (version) => model.reviews.find((review) => review.publication_id === version.id)?.status,
    );
    if (project.status === "planned" || project.status === "in_progress") {
      expect([rounds.length, versions.length], project.title).toEqual([0, 0]);
    } else if (project.status === "internal_review") {
      expect([1, 2], project.title).toContain(perBoard[0]);
      expect(new Set(rounds.map((round) => round.status)), project.title).toEqual(
        new Set(["submitted"]),
      );
      expect(versions, project.title).toEqual([]);
    } else {
      expect(decisions.at(-1), project.title).toBe(decision[project.status]);
      expect(
        decisions.slice(0, -1).every((status) => status === "changes_requested"),
        project.title,
      ).toBe(true);
      expect(perBoard[0], project.title).toBe(versions.length);
      latest.set(project.id, versions.at(-1)!.version_number);
    }
    // A round reads "Shared" exactly when a client version was made from it.
    expect(rounds.filter((round) => round.status === "reviewed").length, project.title).toBe(
      versions.length,
    );
  }
  return latest;
}

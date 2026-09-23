import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fileURLToPath } from "node:url";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";
import { credentials, localAdmin, localAgency, screenshotDirectory, signIn } from "./test-support";

const preview = fileURLToPath(new URL("../fixtures/campaign-preview.png", import.meta.url));

test("creation cards sit beside designs and below versions, and shared actions keep publications immutable", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const fixture = await createProductionFixture(await localAgency());
  const studioContext = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    reducedMotion: "reduce",
  });
  const clientContext = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const studio = await studioContext.newPage();
  const client = await clientContext.newPage();
  const renderingErrors: string[] = [];
  for (const page of [studio, client]) {
    page.on("pageerror", (error) => renderingErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") renderingErrors.push(message.text());
    });
  }
  const internalClientRequests: string[] = [];
  client.on("request", (request) => {
    if (/\/rest\/v1\/(designs|design_versions)\?/.test(request.url()))
      internalClientRequests.push(request.url());
  });
  try {
    await signIn(studio, credentials.agency);
    await signIn(client, credentials.client);
    await studio.goto(`/projects/${fixture.projectId}`);
    const addVersion = studio.getByRole("button", {
      name: "New version for Campaign square",
      exact: true,
    });
    await expect(studio.locator(".deliverable-header button")).toHaveCount(0);
    await addVersion.click();
    await studio.getByLabel("Version note", { exact: true }).fill("First working version.");
    await studio.getByRole("button", { name: "Create version", exact: true }).click();
    await expect(studio.getByRole("dialog")).toHaveCount(0);
    await expect(studio.locator(".project-add-design")).toHaveCount(1);
    for (const title of ["First direction", "Second direction"]) {
      await studio.getByRole("button", { name: "Add design to version 1", exact: true }).click();
      await studio.getByLabel("Design name", { exact: true }).fill(title);
      await studio.getByLabel("Design file").setInputFiles(preview);
      await studio
        .getByRole("dialog")
        .getByRole("button", { name: "Add design", exact: true })
        .click();
      await expect(studio.getByRole("dialog")).toHaveCount(0);
    }
    await expect(studio.locator(".version-label header button")).toHaveCount(0);
    for (const [width, height] of [
      [1600, 1000],
      [390, 844],
    ]) {
      await studio.setViewportSize({ width, height });
      await studio.getByRole("button", { name: "Fit View", exact: true }).click();
      await expect
        .poll(() =>
          studio.locator(".project-canvas").evaluate((element) => {
            const row = element.querySelector(".version-card")!.getBoundingClientRect();
            const images = [...element.querySelectorAll(".design-preview")].map((node) =>
              node.getBoundingClientRect(),
            );
            const addDesign = element.querySelector(".project-add-design")!.getBoundingClientRect();
            const addVersion = element
              .querySelector(".project-add-version")!
              .getBoundingClientRect();
            return (
              addDesign.left > Math.max(...images.map((rect) => rect.right)) &&
              Math.abs(addDesign.top - images[0].top) < 1 &&
              addVersion.top > row.bottom &&
              Math.abs(addVersion.left - row.left) < 1
            );
          }),
        )
        .toBe(true);
      expect((await new AxeBuilder({ page: studio }).analyze()).violations).toEqual([]);
      await studio.screenshot({
        path: `${screenshotDirectory}/project-creation-working-${width}.png`,
      });
    }
    await studio.setViewportSize({ width: 1600, height: 1000 });
    await studio.getByRole("button", { name: "Fit View", exact: true }).click();
    await studio.getByRole("button", { name: "Share with client", exact: true }).click();
    await studio.getByLabel("A note for the client").fill("Two directions for review.");
    await studio.getByRole("button", { name: "Share version", exact: true }).click();
    await expect(studio.getByRole("dialog")).toHaveCount(0);
    const snapshot = await localAdmin
      .from("published_designs")
      .select("*")
      .eq("project_id", fixture.projectId)
      .order("id");
    expect(snapshot.error).toBeNull();
    expect(snapshot.data).toHaveLength(2);
    await studio.getByRole("button", { name: "Shared with client", exact: true }).click();
    await expect(studio.locator(".project-add-design")).toHaveCount(1);
    await expect(studio.locator(".project-add-version")).toContainText("In Working files");
    await studio.screenshot({ path: `${screenshotDirectory}/project-creation-shared-1600.png` });
    await studio
      .getByRole("button", { name: "Add design in working files for Campaign square", exact: true })
      .click();
    await expect(studio.getByRole("button", { name: "Working files", exact: true })).toHaveClass(
      "active",
    );
    await studio.getByLabel("Design name", { exact: true }).fill("Private third direction");
    await studio.getByLabel("Design file").setInputFiles(preview);
    await studio
      .getByRole("dialog")
      .getByRole("button", { name: "Add design", exact: true })
      .click();
    await expect(studio.getByRole("dialog")).toHaveCount(0);
    await expect(studio.locator(".design-preview")).toHaveCount(3);
    await studio.getByRole("button", { name: "Shared with client", exact: true }).click();
    await addVersion.click();
    await expect(studio.getByRole("button", { name: "Working files", exact: true })).toHaveClass(
      "active",
    );
    await studio.getByRole("checkbox").uncheck();
    await studio
      .getByLabel("Version note", { exact: true })
      .fill("A new private version from shared review.");
    await studio.getByRole("button", { name: "Create version", exact: true }).click();
    await expect(studio.getByRole("dialog")).toHaveCount(0);
    await expect(studio.locator(".version-card")).toHaveCount(2);
    await expect(studio.locator(".project-add-design")).toHaveCount(2);
    const after = await localAdmin
      .from("published_designs")
      .select("*")
      .eq("project_id", fixture.projectId)
      .order("id");
    expect(after.error).toBeNull();
    expect(after.data).toEqual(snapshot.data);
    await client.goto(`/projects/${fixture.projectId}`);
    await expect(client.locator(".design-preview")).toHaveCount(2);
    await expect(client.locator(".version-card")).toHaveCount(1);
    await expect(client.locator(".project-add-design, .project-add-version")).toHaveCount(0);
    expect(internalClientRequests).toEqual([]);
    expect(renderingErrors).toEqual([]);
    await client.screenshot({ path: `${screenshotDirectory}/project-creation-client-1600.png` });
  } finally {
    await Promise.all([studioContext.close(), clientContext.close()]);
    await cleanupTestProject(fixture.projectId);
  }
});

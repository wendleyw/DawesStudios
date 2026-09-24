import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { existsSync, readFileSync } from "node:fs";
import { boardViews } from "../../features/board/board-views";
import {
  credentials,
  isDevelopmentTimingNoise,
  localAgency,
  preserveBoardPreference,
  screenshotDirectory,
  signIn,
} from "./test-support";

const stateFile = new URL("../../../../supabase/.local/sabre-demo/state.json", import.meta.url);
const active =
  existsSync(stateFile) && JSON.parse(readFileSync(stateFile, "utf8")).phase === "complete";
const clientId = "e4401a17-cbe2-1d70-400d-d40f9e6b8632";
test.skip(!active, "The optional local SABRE demonstration overlay is not active.");
test.use({ reducedMotion: "reduce" });

for (const role of ["agency", "client"] as const) {
  test(`${role} can explore all fifty demo projects in five responsive views`, async ({ page }) => {
    test.setTimeout(120_000);
    const restore = await preserveBoardPreference(credentials[role], clientId);
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      if (!isDevelopmentTimingNoise(error.message)) errors.push(error.message);
    });
    try {
      await signIn(page, credentials[role]);
      await page.goto(`/clients/${clientId}/board`);
      for (const width of [1600, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        for (const view of boardViews) {
          const button = page.getByRole("button", { name: view.label, exact: true });
          await button.click();
          await expect(button).toBeEnabled();
          await expect(button).toHaveAttribute("aria-pressed", "true");
          if (view.id === "list") await expect(page.locator(".project-row")).toHaveCount(50);
          if (view.id === "canvas")
            await expect(page.locator(".board-canvas .react-flow__node-project")).toHaveCount(50);
          if (view.id === "kanban")
            await expect(
              page.getByRole("group", { name: "Projects by status", exact: true }),
            ).toBeVisible();
          if (view.id === "calendar")
            await expect(
              page.getByRole("region", { name: "Project calendar", exact: true }),
            ).toBeVisible();
          if (view.id === "timeline")
            await expect(
              page.getByRole("region", { name: "Project timeline", exact: true }),
            ).toBeVisible();
          await expect
            .poll(() =>
              page.evaluate(() => ({
                width: document.documentElement.scrollWidth <= innerWidth + 1,
                height: document.documentElement.scrollHeight <= innerHeight + 1,
              })),
            )
            .toEqual({ width: true, height: true });
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
          await page.screenshot({
            path: `${screenshotDirectory}/sabre-demo-${role}-${view.id}-${width}.png`,
          });
        }
      }
      expect(errors).toEqual([]);
    } finally {
      await restore();
    }
  });

  test(`${role} sees demo artwork, revisions, motion and related workspace content`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const agency = await localAgency();
    const result = await agency.from("projects").select("id,title").eq("client_id", clientId);
    expect(result.error).toBeNull();
    const find = (title: string) => {
      const id = result.data?.find((p) => p.title === title)?.id;
      if (!id) throw new Error("Missing demonstration project: " + title);
      return id;
    };
    const errors: string[] = [];
    const forbidden: string[] = [];
    page.on("pageerror", (error) => {
      if (!isDevelopmentTimingNoise(error.message)) errors.push(error.message);
    });
    page.on("request", (request) => {
      if (
        role === "client" &&
        /\/rest\/v1\/(designs|design_versions|project_assignments|internal_comments)\?/.test(
          request.url(),
        )
      )
        forbidden.push(request.url());
    });
    await signIn(page, credentials[role]);
    for (const title of [
      "Campus Welcome Campaign",
      "Trail Weekend Social Series",
      "Saturday Run Motion Reel",
    ]) {
      await page.goto(`/projects/${find(title)}`);
      await expect(page.locator(".design-preview").first()).toBeVisible();
      await expect
        .poll(() =>
          page
            .locator(".design-preview img")
            .evaluateAll(
              (images) =>
                images.length > 0 &&
                images.every(
                  (image) =>
                    (image as HTMLImageElement).complete &&
                    (image as HTMLImageElement).naturalWidth > 0,
                ),
            ),
        )
        .toBe(true);
      if (title === "Trail Weekend Social Series")
        await expect(page.locator(".version-card")).toHaveCount(4);
      if (role === "client")
        await expect(page.locator(".project-add-design, .project-add-version")).toHaveCount(0);
      if (role === "agency")
        await expect(page.locator(".project-add-design").first()).toBeVisible();
      await page.screenshot({
        path: `${screenshotDirectory}/sabre-demo-${role}-project-${title.split(" ")[0].toLowerCase()}.png`,
      });
      if (title === "Saturday Run Motion Reel") {
        await page
          .locator(".design-preview")
          .filter({ hasText: "Campaign motion" })
          .first()
          .locator(".design-preview-artwork")
          .dblclick();
        const video = page.locator("video.artwork-video");
        await expect(video).toBeVisible();
        await expect
          .poll(() =>
            video.evaluate(
              (element) =>
                Number.isFinite((element as HTMLVideoElement).duration) &&
                (element as HTMLVideoElement).duration >= 14,
            ),
          )
          .toBe(true);
        await video.evaluate(async (element) => {
          const clip = element as HTMLVideoElement;
          clip.muted = true;
          await clip.play();
        });
        await expect
          .poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime))
          .toBeGreaterThan(0);
        await page.screenshot({ path: `${screenshotDirectory}/sabre-demo-${role}-video.png` });
      }
    }
    for (const section of [
      "briefings",
      "reviews",
      "assets",
      "credits",
      "brand/overview",
      "brand/assets",
      "brand/templates",
    ]) {
      await page.goto(`/clients/${clientId}/${section}`);
      await expect(page.locator(".client-navigation")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      if (section === "brand/assets") {
        await expect
          .poll(() =>
            page
              .getByRole("img", { name: "Campus Connections - Campaign photography", exact: true })
              .evaluate(
                (image) =>
                  (image as HTMLImageElement).complete &&
                  (image as HTMLImageElement).naturalWidth > 0,
              ),
          )
          .toBe(true);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await page.screenshot({
        path: `${screenshotDirectory}/sabre-demo-${role}-${section.replaceAll("/", "-")}.png`,
      });
    }
    await page.goto(`/projects/${find("Campus Welcome Campaign")}`);
    await page.getByRole("button", { name: "Playground", exact: true }).click();
    await expect(page.getByText("Creative starting point", { exact: true })).toBeVisible();
    await page.screenshot({ path: `${screenshotDirectory}/sabre-demo-${role}-playground.png` });
    expect(forbidden).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("an assigned designer opens populated working files on desktop and mobile", async ({
  page,
}) => {
  const agency = await localAgency();
  const result = await agency
    .from("projects")
    .select("id")
    .eq("client_id", clientId)
    .eq("title", "Run Club Launch Kit")
    .single();
  expect(result.error).toBeNull();
  await signIn(page, credentials.designer);
  await page.goto(`/projects/${result.data!.id}`);
  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await expect(page.locator(".design-preview").first()).toBeVisible();
    await expect(page.locator(".project-add-design").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Shared with client", exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: "Share with client", exact: true })).toHaveCount(
      0,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({
      path: `${screenshotDirectory}/sabre-demo-designer-project-${width}.png`,
    });
  }
});

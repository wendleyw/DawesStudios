import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { cleanupTestProject } from "./project-fixture";
import { credentials, localAdmin, localAgency, screenshotDirectory, signIn } from "./test-support";

function value<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("Video loading fixture returned no record.");
  return result.data as NonNullable<T>;
}

/** Direct fixture data measures loading only; it does not claim to verify video sanitization. */
test("video preview loading budget and viewer seeking", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const phase = process.env.VIDEO_LOADING_PHASE ?? "after";
  if (phase === "after") {
    // Exercise the real signing refresh without waiting 55 minutes or advancing Auth's clock.
    await page.addInitScript(() => {
      window.setInterval = new Proxy(window.setInterval, {
        apply(target, receiver, arguments_) {
          if (arguments_[1] === 55 * 60_000) arguments_[1] = 2_000;
          return Reflect.apply(target, receiver, arguments_);
        },
      });
    });
  }
  const title = `Acceptance video loading ${randomUUID()}`;
  const bytes = readFileSync(
    fileURLToPath(new URL("../fixtures/campaign-clip.mp4", import.meta.url)),
  );
  const agency = await localAgency();
  const identity = await agency.auth.getUser();
  if (identity.error || !identity.data.user)
    throw new Error("Video loading fixture requires the agency account.");
  const user = identity.data.user;
  const client = value(
    await localAdmin
      .from("clients")
      .insert({ name: title, slug: `acceptance-video-loading-${randomUUID()}` })
      .select("id")
      .single(),
  );
  let projectId: string | undefined;
  try {
    const project = value(
      await localAdmin
        .from("projects")
        .insert({ client_id: client.id, title, service_type: "static-ad" })
        .select("id")
        .single(),
    );
    projectId = project.id;
    const deliverable = value(
      await localAdmin
        .from("deliverables")
        .insert({
          project_id: project.id,
          name: "Video loading samples",
          format: "landscape",
          width: 640,
          height: 360,
        })
        .select("id")
        .single(),
    );
    for (let version = 1; version <= 4; version++) {
      const row = value(
        await localAdmin
          .from("design_versions")
          .insert({
            project_id: project.id,
            deliverable_id: deliverable.id,
            version_number: version,
            created_by: user.id,
          })
          .select("id")
          .single(),
      );
      for (let index = 0; index < 5; index++) {
        const path = `${project.id}/${randomUUID()}.mp4`;
        value(
          await localAdmin.storage
            .from("internal-assets")
            .upload(path, bytes, { contentType: "video/mp4", upsert: false }),
        );
        value(
          await localAdmin
            .from("designs")
            .insert({
              project_id: project.id,
              version_id: row.id,
              title: `Video loading clip ${String((version - 1) * 5 + index + 1).padStart(2, "0")}`,
              internal_asset_path: path,
              sort_order: index,
              created_by: user.id,
            })
            .select("id")
            .single(),
        );
      }
    }
    await signIn(page, credentials.agency);
    const network = { signingRequests: 0, mediaRequests: 0, mediaResponseBytes: 0 };
    const pending: Promise<void>[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (!path.includes(`/internal-assets/${project.id}/`)) return;
      if (request.method() === "POST" && path.includes("/object/sign/")) network.signingRequests++;
      if (request.method() === "GET" && path.endsWith(".mp4")) network.mediaRequests++;
    });
    page.on("requestfinished", (request) => {
      const path = new URL(request.url()).pathname;
      if (
        request.method() === "GET" &&
        path.includes(`/internal-assets/${project.id}/`) &&
        path.endsWith(".mp4")
      )
        pending.push(
          request.sizes().then((sizes) => {
            network.mediaResponseBytes += sizes.responseBodySize;
          }),
        );
    });
    const startedAt = Date.now();
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("button", { name: /^Open Video loading clip / })).toHaveCount(20);
    // A fixed observation window is part of this performance probe, not an action-readiness wait.
    await page.waitForTimeout(2_000);
    await Promise.all(pending);
    // Scoped to the project canvas: the sidebar's animated brand mark (`video.brand-mark`) is
    // chrome, not a design preview, and must never be counted alongside these.
    const previews = await page.locator(".project-canvas video").evaluateAll((elements) => ({
      videoElements: elements.length,
      metadataPreloads: elements.filter(
        (element) => (element as HTMLVideoElement).preload === "metadata",
      ).length,
      assignedSources: elements.filter((element) => !!element.getAttribute("src")).length,
    }));
    const beforeOpen = { ...network, ...previews, observationMs: Date.now() - startedAt };
    if (phase === "after")
      await page.screenshot({ path: `${screenshotDirectory}/video-project-1600.png` });
    const openedAt = Date.now();
    await page.getByRole("button", { name: "Open Video loading clip 01", exact: true }).click();
    const player = page.locator("video[controls]");
    await expect(player).toHaveCount(1);
    await expect
      .poll(() => player.evaluate((video) => (video as HTMLVideoElement).readyState))
      .toBeGreaterThanOrEqual(1);
    const metadataReadyMs = Date.now() - openedAt;
    await player.evaluate(
      (element) =>
        new Promise<void>((resolve, reject) => {
          const video = element as HTMLVideoElement;
          video.addEventListener("seeked", () => resolve(), { once: true });
          video.addEventListener("error", () => reject(new Error("Viewer seek failed.")), {
            once: true,
          });
          video.currentTime = 2;
        }),
    );
    const playback = await player.evaluate((element) => {
      const video = element as HTMLVideoElement;
      return { currentTime: video.currentTime, duration: video.duration };
    });
    expect(playback.currentTime).toBeCloseTo(2, 1);
    await Promise.all(pending);
    const result = {
      phase,
      fixture: { clips: 20, versions: 4, bytesPerClip: bytes.length },
      beforeOpen,
      afterOpen: { ...network, metadataReadyMs, ...playback },
    };
    if (phase === "baseline") {
      expect(beforeOpen.videoElements).toBe(20);
      expect(beforeOpen.metadataPreloads).toBe(20);
      expect(beforeOpen.mediaRequests).toBeGreaterThan(0);
    }
    if (phase === "after") {
      expect(beforeOpen.signingRequests).toBe(0);
      expect(beforeOpen.videoElements).toBe(0);
      expect(beforeOpen.mediaRequests).toBe(0);
      expect(beforeOpen.mediaResponseBytes).toBe(0);
      let releaseMetadata!: () => void;
      let held = false;
      const metadataGate = new Promise<void>((resolve) => {
        releaseMetadata = resolve;
      });
      await page.route("**/storage/v1/object/sign/internal-assets/**", async (route) => {
        if (!held && route.request().method() === "GET") {
          held = true;
          await metadataGate;
        }
        await route.continue();
      });
      await page.getByRole("button", { name: "Add pin", exact: true }).click();
      const source = await player.getAttribute("src");
      try {
        await expect.poll(() => player.getAttribute("src")).not.toBe(source);
        await expect(page.getByRole("button", { name: "Add pin", exact: true })).toBeDisabled();
        await page
          .locator(".artwork-stage")
          .dispatchEvent("pointerdown", { clientX: 500, clientY: 400 });
        await expect(page.locator(".pending-pin")).toHaveCount(0);
      } finally {
        releaseMetadata();
      }
      await expect
        .poll(() => player.evaluate((element) => (element as HTMLVideoElement).currentTime))
        .toBeCloseTo(2, 1);
      await expect(page.getByRole("button", { name: "Add pin", exact: true })).toBeEnabled();
      await page.unroute("**/storage/v1/object/sign/internal-assets/**");
      expect(await player.evaluate((element) => (element as HTMLVideoElement).paused)).toBe(true);
      await player.evaluate(async (element) => {
        const video = element as HTMLVideoElement;
        video.playbackRate = 0.1;
        await video.play();
      });
      const playingSource = await player.getAttribute("src");
      await expect.poll(() => player.getAttribute("src")).not.toBe(playingSource);
      await expect
        .poll(() =>
          player.evaluate((element) => ({
            playing: !(element as HTMLVideoElement).paused,
            retainedTime: (element as HTMLVideoElement).currentTime >= 2,
          })),
        )
        .toEqual({ playing: true, retainedTime: true });
      await player.evaluate((element) => (element as HTMLVideoElement).pause());
      for (const width of [1600, 390]) {
        await page.setViewportSize({ width, height: width === 1600 ? 1000 : 844 });
        const sidebarWidth = await page
          .locator(".application")
          .evaluate((element) =>
            parseFloat(getComputedStyle(element).getPropertyValue("--sidebar-width")),
          );
        await expect
          .poll(async () => (await page.locator(".workspace").boundingBox())?.x)
          .toBe(width === 1600 ? sidebarWidth : 0);
        await expect(player).toBeVisible();
        await expect
          .poll(() =>
            player.evaluate((element) => {
              const video = element.getBoundingClientRect();
              const canvas = element.closest(".design-canvas")!.getBoundingClientRect();
              const visibleWidth = Math.max(
                0,
                Math.min(video.right, canvas.right) - Math.max(video.left, canvas.left),
              );
              const visibleHeight = Math.max(
                0,
                Math.min(video.bottom, canvas.bottom) - Math.max(video.top, canvas.top),
              );
              return (visibleWidth * visibleHeight) / (video.width * video.height);
            }),
          )
          .toBeGreaterThan(0.98);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
        ).toBeLessThanOrEqual(1);
        if (width === 390)
          await expect
            .poll(async () => (await player.boundingBox())?.width ?? 0)
            .toBeGreaterThan(300);
        await page.screenshot({ path: `${screenshotDirectory}/video-viewer-${width}.png` });
      }
      await page.setViewportSize({ width: 1600, height: 1000 });
      await expect
        .poll(async () => (await page.locator(".workspace").boundingBox())?.x)
        .toBe(
          await page
            .locator(".application")
            .evaluate((element) =>
              parseFloat(getComputedStyle(element).getPropertyValue("--sidebar-width")),
            ),
        );
      let boardSigning = 0;
      page.on("request", (request) => {
        if (
          request.method() === "POST" &&
          new URL(request.url()).pathname.includes("/object/sign/")
        )
          boardSigning++;
      });
      const movieRequests = network.mediaRequests;
      await page.goto(`/clients/${client.id}/board`);
      // A first-time viewer's board now opens as a list (`board-page.tsx`, 2026-09-24); this
      // assertion is about the canvas view's card thumbnails, so select that view explicitly.
      const canvasView = page.getByRole("button", { name: "Canvas view" });
      if ((await canvasView.getAttribute("aria-pressed")) !== "true") await canvasView.click();
      await expect(page.locator(".board-card-media")).toHaveText("Video");
      await expect(page.locator(".board-card-version")).toHaveText("V4");
      await expect(page.locator(".board-card-media img, .board-card-media video")).toHaveCount(0);
      expect(boardSigning).toBe(0);
      expect(network.mediaRequests).toBe(movieRequests);
      await page.screenshot({ path: `${screenshotDirectory}/video-client-board-1600.png` });
    }
    const resultPath = testInfo.outputPath(`video-loading-${phase}.json`);
    writeFileSync(resultPath, JSON.stringify(result, null, 2));
    await testInfo.attach(`video-loading-${phase}`, {
      path: resultPath,
      contentType: "application/json",
    });
    console.log(`Video loading metrics: ${JSON.stringify(result)}`);
  } finally {
    if (projectId) await cleanupTestProject(projectId);
    const found = value(
      await localAdmin.from("clients").select("name").eq("id", client.id).single(),
    );
    if (found.name !== title || !title.startsWith("Acceptance video loading "))
      throw new Error("Refusing to delete an unrelated video loading fixture.");
    const removed = await localAdmin.from("clients").delete().eq("id", client.id);
    if (removed.error) throw new Error(removed.error.message);
  }
});

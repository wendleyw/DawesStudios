import { test, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { credentials, localAdmin, localAgency, localCaller, signIn } from "./test-support";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";

const clip = fileURLToPath(new URL("../fixtures/campaign-clip.mp4", import.meta.url));

/** Seeks a loaded `<video>` to `seconds` and waits for the seek to actually land. */
async function seekVideo(page: Page, seconds: number) {
  await page.locator("video.artwork-video").evaluate(
    (element, target) =>
      new Promise<void>((resolve, reject) => {
        const video = element as HTMLVideoElement;
        const onSeeked = () => {
          video.removeEventListener("error", onError);
          resolve();
        };
        const onError = () => {
          video.removeEventListener("seeked", onSeeked);
          reject(new Error("video failed to load for seeking"));
        };
        video.addEventListener("seeked", onSeeked, { once: true });
        video.addEventListener("error", onError, { once: true });
        if (video.readyState >= 1) video.currentTime = target;
        else
          video.addEventListener(
            "loadedmetadata",
            () => {
              video.currentTime = target;
            },
            { once: true },
          );
      }),
    seconds,
  );
}

test("a video design carries pinned time-coded feedback across all three roles, and publication hides the designer and the internal comment from the client's own REST reads", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [studio, designer, client] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  const errors: string[] = [];
  for (const page of [studio, designer, client])
    page.on("pageerror", (error) => errors.push(error.message));

  // The isolation claim under test is about what the client's own browser is sent over the
  // network, not about what the page renders. Every REST response the client's session receives,
  // from the moment it signs in, is captured here and inspected as text below — a UI check could
  // only prove what was drawn, not what PostgREST actually returned.
  const clientRest: { url: string; body: string }[] = [];
  client.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/rest/v1/")) return;
    void response
      .text()
      .then((body) => clientRest.push({ url, body }))
      .catch(() => undefined);
  });

  try {
    await signIn(studio, credentials.agency);
    await signIn(designer, credentials.designer);
    await signIn(client, credentials.client);

    await designer.goto(`/projects/${fixture.projectId}`);
    await designer.getByRole("button", { name: "New version for Campaign square" }).click();
    await designer
      .getByRole("textbox", { name: "Version note" })
      .fill("Review the campaign cut before it ships.");
    await designer.getByRole("button", { name: "Create version", exact: true }).click();
    await expect(designer.getByRole("dialog")).toHaveCount(0);

    await designer.getByRole("button", { name: "Add design to version 1" }).click();
    await designer.getByRole("textbox", { name: "Design name" }).fill("Campaign cut A");
    await designer.getByLabel("Design file").setInputFiles(clip);
    await designer
      .getByRole("dialog")
      .getByRole("button", { name: "Add design", exact: true })
      .click();
    // The resumable upload and the media service's ffprobe/ffmpeg remux are real work against a
    // real file, not a stub, so this outlasts the suite's default 10 s action timeout.
    await expect(designer.getByRole("dialog")).toHaveCount(0, { timeout: 60_000 });

    await designer.getByRole("button", { name: "Open Campaign cut A" }).click();
    const designerVideo = designer.locator("video.artwork-video");
    await expect(designerVideo).toBeVisible();
    await seekVideo(designer, 1.5);

    await designer.getByRole("button", { name: "Add pin", exact: true }).click();
    await designer.locator(".artwork-stage").click({ position: { x: 60, y: 60 } });
    await designer
      .getByRole("textbox", { name: "Your message" })
      .fill("Internal note: trim this frame before sharing.");
    await designer.getByRole("button", { name: "Send message" }).click();
    await expect(
      designer.getByText("Internal note: trim this frame before sharing.", { exact: true }),
    ).toBeVisible();
    // The marker track only draws once the player has reported a duration, which happens on the
    // same `loadedmetadata` the seek above already waited for.
    await expect(designer.locator(".video-pin-marker")).toHaveCount(1);

    const internalPin = (
      await localAdmin
        .from("internal_comments")
        .select("pin_t,pin_x,pin_y,author_id")
        .eq("project_id", fixture.projectId)
        .single()
    ).data!;
    expect(internalPin.author_id).toBe(fixture.designerId);
    expect(internalPin.pin_x).not.toBeNull();
    expect(internalPin.pin_t).not.toBeNull();
    // The clip is 4 seconds and the seek target was 1.5; a wide tolerance absorbs the browser's
    // real keyframe-bounded seek precision instead of asserting an exact frame.
    expect(Number(internalPin.pin_t)).toBeGreaterThan(0.5);
    expect(Number(internalPin.pin_t)).toBeLessThan(3.5);

    await studio.goto(`/projects/${fixture.projectId}`);
    await studio.getByRole("button", { name: "Share with client", exact: true }).click();
    await studio
      .getByRole("textbox", { name: "A note for the client" })
      .fill("The first cut is ready for your review.");
    await studio.getByRole("button", { name: "Share version", exact: true }).click();
    await expect(studio.getByRole("dialog")).toHaveCount(0);

    await client.goto(`/projects/${fixture.projectId}`);
    await client.getByRole("button", { name: "Open Campaign cut A" }).click();
    const clientVideo = client.locator("video.artwork-video");
    await expect(clientVideo).toBeVisible();
    // Proves the client's browser can actually decode the published bytes, not merely that a
    // <video> element with a src attribute exists on the page.
    await clientVideo.evaluate(
      (element) =>
        new Promise<void>((resolve, reject) => {
          const video = element as HTMLVideoElement;
          if (video.readyState >= 1) return resolve();
          video.addEventListener("loadedmetadata", () => resolve(), { once: true });
          video.addEventListener(
            "error",
            () => reject(new Error("published video failed to load in the client's browser")),
            { once: true },
          );
        }),
    );
    await expect(
      client.getByText("Internal note: trim this frame before sharing.", { exact: true }),
    ).toHaveCount(0);

    await seekVideo(client, 2.5);
    await client.getByRole("button", { name: "Add pin", exact: true }).click();
    await client.locator(".artwork-stage").click({ position: { x: 90, y: 90 } });
    await client
      .getByRole("textbox", { name: "Your message" })
      .fill("Can we hold this frame a beat longer?");
    await client.getByRole("button", { name: "Send message" }).click();
    await expect(
      client.getByText("Can we hold this frame a beat longer?", { exact: true }),
    ).toBeVisible();

    const clientPin = (
      await localAdmin
        .from("client_comments")
        .select("pin_t,pin_x,author_label,author_kind")
        .eq("project_id", fixture.projectId)
        .single()
    ).data!;
    expect(clientPin.author_kind).toBe("client");
    expect(clientPin.pin_x).not.toBeNull();
    expect(clientPin.pin_t).not.toBeNull();

    // Authoritative role-isolation evidence, in the same shape `production-workflow.spec.ts`
    // already establishes: a fresh client-credentialed REST read of the two internal tables must
    // come back empty, proving the boundary is enforced by policy rather than by what the page
    // chose to request.
    const clientApi = await localCaller(credentials.client);
    expect(
      (await clientApi.from("internal_comments").select("*").eq("project_id", fixture.projectId))
        .data,
    ).toEqual([]);
    expect(
      (await clientApi.from("designs").select("*").eq("project_id", fixture.projectId)).data,
    ).toEqual([]);
    expect(
      (await clientApi.from("design_versions").select("*").eq("project_id", fixture.projectId))
        .data,
    ).toEqual([]);
    const publishedDesign = (
      await clientApi
        .from("published_designs")
        .select("*")
        .eq("project_id", fixture.projectId)
        .single()
    ).data!;
    expect(Object.keys(publishedDesign).sort()).toEqual(
      ["id", "project_id", "publication_id", "title", "content", "asset_path", "sort_order"].sort(),
    );
    expect(publishedDesign.asset_path).toMatch(/\.mp4$/);

    // Every `/rest/v1/` response the client's browser actually received, over the whole session,
    // named neither the internal comment's text nor the designer's identity — not just the ones
    // the page happened to request from the internal tables above.
    for (const { url, body } of clientRest) {
      if (url.includes("/rest/v1/internal_comments")) expect(JSON.parse(body || "[]")).toEqual([]);
      expect(body).not.toContain(fixture.designerId);
      expect(body).not.toContain("Internal note: trim this frame before sharing.");
    }
    expect(clientRest.length).toBeGreaterThan(0);

    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await cleanupTestProject(fixture.projectId);
  }
});

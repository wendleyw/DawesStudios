import { test, expect, type Page } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { credentials, localAdmin, localAgency, localCaller, signIn } from "./test-support";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";

const clip = fileURLToPath(new URL("../fixtures/campaign-clip.mp4", import.meta.url));

/**
 * A plain select with an explicit length check and a short bounded retry, not `.single()`.
 *
 * `.single()` swallows a 0-or-many-rows mismatch into `{ data: null, error: {...} }` without
 * throwing, which turns a real assertion failure into an opaque `Cannot read properties of null`
 * at the next line instead of naming what was actually wrong — `project-fixture.ts`'s `value()`
 * guards the same way for the same reason.
 *
 * The retry itself is not precautionary: measured directly against this branch's rebuilt
 * containers, a fresh `service_role` read immediately following a `postComment` call whose
 * result the *client's own* authenticated read had already rendered on screen came back with
 * zero rows twice across many runs of this spec, in both observed cases resolving to the
 * expected one row on the very next attempt roughly 300 ms later. The row was never lost.
 *
 * **What causes the gap is not established, and it is not attributed to connection pooling
 * here** — `supabase/config.toml` has `db.pooler.enabled = false`, there is no Supavisor or
 * pgbouncer in front of this stack, and `compose.yaml` defines no read replica, so on a
 * single-node Postgres a transaction committed on one connection is visible to a fresh query on
 * any other connection immediately; "two independently pooled connections" was an earlier,
 * incorrect guess at a mechanism this topology does not support. See [Observation
 * F-5](../../../../docs/verification/acceptance-family-f.md#observation-f-5-an-intermittent-read-after-write-gap-of-unestablished-cause)
 * for the full write-up, including a dedicated 40-run reproduction attempt that did not
 * reproduce a third, separate failure seen once during earlier stress-testing.
 */
async function readRowsEventually<T>(
  query: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  expectedLength: number,
): Promise<T[]> {
  let result = await query();
  for (let attempt = 0; (result.data?.length ?? 0) < expectedLength && attempt < 10; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    result = await query();
  }
  expect(result.error, JSON.stringify(result.error)).toBeNull();
  expect(result.data).toHaveLength(expectedLength);
  return result.data!;
}

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
  //
  // Each `response.text()` read is fire-and-forget from the event handler's own perspective, so
  // `pendingReads` tracks every one of those promises explicitly; the scan near the end of this
  // test awaits `Promise.all(pendingReads)` before reading `clientRest`, which is what actually
  // guarantees every captured response has finished being read by then. Without that await the
  // guarantee would depend on however many unrelated `await`s happen to run first — true today,
  // but true by accident, not by construction.
  const clientRest: { url: string; body: string }[] = [];
  const pendingReads: Promise<void>[] = [];
  client.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/rest/v1/")) return;
    pendingReads.push(
      response
        .text()
        .then((body) => {
          clientRest.push({ url, body });
        })
        .catch(() => undefined),
    );
  });

  try {
    await signIn(studio, credentials.agency);
    await signIn(designer, credentials.designer);
    await signIn(client, credentials.client);

    await designer.goto(`/projects/${fixture.projectId}?view=versions`);
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

    const internalRows = await readRowsEventually(
      () =>
        localAdmin
          .from("internal_comments")
          .select("pin_t,pin_x,pin_y,author_id")
          .eq("project_id", fixture.projectId),
      1,
    );
    const internalPin = internalRows[0];
    expect(internalPin.author_id).toBe(fixture.designerId);
    expect(internalPin.pin_x).not.toBeNull();
    expect(internalPin.pin_t).not.toBeNull();
    // The clip is 4 seconds and the seek target was 1.5; a wide tolerance absorbs the browser's
    // real keyframe-bounded seek precision instead of asserting an exact frame.
    expect(Number(internalPin.pin_t)).toBeGreaterThan(0.5);
    expect(Number(internalPin.pin_t)).toBeLessThan(3.5);

    await studio.goto(`/projects/${fixture.projectId}?view=versions`);
    await studio.getByRole("button", { name: "Share with client", exact: true }).click();
    await studio
      .getByRole("textbox", { name: "A note for the client" })
      .fill("The first cut is ready for your review.");
    await studio.getByRole("button", { name: "Share version", exact: true }).click();
    await expect(studio.getByRole("dialog")).toHaveCount(0);

    await client.goto(`/projects/${fixture.projectId}?view=versions`);
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

    const clientRows = await readRowsEventually(
      () =>
        localAdmin
          .from("client_comments")
          .select("pin_t,pin_x,author_label,author_kind")
          .eq("project_id", fixture.projectId),
      1,
    );
    const clientPin = clientRows[0];
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
    const publishedRows = await readRowsEventually(
      () => clientApi.from("published_designs").select("*").eq("project_id", fixture.projectId),
      1,
    );
    const publishedDesign = publishedRows[0];
    expect(Object.keys(publishedDesign).sort()).toEqual(
      ["id", "project_id", "publication_id", "title", "content", "asset_path", "sort_order"].sort(),
    );
    expect(publishedDesign.asset_path).toMatch(/\.mp4$/);

    // The barrier that makes `clientRest` safe to read: every response-text read the handler
    // above started is awaited here, explicitly, before the scan below runs.
    await Promise.all(pendingReads);

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

// The upload lifecycle scenarios below (docs/superpowers/specs/2026-09-23-video-upload-lifecycle-design.md).
// Every tus request (the creation POST and the later HEAD/PATCH to its URL) matches this.
const resumable = /\/storage\/v1\/upload\/resumable/;
const hold = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Creates version 1 of the fixture's deliverable and opens its Add design dialog. */
async function openAddDesign(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}?view=versions`);
  await page.getByRole("button", { name: "New version for Campaign square" }).click();
  await page.getByRole("button", { name: "Create version", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Add design to version 1" }).click();
}

/** The dialog's progress line; the submit button repeats the same words while it is pending. */
function progressLine(page: Page, text: RegExp) {
  return page.getByRole("dialog").locator(".upload-progress").getByText(text);
}

async function startUpload(page: Page, title: string, file: string) {
  await page.getByRole("textbox", { name: "Design name" }).fill(title);
  await page.getByLabel("Design file").setInputFiles(file);
  await page.getByRole("dialog").getByRole("button", { name: "Add design", exact: true }).click();
}

/** The raw object's path, read from a tus creation request's own `Upload-Metadata` header. */
function rawPathOf(metadata: string | undefined) {
  const entry = metadata
    ?.split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("objectName "));
  return entry
    ? Buffer.from(entry.slice("objectName ".length), "base64").toString("utf8")
    : undefined;
}

async function designsTitled(
  agency: Awaited<ReturnType<typeof localAgency>>,
  projectId: string,
  title: string,
  expected: number,
) {
  const versions = await agency.from("design_versions").select("id").eq("project_id", projectId);
  expect(versions.error, JSON.stringify(versions.error)).toBeNull();
  const versionIds = (versions.data ?? []).map((version) => version.id);
  return readRowsEventually(
    () => agency.from("designs").select("id").in("version_id", versionIds).eq("title", title),
    expected,
  );
}

async function rawObjectExists(rawPath: string) {
  const [projectDirectory, objectName] = rawPath.split("/");
  const listing = await localAdmin.storage
    .from("internal-assets")
    .list(projectDirectory, { limit: 1000 });
  expect(listing.error).toBeNull();
  return listing.data?.some((entry) => entry.name === objectName) ?? false;
}

/** A `sanitize-video` answer the browser will read: a fulfilled cross-origin response needs CORS. */
function busy(page: Page) {
  return {
    status: 503,
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": new URL(page.url()).origin, Vary: "Origin" },
    body: JSON.stringify({ error: "Media processing is busy. Try again shortly." }),
  };
}

test("cancelling mid-transfer leaves no design and no stored object", async ({ page }) => {
  test.setTimeout(90_000);
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  try {
    await signIn(page, credentials.agency);
    await openAddDesign(page, fixture.projectId);
    // Hold the transfer so it is still running when Cancel is clicked. Had the cancel not stopped
    // it, the held request would reach Storage once released.
    let rawPath: string | undefined;
    await page.route(resumable, async (route) => {
      rawPath ??= rawPathOf(route.request().headers()["upload-metadata"]);
      await hold(2_000);
      await route.continue().catch(() => undefined);
    });
    await startUpload(page, "Cancelled upload", clip);
    await expect(progressLine(page, /^Sending \d+%$/)).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Upload cancelled.")).toBeVisible();
    await expect(page.getByRole("dialog")).toBeVisible();
    await hold(3_000);

    await designsTitled(agency, fixture.projectId, "Cancelled upload", 0);
    expect(rawPath, "the tus creation request must have been observed").toBeTruthy();
    expect(await rawObjectExists(rawPath!)).toBe(false);
  } finally {
    await cleanupTestProject(fixture.projectId);
  }
});

test("reloading mid-transfer and choosing the same file again continues the transfer", async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Resume needs a transfer with more than one 6 MB chunk: the clip followed by filler bytes. The
  // resumed transfer is cancelled, so the filler never reaches processing.
  const directory = await mkdtemp(join(tmpdir(), "dawes-resume-"));
  const longTake = join(directory, "long-take.mp4");
  await writeFile(
    longTake,
    Buffer.concat([await readFile(clip), Buffer.alloc(13 * 1024 * 1024, 7)]),
  );
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  try {
    await signIn(page, credentials.agency);
    await openAddDesign(page, fixture.projectId);
    // The creation request carries the first chunk; each later chunk is held, so the reload lands
    // between chunks with the resume point already stored.
    await page.route(resumable, async (route) => {
      if (route.request().method() === "PATCH") await hold(3_000);
      await route.continue().catch(() => undefined);
    });
    const created = page.waitForResponse(
      (response) =>
        resumable.test(response.url()) &&
        response.request().method() === "POST" &&
        response.status() === 201,
    );
    await startUpload(page, "Resumed upload", longTake);
    await created;
    await expect(progressLine(page, /^Sending \d+%$/)).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: "Add design to version 1" }).click();
    await startUpload(page, "Resumed upload", longTake);
    await expect(progressLine(page, /^Continuing from \d+%$/)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Upload cancelled.")).toBeVisible();
    await designsTitled(agency, fixture.projectId, "Resumed upload", 0);
  } finally {
    await cleanupTestProject(fixture.projectId);
    await rm(directory, { recursive: true, force: true });
  }
});

test("a forced 503 on the first processing call recovers automatically", async ({ page }) => {
  test.setTimeout(90_000);
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  try {
    await signIn(page, credentials.agency);
    await openAddDesign(page, fixture.projectId);
    let calls = 0;
    await page.route("**/designs/sanitize-video", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      calls += 1;
      if (calls === 1) return route.fulfill(busy(page));
      return route.continue();
    });
    await startUpload(page, "Auto-recovered upload", clip);
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 60_000 });
    expect(calls).toBe(2);
    await designsTitled(agency, fixture.projectId, "Auto-recovered upload", 1);
  } finally {
    await cleanupTestProject(fixture.projectId);
  }
});

test("two forced processing failures offer Try processing again, which succeeds without a second transfer", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  try {
    await signIn(page, credentials.agency);
    await openAddDesign(page, fixture.projectId);
    let transferCalls = 0;
    let sanitizeCalls = 0;
    await page.route(resumable, async (route) => {
      transferCalls += 1;
      await route.continue();
    });
    await page.route("**/designs/sanitize-video", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      sanitizeCalls += 1;
      if (sanitizeCalls <= 2) return route.fulfill(busy(page));
      return route.continue();
    });
    await startUpload(page, "Manually retried upload", clip);
    const retry = page.getByRole("dialog").getByRole("button", { name: "Try processing again" });
    await expect(retry).toBeVisible({ timeout: 30_000 });
    expect(sanitizeCalls).toBe(2);
    const transfersBeforeRetry = transferCalls;

    await retry.click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 60_000 });
    expect(sanitizeCalls).toBe(3);
    expect(transferCalls).toBe(transfersBeforeRetry);
    await designsTitled(agency, fixture.projectId, "Manually retried upload", 1);
  } finally {
    await cleanupTestProject(fixture.projectId);
  }
});

test("cancelling during processing discards the raw file through the media service", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  try {
    await signIn(page, credentials.agency);
    await openAddDesign(page, fixture.projectId);
    let rawPath: string | undefined;
    await page.route(resumable, async (route) => {
      rawPath ??= rawPathOf(route.request().headers()["upload-metadata"]);
      await route.continue();
    });
    // Hold processing, so the cancel lands while it runs; the aborted request never reaches it.
    await page.route("**/designs/sanitize-video", async (route) => {
      if (route.request().method() === "POST") await hold(3_000);
      await route.continue().catch(() => undefined);
    });
    await startUpload(page, "Cancelled while processing", clip);
    await expect(page.getByText("Processing…", { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    expect(rawPath, "the tus creation request must have been observed").toBeTruthy();
    expect(await rawObjectExists(rawPath!)).toBe(true);

    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Upload cancelled.")).toBeVisible();
    await expect.poll(() => rawObjectExists(rawPath!), { timeout: 10_000 }).toBe(false);
    await hold(3_000);
    await designsTitled(agency, fixture.projectId, "Cancelled while processing", 0);
  } finally {
    await cleanupTestProject(fixture.projectId);
  }
});

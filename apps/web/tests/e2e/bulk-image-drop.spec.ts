import { test, expect, type Page } from "@playwright/test";
import { credentials, localAgency, signIn } from "./test-support";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";

function value<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("Fixture step returned no record.");
  return result.data as NonNullable<T>;
}

/**
 * Drops real PNGs of the given pixel sizes onto `target`, the way a file drag from the desktop
 * arrives: a `dragover` then a `drop` carrying a `DataTransfer` of files. Resolves to whether the
 * page prevented the drop's default action, which is what keeps a browser from opening the file.
 */
async function dropImages(
  page: Page,
  target: string,
  specs: { name: string; width: number; height: number }[],
) {
  return page.evaluate(
    async ({ selector, files }) => {
      const transfer = new DataTransfer();
      for (const { name, width, height } of files) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#4b6bfb";
        context.fillRect(0, 0, width, height);
        const blob: Blob = await new Promise((resolve) =>
          canvas.toBlob((result) => resolve(result!), "image/png"),
        );
        transfer.items.add(new File([blob], name, { type: "image/png" }));
      }
      const element = document.querySelector(selector)!;
      const init = { bubbles: true, cancelable: true, dataTransfer: transfer };
      element.dispatchEvent(new DragEvent("dragenter", init));
      element.dispatchEvent(new DragEvent("dragover", init));
      const drop = new DragEvent("drop", init);
      element.dispatchEvent(drop);
      return drop.defaultPrevented;
    },
    { selector: target, files: specs },
  );
}

test.describe("bulk image drop", () => {
  let projectId: string | undefined;

  test.afterEach(async () => {
    if (projectId) await cleanupTestProject(projectId);
    projectId = undefined;
  });

  test("matches, groups, orders and registers a mixed drop; a shared version defaults to new", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const agency = await localAgency();
    const fixture = await createProductionFixture(agency, [
      {
        name: "Campaign square",
        format: "square",
        width: 1080,
        height: 1080,
        quantity: 1,
        scope: "original",
      },
      {
        name: "Campaign story",
        format: "story",
        width: 1080,
        height: 1920,
        quantity: 1,
        scope: "original",
      },
    ]);
    projectId = fixture.projectId;

    const deliverables = value(
      await agency.from("deliverables").select("id,name").eq("project_id", projectId),
    );
    const square = deliverables.find((d) => d.name === "Campaign square")!;
    const story = deliverables.find((d) => d.name === "Campaign story")!;

    // Square: an existing, unshared current version -- it keeps the "current" default.
    const squareVersionId = value(
      await agency.rpc("create_design_version", { p_deliverable_id: square.id, p_notes: "" }),
    );
    // Story: a current version already shared with the client -- bulk drop must default to new.
    const storyVersionId = value(
      await agency.rpc("create_design_version", { p_deliverable_id: story.id, p_notes: "" }),
    );
    value(
      await agency.rpc("add_design", {
        p_version_id: storyVersionId,
        p_title: "Placeholder",
        p_content: {},
      }),
    );
    value(
      await agency.rpc("publish_version", {
        p_version_id: storyVersionId,
        p_release_note: "",
        p_assets: {},
      }),
    );

    await signIn(page, credentials.agency);
    await page.goto(`/projects/${projectId}`);
    await expect(
      page.getByRole("button", { name: "New version for Campaign square" }),
    ).toBeVisible();

    const prevented = await dropImages(page, ".project-canvas", [
      { name: "square-10.png", width: 1080, height: 1080 },
      { name: "story-2.png", width: 1080, height: 1920 },
      { name: "square-1.png", width: 1080, height: 1080 },
      { name: "unmatched.png", width: 800, height: 600 },
      { name: "square-2.png", width: 1080, height: 1080 },
      { name: "story-1.png", width: 1080, height: 1920 },
    ]);
    expect(prevented).toBe(true);

    const dialog = page.getByRole("dialog", { name: "Add images" });
    await expect(dialog.getByText("1080 × 1080 · 3 images")).toBeVisible();
    await expect(
      dialog
        .getByRole("radiogroup", { name: "Version for Campaign square" })
        .getByLabel("Add to V1"),
    ).toBeChecked();
    await expect(
      dialog
        .getByRole("radiogroup", { name: "Version for Campaign story" })
        .getByLabel("Create V2"),
    ).toBeChecked();
    await expect(dialog.getByRole("button", { name: "Add 5 images" })).toBeDisabled();

    await dialog.getByLabel("Deliverable for unmatched.png").selectOption(square.id);
    await dialog.getByRole("button", { name: "Add 6 images" }).click();
    await expect(dialog.getByText("6 added")).toBeVisible({ timeout: 30_000 });

    await expect
      .poll(
        async () => {
          const rows = value(
            await agency
              .from("designs")
              .select("title")
              .eq("version_id", squareVersionId)
              .order("sort_order"),
          );
          return rows.map((row) => row.title);
        },
        { timeout: 20_000 },
      )
      .toEqual(["square-1", "square-2", "square-10", "unmatched"]);

    const storyVersionTwo = value(
      await agency
        .from("design_versions")
        .select("id")
        .eq("deliverable_id", story.id)
        .eq("version_number", 2)
        .single(),
    );
    await expect
      .poll(async () => {
        const rows = value(
          await agency
            .from("designs")
            .select("title")
            .eq("version_id", storyVersionTwo.id)
            .order("sort_order"),
        );
        return rows.map((row) => row.title);
      })
      .toEqual(["story-1", "story-2"]);

    // The already-shared version was never touched.
    const storyVersionOneDesigns = value(
      await agency.from("designs").select("title").eq("version_id", storyVersionId),
    );
    expect(storyVersionOneDesigns).toHaveLength(1);
  });

  test("a client session has no drop overlay and a drop is swallowed", async ({ page }) => {
    const agency = await localAgency();
    const fixture = await createProductionFixture(agency);
    projectId = fixture.projectId;

    await signIn(page, credentials.client);
    await page.goto(`/projects/${projectId}`);
    await expect(page.locator(".project-canvas")).toBeVisible();

    const prevented = await dropImages(page, ".project-canvas", [
      { name: "square-1.png", width: 1080, height: 1080 },
    ]);
    expect(prevented).toBe(true);
    await expect(page.locator(".project-canvas.is-dragging-over")).toHaveCount(0);
    await expect(page.getByText(/Drop \d+ images?/)).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Add images" })).toHaveCount(0);
  });

  test("the agency's Shared with client view shows a hint instead of taking the drop", async ({
    page,
  }) => {
    const agency = await localAgency();
    const fixture = await createProductionFixture(agency);
    projectId = fixture.projectId;

    await signIn(page, credentials.agency);
    await page.goto(`/projects/${projectId}?channel=client`);
    await expect(page.locator(".project-canvas")).toBeVisible();

    const prevented = await dropImages(page, ".project-canvas", [
      { name: "square-1.png", width: 1080, height: 1080 },
    ]);
    expect(prevented).toBe(true);
    await expect(page.getByText("Switch to Working files to add designs")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Add images" })).toHaveCount(0);
  });

  test("a dragged link dropped on the canvas never navigates the tab", async ({ page }) => {
    const agency = await localAgency();
    const fixture = await createProductionFixture(agency);
    projectId = fixture.projectId;

    await signIn(page, credentials.agency);
    await page.goto(`/projects/${projectId}`);
    await expect(page.locator(".project-canvas")).toBeVisible();

    const prevented = await page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.setData("text/uri-list", "https://example.com/");
      const element = document.querySelector(".project-canvas")!;
      const init = { bubbles: true, cancelable: true, dataTransfer: transfer };
      const over = new DragEvent("dragover", init);
      element.dispatchEvent(over);
      const drop = new DragEvent("drop", init);
      element.dispatchEvent(drop);
      return { over: over.defaultPrevented, drop: drop.defaultPrevented };
    });
    expect(prevented).toEqual({ over: true, drop: true });
    await expect(page.locator(".canvas-drop-overlay")).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Add images" })).toHaveCount(0);
  });

  test("a file dropped outside the canvas never opens in the tab", async ({ page }) => {
    const agency = await localAgency();
    const fixture = await createProductionFixture(agency);
    projectId = fixture.projectId;

    await signIn(page, credentials.agency);
    await page.goto(`/projects/${projectId}`);
    await expect(page.locator(".project-canvas")).toBeVisible();

    expect(
      await dropImages(page, ".project-header", [
        { name: "square-1.png", width: 1080, height: 1080 },
      ]),
    ).toBe(true);
    await expect(page.getByRole("dialog", { name: "Add images" })).toHaveCount(0);
  });
});

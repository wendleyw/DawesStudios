import { test as base, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPlaygroundFixture, seedPlaygroundAlbumsFixture } from "./playground-fixture";
import { credentials, localAdmin, localCaller, screenshotDirectory, signIn } from "./test-support";

const preview = fileURLToPath(new URL("../fixtures/campaign-preview.png", import.meta.url));
const test = base.extend<{ workspace: Awaited<ReturnType<typeof createPlaygroundFixture>> }>({
  workspace: async ({}, runWithFixture) => {
    const workspace = await createPlaygroundFixture();
    try {
      await runWithFixture(workspace);
    } finally {
      await workspace.cleanup();
    }
  },
});

const playground = (page: Page) => page.getByRole("dialog", { name: "Playground", exact: true });
async function openPlayground(page: Page) {
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await expect(playground(page)).toHaveAttribute("data-phase", "active");
  await expect(
    playground(page).getByRole("button", { name: "Add note", exact: true }),
  ).toBeEnabled();
}

test("Playground slides over the entire viewport and preserves the project underneath", async ({
  page,
  workspace,
}) => {
  await signIn(page, credentials.agency);
  await page.goto(`/projects/${workspace.projectId}?view=versions`);
  const viewport = page.locator(".project-canvas .react-flow__viewport");
  await expect(page.getByRole("button", { name: "New version for Campaign square" })).toBeVisible();
  const initialZoom = await viewport.evaluate(
    (element) => new DOMMatrix(getComputedStyle(element).transform).a,
  );
  await page.locator(".project-canvas").getByRole("button", { name: "zoom in" }).click();
  await expect
    .poll(() =>
      viewport.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a),
    )
    .toBeCloseTo(Math.min(initialZoom * 1.2, 1.5), 4);
  const transform = await viewport.getAttribute("style");
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  const layer = playground(page);
  await expect(layer).toBeVisible();
  const entry = await layer.evaluate((element) => {
    const animation = element.getAnimations()[0];
    const frames = (animation?.effect as KeyframeEffect | null)?.getKeyframes();
    return frames?.map((frame) => frame.transform);
  });
  expect(entry).toEqual(["translateY(100%)", "translateY(0px)"]);
  await expect(layer).toHaveAttribute("data-phase", "active");
  expect(
    await layer.evaluate((element) => ({
      modal: element.matches("dialog:modal"),
      bodyLocked: document.body.style.overflow === "hidden",
      hiddenBoard: document.querySelector(".project-workspace-content")?.hasAttribute("inert"),
    })),
  ).toEqual({ modal: true, bodyLocked: true, hiddenBoard: true });
  expect(await layer.boundingBox()).toEqual({ x: 0, y: 0, ...page.viewportSize()! });
  // The sidebar and project title are still mounted but cannot receive focus behind the layer.
  for (const selector of [".sidebar a", ".project-title-row a"]) {
    await page
      .locator(selector)
      .first()
      .evaluate((element: HTMLElement) => element.focus());
    expect(await layer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  for (let index = 0; index < 18; index++) {
    await page.keyboard.press(index % 2 ? "Tab" : "Shift+Tab");
    expect(
      await page.evaluate(
        () =>
          document.activeElement === document.body ||
          !!document.activeElement?.closest(".playground-board"),
      ),
    ).toBe(true);
  }
  await layer.getByRole("button", { name: "Back to project", exact: true }).click();
  const exit = await layer.evaluate((element) => {
    const animation = element.getAnimations()[0];
    return (animation?.effect as KeyframeEffect | null)
      ?.getKeyframes()
      .map((frame) => frame.transform);
  });
  expect(exit).toEqual(["translateY(0px)", "translateY(100%)"]);
  await expect(layer).toHaveCount(0);
  await expect(viewport).toHaveAttribute("style", transform!);
  await expect(page.locator(".project-workspace-content")).not.toHaveAttribute("inert");
  await expect(page.getByRole("button", { name: "Playground", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPlayground(page);
  expect(
    await layer.evaluate((element) => parseFloat(getComputedStyle(element).animationDuration)),
  ).toBeLessThanOrEqual(0.01);
  await layer.getByRole("button", { name: "Back to project", exact: true }).click();
  await expect(layer).toHaveCount(0);
});
async function addNote(page: Page, title: string, body = "A saved brainstorming direction.") {
  const dialog = playground(page);
  await dialog.getByRole("button", { name: "Add note", exact: true }).click();
  await dialog.getByLabel("Note title", { exact: true }).fill(title);
  await dialog.getByLabel("Note text", { exact: true }).fill(body);
  await dialog.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(dialog.getByText(title, { exact: true }).first()).toBeVisible();
}

for (const role of ["agency", "designer", "client"] as const) {
  test(`${role} persists separate project brainstorms isolated by role`, async ({
    page,
    workspace,
  }) => {
    await signIn(page, role === "client" ? workspace.client.email : credentials[role]);
    await page.goto(`/clients/${workspace.clientId}/board`);
    await expect(
      page.getByRole("heading", { name: workspace.name, level: 1, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Playground", exact: true })).toHaveCount(0);
    await page.goto(`/projects/${workspace.projectId}?view=versions`);
    await openPlayground(page);
    const title = `${role} project direction`;
    await addNote(page, title);
    await playground(page).getByRole("button", { name: "Back to project", exact: true }).click();
    await expect(playground(page)).toHaveCount(0);
    await page.reload();
    await openPlayground(page);
    await expect(playground(page).getByText(title, { exact: true }).first()).toBeVisible();
    await playground(page).getByRole("button", { name: "Back to project", exact: true }).click();
    await page.goto(`/projects/${workspace.otherProjectId}?view=versions`);
    await openPlayground(page);
    await expect(playground(page).getByText(title, { exact: true })).toHaveCount(0);
    await addNote(page, `${role} alternate direction`);
    await playground(page).getByRole("button", { name: "Back to project", exact: true }).click();
    await expect(page).toHaveURL(`/projects/${workspace.otherProjectId}`);
    const caller = await localCaller(
      role === "client" ? workspace.client.email : credentials[role],
    );
    const ownBoards = await caller
      .from("playground_boards")
      .select("id")
      .eq("client_id", workspace.clientId);
    expect(ownBoards.error).toBeNull();
    expect(ownBoards.data).toHaveLength(2);
    const other = await localCaller(
      role === "client" ? credentials.agency : workspace.client.email,
    );
    const leaked = await other
      .from("playground_items")
      .select("*")
      .in(
        "board_id",
        ownBoards.data!.map((board) => board.id),
      );
    expect(leaked.error).toBeNull();
    expect(leaked.data).toEqual([]);
  });
}

test("upload form survives Playground and still creates the final design", async ({
  page,
  workspace,
}) => {
  await signIn(page, credentials.agency);
  await page.goto(`/projects/${workspace.projectId}?view=versions`);
  await page.getByRole("button", { name: "New version for Campaign square" }).click();
  await page.getByLabel("Version note").fill("Explore before uploading.");
  await page.getByRole("button", { name: "Create version", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Add design to version 1" }).click();
  const upload = page.getByRole("dialog", { name: "Add a design.", exact: true });
  await upload.getByLabel("Design name", { exact: true }).fill("A considered final direction");
  await upload.getByLabel("Design file").setInputFiles(preview);
  await upload.getByRole("button", { name: "Open Playground", exact: true }).click();
  await expect(upload).not.toBeVisible();
  await expect(page.locator("dialog:modal")).toHaveCount(1);
  await expect(playground(page)).toBeVisible();
  await addNote(page, "Try a calmer composition");
  await playground(page).getByRole("button", { name: "Back to upload", exact: true }).click();
  await expect(upload).toBeVisible();
  await expect(upload.getByLabel("Design name", { exact: true })).toHaveValue(
    "A considered final direction",
  );
  expect(
    await upload
      .getByLabel("Design file")
      .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
  ).toBe("campaign-preview.png");
  await upload.getByRole("button", { name: "Add design", exact: true }).click();
  await expect(upload).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open A considered final direction" }),
  ).toBeVisible();
  const saved = await localAdmin
    .from("designs")
    .select("title,internal_asset_path")
    .eq("project_id", workspace.projectId);
  expect(saved.error).toBeNull();
  expect(saved.data).toHaveLength(1);
  expect(saved.data![0].internal_asset_path).toBeTruthy();
});

test("a dropped image/document bundle persists and files remain private", async ({
  page,
  workspace,
}) => {
  await signIn(page, credentials.agency);
  await page.goto(`/projects/${workspace.projectId}?view=versions`);
  await openPlayground(page);
  const transfer = await page.evaluateHandle(
    ({ image }) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(image)], "Direction one.png", { type: "image/png" }));
      data.items.add(new File([new Uint8Array(image)], "Direction two.png", { type: "image/png" }));
      data.items.add(
        new File(["Campaign goals: clarity, space, warm typography."], "Creative brief.txt", {
          type: "text/plain",
        }),
      );
      return data;
    },
    { image: [...readFileSync(preview)] },
  );
  const canvas = playground(page).locator(".playground-canvas");
  const bounds = (await canvas.boundingBox())!;
  await canvas.dispatchEvent("drop", {
    dataTransfer: transfer,
    clientX: bounds.x + 60,
    clientY: bounds.y + 60,
  });
  await transfer.dispose();
  for (const title of ["Direction one.png", "Direction two.png", "Creative brief.txt"])
    await expect(playground(page).getByText(title, { exact: true }).first()).toBeVisible();
  await expect
    .poll(async () => {
      const result = await localAdmin
        .from("playground_items")
        .select("id")
        .in("title", ["Direction one.png", "Direction two.png", "Creative brief.txt"]);
      return result.data?.length;
    })
    .toBe(3);
  await page.reload();
  await openPlayground(page);
  await expect(
    playground(page).getByText("Creative brief.txt", { exact: true }).first(),
  ).toBeVisible();
  const board = await localAdmin
    .from("playground_boards")
    .select("id")
    .eq("project_id", workspace.projectId)
    .single();
  expect(board.error).toBeNull();
  const files = await localAdmin
    .from("playground_items")
    .select("asset_path")
    .eq("board_id", board.data!.id);
  expect(files.error).toBeNull();
  expect(files.data).toHaveLength(3);
  const client = await localCaller(workspace.client.email);
  for (const file of files.data!) {
    const denied = await client.storage.from("playground-assets").download(file.asset_path!);
    expect(denied.error).not.toBeNull();
    const allowed = await localAdmin.storage.from("playground-assets").download(file.asset_path!);
    expect(allowed.error).toBeNull();
    expect(allowed.data!.size).toBeGreaterThan(0);
  }
  await playground(page)
    .getByRole("button", { name: "Edit Creative brief.txt", exact: true })
    .click();
  const completed = page.waitForEvent("download");
  await playground(page).getByRole("button", { name: "Download file", exact: true }).click();
  const download = await completed;
  expect(readFileSync((await download.path())!, "utf8")).toBe(
    "Campaign goals: clarity, space, warm typography.",
  );
  let refusedCleanup = false;
  await page.route("**/storage/v1/object/playground-assets", async (route) => {
    if (route.request().method() === "DELETE" && !refusedCleanup) {
      refusedCleanup = true;
      await route.abort("failed");
    } else await route.continue();
  });
  await playground(page).getByRole("button", { name: "Remove item", exact: true }).click();
  await playground(page).getByRole("button", { name: "Confirm removal", exact: true }).click();
  await expect(playground(page).getByRole("alert")).toContainText("file could not be deleted");
  await page.reload();
  await openPlayground(page);
  await expect(playground(page).getByText("Creative brief.txt", { exact: true })).toHaveCount(0);
  const removedFile = files.data!.find((item) => item.asset_path?.endsWith("Creative_brief.txt"))!;
  await expect
    .poll(async () => {
      const result = await localAdmin.storage
        .from("playground-assets")
        .download(removedFile.asset_path!);
      return !!result.error;
    })
    .toBe(true);
});

test("Playground is readable and accessible on desktop and mobile", async ({ page, workspace }) => {
  await signIn(page, workspace.client.email);
  await page.goto(`/projects/${workspace.projectId}?view=versions`);
  await openPlayground(page);
  await addNote(page, "Campaign mood", "Natural colors, generous space, and a clear message.");
  for (const [width, height] of [
    [1600, 1000],
    [1024, 700],
    [390, 844],
    [320, 640],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => playground(page).boundingBox()).toEqual({ x: 0, y: 0, width, height });
    await expect
      .poll(() =>
        playground(page).evaluate((dialog) => {
          const canvas = dialog.querySelector(".playground-canvas")!.getBoundingClientRect();
          const note = dialog.querySelector(".react-flow__node")!.getBoundingClientRect();
          const visibleWidth = Math.max(
            0,
            Math.min(canvas.right, note.right) - Math.max(canvas.left, note.left),
          );
          const visibleHeight = Math.max(
            0,
            Math.min(canvas.bottom, note.bottom) - Math.max(canvas.top, note.top),
          );
          return (visibleWidth * visibleHeight) / (note.width * note.height);
        }),
      )
      .toBeGreaterThan(0.95);
    const result = await new AxeBuilder({ page }).include(".playground-board").analyze();
    expect(result.violations).toEqual([]);
    const overflow = await playground(page).evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    );
    if (overflow > 1) {
      await test.info().attach("playground-overflow", {
        body: JSON.stringify(
          await playground(page).evaluate((dialog) => {
            const bounds = dialog.getBoundingClientRect();
            return {
              dialog: {
                width: bounds.width,
                right: bounds.right,
                client: dialog.clientWidth,
                scroll: dialog.scrollWidth,
              },
              children: Array.from(dialog.querySelectorAll<HTMLElement>("*"))
                .map((element) => {
                  const rect = element.getBoundingClientRect();
                  const style = getComputedStyle(element);
                  return {
                    tag: element.tagName,
                    class: element.className,
                    right: rect.right,
                    width: rect.width,
                    client: element.clientWidth,
                    scroll: element.scrollWidth,
                    padding: style.padding,
                    position: style.position,
                    minWidth: style.minWidth,
                  };
                })
                .filter((item) => item.right > bounds.right || item.scroll > item.client + 1),
            };
          }),
          null,
          2,
        ),
        contentType: "application/json",
      });
    }
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${screenshotDirectory}/playground-${width}.png` });
    if (width === 390) {
      await playground(page)
        .getByLabel("Note text", { exact: true })
        .fill("The mobile inspector can save this direction.");
      await playground(page).getByRole("button", { name: "Save note", exact: true }).click();
      await expect(
        playground(page).getByRole("button", { name: "Save note", exact: true }),
      ).toBeDisabled();
      await expect(playground(page).getByRole("status")).toHaveText("All changes saved");
    }
  }
  await page.keyboard.press("Escape");
  await expect(playground(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Playground", exact: true })).toBeFocused();
});

test("notes can be dragged, resized, edited by keyboard and removed durably", async ({
  page,
  workspace,
}) => {
  await signIn(page, credentials.agency);
  await page.goto(`/projects/${workspace.projectId}?view=versions`);
  await openPlayground(page);
  await addNote(page, "Move this idea");
  const dialog = playground(page);
  await expect(dialog.getByRole("status")).toHaveText("All changes saved");
  const node = dialog
    .locator(".react-flow__node")
    .filter({ has: page.getByRole("button", { name: "Edit Move this idea", exact: true }) });
  const id = (await node.getAttribute("data-id"))!;
  async function savedItem() {
    const result = await localAdmin.from("playground_items").select("*").eq("id", id).single();
    expect(result.error).toBeNull();
    return result.data!;
  }
  const initial = await savedItem();
  const grip = (await node.locator(".playground-item-header strong").boundingBox())!;
  await page.mouse.move(grip.x + 20, grip.y + 8);
  await page.mouse.down();
  await page.mouse.move(grip.x + 100, grip.y + 58, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await savedItem()).x).not.toBe(initial.x);
  const resize = (await node
    .locator(".react-flow__resize-control.handle.bottom.right")
    .boundingBox())!;
  await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2);
  await page.mouse.down();
  await page.mouse.move(resize.x + 70, resize.y + 50, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await savedItem()).width).toBeGreaterThan(initial.width);
  await dialog.getByText("Position and size", { exact: true }).click();
  for (const [label, number] of [
    ["Horizontal position", "200"],
    ["Vertical position", "150"],
    ["Width", "420"],
    ["Height", "260"],
  ])
    await dialog.getByLabel(label, { exact: true }).fill(number);
  await dialog.getByRole("button", { name: "Save note", exact: true }).click();
  await expect
    .poll(async () => {
      const saved = await savedItem();
      return [saved.x, saved.y, saved.width, saved.height];
    })
    .toEqual([200, 150, 420, 260]);
  await page.reload();
  await openPlayground(page);
  await dialog.getByRole("button", { name: "Edit Move this idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Remove item", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm removal", exact: true }).click();
  await expect(dialog.getByText("Move this idea", { exact: true })).toHaveCount(0);
  await page.reload();
  await openPlayground(page);
  await expect(dialog.getByText("Move this idea", { exact: true })).toHaveCount(0);
  expect((await savedItem()).deleted_at).toBeTruthy();
});

test("lost save responses retry once and stale edits retain the local draft", async ({
  page,
  workspace,
}) => {
  await signIn(page, credentials.agency);
  await page.goto(`/projects/${workspace.projectId}?view=versions`);
  await openPlayground(page);
  let dropped = false;
  await page.route("**/rest/v1/rpc/save_playground_item", async (route) => {
    if (!dropped) {
      dropped = true;
      const response = await route.fetch();
      expect(response.ok()).toBeTruthy();
      await route.abort("failed");
    } else await route.continue();
  });
  await addNote(page, "An idempotent idea");
  const dialog = playground(page);
  await expect(dialog.getByText("Your local changes are still here.")).toBeVisible();
  await dialog.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Save note", exact: true })).toBeDisabled();
  const board = await localAdmin
    .from("playground_boards")
    .select("id")
    .eq("project_id", workspace.projectId)
    .single();
  const rows = await localAdmin.from("playground_items").select("*").eq("board_id", board.data!.id);
  expect(rows.error).toBeNull();
  expect(rows.data).toHaveLength(1);
  const original = rows.data![0];
  await dialog.getByLabel("Note text", { exact: true }).fill("Keep this local draft.");
  const agency = await localCaller(credentials.agency);
  const other = await agency.rpc("save_playground_item", {
    p_board_id: original.board_id,
    p_expected_revision: original.revision,
    p_item: {
      id: original.id,
      kind: original.kind,
      title: original.title,
      body: "Saved by another agency session.",
      asset_path: null,
      mime_type: null,
      x: original.x,
      y: original.y,
      width: original.width,
      height: original.height,
    },
  });
  expect(other.error).toBeNull();
  await dialog.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("changed elsewhere");
  await expect(dialog.getByLabel("Note text", { exact: true })).toHaveValue(
    "Keep this local draft.",
  );
  await dialog
    .getByRole("button", { name: "Discard my edits and load saved item", exact: true })
    .click();
  await expect(dialog.getByLabel("Note text", { exact: true })).toHaveValue(
    "Saved by another agency session.",
  );
  const updated = other.data as { revision: number };
  const changedAgain = await agency.rpc("save_playground_item", {
    p_board_id: original.board_id,
    p_expected_revision: updated.revision,
    p_item: {
      id: original.id,
      kind: original.kind,
      title: original.title,
      body: "Keep the newer saved idea.",
      asset_path: null,
      mime_type: null,
      x: original.x,
      y: original.y,
      width: original.width,
      height: original.height,
    },
  });
  expect(changedAgain.error).toBeNull();
  await dialog.getByRole("button", { name: "Remove item", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm removal", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("changed elsewhere");
  await dialog
    .getByRole("button", { name: "Discard my edits and load saved item", exact: true })
    .click();
  await expect(dialog.getByLabel("Note text", { exact: true })).toHaveValue(
    "Keep the newer saved idea.",
  );
  // A committed local overlay must not reappear after another collaborator deletes its saved item.
  const removed = await agency.rpc("delete_playground_item", {
    p_board_id: original.board_id,
    p_item_id: original.id,
    p_expected_revision: (changedAgain.data as { revision: number }).revision,
  });
  expect(removed.error).toBeNull();
  await dialog.getByRole("button", { name: "Refresh Playground", exact: true }).click();
  await expect(dialog.getByText("An idempotent idea", { exact: true })).toHaveCount(0);
});

test("an agency session drags a Brand Hub asset and a working design onto the Playground board", async ({
  page,
  workspace,
}) => {
  const seed = await seedPlaygroundAlbumsFixture(workspace);
  try {
    await signIn(page, credentials.agency);
    await page.goto(`/projects/${workspace.projectId}?view=versions`);
    await openPlayground(page);
    const board = playground(page);

    await board.getByRole("button", { name: "Acceptance logos" }).click();
    const brandThumb = board.getByTitle("Acceptance wordmark");
    await expect(brandThumb).toBeVisible();
    await brandThumb.dragTo(board.locator(".playground-canvas"));
    await expect(board.getByText("Acceptance wordmark.png")).toBeVisible();

    await board.getByRole("button", { name: "Campaign square · V1" }).click();
    const designThumb = board.getByTitle("Acceptance square design");
    await designThumb.dragTo(board.locator(".playground-canvas"), {
      targetPosition: { x: 400, y: 200 },
    });
    await expect(board.getByText("Acceptance square design.png")).toBeVisible();
    await expect(board.getByText("All changes saved")).toBeVisible({ timeout: 15_000 });

    const boardRow = await localAdmin
      .from("playground_boards")
      .select("id")
      .eq("client_id", workspace.clientId)
      .eq("project_id", workspace.projectId)
      .eq("role", "agency")
      .single();
    if (boardRow.error) throw boardRow.error;
    const items = await localAdmin
      .from("playground_items")
      .select("title,asset_path")
      .eq("board_id", boardRow.data.id);
    if (items.error) throw items.error;
    expect(items.data.map((item) => item.title).sort()).toEqual(
      ["Acceptance square design.png", "Acceptance wordmark.png"].sort(),
    );
    for (const item of items.data) {
      if (!item.asset_path) continue;
      const [boardId, itemId] = item.asset_path.split("/");
      const listed = await localAdmin.storage
        .from("playground-assets")
        .list(`${boardId}/${itemId}`);
      if (listed.error) throw listed.error;
      expect(listed.data.length).toBeGreaterThan(0);
    }
  } finally {
    await seed.cleanup();
  }
});

test("a client session sees only its shared versions, drags a published design onto its board, and never requests internal-assets", async ({
  page,
  workspace,
}) => {
  const seed = await seedPlaygroundAlbumsFixture(workspace);
  try {
    const requestedInternalAssets: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path.includes("/internal-assets/")) requestedInternalAssets.push(path);
    });

    await signIn(page, workspace.client.email);
    await page.goto(`/projects/${workspace.projectId}?view=versions`);
    await openPlayground(page);
    const board = playground(page);

    await expect(board.getByRole("button", { name: "Acceptance logos" })).toBeVisible();
    await expect(board.getByRole("button", { name: "Campaign square · V1" })).toBeVisible();

    await board.getByRole("button", { name: "Campaign square · V1" }).click();
    const designThumb = board.getByTitle("Acceptance square design");
    await designThumb.dragTo(board.locator(".playground-canvas"));
    await expect(board.getByText("Acceptance square design.png")).toBeVisible();
    await expect(board.getByText("All changes saved")).toBeVisible({ timeout: 15_000 });

    expect(requestedInternalAssets).toEqual([]);
  } finally {
    await seed.cleanup();
  }
});

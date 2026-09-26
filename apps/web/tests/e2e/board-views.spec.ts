import { join } from "node:path";
import { openBoardSearch, preserveBoardPreference, setBoardSearch } from "./test-support";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  credentials,
  evidenceDirectory,
  localAdmin,
  screenshotDirectory,
  signIn,
} from "./test-support";
import { createPlaygroundFixture } from "./playground-fixture";
import { boardViews, type BoardView } from "../../features/board/board-views";
import { calendarMonthLabel, monthStart, shiftMonth } from "../../features/board/calendar-model";

async function chooseView(page: Page, view: BoardView) {
  const label = boardViews.find((item) => item.id === view)!.label;
  const button = page.getByRole("button", { name: label, exact: true });
  await button.click();
  await expect(button).toBeEnabled();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("group", { name: "Board view", exact: true }).locator('[aria-pressed="true"]'),
  ).toHaveCount(1);
}

test("the floating header filters quarters across views and links to the signed-in profile", async ({
  page,
}) => {
  const fixture = await createPlaygroundFixture();
  const year = new Date().getUTCFullYear();
  try {
    expect(
      (
        await localAdmin
          .from("projects")
          .update({ start_date: `${year}-01-01`, due_date: `${year}-03-31` })
          .eq("id", fixture.projectId)
      ).error,
    ).toBeNull();
    expect(
      (
        await localAdmin
          .from("projects")
          .update({ start_date: `${year}-07-01`, due_date: `${year}-09-30` })
          .eq("id", fixture.otherProjectId)
      ).error,
    ).toBeNull();
    await signIn(page, credentials.agency);
    await page.goto(`/clients/${fixture.clientId}/board`);
    await chooseView(page, "list");
    const period = page.getByRole("button", { name: /^Board period:/ });
    await expect(period).toHaveAccessibleName("Board period: All periods");
    await expect(page.locator(".project-row")).toHaveCount(2);
    await period.click();
    const periodPanel = page.getByRole("region", { name: "Choose a board period", exact: true });
    await expect(
      periodPanel.getByRole("button", { name: "All periods", exact: true }),
    ).toBeFocused();
    await periodPanel.getByRole("button", { name: "Previous year", exact: true }).click();
    await expect(
      periodPanel.getByRole("button", { name: `Q1 ${year - 1}`, exact: true }),
    ).toBeVisible();
    await periodPanel.getByRole("button", { name: "Next year", exact: true }).click();
    await periodPanel.getByRole("button", { name: `Q1 ${year}`, exact: true }).click();
    await expect(period).toBeFocused();
    await expect(page.locator(".project-row")).toHaveCount(1);
    await expect(page.locator(".project-row")).toHaveAttribute(
      "href",
      `/projects/${fixture.projectId}`,
    );
    await period.click();
    await periodPanel.getByRole("button", { name: `Q3 ${year}`, exact: true }).click();
    await expect(page.locator(".project-row")).toHaveAttribute(
      "href",
      `/projects/${fixture.otherProjectId}`,
    );
    await chooseView(page, "kanban");
    await expect(period).toHaveAccessibleName(`Board period: Q3 ${year}`);
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
      [320, 640],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await period.click();
      await expect(
        periodPanel.getByRole("button", { name: `Q3 ${year}`, exact: true }),
      ).toBeFocused();
      await expect
        .poll(() =>
          periodPanel.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return {
              fits:
                rect.left >= 0 &&
                rect.right <= innerWidth &&
                rect.top >= 0 &&
                rect.bottom <= innerHeight,
              scrolls:
                element.scrollHeight > element.clientHeight ||
                element.scrollWidth > element.clientWidth,
            };
          }),
        )
        .toEqual({ fits: true, scrolls: false });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({ path: `${screenshotDirectory}/board-period-${width}.png` });
      await page.keyboard.press("Escape");
      await expect(periodPanel).toHaveCount(0);
      await expect(period).toBeFocused();
    }
    await period.click();
    await page.locator(".board-planning-head").click({ position: { x: 500, y: 10 } });
    await expect(periodPanel).toHaveCount(0);
    await period.click();
    await periodPanel.getByRole("button", { name: "All periods", exact: true }).click();
    await chooseView(page, "list");
    await expect(page.locator(".project-row")).toHaveCount(2);
    await page.locator(".board-profile").click();
    await expect(page).toHaveURL("/settings/account");
  } finally {
    await fixture.cleanup();
  }
});

for (const role of ["agency", "client", "designer"] as const) {
  test(`${role} uses five exclusive views with persistent choices and responsive accessible layouts`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const fixture = await createPlaygroundFixture();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      const due = new Date().toISOString().slice(0, 7) + "-15";
      expect(
        (
          await localAdmin
            .from("projects")
            .update({ start_date: due.slice(0, 7) + "-01", due_date: due })
            .eq("id", fixture.projectId)
        ).error,
      ).toBeNull();
      await signIn(page, role === "client" ? fixture.client.email : credentials[role]);
      await page.goto(`/clients/${fixture.clientId}/board`);
      await expect(
        page.getByRole("group", { name: "Board view", exact: true }).getByRole("button"),
      ).toHaveCount(5);
      await expect(page.getByRole("button", { name: "Widgets", exact: true })).toHaveCount(0);
      for (const width of [1600, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        for (const view of boardViews) {
          await chooseView(page, view.id);
          await page.reload();
          await expect(page.getByRole("button", { name: view.label, exact: true })).toHaveAttribute(
            "aria-pressed",
            "true",
          );
          await expect(page.locator(".board-canvas")).toHaveCount(view.id === "canvas" ? 1 : 0);
          await expect(page.locator(".board-list")).toHaveCount(view.id === "list" ? 1 : 0);
          await expect(
            page.getByRole("region", { name: "Project timeline", exact: true }),
          ).toHaveCount(view.id === "timeline" ? 1 : 0);
          await expect(
            page.getByRole("group", { name: "Projects by status", exact: true }),
          ).toHaveCount(view.id === "kanban" ? 1 : 0);
          await expect(
            page.getByRole("region", { name: "Project calendar", exact: true }),
          ).toHaveCount(view.id === "calendar" ? 1 : 0);
          expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
            false,
          );
          const fit = await page.locator(".board-page").evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return {
              bottom: rect.bottom,
              viewport: innerHeight,
              documentHeight: document.documentElement.scrollHeight,
            };
          });
          expect(fit.bottom).toBeLessThanOrEqual(fit.viewport + 1);
          expect(fit.documentHeight).toBeLessThanOrEqual(fit.viewport + 1);
          if (view.id === "kanban" && width === 1600) {
            expect(
              await page
                .locator(".kanban-board")
                .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
            ).toBe(true);
          }
          const result = await new AxeBuilder({ page }).analyze();
          expect(result.violations).toEqual([]);
          await page.screenshot({
            path: `${screenshotDirectory}/board-view-${role}-${view.id}-${width}.png`,
            fullPage: true,
          });
        }
      }
      expect(errors).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });
}

test("calendar places deadlines by date, keeps undated work, preserves filters and opens projects", async ({
  page,
}) => {
  const fixture = await createPlaygroundFixture();
  const month = monthStart(new Date().toISOString());
  const due = month.slice(0, 7) + "-15";
  try {
    expect(
      (
        await localAdmin
          .from("projects")
          .update({ start_date: due.slice(0, 7) + "-01", due_date: due })
          .eq("id", fixture.projectId)
      ).error,
    ).toBeNull();
    await signIn(page, credentials.agency);
    await page.goto(`/clients/${fixture.clientId}/board`);
    const calendarButton = page.getByRole("button", { name: "Calendar view", exact: true });
    await calendarButton.focus();
    await page.keyboard.press("Enter");
    await expect(calendarButton).toBeEnabled();
    await expect(
      page.locator(
        `.board-calendar-day:has(time[datetime="${due}"]) a[href="/projects/${fixture.projectId}"]`,
      ),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Projects without due dates", exact: true })
        .locator(`a[href="/projects/${fixture.otherProjectId}"]`),
    ).toBeVisible();
    const card = page.locator(
      `.board-calendar-grid article:has(a[href="/projects/${fixture.projectId}"])`,
    );
    await card.click();
    await expect(card).toHaveAttribute("aria-current", "true");
    await chooseView(page, "timeline");
    await expect(
      page.locator(`.timeline-lane:has(a[href="/projects/${fixture.projectId}"])`),
    ).toHaveAttribute("aria-current", "true");
    await chooseView(page, "calendar");
    await page.getByRole("button", { name: "Next month", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: calendarMonthLabel(shiftMonth(month, 1)), exact: true }),
    ).toBeVisible();
    await expect(page.getByText("No project due dates this month.", { exact: true })).toBeVisible();
    await chooseView(page, "list");
    await chooseView(page, "calendar");
    await expect(
      page.getByRole("heading", { name: calendarMonthLabel(shiftMonth(month, 1)), exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Previous month", exact: true }).click();
    await expect(card).toBeVisible();
    await page.getByRole("button", { name: "Next month", exact: true }).click();
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(card).toBeVisible();
    await setBoardSearch(page, "no matching project");
    for (const view of ["list", "timeline", "kanban", "calendar"] as const) {
      await chooseView(page, view);
      await expect(page.locator(`main a[href="/projects/${fixture.projectId}"]`)).toHaveCount(0);
      await expect(await openBoardSearch(page)).toHaveValue("no matching project");
    }
    await setBoardSearch(page, "");
    await card.getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/projects/${fixture.projectId}$`));
  } finally {
    await fixture.cleanup();
  }
});

test("timeline points to work outside the period and jumps to it", async ({ page }) => {
  const fixture = await createPlaygroundFixture();
  const today = new Date();
  // Six months out lies after the opening window at every scale.
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 6, 10))
    .toISOString()
    .slice(0, 10);
  const due = `${start.slice(0, 8)}20`;
  try {
    expect(
      (
        await localAdmin
          .from("projects")
          .update({ start_date: start, due_date: due })
          .eq("id", fixture.projectId)
      ).error,
    ).toBeNull();
    await signIn(page, credentials.agency);
    await page.goto(`/clients/${fixture.clientId}/board`);
    await chooseView(page, "timeline");
    const lane = page.locator(`.timeline-lane:has(a[href="/projects/${fixture.projectId}"])`);
    const pointer = lane.getByRole("button", { name: /^Show .+: starts / });
    await expect(pointer).toBeVisible();
    await expect(page.getByText("Outside this window")).toHaveCount(0);
    await expect(lane.locator(".timeline-project-bar")).toHaveCount(0);
    await pointer.click();
    await expect(lane.locator(".timeline-project-bar")).toBeVisible();
    await expect(pointer).toHaveCount(0);
    await page.screenshot({ path: `${screenshotDirectory}/timeline-pointer-jumped.png` });
  } finally {
    await fixture.cleanup();
  }
});

test("list sorts by a clicked column title and by the phone menu", async ({ page }) => {
  const sabre = await localAdmin.from("clients").select("id").eq("slug", "sabre").single();
  expect(sabre.error).toBeNull();
  const clientId = sabre.data!.id;
  const projects = await localAdmin
    .from("projects")
    .select("id,due_date")
    .eq("client_id", clientId);
  expect(projects.error).toBeNull();
  const dueDates = new Map(projects.data!.map((project) => [project.id, project.due_date]));
  const rowDueDates = async () =>
    (
      await page
        .locator(".board-list .project-row")
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("href")!.split("/").pop()!))
    ).map((id) => dueDates.get(id) ?? null);
  const expectDueOrder = async (direction: "asc" | "desc") => {
    const dates = await rowDueDates();
    const dated = dates.filter((date): date is string => Boolean(date));
    const expected = dated.toSorted();
    expect(dated).toEqual(direction === "asc" ? expected : expected.toReversed());
    // Undated work stays last in both directions.
    expect(dates.slice(dated.length).every((date) => date === null)).toBe(true);
  };
  const restoreBoard = await preserveBoardPreference(credentials.agency, clientId);
  try {
    await signIn(page, credentials.agency);
    await page.goto(`/clients/${clientId}/board`);
    await chooseView(page, "list");
    const head = page.locator(".board-list .table-head");
    const due = head.getByRole("button", { name: /^Due/ });
    await due.click();
    await expect(due).toHaveAccessibleName("Due, earliest first");
    await expectDueOrder("asc");
    await due.click();
    await expect(due).toHaveAccessibleName("Due, latest first");
    await expectDueOrder("desc");
    await page.screenshot({ path: `${screenshotDirectory}/board-list-sorted-due-1600.png` });

    // Phones hide the title row; the Sort by menu carries the same state.
    await page.setViewportSize({ width: 390, height: 844 });
    const menu = page.getByLabel("Sort by", { exact: true });
    await expect(menu).toHaveValue("due-desc");
    await menu.selectOption("project-asc");
    const titles = await page.locator(".board-list .project-row strong").allTextContents();
    expect(titles).toEqual(
      titles.toSorted((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    );
  } finally {
    await restoreBoard();
  }
});

test("a canvas card spaces its version, dash and type evenly", async ({ page }) => {
  const sabre = await localAdmin.from("clients").select("id").eq("slug", "sabre").single();
  expect(sabre.error).toBeNull();
  const clientId = sabre.data!.id;
  const restoreBoard = await preserveBoardPreference(credentials.agency, clientId);
  try {
    await signIn(page, credentials.agency);
    await page.goto(`/clients/${clientId}/board`);
    await chooseView(page, "canvas");
    const meta = page.locator(".board-card-meta:has(.board-card-version + span)").first();
    // The dash sits as far from the version badge as from the deliverable type. Measured in the
    // card's own pixels, since the canvas is zoomed.
    const spacing = await meta.evaluate((element) => {
      const badge = element.querySelector<HTMLElement>(".board-card-version")!;
      const type = badge.nextElementSibling!;
      const scale = badge.getBoundingClientRect().width / badge.offsetWidth;
      return {
        display: getComputedStyle(element).display,
        beforeDash:
          (type.getBoundingClientRect().left - badge.getBoundingClientRect().right) / scale,
        afterDash: parseFloat(getComputedStyle(type, "::before").marginRight),
      };
    });
    expect(spacing.display).toBe("flex");
    expect(spacing.afterDash).toBeGreaterThan(0);
    expect(spacing.beforeDash).toBeCloseTo(spacing.afterDash, 0);
  } finally {
    await restoreBoard();
  }
});

test("view choices are isolated by viewer and client", async ({ browser }) => {
  const first = await createPlaygroundFixture();
  const second = await createPlaygroundFixture();
  const studioContext = await browser.newContext();
  const clientContext = await browser.newContext();
  const studio = await studioContext.newPage();
  const client = await clientContext.newPage();
  try {
    await signIn(studio, credentials.agency);
    await signIn(client, first.client.email);
    await studio.goto(`/clients/${first.clientId}/board`);
    await chooseView(studio, "calendar");
    await client.goto(`/clients/${first.clientId}/board`);
    // An unsaved board opens as a list for every viewer.
    await expect(client.getByRole("button", { name: "List view", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await chooseView(client, "kanban");
    await studio.reload();
    await expect(
      studio.getByRole("button", { name: "Calendar view", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await studio.goto(`/clients/${second.clientId}/board`);
    await expect(studio.getByRole("button", { name: "List view", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await chooseView(studio, "timeline");
    await studio.goto(`/clients/${first.clientId}/board`);
    await expect(
      studio.getByRole("button", { name: "Calendar view", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  } finally {
    await studioContext.close();
    await clientContext.close();
    await first.cleanup();
    await second.cleanup();
  }
});

test("a failed view save restores the confirmed choice and retries durably", async ({ page }) => {
  const fixture = await createPlaygroundFixture();
  try {
    await signIn(page, credentials.agency);
    await page.goto(`/clients/${fixture.clientId}/board`);
    await chooseView(page, "timeline");
    let fail = true;
    await page.route("**/rest/v1/rpc/save_board_view", async (route) => {
      if (fail) {
        fail = false;
        await route.abort("failed");
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Calendar view", exact: true }).click();
    await expect(
      page.getByText("Your board view could not be saved.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Timeline view", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("button", { name: "Calendar view", exact: true })).toBeEnabled();
    await page.reload();
    await expect(page.getByRole("button", { name: "Calendar view", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("the live SABRE board fits every view across desktop, tablet and phone sizes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { localAgency } = await import("./test-support");
  const agency = await localAgency();
  const client = await agency.from("clients").select("id").eq("slug", "sabre").single();
  expect(client.error).toBeNull();
  const clientId = client.data!.id;
  const userId = (await agency.auth.getUser()).data.user!.id;
  const saved = await localAdmin
    .from("board_preferences")
    .select("*")
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .maybeSingle();
  expect(saved.error).toBeNull();
  const evidence: unknown[] = [];
  try {
    await signIn(page, credentials.agency);
    let delayedCampaigns = false;
    await page.route("**/rest/v1/campaigns?**", async (route) => {
      if (!delayedCampaigns) {
        delayedCampaigns = true;
        // Reproduce projects resolving before the campaign frames that define the opening fit.
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      await route.continue();
    });
    await page.goto(`/clients/${clientId}/board`);
    for (const [width, height] of [
      [1920, 1080],
      [1440, 900],
      [1280, 800],
      [1024, 768],
      [768, 1024],
      [390, 844],
      [320, 640],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      for (const view of boardViews) {
        await chooseView(page, view.id);
        if (view.id === "canvas") {
          await expect
            .poll(async () =>
              page.locator(".board-canvas").evaluate((element) => {
                const canvas = element.getBoundingClientRect();
                const frames = [
                  ...element.querySelectorAll(
                    ".react-flow__node-campaign, .react-flow__node-addCampaign",
                  ),
                ].map((node) => node.getBoundingClientRect());
                if (!frames.length) return Infinity;
                const left = Math.min(...frames.map((rect) => rect.left));
                const right = Math.max(...frames.map((rect) => rect.right));
                return right - left <= canvas.width - 48
                  ? Math.abs(left - canvas.left - (canvas.right - right))
                  : Math.abs(left - canvas.left - 24);
              }),
            )
            .toBeLessThanOrEqual(2);
        }
        const geometry = await page.locator(".board-page").evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const surface = element
            .querySelector(".board-canvas, .board-list, .board-planning-view, .board-calendar")!
            .getBoundingClientRect();
          const toolbar = element.querySelector(".board-floating-toolbar")!.getBoundingClientRect();
          const dock = element.querySelector(".board-tool-dock")!.getBoundingClientRect();
          const workArea = element.querySelector(".board-work-area")!.getBoundingClientRect();
          const zoom = element.querySelector(".board-zoom-dock")?.getBoundingClientRect();
          const kanban = element.querySelector(".kanban-board");
          const calendar = element.querySelector(".board-calendar-grid");
          const identity = element.querySelector(".board-identity")!.getBoundingClientRect();
          const profile = element.querySelector(".board-profile")!.getBoundingClientRect();
          return {
            clientNameFits:
              element.querySelector(".board-identity h1")!.scrollWidth <=
              element.querySelector(".board-identity h1")!.clientWidth + 1,
            headerFits:
              identity.left >= workArea.left &&
              identity.right + 4 <= profile.left &&
              profile.right <= workArea.right &&
              identity.top >= workArea.top,
            headerClear: zoom
              ? [...element.querySelectorAll(".react-flow__node-campaign")].every(
                  (node) => node.getBoundingClientRect().top >= identity.bottom,
                )
              : identity.bottom <= surface.top,
            toolbarFits:
              dock.left >= 0 &&
              dock.right <= innerWidth &&
              dock.top >= workArea.top &&
              dock.bottom <= innerHeight,
            toolbarClear: toolbar.right <= surface.left || toolbar.top >= surface.bottom,
            canvasFullBleed:
              !zoom ||
              ["left", "top", "right", "bottom"].every(
                (edge) =>
                  Math.abs(
                    (surface[edge as keyof DOMRect] as number) -
                      (workArea[edge as keyof DOMRect] as number),
                  ) <= 1,
              ),
            zoomBelowToolbar:
              !zoom ||
              (zoom.top > toolbar.bottom &&
                Math.abs(zoom.left + zoom.width / 2 - dock.left - dock.width / 2) <= 1),
            zoomAtBottomLeft:
              !zoom ||
              innerWidth <= 900 ||
              innerHeight <= 700 ||
              (Math.abs(workArea.bottom - 16 - zoom.bottom) <= 1 &&
                Math.abs(zoom.left - dock.left) <= 1),
            boardBottom: bounds.bottom,
            surfaceBottom: surface.bottom,
            surfaceHeight: surface.height,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
            verticalOverflow: document.documentElement.scrollHeight > innerHeight + 1,
            kanbanFits: !kanban || kanban.scrollWidth <= kanban.clientWidth + 1,
            kanbanHeight: kanban?.clientHeight ?? null,
            calendarFits: !calendar || calendar.scrollHeight <= calendar.clientHeight + 1,
          };
        });
        evidence.push({ width, height, view: view.id, ...geometry });
        expect(geometry.toolbarFits).toBe(true);
        expect(geometry.clientNameFits).toBe(true);
        expect(geometry.headerFits).toBe(true);
        expect(geometry.headerClear).toBe(true);
        if (view.id !== "canvas") expect(geometry.toolbarClear).toBe(true);
        expect(geometry.canvasFullBleed).toBe(true);
        expect(geometry.zoomBelowToolbar).toBe(true);
        expect(geometry.zoomAtBottomLeft).toBe(true);
        expect(geometry.horizontalOverflow).toBe(false);
        expect(geometry.verticalOverflow).toBe(false);
        expect(geometry.boardBottom).toBeLessThanOrEqual(height + 1);
        expect(geometry.surfaceBottom).toBeLessThanOrEqual(height + 1);
        expect(geometry.surfaceHeight).toBeGreaterThan(80);
        expect(geometry.calendarFits).toBe(true);
        if (geometry.kanbanHeight !== null) expect(geometry.kanbanHeight).toBeGreaterThan(140);
        if (width >= 1440) expect(geometry.kanbanFits).toBe(true);
        if (width === 1440 || width === 390 || width === 844)
          await page.screenshot({
            path: `${screenshotDirectory}/board-fit-${view.id}-${width}.png`,
            fullPage: true,
          });
        if (view.id === "canvas" && (width === 1440 || width === 390)) {
          const transform = () =>
            page.locator(".board-canvas .react-flow__viewport").evaluate((node) => {
              const matrix = new DOMMatrix(getComputedStyle(node).transform);
              return { zoom: matrix.a, x: matrix.e, y: matrix.f };
            });
          const fitted = await transform();
          await page.getByRole("button", { name: "Zoom In", exact: true }).click();
          await expect
            .poll(async () => Math.abs((await transform()).zoom - fitted.zoom * 1.2))
            .toBeLessThan(0.001);
          await page.getByRole("button", { name: "Zoom Out", exact: true }).click();
          await expect
            .poll(async () => Math.abs((await transform()).zoom - fitted.zoom))
            .toBeLessThan(0.001);
          await page.getByRole("button", { name: "Zoom In", exact: true }).click();
          await expect
            .poll(async () => Math.abs((await transform()).zoom - fitted.zoom * 1.2))
            .toBeLessThan(0.001);
          await page.getByRole("button", { name: "Fit board to view", exact: true }).click();
          await expect
            .poll(async () => {
              const current = await transform();
              return Math.max(
                Math.abs(current.zoom - fitted.zoom),
                Math.abs(current.x - fitted.x),
                Math.abs(current.y - fitted.y),
              );
            })
            .toBeLessThan(0.001);
          for (let step = 0; step < 12; step++) {
            const zoomOut = page.getByRole("button", { name: "Zoom Out", exact: true });
            if (await zoomOut.isDisabled()) break;
            const before = (await transform()).zoom;
            await zoomOut.click();
            await expect
              .poll(async () => Math.abs((await transform()).zoom - Math.max(0.1, before / 1.2)))
              .toBeLessThan(0.001);
          }
          await expect(page.getByRole("button", { name: "Zoom Out", exact: true })).toBeDisabled();
          expect((await transform()).zoom).toBeCloseTo(0.1, 3);
          await page.getByRole("button", { name: "Fit board to view", exact: true }).click();
          await expect
            .poll(async () => Math.abs((await transform()).zoom - fitted.zoom))
            .toBeLessThan(0.001);
        }
      }
    }
  } finally {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      join(evidenceDirectory, "board-view-fit-2026-09-23.json"),
      JSON.stringify(evidence, null, 2) + "\n",
    );
    const restored = saved.data
      ? await localAdmin.from("board_preferences").upsert(saved.data)
      : await localAdmin
          .from("board_preferences")
          .delete()
          .eq("user_id", userId)
          .eq("client_id", clientId);
    expect(restored.error).toBeNull();
  }
});

test("floating tools open usable search and filter panels at desktop and mobile sizes", async ({
  page,
}) => {
  const fixture = await createPlaygroundFixture();
  try {
    await signIn(page, credentials.agency);
    await page.goto(`/clients/${fixture.clientId}/board`);
    await chooseView(page, "list");
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await setBoardSearch(page, "alternate");
      await expect(
        page.getByRole("textbox", { name: "Search projects", exact: true }),
      ).toBeFocused();
      await expect(page.locator(".board-result-count")).toHaveText("1 project");
      for (const tool of ["search", "filters"]) {
        if (tool === "filters")
          await page.getByRole("button", { name: "Filters", exact: true }).click();
        const panel = page.locator(".board-tool-panel");
        await expect(panel).toBeVisible();
        const rect = await panel.boundingBox();
        expect(rect!.x).toBeGreaterThanOrEqual(0);
        expect(rect!.y).toBeGreaterThanOrEqual(0);
        expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
        expect(rect!.y + rect!.height).toBeLessThanOrEqual(height);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await page.screenshot({
          path: `${screenshotDirectory}/board-tool-${tool}-${width}.png`,
          fullPage: true,
        });
      }
      await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("approved");
      await expect(page.locator(".board-result-count")).toHaveText("0 projects");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeFocused();
      await expect(page.locator(".board-tool-panel")).toHaveCount(0);
      await page.getByRole("button", { name: "Filters", exact: true }).click();
      await expect(page.getByRole("combobox", { name: "Status", exact: true })).toHaveValue(
        "approved",
      );
      await page
        .locator(".board-tool-panel")
        .getByRole("button", { name: "Clear filters", exact: true })
        .click();
      await expect(page.locator(".board-result-count")).toHaveText("2 projects");
      // An outside click on the header card's own padding (its logo now links to the Overview).
      await page.locator(".board-identity").click({ position: { x: 4, y: 4 } });
      await expect(page.locator(".board-tool-panel")).toHaveCount(0);
    }
    await expect(page.getByRole("link", { name: "New briefing", exact: true })).toHaveAttribute(
      "href",
      `/clients/${fixture.clientId}/briefings/new`,
    );
  } finally {
    await fixture.cleanup();
  }
});

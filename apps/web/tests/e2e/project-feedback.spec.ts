import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createPlaygroundFixture } from "./playground-fixture";
import {
  credentials,
  localAdmin,
  localAgency,
  localCaller,
  screenshotDirectory,
  signIn,
} from "./test-support";

function value<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("Missing feedback fixture result.");
  return result.data as NonNullable<T>;
}

test("version feedback preserves review history, scoped comments, drafts and client permissions", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const fixture = await createPlaygroundFixture();
  const agency = await localAgency();
  const client = await localCaller(credentials.client);
  const publications: string[] = [];
  const releaseNote =
    "Please review the composition across both directions. The headline and call to action should remain consistent throughout this campaign.";
  const decisionNote =
    "The first direction needs more spacing around its headline. Please keep the overall message and apply the same typography to both designs.";
  const errors: string[] = [];
  const internalReads: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/\/rest\/v1\/(designs|design_versions|internal_comments)\?/.test(request.url()))
      internalReads.push(request.url());
  });
  try {
    const deliverable = value(
      await agency.from("deliverables").select("id").eq("project_id", fixture.projectId).single(),
    );
    for (let round = 1; round <= 2; round++) {
      const version = value(
        await agency.rpc("create_design_version", {
          p_deliverable_id: deliverable.id,
          p_notes: "Private working notes.",
        }),
      );
      for (const title of ["Direction A", "Direction B"]) {
        value(
          await agency.rpc("add_design", {
            p_version_id: version,
            p_title: title,
            p_content: {
              headline: "Small essentials. A fresh start.",
              background: "#f6f6f4",
              foreground: "#242424",
            },
          }),
        );
      }
      const publication = value(
        await agency.rpc("publish_version", {
          p_version_id: version,
          p_release_note: `${releaseNote} Round ${round}.`,
          p_assets: {},
        }),
      );
      publications.push(publication);
      value(
        await client.rpc("post_comment", {
          p_project_id: fixture.projectId,
          p_channel: "client",
          p_version_id: publication,
          p_body: `General discussion for round ${round}.`,
        }),
      );
      if (round === 1)
        expect(
          (
            await client.rpc("review_publication", {
              p_publication_id: publication,
              p_decision: "changes_requested",
              p_feedback: decisionNote,
            })
          ).error,
        ).toBeNull();
    }
    const designs = value(
      await client
        .from("published_designs")
        .select("id")
        .eq("publication_id", publications[0])
        .order("sort_order"),
    );
    value(
      await client.rpc("post_comment", {
        p_project_id: fixture.projectId,
        p_channel: "client",
        p_version_id: publications[0],
        p_design_id: designs[0].id,
        p_body: "Give this headline more space.",
        p_pin_x: 0.4,
        p_pin_y: 0.3,
      }),
    );
    await signIn(page, credentials.client);
    await page.goto(`/projects/${fixture.projectId}`);
    await expect(page.locator(".version-card")).toHaveCount(2);
    await expect(page.locator(".version-note, .version-feedback")).toHaveCount(0);
    const artwork = page.getByRole("button", { name: "Review Direction A", exact: true }).first();
    await artwork.click();
    await expect(page.locator(".design-viewer")).toHaveCount(0);
    await artwork.dblclick();
    await expect(page.getByRole("button", { name: "This design", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator(".comment-panel")).toContainText("Give this headline more space.");
    await page.getByRole("button", { name: "All designs", exact: true }).click();
    await artwork.press("Enter");
    await expect(page.locator(".design-viewer")).toBeVisible();
    await page.getByRole("button", { name: "All designs", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Open feedback for version 1", exact: true }),
    ).toContainText("2 comments");
    await page.getByRole("button", { name: "Open feedback for version 1", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "Client conversation" });
    const general = panel.getByRole("button", { name: "General feedback", exact: true });
    const design = panel.getByRole("button", { name: "This design", exact: true });
    const message = panel.getByRole("textbox", { name: "Your message", exact: true });
    await expect(general).toHaveAttribute("aria-pressed", "true");
    await expect(panel).toContainText(`${releaseNote} Round 1.`);
    await expect(panel).toContainText(decisionNote);
    await expect(panel).toContainText("General discussion for round 1.");
    await expect(panel).not.toContainText("General discussion for round 2.");
    await expect(panel).not.toContainText("Give this headline more space.");
    await message.fill("General draft for round one");
    await design.click();
    await expect(panel).toContainText("Give this headline more space.");
    await expect(panel).not.toContainText("General discussion for round 1.");
    await expect(message).toHaveValue("");
    await message.fill("Draft for this image only");
    await page.getByRole("button", { name: "Add pin", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Place a pin on this artwork. Press Enter for the center.",
        exact: true,
      })
      .press("Enter");
    await expect(panel.locator(".pending-pin")).toBeVisible();
    await general.click();
    await expect(panel.locator(".pending-pin")).toHaveCount(0);
    await expect(message).toHaveValue("General draft for round one");
    await page.getByRole("button", { name: "All designs", exact: true }).click();
    await page.getByRole("button", { name: "Open feedback for version 2", exact: true }).click();
    await expect(panel).toContainText("General discussion for round 2.");
    await expect(panel).not.toContainText(decisionNote);
    await expect(message).toHaveValue("");
    await message.fill("The second round works across both designs.");
    await panel.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(
      panel.getByText("The second round works across both designs.", { exact: true }),
    ).toBeVisible();
    await expect(message).toHaveValue("");
    const saved = value(
      await client
        .from("client_comments")
        .select("publication_id,design_id")
        .eq("project_id", fixture.projectId)
        .eq("body", "The second round works across both designs.")
        .single(),
    );
    expect(saved).toEqual({ publication_id: publications[1], design_id: null });
    await panel.getByRole("button", { name: "Review version", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByLabel("Feedback", { exact: true })
      .fill("Approved for this campaign.");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Send review", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(panel).toContainText("Approved for this campaign.");
    await expect(panel.getByRole("button", { name: "Review version", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "All designs", exact: true }).click();
    await page.getByRole("button", { name: "Open feedback for version 1", exact: true }).click();
    await expect(message).toHaveValue("General draft for round one");
    await design.click();
    await expect(message).toHaveValue("Draft for this image only");
    await expect(panel.locator(".pending-pin")).toBeVisible();
    await page.getByRole("button", { name: "Next design", exact: true }).click();
    await expect(message).toHaveValue("");
    await expect(panel).not.toContainText("Give this headline more space.");
    await expect(page.locator(".project-add-design, .project-add-version")).toHaveCount(0);
    expect(internalReads).toEqual([]);
    expect(errors).toEqual([]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  } finally {
    await fixture.cleanup();
  }
});

test("floating project chrome fits desktop and mobile, including feedback and secondary panels", async ({
  page,
}) => {
  test.setTimeout(90_000);
  // "Retail Partner Introduction" only exists in the local SABRE demo overlay. Build an isolated
  // project with the same shape it relied on here (two published versions, the first carrying a
  // changes_requested review) through the same RPCs the app itself calls to publish and review a
  // version, so this passes against the canonical dataset too.
  const fixture = await createPlaygroundFixture();
  const agency = await localAgency();
  const client = await localCaller(credentials.client);
  const revisionNote =
    "Acceptance revision request: give the headline more breathing room and simplify the supporting copy.";
  try {
    const deliverable = value(
      await agency.from("deliverables").select("id").eq("project_id", fixture.projectId).single(),
    );
    for (let round = 1; round <= 2; round++) {
      const version = value(
        await agency.rpc("create_design_version", {
          p_deliverable_id: deliverable.id,
          p_notes: `Round ${round} working notes.`,
        }),
      );
      for (const title of ["Direction A", "Direction B"]) {
        value(
          await agency.rpc("add_design", {
            p_version_id: version,
            p_title: title,
            p_content: {
              headline: "Small essentials. A fresh start.",
              background: "#f6f6f4",
              foreground: "#242424",
            },
          }),
        );
      }
      const publication = value(
        await agency.rpc("publish_version", {
          p_version_id: version,
          p_release_note: `Acceptance review round ${round}.`,
          p_assets: {},
        }),
      );
      if (round === 1)
        expect(
          (
            await client.rpc("review_publication", {
              p_publication_id: publication,
              p_decision: "changes_requested",
              p_feedback: revisionNote,
            })
          ).error,
        ).toBeNull();
    }
    await signIn(page, credentials.agency);
    for (const [width, height] of [
      [1600, 1000],
      [1024, 700],
      [390, 844],
      [320, 640],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(`/projects/${fixture.projectId}?channel=client`);
      await expect(page.locator(".project-chrome .client-navigation")).toHaveCount(1);
      await expect(
        page.locator(".sidebar .client-navigation, .topbar .client-navigation"),
      ).toHaveCount(0);
      await expect(page.locator(".version-card")).toHaveCount(2);
      await expect
        .poll(() =>
          page.locator(".project-chrome").evaluate((element) => {
            const controls = Array.from(element.querySelectorAll("button, a, select"));
            const chrome = element.getBoundingClientRect();
            const first = document.querySelector(".deliverable-header")!.getBoundingClientRect();
            const card = element.querySelector(".project-header")!.getBoundingClientRect();
            const title = element.querySelector("h1")!.getBoundingClientRect();
            const metadata = element
              .querySelector(".project-heading > div")!
              .getBoundingClientRect();
            const channels = element
              .querySelector('[aria-label="Project channel"]')!
              .getBoundingClientRect();
            const actions = element
              .querySelector('[aria-label="Project actions"]')!
              .getBoundingClientRect();
            const filter = element.querySelector("select")!.getBoundingClientRect();
            const playground = element
              .querySelector('[aria-label="Playground"]')!
              .getBoundingClientRect();
            return (
              (innerWidth < 800 ||
                (metadata.left >= title.right &&
                  Math.abs((title.top + title.bottom) / 2 - (metadata.top + metadata.bottom) / 2) <
                    2)) &&
              channels.top > card.bottom &&
              actions.top > card.bottom &&
              filter.right <= playground.left &&
              Math.abs(
                (filter.top + filter.bottom) / 2 - (playground.top + playground.bottom) / 2,
              ) < 2 &&
              controls.every((control) => {
                const rect = control.getBoundingClientRect();
                return (
                  rect.width === 0 ||
                  (rect.left >= 0 &&
                    rect.right <= innerWidth &&
                    rect.top >= 0 &&
                    rect.bottom <= innerHeight)
                );
              }) &&
              first.top >= chrome.bottom &&
              document.documentElement.scrollWidth <= innerWidth
            );
          }),
        )
        .toBe(true);
      await page.getByRole("button", { name: "Fit View", exact: true }).click();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: `${screenshotDirectory}/project-floating-header-${width}.png`,
      });
      let panelBounds: { x: number; y: number; width: number; height: number } | null = null;
      for (const [label, content] of [
        ["Conversation", ".comment-panel"],
        ["Project details", ".project-details"],
      ]) {
        const trigger =
          label === "Notifications"
            ? page.getByRole("button", { name: /^Notifications/ })
            : page.getByRole("button", { name: label, exact: true });
        await trigger.click();
        await expect(page.locator(content)).toBeInViewport();
        const bounds = await page.locator(".project-inspector").boundingBox();
        if (panelBounds) expect(bounds).toEqual(panelBounds);
        panelBounds = bounds;
        await expect(
          page.locator(".project-inspector .project-panel-heading button[aria-label^='Close ']"),
        ).toBeFocused();
        await page.screenshot({
          path: `${screenshotDirectory}/project-panel-${label.toLowerCase().replaceAll(" ", "-")}-${width}.png`,
        });
        await page.keyboard.press("Escape");
        await expect(page.locator(".project-inspector")).toHaveCount(0);
        await expect(trigger).toBeFocused();
      }
      await page.getByRole("button", { name: "Open feedback for version 1", exact: true }).click();
      const panel = page.getByRole("complementary", { name: "Client conversation" });
      await panel
        .getByRole("button", { name: "General feedback", exact: true })
        .scrollIntoViewIfNeeded();
      await expect(panel.locator(".version-context")).toContainText("Acceptance revision request");
      await panel
        .getByRole("textbox", { name: "Your message", exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        panel.getByRole("textbox", { name: "Your message", exact: true }),
      ).toBeInViewport();
      const readingSpace = await panel.evaluate((element) => {
        const thread = element.querySelector(".comment-list")!;
        return {
          list: thread.clientHeight,
          panel: element.clientHeight,
          composer: element.querySelector(".comment-composer")!.clientHeight,
        };
      });
      expect(readingSpace.list).toBeGreaterThan(readingSpace.panel * 0.5);
      expect(readingSpace.composer).toBeLessThan(100);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(
        await page
          .locator(".design-viewer-toolbar")
          .evaluate(
            (element) =>
              element.getBoundingClientRect().top >=
              document.querySelector(".project-chrome")!.getBoundingClientRect().bottom,
          ),
      ).toBe(true);
      await expect(page.locator(".project-toolbar")).toHaveCount(0);
      await expect(
        page
          .locator(".design-viewer-toolbar")
          .getByRole("button", { name: "Playground", exact: true }),
      ).toBeVisible();
      await expect(
        page.locator(".board-account").getByRole("button", { name: /^Notifications/ }),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.locator(".design-viewer").evaluate((element) => {
            const bar = element.querySelector(".design-viewer-toolbar")!.getBoundingClientRect();
            const chrome = document.querySelector(".project-chrome")!.getBoundingClientRect();
            const artwork = element.querySelector(".artwork-stage")!.getBoundingClientRect();
            const carousel = element.querySelector(".design-carousel")!.getBoundingClientRect();
            return bar.top - chrome.bottom <= 14 && artwork.bottom < carousel.top;
          }),
        )
        .toBe(true);
      if (width === 1600) {
        await page.getByRole("button", { name: "Playground", exact: true }).click();
        const playground = page.getByRole("dialog", { name: "Playground", exact: true });
        await expect(playground).toBeVisible();
        await playground.getByRole("button", { name: "Back to project", exact: true }).click();
        await expect(playground).toHaveCount(0);
        await expect(page.locator(".design-viewer")).toBeVisible();
        await page.getByRole("button", { name: /^Notifications/ }).click();
        await expect
          .poll(() =>
            page
              .locator(".notifications-popover")
              .evaluate(
                (element) =>
                  element.getBoundingClientRect().top >=
                  document.querySelector(".board-account")!.getBoundingClientRect().bottom,
              ),
          )
          .toBe(true);
        await page.keyboard.press("Escape");
      }
      await page.screenshot({
        path: `${screenshotDirectory}/project-general-feedback-${width}.png`,
      });
    }
  } finally {
    await fixture.cleanup();
  }
});

test("an empty working version keeps private notes and general discussion accessible", async ({
  page,
}) => {
  const fixture = await createPlaygroundFixture();
  const agency = await localAgency();
  try {
    const deliverable = value(
      await agency.from("deliverables").select("id").eq("project_id", fixture.projectId).single(),
    );
    const version = value(
      await agency.rpc("create_design_version", {
        p_deliverable_id: deliverable.id,
        p_notes: "Explore two directions before sharing anything with the client.",
      }),
    );
    const account = await agency.auth.getUser();
    if (account.error || !account.data.user) throw new Error("Missing notification fixture user.");
    const notification = value(
      await localAdmin
        .from("notifications")
        .insert({
          user_id: account.data.user.id,
          project_id: fixture.projectId,
          client_id: fixture.clientId,
          title: "Acceptance feedback notification",
          body: "A private working version is ready.",
        })
        .select("id")
        .single(),
    );
    await signIn(page, credentials.agency);
    await page.goto(`/projects/${fixture.projectId}`);
    await page.getByRole("button", { name: "Open feedback for version 1", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "Studio conversation", exact: true });
    await expect(panel).toContainText(
      "Explore two directions before sharing anything with the client.",
    );
    await panel
      .getByRole("textbox", { name: "Your message", exact: true })
      .fill("Internal direction for this version.");
    await panel.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(panel.getByRole("textbox", { name: "Your message", exact: true })).toHaveValue("");
    const saved = value(
      await agency
        .from("internal_comments")
        .select("version_id,design_id")
        .eq("project_id", fixture.projectId)
        .single(),
    );
    expect(saved).toEqual({ version_id: version, design_id: null });
    await panel.getByRole("button", { name: "Close feedback", exact: true }).click();
    await expect(panel).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Open feedback for version 1", exact: true }),
    ).toContainText("1 comment");
    await page.getByRole("button", { name: /^Notifications/ }).click();
    const notifications = page.getByRole("dialog", { name: "Notifications", exact: true });
    await expect(notifications).toContainText("Acceptance feedback notification");
    await notifications
      .getByRole("button", { name: "Mark Acceptance feedback notification as read", exact: true })
      .click();
    await expect(
      notifications.getByRole("button", {
        name: "Mark Acceptance feedback notification as read",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      value(
        await localAdmin.from("notifications").select("read_at").eq("id", notification.id).single(),
      ).read_at,
    ).not.toBeNull();
    await expect(page).toHaveURL(`/projects/${fixture.projectId}`);
  } finally {
    await fixture.cleanup();
  }
});

test("touch opens design feedback without requiring a double tap", async ({ browser }) => {
  // "Retail Partner Introduction" only exists in the local SABRE demo overlay. Any published
  // design works for this check, so build a minimal isolated one through the same RPCs the app
  // calls to publish a version.
  const fixture = await createPlaygroundFixture();
  const agency = await localAgency();
  try {
    const deliverable = value(
      await agency.from("deliverables").select("id").eq("project_id", fixture.projectId).single(),
    );
    const version = value(
      await agency.rpc("create_design_version", {
        p_deliverable_id: deliverable.id,
        p_notes: "Working notes for the touch fixture.",
      }),
    );
    value(
      await agency.rpc("add_design", {
        p_version_id: version,
        p_title: "Direction A",
        p_content: {
          headline: "Small essentials. A fresh start.",
          background: "#f6f6f4",
          foreground: "#242424",
        },
      }),
    );
    value(
      await agency.rpc("publish_version", {
        p_version_id: version,
        p_release_note: "Acceptance touch fixture release.",
        p_assets: {},
      }),
    );
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
    });
    try {
      const page = await context.newPage();
      await signIn(page, credentials.client);
      await page.goto(`/projects/${fixture.projectId}`);
      await page.locator(".design-preview-artwork").first().tap();
      await expect(page.locator(".design-viewer")).toBeVisible();
      await expect(page.getByRole("button", { name: "This design", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    } finally {
      await context.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

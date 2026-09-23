import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createIntakeFixture, cleanupIntakeFixture } from "./intake-fixture";
import { credentials, localAdmin, screenshotDirectory, signIn } from "./test-support";

for (const role of ["agency", "client"] as const)
  test(`${role}: new briefing opens above the board, saves and submits real data, and returns to the same view`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const fixture = await createIntakeFixture();
    try {
      await signIn(page, role === "agency" ? credentials.agency : fixture.email);
      const board = `/clients/${fixture.clientId}/board`;
      await page.goto(board);
      await page.getByRole("button", { name: "Calendar view", exact: true }).click();
      await expect(page.getByRole("button", { name: "Calendar view", exact: true })).toBeEnabled();
      const trigger = page.getByRole("link", { name: "New briefing", exact: true });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "New briefing", exact: true });
      await expect(dialog).toBeVisible();
      await expect(page.locator(".board-calendar")).toBeVisible();
      await expect(dialog.locator(".service-card")).toHaveCount(20);
      const serviceSearch = dialog.getByRole("textbox", { name: "Find a service", exact: true });
      await serviceSearch.fill("no matching service");
      await expect(dialog.getByText("No services match your search.")).toBeVisible();
      await dialog.getByRole("button", { name: "Show all services", exact: true }).click();
      await dialog
        .getByRole("combobox", { name: "Service category", exact: true })
        .selectOption("Video");
      await serviceSearch.fill("rEeL");
      await expect(dialog.locator(".service-card")).toHaveCount(1);
      await expect(dialog.locator(".service-card")).toContainText("Short Video / Reel");
      await serviceSearch.fill("");
      await dialog
        .getByRole("combobox", { name: "Service category", exact: true })
        .selectOption("");
      for (const [width, height] of [
        [1440, 900],
        [390, 844],
        [844, 390],
      ]) {
        await page.setViewportSize({ width, height });
        const bounds = await dialog.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
        expect(
          await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        ).toBe(true);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await expect(
          dialog.getByRole("button", { name: "Continue to details", exact: true }),
        ).toBeInViewport();
        await page.screenshot({
          path: `${screenshotDirectory}/briefing-modal-${role}-${width}.png`,
        });
      }
      await page.keyboard.press("Escape");
      await expect(page).toHaveURL(board);
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await page.setViewportSize({ width: 1440, height: 900 });
      await trigger.click();
      await dialog.getByRole("button", { name: /Digital Ad \(Static\)/ }).click();
      await serviceSearch.fill("video");
      await expect(dialog.locator(".briefing-service-choice")).toContainText("Digital Ad (Static)");
      await dialog.getByRole("button", { name: "Continue to details", exact: true }).click();
      await dialog
        .getByRole("textbox", { name: "Project title", exact: true })
        .fill("Modal briefing acceptance");
      await page.keyboard.press("Escape");
      await expect(
        dialog.getByText("You have unsaved changes. Close this briefing?"),
      ).toBeVisible();
      await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
      await expect(dialog.getByRole("textbox", { name: "Project title", exact: true })).toHaveValue(
        "Modal briefing acceptance",
      );
      await expect(dialog.getByRole("combobox", { name: "Campaign", exact: true })).toHaveValue("");
      await dialog.getByRole("button", { name: "Review briefing", exact: true }).click();
      await expect(dialog.locator(".briefing-validation")).toBeFocused();
      await expect(dialog.locator(".briefing-validation")).toContainText("campaign");
      await dialog.getByRole("button", { name: "New campaign", exact: true }).click();
      const campaign = page.getByRole("dialog", { name: "New campaign", exact: true });
      await campaign.getByLabel("Campaign name").fill("Modal campaign");
      await campaign.getByRole("button", { name: "Create campaign", exact: true }).click();
      await expect(campaign).toHaveCount(0);
      await expect(dialog.getByRole("combobox", { name: "Campaign", exact: true })).not.toHaveValue(
        "",
      );
      await expect(dialog.locator(".briefing-validation")).toHaveCount(0);
      await dialog.getByRole("button", { name: "Portrait Feed", exact: true }).click();
      await expect(dialog.locator(".deliverable-size-settings")).not.toHaveAttribute("open", "");
      await dialog.getByText("Size settings", { exact: true }).click();
      await expect(dialog.getByLabel("Width (px)")).toHaveValue("1080");
      await dialog.getByLabel("Width (px)").fill("1200");
      await dialog
        .getByLabel("Overview", { exact: true })
        .fill("Introduce the autumn collection with a new social ad.");
      await dialog
        .getByRole("combobox", { name: "Content & assets", exact: true })
        .selectOption("I’ll provide the content");
      for (const [width, height] of [
        [1440, 900],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height });
        await dialog
          .getByRole("textbox", { name: "Project title", exact: true })
          .scrollIntoViewIfNeeded();
        expect(
          await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        ).toBe(true);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await page.screenshot({
          path: `${screenshotDirectory}/briefing-details-${role}-${width}.png`,
        });
        await dialog.getByLabel("Width (px)").scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `${screenshotDirectory}/briefing-formats-${role}-${width}.png`,
        });
        await expect(
          dialog.getByRole("button", { name: "Review briefing", exact: true }),
        ).toBeInViewport();
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
      await expect(dialog.getByText("Draft saved.", { exact: true })).toBeVisible();
      await expect(page).toHaveURL(`${board.replace(/\/board$/, "")}/briefings/new`);
      const saved = await localAdmin
        .from("briefings")
        .select("id,status,requested_deliverables")
        .eq("client_id", fixture.clientId)
        .eq("title", "Modal briefing acceptance")
        .single();
      expect(saved.error).toBeNull();
      expect(saved.data!.status).toBe("draft");
      expect(saved.data!.requested_deliverables).toEqual(
        expect.arrayContaining([expect.objectContaining({ width: 1200 })]),
      );
      await dialog.getByRole("button", { name: "Review briefing", exact: true }).click();
      await dialog.getByRole("button", { name: "Send briefing", exact: true }).click();
      const sent = page.getByRole("dialog", { name: "Briefing sent", exact: true });
      await expect(sent).toBeVisible();
      const submitted = await localAdmin
        .from("briefings")
        .select("status")
        .eq("id", saved.data!.id)
        .single();
      expect(submitted.error).toBeNull();
      expect(submitted.data!.status).toBe("awaiting_review");
      await expect(
        sent.getByRole("button", { name: "Close Briefing sent", exact: true }),
      ).toBeEnabled();
      await sent
        .getByRole("button", {
          name: role === "agency" ? "Done" : "Close Briefing sent",
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(board);
      await expect(
        page.getByRole("button", { name: "Calendar view", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await page.goto(`/clients/${fixture.clientId}/briefings/new`);
      await expect(page.getByRole("heading", { name: "New briefing", exact: true })).toBeVisible();
      await expect(page.getByRole("dialog", { name: "New briefing", exact: true })).toHaveCount(0);
    } finally {
      await cleanupIntakeFixture(fixture);
    }
  });

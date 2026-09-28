import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";
import { credentials, localAdmin, localAgency, localCaller, signIn } from "./test-support";
const outputs = fileURLToPath(new URL("../../../../outputs/", import.meta.url));

test("agency drafts, edits and releases an isolated production brief", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  try {
    const designer = await localCaller(credentials.designer);
    const designerId = (await designer.auth.getUser()).data.user!.id;
    expect(designerId).toBe(fixture.designerId);
    const client = await localCaller(credentials.client);
    const other = await localCaller(credentials.designer2);
    const original = (
      await agency.from("briefings").select("*").eq("id", fixture.briefingId).single()
    ).data!;
    const financialBefore = (
      await localAdmin.from("credit_ledger").select("id,amount").eq("project_id", fixture.projectId)
    ).data;
    const board = await agency.rpc("create_design_board", {
      p_project_id: fixture.projectId,
      p_name: "Internal concepts",
      p_designer_id: designerId,
      p_url: "https://miro.com/app/board/uXjVTest001=/",
    });
    expect(board.error).toBeNull();
    const boardId = board.data!;
    await page.route("https://miro.com/**", (route) => route.abort());
    await signIn(page, credentials.agency);
    await page.goto(`/projects/${fixture.projectId}`);
    await page.getByRole("button", { name: "Project details", exact: true }).click();
    await page.getByRole("button", { name: "Production", exact: true }).click();
    await page.getByRole("button", { name: "Prepare production brief", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Production brief", exact: true });
    await dialog.getByRole("button", { name: "Use client briefing as a starting point" }).click();
    await dialog.getByLabel("Production title", { exact: true }).fill("Studio exploration");
    await dialog
      .getByRole("textbox", { name: "Overview", exact: true })
      .fill("Create three distinct visual directions for studio selection.");
    await dialog.getByLabel("Quantity", { exact: true }).fill("3");
    await dialog.getByLabel("Anything else", { exact: true }).fill("Internal art direction only.");
    await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(
      (await designer.from("production_briefs").select("*").eq("board_id", boardId)).data,
    ).toEqual([]);
    expect(
      (await designer.from("production_brief_drafts").select("*").eq("board_id", boardId)).data,
    ).toEqual([]);
    await page.reload();
    await page.getByRole("button", { name: "Project details", exact: true }).click();
    await page.getByRole("button", { name: "Production", exact: true }).click();
    await expect(page.getByText("Draft · not sent to the designer", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit production brief", exact: true }).click();
    await expect(dialog.getByLabel("Quantity", { exact: true })).toHaveValue("3");
    for (const [width, height] of [
      [1512, 900],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect((await new AxeBuilder({ page }).include("dialog").analyze()).violations).toEqual([]);
      await page.screenshot({ path: outputs + `production-brief-editor-${width}.png` });
    }
    await dialog.getByRole("button", { name: "Send to designer", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const released = await designer
      .from("production_briefs")
      .select("*")
      .eq("board_id", boardId)
      .single();
    expect(released.error).toBeNull();
    expect(released.data!.content).toMatchObject({
      title: "Studio exploration",
      deliverables: [{ quantity: 3 }],
    });
    for (const caller of [client, other]) {
      expect(
        (await caller.from("production_briefs").select("*").eq("board_id", boardId)).data,
      ).toEqual([]);
      expect(
        (await caller.from("production_brief_drafts").select("*").eq("board_id", boardId)).data,
      ).toEqual([]);
    }
    expect(
      (await designer.from("briefings").select("*").eq("id", fixture.briefingId)).data,
    ).toEqual([]);
    expect(
      (await designer.rpc("get_assigned_briefings", { p_client_id: fixture.clientId })).data,
    ).toEqual([]);
    expect(
      (await designer.from("deliverables").select("*").eq("project_id", fixture.projectId)).data,
    ).toEqual([]);
    expect(
      (await designer.from("projects").select("description").eq("id", fixture.projectId)).error,
    ).not.toBeNull();
    expect(
      (
        await designer
          .rpc("visible_projects")
          .select("description")
          .eq("id", fixture.projectId)
          .single()
      ).data?.description,
    ).toBe("");
    const context = await browser.newContext();
    await context.route("https://miro.com/**", (route) => route.abort());
    const dp = await context.newPage();
    await signIn(dp, credentials.designer);
    await dp.goto(`/projects/${fixture.projectId}?panel=details&board=${boardId}`);
    await expect(
      dp.getByRole("heading", { name: "Studio exploration", exact: true }),
    ).toBeVisible();
    await expect(dp.getByText("3 originals", { exact: true })).toBeVisible();
    await expect(dp.getByText(original.overview, { exact: true })).not.toBeVisible();
    await expect(dp.getByRole("button", { name: "Client brief", exact: true })).not.toBeVisible();
    await expect(
      dp.getByRole("button", { name: "Edit production brief", exact: true }),
    ).not.toBeVisible();
    for (const [width, height] of [
      [1512, 900],
      [390, 844],
      [320, 740],
    ]) {
      await dp.setViewportSize({ width, height });
      expect(await dp.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        (await new AxeBuilder({ page: dp }).include(".project-inspector").analyze()).violations,
      ).toEqual([]);
      await dp.screenshot({ path: outputs + `production-brief-designer-${width}.png` });
    }
    await dp.goto(`/clients/${fixture.clientId}/briefings`);
    await dp.getByRole("link", { name: /Studio exploration/ }).click();
    await expect(
      dp.getByRole("heading", { name: "Studio exploration", exact: true }),
    ).toBeVisible();
    await dp.goto(`/clients/${fixture.clientId}/briefings/${fixture.briefingId}`);
    await expect(
      dp.getByRole("heading", { name: "Briefing unavailable.", exact: true }),
    ).toBeVisible();
    await context.close();
    expect(
      (await client.from("briefings").select("*").eq("id", fixture.briefingId).single()).data,
    ).toEqual(original);
    expect(
      (
        await localAdmin
          .from("credit_ledger")
          .select("id,amount")
          .eq("project_id", fixture.projectId)
      ).data,
    ).toEqual(financialBefore);
    expect(
      (
        await localAdmin
          .from("notifications")
          .select("user_id")
          .eq("project_id", fixture.projectId)
          .eq("title", "Production brief updated")
      ).data,
    ).toEqual([{ user_id: designerId }]);
  } finally {
    await cleanupTestProject(fixture.projectId);
  }
});

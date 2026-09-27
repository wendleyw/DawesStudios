import { expect, test, type Page } from "@playwright/test";
import {
  credentials,
  localAdmin,
  localCaller,
  preserveBoardPreference,
  signIn,
} from "./test-support";

const name = "Acceptance competitor Rival";
const editedName = "Acceptance competitor Updated";

async function sabreId() {
  const client = await localAdmin.from("clients").select("id").eq("slug", "sabre").single();
  if (client.error) throw client.error;
  return client.data.id;
}

async function removeFixtures(clientId: string) {
  const competitors = await localAdmin
    .from("competitors")
    .delete()
    .eq("client_id", clientId)
    .like("name", "Acceptance competitor%");
  if (competitors.error) throw competitors.error;
}

async function openCanvas(page: Page, clientId: string) {
  await page.goto(`/clients/${clientId}/board`);
  const canvas = page.getByRole("button", { name: "Canvas view" });
  if ((await canvas.getAttribute("aria-pressed")) !== "true") await canvas.click();
  await expect(page.getByLabel("Project canvas")).toBeVisible();
}

test("the agency places the widget and follows a competitor; a designer reads it; a client never sees it", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const clientId = await sabreId();
  const placed = await localAdmin
    .from("client_board_widgets")
    .select("kind")
    .eq("client_id", clientId);
  if (placed.error) throw placed.error;
  const widgetWasPlaced = placed.data.length > 0;
  const restoreAgencyView = await preserveBoardPreference(credentials.agency, clientId);
  const restoreDesignerView = await preserveBoardPreference(credentials.designer, clientId);
  const restoreClientView = await preserveBoardPreference(credentials.client, clientId);
  await removeFixtures(clientId);
  if (widgetWasPlaced)
    await localAdmin.from("client_board_widgets").delete().eq("client_id", clientId);
  // SABRE can carry a real, studio-added competitor outside this fixture's own rows (never deleted
  // or changed here); read it so the widget's initial state assertion stays accurate either way.
  const preexisting = await localAdmin
    .from("competitors")
    .select("name")
    .eq("client_id", clientId)
    .not("name", "like", "Acceptance competitor%")
    .order("name", { ascending: true });
  if (preexisting.error) throw preexisting.error;
  const preexistingNames = preexisting.data.map((row) => row.name);
  try {
    // The agency places the widget and adds a competitor.
    await signIn(page, credentials.agency);
    await openCanvas(page, clientId);
    await page.getByRole("button", { name: "Board widgets" }).click();
    await page
      .getByRole("region", { name: "Board widgets" })
      .getByRole("button", { name: "Add to board" })
      .click();
    const widget = page.getByRole("region", { name: "Competitor ads" });
    if (preexistingNames.length === 0) {
      await expect(widget).toContainText("Add the competitors you want to follow.");
    } else {
      for (const preexistingName of preexistingNames)
        await expect(widget).toContainText(preexistingName);
    }
    await widget.getByRole("button", { name: "Add competitor" }).click();
    const form = page.getByRole("dialog", { name: "Add competitor" });
    await form.getByLabel("Name", { exact: true }).fill(name);
    await form.getByLabel(/Website/).fill("https://rival.example");
    await form.getByLabel(/Facebook Page ID/).fill("123456789");
    await form.getByLabel(/Google advertiser ID/).fill("AR01234567890123456789");
    await form.getByRole("button", { name: "Add competitor", exact: true }).click();
    await expect(form).toBeHidden();

    // Its screen links every official library and says previews are off without a token.
    await widget.getByRole("button", { name: new RegExp(name) }).click();
    const screen = page.getByRole("dialog", { name });
    const meta = screen.getByRole("link", { name: "Open in Meta Ad Library" });
    await expect(meta).toHaveAttribute(
      "href",
      "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&media_type=all&search_type=page&view_all_page_id=123456789",
    );
    await expect(meta).toHaveAttribute("target", "_blank");
    await expect(meta).toHaveAttribute("rel", "noopener noreferrer");
    await expect(screen).toContainText("In-app previews are off.");
    await screen.getByRole("button", { name: "TikTok" }).click();
    await expect(screen.getByRole("link", { name: "Open in TikTok Ad Library" })).toHaveAttribute(
      "href",
      "https://library.tiktok.com/ads?region=all&adv_name=Acceptance+competitor+Rival",
    );
    await screen.getByRole("button", { name: "Google" }).click();
    await expect(
      screen.getByRole("link", { name: "Open in Google Ads Transparency Center" }),
    ).toHaveAttribute(
      "href",
      "https://adstransparency.google.com/advertiser/AR01234567890123456789?region=anywhere",
    );
    await page.keyboard.press("Escape");
    await expect(screen).toBeHidden();

    await widget.getByRole("button", { name: new RegExp(name) }).click();
    await page.getByRole("dialog", { name }).getByRole("button", { name: "Edit" }).click();
    const edit = page.getByRole("dialog", { name: "Edit competitor" });
    await edit.getByLabel("Name", { exact: true }).fill(editedName);
    await edit.getByLabel(/Facebook Page ID/).fill("987654321");
    await edit.getByLabel(/TikTok advertiser name/).fill("Updated advertiser");
    await edit.getByRole("button", { name: "Save changes" }).click();
    await expect(edit).toBeHidden();
    await page.reload();
    const updatedWidget = page.getByRole("region", { name: "Competitor ads" });
    await updatedWidget.getByRole("button", { name: new RegExp(editedName) }).click();
    const updatedScreen = page.getByRole("dialog", { name: editedName });
    await expect(
      updatedScreen.getByRole("link", { name: "Open in Meta Ad Library" }),
    ).toHaveAttribute(
      "href",
      "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&media_type=all&search_type=page&view_all_page_id=987654321",
    );
    await updatedScreen.getByRole("button", { name: "TikTok" }).click();
    await expect(
      updatedScreen.getByRole("link", { name: "Open in TikTok Ad Library" }),
    ).toHaveAttribute(
      "href",
      "https://library.tiktok.com/ads?region=all&adv_name=Updated+advertiser",
    );
    await page.keyboard.press("Escape");
    await expect(updatedScreen).toBeHidden();

    const competitor = await localAdmin
      .from("competitors")
      .select("id,name,meta_page_id,tiktok_advertiser")
      .eq("client_id", clientId)
      .eq("name", editedName)
      .single();
    if (competitor.error) throw competitor.error;
    expect(competitor.data).toMatchObject({
      name: editedName,
      meta_page_id: "987654321",
      tiktok_advertiser: "Updated advertiser",
    });
    const adsPath = `/api/competitors/${competitor.data.id}/ads`;

    // An assigned designer reads the widget, cannot change it, and may ask the route.
    const designerContext = await browser.newContext();
    const designerPage = await designerContext.newPage();
    await signIn(designerPage, credentials.designer);
    await openCanvas(designerPage, clientId);
    const designerWidget = designerPage.getByRole("region", { name: "Competitor ads" });
    await expect(
      designerWidget.getByRole("button", { name: new RegExp(editedName) }),
    ).toBeVisible();
    await expect(designerWidget.getByRole("button", { name: "Add competitor" })).toHaveCount(0);
    await expect(designerPage.getByRole("button", { name: "Board widgets" })).toHaveCount(0);
    const designerSession = (await (await localCaller(credentials.designer)).auth.getSession()).data
      .session!;
    const designerAnswer = await designerPage.request.get(adsPath, {
      headers: { Authorization: `Bearer ${designerSession.access_token}` },
    });
    expect(designerAnswer.status()).toBe(200);
    expect(await designerAnswer.json()).toEqual({ status: "not_configured" });
    await designerContext.close();

    // A client never sees the widget, and the route refuses them as if it did not exist.
    const clientContext = await browser.newContext();
    const clientPage = await clientContext.newPage();
    await signIn(clientPage, credentials.client);
    await openCanvas(clientPage, clientId);
    await expect(clientPage.getByRole("region", { name: "Competitor ads" })).toHaveCount(0);
    const clientCaller = await localCaller(credentials.client);
    const clientRows = await clientCaller.from("competitors").select("id");
    expect(clientRows.data).toEqual([]);
    const clientSession = (await clientCaller.auth.getSession()).data.session!;
    const clientAnswer = await clientPage.request.get(adsPath, {
      headers: { Authorization: `Bearer ${clientSession.access_token}` },
    });
    expect(clientAnswer.status()).toBe(404);
    await clientContext.close();

    // The agency removes the competitor, then the widget.
    await updatedWidget.getByRole("button", { name: new RegExp(editedName) }).click();
    await page
      .getByRole("dialog", { name: editedName })
      .getByRole("button", { name: "Remove competitor" })
      .click();
    await page
      .getByRole("dialog", { name: editedName })
      .getByRole("button", { name: "Remove", exact: true })
      .click();
    await expect(updatedWidget.getByRole("button", { name: new RegExp(editedName) })).toHaveCount(
      0,
    );
    await updatedWidget
      .getByRole("button", { name: "Remove competitor ads from the board" })
      .click();
    await expect(updatedWidget).toHaveCount(0);
  } finally {
    await removeFixtures(clientId);
    await localAdmin.from("client_board_widgets").delete().eq("client_id", clientId);
    if (widgetWasPlaced)
      await localAdmin
        .from("client_board_widgets")
        .insert({ client_id: clientId, kind: "competitor_ads" });
    await restoreAgencyView();
    await restoreDesignerView();
    await restoreClientView();
  }
});

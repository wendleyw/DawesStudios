import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { chromium, expect } = require("@playwright/test");
/** The visible name of each brand section, which is what the navigation row is driven by. */
const sectionLabels = {
  overview: "Overview",
  logos: "Logos",
  colors: "Colors",
  typography: "Typography",
  "visual-style": "Visual style",
  products: "Products",
  assets: "Assets",
  templates: "Templates",
  messaging: "Messaging",
  ai: "Brand context",
};
const AxeBuilder = require("@axe-core/playwright").default;
const { createClient } = require("@supabase/supabase-js");
const env = Object.fromEntries(readFileSync(new URL("../../supabase/.env.local", import.meta.url), "utf8").split("\n").filter(line => line.includes("=") && !line.startsWith("#")).map(line => { const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)]; }));
const output = fileURLToPath(new URL("./screenshots/", import.meta.url));
mkdirSync(output, { recursive: true });
const report = { capturedAt: new Date().toISOString(), screenshots: [], accessibility: [], actions: {}, errors: [], cleanup: [] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });
const page = await context.newPage();
page.on("pageerror", error => report.errors.push(error.message));
page.setDefaultTimeout(20_000);
const agency = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const runName = `Brand browser audit ${crypto.randomUUID()}`;
let createdDraftId;
let assetName;
let clientId;

async function login(target, email) {
  await target.goto("http://localhost:3003/login");
  await target.getByLabel("Email address").fill(email);
  await target.getByLabel("Password", { exact: true }).fill(env.DEMO_PASSWORD);
  await target.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(target.locator(".topbar")).toBeVisible();
}
async function capture(name) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  report.screenshots.push({ name, viewport: page.viewportSize(), url: page.url(), horizontalOverflow });
}
async function audit(name) {
  const result = await new AxeBuilder({ page }).analyze();
  report.accessibility.push({ name, viewport: page.viewportSize(), violations: result.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })) });
}
function record() { writeFileSync(new URL("./brand-browser-audit.json", import.meta.url), JSON.stringify(report, null, 2)); }

try {
  await login(page, env.DEMO_AGENCY_EMAIL);
  await expect(page.locator(".client-nav").filter({ hasText: "SABRE" })).toBeVisible();
  const boardPath = await page.locator(".client-nav").filter({ hasText: "SABRE" }).getAttribute("href");
  clientId = boardPath.split("/")[2];
  const brandBase = `http://localhost:3003/clients/${clientId}/brand`;
  // The sections are a row of links; a section is opened the way a viewer opens it.
  const sectionNav = () => page.getByRole("navigation", { name: "Brand sections" });
  const openSection = section =>
    sectionNav().getByRole("link", { name: sectionLabels[section], exact: true }).click();
  await capture("brand-audit-home-desktop");

  for (const [width, height] of [[1600, 1000], [1024, 768], [1000, 800], [768, 1024], [390, 844], [320, 800]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${brandBase}/overview`);
    await expect(page.getByRole("heading", { name: "Brand Hub", exact: true })).toBeVisible();
    await capture(`brand-audit-overview-${width}`);
    await audit(`overview-${width}`);
    record();
  }

  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  const sidebar = page.getByRole("dialog", { name: "Workspace navigation" });
  await expect(sidebar).toBeVisible();
  report.actions.mobileWorkspaceInert = await page.locator(".workspace").evaluate(element => element.inert);
  report.actions.mobileInitialFocusInside = await sidebar.evaluate(element => element.contains(document.activeElement));
  for (let index = 0; index < 22; index++) await page.keyboard.press("Tab");
  report.actions.mobileFocusContained = await sidebar.evaluate(element => element.contains(document.activeElement));
  await capture("brand-audit-navigation-mobile");
  await audit("navigation-mobile");
  await page.keyboard.press("Escape");
  await expect(sidebar).not.toBeVisible();
  report.actions.mobileFocusRestored = await page.getByRole("button", { name: "Open navigation", exact: true }).evaluate(element => element === document.activeElement);
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.getByRole("link", { name: "Search", exact: false }).click();
  await expect(page.locator(".sidebar")).not.toBeVisible();
  report.actions.mobileNavigationCloses = true;
  record();

  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`${brandBase}/overview`);
  await page.getByRole("button", { name: "Edit overview", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit overview", exact: true });
  await expect(editor).toBeVisible();
  await capture("brand-audit-edit-dialog");
  await audit("edit-dialog");
  await page.keyboard.press("Shift+Tab");
  report.actions.modalFocusContained = await editor.evaluate(element => element.contains(document.activeElement));
  await page.keyboard.press("Escape");
  await expect(editor).not.toBeVisible();
  report.actions.modalFocusRestored = await page.getByRole("button", { name: "Edit overview", exact: true }).evaluate(element => element === document.activeElement);

  for (const section of ["logos", "colors", "typography", "visual-style", "products", "assets", "templates", "messaging", "ai"]) {
    await openSection(section);
    await expect(page).toHaveURL(`${brandBase}/${section}`);
    await expect(sectionNav().getByRole("link", { current: "page" })).toHaveText(sectionLabels[section]);
    if (section === "templates") await expect(page.locator(".brand-draft-note")).toBeVisible();
    if (section === "assets") await expect(page.getByRole("button", { name: "Add asset", exact: true })).toBeVisible();
    await capture(`brand-audit-${section}-desktop`);
    await audit(section);
    record();
  }

  await openSection("templates");
  await expect(page.locator(".brand-template-card")).toHaveCount(3);
  await page.getByLabel("Template category").selectOption("Social");
  await expect(page.locator(".brand-template-card")).toHaveCount(1);
  report.actions.templateCategoryFilter = true;
  await page.getByRole("button", { name: "Make it yours", exact: true }).click();
  await expect(page).toHaveURL(/\/brand\/drafts\//);
  await expect(page.getByLabel("Draft name", { exact: true })).toBeVisible();
  createdDraftId = page.url().split("/").at(-1);
  await page.getByLabel("Draft name", { exact: true }).fill(runName);
  await page.getByLabel("Headline", { exact: true }).fill("A persistent private exploration.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Saved to your drafts", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Headline", { exact: true })).toHaveValue("A persistent private exploration.");
  report.actions.draftSaveReload = true;
  await capture("brand-audit-draft-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("brand-audit-draft-mobile");
  await audit("draft-mobile");
  record();

  await page.goto(`${brandBase}/assets`);
  await page.getByRole("button", { name: "Add asset", exact: true }).click();
  await page.getByLabel("File", { exact: true }).setInputFiles(fileURLToPath(new URL("../../apps/web/public/brand/logo.webp", import.meta.url)));
  assetName = `${runName} file`;
  await page.getByLabel("Asset name", { exact: true }).fill(assetName);
  await page.getByLabel("Description", { exact: true }).fill("Temporary browser validation asset; removed after the audit.");
  await page.getByRole("button", { name: "Add asset", exact: true }).last().click();
  await expect(page.getByRole("dialog", { name: "Add a brand asset" })).not.toBeVisible();
  await page.getByLabel("Search brand assets").fill(assetName);
  await expect(page.locator(".brand-asset-card")).toHaveCount(1);
  await page.locator(".brand-asset-card").click();
  const received = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download file", exact: true }).click();
  const download = await received;
  report.actions.assetUploadDownload = (await download.failure()) === null;
  report.actions.assetSearch = true;
  record();

  const clientContext = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });
  const clientPage = await clientContext.newPage();
  await login(clientPage, env.DEMO_CLIENT_EMAIL);
  await clientPage.goto(`${brandBase}/overview`);
  await expect(clientPage.getByRole("heading", { name: "Brand Hub", exact: true })).toBeVisible();
  await expect(clientPage.getByRole("button", { name: "Edit overview", exact: true })).toHaveCount(0);
  report.actions.clientReadOnlyBrand = true;
  await clientPage.goto(`${brandBase}/drafts/${createdDraftId}`);
  await expect(clientPage.getByRole("heading", { name: "This draft is unavailable.", exact: true })).toBeVisible();
  report.actions.otherOwnerDraftHidden = true;
  await clientContext.close();
} catch (error) {
  report.errors.push(error instanceof Error ? error.message : String(error));
  await page.screenshot({ path: `${output}/brand-audit-failure.png`, fullPage: true }).catch(() => {});
} finally {
  const auth = await agency.auth.signInWithPassword({ email: env.DEMO_AGENCY_EMAIL, password: env.DEMO_PASSWORD });
  if (auth.error) report.cleanup.push({ error: "Could not authenticate for audit cleanup." });
  else {
    if (createdDraftId) { const result = await agency.from("template_drafts").delete().eq("id", createdDraftId); report.cleanup.push({ entity: "draft", success: !result.error, error: result.error?.message }); }
    if (assetName && clientId) {
      const found = await agency.from("brand_assets").select("id,storage_path").eq("client_id", clientId).eq("name", assetName);
      for (const asset of found.data ?? []) {
        const removed = await agency.from("brand_assets").delete().eq("id", asset.id);
        const storage = asset.storage_path ? await agency.storage.from("brand-assets").remove([asset.storage_path]) : { error: null };
        report.cleanup.push({ entity: "asset", success: !removed.error && !storage.error, error: removed.error?.message ?? storage.error?.message });
      }
    }
  }
  await agency.auth.signOut();
  await browser.close();
  record();
  console.log(JSON.stringify({ screenshots: report.screenshots.length, accessibilityChecks: report.accessibility.length, violations: report.accessibility.flatMap(item => item.violations).length, actions: report.actions, cleanup: report.cleanup, errors: report.errors }, null, 2));
  if (report.errors.length || Object.values(report.actions).some(value => value !== true) || report.accessibility.some(item => item.violations.length) || report.screenshots.some(item => item.horizontalOverflow)) process.exitCode = 1;
}

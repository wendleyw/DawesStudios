import { expect, test, type Page } from "@playwright/test";
import { credentials, localAdmin, localCaller, signIn } from "./test-support";

// Read-only: loads the primary surfaces as each role and fails on any Content-Security-Policy
// violation, so a policy that blocks signed Storage images, video posters, media-service calls or
// Realtime is caught before release. Playback and uploads are exercised by the video and project
// specs; this one creates and changes no data.

declare global {
  interface Window {
    __cspViolations?: string[];
  }
}

async function recordViolations(page: Page) {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__cspViolations?.push(`${event.violatedDirective} → ${event.blockedURI}`);
    });
  });
}

async function violationsAt(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main").first()).toBeVisible();
  // Realtime keeps a socket open, so network idle is a best effort before reading the log.
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  return page.evaluate(() => window.__cspViolations ?? []);
}

async function expectCleanSurfaces(page: Page, email: string, paths: string[]) {
  await recordViolations(page);
  await signIn(page, email);
  for (const path of paths) expect(await violationsAt(page, path), path).toEqual([]);
}

test("primary surfaces load without Content-Security-Policy violations for every role", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const client = await localCaller(credentials.client);
  const { data: ownClient, error: clientError } = await client
    .from("clients")
    .select("id")
    .single();
  expect(clientError).toBeNull();
  const clientId = ownClient!.id;
  // Prefer a published video, so the client's project page renders a video poster.
  const { data: published, error: publishedError } = await localAdmin
    .from("published_designs")
    .select("project_id, asset_path, projects!inner(client_id)")
    .eq("projects.client_id", clientId);
  expect(publishedError).toBeNull();
  const clientProject =
    published?.find((design) => design.asset_path?.endsWith(".mp4"))?.project_id ??
    published?.[0]?.project_id;
  expect(clientProject, "the client needs a published project").toBeTruthy();

  const designer = await localCaller(credentials.designer);
  const { data: assignment } = await designer
    .from("project_assignments")
    .select("project_id")
    .limit(1)
    .single();
  expect(assignment?.project_id, "the designer needs an assigned project").toBeTruthy();

  const surfaces: [string, string[]][] = [
    [
      credentials.agency,
      [
        `/clients/${clientId}/board`,
        `/projects/${clientProject}`,
        `/clients/${clientId}/brand/assets`,
        `/clients/${clientId}/briefings`,
      ],
    ],
    [credentials.designer, [`/projects/${assignment!.project_id}`]],
    [
      credentials.client,
      [
        `/clients/${clientId}/board`,
        `/projects/${clientProject}`,
        `/clients/${clientId}/brand/assets`,
      ],
    ],
  ];
  for (const [email, paths] of surfaces) {
    const context = await browser.newContext();
    try {
      await expectCleanSurfaces(await context.newPage(), email, paths);
    } finally {
      await context.close();
    }
  }
});

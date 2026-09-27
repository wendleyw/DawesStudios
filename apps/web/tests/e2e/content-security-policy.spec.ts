import { expect, test, type Page } from "@playwright/test";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";
import { credentials, localAdmin, localAgency, localCaller, signIn } from "./test-support";

// Loads the primary surfaces as each role and fails on any Content-Security-Policy
// violation, so a policy that blocks signed Storage images, the Miro embed, media-service calls or
// Realtime is caught before release. It changes no existing data; when no client project has a
// shared Miro link, it adds one disposable project for the embed and removes it afterwards.

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
  // Prefer a project with a shared client version, so the client's page embeds its Miro board.
  const { data: owned, error: projectError } = await localAdmin
    .from("projects")
    .select("id")
    .eq("client_id", clientId);
  expect(projectError).toBeNull();
  const ids = owned!.map((project) => project.id);
  expect(ids.length, "the client needs a project").toBeGreaterThan(0);
  const { data: shared, error: sharedError } = await localAdmin
    .from("publication_miro_links")
    .select("project_id")
    .in("project_id", ids)
    .limit(1);
  expect(sharedError).toBeNull();
  // Without one, a disposable project gets a client version, so the embed path always runs.
  let fixtureProject: string | null = null;
  if (!shared?.length) {
    const agency = await localAgency();
    fixtureProject = (await createProductionFixture(agency)).projectId;
    const version = await agency.rpc("share_miro_version", {
      p_project_id: fixtureProject,
      p_url: "https://miro.com/app/board/uXjVCspE2E=/",
      p_note: "Content-Security-Policy check.",
    });
    expect(version.error).toBeNull();
  }
  const clientProject = fixtureProject ?? shared![0].project_id;

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
        `/projects/${clientProject}?channel=client`,
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
  try {
    for (const [email, paths] of surfaces) {
      const context = await browser.newContext();
      try {
        await expectCleanSurfaces(await context.newPage(), email, paths);
      } finally {
        await context.close();
      }
    }
  } finally {
    if (fixtureProject) await cleanupTestProject(fixtureProject);
  }
});

import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import type { Database } from "@database";

// The local stack's credentials live in supabase/.env.local. Any other backend (a staging
// rehearsal, CI) must be declared with ACCEPTANCE_SUPABASE_URL and must supply every credential as
// ACCEPTANCE_<NAME>, so local credentials are never mixed with another backend's URL.
const localFile = new URL("../../../../supabase/.env.local", import.meta.url);
const localEnvironment: Record<string, string | undefined> = existsSync(localFile)
  ? parseEnv(readFileSync(localFile, "utf8"))
  : {};
const acceptanceBackend = process.env.ACCEPTANCE_SUPABASE_URL ?? "http://127.0.0.1:55421";
const declaredElsewhere = localEnvironment.SUPABASE_URL !== acceptanceBackend;
function required(name: string): string {
  if (name === "SUPABASE_URL" && declaredElsewhere) return acceptanceBackend;
  const value = declaredElsewhere ? process.env[`ACCEPTANCE_${name}`] : localEnvironment[name];
  if (!value)
    throw new Error(
      declaredElsewhere
        ? `Acceptance tests mutate data; set ACCEPTANCE_${name} for the declared backend (${acceptanceBackend}).`
        : `Missing local acceptance configuration: ${name}`,
    );
  return value;
}
export const password = required("DEMO_PASSWORD");
// Privileged cleanup SQL runs inside the declared backend's database container: the local stack's
// by default, and ACCEPTANCE_DB_CONTAINER for any other backend, never the local one by accident.
export function runPrivilegedSql(sql: string, timeout?: number) {
  const container = declaredElsewhere
    ? process.env.ACCEPTANCE_DB_CONTAINER
    : "supabase_db_dawes-studios";
  if (!container)
    throw new Error(
      `Acceptance tests mutate data; set ACCEPTANCE_DB_CONTAINER for the declared backend (${acceptanceBackend}).`,
    );
  execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: sql, stdio: ["pipe", "pipe", "pipe"], timeout },
  );
}
// Evidence (screenshots and JSON measurements) lands in the ignored outputs/ directory, so an
// ordinary run never rewrites committed records. Set WRITE_EVIDENCE=1 when a run should refresh
// the files a verification record in docs/verification cites.
const evidenceBase =
  process.env.WRITE_EVIDENCE === "1"
    ? "../../../../docs/verification/"
    : "../../../../outputs/verification/";
export const evidenceDirectory = fileURLToPath(new URL(evidenceBase, import.meta.url));
export const screenshotDirectory = fileURLToPath(
  new URL(`${evidenceBase}screenshots/`, import.meta.url),
);
mkdirSync(screenshotDirectory, { recursive: true });
export const credentials = {
  agency: "studio@dawes.local",
  designer: "designer@dawes.local",
  designer2: "designer2@dawes.local",
  client: "sabre@client.dawes.local",
};
const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
export const localAdmin = createClient<Database>(
  required("SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
  { auth },
);
export async function localCaller(email: string): Promise<SupabaseClient<Database>> {
  const caller = createClient<Database>(required("SUPABASE_URL"), required("SUPABASE_ANON_KEY"), {
    auth,
  });
  const { error } = await caller.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Local acceptance authentication failed: ${error.message}`);
  return caller;
}
export async function localAgency() {
  return localCaller(credentials.agency);
}
/**
 * React 19.2's development build times each component with `performance.measure`, and after a
 * client-side navigation it can hand the browser a negative start time, which the page reports as
 * an uncaught "… cannot have a negative time stamp" error. Production builds do not run that
 * instrumentation, so the message is development-server noise rather than a product error.
 */
export function isDevelopmentTimingNoise(message: string): boolean {
  return message.includes("cannot have a negative time stamp");
}

export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/(home|clients\/[^/]+\/(board|overview))$/);
}

/** The visible name of each brand section, which is what the navigation row is driven by. */
export const sectionLabels: Record<string, string> = {
  overview: "Overview",
  logos: "Logos",
  colors: "Colors",
  typography: "Typography",
  "visual-style": "Visual style",
  assets: "Assets",
  templates: "Templates",
  messaging: "Messaging",
  ai: "Brand context",
};

/** Restore this viewer's prior board presentation after tests that switch views on existing data. */
export async function preserveBoardPreference(email: string, clientId: string) {
  const caller = await localCaller(email);
  const account = await caller.auth.getUser();
  if (account.error || !account.data.user)
    throw new Error("Board preference authentication failed.");
  const userId = account.data.user.id;
  const saved = await localAdmin
    .from("board_preferences")
    .select("*")
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (saved.error) throw saved.error;
  return async () => {
    const result = saved.data
      ? await localAdmin.from("board_preferences").upsert(saved.data)
      : await localAdmin
          .from("board_preferences")
          .delete()
          .eq("user_id", userId)
          .eq("client_id", clientId);
    if (result.error) throw result.error;
  };
}

export async function openBoardSearch(page: Page) {
  const input = page.getByRole("textbox", { name: "Search projects", exact: true });
  if (!(await input.isVisible()))
    await page.getByRole("button", { name: "Search projects", exact: true }).click();
  await expect(input).toBeVisible();
  return input;
}

export async function setBoardSearch(page: Page, value: string) {
  await (await openBoardSearch(page)).fill(value);
}

/** The client navigation's board link, named after the viewer's saved board view. */
export const boardLink = /^(Canvas|List|Timeline|Kanban|Calendar)$/;

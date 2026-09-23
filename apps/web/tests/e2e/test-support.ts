import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import type { Database } from "@database";

const environment = parseEnv(
  readFileSync(new URL("../../../../supabase/.env.local", import.meta.url), "utf8"),
);
function required(name: string): string {
  const value = environment[name];
  if (!value) throw new Error(`Missing local acceptance configuration: ${name}`);
  return value;
}
export const password = required("DEMO_PASSWORD");
const acceptanceBackend = process.env.ACCEPTANCE_SUPABASE_URL ?? "http://127.0.0.1:55421";
if (required("SUPABASE_URL") !== acceptanceBackend)
  throw new Error(
    `Acceptance tests mutate data and must run against the declared backend (${acceptanceBackend}). Set ACCEPTANCE_SUPABASE_URL to run them elsewhere.`,
  );
export const screenshotDirectory = fileURLToPath(
  new URL("../../../../docs/verification/screenshots/", import.meta.url),
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
export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/(home|clients\/[^/]+\/board)$/);
}

/** The visible name of each brand section, which is what the navigation row is driven by. */
export const sectionLabels: Record<string, string> = {
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

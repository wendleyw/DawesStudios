import { expect, test as base } from "@playwright/test";
import {
  cleanupIntakeFixture,
  createIntakeFixture,
  latestAuthEmail,
  type IntakeFixture,
} from "./intake-fixture";
import { localAdmin, localAgency, localCaller } from "./test-support";

const test = base.extend<{ clients: [IntakeFixture, IntakeFixture] }>({
  clients: async ({}, runWithFixture) => {
    const fixtures: IntakeFixture[] = [];
    try {
      fixtures.push(await createIntakeFixture());
      fixtures.push(await createIntakeFixture());
      await runWithFixture(fixtures as [IntakeFixture, IntakeFixture]);
    } finally {
      for (const fixture of fixtures.reverse()) await cleanupIntakeFixture(fixture);
    }
  },
});

for (const removed of [false, true]) {
  test(
    removed
      ? "a removed client accepts a fresh invitation without regaining the former workspace"
      : "an existing client accepts another workspace without changing their password or losing access",
    async ({ page, request, clients: [former, next] }) => {
      test.setTimeout(90_000);
      const agency = await localAgency();
      const headers = {
        Authorization: `Bearer ${(await agency.auth.getSession()).data.session!.access_token}`,
      };
      const oldSession = await localCaller(former.email);
      if (removed) {
        const removal = await request.post(
          `/api/clients/${former.clientId}/members/${former.userId}/remove`,
          { headers },
        );
        expect(removal.status()).toBe(200);
        await expect(localCaller(former.email)).rejects.toThrow(
          "Local acceptance authentication failed",
        );
      }

      const invitation = await request.post("/api/invitations", {
        headers,
        data: { email: former.email, role: "client", clientId: next.clientId },
      });
      expect(invitation.status()).toBe(200);
      const { id } = (await invitation.json()) as { id: string };
      // Delivery and Auth unblocking alone must not grant the newly invited workspace.
      const beforeConsent = await oldSession.from("clients").select("id");
      expect(beforeConsent.error).toBeNull();
      expect(beforeConsent.data?.map((row) => row.id)).toEqual(removed ? [] : [former.clientId]);
      if (removed) {
        const profile = await localAdmin
          .from("profiles")
          .select("removed_at")
          .eq("id", former.userId)
          .single();
        expect(profile.error).toBeNull();
        expect(profile.data?.removed_at).not.toBeNull();
      }

      await expect.poll(() => latestAuthEmail(former.email, "magiclink")).not.toBeNull();
      const link = (await latestAuthEmail(former.email, "magiclink"))!;
      await page.goto(link);
      await expect(
        page.getByRole("button", { name: "Accept invitation", exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: test.info().outputPath("existing-client-invitation.png") });
      await page.getByRole("button", { name: "Accept invitation", exact: true }).click();
      await expect(page).not.toHaveURL(/\/auth\/invite/);
      await expect
        .poll(async () => {
          const result = await localAdmin
            .from("invitations")
            .select("status")
            .eq("id", id)
            .single();
          expect(result.error).toBeNull();
          return result.data?.status;
        })
        .toBe("accepted");

      // A fresh password sign-in proves that accepting the emailed link retained the old password.
      const returned = await localCaller(former.email);
      const visible = await returned.from("clients").select("id");
      expect(visible.error).toBeNull();
      const expected = removed ? [next.clientId] : [former.clientId, next.clientId];
      expect(visible.data?.map((row) => row.id).sort()).toEqual(expected.sort());
      const memberships = await localAdmin
        .from("client_memberships")
        .select("client_id")
        .eq("user_id", former.userId);
      expect(memberships.error).toBeNull();
      expect(memberships.data?.map((row) => row.client_id).sort()).toEqual(expected.sort());
      await page.goto(`/clients/${next.clientId}/overview`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const replay = await returned.rpc("accept_invitation", {
        p_token: new URL(new URL(link).searchParams.get("redirect_to")!).searchParams.get("token")!,
      });
      expect(replay.error).not.toBeNull();
      expect(
        (await returned.from("clients").select("id")).data?.map((row) => row.id).sort(),
      ).toEqual(expected.sort());
    },
  );
}

import { randomUUID } from "node:crypto";
import { localAdmin, localAgency, password, runPrivilegedSql } from "./test-support";

export type IntakeFixture = {
  clientId: string;
  clientName: string;
  email: string;
  userId: string;
  tag: string;
  userIds: string[];
};

export async function createIntakeFixture(): Promise<IntakeFixture> {
  const tag = randomUUID().slice(0, 8);
  const clientName = `Acceptance Intake ${tag}`;
  const agency = await localAgency();
  const client = await agency.rpc("create_client", {
    p_name: clientName,
    p_slug: `acceptance-intake-${tag}`,
    p_initial_credits: 100,
  });
  if (client.error) throw client.error;
  const email = `acceptance-intake-${tag}@client.dawes.local`;
  const user = await localAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (user.error || !user.data.user)
    throw user.error ?? new Error("Acceptance user was not created.");
  const membership = await localAdmin
    .from("client_memberships")
    .insert({ client_id: client.data, user_id: user.data.user.id });
  if (membership.error) throw membership.error;
  const brand = await localAdmin.from("brand_sections").insert([
    {
      client_id: client.data,
      section: "overview",
      content: { audience: "Thoughtful outdoor explorers" },
    },
    {
      client_id: client.data,
      section: "visual-style",
      content: { photography: "Natural daylight and generous whitespace" },
    },
    {
      client_id: client.data,
      section: "messaging",
      content: { headline: "Make room for the next adventure" },
    },
  ]);
  if (brand.error) throw brand.error;
  return {
    clientId: client.data,
    clientName,
    email,
    userId: user.data.user.id,
    tag,
    userIds: [user.data.user.id],
  };
}

function uuid(value: string): string {
  if (!/^[a-f0-9-]{36}$/i.test(value)) throw new Error("Unsafe acceptance fixture identifier.");
  return `'${value}'`;
}

export async function cleanupIntakeFixture(fixture: IntakeFixture) {
  const { data: client } = await localAdmin
    .from("clients")
    .select("name")
    .eq("id", fixture.clientId)
    .single();
  if (!client?.name.startsWith("Acceptance Intake "))
    throw new Error("Refusing to remove a non-acceptance client.");
  const briefs = await localAdmin.from("briefings").select("id").eq("client_id", fixture.clientId);
  const briefIds = (briefs.data ?? []).map((item) => item.id);
  if (briefIds.length) {
    const attachments = await localAdmin
      .from("briefing_attachments")
      .select("storage_path")
      .in("briefing_id", briefIds);
    if (attachments.data?.length) {
      const removal = await localAdmin.storage
        .from("briefing-files")
        .remove(attachments.data.map((item) => item.storage_path));
      if (removal.error) throw removal.error;
    }
  }
  const id = uuid(fixture.clientId);
  const users = fixture.userIds.map(uuid).join(",") || "null";
  const sql = `begin;
set local session_replication_role = replica;
do $$ begin if not exists(select 1 from public.clients where id=${id} and name like 'Acceptance Intake %') then raise exception 'Acceptance cleanup guard failed'; end if; end $$;
delete from private.audit_events where actor_id in (${users}) or entity_id=${id} or entity_id in(select id from public.briefings where client_id=${id}) or entity_id in(select id from public.projects where client_id=${id}) or entity_id in(select id from public.invitations where client_id=${id});
delete from private.invitation_tokens where invitation_id in(select id from public.invitations where client_id=${id});
delete from public.invitations where client_id=${id};
delete from public.notifications where client_id=${id} or user_id in (${users});
delete from public.briefing_attachments where briefing_id in(select id from public.briefings where client_id=${id});
delete from public.credit_requests where client_id=${id};
delete from public.project_settlements where project_id in(select id from public.projects where client_id=${id});
delete from public.credit_ledger where client_id=${id};
delete from public.credit_months where client_id=${id};
delete from public.credit_plans where client_id=${id};
delete from public.credit_accounts where client_id=${id};
delete from public.project_assignments where project_id in(select id from public.projects where client_id=${id});
delete from public.deliverables where project_id in(select id from public.projects where client_id=${id});
delete from public.projects where client_id=${id};
delete from public.briefings where client_id=${id};
delete from public.campaigns where client_id=${id};
delete from public.template_drafts where client_id=${id};
delete from public.brand_templates where client_id=${id};
delete from public.brand_assets where client_id=${id};
delete from public.brand_sections where client_id=${id};
delete from public.client_memberships where client_id=${id};
delete from public.clients where id=${id};
commit;`;
  runPrivilegedSql(sql);
  for (const userId of fixture.userIds) {
    const removed = await localAdmin.auth.admin.deleteUser(userId);
    if (removed.error) throw removed.error;
  }
}

export async function latestAuthEmail(
  email: string,
  kind: "invite" | "recovery",
): Promise<string | null> {
  const list = (await fetch("http://127.0.0.1:55424/api/v1/messages").then((response) =>
    response.json(),
  )) as { messages: { ID: string; To?: { Address: string }[] }[] };
  for (const item of list.messages.filter((message) =>
    message.To?.some((recipient) => recipient.Address.toLowerCase() === email.toLowerCase()),
  )) {
    const detail = (await fetch(`http://127.0.0.1:55424/api/v1/message/${item.ID}`).then(
      (response) => response.json(),
    )) as { Text?: string; HTML?: string };
    const candidates =
      `${detail.Text ?? ""}\n${detail.HTML ?? ""}`.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
    const result = candidates
      .map((link) => link.replaceAll("&amp;", "&"))
      .find((link) => link.includes("/auth/v1/verify") && link.includes(`type=${kind}`));
    if (result) return result;
  }
  return null;
}

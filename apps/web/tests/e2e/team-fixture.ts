import { randomUUID } from "node:crypto";
import { cleanupTestProject } from "./project-fixture";
import { localAdmin, localAgency, password, runPrivilegedSql } from "./test-support";

export type TeamMemberFixture = { id: string; email: string; name: string };

function value<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("The Team fixture did not return a record.");
  return result.data as NonNullable<T>;
}

function uuid(id: string) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
    throw new Error("Unsafe Team fixture identifier.");
  return `'${id}'`;
}

/** Every resource is registered before later setup can fail; the test fixture always cleans up. */
export function createTeamFixture() {
  const members: TeamMemberFixture[] = [];
  const projects: string[] = [];
  const clients: { id: string; name: string }[] = [];
  return {
    async member(role: "agency" | "designer" | "client" = "designer") {
      const tag = randomUUID();
      const email = `acceptance-team-${tag}@dawes.local`;
      const name = `Acceptance Team ${tag}`;
      const result = await localAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: name },
      });
      if (result.error || !result.data.user)
        throw result.error ?? new Error("The Team acceptance account was not created.");
      const member = { id: result.data.user.id, email, name };
      members.push(member);
      const profile = await localAdmin.from("profiles").update({ role }).eq("id", member.id);
      if (profile.error) throw profile.error;
      return member;
    },
    async assignedProject(member: TeamMemberFixture) {
      const tag = randomUUID();
      const name = `Acceptance Team ${tag}`;
      const client = value(
        await localAdmin
          .from("clients")
          .insert({ name, slug: `acceptance-team-${tag}` })
          .select("id")
          .single(),
      );
      clients.push({ id: client.id, name });
      const project = value(
        await localAdmin
          .from("projects")
          .insert({ client_id: client.id, title: name, service_type: "static-ad" })
          .select("id")
          .single(),
      );
      projects.push(project.id);
      const agency = await localAgency();
      const assigned = await agency.rpc("assign_designer", {
        p_project_id: project.id,
        p_designer_id: member.id,
      });
      if (assigned.error) throw assigned.error;
      return project.id;
    },
    async cleanup() {
      // Validate every target before cleanup begins. No seeded account can pass these guards.
      for (const member of members) {
        uuid(member.id);
        const account = await localAdmin.auth.admin.getUserById(member.id);
        if (
          account.error ||
          account.data.user?.email !== member.email ||
          !/^acceptance-team-[0-9a-f-]{36}@dawes\.local$/.test(member.email)
        )
          throw new Error("Refusing to clean up a non-Team acceptance account.");
      }
      for (const client of clients) {
        uuid(client.id);
        const existing = value(
          await localAdmin.from("clients").select("name").eq("id", client.id).single(),
        );
        if (existing.name !== client.name || !existing.name.startsWith("Acceptance Team "))
          throw new Error("Refusing to clean up a non-Team acceptance client.");
      }
      for (const projectId of projects) await cleanupTestProject(projectId);
      if (members.length) {
        const ids = members.map((member) => uuid(member.id)).join(",");
        runPrivilegedSql(
          `begin;
delete from private.audit_events where actor_id in (${ids}) or entity_id in (${ids});
delete from public.notifications where user_id in (${ids});
commit;`,
          20_000,
        );
      }
      for (const client of clients) {
        const deleted = await localAdmin.from("clients").delete().eq("id", client.id);
        if (deleted.error) throw deleted.error;
      }
      for (const member of members) {
        const deleted = await localAdmin.auth.admin.deleteUser(member.id);
        if (deleted.error) throw deleted.error;
      }
    },
  };
}

export type TeamFixture = ReturnType<typeof createTeamFixture>;

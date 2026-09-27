import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@database";
import { localAdmin, runPrivilegedSql } from "./test-support";

function value<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("Acceptance fixture did not return a record.");
  return result.data as NonNullable<T>;
}

export type FixtureDeliverable = {
  name: string;
  format: string;
  width: number | null;
  height: number | null;
  quantity?: number;
  scope?: string;
};

const defaultDeliverables: FixtureDeliverable[] = [
  {
    name: "Campaign square",
    format: "square",
    width: 1080,
    height: 1080,
    quantity: 1,
    scope: "original",
  },
];

export async function createProductionFixture(
  agency: SupabaseClient<Database>,
  deliverables: FixtureDeliverable[] = defaultDeliverables,
  /** Required once SABRE has two or more people; with one, `save_briefing` names that person. */
  requestedBy?: string,
) {
  const client = value(await agency.from("clients").select("id").eq("slug", "sabre").single());
  const campaign = value(
    await agency.from("campaigns").select("id").eq("client_id", client.id).limit(1).single(),
  );
  const designer = value(
    await agency
      .from("profiles")
      .select("id")
      .eq("role", "designer")
      .order("display_name")
      .limit(1)
      .single(),
  );
  const briefingId = value(
    await agency.rpc("save_briefing", {
      p_client_id: client.id,
      p_campaign_id: campaign.id,
      p_title: `Acceptance production ${crypto.randomUUID().slice(0, 8)}`,
      p_service_type: "static-ad",
      p_overview:
        "A browser acceptance project for the complete production and client review workflow.",
      p_goals: "Verify durable feedback, private work, fixed snapshots, and delivery.",
      p_direction: { questions: { content: "I’ll provide the content" } },
      p_deliverables: deliverables,
      p_estimated_credits: 4,
      ...(requestedBy ? { p_requested_by: requestedBy } : {}),
    }),
  );
  for (const result of [
    await agency.rpc("submit_briefing", { p_briefing_id: briefingId }),
    await agency.rpc("confirm_briefing_budget", {
      p_briefing_id: briefingId,
      p_credits: 4,
      p_note: "One deliverable with revision and delivery acceptance.",
    }),
  ])
    if (result.error) throw new Error(result.error.message);
  const projectId = value(await agency.rpc("accept_briefing", { p_briefing_id: briefingId }));
  const assignment = await agency.rpc("assign_designer", {
    p_project_id: projectId,
    p_designer_id: designer.id,
  });
  if (assignment.error) throw new Error(assignment.error.message);
  return { projectId, briefingId, clientId: client.id, designerId: designer.id };
}

export async function cleanupTestProject(projectId: string) {
  if (!/^[0-9a-f-]{36}$/.test(projectId)) throw new Error("Invalid test project ID.");
  const project = value(
    await localAdmin.from("projects").select("title").eq("id", projectId).single(),
  );
  if (!project.title.startsWith("Acceptance "))
    throw new Error("Cleanup only accepts explicitly named acceptance projects.");
  for (const bucket of [
    "internal-assets",
    "published-assets",
    "delivery-files",
    "project-covers",
  ]) {
    const objects = value(await localAdmin.storage.from(bucket).list(projectId, { limit: 1000 }));
    if (objects.length) {
      const result = await localAdmin.storage
        .from(bucket)
        .remove(objects.map((object) => `${projectId}/${object.name}`));
      if (result.error) throw new Error(result.error.message);
    }
  }
  const sql = `begin;
set local session_replication_role=replica;
create temporary table acceptance_target as select id,client_id,briefing_id from public.projects where id='${projectId}' and title like 'Acceptance %';
delete from private.client_comment_authors where comment_id in (select id from public.client_comments where project_id in (select id from acceptance_target));
delete from private.publication_sources where publication_id in (select id from public.published_versions where project_id in (select id from acceptance_target));
delete from private.sanitized_assets where project_id in (select id from acceptance_target);
delete from private.audit_events where entity_id in (select id from acceptance_target union select briefing_id from acceptance_target union select id from public.published_versions where project_id in (select id from acceptance_target));
delete from public.notifications where project_id in (select id from acceptance_target) or body=(select title from public.projects where id='${projectId}');
delete from public.internal_comments where project_id in (select id from acceptance_target);
delete from public.client_comments where project_id in (select id from acceptance_target);
delete from public.publication_reviews where project_id in (select id from acceptance_target);
delete from public.published_versions where project_id in (select id from acceptance_target);
delete from private.miro_share_requests where project_id in (select id from acceptance_target);
delete from public.publication_miro_links where project_id in (select id from acceptance_target);
delete from public.design_version_miro_links where project_id in (select id from acceptance_target);
delete from public.design_versions where project_id in (select id from acceptance_target);
delete from public.design_boards where project_id in (select id from acceptance_target);
delete from public.delivery_files where project_id in (select id from acceptance_target);
delete from public.project_assets where project_id in (select id from acceptance_target);
delete from public.project_covers where project_id in (select id from acceptance_target);
delete from public.project_assignments where project_id in (select id from acceptance_target);
delete from public.deliverables where project_id in (select id from acceptance_target);
delete from public.project_settlements where project_id in (select id from acceptance_target);
delete from public.credit_ledger where project_id in (select id from acceptance_target);
delete from public.projects where id in (select id from acceptance_target);
delete from public.briefings where id in (select briefing_id from acceptance_target);
update public.credit_accounts a set balance=(select coalesce(sum(amount),0) from public.credit_ledger l where l.client_id=a.client_id) where client_id in(select client_id from acceptance_target);
update public.credit_months m set balance=(select coalesce(sum(amount),0) from public.credit_ledger l where l.client_id=m.client_id and l.month=m.month) where client_id in(select client_id from acceptance_target);
commit;`;
  runPrivilegedSql(sql, 20_000);
}

/**
 * Deletes a disposable acceptance client's monthly credit rows (`credit_months`, `credit_plans` and
 * any `project_settlements` of its projects), which reference the client and would otherwise block
 * deleting it. Callers guard the client's name before calling this.
 */
export function removeClientCredits(clientId: string) {
  if (!/^[0-9a-f-]{36}$/.test(clientId)) throw new Error("Invalid test client ID.");
  runPrivilegedSql(
    `begin;
delete from public.project_settlements where project_id in (select id from public.projects where client_id='${clientId}');
delete from public.credit_months where client_id='${clientId}';
delete from public.credit_plans where client_id='${clientId}';
commit;`,
    20_000,
  );
}

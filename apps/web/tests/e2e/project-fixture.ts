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
  // `published-assets` went with the retired Versions (migration 202609270008).
  for (const bucket of ["internal-assets", "delivery-files", "project-covers"]) {
    const objects = value(await localAdmin.storage.from(bucket).list(projectId, { limit: 1000 }));
    if (objects.length) {
      const result = await localAdmin.storage
        .from(bucket)
        .remove(objects.map((object) => `${projectId}/${object.name}`));
      if (result.error) throw new Error(result.error.message);
    }
  }
  const playgroundBoards = value(
    await localAdmin.from("playground_boards").select("id").eq("project_id", projectId),
  );
  for (const board of playgroundBoards) {
    const folders = value(
      await localAdmin.storage.from("playground-assets").list(board.id, { limit: 1000 }),
    );
    if (folders.length === 1000)
      throw new Error("Acceptance Playground asset listing is incomplete.");
    for (const folder of folders) {
      const prefix = `${board.id}/${folder.name}`;
      const files = folder.id
        ? [prefix]
        : value(
            await localAdmin.storage.from("playground-assets").list(prefix, { limit: 1000 }),
          ).map((file) => `${prefix}/${file.name}`);
      if (files.length === 1000)
        throw new Error("Acceptance Playground asset listing is incomplete.");
      if (files.length) {
        const removed = await localAdmin.storage.from("playground-assets").remove(files);
        if (removed.error) throw new Error(removed.error.message);
      }
    }
  }
  const sql = `begin;
set local session_replication_role=replica;
create temporary table acceptance_target as select id,client_id,briefing_id from public.projects where id='${projectId}' and title like 'Acceptance %';
delete from private.workflow_attempts where payload->>'projectId' in (select id::text from acceptance_target) or payload->>'boardId' in (select id::text from public.design_boards where project_id in (select id from acceptance_target));
delete from private.feedback_handoff_receipts where project_id in (select id from acceptance_target);
delete from private.publication_round_sources where publication_id in (select id from public.published_versions where project_id in (select id from acceptance_target));
delete from public.board_work_requests where project_id in (select id from acceptance_target);
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
delete from private.production_brief_requests where board_id in (select id from public.design_boards where project_id in (select id from acceptance_target));
delete from public.production_brief_drafts where board_id in (select id from public.design_boards where project_id in (select id from acceptance_target));
delete from public.production_briefs where board_id in (select id from public.design_boards where project_id in (select id from acceptance_target));
delete from public.design_boards where project_id in (select id from acceptance_target);
delete from public.playground_items where board_id in (select id from public.playground_boards where project_id in (select id from acceptance_target));
delete from public.playground_boards where project_id in (select id from acceptance_target);
delete from public.delivery_files where project_id in (select id from acceptance_target);
delete from public.project_assets where project_id in (select id from acceptance_target);
delete from public.project_covers where project_id in (select id from acceptance_target);
delete from public.project_drive_links where project_id in (select id from acceptance_target);
delete from public.project_assignments where project_id in (select id from acceptance_target);
delete from public.deliverables where project_id in (select id from acceptance_target);
delete from public.project_settlements where project_id in (select id from acceptance_target);
delete from public.credit_ledger where project_id in (select id from acceptance_target);
delete from public.projects where id in (select id from acceptance_target);
delete from public.briefings where id in (select briefing_id from acceptance_target);
update public.credit_months m set balance=t.total from (select m2.client_id,m2.month,(select coalesce(sum(amount),0) from public.credit_ledger l where l.client_id=m2.client_id and l.month=m2.month) as total from public.credit_months m2 where m2.client_id in(select client_id from acceptance_target)) t where m.client_id=t.client_id and m.month=t.month and m.balance is distinct from t.total;
update public.credit_accounts a set balance=coalesce((select m.balance from public.credit_months m where m.client_id=a.client_id and m.month=private.month_of(now())),0) where a.client_id in(select client_id from acceptance_target) and a.balance is distinct from coalesce((select m.balance from public.credit_months m where m.client_id=a.client_id and m.month=private.month_of(now())),0);
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

/** Publish through the same optimistic-concurrency contract as the confirmation dialog. */
export async function shareTestVersion(
  agency: SupabaseClient<Database>,
  input: {
    p_project_id: string;
    p_url: string;
    p_note?: string;
    p_source_round?: string;
    p_request_key?: string;
  },
) {
  const state = value(
    await agency.rpc("get_project_workflow", { p_project_id: input.p_project_id }),
  ) as {
    project: { latestPublication: { id: string; reviewRevision: number } | null };
  };
  return agency.rpc("share_workflow_version", {
    p_project_id: input.p_project_id,
    p_url: input.p_url,
    p_note: input.p_note ?? "",
    p_source_round_ids: input.p_source_round ? [input.p_source_round] : [],
    p_expected_latest_publication_id: state.project.latestPublication?.id ?? null!,
    p_expected_review_revision: state.project.latestPublication?.reviewRevision ?? null!,
    p_confirm_replacement: true,
    p_request_id: input.p_request_key ?? crypto.randomUUID(),
  });
}

/** A test that needs a round must first release real instructions to its assigned designer. */
export async function releaseTestBrief(
  agency: SupabaseClient<Database>,
  projectId: string,
  boardId: string,
) {
  const state = value(await agency.rpc("get_project_workflow", { p_project_id: projectId })) as {
    boards: {
      id: string;
      workflowRevision: number;
      assignmentGeneration: number;
      briefRevision: number;
    }[];
  };
  const board = state.boards.find((item) => item.id === boardId);
  if (!board) throw new Error("Acceptance board was not found.");
  value(
    await agency.rpc("save_production_brief", {
      p_board_id: boardId,
      p_content: {
        title: "Acceptance production instructions",
        serviceId: "static-ad",
        overview: "Develop a clear visual direction.",
        goals: "Verify the current work request.",
        direction: {},
        deliverables: [
          {
            name: "Campaign square",
            format: "square",
            quantity: 1,
            scope: "original",
            width: 1080,
            height: 1080,
          },
        ],
        dueDate: "",
        references: [],
      },
      p_expected_revision: board.briefRevision,
      p_publish: true,
      p_request_id: crypto.randomUUID(),
      p_expected_board_revision: board.workflowRevision,
      p_expected_assignment_generation: board.assignmentGeneration,
    }),
  );
}

export async function sendTestRound(
  designer: SupabaseClient<Database>,
  projectId: string,
  boardId: string,
  note: string,
) {
  const state = value(await designer.rpc("get_project_workflow", { p_project_id: projectId })) as {
    boards: { id: string; workflowRevision: number; currentRequest: { id: string } | null }[];
  };
  const board = state.boards.find((item) => item.id === boardId);
  if (!board?.currentRequest)
    throw new Error("Release instructions before submitting an acceptance round.");
  return designer.rpc("send_board_round_for_request", {
    p_board_id: boardId,
    p_request_id: board.currentRequest.id,
    p_expected_board_revision: board.workflowRevision,
    p_note: note,
    p_frame_url: null!,
    p_idempotency_key: crypto.randomUUID(),
  });
}

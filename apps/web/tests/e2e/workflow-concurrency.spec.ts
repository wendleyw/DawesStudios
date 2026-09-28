import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@database";
import {
  cleanupTestProject,
  createProductionFixture,
  releaseTestBrief,
  sendTestRound,
} from "./project-fixture";
import { credentials, localAdmin, localAgency, localCaller } from "./test-support";

type Workflow = {
  project: {
    latestPublication: { id: string; reviewRevision: number } | null;
    activity: string;
    status: string;
  };
  boards: { id: string; workflowRevision: number; currentRequest: { id: string } }[];
};
function value<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("Missing acceptance result.");
  return result.data as NonNullable<T>;
}
async function workflow(caller: SupabaseClient<Database>, projectId: string) {
  return value(await caller.rpc("get_project_workflow", { p_project_id: projectId })) as Workflow;
}

test("concurrent submissions and publications are single actions; stale decisions cannot overwrite a newer state", async () => {
  test.setTimeout(90_000);
  const agency = await localAgency();
  const client = await localCaller(credentials.client);
  const fixture = await createProductionFixture(agency);
  try {
    const account = await localAdmin.auth.admin.getUserById(fixture.designerId);
    if (account.error || !account.data.user?.email)
      throw new Error("Acceptance designer account unavailable.");
    const email = account.data.user.email;
    const designer = await localCaller(email);
    const boardId = value(
      await agency.rpc("create_design_board", {
        p_project_id: fixture.projectId,
        p_name: "Concurrency direction",
        p_url: "https://miro.com/app/board/uXjVConcurrent=/",
        p_designer_id: fixture.designerId,
      }),
    );
    expect((await workflow(agency, fixture.projectId)).project.status).toBe("in_progress");
    await releaseTestBrief(agency, fixture.projectId, boardId);
    const board = (await workflow(designer, fixture.projectId)).boards[0];
    const submit = {
      p_board_id: boardId,
      p_request_id: board.currentRequest.id,
      p_expected_board_revision: board.workflowRevision,
      p_note: "Concurrent round",
      p_frame_url: null!,
      p_idempotency_key: crypto.randomUUID(),
    };
    const submissions = await Promise.all([
      designer.rpc("send_board_round_for_request", submit),
      designer.rpc("send_board_round_for_request", submit),
    ]);
    expect(submissions.map((result) => result.error)).toEqual([null, null]);
    expect(submissions[0].data).toBe(submissions[1].data);
    expect(
      value(
        await localAdmin.from("design_versions").select("id").eq("project_id", fixture.projectId),
      ),
    ).toHaveLength(1);
    expect((await workflow(agency, fixture.projectId)).project.status).toBe("in_progress");
    const share = {
      p_project_id: fixture.projectId,
      p_url: "https://miro.com/app/board/uXjVClientConcurrent=/",
      p_note: "Client version",
      p_source_round_ids: [submissions[0].data!],
      p_expected_latest_publication_id: null!,
      p_expected_review_revision: null!,
      p_confirm_replacement: false,
      p_request_id: crypto.randomUUID(),
    };
    const shares = await Promise.all([
      agency.rpc("share_workflow_version", share),
      agency.rpc("share_workflow_version", share),
    ]);
    expect(shares.map((result) => result.error)).toEqual([null, null]);
    expect(shares[0].data).toBe(shares[1].data);
    const v1 = shares[0].data!;
    const latest = (await workflow(agency, fixture.projectId)).project.latestPublication!;
    const replacement = {
      ...share,
      p_expected_latest_publication_id: latest.id,
      p_expected_review_revision: latest.reviewRevision,
      p_confirm_replacement: true,
      p_request_id: crypto.randomUUID(),
    };
    // Each transaction locks the project first: exactly one of the stale confirmation and V1 decision wins.
    const race = await Promise.all([
      client.rpc("review_publication", {
        p_publication_id: v1,
        p_decision: "approved",
        p_feedback: "Approved",
      }),
      agency.rpc("share_workflow_version", replacement),
    ]);
    expect(race.filter((result) => result.error === null)).toHaveLength(1);
    expect(race.find((result) => result.error)?.error?.code).toBe("PT409");
    const state = await workflow(agency, fixture.projectId);
    expect(state.project.status).toBe(race[0].error ? "client_review" : "approved");
    const newest = state.project.latestPublication!;
    if (race[0].error) {
      const approved = await client.rpc("review_publication", {
        p_publication_id: newest.id,
        p_decision: "approved",
        p_feedback: "Approved",
      });
      expect(approved.error).toBeNull();
    }
    const noFiles = await agency.rpc("mark_project_delivered", { p_project_id: fixture.projectId });
    expect(noFiles.error?.code).toBe("22023");
    // An internal revision on an approved project must not create a false client phase.
    await releaseTestBrief(agency, fixture.projectId, boardId);
    expect(
      (await sendTestRound(designer, fixture.projectId, boardId, "Additional internal check"))
        .error,
    ).toBeNull();
    expect((await workflow(agency, fixture.projectId)).project.status).toBe("approved");
    expect(
      value(
        await localAdmin
          .from("credit_ledger")
          .select("id")
          .eq("project_id", fixture.projectId)
          .eq("kind", "project_debit"),
      ),
    ).toHaveLength(1);
    const requestRead = await designer
      .from("board_work_requests")
      .select("id,round:design_versions!board_work_requests_round_id_fkey(version_number,notes)")
      .eq("project_id", fixture.projectId)
      .eq("current", true);
    expect(requestRead.error).toBeNull();
    expect(requestRead.data?.[0].round?.version_number).toBe(2);
    const clientRequests = await client
      .from("board_work_requests")
      .select("*")
      .eq("project_id", fixture.projectId);
    expect(clientRequests.error).toBeNull();
    expect(clientRequests.data).toEqual([]);
  } finally {
    await cleanupTestProject(fixture.projectId);
  }
});

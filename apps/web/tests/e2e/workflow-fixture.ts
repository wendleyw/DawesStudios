import { expect } from "@playwright/test";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";
import { localAdmin, localAgency } from "./test-support";

export async function createActionWorkflowFixture() {
  const agency = await localAgency();
  const fixture = await createProductionFixture(agency);
  try {
    const others = await localAdmin
      .from("profiles")
      .select("id,display_name")
      .eq("role", "designer")
      .neq("id", fixture.designerId)
      .order("display_name")
      .limit(1)
      .single();
    expect(others.error).toBeNull();
    const designerB = others.data!;
    const first = await localAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", fixture.designerId)
      .single();
    expect(first.error).toBeNull();
    const assignment = await agency.rpc("assign_designer", {
      p_project_id: fixture.projectId,
      p_designer_id: designerB.id,
    });
    expect(assignment.error).toBeNull();
    const boards = await Promise.all([
      agency.rpc("create_design_board", {
        p_project_id: fixture.projectId,
        p_name: "Direction Alpha",
        p_url: "https://miro.com/app/board/uXjVWorkflowA1=/",
        p_designer_id: fixture.designerId,
      }),
      agency.rpc("create_design_board", {
        p_project_id: fixture.projectId,
        p_name: "Direction Beta",
        p_url: "https://miro.com/app/board/uXjVWorkflowB1=/",
        p_designer_id: designerB.id,
      }),
    ]);
    for (const board of boards) expect(board.error).toBeNull();
    const userA = await localAdmin.auth.admin.getUserById(fixture.designerId);
    const userB = await localAdmin.auth.admin.getUserById(designerB.id);
    expect(userA.error).toBeNull();
    expect(userB.error).toBeNull();
    return {
      ...fixture,
      boardA: boards[0].data!,
      boardB: boards[1].data!,
      designerAEmail: userA.data.user!.email!,
      designerBEmail: userB.data.user!.email!,
      designerAName: first.data!.display_name,
      designerBName: designerB.display_name,
    };
  } catch (error) {
    await cleanupTestProject(fixture.projectId);
    throw error;
  }
}

export { cleanupTestProject };

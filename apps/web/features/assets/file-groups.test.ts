import { describe, expect, it } from "vitest";
import {
  buildCampaignFolders,
  campaignIdForProject,
  effectiveProjectFilter,
  fileCounts,
  groupFilesByProject,
  NO_CAMPAIGN_ID,
  NO_CAMPAIGN_TITLE,
  resolveAssetsView,
  type GroupableFile,
  type GroupableProject,
} from "./file-groups";

const p1: GroupableProject = {
  id: "p1",
  title: "Project One",
  campaignId: "c1",
  campaignTitle: "Campaign One",
};
const p2: GroupableProject = {
  id: "p2",
  title: "Project Two",
  campaignId: "c1",
  campaignTitle: "Campaign One",
};
const p3: GroupableProject = {
  id: "p3",
  title: "Project Three",
  campaignId: "c2",
  campaignTitle: "Campaign Two",
};
const p4: GroupableProject = {
  id: "p4",
  title: "Project Four",
  campaignId: null,
  campaignTitle: null,
};
// A campaign id the viewer cannot read (or an orphaned row): the FK is set but the title never
// arrived, so this project must fall into "No campaign" exactly like p4's null campaign_id does.
const p5: GroupableProject = {
  id: "p5",
  title: "Project Five",
  campaignId: "orphan",
  campaignTitle: null,
};
const projects = [p1, p2, p3, p4, p5];

type Fixture = GroupableFile & { id: string };
const f1: Fixture = {
  id: "f1",
  projectId: "p1",
  date: "2026-09-20T00:00:00Z",
  previewUrl: "img/f1",
};
const f2: Fixture = { id: "f2", projectId: "p1", date: "2026-09-22T00:00:00Z" };
const f3: Fixture = {
  id: "f3",
  projectId: "p2",
  date: "2026-09-21T00:00:00Z",
  previewUrl: "img/f3",
};
const f4: Fixture = { id: "f4", projectId: "p3", date: "2026-09-23T00:00:00Z" };
const f5: Fixture = { id: "f5", projectId: "p4", date: "2026-09-19T00:00:00Z" };
// The single most recent file of all, yet its project carries no readable campaign: "No campaign"
// must still sort last, ahead of nothing.
const f6: Fixture = { id: "f6", projectId: "p5", date: "2026-09-24T00:00:00Z" };
const files = [f1, f2, f3, f4, f5, f6];

describe("campaignIdForProject", () => {
  it("is the project's own campaign when it is readable", () => {
    expect(campaignIdForProject(p1)).toBe("c1");
  });
  it("is 'none' for a project with no campaign_id", () => {
    expect(campaignIdForProject(p4)).toBe(NO_CAMPAIGN_ID);
  });
  it("is 'none' for a campaign_id whose campaign did not come back readable", () => {
    expect(campaignIdForProject(p5)).toBe(NO_CAMPAIGN_ID);
  });
});

describe("fileCounts", () => {
  it("counts files and the distinct projects contributing them", () => {
    expect(fileCounts([{ projectId: "p1" }, { projectId: "p1" }, { projectId: "p2" }])).toEqual({
      fileCount: 3,
      projectCount: 2,
    });
  });
  it("is zero for an empty list", () => {
    expect(fileCounts([])).toEqual({ fileCount: 0, projectCount: 0 });
  });
});

describe("buildCampaignFolders", () => {
  const folders = buildCampaignFolders(files, projects);

  it("groups files under their project's campaign", () => {
    const c1 = folders.find((folder) => folder.id === "c1");
    expect(c1?.files.map((file) => file.id)).toEqual(["f2", "f3", "f1"]);
  });

  it("orders campaigns by their most recent file first", () => {
    // c2's newest file (09-23) is more recent than c1's (09-22).
    expect(folders.map((folder) => folder.id)).toEqual(["c2", "c1", NO_CAMPAIGN_ID]);
  });

  it("sorts 'No campaign' last even when it holds the single newest file overall", () => {
    const none = folders.find((folder) => folder.id === NO_CAMPAIGN_ID);
    expect(none?.title).toBe(NO_CAMPAIGN_TITLE);
    expect(none?.files.map((file) => file.id)).toEqual(["f6", "f5"]);
    expect(folders.at(-1)?.id).toBe(NO_CAMPAIGN_ID);
  });

  it("counts files and distinct contributing projects per folder, including singular", () => {
    const c1 = folders.find((folder) => folder.id === "c1");
    expect(c1).toMatchObject({ fileCount: 3, projectCount: 2 });
    const c2 = folders.find((folder) => folder.id === "c2");
    expect(c2).toMatchObject({ fileCount: 1, projectCount: 1 });
  });

  it("covers a folder with its newest file that has a signed preview, skipping newer ones without one", () => {
    // f2 (09-22) is newer than f3 (09-21) but has no preview, so f3 wins the cover.
    const c1 = folders.find((folder) => folder.id === "c1");
    expect(c1?.cover?.id).toBe("f3");
  });

  it("falls back to no cover when nothing in the folder has a signed preview", () => {
    const c2 = folders.find((folder) => folder.id === "c2");
    expect(c2?.cover).toBeNull();
  });

  it("omits a campaign with no matching file", () => {
    // p3/c2 only appears through f4; a campaign search-filtered to nothing must not render a folder.
    expect(buildCampaignFolders([], projects)).toEqual([]);
  });
});

describe("groupFilesByProject", () => {
  it("groups a campaign's files by project, newest file first within a group", () => {
    const groups = groupFilesByProject([f1, f2, f3], projects);
    const p1Group = groups.find((group) => group.projectId === "p1");
    expect(p1Group?.files.map((file) => file.id)).toEqual(["f2", "f1"]);
    expect(p1Group?.projectTitle).toBe("Project One");
  });

  it("orders groups by their newest file first", () => {
    const groups = groupFilesByProject([f1, f2, f3], projects);
    expect(groups.map((group) => group.projectId)).toEqual(["p1", "p2"]);
  });

  it("hides groups with no matching files by construction", () => {
    const groups = groupFilesByProject([f4], projects);
    expect(groups).toHaveLength(1);
    expect(groups[0].projectId).toBe("p3");
  });

  it("falls back to an empty title when the project is not in the given list", () => {
    const groups = groupFilesByProject([{ projectId: "missing", date: f1.date }], []);
    expect(groups[0].projectTitle).toBe("");
  });
});

describe("resolveAssetsView", () => {
  it("is the folder view when neither param is set", () => {
    expect(resolveAssetsView({ campaign: null, project: null }, projects)).toEqual({
      kind: "folders",
    });
  });

  it("derives the campaign from ?project= alone", () => {
    expect(resolveAssetsView({ campaign: null, project: "p1" }, projects)).toEqual({
      kind: "campaign",
      campaignId: "c1",
      projectId: "p1",
    });
  });

  it("opens ?campaign= alone with All projects", () => {
    expect(resolveAssetsView({ campaign: "c1", project: null }, projects)).toEqual({
      kind: "campaign",
      campaignId: "c1",
      projectId: "",
    });
  });

  it("presets the project when it belongs to the given campaign", () => {
    expect(resolveAssetsView({ campaign: "c1", project: "p1" }, projects)).toEqual({
      kind: "campaign",
      campaignId: "c1",
      projectId: "p1",
    });
  });

  it("ignores a project that does not belong to the given campaign", () => {
    expect(resolveAssetsView({ campaign: "c1", project: "p3" }, projects)).toEqual({
      kind: "campaign",
      campaignId: "c1",
      projectId: "",
    });
  });

  it("falls back to folders for an unknown campaign id", () => {
    expect(resolveAssetsView({ campaign: "does-not-exist", project: null }, projects)).toEqual({
      kind: "folders",
    });
  });

  it("falls back to folders for an unknown project id", () => {
    expect(resolveAssetsView({ campaign: null, project: "does-not-exist" }, projects)).toEqual({
      kind: "folders",
    });
  });

  it("treats 'none' as always known", () => {
    expect(resolveAssetsView({ campaign: NO_CAMPAIGN_ID, project: null }, projects)).toEqual({
      kind: "campaign",
      campaignId: NO_CAMPAIGN_ID,
      projectId: "",
    });
  });

  it("resolves a campaignless project's ?project= into the 'none' campaign", () => {
    expect(resolveAssetsView({ campaign: null, project: "p4" }, projects)).toEqual({
      kind: "campaign",
      campaignId: NO_CAMPAIGN_ID,
      projectId: "p4",
    });
  });

  it("resolves an unreadable-campaign project's ?project= into the 'none' campaign", () => {
    expect(resolveAssetsView({ campaign: null, project: "p5" }, projects)).toEqual({
      kind: "campaign",
      campaignId: NO_CAMPAIGN_ID,
      projectId: "p5",
    });
  });
});

describe("effectiveProjectFilter", () => {
  it("uses the default when nothing was explicitly chosen yet", () => {
    expect(effectiveProjectFilter(null, "c1", "")).toBe("");
    expect(effectiveProjectFilter(null, "c1", "p1")).toBe("p1");
  });

  it("honors an explicit choice made under the current campaign, including clearing to All", () => {
    expect(effectiveProjectFilter({ campaign: "c1", project: "p2" }, "c1", "")).toBe("p2");
    expect(effectiveProjectFilter({ campaign: "c1", project: "" }, "c1", "p1")).toBe("");
  });

  it("discards a choice made under a campaign the viewer has since left", () => {
    expect(effectiveProjectFilter({ campaign: "c1", project: "p2" }, "c2", "")).toBe("");
  });
});

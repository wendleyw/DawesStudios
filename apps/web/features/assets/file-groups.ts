/**
 * Pure grouping, ordering and view-resolution logic for the Files page's campaign folders. No
 * React, no Supabase: `assets-page.tsx` supplies already-filtered (search + Approved) data shaped
 * to the minimal structural types below, and `asset-data.ts` is the only module that reads from
 * Supabase and maps its snake_case rows onto that shape.
 */

/** The id and title the "No campaign" folder always uses, regardless of a project's raw campaign_id. */
export const NO_CAMPAIGN_ID = "none";
export const NO_CAMPAIGN_TITLE = "No campaign";

export type GroupableProject = {
  id: string;
  title: string;
  campaignId: string | null;
  campaignTitle: string | null;
  /** The project's Google Drive backup link, if any; carried onto its `ProjectFileGroup`. */
  driveUrl?: string | null;
};

export type GroupableFile = {
  projectId: string;
  /** ISO timestamp; folders and groups both order newest first via `localeCompare`. */
  date: string;
  /** Set only for a raster image the caller already signed a preview for. */
  previewUrl?: string;
};

/**
 * The campaign a project's files fold into: its own campaign when the FK is set and the row came
 * back readable, else the shared "No campaign" bucket — the same bucket a null `campaign_id` uses,
 * so an unreadable campaign never leaks its raw id into a folder param.
 */
export function campaignIdForProject(project: GroupableProject): string {
  return project.campaignId && project.campaignTitle ? project.campaignId : NO_CAMPAIGN_ID;
}

function folderIdentity(project: GroupableProject | undefined): { id: string; title: string } {
  if (project && project.campaignId && project.campaignTitle)
    return { id: project.campaignId, title: project.campaignTitle };
  return { id: NO_CAMPAIGN_ID, title: NO_CAMPAIGN_TITLE };
}

/** Files sorted newest first, the ordering every folder and project group in this module shares. */
function newestFirst<F extends GroupableFile>(files: F[]): F[] {
  return files.toSorted((a, b) => b.date.localeCompare(a.date));
}

/** A matching list's file count and the count of distinct projects that contributed one. */
export function fileCounts(files: { projectId: string }[]): {
  fileCount: number;
  projectCount: number;
} {
  return {
    fileCount: files.length,
    projectCount: new Set(files.map((file) => file.projectId)).size,
  };
}

export type CampaignFolder<F extends GroupableFile> = {
  id: string;
  title: string;
  /** Newest first. */
  files: F[];
  fileCount: number;
  projectCount: number;
  /** The folder's own most recent file date, used to order folders (not shown to the viewer). */
  newestDate: string;
};

/**
 * One folder per campaign holding at least one of `files` (already filtered to the current search +
 * Approved state). Ordered by each folder's most recent file first; "No campaign" always sorts last,
 * even when it holds the single newest file of all — it is a fallback bucket, not a campaign in its
 * own right.
 */
export function buildCampaignFolders<F extends GroupableFile, P extends GroupableProject>(
  files: F[],
  projects: P[],
): CampaignFolder<F>[] {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const grouped = new Map<string, { title: string; files: F[] }>();
  for (const file of files) {
    const { id, title } = folderIdentity(byId.get(file.projectId));
    const folder = grouped.get(id);
    if (folder) folder.files.push(file);
    else grouped.set(id, { title, files: [file] });
  }
  const folders = [...grouped.entries()].map(([id, { title, files: folderFiles }]) => {
    const sorted = newestFirst(folderFiles);
    const { fileCount, projectCount } = fileCounts(sorted);
    return {
      id,
      title,
      files: sorted,
      fileCount,
      projectCount,
      newestDate: sorted[0]?.date ?? "",
    };
  });
  const campaigns = folders
    .filter((folder) => folder.id !== NO_CAMPAIGN_ID)
    .sort((a, b) => b.newestDate.localeCompare(a.newestDate) || a.title.localeCompare(b.title));
  const none = folders.filter((folder) => folder.id === NO_CAMPAIGN_ID);
  return [...campaigns, ...none];
}

export type ProjectFileGroup<F extends GroupableFile> = {
  projectId: string;
  projectTitle: string;
  /** The project's Google Drive backup link, if any; null when the project is unknown. */
  driveUrl: string | null;
  /** Newest first. */
  files: F[];
  newestDate: string;
};

/**
 * A campaign view's files grouped by project, newest file first within a group. Only projects with
 * at least one file in `files` appear, so an empty group never needs to be hidden by the caller.
 */
export function groupFilesByProject<F extends GroupableFile, P extends GroupableProject>(
  files: F[],
  projects: P[],
): ProjectFileGroup<F>[] {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const grouped = new Map<string, F[]>();
  for (const file of files) {
    const bucket = grouped.get(file.projectId);
    if (bucket) bucket.push(file);
    else grouped.set(file.projectId, [file]);
  }
  return [...grouped.entries()]
    .map(([projectId, groupFiles]) => {
      const sorted = newestFirst(groupFiles);
      return {
        projectId,
        projectTitle: byId.get(projectId)?.title ?? "",
        driveUrl: byId.get(projectId)?.driveUrl ?? null,
        files: sorted,
        newestDate: sorted[0]?.date ?? "",
      };
    })
    .sort(
      (a, b) =>
        b.newestDate.localeCompare(a.newestDate) || a.projectTitle.localeCompare(b.projectTitle),
    );
}

export type AssetsView =
  { kind: "folders" } | { kind: "campaign"; campaignId: string; projectId: string };

/**
 * The view `?campaign=`/`?project=` resolve to.
 *
 * `?project=<id>` alone opens that project's own campaign with the project preset (the project
 * page's Files link and the delivery workflow never set `?campaign=`). A `campaign` unknown to this
 * client — anything but "none" or a campaign held by at least one of `projects` — falls back to the
 * folder view; a `project` unrecognized, or one that does not belong to a `campaign` given alongside
 * it, is dropped rather than trusted.
 */
export function resolveAssetsView<P extends GroupableProject>(
  params: { campaign: string | null; project: string | null },
  projects: P[],
): AssetsView {
  const project = params.project ? projects.find((item) => item.id === params.project) : undefined;
  if (params.campaign) {
    const known =
      params.campaign === NO_CAMPAIGN_ID ||
      projects.some((item) => campaignIdForProject(item) === params.campaign);
    if (!known) return { kind: "folders" };
    const projectId =
      project && campaignIdForProject(project) === params.campaign ? project.id : "";
    return { kind: "campaign", campaignId: params.campaign, projectId };
  }
  if (project)
    return { kind: "campaign", campaignId: campaignIdForProject(project), projectId: project.id };
  return { kind: "folders" };
}

/**
 * The project filter a campaign view actually shows: an explicit choice the viewer made while
 * looking at `currentCampaignId`, else `defaultProject` (the URL-resolved preset for that campaign).
 * A choice made under a campaign the viewer has since left is discarded rather than carried over —
 * this is what lets the toolbar's `<select>` reset to All projects on a folder change without an
 * effect: the stored `{ campaign, project }` simply stops matching on the next render.
 */
export function effectiveProjectFilter(
  edit: { campaign: string; project: string } | null,
  currentCampaignId: string,
  defaultProject: string,
): string {
  return edit && edit.campaign === currentCampaignId ? edit.project : defaultProject;
}

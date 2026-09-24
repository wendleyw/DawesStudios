"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Check, FileText, Folder, Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { downloadPrivateFile } from "./file-download";
import { Modal } from "@/features/shared/modal";
import { useClients, useInvalidateWorkspace } from "@/features/workspace/workspace-data";
import {
  initialUploadProject,
  markProjectDelivered,
  useInvalidateAssets,
  useAssetPreviews,
  useProjectAssets,
  type ProjectAsset,
} from "./asset-data";
import {
  buildCampaignFolders,
  campaignIdForProject,
  effectiveProjectFilter,
  fileCounts,
  groupFilesByProject,
  resolveAssetsView,
  NO_CAMPAIGN_ID,
  NO_CAMPAIGN_TITLE,
} from "./file-groups";
import { FileCard } from "./file-card";
import { UploadFileDialog } from "./upload-file-dialog";
import "./assets.css";
import { FormError } from "@/features/shared/form-error";
import { SearchField } from "@/features/shared/search-field";
import { PageStatus } from "@/features/shared/page-status";

/** "1 file"/"1 project" stay singular; everything else takes the plural. */
function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function AssetsPage({ clientId }: { clientId: string }) {
  const { database, profile } = useAuth();
  const invalidateAssets = useInvalidateAssets();
  const invalidateWorkspace = useInvalidateWorkspace();
  const parameters = useSearchParams();
  const [search, setSearch] = useState("");
  const [approved, setApproved] = useState(false);
  // The project filter as explicitly chosen, tagged with the campaign it was chosen under. A folder
  // navigation changes the resolved campaign id without touching this state, so a stale choice stops
  // matching on the very next render — see `effectiveProjectFilter` for why that needs no effect.
  const [projectEdit, setProjectEdit] = useState<{ campaign: string; project: string } | null>(
    null,
  );
  const [upload, setUpload] = useState<"working" | "delivery" | null>(null);
  const [deliverProject, setDeliverProject] = useState<string | null>(null);
  const clients = useClients();
  const data = useProjectAssets(clientId);
  // Signed for the whole list rather than the filtered one, so filtering never re-signs.
  const previews = useAssetPreviews(data.data?.assets ?? []);
  const download = useMutation({
    mutationFn: (file: ProjectAsset) =>
      downloadPrivateFile(
        database,
        file.bucket,
        file.path,
        `${file.name.replace(/\.[a-z0-9]+$/i, "")}.${file.mime === "application/pdf" ? "pdf" : file.mime.split("/")[1] || "bin"}`,
      ),
  });
  const deliver = useMutation({
    mutationFn: async () => {
      if (deliverProject) await markProjectDelivered(database, { projectId: deliverProject });
    },
    onSuccess: async () => {
      // Both helpers cover exactly one key each — `assetQueryKeys = ["assets"]` and
      // `workspaceQueryKeys = ["projects"]` — which is precisely what this call invalidated inline,
      // so routing through them is non-widening. `projects` is owned by
      // `workspace/workspace-data.ts`, which is why it is reached through that feature's helper.
      await Promise.all([invalidateAssets(), invalidateWorkspace()]);
      setDeliverProject(null);
    },
  });
  if (data.isPending || clients.isPending) return <PageStatus>Loading files…</PageStatus>;
  if (data.error || !data.data || !clients.data?.some((client) => client.id === clientId))
    return (
      <div className="page-content">
        <h1>Files unavailable.</h1>
        <p>This client is unavailable or you do not have access.</p>
        <button className="button" onClick={() => void data.refetch()}>
          Try again
        </button>
      </div>
    );
  const { assets, projects } = data.data;

  // `?project=<id>` (the project page's Files link, and the delivery workflow) opens that project's
  // own campaign with the project preset; an unknown `campaign` falls back to folders.
  const view = resolveAssetsView(
    { campaign: parameters.get("campaign"), project: parameters.get("project") },
    projects,
  );
  const campaignId = view.kind === "campaign" ? view.campaignId : null;
  const defaultProject = view.kind === "campaign" ? view.projectId : "";
  const project = campaignId ? effectiveProjectFilter(projectEdit, campaignId, defaultProject) : "";

  const matching = assets.filter(
    (asset) =>
      (!approved || asset.approved) &&
      (!search || asset.name.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const withPreviews = matching.map((asset) => ({
    ...asset,
    previewUrl: previews.data?.[`${asset.bucket}:${asset.id}`],
  }));

  const selectedProject = projects.find((item) => item.id === project);
  // A delivery belongs to an approved project, and the dialog opens on the one being looked at.
  const deliverable = projects.filter((item) => item.status === "approved");
  const canDeliver =
    profile?.role === "agency" &&
    selectedProject?.status === "approved" &&
    assets.some((file) => file.projectId === selectedProject.id && file.category === "Delivery");

  const clearFilters = () => {
    setSearch("");
    setApproved(false);
    if (campaignId) setProjectEdit({ campaign: campaignId, project: "" });
  };

  // Folder view: one card per campaign with a matching file. Campaign view: this campaign's matching
  // files (independent of the project filter, so the header count reads the same as the folder card
  // it was opened from), further narrowed by `project` and grouped by project underneath.
  const folders = campaignId === null ? buildCampaignFolders(withPreviews, projects) : [];
  const campaignProjects =
    campaignId !== null ? projects.filter((item) => campaignIdForProject(item) === campaignId) : [];
  const campaignFiles =
    campaignId !== null
      ? withPreviews.filter((asset) => {
          const owner = projects.find((item) => item.id === asset.projectId);
          return (owner ? campaignIdForProject(owner) : NO_CAMPAIGN_ID) === campaignId;
        })
      : [];
  const campaignCounts = fileCounts(campaignFiles);
  const campaignTitle =
    campaignId === NO_CAMPAIGN_ID
      ? NO_CAMPAIGN_TITLE
      : (campaignProjects[0]?.campaignTitle ?? NO_CAMPAIGN_TITLE);
  const groups =
    campaignId !== null
      ? groupFilesByProject(
          campaignFiles.filter((asset) => !project || asset.projectId === project),
          projects,
        )
      : [];

  const isEmpty = campaignId === null ? folders.length === 0 : groups.length === 0;

  return (
    <div className="page-content files-page">
      <header className="page-heading client-page-heading">
        <div>
          {campaignId !== null ? (
            <div className="page-title-row">
              <Link
                href={`/clients/${clientId}/assets`}
                className="icon-button"
                aria-label="All campaigns"
                title="All campaigns"
              >
                <ArrowLeft size={16} />
              </Link>
              <h1>{campaignTitle}</h1>
            </div>
          ) : (
            <h1>Files</h1>
          )}
          <p>
            {campaignId !== null
              ? `${countLabel(campaignCounts.fileCount, "file")} from ${countLabel(campaignCounts.projectCount, "project")}`
              : profile?.role === "client"
                ? "Shared designs and final files, together."
                : "Working files, shared designs, and final deliveries."}
          </p>
        </div>
        <div className="page-actions">
          {projects.length > 0 && profile?.role !== "client" && (
            <div className="file-actions">
              {profile?.role === "agency" && (
                <button
                  className="button"
                  disabled={!deliverable.length}
                  title="Available when a project is approved"
                  onClick={() => setUpload("delivery")}
                >
                  <Plus size={15} />
                  Delivery file
                </button>
              )}
              {/* While the delivery callout is up, completing the delivery is the one action that
                  matters, so this one steps back rather than competing with it. */}
              <button
                className={canDeliver ? "button" : "button primary"}
                onClick={() => setUpload("working")}
              >
                <Plus size={15} />
                Working file
              </button>
            </div>
          )}
        </div>
        <div className="files-toolbar client-page-tools">
          <SearchField
            label="Search files"
            value={search}
            onChange={setSearch}
            placeholder="Find a file…"
            iconSize={16}
          />
          {campaignId !== null && (
            <>
              <label className="visually-hidden" htmlFor="files-project">
                Filter project
              </label>
              <select
                id="files-project"
                value={project}
                onChange={(event) =>
                  setProjectEdit({ campaign: campaignId, project: event.target.value })
                }
              >
                <option value="">All projects</option>
                {campaignProjects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </>
          )}
          <div className="segmented-control" aria-label="File status">
            <button className={!approved ? "active" : ""} onClick={() => setApproved(false)}>
              All files
            </button>
            <button className={approved ? "active" : ""} onClick={() => setApproved(true)}>
              Approved
            </button>
          </div>
        </div>
      </header>
      {canDeliver && (
        <div className="delivery-callout">
          <div>
            <strong>Everything is approved.</strong>
            <p>Let your client know the final files are ready.</p>
          </div>
          <button className="button primary" onClick={() => setDeliverProject(selectedProject.id)}>
            <Check size={15} />
            Complete delivery
          </button>
        </div>
      )}
      {download.error && <FormError>The file could not be downloaded. Please try again.</FormError>}
      {isEmpty ? (
        <div className="empty-state">
          <FileText size={28} />
          <h2>{assets.length ? "No matching files." : "The right files, in one place."}</h2>
          <p>
            {assets.length
              ? "Try another filter or search."
              : "Files will appear here as the project takes shape."}
          </p>
          {assets.length > 0 && (
            <button className="button quiet" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      ) : campaignId === null ? (
        <div className="folder-grid">
          {folders.map((folder) => (
            <Link
              key={folder.id}
              href={`/clients/${clientId}/assets?campaign=${folder.id}`}
              className="folder-card"
            >
              <div className="folder-cover">
                {folder.cover?.previewUrl ? (
                  // Keep expiring, caller-scoped signed URLs out of Next.js's image optimization cache.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={folder.cover.previewUrl} alt="" loading="lazy" />
                ) : (
                  <Folder size={28} aria-hidden="true" />
                )}
              </div>
              <div className="folder-information">
                <h2>{folder.title}</h2>
                <span>
                  {countLabel(folder.fileCount, "file")} ·{" "}
                  {countLabel(folder.projectCount, "project")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="file-groups">
          {groups.map((group) => (
            <section key={group.projectId} className="file-group">
              <h2>
                <Link href={`/projects/${group.projectId}`}>{group.projectTitle}</Link>{" "}
                <span>{countLabel(group.files.length, "file")}</span>
              </h2>
              <div className="file-grid">
                {group.files.map((file) => (
                  <FileCard
                    key={`${file.bucket}:${file.id}`}
                    file={file}
                    preview={file.previewUrl}
                    downloading={download.isPending}
                    onDownload={(chosen) => download.mutate(chosen)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {upload && (
        <UploadFileDialog
          kind={upload}
          projects={upload === "delivery" ? deliverable : projects}
          initialProject={
            upload === "delivery"
              ? initialUploadProject(deliverable, project)
              : project || projects[0].id
          }
          onClose={() => setUpload(null)}
        />
      )}
      <Modal
        open={!!deliverProject}
        title="Ready to wrap up?"
        description="The client will be notified that their approved project is complete and final files are ready."
        onClose={() => {
          if (!deliver.isPending) setDeliverProject(null);
        }}
      >
        <div className="form-actions">
          <button
            className="button"
            onClick={() => setDeliverProject(null)}
            disabled={deliver.isPending}
          >
            Cancel
          </button>
          <button
            className="button primary"
            onClick={() => deliver.mutate()}
            disabled={deliver.isPending}
          >
            {deliver.isPending ? "Completing…" : "Complete delivery"}
          </button>
        </div>
        {deliver.error && <FormError>{deliver.error.message}</FormError>}
      </Modal>
    </div>
  );
}

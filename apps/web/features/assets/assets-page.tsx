"use client";

import { useMutation } from "@tanstack/react-query";
import { Download, FileImage, FileText, Plus, Check } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { downloadPrivateFile } from "./file-download";
import { Modal } from "@/features/shared/modal";
import {
  formatDate,
  useClients,
  useInvalidateWorkspace,
} from "@/features/workspace/workspace-data";
import {
  initialUploadProject,
  markProjectDelivered,
  useInvalidateAssets,
  useProjectAssets,
  type ProjectAsset,
} from "./asset-data";
import { UploadFileDialog } from "./upload-file-dialog";
import "./assets.css";
import { FormError } from "@/features/shared/form-error";
import { SearchField } from "@/features/shared/search-field";
import { PageStatus } from "@/features/shared/page-status";

export function AssetsPage({ clientId }: { clientId: string }) {
  const { database, profile } = useAuth();
  const invalidateAssets = useInvalidateAssets();
  const invalidateWorkspace = useInvalidateWorkspace();
  const parameters = useSearchParams();
  const [project, setProject] = useState(parameters.get("project") ?? "");
  const [search, setSearch] = useState("");
  const [approved, setApproved] = useState(false);
  const [upload, setUpload] = useState<"working" | "delivery" | null>(null);
  const [deliverProject, setDeliverProject] = useState<string | null>(null);
  const clients = useClients();
  const data = useProjectAssets(clientId);
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
  if (data.isPending || clients.isPending) return <PageStatus>Gathering files…</PageStatus>;
  if (data.error || !data.data || !clients.data?.some((client) => client.id === clientId))
    return (
      <div className="page-content">
        <h1>Files unavailable.</h1>
        <p>This workspace is unavailable or you do not have access.</p>
        <button className="button" onClick={() => void data.refetch()}>
          Try again
        </button>
      </div>
    );
  const { assets, projects } = data.data;
  const visible = assets.filter(
    (asset) =>
      (!project || asset.projectId === project) &&
      (!approved || asset.approved) &&
      (!search || asset.name.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const selectedProject = projects.find((item) => item.id === project);
  // A delivery belongs to an approved project, and the dialog opens on the one being looked at.
  const deliverable = projects.filter((item) => item.status === "approved");
  const canDeliver =
    profile?.role === "agency" &&
    selectedProject?.status === "approved" &&
    assets.some((file) => file.projectId === selectedProject.id && file.category === "Delivery");

  return (
    <div className="page-content files-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">THE FILES THAT MATTER</span>
          <h1>Project assets.</h1>
          <p>
            {profile?.role === "client"
              ? "Shared designs and final files, together."
              : "Working files, shared designs, and final deliveries."}
          </p>
        </div>
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
            <button className="button primary" onClick={() => setUpload("working")}>
              <Plus size={15} />
              Working file
            </button>
          </div>
        )}
      </header>
      <div className="files-toolbar">
        <SearchField
          label="Search files"
          value={search}
          onChange={setSearch}
          placeholder="Find a file…"
          iconSize={16}
        />
        <label className="visually-hidden" htmlFor="files-project">
          Filter project
        </label>
        <select
          id="files-project"
          value={project}
          onChange={(event) => setProject(event.target.value)}
        >
          <option value="">All projects</option>
          {projects.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
        <div className="segmented-control" aria-label="File status">
          <button className={!approved ? "active" : ""} onClick={() => setApproved(false)}>
            All files
          </button>
          <button className={approved ? "active" : ""} onClick={() => setApproved(true)}>
            Approved
          </button>
        </div>
      </div>
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
      {visible.length ? (
        <div className="file-grid">
          {visible.map((file) => (
            <article className="file-card" key={`${file.bucket}:${file.id}`}>
              <div className="file-icon">
                {file.mime.startsWith("image/") ? <FileImage size={31} /> : <FileText size={31} />}
                <span>{file.mime === "application/pdf" ? "PDF" : "IMAGE"}</span>
              </div>
              <div className="file-information">
                <span className="eyebrow">{file.category}</span>
                <h2>{file.name}</h2>
                <Link href={`/projects/${file.projectId}`}>
                  {projects.find((item) => item.id === file.projectId)?.title}
                </Link>
                <footer>
                  <span>
                    {file.size ? `${(file.size / 1024).toFixed(0)} KB · ` : ""}
                    {formatDate(file.date)}
                  </span>
                  <button
                    className="icon-button"
                    aria-label={`Download ${file.name}`}
                    disabled={download.isPending}
                    onClick={() => download.mutate(file)}
                  >
                    <Download size={16} />
                  </button>
                </footer>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <FileText size={28} />
          <h2>{assets.length ? "No matching files." : "The right files, in one place."}</h2>
          <p>
            {assets.length
              ? "Try another filter or search."
              : "Files will appear here as the project takes shape."}
          </p>
          {assets.length > 0 && (
            <button
              className="button quiet"
              onClick={() => {
                setProject("");
                setSearch("");
                setApproved(false);
              }}
            >
              Clear filters
            </button>
          )}
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

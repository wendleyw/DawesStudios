"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CheckCheck, Clock3 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { formatDate, useClients } from "@/features/workspace/workspace-data";
import { assertResult } from "@/lib/supabase";
import "./reviews.css";
import { PageStatus } from "@/features/shared/page-status";

export function ReviewsPage({ clientId }: { clientId: string }) {
  const { database, profile, session } = useAuth();
  const clients = useClients();
  const [filter, setFilter] = useState("waiting");
  const data = useQuery({
    queryKey: ["reviews", session?.user.id, clientId],
    enabled: !!session && !!profile,
    queryFn: async () => {
      const projects = assertResult(
        await database
          .from("projects")
          .select("id,title,status,due_date")
          .eq("client_id", clientId),
      );
      if (!projects.length) return [];
      const ids = projects.map((project) => project.id);
      const deliverables = assertResult(
        await database.from("deliverables").select("id,name").in("project_id", ids),
      );
      const internal = profile?.role === "designer";
      const versions = internal
        ? assertResult(
            await database
              .from("design_versions")
              .select("id,project_id,deliverable_id,version_number,status,created_at,notes")
              .in("project_id", ids),
          )
        : assertResult(
            await database
              .from("published_versions")
              .select(
                "*,publication_reviews!publication_reviews_publication_id_fkey(status,feedback)",
              )
              .in("project_id", ids),
          );
      const latest = new Map<string, (typeof versions)[number]>();
      for (const version of versions)
        if (
          !latest.has(version.deliverable_id) ||
          latest.get(version.deliverable_id)!.version_number < version.version_number
        )
          latest.set(version.deliverable_id, version);
      const rows = [...latest.values()].map((version) => ({
        id: version.id,
        projectId: version.project_id,
        title: projects.find((project) => project.id === version.project_id)!.title,
        deliverable:
          deliverables.find((item) => item.id === version.deliverable_id)?.name ?? "Deliverable",
        version: version.version_number,
        status:
          "status" in version ? version.status : (version.publication_reviews?.status ?? "pending"),
        date: "created_at" in version ? version.created_at : version.published_at,
        note: "notes" in version ? version.notes : version.release_note,
        internal,
      }));
      if (profile?.role === "agency") {
        const submitted = assertResult(
          await database
            .from("design_versions")
            .select("*")
            .in("project_id", ids)
            .eq("status", "submitted"),
        );
        rows.push(
          ...submitted.map((version) => ({
            id: version.id,
            projectId: version.project_id,
            title: projects.find((project) => project.id === version.project_id)!.title,
            deliverable:
              deliverables.find((item) => item.id === version.deliverable_id)?.name ??
              "Deliverable",
            version: version.version_number,
            status: "submitted",
            date: version.created_at,
            note: version.notes,
            internal: true,
          })),
        );
      }
      return rows.toSorted((a, b) => b.date.localeCompare(a.date));
    },
    refetchInterval: 30_000,
  });
  if (data.isPending || clients.isPending) return <PageStatus>Gathering reviews…</PageStatus>;
  if (data.error || !clients.data?.some((client) => client.id === clientId))
    return (
      <div className="page-content">
        <h1>Reviews unavailable.</h1>
        <button className="button" onClick={() => void data.refetch()}>
          Try again
        </button>
      </div>
    );
  const rows = data.data ?? [];
  const visible = rows.filter((row) =>
    filter === "approved"
      ? ["approved", "reviewed"].includes(row.status)
      : filter === "studio"
        ? row.internal && row.status === "submitted"
        : !["approved", "reviewed"].includes(row.status) &&
          (profile?.role === "designer" || !row.internal),
  );
  return (
    <div className="page-content">
      <header className="page-heading">
        <div>
          <span className="eyebrow">A FRESH PAIR OF EYES</span>
          <h1>Reviews.</h1>
          <p>
            {profile?.role === "designer"
              ? "Keep track of work sent to the studio."
              : "Thoughtful feedback keeps good work moving."}
          </p>
        </div>
      </header>
      <div className="review-filters segmented-control">
        {[
          {
            id: "waiting",
            label:
              profile?.role === "client"
                ? "Waiting for you"
                : profile?.role === "designer"
                  ? "In progress"
                  : "With client",
          },
          ...(profile?.role === "agency" ? [{ id: "studio", label: "Studio review" }] : []),
          { id: "approved", label: "Approved" },
        ].map((item) => (
          <button
            key={item.id}
            className={filter === item.id ? "active" : ""}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {visible.length ? (
        <div className="review-list">
          {visible.map((row) => (
            <Link
              key={row.id}
              href={`/projects/${row.projectId}?channel=${row.internal ? "internal" : "client"}`}
              className="review-card"
            >
              <span className="review-symbol">
                {["approved", "reviewed"].includes(row.status) ? (
                  <CheckCheck size={23} />
                ) : (
                  <Clock3 size={23} />
                )}
              </span>
              <div>
                <span className="eyebrow">
                  {row.deliverable} · V{row.version}
                </span>
                <h2>{row.title}</h2>
                <p>
                  {row.note ||
                    (row.status === "changes_requested"
                      ? "Changes were requested on this version."
                      : "Open the project to see the designs and conversation.")}
                </p>
                <span className="review-date">
                  {formatDate(row.date)} · {row.status.replaceAll("_", " ")}
                </span>
              </div>
              <ArrowUpRight size={18} />
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <CheckCheck size={30} />
          <h2>All clear here.</h2>
          <p>Versions will appear as work moves through review.</p>
        </div>
      )}
    </div>
  );
}

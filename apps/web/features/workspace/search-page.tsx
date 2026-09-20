"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult } from "@/lib/supabase";
import { SearchField } from "@/features/shared/search-field";

export function SearchPage() {
  const { database, session, profile } = useAuth();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(input.trim()), 250);
    return () => clearTimeout(timeout);
  }, [input]);
  const results = useQuery({
    queryKey: ["search", session?.user.id, search],
    enabled: search.length > 1,
    queryFn: async () => {
      const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
      const [clients, projects, briefings, assets] = await Promise.all([
        database
          .from("clients")
          .select("id,name,industry")
          .eq("archived", false)
          .ilike("name", pattern)
          .limit(30),
        database.from("projects").select("id,title,description").ilike("title", pattern).limit(40),
        profile?.role !== "designer"
          ? database
              .from("briefings")
              .select("id,title,client_id,status")
              .ilike("title", pattern)
              .limit(30)
          : Promise.resolve({ data: [], error: null }),
        database
          .from("brand_assets")
          .select("id,name,client_id,category")
          .ilike("name", pattern)
          .limit(30),
      ]);
      return [
        ...assertResult(clients).map((item) => ({
          id: item.id,
          title: item.name,
          description: item.industry,
          type: "Workspace",
          href: `/clients/${item.id}/board`,
        })),
        ...assertResult(projects).map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          type: "Project",
          href: `/projects/${item.id}`,
        })),
        ...assertResult(briefings).map((item) => ({
          id: item.id,
          title: item.title,
          description: item.status.replaceAll("_", " "),
          type: "Briefing",
          href: `/clients/${item.client_id}/briefings/${item.id}`,
        })),
        ...assertResult(assets).map((item) => ({
          id: item.id,
          title: item.name,
          description: item.category,
          type: "Brand asset",
          href: `/clients/${item.client_id}/brand/assets?asset=${item.id}`,
        })),
      ];
    },
  });
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">A CLEAR PATH</span>
          <h1>Search</h1>
          <p>Projects, briefings, and brand resources, in one search.</p>
        </div>
      </div>
      <SearchField
        className="global-search"
        label="Search your workspace"
        value={input}
        onChange={setInput}
        placeholder="Search your workspace…"
        iconSize={20}
        inputRef={inputRef}
      />
      {search.length < 2 ? (
        <div className="empty-state">
          <Search size={25} />
          <h2>Start with a name or an idea.</h2>
          <p>Enter at least two characters to search your work.</p>
        </div>
      ) : results.isPending ? (
        <p role="status">Looking through your workspace…</p>
      ) : results.error ? (
        <div role="alert">
          <p className="form-error">We couldn’t complete the search.</p>
          <button className="button" onClick={() => void results.refetch()}>
            Try again
          </button>
        </div>
      ) : results.data?.length ? (
        <div className="search-results">
          {results.data.map((result) => (
            <Link className="search-result" href={result.href} key={`${result.type}:${result.id}`}>
              <div>
                <span className="eyebrow">{result.type}</span>
                <h2>{result.title}</h2>
                <p>{result.description}</p>
              </div>
              <ArrowUpRight size={17} />
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>No matches yet.</h2>
          <p>Try a project name, workspace, or a different keyword.</p>
        </div>
      )}
    </div>
  );
}

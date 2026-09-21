"use client";

import { ArrowUpRight, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useWorkspaceSearch } from "./workspace-data";
import { SearchField } from "@/features/shared/search-field";

export function SearchPage() {
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
  const results = useWorkspaceSearch(search);
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
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
          <p>Try a project name, a client, or a different keyword.</p>
        </div>
      )}
    </div>
  );
}

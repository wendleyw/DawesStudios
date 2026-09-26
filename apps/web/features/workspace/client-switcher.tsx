"use client";

import { Building2, Check, ChevronsUpDown, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useDismissOnOutsideClick } from "@/features/shared/use-dismiss-on-outside-click";
import type { Client } from "./workspace-data";

/** Uses the shell's authorized client query; the picker never loads a separate client directory. */
export function ClientSwitcher({
  clients,
  activeClientId,
  loading,
  failed,
  onRetry,
}: {
  clients: Client[];
  activeClientId?: string;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const selected =
    clients.find((client) => client.id === activeClientId) ??
    (clients.length === 1 ? clients[0] : undefined);
  const visible = clients.filter((client) =>
    client.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
  }, [open]);
  useDismissOnOutsideClick(root, open, () => setOpen(false));

  const identity = (
    <>
      <span className="client-initials" aria-hidden="true">
        {selected ? selected.initials || selected.name.slice(0, 2) : <Building2 size={18} />}
      </span>
      <span className="client-switcher-copy">
        <small>Client workspace</small>
        <strong>{selected?.name ?? (loading ? "Loading clients…" : "Select a client")}</strong>
      </span>
    </>
  );

  return (
    <div
      className="client-switcher"
      ref={root}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      {clients.length === 1 && !failed ? (
        <Link
          href={`/clients/${clients[0].id}/${profile?.role === "designer" ? "board" : "overview"}`}
          className="client-switcher-trigger"
          title={`${clients[0].name} workspace`}
          aria-label={`${clients[0].name} workspace`}
        >
          {identity}
        </Link>
      ) : (
        <button
          ref={trigger}
          className="client-switcher-trigger"
          aria-label={selected ? `Switch client: ${selected.name}` : "Select a client"}
          title={selected ? `Switch client: ${selected.name}` : "Select a client"}
          aria-expanded={open}
          aria-controls={panelId}
          disabled={loading}
          onClick={() => {
            setSearch("");
            setOpen(!open);
          }}
        >
          {identity}
          <ChevronsUpDown className="client-switcher-chevron" size={16} />
        </button>
      )}
      {open && (
        <div
          id={panelId}
          className="client-switcher-panel"
          role="region"
          aria-label="Choose a client"
        >
          <label className="client-switcher-search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={input}
              aria-label="Find a client"
              placeholder="Find a client…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="client-switcher-results">
            {failed ? (
              <div className="client-switcher-empty" role="alert">
                Clients could not be loaded.
                <button className="button" onClick={onRetry}>
                  Try again
                </button>
              </div>
            ) : visible.length ? (
              visible.map((client) => (
                <Link
                  key={client.id}
                  // A client with several workspaces opens each workspace's Overview from here;
                  // the studio and designers keep opening the Board.
                  href={`/clients/${client.id}/${profile?.role === "client" ? "overview" : "board"}`}
                  className="client-switcher-option"
                  aria-current={client.id === selected?.id ? "location" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <span className="client-initials" aria-hidden="true">
                    {client.initials || client.name.slice(0, 2)}
                  </span>
                  <span>{client.name}</span>
                  {client.id === selected?.id && <Check size={16} aria-hidden="true" />}
                </Link>
              ))
            ) : (
              <p className="client-switcher-empty">
                {clients.length ? "No clients found." : "No client workspaces available."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

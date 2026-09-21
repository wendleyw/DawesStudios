"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowUpRight, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { useClients, type Client } from "@/features/workspace/workspace-data";
import { clientSlug, validWebsite } from "./settings-model";
import { saveClient, useInvalidateClients } from "./settings-data";
import { CampaignSettings } from "./campaign-settings";
import { InvitePerson } from "./team-settings";
import { SettingsSuccess } from "./settings-success";
import { FormError } from "@/features/shared/form-error";

export function ClientSettings() {
  const clients = useClients();
  const [editing, setEditing] = useState<Client | "new" | null>(null);
  const [campaignClient, setCampaignClient] = useState<Client | null>(null);
  const [inviting, setInviting] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  return (
    <section className="settings-block">
      <header>
        <div>
          <h2>Clients</h2>
          <p>One organized space for each client and their brand.</p>
        </div>
        <button className="button primary" onClick={() => setEditing("new")}>
          <Plus size={15} />
          New client
        </button>
      </header>
      {notice && <SettingsSuccess>{notice}</SettingsSuccess>}
      {clients.isPending ? (
        <p role="status">Loading clients…</p>
      ) : clients.error ? (
        <FormError>
          Clients could not be loaded.{" "}
          <button className="button quiet" onClick={() => void clients.refetch()}>
            Try again
          </button>
        </FormError>
      ) : (
        <div className="settings-list">
          {clients.data?.map((client) => (
            <div className="settings-list-row settings-client-row" key={client.id}>
              <div>
                <strong>{client.name}</strong>
                <p>{client.industry || "Client"}</p>
              </div>
              <button className="button quiet" onClick={() => setCampaignClient(client)}>
                Campaigns
              </button>
              <button className="button quiet" onClick={() => setInviting(client.id)}>
                Invite
              </button>
              <button className="button quiet" onClick={() => setEditing(client)}>
                Edit
              </button>
              <Link
                className="button quiet"
                aria-label={`Open ${client.name} board`}
                href={`/clients/${client.id}/board`}
              >
                <ArrowUpRight size={17} />
              </Link>
            </div>
          ))}
        </div>
      )}
      {campaignClient && (
        <CampaignSettings
          clientId={campaignClient.id}
          clientName={campaignClient.name}
          onClose={() => setCampaignClient(null)}
        />
      )}
      {editing && (
        <ClientEditor
          client={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            setNotice(`${name} saved.`);
          }}
        />
      )}
      {inviting && (
        <InvitePerson
          clientId={inviting}
          onClose={() => setInviting(null)}
          onSent={() => {
            setInviting(null);
            setNotice("Invitation email sent.");
          }}
        />
      )}
    </section>
  );
}

function ClientEditor({
  client,
  onClose,
  onSaved,
}: {
  client?: Client;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const { database } = useAuth();
  const invalidateClients = useInvalidateClients();
  const [name, setName] = useState(client?.name ?? "");
  const [industry, setIndustry] = useState(client?.industry ?? "");
  const [website, setWebsite] = useState(client?.website ?? "");
  const [description, setDescription] = useState(client?.description ?? "");
  const [initialCredits, setInitialCredits] = useState("0");
  // The revision this form was opened on. Held in state and never refreshed, so a refused save
  // keeps refusing rather than quietly becoming valid, and the text typed here is never discarded.
  const [revision] = useState(client?.updated_at);
  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim() || name.trim().length > 120)
        throw new Error("Use a client name between 1 and 120 characters.");
      if (!validWebsite(website))
        throw new Error("Use a complete website address beginning with https:// or http://.");
      if (client)
        await saveClient(database, {
          mode: "update",
          id: client.id,
          revision,
          name: name.trim(),
          industry: industry.trim(),
          website: website.trim(),
          description: description.trim(),
        });
      else {
        const credits = Number(initialCredits);
        if (!Number.isSafeInteger(credits) || credits < 0)
          throw new Error("Initial credits must be a non-negative whole number.");
        const slug = clientSlug(name);
        if (!slug) throw new Error("Use a client name containing letters or numbers.");
        await saveClient(database, {
          mode: "create",
          name: name.trim(),
          slug,
          industry: industry.trim(),
          initialCredits: credits,
        });
      }
    },
    onSuccess: async () => {
      await invalidateClients();
      onSaved(name.trim());
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={client ? "Client details" : "New client"}
      description={
        client
          ? "Keep this client’s details up to date."
          : "Start a clear space for the next collaboration."
      }
    >
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label>
          Client name
          <input
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Industry
          <input value={industry} onChange={(event) => setIndustry(event.target.value)} />
        </label>
        {client ? (
          <>
            <label>
              Website
              <input
                type="url"
                placeholder="https://example.com"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </label>
            <label>
              Description
              <textarea
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </>
        ) : (
          <label>
            Initial credit allocation
            <input
              type="number"
              min={0}
              step={1}
              value={initialCredits}
              onChange={(event) => setInitialCredits(event.target.value)}
            />
            <span className="settings-note">
              Creates an opening ledger entry when greater than zero.
            </span>
          </label>
        )}
        {save.error && <FormError>{save.error.message}</FormError>}
        <div className="settings-dialog-actions">
          <button className="button" type="button" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button className="button primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : client ? "Save changes" : "Create client"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

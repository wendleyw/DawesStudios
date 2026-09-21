"use client";

import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { useClients } from "@/features/workspace/workspace-data";
import { invitationRequestSchema } from "./settings-model";
import {
  revokeInvitation,
  useInvalidateTeam,
  useInvitations,
  useTeamMembers,
} from "./settings-data";
import { SettingsSuccess } from "./settings-success";
import { FormError } from "@/features/shared/form-error";

export function TeamSettings() {
  const { database, session } = useAuth();
  const invalidateTeam = useInvalidateTeam();
  const clients = useClients();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const members = useTeamMembers();
  const invitations = useInvitations();
  const revoke = useMutation({
    mutationFn: async (id: string) => revokeInvitation(database, { invitationId: id }),
    onSuccess: () => invalidateTeam(),
  });
  return (
    <div className="settings-sections">
      <section className="settings-block">
        <header>
          <div>
            <h2>Your team</h2>
            <p>The people who keep good work moving.</p>
          </div>
          <button
            className="button primary"
            onClick={() => {
              setInviteOpen(true);
              setSent(false);
            }}
          >
            <Plus size={15} />
            Invite someone
          </button>
        </header>
        {sent && <SettingsSuccess>Invitation email sent.</SettingsSuccess>}
        {members.isPending ? (
          <p role="status">Loading the team…</p>
        ) : members.error ? (
          <FormError>
            Team members could not be loaded.{" "}
            <button className="button quiet" onClick={() => void members.refetch()}>
              Try again
            </button>
          </FormError>
        ) : (
          <div className="settings-list">
            {members.data?.map((person) => (
              <div className="settings-list-row" key={person.id}>
                <span className="settings-avatar">
                  {person.display_name
                    .split(" ")
                    .map((value) => value[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div>
                  <strong>
                    {person.display_name}
                    {person.id === session?.user.id ? " (you)" : ""}
                  </strong>
                  <p>{person.role === "agency" ? "Studio team" : "Designer"}</p>
                </div>
                <span className="status-badge">
                  {person.role === "agency" ? "Agency" : "Designer"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="settings-block">
        <header>
          <div>
            <h2>Invitations</h2>
            <p>Each invitation is restricted to its email address and expires after seven days.</p>
          </div>
        </header>
        {invitations.isPending ? (
          <p role="status">Loading invitations…</p>
        ) : invitations.error ? (
          <FormError>
            Invitations could not be loaded.{" "}
            <button className="button quiet" onClick={() => void invitations.refetch()}>
              Try again
            </button>
          </FormError>
        ) : invitations.data?.length ? (
          <div className="settings-list">
            {invitations.data.map((item) => {
              const expired =
                item.status === "pending" && new Date(item.expires_at).getTime() < now;
              return (
                <div className="settings-list-row" key={item.id}>
                  <div>
                    <strong>{item.email}</strong>
                    <p>
                      {item.role === "client"
                        ? `${clients.data?.find((client) => client.id === item.client_id)?.name ?? "Client"} · Client`
                        : item.role === "agency"
                          ? "Studio team"
                          : "Designer"}
                    </p>
                  </div>
                  <span className="status-badge">
                    {expired
                      ? "Expired"
                      : item.status === "pending"
                        ? "Pending"
                        : item.status === "accepted"
                          ? "Accepted"
                          : "Revoked"}
                  </span>
                  {item.status === "pending" && (
                    <button
                      className="button quiet"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(item.id)}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="settings-note">No invitations yet.</p>
        )}
        {revoke.error && <FormError>{revoke.error.message}</FormError>}
      </section>
      {inviteOpen && (
        <InvitePerson
          onClose={() => setInviteOpen(false)}
          onSent={() => {
            setInviteOpen(false);
            setSent(true);
          }}
        />
      )}
    </div>
  );
}

export function InvitePerson({
  onClose,
  onSent,
  clientId,
}: {
  onClose: () => void;
  onSent: () => void;
  clientId?: string;
}) {
  const { session } = useAuth();
  const invalidateTeam = useInvalidateTeam();
  const clients = useClients();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"agency" | "client" | "designer">(
    clientId ? "client" : "designer",
  );
  const [selectedClient, setSelectedClient] = useState(clientId ?? "");
  const invite = useMutation({
    mutationFn: async () => {
      const parsed = invitationRequestSchema.safeParse({
        email: email.trim(),
        role,
        ...(role === "client" ? { clientId: selectedClient } : {}),
      });
      if (!parsed.success)
        throw new Error(parsed.error.issues[0]?.message ?? "Check the invitation details.");
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session!.access_token}`,
        },
        body: JSON.stringify(parsed.data),
      });
      const result = (await response.json()) as { error?: string; delivered?: boolean };
      if (!response.ok || !result.delivered)
        throw new Error(result.error ?? "The invitation email could not be sent.");
    },
    onSuccess: async () => {
      await invalidateTeam();
      onSent();
    },
    onError: () => invalidateTeam(),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={clientId ? "Invite a client" : "Invite someone"}
      description="They will receive a secure email to create their account."
    >
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          invite.mutate();
        }}
      >
        <label>
          Email address
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        {!clientId && (
          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
              <option value="designer">Designer</option>
              <option value="agency">Agency</option>
              <option value="client">Client</option>
            </select>
          </label>
        )}
        {role === "client" && !clientId && (
          <label>
            Client
            <select
              required
              value={selectedClient}
              onChange={(event) => setSelectedClient(event.target.value)}
            >
              <option value="">Choose a client</option>
              {clients.data?.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="settings-note">
          {role === "agency"
            ? "Agency members can manage studio work, clients and credits."
            : role === "designer"
              ? "Designers can access only the projects assigned to them."
              : "Clients can access only their own projects and shared work."}
        </p>
        {invite.error && <FormError>{invite.error.message}</FormError>}
        <div className="settings-dialog-actions">
          <button className="button" type="button" onClick={onClose} disabled={invite.isPending}>
            Cancel
          </button>
          <button className="button primary" disabled={invite.isPending || clients.isPending}>
            {invite.isPending ? "Sending invitation…" : "Send invitation"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

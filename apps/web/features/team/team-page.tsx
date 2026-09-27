"use client";

import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { useClients } from "@/features/workspace/workspace-data";
import { invitationRequestSchema } from "@/features/settings/settings-model";
import {
  isInvitationPending,
  removeTeamMember,
  revokeInvitation,
  setTeamMemberRole,
  useInvalidateTeam,
  useInvitations,
  useTeamMembers,
} from "./team-data";
import { useNow } from "./use-now";
import { SettingsSuccess } from "@/features/settings/settings-success";
import { FormError } from "@/features/shared/form-error";
import { PageStatus } from "@/features/shared/page-status";
import "./team.css";

export function TeamPage() {
  const { database, session, profile } = useAuth();
  const invalidateTeam = useInvalidateTeam();
  const clients = useClients();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const now = useNow(60_000);
  const members = useTeamMembers();
  const invitations = useInvitations();
  const revoke = useMutation({
    mutationFn: async (id: string) => revokeInvitation(database, { invitationId: id }),
    onSuccess: () => invalidateTeam(),
  });
  const changeRole = useMutation({
    mutationFn: async (input: { profileId: string; role: "agency" | "designer" }) =>
      setTeamMemberRole(database, input),
    onSuccess: () => invalidateTeam(),
  });
  const remove = useMutation({
    mutationFn: async (profileId: string) => removeTeamMember(session!, { profileId }),
    onSuccess: async () => {
      setRemoving(null);
    },
    onSettled: () => invalidateTeam(),
  });
  if (!profile) return <PageStatus>Loading the team…</PageStatus>;
  // Team is a standalone route now rather than a tab nested inside `SettingsPage`, which used to
  // gate every non-account tab (including "team") behind this same check and copy. Preserve both
  // here so a designer or client hitting `/team` directly still sees the documented
  // refusal (see docs/architecture/acceptance-matrix.md, D01) instead of an RLS-broken page.
  if (profile.role !== "agency")
    return (
      <div className="page-content">
        <h1>Studio settings are private.</h1>
        <p>You can manage your own account below.</p>
        <Link className="button" href="/settings/account">
          Your account
        </Link>
      </div>
    );
  return (
    <div className="page-content team-page">
      <header className="page-heading">
        <div>
          <h1>Team</h1>
          <p>The people who work in the studio, and what they’re carrying right now.</p>
        </div>
      </header>
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
                    <p>
                      {person.removed_at
                        ? "Access removed · Account block pending"
                        : person.role === "agency"
                          ? "Studio team"
                          : `Designer · ${person.activeProjectCount} active project${person.activeProjectCount === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  {person.id === session?.user.id ? (
                    <span className="status-badge">
                      {person.role === "agency" ? "Agency" : "Designer"}
                    </span>
                  ) : (
                    <>
                      {!person.removed_at && (
                        <select
                          className="member-role-select"
                          aria-label={`Change ${person.display_name}'s role`}
                          value={person.role}
                          disabled={changeRole.isPending || remove.isPending}
                          onChange={(event) =>
                            changeRole.mutate({
                              profileId: person.id,
                              role: event.target.value as "agency" | "designer",
                            })
                          }
                        >
                          <option value="agency">Agency</option>
                          <option value="designer">Designer</option>
                        </select>
                      )}
                      <button
                        className="button quiet"
                        disabled={remove.isPending || changeRole.isPending}
                        onClick={() => {
                          remove.reset();
                          setRemoving({ id: person.id, name: person.display_name });
                        }}
                      >
                        {person.removed_at ? "Finish removal" : "Remove"}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {changeRole.error && <FormError>{changeRole.error.message}</FormError>}
        </section>
        <section className="settings-block">
          <header>
            <div>
              <h2>Invitations</h2>
              <p>
                Each invitation is restricted to its email address and expires after seven days.
              </p>
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
                const expired = item.status === "pending" && !isInvitationPending(item, now);
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
      </div>
      {inviteOpen && (
        <InvitePerson
          onClose={() => setInviteOpen(false)}
          onSent={() => {
            setInviteOpen(false);
            setSent(true);
          }}
        />
      )}
      {/* Removing someone from the whole studio is at least as consequential as removing them from
          one project, and that action already asks first (project-details.tsx's "Remove this
          designer?" modal) — the same pattern applies here rather than a new one. */}
      <Modal
        open={!!removing}
        title="Remove this team member?"
        description="They will lose access to every project and cannot sign in again."
        onClose={() => {
          if (!remove.isPending) setRemoving(null);
        }}
      >
        <div className="form-actions">
          <button className="button" onClick={() => setRemoving(null)} disabled={remove.isPending}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={() => removing && remove.mutate(removing.id)}
            disabled={remove.isPending}
          >
            {remove.isPending ? "Removing…" : "Remove"}
          </button>
        </div>
        {remove.error && <FormError>{remove.error.message}</FormError>}
      </Modal>
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
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"agency" | "client" | "designer">(
    clientId ? "client" : "designer",
  );
  const [selectedClient, setSelectedClient] = useState(clientId ?? "");
  const invite = useMutation({
    mutationFn: async () => {
      const parsed = invitationRequestSchema.safeParse({
        email: email.trim(),
        displayName,
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
      description="They will receive a secure invitation email."
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
        <label>
          Full name (optional)
          <input
            type="text"
            autoComplete="name"
            maxLength={120}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <p className="settings-note">
          Used for a new account. Someone with an account keeps their existing name.
        </p>
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

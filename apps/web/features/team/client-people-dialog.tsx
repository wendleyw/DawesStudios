"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { SettingsSuccess } from "@/features/settings/settings-success";
import { FormError } from "@/features/shared/form-error";
import { Modal } from "@/features/shared/modal";
import { useDateFormat } from "@/features/workspace/workspace-data";
import {
  clientPeopleQueryKeys,
  isInvitationPending,
  removeClientMember,
  useClientPeople,
  useInvitations,
  usePendingClientRemovals,
} from "./team-data";
import { InvitePerson } from "./team-page";
import { useNow } from "./use-now";
import "./team.css";

type Removal = { id: string; name: string; pending: boolean };

/**
 * Settings → Clients → People: the client's active people with Remove, its pending invitations
 * (read-only) and the existing invite form. Removing someone's last client also blocks their
 * sign-in, which only the server route can do; a removal whose second step failed stays listed as
 * pending, with Finish removal, even after a reload.
 */
export function ClientPeopleDialog({
  clientId,
  clientName,
  onClose,
}: {
  clientId: string;
  clientName: string;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const { formatDate } = useDateFormat();
  const people = useClientPeople(clientId);
  const pendingRemovals = usePendingClientRemovals(clientId);
  const invitations = useInvitations();
  // A live clock, not a frozen `Date.now()`: an invitation that expires while the dialog is open
  // (or after an idle tab) drops out of Invited on its own instead of only after a reopen.
  const now = useNow(60_000);
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState("");
  const [removing, setRemoving] = useState<Removal | null>(null);
  const remove = useMutation({
    mutationFn: async (target: Removal) =>
      removeClientMember(session!, { clientId, profileId: target.id }),
    onSuccess: (_result, target) => {
      setRemoving(null);
      setNotice(`${target.name} no longer has access to ${clientName}.`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [clientPeopleQueryKeys.people] }),
  });
  const team = people.data?.team ?? [];
  const invited = (invitations.data ?? []).filter(
    (item) =>
      item.role === "client" && item.client_id === clientId && isInvitationPending(item, now),
  );
  const askToRemove = (target: Removal) => {
    remove.reset();
    setNotice("");
    setRemoving(target);
  };
  // A pending row already lost project access; only the sign-in block is left to finish, so the
  // confirmation reads that instead of "loses access" and skips the last-person warning below. A
  // first attempt can end access but fail to block sign-in (502), which leaves the same row pending
  // too, even though `removing` froze `pending: false` when the confirmation opened: while it stays
  // open, also read the live pending list so the wording catches up after that retry-triggering
  // failure.
  const removingPending =
    !!removing &&
    (removing.pending ||
      (pendingRemovals.data?.some((person) => person.id === removing.id) ?? false));
  const removalDescription = removing
    ? removingPending
      ? `${removing.name} no longer has access to ${clientName}. This finishes blocking their sign-in.`
      : `${removing.name} loses access to ${clientName}.`
    : undefined;
  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`${clientName} people`}
        description="Everyone who signs in to this client, each with their own account."
        size="lg"
      >
        <div className="client-people">
          {notice && <SettingsSuccess>{notice}</SettingsSuccess>}
          <section>
            <h3>People</h3>
            {people.isPending || pendingRemovals.isPending ? (
              <p role="status">Loading people…</p>
            ) : people.error || pendingRemovals.error ? (
              <FormError>
                People could not be loaded.{" "}
                <button
                  className="button quiet"
                  onClick={() => {
                    void people.refetch();
                    void pendingRemovals.refetch();
                  }}
                >
                  Try again
                </button>
              </FormError>
            ) : team.length || pendingRemovals.data?.length ? (
              <div className="settings-list">
                {team.map((person) => (
                  <div className="settings-list-row" key={person.user_id}>
                    <div>
                      <strong>{person.display_name}</strong>
                      <p>{person.email}</p>
                    </div>
                    <button
                      className="button quiet"
                      aria-label={`Remove ${person.display_name}`}
                      disabled={remove.isPending}
                      onClick={() =>
                        askToRemove({
                          id: person.user_id,
                          name: person.display_name,
                          pending: false,
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {pendingRemovals.data?.map((person) => (
                  <div className="settings-list-row" key={person.id}>
                    <div>
                      <strong>{person.display_name}</strong>
                      <p>Access removed · Account block pending</p>
                    </div>
                    <button
                      className="button quiet"
                      aria-label={`Finish removal for ${person.display_name}`}
                      disabled={remove.isPending}
                      onClick={() =>
                        askToRemove({ id: person.id, name: person.display_name, pending: true })
                      }
                    >
                      Finish removal
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="settings-note">Nobody can sign in to {clientName} yet.</p>
            )}
          </section>
          <section>
            <h3>Invited</h3>
            {invitations.isPending ? (
              <p role="status">Loading invitations…</p>
            ) : invitations.error ? (
              <FormError>
                Invitations could not be loaded.{" "}
                <button className="button quiet" onClick={() => void invitations.refetch()}>
                  Try again
                </button>
              </FormError>
            ) : invited.length ? (
              <div className="settings-list">
                {invited.map((item) => (
                  <div className="settings-list-row" key={item.id}>
                    <div>
                      <strong>{item.email}</strong>
                      <p>Invitation expires {formatDate(item.expires_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="settings-note">No pending invitations.</p>
            )}
          </section>
          <div className="settings-dialog-actions">
            <button
              className="button primary"
              onClick={() => {
                setNotice("");
                setInviting(true);
              }}
            >
              <Plus size={15} />
              Invite person
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        open={!!removing}
        title={removing ? `Remove ${removing.name}?` : "Remove this person?"}
        description={removalDescription}
        closeDisabled={remove.isPending}
        onClose={() => {
          if (!remove.isPending) setRemoving(null);
        }}
      >
        {removing && !removingPending && team.length === 1 && (
          <p className="settings-note">
            {clientName} will have nobody who can sign in until someone is invited.
          </p>
        )}
        <div className="form-actions">
          <button className="button" onClick={() => setRemoving(null)} disabled={remove.isPending}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={() => removing && remove.mutate(removing)}
            disabled={remove.isPending}
          >
            {remove.isPending ? "Removing…" : "Remove"}
          </button>
        </div>
        {remove.error && <FormError>{remove.error.message}</FormError>}
      </Modal>
      {inviting && (
        <InvitePerson
          clientId={clientId}
          onClose={() => setInviting(false)}
          onSent={() => {
            setInviting(false);
            setNotice("Invitation email sent.");
          }}
        />
      )}
    </>
  );
}

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { FormError } from "@/features/shared/form-error";
import { useClients, type Client } from "@/features/workspace/workspace-data";
import {
  clientPeopleQueryKeys,
  setClientNotifications,
  useClientNotificationChoices,
  useClientPeople,
} from "@/features/team/team-data";

/**
 * Settings → Your account, for a client person: one Team section for each client they belong to,
 * with that client's people and the person's own notification choice. The studio decides who is on
 * the team (Settings → Clients → People); the studio and designers never see these sections.
 */
export function ClientTeamSections() {
  const { profile } = useAuth();
  const clients = useClients();
  const choices = useClientNotificationChoices();
  if (profile?.role !== "client") return null;
  if (clients.isPending || choices.isPending) return <p role="status">Loading your team…</p>;
  if (clients.error || choices.error)
    return (
      <FormError>
        Your team could not be loaded.{" "}
        <button
          className="button quiet"
          onClick={() => {
            void clients.refetch();
            void choices.refetch();
          }}
        >
          Try again
        </button>
      </FormError>
    );
  return (
    <>
      {clients.data?.map((client) => (
        <ClientTeamSection
          key={client.id}
          client={client}
          notifyAll={
            choices.data?.find((choice) => choice.client_id === client.id)?.notify_all ?? false
          }
        />
      ))}
    </>
  );
}

function ClientTeamSection({ client, notifyAll }: { client: Client; notifyAll: boolean }) {
  const { database, session } = useAuth();
  const queryClient = useQueryClient();
  const headingId = useId();
  const people = useClientPeople(client.id);
  const choose = useMutation({
    mutationFn: async (all: boolean) =>
      setClientNotifications(database, { clientId: client.id, all }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [clientPeopleQueryKeys.notifications] }),
  });
  const pick = (all: boolean) => {
    if (all !== notifyAll && !choose.isPending) choose.mutate(all);
  };
  return (
    <section className="settings-section" aria-labelledby={headingId}>
      <div>
        <h2 id={headingId}>{client.name} team</h2>
        <p>
          Everyone at {client.name} who works with the studio. To add or remove someone, contact the
          studio.
        </p>
      </div>
      <div className="client-team">
        {people.isPending ? (
          <p role="status">Loading the team…</p>
        ) : people.error ? (
          <FormError>
            The team could not be loaded.{" "}
            <button className="button quiet" onClick={() => void people.refetch()}>
              Try again
            </button>
          </FormError>
        ) : (
          <div className="settings-list">
            {people.data?.team.map((person) => (
              <div className="settings-list-row" key={person.user_id}>
                <div>
                  <strong>{person.display_name}</strong>
                  <p>{person.email}</p>
                </div>
                {person.user_id === session?.user.id && <span className="status-badge">You</span>}
              </div>
            ))}
          </div>
        )}
        <div className="client-team-notifications">
          <strong>Notifications</strong>
          <div
            className="segmented-control"
            role="group"
            aria-label={`${client.name} notifications`}
          >
            <button
              type="button"
              aria-pressed={!notifyAll}
              disabled={choose.isPending}
              onClick={() => pick(false)}
            >
              My requests
            </button>
            <button
              type="button"
              aria-pressed={notifyAll}
              disabled={choose.isPending}
              onClick={() => pick(true)}
            >
              All {client.name} activity
            </button>
          </div>
          <p className="settings-note">
            {notifyAll
              ? `Every ${client.name} project notifies you.`
              : "The briefings you requested, and the conversations you joined, notify you."}
          </p>
          {choose.error && <FormError>{choose.error.message}</FormError>}
        </div>
      </div>
    </section>
  );
}

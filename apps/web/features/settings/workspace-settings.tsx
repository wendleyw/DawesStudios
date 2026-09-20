"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult } from "@/lib/supabase";
import { useWorkspaceSettings } from "@/features/workspace/workspace-settings";
import { FormError } from "@/features/shared/form-error";

export function WorkspaceSettings() {
  const settings = useWorkspaceSettings();
  if (settings.isPending) return <p role="status">Loading workspace settings…</p>;
  if (settings.error || !settings.data)
    return (
      <div>
        <FormError>Workspace settings could not be loaded.</FormError>
        <button className="button" onClick={() => void settings.refetch()}>
          Try again
        </button>
      </div>
    );
  return (
    <WorkspaceForm
      initialName={settings.data.studio_name}
      initialTimezone={settings.data.timezone}
    />
  );
}

function WorkspaceForm({
  initialName,
  initialTimezone,
}: {
  initialName: string;
  initialTimezone: string;
}) {
  const { database } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName);
  const [timezone, setTimezone] = useState(initialTimezone);
  const timezones = [
    ...new Set(["UTC", initialTimezone, ...Intl.supportedValuesOf("timeZone")]),
  ].sort();
  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim() || name.trim().length > 120)
        throw new Error("Use a studio name between 1 and 120 characters.");
      assertResult(
        await database.rpc("update_workspace_settings", {
          p_studio_name: name.trim(),
          p_timezone: timezone,
        }),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace-settings"] }),
  });
  return (
    <section className="settings-section">
      <div>
        <h2>Studio details</h2>
        <p>The shared identity and timezone for your workspace.</p>
      </div>
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label>
          Studio name
          <input
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Timezone
          <select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
            {timezones.map((item) => (
              <option key={item} value={item}>
                {item.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        {save.error && <FormError>{save.error.message}</FormError>}
        {save.isSuccess && (
          <p className="settings-success" role="status">
            Workspace updated.
          </p>
        )}
        <button className="button primary" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </section>
  );
}

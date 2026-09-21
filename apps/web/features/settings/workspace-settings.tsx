"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useWorkspaceSettings } from "@/features/workspace/workspace-settings";
import { saveWorkspaceSettings, useInvalidateWorkspaceSettings } from "./settings-data";
import { SettingsSuccess } from "./settings-success";
import { FormError } from "@/features/shared/form-error";

export function WorkspaceSettings() {
  const settings = useWorkspaceSettings();
  if (settings.isPending) return <p role="status">Loading studio settings…</p>;
  if (settings.error || !settings.data)
    return (
      <div>
        <FormError>Studio settings could not be loaded.</FormError>
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
  const invalidateWorkspaceSettings = useInvalidateWorkspaceSettings();
  const [name, setName] = useState(initialName);
  const [timezone, setTimezone] = useState(initialTimezone);
  const timezones = [
    ...new Set(["UTC", initialTimezone, ...Intl.supportedValuesOf("timeZone")]),
  ].sort();
  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim() || name.trim().length > 120)
        throw new Error("Use a studio name between 1 and 120 characters.");
      await saveWorkspaceSettings(database, { studioName: name.trim(), timezone });
    },
    onSuccess: () => invalidateWorkspaceSettings(),
  });
  return (
    <section className="settings-section">
      <div>
        <h2>Studio details</h2>
        <p>The shared identity and timezone for the studio.</p>
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
        {save.isSuccess && <SettingsSuccess>Studio updated.</SettingsSuccess>}
        <button className="button primary" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </section>
  );
}

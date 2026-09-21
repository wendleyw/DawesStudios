"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useServicePresets } from "@/features/briefings/briefing-data";
import { services } from "@/features/briefings/briefing-model";
import { Modal } from "@/features/shared/modal";
import { saveServicePreset, useInvalidatePresets } from "./settings-data";
import { SettingsSuccess } from "./settings-success";
import { FormError } from "@/features/shared/form-error";

type EditablePreset = {
  service_type: string;
  min_credits: number | null;
  max_credits: number | null;
  due_days: number | null;
  revision: number;
};

export function PresetSettings() {
  const presets = useServicePresets();
  const [editing, setEditing] = useState<EditablePreset | null>(null);
  const [notice, setNotice] = useState("");
  if (presets.isPending) return <p role="status">Loading service presets…</p>;
  if (presets.error)
    return (
      <div>
        <FormError>Service presets could not be loaded.</FormError>
        <button className="button" onClick={() => void presets.refetch()}>
          Try again
        </button>
      </div>
    );
  return (
    <section className="settings-block">
      <header>
        <div>
          <h2>Service presets</h2>
          <p>
            Default estimates and timing for new briefings. Accepted project budgets stay unchanged.
          </p>
        </div>
      </header>
      {notice && <SettingsSuccess>{notice}</SettingsSuccess>}
      <div className="settings-list">
        {services.map((service) => {
          const preset = presets.data?.find((item) => item.service_type === service.id);
          return (
            <div className="settings-list-row settings-preset-row" key={service.id}>
              <div>
                <strong>{service.name}</strong>
                <p>
                  {service.category}
                  {preset ? ` · Revision ${preset.revision}` : ""}
                </p>
              </div>
              <span className="settings-preset-value">
                {service.id === "other"
                  ? "Custom estimate"
                  : `${preset?.min_credits ?? service.min}–${preset?.max_credits ?? service.max} credits`}
              </span>
              <span className="settings-preset-value">
                {service.id === "other"
                  ? "To be agreed"
                  : `${preset?.due_days ?? service.days} days`}
              </span>
              {preset && service.id !== "other" && (
                <button className="button quiet" onClick={() => setEditing(preset)}>
                  Edit
                </button>
              )}
            </div>
          );
        })}
      </div>
      {editing && (
        <PresetEditor
          preset={editing}
          onClose={() => setEditing(null)}
          onSaved={(revision) => {
            setNotice(`Service preset saved as revision ${revision}.`);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function PresetEditor({
  preset,
  onClose,
  onSaved,
}: {
  preset: EditablePreset;
  onClose: () => void;
  onSaved: (revision: number) => void;
}) {
  const { database } = useAuth();
  const invalidatePresets = useInvalidatePresets();
  const [minimum, setMinimum] = useState(String(preset.min_credits ?? ""));
  const [maximum, setMaximum] = useState(String(preset.max_credits ?? ""));
  const [days, setDays] = useState(String(preset.due_days ?? ""));
  const save = useMutation({
    mutationFn: async () => {
      const min = Number(minimum);
      const max = Number(maximum);
      const duration = Number(days);
      if (
        ![min, max, duration].every(Number.isSafeInteger) ||
        min < 1 ||
        max < min ||
        duration < 1 ||
        duration > 365
      )
        throw new Error(
          "Use positive whole numbers, a maximum at least equal to the minimum, and timing from 1 to 365 days.",
        );
      return saveServicePreset(database, {
        serviceType: preset.service_type,
        minCredits: min,
        maxCredits: max,
        dueDays: duration,
      });
    },
    onSuccess: async (revision) => {
      await invalidatePresets();
      onSaved(revision);
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={services.find((item) => item.id === preset.service_type)?.name ?? "Service preset"}
      description="This creates a new preset revision. Confirmed project budgets are preserved."
    >
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div className="settings-form-columns">
          <label>
            Minimum credits
            <input
              type="number"
              min={1}
              required
              step={1}
              value={minimum}
              onChange={(event) => setMinimum(event.target.value)}
            />
          </label>
          <label>
            Maximum credits
            <input
              type="number"
              min={1}
              required
              step={1}
              value={maximum}
              onChange={(event) => setMaximum(event.target.value)}
            />
          </label>
        </div>
        <label>
          Suggested delivery days
          <input
            type="number"
            min={1}
            max={365}
            step={1}
            required
            value={days}
            onChange={(event) => setDays(event.target.value)}
          />
        </label>
        {save.error && <FormError>{save.error.message}</FormError>}
        <div className="settings-dialog-actions">
          <button className="button" type="button" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button className="button primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save preset"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

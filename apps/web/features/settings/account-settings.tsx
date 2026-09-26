"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { callAuth, describeSupabaseError } from "@/lib/supabase";
import { validatePassword } from "./settings-model";
import { updateProfile, useInvalidateAccount } from "./settings-data";
import { SettingsSuccess } from "./settings-success";
import { FormError } from "@/features/shared/form-error";
import { ClientTeamSections } from "./client-team-section";

export function AccountSettings() {
  const { database, profile, session } = useAuth();
  const invalidateAccount = useInvalidateAccount();
  const [name, setName] = useState(profile?.display_name ?? "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const saveProfile = useMutation({
    mutationFn: async () => {
      if (!name.trim() || name.trim().length > 120)
        throw new Error("Use a display name between 1 and 120 characters.");
      await updateProfile(database, { userId: session!.user.id, displayName: name.trim() });
    },
    onSuccess: () => invalidateAccount(),
  });
  const changePassword = useMutation({
    mutationFn: async () => {
      const error = validatePassword(password, confirmation);
      if (error) throw new Error(error);
      const result = await callAuth(database.auth.updateUser({ password }));
      if (result.error) throw new Error(describeSupabaseError(result.error));
    },
    onSuccess: () => {
      setPassword("");
      setConfirmation("");
    },
  });
  return (
    <div className="settings-sections">
      <section className="settings-section">
        <div>
          <h2>Your profile</h2>
          <p>The name your studio sees when you work together.</p>
        </div>
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            saveProfile.mutate();
          }}
        >
          <label>
            Display name
            <input
              value={name}
              maxLength={120}
              required
              autoComplete="name"
              onChange={(event) => {
                setName(event.target.value);
                saveProfile.reset();
              }}
            />
          </label>
          <label>
            Email address
            <input value={session?.user.email ?? ""} readOnly type="email" />
            <span className="settings-note">
              Your sign-in email is managed with your account access.
            </span>
          </label>
          {saveProfile.error && <FormError>{saveProfile.error.message}</FormError>}
          {saveProfile.isSuccess && <SettingsSuccess>Profile saved.</SettingsSuccess>}
          <button className="button primary" disabled={saveProfile.isPending}>
            {saveProfile.isPending ? "Saving…" : "Save profile"}
          </button>
        </form>
      </section>
      <ClientTeamSections />
      <section className="settings-section">
        <div>
          <h2>Password</h2>
          <p>Use a unique password with at least 12 characters.</p>
        </div>
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            changePassword.mutate();
          }}
        >
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                changePassword.reset();
              }}
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value);
                changePassword.reset();
              }}
            />
          </label>
          {changePassword.error && <FormError>{changePassword.error.message}</FormError>}
          {changePassword.isSuccess && <SettingsSuccess>Password updated.</SettingsSuccess>}
          <button className="button" disabled={changePassword.isPending}>
            {changePassword.isPending ? "Updating…" : "Update password"}
          </button>
        </form>
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useAuth } from "@/features/auth/auth-provider";
import { AccountSettings } from "./account-settings";
import { ClientSettings } from "./client-settings";
import { PresetSettings } from "./preset-settings";
import { TeamSettings } from "./team-settings";
import { WorkspaceSettings } from "./workspace-settings";
import "./settings.css";
import { PageStatus } from "@/features/shared/page-status";

type SettingsTab = "workspace" | "team" | "clients" | "presets" | "account";
const labels: Record<SettingsTab, string> = {
  workspace: "Workspace",
  team: "Team",
  clients: "Clients",
  presets: "Presets",
  account: "Your account",
};

export function SettingsPage({ tab = "workspace" }: { tab?: SettingsTab }) {
  const { profile } = useAuth();
  if (!profile) return <PageStatus>Opening settings…</PageStatus>;
  if (profile.role !== "agency" && tab !== "account")
    return (
      <div className="page-content">
        <h1>Studio settings are private.</h1>
        <p>You can manage your own account below.</p>
        <Link className="button" href="/settings/account">
          Your account
        </Link>
      </div>
    );
  const tabs: SettingsTab[] =
    profile.role === "agency"
      ? ["workspace", "team", "clients", "presets", "account"]
      : ["account"];
  return (
    <div className="page-content settings-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">
            {tab === "account" ? "YOUR WORKSPACE" : "STUDIO ADMINISTRATION"}
          </span>
          <h1>{tab === "account" ? "Your account" : "Settings"}</h1>
          <p>
            {tab === "account"
              ? "A few details that make this space yours."
              : "Keep the studio organized and ready for what is next."}
          </p>
        </div>
      </header>
      {tabs.length > 1 && (
        <nav className="settings-tabs" aria-label="Settings sections">
          {tabs.map((item) => (
            <Link
              key={item}
              href={`/settings/${item}`}
              className={tab === item ? "active" : ""}
              aria-current={tab === item ? "page" : undefined}
            >
              {labels[item]}
            </Link>
          ))}
        </nav>
      )}
      <div className="settings-content">
        {tab === "account" ? (
          <AccountSettings key={profile.id} />
        ) : tab === "team" ? (
          <TeamSettings />
        ) : tab === "clients" ? (
          <ClientSettings />
        ) : tab === "presets" ? (
          <PresetSettings />
        ) : (
          <WorkspaceSettings />
        )}
      </div>
    </div>
  );
}

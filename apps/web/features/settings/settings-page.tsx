"use client";

import Link from "next/link";
import { useAuth } from "@/features/auth/auth-provider";
import { AccountSettings } from "./account-settings";
import { ClientSettings } from "./client-settings";
import { PresetSettings } from "./preset-settings";
import { WorkspaceSettings } from "./workspace-settings";
import "./settings.css";
import { PageStatus } from "@/features/shared/page-status";

type SettingsTab = "workspace" | "clients" | "presets" | "account";
const labels: Record<SettingsTab, string> = {
  workspace: "Studio",
  clients: "Clients",
  presets: "Presets",
  account: "Your account",
};

export function SettingsPage({ tab = "workspace" }: { tab?: SettingsTab }) {
  const { profile } = useAuth();
  if (!profile) return <PageStatus>Loading settings…</PageStatus>;
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
    profile.role === "agency" ? ["workspace", "clients", "presets", "account"] : ["account"];
  return (
    <div className="page-content settings-page">
      <header className="page-heading card-heading">
        <div>
          <h1>{tab === "account" ? "Your account" : "Settings"}</h1>
          <p>
            {tab === "account"
              ? "A few details that make this space yours."
              : "Keep the studio organized and ready for what is next."}
          </p>
        </div>
        {tabs.length > 1 && (
          <nav
            className="settings-tabs section-tabs card-heading-tools"
            aria-label="Settings sections"
          >
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
      </header>
      <div className="settings-content">
        {tab === "account" ? (
          <AccountSettings key={profile.id} />
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

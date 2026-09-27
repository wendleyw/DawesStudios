/**
 * Channel-specific Google Drive folder links: the form's pre-check before it calls
 * `setProjectDriveLink`.
 *
 * The database validates the pasted URL again (`public.set_project_drive_link`) and is the
 * authority; this copy only lets the dialog refuse a bad link before anything is sent. The scheme
 * must be `https` and the host exactly `drive.google.com` — no lookalikes such as
 * `drive.google.com.evil.com`.
 */
export const driveUrlHint = "Paste a Google Drive link (https://drive.google.com/…).";

const driveUrl = /^https:\/\/drive\.google\.com(\/\S*)?$/;

/** `null` when blank (clears the link), the trimmed URL when valid, `false` when invalid. */
export function parseDriveUrl(url: string): string | null | false {
  const trimmed = url.trim();
  if (trimmed === "") return null;
  return driveUrl.test(trimmed) ? trimmed : false;
}

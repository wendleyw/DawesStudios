import { z } from "@/lib/zod";

export const invitationRequestSchema = z
  .object({
    email: z.string().trim().email().toLowerCase(),
    role: z.enum(["agency", "client", "designer"]),
    // A workspace id is UUID-shaped rather than RFC 4122 version 4; the seeded workspaces derive
    // theirs from a hash, and `z.uuid()` would refuse an invitation to any of them.
    clientId: z.guid().optional(),
  })
  .superRefine((value, context) => {
    if (value.role === "client" && !value.clientId)
      context.addIssue({
        code: "custom",
        path: ["clientId"],
        message: "Choose the client's workspace.",
      });
    if (value.role !== "client" && value.clientId)
      context.addIssue({
        code: "custom",
        path: ["clientId"],
        message: "Only client invitations may include a client workspace.",
      });
  });

export function validatePassword(password: string, confirmation: string) {
  if (password.length < 12) return "Use at least 12 characters for your password.";
  if (password !== confirmation) return "The passwords do not match.";
  return null;
}

export function clientSlug(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/g, "");
}

export function validWebsite(value: string) {
  if (!value.trim()) return true;
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export type Invitation = {
  id: string;
  email: string;
  role: "agency" | "client" | "designer";
  client_id: string | null;
  status: "pending" | "accepted" | "revoked";
  expires_at: string;
  created_at: string;
};

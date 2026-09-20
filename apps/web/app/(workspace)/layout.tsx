import { AppShell } from "@/features/workspace/app-shell";
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

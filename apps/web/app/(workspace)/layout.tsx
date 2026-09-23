import { AppShell } from "@/features/workspace/app-shell";
export default function WorkspaceLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <AppShell>
      {children}
      {modal}
    </AppShell>
  );
}

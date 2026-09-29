import { AppShell } from "@/features/workspace/app-shell";
import { SignInIntro } from "@/features/workspace/sign-in-intro";
export default function WorkspaceLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {/* Outside the shell, which swaps its whole tree while auth loads. */}
      <SignInIntro />
      <AppShell>
        {children}
        {modal}
      </AppShell>
    </>
  );
}

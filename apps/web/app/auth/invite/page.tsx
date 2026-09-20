import { Suspense } from "react";
import { InvitationAcceptance } from "@/features/settings/invitation-acceptance";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="centered-state" role="status">
          Loading invitation…
        </main>
      }
    >
      <InvitationAcceptance />
    </Suspense>
  );
}

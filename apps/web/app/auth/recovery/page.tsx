import { Suspense } from "react";
import { AccountRecovery } from "@/features/settings/account-recovery";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="centered-state" role="status">
          Loading account recovery…
        </main>
      }
    >
      <AccountRecovery />
    </Suspense>
  );
}

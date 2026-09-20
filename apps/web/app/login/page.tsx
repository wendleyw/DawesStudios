import { LoginPage } from "@/features/auth/login-page";
import { Suspense } from "react";
export default function LoginRoute() {
  return (
    <Suspense
      fallback={
        <main className="centered-state" role="status">
          Opening sign in…
        </main>
      }
    >
      <LoginPage />
    </Suspense>
  );
}

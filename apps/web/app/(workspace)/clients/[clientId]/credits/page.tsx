import { CreditsPage } from "@/features/credits/credits-page";

export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const values = await params;
  return <CreditsPage key={values.clientId} {...values} />;
}

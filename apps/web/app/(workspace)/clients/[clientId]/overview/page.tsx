import { ClientOverviewPage } from "@/features/overview/client-overview-page";
export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return <ClientOverviewPage key={clientId} clientId={clientId} />;
}

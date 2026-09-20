import { AssetsPage } from "@/features/assets/assets-page";
export default async function Page({ params }: { params: Promise<{ clientId: string }> }) { const { clientId } = await params; return <AssetsPage key={clientId} clientId={clientId} />; }

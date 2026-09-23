import { redirect } from "next/navigation";
import { BrandPage } from "@/features/brand/brand-page";
export default async function ClientBrandSection({
  params,
}: {
  params: Promise<{ clientId: string; section: string }>;
}) {
  const { clientId, section } = await params;
  if (section === "templates") redirect(`/clients/${clientId}/brand/assets`);
  return <BrandPage clientId={clientId} section={section} />;
}

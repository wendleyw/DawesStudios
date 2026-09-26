import { redirect } from "next/navigation";
import { BrandPage } from "@/features/brand/brand-page";
export default async function ClientBrandSection({
  params,
}: {
  params: Promise<{ clientId: string; section: string }>;
}) {
  const { clientId, section } = await params;
  // Templates was removed and Products now lives at the top of Assets; old links land there.
  if (section === "templates" || section === "products")
    redirect(`/clients/${clientId}/brand/assets`);
  return <BrandPage clientId={clientId} section={section} />;
}

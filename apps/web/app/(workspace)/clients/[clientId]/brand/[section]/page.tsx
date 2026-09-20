import { BrandPage } from "@/features/brand/brand-page";
export default async function ClientBrandSection({
  params,
}: {
  params: Promise<{ clientId: string; section: string }>;
}) {
  const { clientId, section } = await params;
  return <BrandPage clientId={clientId} section={section} />;
}

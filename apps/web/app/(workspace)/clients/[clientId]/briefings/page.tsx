import { BriefingsPage } from "@/features/briefings/briefings-page";

export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const values = await params;
  return <BriefingsPage key={values.clientId} {...values} />;
}

import { BriefingDetail } from "@/features/briefings/briefing-detail";

export default async function Page({
  params,
}: {
  params: Promise<{ clientId: string; briefingId: string }>;
}) {
  const values = await params;
  return <BriefingDetail key={values.clientId} {...values} />;
}

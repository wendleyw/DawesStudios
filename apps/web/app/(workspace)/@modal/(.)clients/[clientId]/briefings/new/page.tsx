import { NewBriefingModal } from "@/features/briefings/new-briefing-modal";

export default async function NewBriefingDialogRoute({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return <NewBriefingModal clientId={clientId} />;
}

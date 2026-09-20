import { DraftEditor } from "@/features/brand/draft-editor";
export default async function PersonalBrandDraft({
  params,
}: {
  params: Promise<{ clientId: string; draftId: string }>;
}) {
  const { clientId, draftId } = await params;
  return <DraftEditor clientId={clientId} draftId={draftId} />;
}

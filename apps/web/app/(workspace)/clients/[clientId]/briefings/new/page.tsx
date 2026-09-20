import { BriefingEditorPage } from "@/features/briefings/briefing-editor";

export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const values = await params;
  return <BriefingEditorPage key={values.clientId} {...values} />;
}

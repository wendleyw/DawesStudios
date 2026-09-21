import { BoardPage } from "@/features/board/board-page";
export default async function ClientBoard({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return <BoardPage clientId={clientId} />;
}

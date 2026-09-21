import { ReviewsPage } from "@/features/reviews/reviews-page";
export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return <ReviewsPage key={clientId} clientId={clientId} />;
}

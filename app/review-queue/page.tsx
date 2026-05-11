import { AppShell } from "@/app/components/app-shell";
import { ReviewQueueList } from "@/app/components/review-queue-list";
import { requireSession } from "@/lib/auth";
import { getReviewQueueItems } from "@/lib/crm";

export default async function ReviewQueuePage() {
  const session = await requireSession();
  const items = await getReviewQueueItems();

  return (
    <AppShell currentPath="/review-queue" session={session}>
      <section className="hero-card">
        <span className="eyebrow">Review queue</span>
        <h1 className="record-title">Review queue</h1>
      </section>

      <ReviewQueueList initialItems={items} />
    </AppShell>
  );
}

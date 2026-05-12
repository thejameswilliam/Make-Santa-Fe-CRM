import { AppShell } from "@/app/components/app-shell";
import { ReviewQueueList } from "@/app/components/review-queue-list";
import { RuntimeIssuePanel } from "@/app/components/runtime-issue-panel";
import { requireSession } from "@/lib/auth";
import { getReviewQueueItems } from "@/lib/crm";
import { getRuntimeIssue } from "@/lib/runtime-issues";

export default async function ReviewQueuePage() {
  const session = await requireSession();
  try {
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
  } catch (error) {
    console.error("Review queue load failed", error);

    return (
      <AppShell currentPath="/review-queue" session={session}>
        <RuntimeIssuePanel issue={getRuntimeIssue(error, "Review queue")} />
      </AppShell>
    );
  }
}

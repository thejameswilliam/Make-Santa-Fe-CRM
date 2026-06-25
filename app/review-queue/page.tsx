import { AppShell } from "@/app/components/app-shell";
import { ReviewQueueList } from "@/app/components/review-queue-list";
import { RuntimeIssuePanel } from "@/app/components/runtime-issue-panel";
import { requireSession } from "@/lib/auth";
import { getReviewQueuePageData } from "@/lib/crm";
import { getRuntimeIssue } from "@/lib/runtime-issues";

export default async function ReviewQueuePage() {
  const session = await requireSession();
  try {
    const data = await getReviewQueuePageData();

    return (
      <AppShell currentPath="/review-queue" session={session}>
        <section className="hero-card">
          <span className="eyebrow">Donation Review</span>
          <h1 className="record-title">Donation Review</h1>
        </section>

        <ReviewQueueList initialItems={data.items} interactionTypeOptions={data.interactionTypeOptions} />
      </AppShell>
    );
  } catch (error) {
    console.error("Donation review load failed", error);

    return (
      <AppShell currentPath="/review-queue" session={session}>
        <RuntimeIssuePanel issue={getRuntimeIssue(error, "Donation review")} />
      </AppShell>
    );
  }
}

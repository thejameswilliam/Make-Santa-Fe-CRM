import { AppShell } from "@/app/components/app-shell";
import { BackgroundRefresh } from "@/app/components/background-refresh";
import { CultivationDashboard } from "@/app/components/cultivation-dashboard";
import { RuntimeIssuePanel } from "@/app/components/runtime-issue-panel";
import { requireSession } from "@/lib/auth";
import { getCultivationDashboardData, upsertCrmUserSession } from "@/lib/crm";
import { getRuntimeIssue } from "@/lib/runtime-issues";

export default async function CultivationPage() {
  const session = await requireSession();

  try {
    await upsertCrmUserSession(session);
    const data = await getCultivationDashboardData();

    return (
      <AppShell currentPath="/cultivation" session={session}>
        <section className="status-toolbar">
          <BackgroundRefresh
            enabled={data.needsBackgroundRefresh}
            notifyEnabled={data.needsStaleNotice}
            message="Loaded cached CRM data."
          />
        </section>

        <CultivationDashboard initialData={data} />
      </AppShell>
    );
  } catch (error) {
    console.error("Cultivation dashboard load failed", error);

    return (
      <AppShell currentPath="/cultivation" session={session}>
        <RuntimeIssuePanel issue={getRuntimeIssue(error, "Cultivation dashboard")} />
      </AppShell>
    );
  }
}

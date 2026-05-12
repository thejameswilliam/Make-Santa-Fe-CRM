import { AppShell } from "@/app/components/app-shell";
import { BackgroundRefresh } from "@/app/components/background-refresh";
import { ContactCard } from "@/app/components/contact-card";
import { MetricCard } from "@/app/components/metric-card";
import { RuntimeIssuePanel } from "@/app/components/runtime-issue-panel";
import { requireSession } from "@/lib/auth";
import { getDashboardData } from "@/lib/crm";
import { getRuntimeIssue } from "@/lib/runtime-issues";
import { formatDateTime } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await requireSession();
  try {
    const data = await getDashboardData();

    return (
      <AppShell currentPath="/" session={session}>
        <section className="status-toolbar">
          <BackgroundRefresh
            enabled={data.needsBackgroundRefresh}
            message="Loaded cached CRM data."
          />
        </section>

        <section className="status-grid">
          {data.syncStatus.map((status) => (
            <div className="status-card" data-stale={status.stale} key={status.source}>
              <span className="eyebrow">{status.label}</span>
              <strong>{status.stale ? "Needs refresh" : "Fresh"}</strong>
              <span className="muted">
                {status.lastSuccessfulSyncAt
                  ? `Last sync: ${formatDateTime(status.lastSuccessfulSyncAt)}`
                  : "No successful sync yet"}
              </span>
            </div>
          ))}
        </section>

        <section className="metric-grid">
          {data.metrics.map((metric) => (
            <MetricCard
              detail={metric.detail}
              key={metric.id}
              label={metric.label}
              laneKey={metric.laneKey}
              value={metric.value}
            />
          ))}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Favorites</span>
              <h2 className="section-title">Favorite people</h2>
            </div>
          </div>

          <div className="contact-list dashboard-favorite-list">
            {data.favoriteContacts.length === 0 ? (
              <div className="empty-state">No favorite people yet.</div>
            ) : (
              data.favoriteContacts.map((contact) => (
                <ContactCard contact={contact} eyebrow="Favorited record" key={contact.id} />
              ))
            )}
          </div>
        </section>
      </AppShell>
    );
  } catch (error) {
    console.error("Dashboard load failed", error);

    return (
      <AppShell currentPath="/" session={session}>
        <RuntimeIssuePanel issue={getRuntimeIssue(error, "Dashboard")} />
      </AppShell>
    );
  }
}

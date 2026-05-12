import Link from "next/link";

import { AppShell } from "@/app/components/app-shell";
import { BackgroundRefresh } from "@/app/components/background-refresh";
import { ContactCard } from "@/app/components/contact-card";
import { MetricCard } from "@/app/components/metric-card";
import { RuntimeIssuePanel } from "@/app/components/runtime-issue-panel";
import { requireSession } from "@/lib/auth";
import { getDashboardData } from "@/lib/crm";
import {
  CONTACT_ROLE_TAG_META,
  isContactEffectiveRoleTagKey,
  type ContactEffectiveRoleTagKey
} from "@/lib/constants";
import { getRuntimeIssue } from "@/lib/runtime-issues";
import { formatDateTime } from "@/lib/utils";

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{ roleTag?: string }>;
}) {
  const session = await requireSession();
  const { roleTag } = await searchParams;
  const normalizedRoleTag = roleTag?.trim() ?? "";
  const selectedRoleTag: ContactEffectiveRoleTagKey | "ALL" = isContactEffectiveRoleTagKey(normalizedRoleTag)
    ? normalizedRoleTag
    : "ALL";

  try {
    const data = await getDashboardData(selectedRoleTag);

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

        <section className="panel compact-panel dashboard-role-filter-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Role tags</span>
              <h2 className="section-title">Filter dashboard</h2>
            </div>
          </div>

          <div className="pill-row role-filter-row">
            <Link
              className={`role-filter-pill${data.selectedRoleTag === "ALL" ? " is-active" : ""}`}
              href="/"
            >
              All
            </Link>
            {data.availableRoleTags.map((role) => (
              <Link
                className={`role-filter-pill${data.selectedRoleTag === role.key ? " is-active" : ""}`}
                href={`/?roleTag=${role.key}`}
                key={role.key}
                style={{
                  ["--role-tag-color" as string]: CONTACT_ROLE_TAG_META[role.key].color,
                  ["--role-tag-text" as string]: CONTACT_ROLE_TAG_META[role.key].textColor
                }}
              >
                {role.label}
              </Link>
            ))}
          </div>
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

        {data.selectedRoleTag !== "ALL" ? (
          <section className="panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">
                  {data.taggedContacts.length} {data.taggedContacts.length === 1 ? "person" : "people"}
                </span>
                <h2 className="section-title">{CONTACT_ROLE_TAG_META[data.selectedRoleTag as ContactEffectiveRoleTagKey].label}</h2>
              </div>
            </div>

            <div className="contact-list dashboard-favorite-list">
              {data.taggedContacts.length === 0 ? (
                <div className="empty-state">No people match this role tag yet.</div>
              ) : (
                data.taggedContacts.map((contact) => (
                  <ContactCard
                    contact={contact}
                    eyebrow={CONTACT_ROLE_TAG_META[data.selectedRoleTag as ContactEffectiveRoleTagKey].label}
                    key={contact.id}
                  />
                ))
              )}
            </div>
          </section>
        ) : null}
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

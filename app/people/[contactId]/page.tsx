import { notFound } from "next/navigation";

import { AppShell } from "@/app/components/app-shell";
import { BackgroundRefresh } from "@/app/components/background-refresh";
import { ContactNotes } from "@/app/components/contact-notes";
import { ContactSearchSelect } from "@/app/components/contact-search-select";
import { FavoriteContactButton } from "@/app/components/favorite-contact-button";
import { ManualInteractionForm } from "@/app/components/manual-interaction-form";
import { MetricCard } from "@/app/components/metric-card";
import { RuntimeIssuePanel } from "@/app/components/runtime-issue-panel";
import { Timeline } from "@/app/components/timeline";
import { requireSession } from "@/lib/auth";
import { getContactDetail } from "@/lib/crm";
import { SOURCE_LABELS } from "@/lib/constants";
import { getRuntimeIssue } from "@/lib/runtime-issues";
import { formatDateTime, formatPhoneNumber } from "@/lib/utils";

export default async function ContactPage({
  params
}: {
  params: Promise<{ contactId: string }>;
}) {
  const session = await requireSession();
  const { contactId } = await params;
  try {
    const detail = await getContactDetail(contactId);

    if (!detail) {
      notFound();
    }

    return (
      <AppShell currentPath="/people" session={session}>
        <section className="hero-card">
          <div className="row-between">
            <div className="section-stack">
              <span className="eyebrow">Individual record</span>
              <h1 className="record-title">{detail.displayName}</h1>
              <p className="section-copy">
                Primary email: <span className="inline-code">{detail.primaryEmail ?? "Not set"}</span>
              </p>
              <div className="pill-row">
                <span className={`status-pill ${detail.isActive ? "status-pill-active" : "status-pill-inactive"}`}>
                  {detail.isActive ? "Active" : "Inactive"}
                </span>
              </div>
            </div>

            <div className="stack-tight record-hero-actions">
              <FavoriteContactButton contactId={detail.id} initialIsFavorite={detail.isFavorite} />
              <div className="pill-row">
                {detail.emails.map((email) => (
                  <span className="lane-pill" key={email}>
                    {email}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <BackgroundRefresh
            enabled={detail.needsBackgroundRefresh}
            message="Loaded the cached person record."
            source={undefined}
          />

          <div className="compact-profile-block">
            <div className="compact-profile-header">
              <span className="eyebrow">Canonical fields</span>
            </div>

            <div className="compact-profile-grid">
              {detail.profileFields.map((field) => (
                <div className="compact-profile-item" key={field.fieldKey}>
                  <span className="compact-profile-label">{field.fieldKey.replaceAll("_", " ")}</span>
                  <strong className="compact-profile-value">
                    {field.fieldKey === "PHONE"
                      ? formatPhoneNumber(field.displayValue) ?? "No value yet"
                      : field.displayValue ?? "No value yet"}
                  </strong>

                  {field.rawValues.length > 0 ? (
                    <div className="compact-profile-source-list">
                      {field.rawValues.map((value) => (
                        <span className="compact-profile-source" key={`${field.fieldKey}-${value.source}`}>
                          {SOURCE_LABELS[value.source]} ·{" "}
                          {field.fieldKey === "PHONE"
                            ? formatPhoneNumber(value.displayValue) ?? value.displayValue
                            : value.displayValue}{" "}
                          · {formatDateTime(value.observedAt)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="compact-profile-source">No source history</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="record-metrics-stack">
          {detail.metricSections.map((section) => (
            <section className="panel" key={section.id}>
              <div className="panel-header">
                <div>
                  <span className="eyebrow">Metrics</span>
                  <h2 className="section-title">{section.title}</h2>
                </div>
              </div>

              <div className="metric-grid record-metric-grid">
                {section.metrics.map((metric) => (
                  <MetricCard
                    compact
                    detail={metric.detail}
                    key={metric.id}
                    label={metric.label}
                    laneKey={metric.laneKey}
                    value={metric.value}
                  />
                ))}
              </div>
            </section>
          ))}
        </section>

        <section className="record-grid">
          <aside className="section-stack">
            <section className="panel compact-panel">
              <div>
                <span className="eyebrow">Merge records</span>
                <h2 className="section-title">Merge by email</h2>
              </div>

              <ContactSearchSelect
                action={`/api/contacts/${detail.id}/merge`}
                emptyMessage="No contacts matched that email."
                excludeContactId={detail.id}
                hiddenName="mergedContactId"
                label="Find duplicate by email"
                placeholder="duplicate@example.org"
                returnTo={`/people/${detail.id}`}
                submitLabel="Merge into this record"
              />
              <p className="form-note">Merges are audited and move emails, external IDs, timeline events, and manual interactions into this canonical record.</p>
            </section>

            <ContactNotes notes={detail.notes} />
          </aside>

          <div className="section-stack">
            <section className="panel">
              <div>
                <span className="eyebrow">Manual entry</span>
                <h2 className="section-title">Add note or interaction</h2>
              </div>
              <ManualInteractionForm
                contactId={detail.id}
                interactionTypeOptions={detail.interactionTypeOptions}
                returnTo={`/people/${detail.id}`}
              />
            </section>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Timeline</span>
              <h2 className="section-title">Time-scaled interaction history</h2>
            </div>
          </div>

          <Timeline editable entries={detail.timeline} manualInteractionTypeOptions={detail.interactionTypeOptions} />
        </section>
      </AppShell>
    );
  } catch (error) {
    console.error("Contact page load failed", error);

    return (
      <AppShell currentPath="/people" session={session}>
        <RuntimeIssuePanel issue={getRuntimeIssue(error, "Person record")} />
      </AppShell>
    );
  }
}

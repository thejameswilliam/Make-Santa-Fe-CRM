"use client";

import { useState } from "react";

import Link from "next/link";

import {
  CULTIVATION_STATUSES,
  CULTIVATION_STATUS_META,
  type CultivationStatusKey
} from "@/lib/constants";
import type {
  CultivationDashboardData,
  CultivationOwnerOption,
  LapsedDonorItem,
  PriorityDonorItem,
  UpgradeDonorItem
} from "@/lib/types";
import { formatDateOnly, formatDateTime } from "@/lib/utils";

function toDateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function compareDatesAscNullable(left?: string | null, right?: string | null) {
  if (!left && !right) {
    return 0;
  }

  if (!left) {
    return 1;
  }

  if (!right) {
    return -1;
  }

  return new Date(left).getTime() - new Date(right).getTime();
}

function compareDatesDescNullable(left?: string | null, right?: string | null) {
  const leftValue = left ? new Date(left).getTime() : Number.NEGATIVE_INFINITY;
  const rightValue = right ? new Date(right).getTime() : Number.NEGATIVE_INFINITY;
  return rightValue - leftValue;
}

function sortPriorityQueue(items: PriorityDonorItem[]) {
  return [...items].sort((left, right) => {
    const byScore = right.priorityScore - left.priorityScore;
    if (byScore !== 0) {
      return byScore;
    }

    const byDueDate = compareDatesAscNullable(left.nextFollowUpAt, right.nextFollowUpAt);
    if (byDueDate !== 0) {
      return byDueDate;
    }

    return compareDatesDescNullable(left.lastInteractionAt, right.lastInteractionAt);
  });
}

async function readJsonError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  } catch {}

  return fallback;
}

function SectionOwner({ owner }: { owner: CultivationOwnerOption | null }) {
  return owner ? owner.name : "Unassigned";
}

function CultivationReadOnlyRow({
  donor,
  eyebrow
}: {
  donor: UpgradeDonorItem | LapsedDonorItem;
  eyebrow: string;
}) {
  return (
    <div className="cultivation-readonly-row">
      <div className="cultivation-readonly-main">
        <span className="contact-eyebrow">{eyebrow}</span>
        <div className="row-between cultivation-readonly-head">
          <div>
            <Link className="cultivation-link" href={`/people/${donor.contactId}`}>
              {donor.displayName}
            </Link>
            {donor.primaryEmail ? <div className="muted cultivation-row-email">{donor.primaryEmail}</div> : null}
          </div>
          {"upgradeScore" in donor ? (
            <span className="cultivation-score-pill">Upgrade {donor.upgradeScore}</span>
          ) : (
            <span className={`status-pill status-pill-${donor.urgencyTone}`}>{donor.urgencyLabel}</span>
          )}
        </div>
      </div>

      <div className="cultivation-readonly-metrics">
        {"suggestedAskAmount" in donor ? (
          <div>
            <span className="cultivation-metric-label">Suggested ask</span>
            <strong>{donor.suggestedAskAmount}</strong>
          </div>
        ) : null}
        <div>
          <span className="cultivation-metric-label">Last donation</span>
          <strong>
            {donor.lastDonationAmount ? `${donor.lastDonationAmount} · ` : ""}
            {donor.lastDonationAt ? formatDateOnly(donor.lastDonationAt) : "—"}
          </strong>
        </div>
        {"daysSinceLastDonation" in donor ? (
          <div>
            <span className="cultivation-metric-label">Days since gift</span>
            <strong>{donor.daysSinceLastDonation ?? "—"}</strong>
          </div>
        ) : null}
        <div>
          <span className="cultivation-metric-label">Owner</span>
          <strong><SectionOwner owner={donor.owner} /></strong>
        </div>
      </div>

      {"upgradeIndicators" in donor && donor.upgradeIndicators.length > 0 ? (
        <div className="pill-row cultivation-indicator-row">
          {donor.upgradeIndicators.map((indicator) => (
            <span className="role-tag-pill cultivation-indicator-pill" key={indicator}>
              {indicator}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CultivationDashboard({ initialData }: { initialData: CultivationDashboardData }) {
  const [priorityQueue, setPriorityQueue] = useState(initialData.priorityQueue);
  const [upgradeCandidates, setUpgradeCandidates] = useState(initialData.upgradeCandidates);
  const [lapsedDonors, setLapsedDonors] = useState(initialData.lapsedDonors);
  const [busyActions, setBusyActions] = useState<Record<string, string | null>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  function setBusy(contactId: string, action: string | null) {
    setBusyActions((current) => ({
      ...current,
      [contactId]: action
    }));
  }

  function setError(contactId: string, message: string | null) {
    setErrors((current) => ({
      ...current,
      [contactId]: message
    }));
  }

  function applyOwnerAcrossLists(contactId: string, owner: CultivationOwnerOption | null) {
    setUpgradeCandidates((current) =>
      current.map((item) => (item.contactId === contactId ? { ...item, owner } : item))
    );
    setLapsedDonors((current) =>
      current.map((item) => (item.contactId === contactId ? { ...item, owner } : item))
    );
  }

  async function updateWorkflow(
    contactId: string,
    changes: {
      ownerUserId?: string | null;
      status?: CultivationStatusKey;
      nextFollowUpAt?: string | null;
    }
  ) {
    const previousPriorityQueue = priorityQueue;
    const previousUpgradeCandidates = upgradeCandidates;
    const previousLapsedDonors = lapsedDonors;
    const currentItem = priorityQueue.find((item) => item.contactId === contactId);

    if (!currentItem) {
      return;
    }

    const optimisticOwner =
      changes.ownerUserId === undefined
        ? currentItem.owner
        : changes.ownerUserId
          ? initialData.ownerOptions.find((option) => option.id === changes.ownerUserId) ?? null
          : null;
    const optimisticStatus = changes.status ?? currentItem.status;
    const optimisticNextFollowUpAt =
      changes.nextFollowUpAt === undefined ? currentItem.nextFollowUpAt : changes.nextFollowUpAt ? `${changes.nextFollowUpAt}T12:00:00.000Z` : null;

    setError(contactId, null);
    setBusy(contactId, "saving");
    setPriorityQueue((current) =>
      current.map((item) =>
        item.contactId === contactId
          ? {
              ...item,
              owner: optimisticOwner,
              status: optimisticStatus,
              nextFollowUpAt: optimisticNextFollowUpAt
            }
          : item
      )
    );
    applyOwnerAcrossLists(contactId, optimisticOwner);

    try {
      const response = await fetch(`/api/cultivation/${contactId}/workflow`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(changes)
      });

      if (!response.ok) {
        throw new Error(await readJsonError(response, "Could not update cultivation workflow."));
      }

      const payload = (await response.json()) as {
        owner?: CultivationOwnerOption | null;
        status?: CultivationStatusKey;
        nextFollowUpAt?: string | null;
        priorityItem?: PriorityDonorItem | null;
      };

      applyOwnerAcrossLists(contactId, payload.owner ?? null);
      setPriorityQueue((current) => {
        const filtered = current.filter((item) => item.contactId !== contactId);
        if (!payload.priorityItem) {
          return filtered;
        }

        return sortPriorityQueue([...filtered, payload.priorityItem]).slice(0, 25);
      });
    } catch (error) {
      setPriorityQueue(previousPriorityQueue);
      setUpgradeCandidates(previousUpgradeCandidates);
      setLapsedDonors(previousLapsedDonors);
      setError(contactId, error instanceof Error ? error.message : "Could not update cultivation workflow.");
    } finally {
      setBusy(contactId, null);
    }
  }

  return (
    <>
      <section className="hero-card compact-hero-card cultivation-hero">
        <span className="eyebrow">Cultivation</span>
        <h1 className="record-title">Donor cultivation dashboard</h1>
        <p className="muted cultivation-hero-copy">
          Focus the next conversations, stewardship actions, and ask timing around donors who need attention now.
        </p>
        <div className="cultivation-hero-stats">
          <div className="status-card">
            <span className="eyebrow">Priority queue</span>
            <strong>{priorityQueue.length}</strong>
            <span className="muted">Action-needed donors</span>
          </div>
          <div className="status-card">
            <span className="eyebrow">Upgrade</span>
            <strong>{upgradeCandidates.length}</strong>
            <span className="muted">Most likely to upgrade</span>
          </div>
          <div className="status-card">
            <span className="eyebrow">At-risk</span>
            <strong>{lapsedDonors.length}</strong>
            <span className="muted">Lapsed or slipping</span>
          </div>
        </div>
      </section>

      <section className="panel cultivation-section">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Primary work queue</span>
            <h2 className="section-title">Priority Donor Queue</h2>
          </div>
        </div>

        <div className="surface-list cultivation-queue-list">
          {priorityQueue.length === 0 ? (
            <div className="empty-state">No donors currently need cultivation action.</div>
          ) : (
            priorityQueue.map((donor) => {
              const busy = Boolean(busyActions[donor.contactId]);

              return (
                <article className={`cultivation-row${busy ? " is-busy" : ""}`} key={donor.contactId}>
                  <div className="cultivation-row-main">
                    <div className="cultivation-row-top">
                      <div>
                        <Link className="cultivation-link cultivation-row-name" href={`/people/${donor.contactId}`}>
                          {donor.displayName}
                        </Link>
                        {donor.primaryEmail ? <div className="muted cultivation-row-email">{donor.primaryEmail}</div> : null}
                      </div>
                      <div className="cultivation-row-top-right">
                        <span className="cultivation-score-pill">Priority {donor.priorityScore}</span>
                        <span className={`status-pill status-pill-${donor.urgencyTone}`}>{donor.urgencyLabel}</span>
                      </div>
                    </div>

                    <div className="cultivation-row-grid">
                      <div>
                        <span className="cultivation-metric-label">Suggested ask</span>
                        <strong>{donor.suggestedAskAmount}</strong>
                      </div>
                      <div>
                        <span className="cultivation-metric-label">Last interaction</span>
                        <strong>{donor.lastInteractionAt ? formatDateTime(donor.lastInteractionAt) : "—"}</strong>
                      </div>
                      <div>
                        <span className="cultivation-metric-label">Last donation</span>
                        <strong>
                          {donor.lastDonationAmount ? `${donor.lastDonationAmount} · ` : ""}
                          {donor.lastDonationAt ? formatDateOnly(donor.lastDonationAt) : "—"}
                        </strong>
                      </div>
                      <div>
                        <span className="cultivation-metric-label">Days since gift</span>
                        <strong>{donor.daysSinceLastDonation ?? "—"}</strong>
                      </div>
                    </div>

                    {donor.upgradeIndicators.length > 0 ? (
                      <div className="pill-row cultivation-indicator-row">
                        {donor.upgradeIndicators.map((indicator) => (
                          <span className="role-tag-pill cultivation-indicator-pill" key={indicator}>
                            {indicator}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {errors[donor.contactId] ? (
                      <div className="inline-alert inline-alert-error">{errors[donor.contactId]}</div>
                    ) : null}
                  </div>

                  <div className="cultivation-row-controls">
                    <div className="field">
                      <label>
                        Relationship Owner
                        <select
                          disabled={busy}
                          onChange={(event) =>
                            void updateWorkflow(donor.contactId, {
                              ownerUserId: event.target.value || null
                            })
                          }
                          value={donor.owner?.id ?? ""}
                        >
                          <option value="">Unassigned</option>
                          {initialData.ownerOptions.map((owner) => (
                            <option key={owner.id} value={owner.id}>
                              {owner.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="field">
                      <label>
                        Cultivation Status
                        <select
                          disabled={busy}
                          onChange={(event) =>
                            void updateWorkflow(donor.contactId, {
                              status: event.target.value as CultivationStatusKey
                            })
                          }
                          value={donor.status}
                        >
                          {CULTIVATION_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {CULTIVATION_STATUS_META[status].label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="field">
                      <label>
                        Next Follow-up Date
                        <input
                          disabled={busy}
                          onChange={(event) =>
                            void updateWorkflow(donor.contactId, {
                              nextFollowUpAt: event.target.value || null
                            })
                          }
                          type="date"
                          value={toDateInputValue(donor.nextFollowUpAt)}
                        />
                      </label>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="split-grid cultivation-secondary-grid">
        <section className="panel cultivation-section">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Upgrade potential</span>
              <h2 className="section-title">Donors Most Likely to Upgrade</h2>
            </div>
          </div>

          <div className="surface-list cultivation-readonly-list">
            {upgradeCandidates.length === 0 ? (
              <div className="empty-state">No strong upgrade candidates are on deck right now.</div>
            ) : (
              upgradeCandidates.map((donor) => (
                <CultivationReadOnlyRow donor={donor} eyebrow="Upgrade candidate" key={donor.contactId} />
              ))
            )}
          </div>
        </section>

        <section className="panel cultivation-section">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Retention</span>
              <h2 className="section-title">Lapsed / At-Risk Donors</h2>
            </div>
          </div>

          <div className="surface-list cultivation-readonly-list">
            {lapsedDonors.length === 0 ? (
              <div className="empty-state">No lapsed or at-risk donors are currently flagged.</div>
            ) : (
              lapsedDonors.map((donor) => (
                <CultivationReadOnlyRow donor={donor} eyebrow="Retention queue" key={donor.contactId} />
              ))
            )}
          </div>
        </section>
      </section>
    </>
  );
}

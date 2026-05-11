"use client";

import { useState } from "react";

import { ContactSearchSelect } from "@/app/components/contact-search-select";
import { LANE_META, REVIEW_EVENT_TYPES, type ReviewEventTypeKey } from "@/lib/constants";
import type { ContactListItem, ReviewQueueItem } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

const REMOVAL_DELAY_MS = 220;

function getReviewEventType(reviewEventTypeKey?: ReviewEventTypeKey | null) {
  return REVIEW_EVENT_TYPES.find((eventType) => eventType.key === reviewEventTypeKey) ?? null;
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

export function ReviewQueueList({ initialItems }: { initialItems: ReviewQueueItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [removingIds, setRemovingIds] = useState<string[]>([]);
  const [busyActions, setBusyActions] = useState<Record<string, string | null>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [selectedContacts, setSelectedContacts] = useState<Record<string, ContactListItem | null>>({});

  function setBusy(itemId: string, action: string | null) {
    setBusyActions((current) => ({
      ...current,
      [itemId]: action
    }));
  }

  function setError(itemId: string, message: string | null) {
    setErrors((current) => ({
      ...current,
      [itemId]: message
    }));
  }

  function beginRemoval(itemIds: string[]) {
    const uniqueIds = Array.from(new Set(itemIds));

    setRemovingIds((current) => Array.from(new Set([...current, ...uniqueIds])));

    window.setTimeout(() => {
      setItems((current) => current.filter((item) => !uniqueIds.includes(item.id)));
      setRemovingIds((current) => current.filter((itemId) => !uniqueIds.includes(itemId)));
      setBusyActions((current) => {
        const next = { ...current };
        for (const itemId of uniqueIds) {
          delete next[itemId];
        }
        return next;
      });
      setErrors((current) => {
        const next = { ...current };
        for (const itemId of uniqueIds) {
          delete next[itemId];
        }
        return next;
      });
      setSelectedContacts((current) => {
        const next = { ...current };
        for (const itemId of uniqueIds) {
          delete next[itemId];
        }
        return next;
      });
    }, REMOVAL_DELAY_MS);
  }

  async function updateClassification(itemId: string, reviewEventTypeKey: ReviewEventTypeKey) {
    const previousItem = items.find((item) => item.id === itemId);
    const nextType = getReviewEventType(reviewEventTypeKey);

    if (!previousItem || !nextType) {
      return;
    }

    setError(itemId, null);
    setBusy(itemId, "classification");
    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              reviewEventTypeKey,
              laneKey: nextType.laneKey,
              eventKind: nextType.eventKind
            }
          : item
      )
    );

    try {
      const response = await fetch(`/api/review-queue/${itemId}/classification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reviewEventTypeKey
        })
      });

      if (!response.ok) {
        throw new Error(await readJsonError(response, "Could not update the event type."));
      }

      const payload = (await response.json()) as {
        reviewEventTypeKey?: ReviewEventTypeKey;
        laneKey?: ReviewQueueItem["laneKey"];
        eventKind?: string;
      };

      setItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                reviewEventTypeKey: payload.reviewEventTypeKey ?? reviewEventTypeKey,
                laneKey: payload.laneKey ?? nextType.laneKey,
                eventKind: payload.eventKind ?? nextType.eventKind
              }
            : item
        )
      );
    } catch (error) {
      setItems((current) => current.map((item) => (item.id === itemId ? previousItem : item)));
      setError(itemId, error instanceof Error ? error.message : "Could not update the event type.");
    } finally {
      setBusy(itemId, null);
    }
  }

  async function resolveItem(itemId: string, payload: Record<string, unknown>, fallbackError: string) {
    setError(itemId, null);
    setBusy(itemId, payload.createContact ? "create" : payload.contactId ? "assign" : "dismiss");

    try {
      const response = await fetch(`/api/review-queue/${itemId}/${payload.contactId !== undefined || payload.createContact ? "assign" : "dismiss"}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(await readJsonError(response, fallbackError));
      }

      const result = (await response.json()) as {
        resolvedUnmatchedEventIds?: string[];
        dismissedEventId?: string;
      };

      const resolvedIds =
        result.resolvedUnmatchedEventIds && result.resolvedUnmatchedEventIds.length > 0
          ? result.resolvedUnmatchedEventIds
          : result.dismissedEventId
            ? [result.dismissedEventId]
            : [itemId];

      beginRemoval(resolvedIds);
    } catch (error) {
      setBusy(itemId, null);
      setError(itemId, error instanceof Error ? error.message : fallbackError);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">{items.length} pending items</span>
          <h2 className="section-title">Unmatched imports</h2>
        </div>
      </div>

      <div className="surface-list">
        {items.length === 0 ? (
          <div className="empty-state">No unmatched events are waiting for review.</div>
        ) : (
          items.map((item) => {
            const lane = item.laneKey ? LANE_META[item.laneKey] : null;
            const busyAction = busyActions[item.id];
            const isRemoving = removingIds.includes(item.id);
            const isBusy = Boolean(busyAction) || isRemoving;

            return (
              <article
                className={`review-card${isRemoving ? " is-removing" : ""}${isBusy ? " is-busy" : ""}`}
                key={item.id}
              >
                <div className="review-card-layout">
                  <div className="review-card-main">
                    <div className="review-card-top">
                      <div className="review-card-source">
                        <span className="eyebrow">{item.source.replaceAll("_", " ")}</span>
                        {item.sourceAdminUrl ? (
                          <a
                            className="review-card-source-link"
                            href={item.sourceAdminUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {item.sourceAdminLabel ?? "Open source"}
                          </a>
                        ) : null}
                      </div>
                      <span className="review-card-date">{formatDateTime(item.occurredAt)}</span>
                    </div>

                    <div className="review-card-title-row">
                      <h3 className="timeline-title review-card-title">{item.title}</h3>
                      {lane ? (
                        <span
                          className="lane-pill review-card-lane"
                          style={{
                            background: lane.color,
                            color: lane.textColor,
                            borderColor: "transparent"
                          }}
                        >
                          {lane.label}
                        </span>
                      ) : null}
                    </div>

                    <p className="review-card-reason">
                      <strong>Reason</strong>
                      <span>{item.reason}</span>
                    </p>

                    <div className="review-card-meta-row">
                      <span className="form-note review-card-email">
                        Email: <span className="inline-code">{item.candidateEmail ?? "none provided"}</span>
                      </span>
                    </div>

                    {errors[item.id] ? <div className="inline-alert inline-alert-error">{errors[item.id]}</div> : null}

                    <div className="field review-card-classification-field">
                      <label>
                        Event type
                        <select
                          disabled={isBusy}
                          name="reviewEventTypeKey"
                          onChange={(event) =>
                            void updateClassification(item.id, event.target.value as ReviewEventTypeKey)
                          }
                          required
                          value={item.reviewEventTypeKey ?? "OTHER"}
                        >
                          {REVIEW_EVENT_TYPES.map((eventType) => (
                            <option key={eventType.key} value={eventType.key}>
                              {eventType.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <ContactSearchSelect
                      action={`/api/review-queue/${item.id}/assign`}
                      emptyMessage="No contacts matched that email."
                      formClassName="review-card-assign"
                      hiddenName="contactId"
                      initialQuery={item.candidateEmail ?? ""}
                      label="Assign to existing contact"
                      onSelectionChange={(selectedContact) =>
                        setSelectedContacts((current) => {
                          const currentSelection = current[item.id] ?? null;
                          const currentId = currentSelection?.id ?? null;
                          const nextId = selectedContact?.id ?? null;

                          if (currentId === nextId) {
                            return current;
                          }

                          return {
                            ...current,
                            [item.id]: selectedContact
                          };
                        })
                      }
                      onSubmit={(selectedContact: ContactListItem) =>
                        resolveItem(
                          item.id,
                          { contactId: selectedContact.id },
                          "Could not assign the event to that contact."
                        )
                      }
                      placeholder="contact@example.org"
                      showSubmitButton={false}
                      submitLabel={busyAction === "assign" ? "Assigning..." : "Assign"}
                      submitting={busyAction === "assign" || isRemoving}
                    />
                  </div>

                  <aside className="review-card-actions">
                    {selectedContacts[item.id] ? (
                      <button
                        className="button-secondary review-card-action-button"
                        disabled={isBusy}
                        onClick={() =>
                          void resolveItem(
                            item.id,
                            { contactId: selectedContacts[item.id]?.id },
                            "Could not assign the event to that contact."
                          )
                        }
                        type="button"
                      >
                        {busyAction === "assign" ? "Assigning..." : "Assign"}
                      </button>
                    ) : null}
                    <button
                      className="button review-card-action-button"
                      disabled={!item.candidateEmail || isBusy}
                      onClick={() =>
                        void resolveItem(
                          item.id,
                          { createContact: true },
                          "Could not create a contact for that event."
                        )
                      }
                      type="button"
                    >
                      {busyAction === "create" ? "Creating..." : "Create contact"}
                    </button>
                    <button
                      className="button-ghost review-card-action-button"
                      disabled={isBusy}
                      onClick={() =>
                        void resolveItem(
                          item.id,
                          {},
                          "Could not dismiss that event."
                        )
                      }
                      type="button"
                    >
                      {busyAction === "dismiss" ? "Dismissing..." : "Dismiss"}
                    </button>
                  </aside>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

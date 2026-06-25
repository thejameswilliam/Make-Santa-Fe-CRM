"use client";

import { useMemo, useState } from "react";

import { ContactSearchSelect } from "@/app/components/contact-search-select";
import {
  findReviewEventType,
  LANE_META,
  REVIEW_EVENT_TYPES,
  SOURCE_LABELS,
  type ReviewEventTypeKey
} from "@/lib/constants";
import type {
  ContactListItem,
  ReviewQueueInteractionTypeOption,
  ReviewQueueItem
} from "@/lib/types";
import { formatDateTime, getCurrentDateTimeInputValue } from "@/lib/utils";

const REMOVAL_DELAY_MS = 220;

function getReviewEventType(reviewEventTypeKey?: ReviewEventTypeKey | null) {
  return REVIEW_EVENT_TYPES.find((eventType) => eventType.key === reviewEventTypeKey) ?? null;
}

function getReviewTypeKeyForInteractionType(option: ReviewQueueInteractionTypeOption) {
  return findReviewEventType(option.slug, option.laneKey)?.key ?? null;
}

function buildDefaultOccurredAtValue() {
  return getCurrentDateTimeInputValue();
}

function createInitialDraft(interactionTypeOptions: ReviewQueueInteractionTypeOption[]) {
  const defaultInteractionTypeId =
    interactionTypeOptions.find((option) => option.slug === "donation")?.id ??
    interactionTypeOptions[0]?.id ??
    "";

  return {
    interactionTypeId: defaultInteractionTypeId,
    occurredAt: buildDefaultOccurredAtValue(),
    title: "",
    body: "",
    amountValue: "",
    fullName: "",
    email: "",
    phone: "",
    address: ""
  };
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

function canCreateContact(item: ReviewQueueItem) {
  return Boolean(item.candidateEmail || item.fullName || item.phone || item.address);
}

export function ReviewQueueList({
  initialItems,
  interactionTypeOptions
}: {
  initialItems: ReviewQueueItem[];
  interactionTypeOptions: ReviewQueueInteractionTypeOption[];
}) {
  const [items, setItems] = useState(initialItems);
  const [draft, setDraft] = useState(() => createInitialDraft(interactionTypeOptions));
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [removingIds, setRemovingIds] = useState<string[]>([]);
  const [busyActions, setBusyActions] = useState<Record<string, string | null>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [selectedContacts, setSelectedContacts] = useState<Record<string, ContactListItem | null>>({});

  const selectedDraftType = useMemo(
    () =>
      interactionTypeOptions.find((option) => option.id === draft.interactionTypeId) ??
      interactionTypeOptions[0] ??
      null,
    [draft.interactionTypeId, interactionTypeOptions]
  );

  const showDraftAmount = selectedDraftType?.slug === "donation";

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

  async function createQueueItem() {
    setCreateError(null);
    setCreating(true);

    try {
      const response = await fetch("/api/review-queue/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          interactionTypeId: draft.interactionTypeId,
          occurredAt: draft.occurredAt,
          title: draft.title,
          body: draft.body || null,
          amountValue: showDraftAmount ? draft.amountValue : null,
          fullName: draft.fullName || null,
          email: draft.email || null,
          phone: draft.phone || null,
          address: draft.address || null
        })
      });

      if (!response.ok) {
        throw new Error(await readJsonError(response, "Could not add that unattached interaction."));
      }

      const payload = (await response.json()) as { item?: ReviewQueueItem };
      const createdItem = payload.item ?? null;
      if (!createdItem) {
        throw new Error("The queue item was created, but no item was returned.");
      }

      setItems((current) => [createdItem, ...current]);
      setDraft(createInitialDraft(interactionTypeOptions));
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Could not add that unattached interaction.");
    } finally {
      setCreating(false);
    }
  }

  async function updateImportedClassification(itemId: string, reviewEventTypeKey: ReviewEventTypeKey) {
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

  async function updateManualInteractionType(itemId: string, manualInteractionTypeId: string) {
    const previousItem = items.find((item) => item.id === itemId);
    const nextType = interactionTypeOptions.find((option) => option.id === manualInteractionTypeId) ?? null;

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
              laneKey: nextType.laneKey,
              eventKind: nextType.slug,
              manualInteractionTypeId: nextType.id,
              manualInteractionTypeName: nextType.name,
              manualInteractionTypeSlug: nextType.slug,
              reviewEventTypeKey: getReviewTypeKeyForInteractionType(nextType)
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
          manualInteractionTypeId
        })
      });

      if (!response.ok) {
        throw new Error(await readJsonError(response, "Could not update the interaction type."));
      }

      const payload = (await response.json()) as {
        laneKey?: ReviewQueueItem["laneKey"];
        eventKind?: string;
        manualInteractionTypeId?: string | null;
        manualInteractionTypeName?: string | null;
        manualInteractionTypeSlug?: string | null;
      };

      setItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                laneKey: payload.laneKey ?? nextType.laneKey,
                eventKind: payload.eventKind ?? nextType.slug,
                manualInteractionTypeId: payload.manualInteractionTypeId ?? nextType.id,
                manualInteractionTypeName: payload.manualInteractionTypeName ?? nextType.name,
                manualInteractionTypeSlug: payload.manualInteractionTypeSlug ?? nextType.slug,
                reviewEventTypeKey: getReviewTypeKeyForInteractionType(nextType)
              }
            : item
        )
      );
    } catch (error) {
      setItems((current) => current.map((item) => (item.id === itemId ? previousItem : item)));
      setError(itemId, error instanceof Error ? error.message : "Could not update the interaction type.");
    } finally {
      setBusy(itemId, null);
    }
  }

  async function resolveItem(itemId: string, payload: Record<string, unknown>, fallbackError: string) {
    setError(itemId, null);
    setBusy(itemId, payload.createContact ? "create" : payload.contactId ? "assign" : "dismiss");

    try {
      const response = await fetch(
        `/api/review-queue/${itemId}/${payload.contactId !== undefined || payload.createContact ? "assign" : "dismiss"}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

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
    <>
      <section className="panel review-intake-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Donation Review</span>
            <h2 className="section-title">Add unattached interaction</h2>
          </div>
        </div>

        <p className="helper-copy-compact">
          Add donations or other manual interactions here when they should enter the CRM before they are attached to
          a person record.
        </p>

        <form
          className="review-intake-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createQueueItem();
          }}
        >
          <div className="field-grid review-intake-grid">
            <div className="field">
              <label>
                Interaction type
                <select
                  disabled={creating}
                  name="interactionTypeId"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      interactionTypeId: event.target.value
                    }))
                  }
                  required
                  value={draft.interactionTypeId}
                >
                  {interactionTypeOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="field">
              <label>
                Date and time
                <input
                  disabled={creating}
                  name="occurredAt"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      occurredAt: event.target.value
                    }))
                  }
                  required
                  type="datetime-local"
                  value={draft.occurredAt}
                />
              </label>
            </div>

            {showDraftAmount ? (
              <div className="field">
                <label>
                  Donation amount
                  <input
                    disabled={creating}
                    inputMode="decimal"
                    min="0"
                    name="amountValue"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        amountValue: event.target.value
                      }))
                    }
                    placeholder="75.00"
                    required
                    step="0.01"
                    type="number"
                    value={draft.amountValue}
                  />
                </label>
              </div>
            ) : null}
          </div>

          <div className="field">
            <label>
              Title
              <input
                disabled={creating}
                name="title"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value
                  }))
                }
                placeholder={selectedDraftType?.slug === "donation" ? "Cash donation at front desk" : "Staff follow-up note"}
                required
                value={draft.title}
              />
            </label>
          </div>

          <div className="field">
            <label>
              Details
              <textarea
                disabled={creating}
                name="body"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    body: event.target.value
                  }))
                }
                placeholder="Add context staff should see later."
                value={draft.body}
              />
            </label>
          </div>

          <div className="field-grid review-intake-grid">
            <div className="field">
              <label>
                Full name
                <input
                  disabled={creating}
                  name="fullName"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      fullName: event.target.value
                    }))
                  }
                  placeholder="Pat Doe"
                  value={draft.fullName}
                />
              </label>
            </div>

            <div className="field">
              <label>
                Email
                <input
                  autoComplete="email"
                  disabled={creating}
                  name="email"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      email: event.target.value
                    }))
                  }
                  placeholder="pat@example.org"
                  type="email"
                  value={draft.email}
                />
              </label>
            </div>

            <div className="field">
              <label>
                Phone
                <input
                  autoComplete="tel"
                  disabled={creating}
                  name="phone"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      phone: event.target.value
                    }))
                  }
                  placeholder="505-555-0199"
                  value={draft.phone}
                />
              </label>
            </div>

            <div className="field">
              <label>
                Address
                <input
                  autoComplete="street-address"
                  disabled={creating}
                  name="address"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      address: event.target.value
                    }))
                  }
                  placeholder="123 Example St"
                  value={draft.address}
                />
              </label>
            </div>
          </div>

          {createError ? <div className="inline-alert inline-alert-error">{createError}</div> : null}

          <div className="create-contact-actions review-intake-actions">
            <p className="form-note">This creates an unattached queue item. You can assign or create the contact later.</p>
            <button className="button" disabled={creating || !draft.interactionTypeId} type="submit">
              {creating ? "Adding..." : "Add to donation review"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">{items.length} pending items</span>
            <h2 className="section-title">Unattached interactions</h2>
          </div>
        </div>

        <div className="surface-list">
          {items.length === 0 ? (
            <div className="empty-state">No unattached interactions are waiting for review.</div>
          ) : (
            items.map((item) => {
              const lane = item.laneKey ? LANE_META[item.laneKey] : null;
              const busyAction = busyActions[item.id];
              const isRemoving = removingIds.includes(item.id);
              const isBusy = Boolean(busyAction) || isRemoving;
              const isManual = item.source === "MANUAL";
              const canCreate = canCreateContact(item);

              return (
                <article
                  className={`review-card${isRemoving ? " is-removing" : ""}${isBusy ? " is-busy" : ""}`}
                  key={item.id}
                >
                  <div className="review-card-layout">
                    <div className="review-card-main">
                      <div className="review-card-top">
                        <div className="review-card-source">
                          <span className="eyebrow">{SOURCE_LABELS[item.source]}</span>
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
                        <div className="review-card-title-pills">
                          {item.amountLabel ? <span className="status-pill review-card-amount">{item.amountLabel}</span> : null}
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
                      </div>

                      {item.summary ? <p className="muted review-card-summary">{item.summary}</p> : null}

                      <p className="review-card-reason">
                        <strong>Reason</strong>
                        <span>{item.reason}</span>
                      </p>

                      <div className="review-card-meta-row">
                        {item.fullName ? (
                          <span className="form-note review-card-meta-item">
                            Name: <span className="inline-code">{item.fullName}</span>
                          </span>
                        ) : null}
                        {item.candidateEmail ? (
                          <span className="form-note review-card-meta-item">
                            Email: <span className="inline-code">{item.candidateEmail}</span>
                          </span>
                        ) : null}
                        {item.phone ? (
                          <span className="form-note review-card-meta-item">
                            Phone: <span className="inline-code">{item.phone}</span>
                          </span>
                        ) : null}
                        {item.address ? (
                          <span className="form-note review-card-meta-item">
                            Address: <span className="inline-code">{item.address}</span>
                          </span>
                        ) : null}
                        {!item.fullName && !item.candidateEmail && !item.phone && !item.address ? (
                          <span className="form-note review-card-meta-item">No identity hints provided yet.</span>
                        ) : null}
                      </div>

                      {errors[item.id] ? <div className="inline-alert inline-alert-error">{errors[item.id]}</div> : null}

                      <div className="field review-card-classification-field">
                        <label>
                          {isManual ? "Interaction type" : "Event type"}
                          <select
                            disabled={isBusy}
                            name={isManual ? "manualInteractionTypeId" : "reviewEventTypeKey"}
                            onChange={(event) =>
                              isManual
                                ? void updateManualInteractionType(item.id, event.target.value)
                                : void updateImportedClassification(item.id, event.target.value as ReviewEventTypeKey)
                            }
                            required
                            value={
                              isManual
                                ? item.manualInteractionTypeId ?? interactionTypeOptions[0]?.id ?? ""
                                : item.reviewEventTypeKey ?? "OTHER"
                            }
                          >
                            {isManual
                              ? interactionTypeOptions.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.name}
                                  </option>
                                ))
                              : REVIEW_EVENT_TYPES.map((eventType) => (
                                  <option key={eventType.key} value={eventType.key}>
                                    {eventType.label}
                                  </option>
                                ))}
                          </select>
                        </label>
                      </div>

                      <ContactSearchSelect
                        action={`/api/review-queue/${item.id}/assign`}
                        emptyMessage="No contacts matched that search."
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
                        disabled={!canCreate || isBusy}
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
                        onClick={() => void resolveItem(item.id, {}, "Could not dismiss that event.")}
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
    </>
  );
}

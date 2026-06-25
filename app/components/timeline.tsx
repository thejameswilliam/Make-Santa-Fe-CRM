"use client";

import { useEffect, useState } from "react";

import {
  findReviewEventType,
  findReviewEventTypeByKey,
  LANE_META,
  REVIEW_EVENT_TYPES,
  SOURCE_LABELS,
  type LaneKey
} from "@/lib/constants";
import { buildTimelineLayout } from "@/lib/timeline-layout";
import type { TimelineEntry } from "@/lib/types";
import { formatDateTime, formatDateTimeInputValue } from "@/lib/utils";

interface ManualInteractionTypeOption {
  id: string;
  name: string;
  slug: string;
  laneKey: LaneKey;
}

interface TimelineProps {
  entries: TimelineEntry[];
  editable?: boolean;
  manualInteractionTypeOptions?: ManualInteractionTypeOption[];
}

function buildLaneLabelOffsets(height: number) {
  const offsets = [72];
  let nextOffset = 420;

  while (nextOffset < height - 80) {
    offsets.push(nextOffset);
    nextOffset += 420;
  }

  return offsets;
}

function collectLaneKeys(entries: TimelineEntry[]) {
  const seen = new Set(entries.map((entry) => entry.laneKey));
  return (Object.keys(LANE_META) as LaneKey[]).filter((laneKey) => seen.has(laneKey));
}

function formatDateTimeLocalInput(value: string) {
  try {
    return formatDateTimeInputValue(value);
  } catch {
    return "";
  }
}

function buildManualTitlePlaceholder(slug?: string | null) {
  if (slug === "donation") {
    return "Cash donation at front desk";
  }

  if (slug === "membership_complimentary") {
    return "Complimentary membership granted";
  }

  if (slug?.startsWith("membership_")) {
    return "Membership status updated";
  }

  return "Volunteer orientation attended";
}

export function Timeline({
  entries,
  editable = false,
  manualInteractionTypeOptions = []
}: TimelineProps) {
  const [hoveredEntryId, setHoveredEntryId] = useState<string | null>(null);
  const [localEntries, setLocalEntries] = useState(entries);
  const [selectedLaneKeys, setSelectedLaneKeys] = useState<LaneKey[]>(collectLaneKeys(entries));
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    interactionTypeId: string;
    occurredAt: string;
    title: string;
    body: string;
    amountValue: string;
  } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setLocalEntries(entries);
  }, [entries]);

  useEffect(() => {
    if (!editingEntryId) {
      return;
    }

    if (!localEntries.some((entry) => entry.id === editingEntryId && entry.recordType === "MANUAL")) {
      setEditingEntryId(null);
      setEditDraft(null);
    }
  }, [editingEntryId, localEntries]);

  const availableLaneKeys = collectLaneKeys(localEntries);
  const availableLaneSignature = availableLaneKeys.join("|");

  useEffect(() => {
    setSelectedLaneKeys((current) => {
      const preserved = current.filter((laneKey) => availableLaneKeys.includes(laneKey));

      if (preserved.length > 0) {
        return preserved;
      }

      return availableLaneKeys;
    });
  }, [availableLaneSignature]);

  if (localEntries.length === 0) {
    return <div className="empty-state">No timeline events yet. Imported interactions and manual notes will appear here.</div>;
  }

  const filteredEntries = localEntries.filter((entry) => selectedLaneKeys.includes(entry.laneKey));
  const layout = buildTimelineLayout(filteredEntries);
  const laneLabelOffsets = buildLaneLabelOffsets(layout.height);

  function showAllLanes() {
    setSelectedLaneKeys(availableLaneKeys);
  }

  function toggleLane(laneKey: LaneKey) {
    setSelectedLaneKeys((current) => {
      if (current.includes(laneKey)) {
        if (current.length === 1) {
          return current;
        }

        return current.filter((value) => value !== laneKey);
      }

      return collectLaneKeys(
        localEntries.filter((entry) => current.includes(entry.laneKey) || entry.laneKey === laneKey)
      );
    });
  }

  async function readErrorMessage(response: Response, fallback: string) {
    try {
      const payload = (await response.json()) as { error?: unknown };
      if (typeof payload.error === "string" && payload.error.trim()) {
        return payload.error;
      }
    } catch {}

    return fallback;
  }

  async function updateImportedClassification(entryId: string, reviewEventTypeKey: string) {
    const nextType = findReviewEventTypeByKey(reviewEventTypeKey);
    const previousEntry = localEntries.find((entry) => entry.id === entryId);

    if (!nextType || !previousEntry) {
      return;
    }

    setSaveError(null);
    setSavingEntryId(entryId);
    setLocalEntries((current) =>
      current.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              eventKind: nextType.eventKind,
              laneKey: nextType.laneKey,
              typeLabel: nextType.label
            }
          : entry
      )
    );

    try {
      const response = await fetch(`/api/timeline-events/${entryId}/classification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reviewEventTypeKey
        })
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Could not update the interaction type."));
      }

      const result = (await response.json()) as {
        eventKind?: string;
        laneKey?: LaneKey;
        typeLabel?: string;
      };

      if (!result.eventKind || !result.laneKey || !result.typeLabel) {
        throw new Error("The updated interaction type response was incomplete.");
      }

      setLocalEntries((current) =>
        current.map((entry) =>
          entry.id === entryId
            ? {
                ...entry,
                eventKind: result.eventKind ?? nextType.eventKind,
                laneKey: result.laneKey ?? nextType.laneKey,
                typeLabel: result.typeLabel ?? nextType.label
              }
            : entry
        )
      );
    } catch (error) {
      setLocalEntries((current) => current.map((entry) => (entry.id === entryId ? previousEntry : entry)));
      setSaveError(error instanceof Error ? error.message : "Could not update the interaction type.");
    } finally {
      setSavingEntryId((current) => (current === entryId ? null : current));
    }
  }

  function beginManualEdit(entry: TimelineEntry) {
    setSaveError(null);
    setEditingEntryId(entry.id);
    setEditDraft({
      interactionTypeId:
        entry.manualInteractionTypeId ?? manualInteractionTypeOptions[0]?.id ?? "",
      occurredAt: formatDateTimeLocalInput(entry.occurredAt),
      title: entry.title,
      body: entry.summary ?? "",
      amountValue: entry.manualAmountValue ?? ""
    });
  }

  function cancelManualEdit() {
    setEditingEntryId(null);
    setEditDraft(null);
    setSaveError(null);
  }

  async function updateManualEntry(entryId: string) {
    if (!editDraft) {
      return;
    }

    setSaveError(null);
    setSavingEntryId(entryId);

    try {
      const response = await fetch(`/api/manual-interactions/${entryId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(editDraft)
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Could not update the manual interaction."));
      }

      const result = (await response.json()) as {
        id?: string;
        eventKind?: string;
        laneKey?: LaneKey;
        typeLabel?: string;
        title?: string;
        summary?: string | null;
        occurredAt?: string;
        amountLabel?: string | null;
        manualInteractionTypeId?: string;
        manualAmountValue?: string | null;
        editedAt?: string | null;
        editedByName?: string | null;
      };

      setLocalEntries((current) =>
        current.map((entry) =>
          entry.id === entryId
            ? {
                ...entry,
                eventKind: result.eventKind ?? entry.eventKind,
                laneKey: result.laneKey ?? entry.laneKey,
                typeLabel: result.typeLabel ?? entry.typeLabel,
                title: result.title ?? entry.title,
                summary: result.summary ?? null,
                occurredAt: result.occurredAt ?? entry.occurredAt,
                amountLabel: result.amountLabel ?? null,
                manualInteractionTypeId: result.manualInteractionTypeId ?? entry.manualInteractionTypeId,
                manualAmountValue: result.manualAmountValue ?? null,
                editedAt: result.editedAt ?? null,
                editedByName: result.editedByName ?? null
              }
            : entry
        )
      );
      setEditingEntryId(null);
      setEditDraft(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not update the manual interaction.");
    } finally {
      setSavingEntryId((current) => (current === entryId ? null : current));
    }
  }

  return (
    <div className="timeline-wrap">
      {saveError ? <div className="inline-alert inline-alert-error">{saveError}</div> : null}

      <div className="timeline-filter-bar">
        <button
          className={`timeline-filter-pill${selectedLaneKeys.length === availableLaneKeys.length ? " is-active" : ""}`}
          onClick={showAllLanes}
          type="button"
        >
          All lanes
        </button>

        {availableLaneKeys.map((laneKey) => {
          const lane = LANE_META[laneKey];
          const active = selectedLaneKeys.includes(laneKey);

          return (
            <button
              className={`timeline-filter-pill${active ? " is-active" : ""}`}
              key={laneKey}
              onClick={() => toggleLane(laneKey)}
              style={{
                ["--lane-color" as string]: lane.color,
                ["--lane-text-color" as string]: lane.textColor
              }}
              type="button"
            >
              {lane.label}
            </button>
          );
        })}
      </div>

      {filteredEntries.length === 0 ? (
        <div className="empty-state">No timeline events match the selected lanes.</div>
      ) : null}

      {filteredEntries.length > 0 ? (
        <div className="timeline-scale">
          <div className="timeline-scale-body" style={{ height: `${layout.height}px` }}>
            <div className="timeline-scale-axis">
              {layout.ticks.map((tick) => (
                <div className="timeline-scale-tick" key={`${tick.label}-${tick.y}`} style={{ top: `${tick.y}px` }}>
                  <span className="timeline-scale-tick-label">{tick.label}</span>
                </div>
              ))}
            </div>

            <div className="timeline-scale-main">
              <div className="timeline-scale-lanes" style={{ ["--lane-count" as string]: String(layout.lanes.length) }}>
                {layout.lanes.map((laneKey) => {
                  const lane = LANE_META[laneKey];
                  const laneItems = layout.items.filter((item) => item.entry.laneKey === laneKey);
                  const laneSegments = layout.laneSegments.filter((segment) => segment.laneKey === laneKey);

                  return (
                    <div className="timeline-scale-lane-column" key={laneKey}>
                      {laneLabelOffsets.map((offset, index) => (
                        <span
                          className="timeline-lane-inline-label"
                          key={`${laneKey}-inline-label-${index}`}
                          style={{
                            top: `${offset}px`,
                            ["--lane-color" as string]: lane.color,
                            ["--lane-text-color" as string]: lane.textColor
                          }}
                        >
                          {lane.label}
                        </span>
                      ))}

                      {layout.ticks.map((tick) => (
                        <span className="timeline-scale-guide" key={`${laneKey}-${tick.label}-${tick.y}`} style={{ top: `${tick.y}px` }} />
                      ))}

                      <span className="timeline-scale-lane-track" />

                      {laneSegments.map((segment, index) => (
                        <span
                          className="timeline-scale-segment"
                          key={`${laneKey}-segment-${index}`}
                          style={{
                            top: `${segment.top}px`,
                            height: `${segment.height}px`,
                            background: lane.color,
                            color: lane.color
                          }}
                        />
                      ))}

                      {laneItems.map((item) => (
                        <span
                          className={`timeline-node timeline-node-scale${hoveredEntryId === item.entry.id ? " is-active" : ""}`}
                          key={item.entry.id}
                          onMouseEnter={() => setHoveredEntryId(item.entry.id)}
                          onMouseLeave={() => setHoveredEntryId((current) => (current === item.entry.id ? null : current))}
                          aria-hidden="true"
                          style={{
                            top: `${item.y}px`,
                            background: lane.color,
                            ["--lane-color" as string]: lane.color
                          }}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>

              <div className="timeline-scale-cards">
                {layout.items.map((item) => {
                  const lane = LANE_META[item.entry.laneKey];
                  const laneIndex = layout.lanes.indexOf(item.entry.laneKey);
                  const laneCenterPercent = ((laneIndex + 0.5) / Math.max(layout.lanes.length, 1)) * 50;
                  const activeEditDraft =
                    item.entry.recordType === "MANUAL" && editingEntryId === item.entry.id ? editDraft : null;
                  const isEditingManualEntry = !!activeEditDraft;
                  const selectedEditType = activeEditDraft
                    ? manualInteractionTypeOptions.find((option) => option.id === activeEditDraft.interactionTypeId) ?? null
                    : null;
                  const showDonationAmount = selectedEditType?.slug === "donation";
                  const titlePlaceholder = buildManualTitlePlaceholder(selectedEditType?.slug);

                  return (
                    <article
                      className={`timeline-scale-entry${hoveredEntryId === item.entry.id ? " is-active" : ""}`}
                      key={item.entry.id}
                      onMouseEnter={() => setHoveredEntryId(item.entry.id)}
                      onMouseLeave={() => setHoveredEntryId((current) => (current === item.entry.id ? null : current))}
                      style={{
                        top: `${item.y}px`,
                        ["--lane-color" as string]: lane.color,
                        ["--lane-text-color" as string]: lane.textColor,
                        ["--lane-center-percent" as string]: String(laneCenterPercent),
                        ["--card-start-percent" as string]: "56"
                      }}
                    >
                      <span className={`timeline-card-connector${hoveredEntryId === item.entry.id ? " is-active" : ""}`} aria-hidden="true" />
                      <div className="timeline-card">
                        <div className="stack-tight timeline-card-stack">
                          <div className="row-between timeline-card-heading">
                            <span className="timeline-card-stamp">{formatDateTime(item.entry.occurredAt)}</span>
                            {item.entry.amountLabel ? <span className="timeline-amount">{item.entry.amountLabel}</span> : null}
                          </div>

                          <h4 className="timeline-title">
                            {activeEditDraft ? activeEditDraft.title || item.entry.title : item.entry.title}
                          </h4>

                          <div className="timeline-meta">
                            {editable ? (
                              item.entry.recordType === "MANUAL" ? (
                                isEditingManualEntry ? (
                                  <span>{selectedEditType?.name ?? item.entry.typeLabel}</span>
                                ) : (
                                  <>
                                    <span>{item.entry.typeLabel}</span>
                                    <span className="timeline-inline-actions">
                                      <button
                                        className="timeline-inline-edit-button"
                                        disabled={savingEntryId === item.entry.id}
                                        onClick={() => beginManualEdit(item.entry)}
                                        type="button"
                                      >
                                        Edit
                                      </button>
                                    </span>
                                  </>
                                )
                              ) : (
                                <label
                                  className="timeline-type-select"
                                  data-saving={savingEntryId === item.entry.id ? "true" : "false"}
                                >
                                  <select
                                    aria-label={`Interaction type for ${item.entry.title}`}
                                    disabled={savingEntryId === item.entry.id}
                                    onChange={(event) =>
                                      void updateImportedClassification(item.entry.id, event.target.value)
                                    }
                                    value={findReviewEventType(item.entry.eventKind, item.entry.laneKey)?.key ?? "OTHER"}
                                  >
                                    {REVIEW_EVENT_TYPES.map((option) => (
                                      <option key={option.key} value={option.key}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              )
                            ) : (
                              <span>{item.entry.typeLabel}</span>
                            )}
                            <span className="timeline-meta-source">
                              {savingEntryId === item.entry.id ? "Saving..." : SOURCE_LABELS[item.entry.source]}
                            </span>
                            {item.entry.sourceAdminUrl ? (
                              <a
                                className="timeline-source-link"
                                href={item.entry.sourceAdminUrl}
                                rel="noreferrer"
                                target="_blank"
                              >
                                {item.entry.sourceAdminLabel ?? "Open source"}
                              </a>
                            ) : null}
                          </div>
                        </div>

                        {activeEditDraft ? (
                          <form
                            className="timeline-edit-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void updateManualEntry(item.entry.id);
                            }}
                          >
                            <div className="timeline-edit-grid">
                              <div className="field">
                                <label>
                                  Interaction type
                                  <select
                                    disabled={savingEntryId === item.entry.id || manualInteractionTypeOptions.length === 0}
                                    onChange={(event) =>
                                      setEditDraft((current) =>
                                        current
                                          ? {
                                              ...current,
                                              interactionTypeId: event.target.value
                                            }
                                          : current
                                      )
                                    }
                                    required
                                    value={activeEditDraft.interactionTypeId}
                                  >
                                    {manualInteractionTypeOptions.map((option) => (
                                      <option key={option.id} value={option.id}>
                                        {option.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>

                              {showDonationAmount ? (
                                <div className="field">
                                  <label>
                                    Donation amount
                                    <input
                                      disabled={savingEntryId === item.entry.id}
                                      inputMode="decimal"
                                      min="0"
                                      onChange={(event) =>
                                        setEditDraft((current) =>
                                          current
                                            ? {
                                                ...current,
                                                amountValue: event.target.value
                                              }
                                            : current
                                      )
                                    }
                                    placeholder="75.00"
                                    required
                                    step="0.01"
                                    type="number"
                                    value={activeEditDraft.amountValue}
                                  />
                                </label>
                              </div>
                              ) : null}

                              <div className="field">
                                <label>
                                  Date and time
                                  <input
                                    disabled={savingEntryId === item.entry.id}
                                    onChange={(event) =>
                                      setEditDraft((current) =>
                                        current
                                          ? {
                                              ...current,
                                              occurredAt: event.target.value
                                            }
                                          : current
                                      )
                                    }
                                    required
                                    type="datetime-local"
                                    value={activeEditDraft.occurredAt}
                                  />
                                </label>
                              </div>

                              <div className="field">
                                <label>
                                  Title
                                  <input
                                    disabled={savingEntryId === item.entry.id}
                                    onChange={(event) =>
                                      setEditDraft((current) =>
                                        current
                                          ? {
                                              ...current,
                                              title: event.target.value
                                            }
                                          : current
                                      )
                                    }
                                    placeholder={titlePlaceholder}
                                    required
                                    value={activeEditDraft.title}
                                  />
                                </label>
                              </div>
                            </div>

                            <div className="field">
                              <label>
                                Details
                                <textarea
                                  disabled={savingEntryId === item.entry.id}
                                  onChange={(event) =>
                                    setEditDraft((current) =>
                                      current
                                        ? {
                                            ...current,
                                            body: event.target.value
                                          }
                                        : current
                                    )
                                  }
                                  placeholder="Add the context staff should see later."
                                  value={activeEditDraft.body}
                                />
                              </label>
                            </div>

                            <div className="timeline-edit-actions">
                              <button
                                className="button-secondary"
                                disabled={savingEntryId === item.entry.id}
                                type="submit"
                              >
                                {savingEntryId === item.entry.id ? "Saving..." : "Save changes"}
                              </button>
                              <button
                                className="button-ghost"
                                disabled={savingEntryId === item.entry.id}
                                onClick={cancelManualEdit}
                                type="button"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : (
                          <>
                            {item.entry.summary ? <p className="timeline-summary muted">{item.entry.summary}</p> : null}
                            {item.entry.recordType === "MANUAL" && item.entry.editedAt ? (
                              <p className="timeline-edited-stamp">
                                Edited by {item.entry.editedByName || "Staff"} · {formatDateTime(item.entry.editedAt)}
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

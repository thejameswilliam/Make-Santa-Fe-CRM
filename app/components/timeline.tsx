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
import { formatDateTime } from "@/lib/utils";

interface ManualInteractionTypeOption {
  id: string;
  name: string;
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

export function Timeline({
  entries,
  editable = false,
  manualInteractionTypeOptions = []
}: TimelineProps) {
  const [hoveredEntryId, setHoveredEntryId] = useState<string | null>(null);
  const [localEntries, setLocalEntries] = useState(entries);
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setLocalEntries(entries);
  }, [entries]);

  if (localEntries.length === 0) {
    return <div className="empty-state">No timeline events yet. Imported interactions and manual notes will appear here.</div>;
  }

  const layout = buildTimelineLayout(localEntries);
  const laneLabelOffsets = buildLaneLabelOffsets(layout.height);

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

  async function updateManualClassification(entryId: string, interactionTypeId: string) {
    const nextType = manualInteractionTypeOptions.find((option) => option.id === interactionTypeId);
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
              laneKey: nextType.laneKey,
              typeLabel: nextType.name,
              manualInteractionTypeId: nextType.id
            }
          : entry
      )
    );

    try {
      const response = await fetch(`/api/manual-interactions/${entryId}/type`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          interactionTypeId
        })
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Could not update the interaction type."));
      }

      const result = (await response.json()) as {
        eventKind?: string;
        laneKey?: LaneKey;
        typeLabel?: string;
        manualInteractionTypeId?: string;
      };

      if (!result.laneKey || !result.typeLabel || !result.manualInteractionTypeId) {
        throw new Error("The updated interaction type response was incomplete.");
      }

      setLocalEntries((current) =>
        current.map((entry) =>
          entry.id === entryId
            ? {
                ...entry,
                eventKind: result.eventKind ?? entry.eventKind,
                laneKey: result.laneKey ?? nextType.laneKey,
                typeLabel: result.typeLabel ?? nextType.name,
                manualInteractionTypeId: result.manualInteractionTypeId ?? nextType.id
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

  return (
    <div className="timeline-wrap">
      {saveError ? <div className="inline-alert inline-alert-error">{saveError}</div> : null}

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

                        <h4 className="timeline-title">{item.entry.title}</h4>

                        <div className="timeline-meta">
                          {editable ? (
                            item.entry.recordType === "MANUAL" ? (
                              <label
                                className="timeline-type-select"
                                data-saving={savingEntryId === item.entry.id ? "true" : "false"}
                              >
                                <select
                                  aria-label={`Interaction type for ${item.entry.title}`}
                                  disabled={
                                    savingEntryId === item.entry.id ||
                                    manualInteractionTypeOptions.length === 0
                                  }
                                  onChange={(event) =>
                                    void updateManualClassification(item.entry.id, event.target.value)
                                  }
                                  value={item.entry.manualInteractionTypeId ?? ""}
                                >
                                  {manualInteractionTypeOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                      {option.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
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

                      {item.entry.summary ? <p className="timeline-summary muted">{item.entry.summary}</p> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

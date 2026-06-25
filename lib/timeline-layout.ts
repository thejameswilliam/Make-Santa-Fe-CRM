import { LANE_META, type LaneKey } from "@/lib/constants";
import type { TimelineEntry } from "@/lib/types";
import {
  addCrmDays,
  addCrmMonths,
  formatInCrmTimeZone,
  startOfCrmDay,
  startOfCrmMonth
} from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_PADDING = 40;
const BOTTOM_PADDING = 64;
const MIN_EVENT_GAP = 108;

export interface TimelineLayoutItem {
  entry: TimelineEntry;
  y: number;
  idealY: number;
  timestampMs: number;
}

export interface TimelineLaneSegment {
  laneKey: LaneKey;
  top: number;
  height: number;
}

export interface TimelineTick {
  label: string;
  y: number;
}

export interface TimelineLayout {
  lanes: LaneKey[];
  items: TimelineLayoutItem[];
  laneSegments: TimelineLaneSegment[];
  ticks: TimelineTick[];
  height: number;
}

function isMembershipActivatingEvent(eventKind: string) {
  return [
    "membership_active",
    "membership_complimentary",
    "membership_payment"
  ].includes(eventKind);
}

function isMembershipTerminatingEvent(eventKind: string) {
  return [
    "membership_paused",
    "membership_cancelled",
    "membership_expired"
  ].includes(eventKind);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function collectLanes(entries: TimelineEntry[]) {
  const seen = new Set(entries.map((entry) => entry.laneKey));
  return Object.keys(LANE_META).filter((lane) => seen.has(lane as LaneKey)) as LaneKey[];
}

function getPixelsPerDay(spanDays: number) {
  if (spanDays <= 45) {
    return 20;
  }

  if (spanDays <= 120) {
    return 11;
  }

  if (spanDays <= 365) {
    return 6;
  }

  if (spanDays <= 730) {
    return 3.5;
  }

  return 2.1;
}

function positionForTimestamp(timestampMs: number, newestTimestampMs: number, spanMs: number, height: number) {
  const usableHeight = Math.max(height - TOP_PADDING - BOTTOM_PADDING, 1);
  const ratio = spanMs > 0 ? (newestTimestampMs - timestampMs) / spanMs : 0;
  return TOP_PADDING + ratio * usableHeight;
}

function computePositionedItems(
  entries: TimelineEntry[],
  newestTimestampMs: number,
  spanMs: number,
  height: number
): TimelineLayoutItem[] {
  let previousY = TOP_PADDING - MIN_EVENT_GAP;

  return entries.map((entry) => {
    const timestampMs = new Date(entry.occurredAt).getTime();
    const idealY = positionForTimestamp(timestampMs, newestTimestampMs, spanMs, height);
    const y = Math.max(idealY, previousY + MIN_EVENT_GAP);

    previousY = y;

    return {
      entry,
      y,
      idealY,
      timestampMs
    };
  });
}

function formatTickLabel(date: Date, monthOnly = false) {
  return formatInCrmTimeZone(date, monthOnly ? { month: "short", year: "numeric" } : { month: "short", day: "numeric" });
}

function buildTicks(newestTimestampMs: number, oldestTimestampMs: number, spanMs: number, height: number) {
  const spanDays = spanMs / DAY_MS;
  const ticks: TimelineTick[] = [];
  const seen = new Set<number>();

  const pushTick = (timestampMs: number, label: string) => {
    const rounded = Math.round(timestampMs);
    if (seen.has(rounded)) {
      return;
    }

    seen.add(rounded);
    ticks.push({
      label,
      y: positionForTimestamp(timestampMs, newestTimestampMs, spanMs, height)
    });
  };

  if (spanDays <= 120) {
    const stepDays = spanDays <= 30 ? 7 : 14;
    let cursor = startOfCrmDay(new Date(newestTimestampMs)) ?? new Date(newestTimestampMs);

    while (cursor.getTime() >= oldestTimestampMs) {
      pushTick(cursor.getTime(), formatTickLabel(cursor));
      const nextCursor = addCrmDays(cursor, -stepDays);
      if (!nextCursor) {
        break;
      }

      cursor = nextCursor;
    }
  } else {
    const stepMonths = spanDays <= 365 ? 1 : spanDays <= 730 ? 2 : 3;
    let cursor = startOfCrmMonth(new Date(newestTimestampMs)) ?? new Date(newestTimestampMs);

    while (cursor.getTime() >= oldestTimestampMs) {
      pushTick(cursor.getTime(), formatTickLabel(cursor, true));
      const nextCursor = addCrmMonths(cursor, -stepMonths);
      if (!nextCursor) {
        break;
      }

      cursor = nextCursor;
    }
  }

  pushTick(newestTimestampMs, formatTickLabel(new Date(newestTimestampMs), spanDays > 120));
  pushTick(oldestTimestampMs, formatTickLabel(new Date(oldestTimestampMs), spanDays > 120));

  return ticks.sort((left, right) => left.y - right.y);
}

function buildLaneSegments(items: TimelineLayoutItem[], lanes: LaneKey[]) {
  const segments: TimelineLaneSegment[] = [];

  for (const laneKey of lanes) {
    const laneItems = items
      .filter((item) => item.entry.laneKey === laneKey)
      .sort((left, right) => left.y - right.y);

    if (laneKey === "MEMBER") {
      const chronologicalItems = [...laneItems].sort((left, right) => left.timestampMs - right.timestampMs);
      let activeStart: TimelineLayoutItem | null = null;

      for (const item of chronologicalItems) {
        if (isMembershipActivatingEvent(item.entry.eventKind)) {
          activeStart ??= item;
          continue;
        }

        if (isMembershipTerminatingEvent(item.entry.eventKind)) {
          if (activeStart) {
            segments.push({
              laneKey,
              top: item.y,
              height: Math.max(activeStart.y - item.y, 0)
            });
            activeStart = null;
          }
        }
      }

      if (activeStart) {
        segments.push({
          laneKey,
          top: 0,
          height: Math.max(activeStart.y, 0)
        });
      }

      continue;
    }

    for (let index = 0; index < laneItems.length - 1; index += 1) {
      const current = laneItems[index];
      const next = laneItems[index + 1];

      segments.push({
        laneKey,
        top: current.y,
        height: Math.max(next.y - current.y, 0)
      });
    }
  }

  return segments;
}

export function buildTimelineLayout(entries: TimelineEntry[]): TimelineLayout {
  const sortedEntries = [...entries].sort(
    (left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
  );
  const lanes = collectLanes(sortedEntries);

  if (sortedEntries.length === 0) {
    return {
      lanes,
      items: [],
      laneSegments: [],
      ticks: [],
      height: 0
    };
  }

  const newestTimestampMs = new Date(sortedEntries[0].occurredAt).getTime();
  const oldestTimestampMs = new Date(sortedEntries[sortedEntries.length - 1].occurredAt).getTime();
  const spanMs = Math.max(newestTimestampMs - oldestTimestampMs, 12 * 60 * 60 * 1000);
  const spanDays = Math.max(spanMs / DAY_MS, 1);
  const baseHeight = clamp(spanDays * getPixelsPerDay(spanDays) + 140, 560, 3600);

  let items = computePositionedItems(sortedEntries, newestTimestampMs, spanMs, baseHeight);
  let height = Math.max(baseHeight, items[items.length - 1]?.y ?? baseHeight);
  height += BOTTOM_PADDING;

  items = computePositionedItems(sortedEntries, newestTimestampMs, spanMs, height);
  height = Math.max(height, (items[items.length - 1]?.y ?? 0) + BOTTOM_PADDING);

  return {
    lanes,
    items,
    laneSegments: buildLaneSegments(items, lanes),
    ticks: buildTicks(newestTimestampMs, oldestTimestampMs, spanMs, height),
    height
  };
}

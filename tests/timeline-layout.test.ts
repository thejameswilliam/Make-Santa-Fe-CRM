import { describe, expect, it } from "vitest";

import { buildTimelineLayout } from "@/lib/timeline-layout";
import type { TimelineEntry } from "@/lib/types";

const baseEntries: TimelineEntry[] = [
  {
    id: "evt-1",
    recordType: "IMPORTED",
    laneKey: "DONOR",
    eventKind: "donation",
    typeLabel: "Donation",
    title: "Recent donation",
    summary: null,
    occurredAt: "2026-05-10T18:00:00.000Z",
    source: "WOOCOMMERCE"
  },
  {
    id: "evt-2",
    recordType: "IMPORTED",
    laneKey: "DONOR",
    eventKind: "donation",
    typeLabel: "Donation",
    title: "Earlier donation",
    summary: null,
    occurredAt: "2026-05-05T18:00:00.000Z",
    source: "WOOCOMMERCE"
  },
  {
    id: "evt-3",
    recordType: "IMPORTED",
    laneKey: "EMAIL",
    eventKind: "email_send",
    typeLabel: "Email",
    title: "Older email send",
    summary: null,
    occurredAt: "2026-04-01T18:00:00.000Z",
    source: "NEWSLETTER"
  }
];

describe("buildTimelineLayout", () => {
  it("keeps events ordered from newest to oldest", () => {
    const layout = buildTimelineLayout(baseEntries);

    expect(layout.items.map((item) => item.entry.id)).toEqual(["evt-1", "evt-2", "evt-3"]);
  });

  it("preserves larger gaps with larger vertical spacing", () => {
    const layout = buildTimelineLayout(baseEntries);
    const [first, second, third] = layout.items;

    expect(second.y - first.y).toBeLessThan(third.y - second.y);
  });

  it("creates one lane segment between consecutive events on the same lane", () => {
    const layout = buildTimelineLayout(baseEntries);

    expect(layout.laneSegments).toHaveLength(1);
    expect(layout.laneSegments[0]?.laneKey).toBe("DONOR");
    expect(layout.laneSegments[0]?.height).toBeGreaterThan(0);
  });

  it("extends an active membership segment to the top of the lane", () => {
    const layout = buildTimelineLayout([
      {
        id: "member-start",
        recordType: "MANUAL",
        laneKey: "MEMBER",
        eventKind: "membership_active",
        typeLabel: "Membership Active",
        title: "Membership started",
        summary: null,
        occurredAt: "2026-03-01T18:00:00.000Z",
        source: "MANUAL"
      }
    ]);

    expect(layout.laneSegments).toHaveLength(1);
    expect(layout.laneSegments[0]?.laneKey).toBe("MEMBER");
    expect(layout.laneSegments[0]?.top).toBe(0);
    expect(layout.laneSegments[0]?.height).toBeGreaterThan(0);
  });

  it("closes a membership segment at a pause or end event", () => {
    const layout = buildTimelineLayout([
      {
        id: "member-pause",
        recordType: "MANUAL",
        laneKey: "MEMBER",
        eventKind: "membership_paused",
        typeLabel: "Membership Paused",
        title: "Membership paused",
        summary: null,
        occurredAt: "2026-05-10T18:00:00.000Z",
        source: "MANUAL"
      },
      {
        id: "member-start",
        recordType: "MANUAL",
        laneKey: "MEMBER",
        eventKind: "membership_active",
        typeLabel: "Membership Active",
        title: "Membership started",
        summary: null,
        occurredAt: "2026-03-01T18:00:00.000Z",
        source: "MANUAL"
      }
    ]);

    expect(layout.laneSegments).toHaveLength(1);
    expect(layout.laneSegments[0]?.laneKey).toBe("MEMBER");
    expect(layout.laneSegments[0]?.top).toBeGreaterThan(0);
    expect(layout.laneSegments[0]?.height).toBeGreaterThan(0);
  });
});

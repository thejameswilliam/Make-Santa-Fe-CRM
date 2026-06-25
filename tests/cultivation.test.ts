import { describe, expect, it } from "vitest";

import { computeCultivationSignals, type CultivationActivity } from "@/lib/cultivation";

function donation(occurredAt: string, amountCents: number): CultivationActivity {
  return {
    occurredAt: new Date(occurredAt),
    laneKey: "DONOR",
    eventKind: "donation",
    amountCents,
    metadata: null
  };
}

function activity(occurredAt: string, laneKey: CultivationActivity["laneKey"], eventKind: string, metadata?: Record<string, unknown> | null): CultivationActivity {
  return {
    occurredAt: new Date(occurredAt),
    laneKey,
    eventKind,
    metadata: metadata ?? null
  };
}

describe("computeCultivationSignals", () => {
  it("calculates and rounds a suggested ask amount", () => {
    const signals = computeCultivationSignals({
      importedActivities: [
        donation("2026-01-10T00:00:00.000Z", 5000),
        donation("2026-02-10T00:00:00.000Z", 7500),
        donation("2026-04-10T00:00:00.000Z", 10000),
        activity("2026-04-20T00:00:00.000Z", "COMMUNITY_EVENT", "community_event"),
        activity("2026-04-22T00:00:00.000Z", "EMAIL", "email_click"),
        activity("2026-04-23T00:00:00.000Z", "VOLUNTEER", "volunteer_shift", { durationMinutes: 180 })
      ],
      manualActivities: [],
      status: "ACTIVE_DONOR",
      nextFollowUpAt: new Date("2026-05-30T12:00:00.000Z"),
      hasOwner: true,
      now: new Date("2026-05-13T12:00:00.000Z")
    });

    expect(signals.suggestedAskAmountCents).toBe(12500);
    expect(signals.donorEngagementScore).toBeGreaterThan(40);
    expect(signals.majorDonorPotentialScore).toBeGreaterThan(20);
  });

  it("flags lapsed donors with no owner as action needed", () => {
    const signals = computeCultivationSignals({
      importedActivities: [donation("2025-03-01T00:00:00.000Z", 15000)],
      manualActivities: [],
      status: "LAPSED",
      nextFollowUpAt: null,
      hasOwner: false,
      now: new Date("2026-05-13T12:00:00.000Z")
    });

    expect(signals.daysSinceLastDonation).toBeGreaterThanOrEqual(365);
    expect(signals.actionNeeded).toBe(true);
    expect(signals.urgencyLabel).toBe("Lapsed");
    expect(signals.priorityScore).toBeGreaterThanOrEqual(40);
  });

  it("identifies strong upgrade candidates from engagement patterns", () => {
    const signals = computeCultivationSignals({
      importedActivities: [
        donation("2026-01-01T00:00:00.000Z", 3000),
        donation("2026-02-01T00:00:00.000Z", 5000),
        donation("2026-04-01T00:00:00.000Z", 7000),
        activity("2026-04-04T00:00:00.000Z", "CLASS", "class_attendance"),
        activity("2026-04-10T00:00:00.000Z", "COMMUNITY_EVENT", "community_event"),
        activity("2026-04-11T00:00:00.000Z", "SPACE_USE", "sign_in"),
        activity("2026-04-12T00:00:00.000Z", "SPACE_USE", "sign_in"),
        activity("2026-04-13T00:00:00.000Z", "RESERVER", "reservation"),
        activity("2026-04-20T00:00:00.000Z", "EMAIL", "email_click"),
        activity("2026-05-01T00:00:00.000Z", "EMAIL", "email_click"),
        activity("2026-05-03T00:00:00.000Z", "VOLUNTEER", "volunteer_shift", { durationMinutes: 120 })
      ],
      manualActivities: [],
      status: "ACTIVE_DONOR",
      nextFollowUpAt: new Date("2026-06-01T12:00:00.000Z"),
      hasOwner: true,
      now: new Date("2026-05-13T12:00:00.000Z")
    });

    expect(signals.upgradeScore).toBeGreaterThanOrEqual(55);
    expect(signals.upgradeIndicators).toContain("Increased giving trend");
    expect(signals.upgradeIndicators).toContain("Frequent attendance");
    expect(signals.upgradeIndicators).toContain("Strong communication response");
  });
});

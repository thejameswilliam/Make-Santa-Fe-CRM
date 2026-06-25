import type { CultivationStatusKey, LaneKey } from "@/lib/constants";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CultivationActivity {
  occurredAt: Date;
  laneKey: LaneKey;
  eventKind: string;
  amountCents?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface CultivationSignals {
  donationCount: number;
  lifetimeGivingCents: number;
  largestGiftCents: number;
  averageGiftCents: number | null;
  latestGiftCents: number | null;
  latestDonationAt: Date | null;
  lastInteractionAt: Date | null;
  daysSinceLastDonation: number | null;
  daysSinceLastInteraction: number | null;
  donorEngagementScore: number;
  majorDonorPotentialScore: number;
  increasedGivingTrend: boolean;
  frequentAttendance: boolean;
  strongCommunicationResponse: boolean;
  recentVolunteerism: boolean;
  multipleSmallGifts: boolean;
  suggestedAskAmountCents: number | null;
  priorityScore: number;
  upgradeScore: number;
  urgencyLabel: string;
  urgencyTone: "critical" | "warn" | "info" | "calm";
  actionNeeded: boolean;
  upgradeIndicators: string[];
}

function dayDifference(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function readDurationMinutes(metadata?: Record<string, unknown> | null) {
  const value = metadata?.durationMinutes;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }

  return 0;
}

function roundToNiceAsk(amountCents: number) {
  const amountDollars = amountCents / 100;
  const increment =
    amountDollars < 500 ? 25 : amountDollars < 2500 ? 50 : 100;

  return Math.max(increment, Math.round(amountDollars / increment) * increment) * 100;
}

function scoreBandPoints(score: number, high: number, medium: number, low = 0) {
  if (score >= 75) {
    return high;
  }

  if (score >= 50) {
    return medium;
  }

  return low;
}

function engagementBandPoints(score: number, high: number, medium: number, low = 0) {
  if (score >= 70) {
    return high;
  }

  if (score >= 45) {
    return medium;
  }

  return low;
}

function computeGivingTrend(donations: Array<{ occurredAt: Date; amountCents: number }>) {
  if (donations.length < 3) {
    return false;
  }

  const ordered = [...donations].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
  const splitIndex = Math.floor(ordered.length / 2);
  const earlier = ordered.slice(0, splitIndex);
  const recent = ordered.slice(splitIndex);

  if (earlier.length === 0 || recent.length === 0) {
    return false;
  }

  const earlierAverage =
    earlier.reduce((sum, donation) => sum + donation.amountCents, 0) / earlier.length;
  const recentAverage =
    recent.reduce((sum, donation) => sum + donation.amountCents, 0) / recent.length;

  return recentAverage >= earlierAverage * 1.15;
}

function computeMultipleSmallGifts(donations: Array<{ amountCents: number }>, averageGiftCents: number | null, largestGiftCents: number) {
  return donations.length >= 3 && (averageGiftCents ?? 0) <= 10000 && largestGiftCents <= 25000;
}

function computeSuggestedAskAmountCents(input: {
  donationCount: number;
  averageGiftCents: number | null;
  largestGiftCents: number;
  latestGiftCents: number | null;
  majorDonorPotentialScore: number;
  donorEngagementScore: number;
  daysSinceLastDonation: number | null;
  increasedGivingTrend: boolean;
  multipleSmallGifts: boolean;
}) {
  const averageGiftCents = input.averageGiftCents;
  const largestGiftCents = input.largestGiftCents;

  if (!averageGiftCents && !largestGiftCents && !input.latestGiftCents) {
    return null;
  }

  const baseAsk =
    input.donationCount >= 3
      ? Math.max(
          Math.round((averageGiftCents ?? largestGiftCents) * 1.15),
          input.latestGiftCents ?? averageGiftCents ?? largestGiftCents,
          Math.round(largestGiftCents * 0.9)
        )
      : Math.max(averageGiftCents ?? 0, largestGiftCents);

  const capacityMultiplier =
    input.majorDonorPotentialScore >= 75 ? 1.35 : input.majorDonorPotentialScore >= 50 ? 1.2 : 1;
  const engagementMultiplier =
    input.donorEngagementScore >= 70 ? 1.15 : input.donorEngagementScore >= 45 ? 1.05 : 0.95;
  const recencyMultiplier =
    input.daysSinceLastDonation === null
      ? 1
      : input.daysSinceLastDonation <= 90
        ? 1.1
        : input.daysSinceLastDonation <= 365
          ? 1
          : 0.85;

  let multiplier = capacityMultiplier * engagementMultiplier * recencyMultiplier;
  if (input.increasedGivingTrend || input.multipleSmallGifts) {
    multiplier = Math.max(multiplier, 1.15);
  }

  let nextAsk = Math.round(baseAsk * multiplier);
  if (averageGiftCents) {
    nextAsk = Math.max(nextAsk, averageGiftCents);
  }

  const clampMaximum =
    input.majorDonorPotentialScore >= 75 ? largestGiftCents * 2 : largestGiftCents * 1.5;
  if (clampMaximum > 0) {
    nextAsk = Math.min(nextAsk, Math.round(clampMaximum));
  }

  return roundToNiceAsk(nextAsk);
}

function deriveUrgency(input: {
  nextFollowUpAt: Date | null;
  daysSinceLastDonation: number | null;
  daysSinceLastInteraction: number | null;
  hasOwner: boolean;
}) {
  const now = new Date();

  if (input.nextFollowUpAt && input.nextFollowUpAt.getTime() < now.getTime()) {
    return { label: "Overdue", tone: "critical" as const, rank: 5 };
  }

  if (input.nextFollowUpAt && dayDifference(now, input.nextFollowUpAt) <= 14) {
    return { label: "Due soon", tone: "warn" as const, rank: 4 };
  }

  if (input.daysSinceLastDonation !== null && input.daysSinceLastDonation >= 365) {
    return { label: "Lapsed", tone: "critical" as const, rank: 3 };
  }

  if (input.daysSinceLastDonation !== null && input.daysSinceLastDonation >= 180) {
    return { label: "At risk", tone: "warn" as const, rank: 2 };
  }

  if (!input.hasOwner || !input.nextFollowUpAt) {
    return { label: "Needs setup", tone: "info" as const, rank: 1 };
  }

  if (input.daysSinceLastInteraction !== null && input.daysSinceLastInteraction >= 120) {
    return { label: "Cooling", tone: "warn" as const, rank: 1 };
  }

  return { label: "Monitor", tone: "calm" as const, rank: 0 };
}

export function computeCultivationSignals(input: {
  importedActivities: CultivationActivity[];
  manualActivities: CultivationActivity[];
  status: CultivationStatusKey;
  nextFollowUpAt: Date | null;
  hasOwner: boolean;
  now?: Date;
}): CultivationSignals {
  const now = input.now ?? new Date();
  const allActivities = [...input.importedActivities, ...input.manualActivities].sort(
    (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime()
  );
  const recentThreshold = new Date(now.getTime() - 365 * DAY_MS);
  const volunteerRecentThreshold = new Date(now.getTime() - 180 * DAY_MS);
  const activities365 = allActivities.filter((activity) => activity.occurredAt >= recentThreshold);

  const donationEvents = allActivities.filter((activity) => activity.eventKind === "donation");
  const donationsWithAmount = donationEvents
    .filter((activity): activity is CultivationActivity & { amountCents: number } => typeof activity.amountCents === "number" && activity.amountCents > 0)
    .map((activity) => ({
      occurredAt: activity.occurredAt,
      amountCents: activity.amountCents
    }));

  const latestDonation = [...donationEvents].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())[0] ?? null;
  const latestGiftCents = typeof latestDonation?.amountCents === "number" ? latestDonation.amountCents : null;
  const lifetimeGivingCents = donationsWithAmount.reduce((sum, donation) => sum + donation.amountCents, 0);
  const largestGiftCents = donationsWithAmount.reduce((largest, donation) => Math.max(largest, donation.amountCents), 0);
  const averageGiftCents =
    donationsWithAmount.length > 0 ? Math.round(lifetimeGivingCents / donationsWithAmount.length) : null;

  const eventAttendanceCount365 = activities365.filter((activity) => activity.laneKey === "COMMUNITY_EVENT").length;
  const classCount365 = activities365.filter((activity) => activity.laneKey === "CLASS").length;
  const signInCount365 = activities365.filter((activity) => activity.eventKind === "sign_in").length;
  const reservationCount365 = activities365.filter(
    (activity) => activity.eventKind === "reservation" || activity.eventKind === "reservation_cancelled"
  ).length;
  const emailClickCount365 = input.importedActivities.filter(
    (activity) => activity.eventKind === "email_click" && activity.occurredAt >= recentThreshold
  ).length;
  const volunteerActivities365 = activities365.filter((activity) => activity.eventKind === "volunteer_shift");
  const volunteerMinutes365 = volunteerActivities365.reduce(
    (sum, activity) => sum + readDurationMinutes(activity.metadata ?? null),
    0
  );
  const recentVolunteerism = volunteerActivities365.some((activity) => activity.occurredAt >= volunteerRecentThreshold);
  const memberEvents = allActivities.filter((activity) => activity.laneKey === "MEMBER");
  const lastInteractionAt = allActivities[0]?.occurredAt ?? null;
  const daysSinceLastDonation = latestDonation ? dayDifference(latestDonation.occurredAt, now) : null;
  const daysSinceLastInteraction = lastInteractionAt ? dayDifference(lastInteractionAt, now) : null;

  let donorEngagementScore = 0;
  if (donationEvents.length > 0) {
    donorEngagementScore += 20;
    if ((daysSinceLastDonation ?? Number.POSITIVE_INFINITY) <= 30) {
      donorEngagementScore += 20;
    } else if ((daysSinceLastDonation ?? Number.POSITIVE_INFINITY) <= 90) {
      donorEngagementScore += 15;
    } else if ((daysSinceLastDonation ?? Number.POSITIVE_INFINITY) <= 365) {
      donorEngagementScore += 10;
    }

    if (donationEvents.length >= 5) {
      donorEngagementScore += 15;
    } else if (donationEvents.length >= 2) {
      donorEngagementScore += 10;
    }
  }

  if (memberEvents.length > 0) {
    donorEngagementScore += 10;
  }

  if (volunteerMinutes365 > 0) {
    donorEngagementScore += 10;
  }

  if (classCount365 + eventAttendanceCount365 > 0) {
    donorEngagementScore += 10;
  }

  if (emailClickCount365 > 0) {
    donorEngagementScore += 5;
  }

  if ((daysSinceLastInteraction ?? Number.POSITIVE_INFINITY) <= 30) {
    donorEngagementScore += 10;
  } else if ((daysSinceLastInteraction ?? Number.POSITIVE_INFINITY) <= 90) {
    donorEngagementScore += 5;
  }

  donorEngagementScore = clamp(Math.round(donorEngagementScore), 0, 100);

  let majorDonorPotentialScore = 0;
  if (largestGiftCents >= 50000) {
    majorDonorPotentialScore += 35;
  } else if (largestGiftCents >= 25000) {
    majorDonorPotentialScore += 25;
  } else if (largestGiftCents >= 10000) {
    majorDonorPotentialScore += 15;
  } else if (largestGiftCents > 0) {
    majorDonorPotentialScore += 5;
  }

  if (lifetimeGivingCents >= 100000) {
    majorDonorPotentialScore += 20;
  } else if (lifetimeGivingCents >= 50000) {
    majorDonorPotentialScore += 15;
  } else if (lifetimeGivingCents >= 25000) {
    majorDonorPotentialScore += 10;
  } else if (lifetimeGivingCents >= 10000) {
    majorDonorPotentialScore += 5;
  }

  if (donationEvents.length >= 3) {
    majorDonorPotentialScore += 10;
  }

  if (daysSinceLastDonation !== null && daysSinceLastDonation <= 365) {
    majorDonorPotentialScore += 10;
  }

  if (memberEvents.length > 0) {
    majorDonorPotentialScore += 10;
  }

  if (volunteerMinutes365 >= 300) {
    majorDonorPotentialScore += 10;
  }

  if (emailClickCount365 >= 3) {
    majorDonorPotentialScore += 5;
  }

  majorDonorPotentialScore = clamp(Math.round(majorDonorPotentialScore), 0, 100);

  const increasedGivingTrend = computeGivingTrend(donationsWithAmount);
  const multipleSmallGifts = computeMultipleSmallGifts(
    donationsWithAmount,
    averageGiftCents,
    largestGiftCents
  );
  const frequentAttendance = eventAttendanceCount365 + classCount365 + signInCount365 + reservationCount365 >= 5;
  const strongCommunicationResponse = emailClickCount365 >= 2;

  const suggestedAskAmountCents = computeSuggestedAskAmountCents({
    donationCount: donationEvents.length,
    averageGiftCents,
    largestGiftCents,
    latestGiftCents,
    majorDonorPotentialScore,
    donorEngagementScore,
    daysSinceLastDonation,
    increasedGivingTrend,
    multipleSmallGifts
  });

  const dueSoon =
    input.nextFollowUpAt !== null && input.nextFollowUpAt.getTime() >= now.getTime() && dayDifference(now, input.nextFollowUpAt) <= 14;
  const overdue = input.nextFollowUpAt !== null && input.nextFollowUpAt.getTime() < now.getTime();

  let priorityScore = 0;
  if (overdue) {
    priorityScore += 20;
  } else if (dueSoon) {
    priorityScore += 12;
  }

  if (!input.nextFollowUpAt) {
    priorityScore += 8;
  }

  if (!input.hasOwner) {
    priorityScore += 8;
  }

  if ((daysSinceLastDonation ?? -1) >= 365) {
    priorityScore += 25;
  } else if ((daysSinceLastDonation ?? -1) >= 180) {
    priorityScore += 15;
  } else if (daysSinceLastDonation !== null) {
    priorityScore += 5;
  }

  priorityScore += scoreBandPoints(majorDonorPotentialScore, 20, 14, majorDonorPotentialScore > 0 ? 8 : 0);
  priorityScore += engagementBandPoints(donorEngagementScore, 15, 10, donorEngagementScore > 0 ? 5 : 0);

  if (largestGiftCents >= 100000 || lifetimeGivingCents >= 250000) {
    priorityScore += 5;
  } else if (largestGiftCents >= 50000 || lifetimeGivingCents >= 100000) {
    priorityScore += 4;
  } else if (largestGiftCents >= 25000 || lifetimeGivingCents >= 50000) {
    priorityScore += 3;
  } else if (largestGiftCents >= 10000 || lifetimeGivingCents >= 25000) {
    priorityScore += 2;
  } else if (donationEvents.length > 0) {
    priorityScore += 1;
  }

  priorityScore = clamp(Math.round(priorityScore), 0, 100);

  let upgradeScore = 0;
  if (increasedGivingTrend) {
    upgradeScore += 30;
  }

  upgradeScore += engagementBandPoints(donorEngagementScore, 20, 12, donorEngagementScore > 0 ? 6 : 0);

  if (frequentAttendance) {
    upgradeScore += 15;
  }

  if (strongCommunicationResponse) {
    upgradeScore += 15;
  }

  if (recentVolunteerism) {
    upgradeScore += 10;
  }

  if (multipleSmallGifts) {
    upgradeScore += 10;
  }

  upgradeScore = clamp(Math.round(upgradeScore), 0, 100);

  const urgency = deriveUrgency({
    nextFollowUpAt: input.nextFollowUpAt,
    daysSinceLastDonation,
    daysSinceLastInteraction,
    hasOwner: input.hasOwner
  });

  const actionNeeded =
    !input.hasOwner ||
    !input.nextFollowUpAt ||
    dueSoon ||
    overdue ||
    (daysSinceLastDonation ?? -1) >= 180 ||
    ((daysSinceLastDonation ?? -1) >= 365) ||
    (upgradeScore >= 55 && input.status !== "STEWARDSHIP");

  const upgradeIndicators = [
    increasedGivingTrend ? "Increased giving trend" : null,
    frequentAttendance ? "Frequent attendance" : null,
    strongCommunicationResponse ? "Strong communication response" : null,
    recentVolunteerism ? "Recent volunteerism" : null,
    multipleSmallGifts ? "Multiple small gifts" : null,
    donorEngagementScore >= 70 ? "High engagement" : donorEngagementScore >= 45 ? "Solid engagement" : null
  ].filter((value): value is string => Boolean(value));

  return {
    donationCount: donationEvents.length,
    lifetimeGivingCents,
    largestGiftCents,
    averageGiftCents,
    latestGiftCents,
    latestDonationAt: latestDonation?.occurredAt ?? null,
    lastInteractionAt,
    daysSinceLastDonation,
    daysSinceLastInteraction,
    donorEngagementScore,
    majorDonorPotentialScore,
    increasedGivingTrend,
    frequentAttendance,
    strongCommunicationResponse,
    recentVolunteerism,
    multipleSmallGifts,
    suggestedAskAmountCents,
    priorityScore,
    upgradeScore,
    urgencyLabel: urgency.label,
    urgencyTone: urgency.tone,
    actionNeeded,
    upgradeIndicators
  };
}

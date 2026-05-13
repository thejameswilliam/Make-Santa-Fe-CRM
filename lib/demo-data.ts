import { LANE_META, SOURCE_LABELS, type LaneKey } from "@/lib/constants";
import type {
  CultivationDashboardData,
  ContactDetail,
  ContactListItem,
  DashboardData,
  MappingScreenData,
  ReviewQueueItem,
  TimelineEntry
} from "@/lib/types";

const timeline: TimelineEntry[] = [
  {
    id: "evt-1",
    recordType: "IMPORTED",
    laneKey: "EMAIL",
    eventKind: "email_send",
    typeLabel: "Email",
    title: "Membership spring campaign",
    summary: "Sent the April membership campaign newsletter.",
    occurredAt: "2026-05-08T16:14:00.000Z",
    source: "NEWSLETTER"
  },
  {
    id: "evt-2",
    recordType: "IMPORTED",
    laneKey: "MEMBER",
    eventKind: "membership_payment",
    typeLabel: "Membership",
    title: "Annual membership renewal",
    summary: "Renewed household membership through WooCommerce.",
    occurredAt: "2026-05-02T20:43:00.000Z",
    source: "WOOCOMMERCE",
    amountLabel: "$120.00"
  },
  {
    id: "evt-3",
    recordType: "IMPORTED",
    laneKey: "SPACE_USE",
    eventKind: "sign_in",
    typeLabel: "Sign-in / Space use",
    title: "Studio sign-in",
    summary: "Checked in at the metal shop front desk kiosk.",
    occurredAt: "2026-04-27T19:10:00.000Z",
    source: "SIGN_IN"
  },
  {
    id: "evt-4",
    recordType: "IMPORTED",
    laneKey: "DONOR",
    eventKind: "donation",
    typeLabel: "Donation",
    title: "Spring fundraiser donation",
    summary: "Contributed during the community tools campaign.",
    occurredAt: "2026-04-14T18:30:00.000Z",
    source: "WOOCOMMERCE",
    amountLabel: "$75.00"
  },
  {
    id: "evt-5",
    recordType: "MANUAL",
    laneKey: "CLASS",
    eventKind: "class_attendance",
    typeLabel: "Class Attendance",
    title: "Laser cutter intro class",
    summary: "Manual attendance note added by staff.",
    occurredAt: "2026-03-30T00:00:00.000Z",
    source: "MANUAL",
    manualInteractionTypeId: "class-attendance"
  }
];

const demoMetricSections = [
  {
    id: "giving-financial",
    title: "Giving & financial",
    metrics: [
      { id: "lifetime-giving", label: "Lifetime Giving", value: "$75.00", detail: "1 gift on record", laneKey: "DONOR" as const },
      { id: "donation-count", label: "Total Number of Donations", value: "1", detail: "Donation events on record", laneKey: "DONOR" as const },
      { id: "average-donation", label: "Average Donation Amount", value: "$75.00", detail: "Across 1 gift with amount", laneKey: "DONOR" as const },
      { id: "largest-donation", label: "Largest Donation", value: "$75.00", detail: "Single largest recorded gift", laneKey: "DONOR" as const },
      { id: "first-donation", label: "First Donation Amount", value: "$75.00", detail: "Apr 14, 2026", laneKey: "DONOR" as const },
      { id: "recent-donation", label: "Most Recent Donation Amount", value: "$75.00", detail: "Apr 14, 2026", laneKey: "DONOR" as const },
      { id: "giving-frequency", label: "Giving Frequency", value: "One-time", detail: "Only one gift on record", laneKey: "DONOR" as const },
      { id: "recurring-donation", label: "Recurring Donation Value", value: "—", detail: "No recurring pattern detected", laneKey: "DONOR" as const }
    ]
  },
  {
    id: "engagement",
    title: "Engagement",
    metrics: [
      { id: "event-attendance", label: "Event Attendance Count", value: "0", detail: "Community event interactions", laneKey: "COMMUNITY_EVENT" as const },
      { id: "last-engagement", label: "Last Engagement Date", value: "May 8, 2026", detail: "Most recent recorded interaction", laneKey: "OTHER" as const },
      { id: "volunteer-hours", label: "Volunteer Hours", value: "0h", detail: "No completed volunteer shifts", laneKey: "VOLUNTEER" as const },
      { id: "class-count", label: "Program / Class Count", value: "1", detail: "Program and class interactions", laneKey: "CLASS" as const },
      { id: "total-emails", label: "Total Emails", value: "1", detail: "Newsletter send records", laneKey: "EMAIL" as const },
      { id: "total-email-clicks", label: "Total Email Clicks", value: "0", detail: "No email clicks on record", laneKey: "EMAIL" as const }
    ]
  },
  {
    id: "retention-risk",
    title: "Retention & risk",
    metrics: [
      { id: "days-since-donation", label: "Days Since Last Donation", value: "27", detail: "Apr 14, 2026", laneKey: "DONOR" as const },
      { id: "donor-retention", label: "Donor Retention Status", value: "New", detail: "First donor year on record", laneKey: "DONOR" as const },
      { id: "years-active", label: "Years Active", value: "2 mos", detail: "Since Mar 30, 2026", laneKey: "MEMBER" as const },
      { id: "churn-risk", label: "Churn Risk Score", value: "20", detail: "Low risk", laneKey: "OTHER" as const },
      { id: "lapsed-donor", label: "Lapsed Donor Status", value: "Active", detail: "27 days since last gift", laneKey: "DONOR" as const }
    ]
  },
  {
    id: "strategic-composite",
    title: "Strategic / composite",
    metrics: [
      { id: "donor-engagement", label: "Donor Engagement Score", value: "55", detail: "Moderate", laneKey: "DONOR" as const },
      { id: "community-value", label: "Community Value Score", value: "35", detail: "Low", laneKey: "COMMUNITY_EVENT" as const },
      { id: "member-donor-overlap", label: "Membership + Donor Overlap", value: "Yes", detail: "Member and donor history on record", laneKey: "MEMBER" as const },
      { id: "volunteer-to-donor", label: "Volunteer-to-Donor Conversion", value: "N/A", detail: "No volunteer history", laneKey: "VOLUNTEER" as const },
      { id: "major-donor-potential", label: "Major Donor Potential Score", value: "30", detail: "Low", laneKey: "DONOR" as const },
      { id: "advocacy-score", label: "Advocacy / Ambassador Score", value: "13", detail: "Low", laneKey: "EMAIL" as const }
    ]
  }
];

export const demoDashboardData: DashboardData = {
  metrics: [
    { id: "memberships", label: "Memberships", value: "184", detail: "23 renewals in the last 30 days", laneKey: "MEMBER" },
    { id: "donations", label: "Donations", value: "$18,420", detail: "64 donor interactions this quarter", laneKey: "DONOR" },
    { id: "space-use", label: "Space Use", value: "1,328", detail: "Sign-ins in the last 30 days", laneKey: "SPACE_USE" },
    { id: "reservations", label: "Reservations", value: "312", detail: "Tool and room reservations this month", laneKey: "RESERVER" },
    { id: "email", label: "Email Sends", value: "948", detail: "Newsletter sends across recent campaigns", laneKey: "EMAIL" }
  ],
  favoriteContacts: [
    {
      id: "contact-1",
      displayName: "Elena Martinez",
      primaryEmail: "elena@example.org",
      photoUrl: "https://placehold.co/96x96/181b22/f5f7fb?text=EM",
      isActive: true,
      isFavorite: true,
      effectiveRoleTags: ["BOARD_MEMBER", "DONOR"],
      recentLaneKeys: ["EMAIL", "MEMBER", "DONOR"],
      lastInteractionAt: timeline[0]?.occurredAt ?? null
    },
    {
      id: "contact-2",
      displayName: "Micah Rivera",
      primaryEmail: "micah@example.org",
      photoUrl: null,
      isActive: false,
      isFavorite: true,
      effectiveRoleTags: ["VOLUNTEER"],
      recentLaneKeys: ["EMAIL"],
      lastInteractionAt: "2026-05-06T22:20:00.000Z"
    }
  ],
  selectedRoleTag: "ALL",
  availableRoleTags: [
    { key: "BOARD_MEMBER", label: "Board member" },
    { key: "INSTRUCTOR", label: "Instructor" },
    { key: "VOLUNTEER", label: "Volunteer" },
    { key: "STAFF", label: "Staff" },
    { key: "DONOR", label: "Donor" }
  ],
  taggedContacts: [],
  syncStatus: Object.entries(SOURCE_LABELS).map(([source, label], index) => ({
    source: source as keyof typeof SOURCE_LABELS,
    label,
    lastSuccessfulSyncAt: new Date(Date.now() - index * 8 * 60 * 1000).toISOString(),
    stale: index < 2
  })),
  needsBackgroundRefresh: true
};

export const demoCultivationDashboardData: CultivationDashboardData = {
  ownerOptions: [
    {
      id: "wp-1",
      name: "James",
      email: "james@example.org"
    },
    {
      id: "wp-2",
      name: "Morgan",
      email: "morgan@example.org"
    }
  ],
  priorityQueue: [
    {
      contactId: "contact-1",
      displayName: "Elena Martinez",
      primaryEmail: "elena@example.org",
      owner: {
        id: "wp-1",
        name: "James",
        email: "james@example.org"
      },
      status: "ACTIVE_DONOR",
      nextFollowUpAt: "2026-05-18T12:00:00.000Z",
      priorityScore: 88,
      suggestedAskAmount: "$100.00",
      suggestedAskAmountCents: 10000,
      lastInteractionAt: timeline[0]?.occurredAt ?? null,
      lastDonationAt: "2026-04-14T18:30:00.000Z",
      lastDonationAmount: "$75.00",
      lastDonationAmountCents: 7500,
      daysSinceLastDonation: 27,
      urgencyLabel: "Due soon",
      urgencyTone: "warn",
      upgradeScore: 62,
      upgradeIndicators: ["Increased giving trend", "Strong communication response", "Solid engagement"]
    },
    {
      contactId: "contact-3",
      displayName: "Nadia Flores",
      primaryEmail: "nadia@example.org",
      owner: null,
      status: "LAPSED",
      nextFollowUpAt: null,
      priorityScore: 91,
      suggestedAskAmount: "$250.00",
      suggestedAskAmountCents: 25000,
      lastInteractionAt: "2025-12-10T17:00:00.000Z",
      lastDonationAt: "2025-04-01T16:00:00.000Z",
      lastDonationAmount: "$150.00",
      lastDonationAmountCents: 15000,
      daysSinceLastDonation: 406,
      urgencyLabel: "Lapsed",
      urgencyTone: "critical",
      upgradeScore: 28,
      upgradeIndicators: []
    }
  ],
  upgradeCandidates: [
    {
      contactId: "contact-1",
      displayName: "Elena Martinez",
      primaryEmail: "elena@example.org",
      owner: {
        id: "wp-1",
        name: "James",
        email: "james@example.org"
      },
      suggestedAskAmount: "$100.00",
      suggestedAskAmountCents: 10000,
      lastDonationAt: "2026-04-14T18:30:00.000Z",
      lastDonationAmount: "$75.00",
      lastDonationAmountCents: 7500,
      upgradeScore: 62,
      upgradeIndicators: ["Increased giving trend", "Frequent attendance", "Strong communication response"]
    }
  ],
  lapsedDonors: [
    {
      contactId: "contact-3",
      displayName: "Nadia Flores",
      primaryEmail: "nadia@example.org",
      owner: null,
      lastInteractionAt: "2025-12-10T17:00:00.000Z",
      lastDonationAt: "2025-04-01T16:00:00.000Z",
      lastDonationAmount: "$150.00",
      lastDonationAmountCents: 15000,
      daysSinceLastDonation: 406,
      urgencyLabel: "Lapsed",
      urgencyTone: "critical"
    }
  ],
  needsBackgroundRefresh: true
};

export const demoContacts: ContactListItem[] = [
  {
    id: "contact-1",
    displayName: "Elena Martinez",
    primaryEmail: "elena@example.org",
    photoUrl: "https://placehold.co/96x96/181b22/f5f7fb?text=EM",
    isActive: true,
    isFavorite: true,
    effectiveRoleTags: ["BOARD_MEMBER", "DONOR"],
    recentLaneKeys: ["EMAIL", "MEMBER", "DONOR"],
    lastInteractionAt: timeline[0]?.occurredAt ?? null
  },
  {
    id: "contact-2",
    displayName: "Micah Rivera",
    primaryEmail: "micah@example.org",
    photoUrl: null,
    isActive: false,
    isFavorite: true,
    effectiveRoleTags: ["VOLUNTEER"],
    recentLaneKeys: ["EMAIL"],
    lastInteractionAt: "2026-05-06T22:20:00.000Z"
  }
];

export const demoContactDetail: ContactDetail = {
  id: "contact-1",
  displayName: "Elena Martinez",
  primaryEmail: "elena@example.org",
  isActive: true,
  isFavorite: true,
  manualRoleTags: ["BOARD_MEMBER"],
  effectiveRoleTags: ["BOARD_MEMBER", "DONOR"],
  emails: ["elena@example.org", "elena.msf@gmail.com"],
  profileFields: [
    {
      fieldKey: "FULL_NAME",
      displayValue: "Elena Martinez",
      source: "WOOCOMMERCE",
      rawValues: [
        { source: "WOOCOMMERCE", displayValue: "Elena Martinez", observedAt: "2026-05-02T20:43:00.000Z" },
        { source: "GRAVITY_FORMS", displayValue: "Elena M. Martinez", observedAt: "2026-02-01T16:00:00.000Z" }
      ]
    },
    {
      fieldKey: "PHONE",
      displayValue: "(505) 555-0123",
      source: "GRAVITY_FORMS",
      rawValues: [{ source: "GRAVITY_FORMS", displayValue: "(505) 555-0123", observedAt: "2026-02-01T16:00:00.000Z" }]
    },
    {
      fieldKey: "ADDRESS",
      displayValue: "2870 Trades West Rd, Santa Fe, NM",
      source: "WOOCOMMERCE",
      rawValues: [{ source: "WOOCOMMERCE", displayValue: "2870 Trades West Rd, Santa Fe, NM", observedAt: "2026-05-02T20:43:00.000Z" }]
    }
  ],
  certifications: [
    {
      id: "badge-ceramics",
      name: "Ceramics Studio Badge",
      source: "SIGN_IN",
      statusKey: "active",
      statusLabel: "Active",
      lastUsedAt: "2026-04-27T19:10:00.000Z",
      lastUsedLabel: "Last use: Apr 27, 2026",
      expiresAt: "2026-10-27T19:10:00.000Z",
      expiresLabel: "Oct 27, 2026",
      detail: "183 days remaining",
      imageUrl: null
    },
    {
      id: "badge-laser",
      name: "Laser Cutter Badge",
      source: "SIGN_IN",
      statusKey: "expiring",
      statusLabel: "Expiring Soon",
      lastUsedAt: "2025-06-01T18:00:00.000Z",
      lastUsedLabel: "Last use: Jun 1, 2025",
      expiresAt: "2026-06-01T18:00:00.000Z",
      expiresLabel: "Jun 1, 2026",
      detail: "20 days remaining",
      imageUrl: null
    }
  ],
  notes: [
    {
      id: "note-1",
      authorName: "James",
      occurredAt: "2026-05-09T17:05:00.000Z",
      content: "Followed up after the fundraiser and confirmed interest in sponsoring the next ceramics scholarship."
    },
    {
      id: "note-2",
      authorName: "Elena",
      occurredAt: "2026-04-18T15:20:00.000Z",
      content: "Asked for a quieter welding orientation slot next month."
    }
  ],
  metricSections: demoMetricSections,
  timeline,
  interactionTypeOptions: [
    { id: "donation", name: "Donation", slug: "donation", laneKey: "DONOR" },
    { id: "membership-active", name: "Membership Active", slug: "membership_active", laneKey: "MEMBER" },
    { id: "membership-complimentary", name: "Complimentary Membership", slug: "membership_complimentary", laneKey: "MEMBER" },
    { id: "membership-paused", name: "Membership Paused", slug: "membership_paused", laneKey: "MEMBER" },
    { id: "membership-ended", name: "Membership Ended", slug: "membership_cancelled", laneKey: "MEMBER" },
    { id: "manual-note", name: "General Note", slug: "general-note", laneKey: "NOTES" },
    { id: "class-attendance", name: "Class Attendance", slug: "class-attendance", laneKey: "CLASS" },
    { id: "community-event", name: "Community Event", slug: "community-event", laneKey: "COMMUNITY_EVENT" },
    { id: "volunteer-shift", name: "Volunteer Shift", slug: "volunteer-shift", laneKey: "VOLUNTEER" }
  ],
  needsBackgroundRefresh: true
};

export const demoReviewQueue: ReviewQueueItem[] = [
  {
    id: "unmatched-1",
    source: "NEWSLETTER",
    title: "Tool library campaign",
    summary: "Sent newsletter arrived with an email address not yet attached to a contact.",
    occurredAt: "2026-05-07T15:18:00.000Z",
    candidateEmail: "elena.work@example.org",
    reason: "No exact email match found.",
    laneKey: "EMAIL",
    eventKind: "email_send",
    reviewEventTypeKey: "EMAIL"
  },
  {
    id: "unmatched-2",
    source: "SIGN_IN",
    title: "Front desk kiosk sign-in",
    summary: "Sign-in payload did not contain an email address.",
    occurredAt: "2026-05-06T19:12:00.000Z",
    candidateEmail: null,
    reason: "Event does not include a usable email address.",
    laneKey: "SPACE_USE",
    eventKind: "sign_in",
    reviewEventTypeKey: "SIGN_IN"
  }
];

export const demoMappingsData: MappingScreenData = {
  mappingRules: [
    {
      id: "rule-1",
      source: "WOOCOMMERCE",
      name: "Donation Products",
      matcherType: "TAG",
      matcherValue: "donation",
      eventKind: "donation",
      laneKey: "DONOR",
      priority: 10,
      isActive: true,
      isDefault: true
    },
    {
      id: "rule-2",
      source: "NEWSLETTER",
      name: "Newsletter Send",
      matcherType: "TAG",
      matcherValue: "send",
      eventKind: "email_send",
      laneKey: "EMAIL",
      priority: 10,
      isActive: true,
      isDefault: true
    }
  ],
  interactionTypes: [
    { id: "interaction-1", name: "General Note", slug: "general-note", laneKey: "NOTES", isActive: true },
    { id: "interaction-2", name: "Class Attendance", slug: "class-attendance", laneKey: "CLASS", isActive: true }
  ]
};

export const demoLaneLegend = Object.entries(LANE_META).map(([key, value]) => ({
  key: key as LaneKey,
  ...value
}));

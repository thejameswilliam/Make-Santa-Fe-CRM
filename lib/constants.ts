export const SOURCE_SYSTEMS = [
  "WOOCOMMERCE",
  "GRAVITY_FORMS",
  "SIGN_IN",
  "RESERVATIONS",
  "NEWSLETTER",
  "MANUAL"
] as const;

export type SourceSystemKey = (typeof SOURCE_SYSTEMS)[number];

export const SOURCE_LABELS: Record<SourceSystemKey, string> = {
  WOOCOMMERCE: "WooCommerce",
  GRAVITY_FORMS: "Gravity Forms",
  SIGN_IN: "Sign-In",
  RESERVATIONS: "Reservations",
  NEWSLETTER: "Newsletter",
  MANUAL: "Manual"
};

export const PROFILE_SOURCE_PRIORITY: SourceSystemKey[] = [
  "WOOCOMMERCE",
  "GRAVITY_FORMS",
  "RESERVATIONS",
  "SIGN_IN"
];

export const LANE_META = {
  DONOR: { label: "Donor", color: "#ff7a59", textColor: "#170807" },
  MEMBER: { label: "Member", color: "#ff4655", textColor: "#fff5f6" },
  VOLUNTEER: { label: "Volunteer", color: "#c94d3f", textColor: "#fff2ec" },
  RESERVER: { label: "Reserver", color: "#a93a48", textColor: "#fff1f4" },
  SPACE_USE: { label: "Space Use / Sign-In", color: "#5e6778", textColor: "#f4f7ff" },
  PURCHASE: { label: "Purchase", color: "#ff9a3c", textColor: "#180b04" },
  CLASS: { label: "Class", color: "#d95b7b", textColor: "#16090d" },
  COMMUNITY_EVENT: { label: "Community Event", color: "#ff5270", textColor: "#18080c" },
  EMAIL: { label: "Email", color: "#bb4b72", textColor: "#fff2f7" },
  NOTES: { label: "Notes", color: "#6a4a52", textColor: "#fff4f6" },
  OTHER: { label: "Other Manual Interaction", color: "#4f5664", textColor: "#f6f7fb" }
} as const;

export type LaneKey = keyof typeof LANE_META;

export const CONTACT_MANUAL_ROLE_TAGS = [
  "BOARD_MEMBER",
  "INSTRUCTOR",
  "VOLUNTEER",
  "STAFF"
] as const;

export const CONTACT_EFFECTIVE_ROLE_TAGS = [
  ...CONTACT_MANUAL_ROLE_TAGS,
  "DONOR"
] as const;

export type ContactManualRoleTagKey = (typeof CONTACT_MANUAL_ROLE_TAGS)[number];
export type ContactEffectiveRoleTagKey = (typeof CONTACT_EFFECTIVE_ROLE_TAGS)[number];

export const CONTACT_ROLE_TAG_META: Record<
  ContactEffectiveRoleTagKey,
  {
    label: string;
    color: string;
    textColor: string;
    manual: boolean;
  }
> = {
  BOARD_MEMBER: { label: "Board member", color: "#ffd166", textColor: "#1a1200", manual: true },
  INSTRUCTOR: { label: "Instructor", color: "#7ad7ff", textColor: "#04141a", manual: true },
  VOLUNTEER: { label: "Volunteer", color: "#c94d3f", textColor: "#fff2ec", manual: true },
  STAFF: { label: "Staff", color: "#8ef0b0", textColor: "#06140b", manual: true },
  DONOR: { label: "Donor", color: "#ff7a59", textColor: "#170807", manual: false }
};

export function isContactManualRoleTagKey(value?: string | null): value is ContactManualRoleTagKey {
  return CONTACT_MANUAL_ROLE_TAGS.includes(value as ContactManualRoleTagKey);
}

export function isContactEffectiveRoleTagKey(value?: string | null): value is ContactEffectiveRoleTagKey {
  return CONTACT_EFFECTIVE_ROLE_TAGS.includes(value as ContactEffectiveRoleTagKey);
}

export const PEOPLE_SORT_OPTIONS = [
  { key: "LAST_INTERACTION", label: "Interaction date" },
  { key: "LAST_NAME", label: "Last name" },
  { key: "DONOR_LEVEL", label: "Donor level" },
  { key: "VOLUNTEER_HOURS", label: "Volunteer hours" },
  { key: "SPACE_USE_FREQUENCY", label: "Space use / sign-in frequency" }
] as const;

export type PeopleSortKey = (typeof PEOPLE_SORT_OPTIONS)[number]["key"];

export function isPeopleSortKey(value?: string | null): value is PeopleSortKey {
  return PEOPLE_SORT_OPTIONS.some((option) => option.key === value);
}

export const REVIEW_EVENT_TYPES = [
  { key: "GENERAL_SUBMISSION", label: "General submission", eventKind: "form_submission", laneKey: "OTHER" },
  { key: "DONATION", label: "Donation", eventKind: "donation", laneKey: "DONOR" },
  { key: "MEMBERSHIP", label: "Membership", eventKind: "membership_payment", laneKey: "MEMBER" },
  { key: "VOLUNTEER", label: "Volunteer shift", eventKind: "volunteer_shift", laneKey: "VOLUNTEER" },
  { key: "VOLUNTEER_ORIENTATION", label: "Volunteer orientation", eventKind: "volunteer_orientation_completed", laneKey: "VOLUNTEER" },
  { key: "RESERVATION", label: "Reservation", eventKind: "reservation", laneKey: "RESERVER" },
  { key: "SIGN_IN", label: "Sign-in / Space use", eventKind: "sign_in", laneKey: "SPACE_USE" },
  { key: "PURCHASE", label: "Purchase", eventKind: "purchase", laneKey: "PURCHASE" },
  { key: "CLASS", label: "Class attendance", eventKind: "class_attendance", laneKey: "CLASS" },
  { key: "COMMUNITY_EVENT", label: "Community event", eventKind: "community_event", laneKey: "COMMUNITY_EVENT" },
  { key: "EMAIL", label: "Email", eventKind: "email_send", laneKey: "EMAIL" },
  { key: "EMAIL_CLICK", label: "Email click", eventKind: "email_click", laneKey: "EMAIL" },
  { key: "NOTE", label: "Note", eventKind: "general_note", laneKey: "NOTES" },
  { key: "OTHER", label: "Other", eventKind: "manual_assignment", laneKey: "OTHER" }
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  eventKind: string;
  laneKey: LaneKey;
}>;

export type ReviewEventTypeKey = (typeof REVIEW_EVENT_TYPES)[number]["key"];

export function findReviewEventTypeByKey(key?: string | null) {
  return REVIEW_EVENT_TYPES.find((type) => type.key === key) ?? null;
}

export function findReviewEventType(eventKind?: string | null, laneKey?: LaneKey | null) {
  if (eventKind) {
    const exact = REVIEW_EVENT_TYPES.find((type) => type.eventKind === eventKind);
    if (exact) {
      return exact;
    }
  }

  if (laneKey) {
    return REVIEW_EVENT_TYPES.find((type) => type.laneKey === laneKey) ?? null;
  }

  return null;
}

export const DEFAULT_INTERACTION_TYPES = [
  { name: "Donation", slug: "donation", laneKey: "DONOR", colorToken: "#ff7a59", isSystem: true },
  { name: "General Note", slug: "general-note", laneKey: "NOTES", colorToken: "#6a4a52", isSystem: true },
  { name: "Membership Active", slug: "membership_active", laneKey: "MEMBER", colorToken: "#ff4655", isSystem: true },
  { name: "Complimentary Membership", slug: "membership_complimentary", laneKey: "MEMBER", colorToken: "#ff4655", isSystem: true },
  { name: "Membership Paused", slug: "membership_paused", laneKey: "MEMBER", colorToken: "#ff4655", isSystem: true },
  { name: "Membership Ended", slug: "membership_cancelled", laneKey: "MEMBER", colorToken: "#ff4655", isSystem: true },
  { name: "Class Attendance", slug: "class-attendance", laneKey: "CLASS", colorToken: "#d95b7b", isSystem: true },
  { name: "Community Event", slug: "community-event", laneKey: "COMMUNITY_EVENT", colorToken: "#ff5270", isSystem: true },
  { name: "Volunteer Shift", slug: "volunteer-shift", laneKey: "VOLUNTEER", colorToken: "#c94d3f", isSystem: true },
  { name: "Conversation", slug: "conversation", laneKey: "OTHER", colorToken: "#4f5664", isSystem: false }
] as const;

export const DEFAULT_MAPPING_RULES = [
  {
    source: "WOOCOMMERCE",
    name: "Donation Products",
    matcherType: "TAG",
    matcherValue: "donation",
    eventKind: "donation",
    laneKey: "DONOR",
    roleKey: "donor",
    priority: 10
  },
  {
    source: "WOOCOMMERCE",
    name: "Membership Products",
    matcherType: "TAG",
    matcherValue: "membership",
    eventKind: "membership_payment",
    laneKey: "MEMBER",
    roleKey: "member",
    priority: 20
  },
  {
    source: "WOOCOMMERCE",
    name: "Default Purchase",
    matcherType: "DEFAULT",
    matcherValue: "*",
    eventKind: "purchase",
    laneKey: "PURCHASE",
    priority: 100
  },
  {
    source: "GRAVITY_FORMS",
    name: "Default Form Submission",
    matcherType: "DEFAULT",
    matcherValue: "*",
    eventKind: "form_submission",
    laneKey: "OTHER",
    priority: 100
  },
  {
    source: "SIGN_IN",
    name: "Volunteer Shift",
    matcherType: "TAG",
    matcherValue: "volunteer_shift",
    eventKind: "volunteer_shift",
    laneKey: "VOLUNTEER",
    roleKey: "volunteer",
    priority: 10
  },
  {
    source: "SIGN_IN",
    name: "Volunteer Orientation",
    matcherType: "TAG",
    matcherValue: "orientation",
    eventKind: "volunteer_orientation_completed",
    laneKey: "VOLUNTEER",
    roleKey: "volunteer",
    priority: 20
  },
  {
    source: "SIGN_IN",
    name: "Default Sign-In",
    matcherType: "DEFAULT",
    matcherValue: "*",
    eventKind: "sign_in",
    laneKey: "SPACE_USE",
    priority: 100
  },
  {
    source: "RESERVATIONS",
    name: "Default Reservation",
    matcherType: "DEFAULT",
    matcherValue: "*",
    eventKind: "reservation",
    laneKey: "RESERVER",
    roleKey: "reserver",
    priority: 100
  },
  {
    source: "NEWSLETTER",
    name: "Newsletter Click",
    matcherType: "TAG",
    matcherValue: "click",
    eventKind: "email_click",
    laneKey: "EMAIL",
    priority: 5
  },
  {
    source: "NEWSLETTER",
    name: "Newsletter Send",
    matcherType: "TAG",
    matcherValue: "send",
    eventKind: "email_send",
    laneKey: "EMAIL",
    priority: 10
  }
] as const;

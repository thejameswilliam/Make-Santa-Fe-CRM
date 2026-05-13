import {
  ContactManualRoleTag as PrismaContactManualRoleTag,
  LaneKey as PrismaLaneKey,
  Prisma,
  ProfileFieldKey as PrismaProfileFieldKey,
  ReviewStatus,
  SourceSystem as PrismaSourceSystem
} from "@prisma/client";

import { ensureCatalogSeeded } from "@/lib/catalog";
import { buildEffectiveRoleTags } from "@/lib/contact-roles";
import { config } from "@/lib/config";
import {
  CONTACT_EFFECTIVE_ROLE_TAGS,
  CONTACT_MANUAL_ROLE_TAGS,
  CONTACT_ROLE_TAG_META,
  DEFAULT_MAPPING_RULES,
  findReviewEventType,
  findReviewEventTypeByKey,
  isAutoBackgroundRefreshSource,
  type ContactEffectiveRoleTagKey,
  type ContactManualRoleTagKey,
  LANE_META,
  type PeopleSortKey,
  SOURCE_LABELS,
  type LaneKey,
  type ReviewEventTypeKey,
  type SourceSystemKey
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import {
  demoContactDetail,
  demoContacts,
  demoDashboardData,
  demoMappingsData,
  demoReviewQueue
} from "@/lib/demo-data";
import { buildCanonicalProfileFields } from "@/lib/profile";
import type {
  ContactCertification,
  ContactDetail,
  ContactNote,
  ContactListItem,
  DashboardMetric,
  DashboardData,
  MappingScreenData,
  MetricSection,
  ReviewQueueItem,
  SessionUser,
  TimelineEntry,
  WordPressCertificationPayload,
  WordPressIdentityPayload,
  WordPressProfilePayload,
  WordPressSourceEvent
} from "@/lib/types";
import {
  decodeHtmlEntities,
  formatCurrency,
  formatDateOnly,
  normalizeEmail,
  parseCurrencyAmountToCents,
  slugify
} from "@/lib/utils";

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toNullableInputJson(value: unknown) {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  return toInputJson(value);
}

function buildWordPressAdminUrl(path: string, params: Record<string, string | number | null | undefined>) {
  if (!config.wordpressBaseUrl) {
    return null;
  }

  try {
    const url = new URL(path, config.wordpressBaseUrl.endsWith("/") ? config.wordpressBaseUrl : `${config.wordpressBaseUrl}/`);

    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined || value === "") {
        continue;
      }

      url.searchParams.set(key, String(value));
    }

    return url.toString();
  } catch {
    return null;
  }
}

function assertDatabase() {
  if (!prisma) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return prisma;
}

function isStale(dateValue?: Date | null) {
  if (!dateValue) {
    return true;
  }

  return Date.now() - dateValue.getTime() > config.syncFreshnessMs;
}

function isAutoRefreshStale(source: SourceSystemKey, dateValue?: Date | null) {
  return isAutoBackgroundRefreshSource(source) && isStale(dateValue);
}

function sourceLabel(source: SourceSystemKey) {
  return SOURCE_LABELS[source];
}

function isDefaultMappingRuleName(source: SourceSystemKey, name: string) {
  return DEFAULT_MAPPING_RULES.some((rule) => rule.source === source && rule.name === name);
}

async function createContactWithPrimaryEmailTx(
  tx: Prisma.TransactionClient,
  options: {
    email: string;
    displayName?: string | null;
    source?: SourceSystemKey | PrismaSourceSystem;
  }
) {
  const normalized = normalizeEmail(options.email);
  if (!normalized) {
    throw new Error("A valid email address is required.");
  }

  const existingEmail = await tx.contactEmail.findUnique({
    where: { normalizedEmail: normalized },
    select: { contactId: true }
  });

  if (existingEmail?.contactId) {
    return existingEmail.contactId;
  }

  const contact = await tx.contact.create({
    data: {
      displayName: options.displayName?.trim() || normalized
    }
  });

  const emailRecord = await tx.contactEmail.create({
    data: {
      contactId: contact.id,
      email: options.email.trim(),
      normalizedEmail: normalized,
      isPrimary: true,
      source: (options.source ?? PrismaSourceSystem.MANUAL) as PrismaSourceSystem
    }
  });

  await tx.contact.update({
    where: { id: contact.id },
    data: {
      primaryEmailId: emailRecord.id
    }
  });

  return contact.id;
}

async function importUnmatchedEventToContact(
  tx: Prisma.TransactionClient,
  unmatched: {
    id: string;
    source: PrismaSourceSystem;
    sourceEventId: string;
    sourceCursor: string | null;
    occurredAt: Date;
    eventKind: string | null;
    laneKey: PrismaLaneKey | null;
    rawPayload: Prisma.JsonValue;
    metadata: Prisma.JsonValue;
  },
  contactId: string
) {
  const metadata = (unmatched.metadata as Record<string, unknown> | null) ?? {};
  const rawPayload = (unmatched.rawPayload as Record<string, unknown> | null) ?? {};

  await tx.timelineEvent.upsert({
    where: {
      source_sourceEventId: {
        source: unmatched.source,
        sourceEventId: unmatched.sourceEventId
      }
    },
    update: {
      contactId,
      sourceCursor: unmatched.sourceCursor,
      occurredAt: unmatched.occurredAt,
      eventKind: unmatched.eventKind ?? "manual_assignment",
      laneKey: (unmatched.laneKey ?? PrismaLaneKey.OTHER) as PrismaLaneKey,
      title: decodeHtmlEntities(typeof metadata.title === "string" ? metadata.title : "Imported interaction") ?? "Imported interaction",
      summary: decodeHtmlEntities(typeof metadata.summary === "string" ? metadata.summary : null),
      amountCents: typeof metadata.amountCents === "number" ? metadata.amountCents : null,
      currency: typeof metadata.currency === "string" ? metadata.currency : "USD",
      metadata: toInputJson(rawPayload),
      rawPayload: toInputJson(rawPayload)
    },
    create: {
      contactId,
      source: unmatched.source,
      sourceEventId: unmatched.sourceEventId,
      sourceCursor: unmatched.sourceCursor,
      occurredAt: unmatched.occurredAt,
      eventKind: unmatched.eventKind ?? "manual_assignment",
      laneKey: (unmatched.laneKey ?? PrismaLaneKey.OTHER) as PrismaLaneKey,
      title: decodeHtmlEntities(typeof metadata.title === "string" ? metadata.title : "Imported interaction") ?? "Imported interaction",
      summary: decodeHtmlEntities(typeof metadata.summary === "string" ? metadata.summary : null),
      amountCents: typeof metadata.amountCents === "number" ? metadata.amountCents : null,
      currency: typeof metadata.currency === "string" ? metadata.currency : "USD",
      metadata: toInputJson(rawPayload),
      rawPayload: toInputJson(rawPayload)
    }
  });

  const payloadProfile = rawPayload.profile as WordPressProfilePayload | undefined;
  const payloadIdentities = Array.isArray(rawPayload.identities)
    ? (rawPayload.identities as WordPressIdentityPayload[])
    : [];

  if (payloadProfile) {
    await persistProfileValues(tx, {
      contactId,
      source: unmatched.source,
      profile: payloadProfile,
      occurredAt: unmatched.occurredAt
    });

    if (Array.isArray(payloadProfile.certifications)) {
      await persistContactCertifications(tx, {
        contactId,
        source: unmatched.source,
        certifications: payloadProfile.certifications,
        observedAt: unmatched.occurredAt
      });
    }
  }

  if (payloadIdentities.length > 0) {
    await persistExternalIdentities(tx, {
      contactId,
      source: unmatched.source,
      identities: payloadIdentities
    });
  }

  await tx.unmatchedEvent.update({
    where: { id: unmatched.id },
    data: {
      status: ReviewStatus.ASSIGNED,
      assignedContactId: contactId,
      resolvedAt: new Date()
    }
  });
}

function mapTimelineEntry(input: {
  id: string;
  recordType?: "IMPORTED" | "MANUAL";
  laneKey: PrismaLaneKey;
  eventKind: string;
  typeLabel?: string;
  title: string;
  summary: string | null;
  occurredAt: Date;
  source: PrismaSourceSystem;
  amountCents?: number | null;
  currency?: string | null;
  metadata?: unknown;
  rawPayload?: unknown;
  manualInteractionTypeId?: string | null;
}): TimelineEntry {
  const sourceLink = buildWordPressSourceLink({
    eventKind: input.eventKind,
    source: input.source as SourceSystemKey,
    metadata: (input.metadata as Record<string, unknown> | null | undefined) ?? null,
    rawPayload: (input.rawPayload as Record<string, unknown> | null | undefined) ?? null
  });

  return {
    id: input.id,
    recordType: input.recordType ?? "IMPORTED",
    laneKey: input.laneKey as LaneKey,
    eventKind: input.eventKind,
    typeLabel:
      input.typeLabel ??
      findReviewEventType(input.eventKind, input.laneKey as LaneKey)?.label ??
      input.eventKind.replaceAll("_", " "),
    title: decodeHtmlEntities(input.title) ?? input.title,
    summary: decodeHtmlEntities(input.summary),
    occurredAt: input.occurredAt.toISOString(),
    source: input.source as SourceSystemKey,
    amountLabel: formatCurrency(input.amountCents ?? null, input.currency ?? "USD"),
    metadata: (input.metadata as Record<string, unknown> | null | undefined) ?? null,
    sourceAdminUrl: sourceLink?.url ?? null,
    sourceAdminLabel: sourceLink?.label ?? null,
    manualInteractionTypeId: input.manualInteractionTypeId ?? null
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_DAYS = 365.25;

interface MetricActivity {
  occurredAt: Date;
  laneKey: LaneKey;
  eventKind: string;
  amountCents?: number | null;
  metadata?: Prisma.JsonValue | null;
}

function metric(
  id: string,
  label: string,
  value: string,
  detail: string,
  laneKey: LaneKey
): DashboardMetric {
  return {
    id,
    label,
    value,
    detail,
    laneKey
  };
}

function toJsonRecord(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readRecordNumberValue(record: Record<string, unknown> | null | undefined, key: string) {
  return readJsonNumber(record?.[key]);
}

function buildWordPressSourceLink(input: {
  source: SourceSystemKey;
  eventKind: string;
  metadata: Record<string, unknown> | null;
  rawPayload: Record<string, unknown> | null;
  labelMode?: "action" | "reference";
}) {
  const metadata = input.metadata;
  const rawPayload = input.rawPayload;
  const labelMode = input.labelMode ?? "action";

  if (input.source === "WOOCOMMERCE") {
    const orderId = readRecordNumberValue(metadata, "orderId") ?? readRecordNumberValue(rawPayload, "orderId");
    if (orderId) {
      return {
        label: labelMode === "reference" ? `Order #${Math.round(orderId)}` : "Open order",
        url: buildWordPressAdminUrl("/wp-admin/post.php", {
          post: Math.round(orderId),
          action: "edit"
        })
      };
    }

    const membershipId =
      readRecordNumberValue(metadata, "membershipId") ?? readRecordNumberValue(rawPayload, "membershipId");
    if (membershipId) {
      return {
        label: labelMode === "reference" ? `Membership #${Math.round(membershipId)}` : "Open membership",
        url: buildWordPressAdminUrl("/wp-admin/post.php", {
          post: Math.round(membershipId),
          action: "edit"
        })
      };
    }
  }

  if (input.source === "GRAVITY_FORMS") {
    const formId = readRecordNumberValue(metadata, "formId") ?? readRecordNumberValue(rawPayload, "formId");
    const entryId = readRecordNumberValue(rawPayload, "entryId");
    if (formId && entryId) {
      return {
        label: labelMode === "reference" ? `Entry #${Math.round(entryId)}` : "Open entry",
        url: buildWordPressAdminUrl("/wp-admin/admin.php", {
          page: "gf_entries",
          view: "entry",
          id: Math.round(formId),
          lid: Math.round(entryId)
        })
      };
    }
  }

  return null;
}

function readJsonNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function readAmountCentsFromMetadata(metadata: Prisma.JsonValue | null | undefined) {
  const record = toJsonRecord(metadata);
  const amountCents = readJsonNumber(record?.amountCents);

  if (amountCents === null) {
    return null;
  }

  return Math.round(amountCents);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatMetricCurrency(amountCents?: number | null) {
  return formatCurrency(amountCents ?? null, "USD") ?? "—";
}

function formatHours(minutes: number) {
  if (minutes <= 0) {
    return "0h";
  }

  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1)}h`;
}

function dayDifference(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

function monthsDifference(from: Date, to: Date) {
  return Math.max(1, Math.round(dayDifference(from, to) / 30.4375));
}

function extractPhotoUrlFromRawPayload(rawPayload: Prisma.JsonValue | null | undefined) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const profile = (rawPayload as Record<string, unknown>).profile;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return null;
  }

  const photoUrl = (profile as Record<string, unknown>).photoUrl;
  if (typeof photoUrl !== "string" || !photoUrl.trim()) {
    return null;
  }

  return photoUrl.trim();
}

function mapContactListItem(contact: {
  id: string;
  displayName: string | null;
  isFavorite: boolean;
  manualRoleTags: PrismaContactManualRoleTag[];
  primaryEmailId: string | null;
  emails: Array<{
    id: string;
    email: string;
    isPrimary: boolean;
  }>;
  timelineEvents: Array<{
    laneKey: PrismaLaneKey;
    occurredAt: Date;
    rawPayload?: Prisma.JsonValue | null;
  }>;
  manualInteractions?: Array<{
    laneKey: PrismaLaneKey;
    occurredAt: Date;
  }>;
}, options?: {
  isActive?: boolean;
  hasDonorRole?: boolean;
}): ContactListItem {
  const primaryEmail =
    contact.emails.find((email) => email.id === contact.primaryEmailId) ??
    contact.emails.find((email) => email.isPrimary) ??
    contact.emails[0] ??
    null;
  const photoUrl =
    contact.timelineEvents
      .map((event) => extractPhotoUrlFromRawPayload(event.rawPayload))
      .find((value): value is string => Boolean(value)) ?? null;
  const combinedInteractions = [
    ...contact.timelineEvents.map((event) => ({
      laneKey: event.laneKey as LaneKey,
      occurredAt: event.occurredAt
    })),
    ...(contact.manualInteractions ?? []).map((interaction) => ({
      laneKey: interaction.laneKey as LaneKey,
      occurredAt: interaction.occurredAt
    }))
  ].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());

  return {
    id: contact.id,
    displayName: contact.displayName ?? primaryEmail?.email ?? "Unnamed contact",
    primaryEmail: primaryEmail?.email ?? null,
    photoUrl,
    isActive: options?.isActive ?? hasRecentNonEmailInteraction(combinedInteractions),
    isFavorite: contact.isFavorite,
    effectiveRoleTags: buildEffectiveRoleTags({
      manualRoleTags: contact.manualRoleTags as ContactManualRoleTagKey[],
      hasDonorHistory: options?.hasDonorRole ?? false
    }),
    recentLaneKeys: Array.from(new Set(combinedInteractions.map((event) => event.laneKey))),
    lastInteractionAt: combinedInteractions[0]?.occurredAt.toISOString() ?? null
  };
}

function hasRecentNonEmailInteraction(
  interactions: Array<{
    laneKey: LaneKey;
    occurredAt: Date | string;
  }>,
  now = new Date()
) {
  const activeSince = now.getTime() - 365 * DAY_MS;

  return interactions.some((interaction) => {
    if (interaction.laneKey === "EMAIL") {
      return false;
    }

    return new Date(interaction.occurredAt).getTime() >= activeSince;
  });
}

function certificationStatusSortPriority(statusKey?: string | null) {
  switch ((statusKey ?? "").toLowerCase()) {
    case "active":
      return 0;
    case "expiring":
      return 1;
    case "no_expiration":
      return 2;
    case "unknown":
      return 3;
    case "expired":
      return 4;
    default:
      return 5;
  }
}

function mapContactCertifications(
  certifications: Array<{
    certificationId: string;
    source: PrismaSourceSystem;
    name: string;
    statusKey: string | null;
    statusLabel: string | null;
    lastUsedAt: Date | null;
    lastUsedLabel: string | null;
    expiresAt: Date | null;
    expiresLabel: string | null;
    detail: string | null;
    imageUrl: string | null;
    observedAt: Date;
  }>
): ContactCertification[] {
  return [...certifications]
    .sort((left, right) => {
      const priorityDifference =
        certificationStatusSortPriority(left.statusKey) - certificationStatusSortPriority(right.statusKey);
      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      const expiryDifference =
        (left.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY) -
        (right.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY);
      if (expiryDifference !== 0) {
        return expiryDifference;
      }

      const observedDifference = right.observedAt.getTime() - left.observedAt.getTime();
      if (observedDifference !== 0) {
        return observedDifference;
      }

      return left.name.localeCompare(right.name);
    })
    .map((certification) => ({
      id: certification.certificationId,
      name: certification.name,
      source: certification.source as SourceSystemKey,
      statusKey: certification.statusKey,
      statusLabel: certification.statusLabel,
      lastUsedAt: certification.lastUsedAt?.toISOString() ?? null,
      lastUsedLabel: certification.lastUsedLabel,
      expiresAt: certification.expiresAt?.toISOString() ?? null,
      expiresLabel: certification.expiresLabel,
      detail: certification.detail,
      imageUrl: certification.imageUrl
    }));
}

async function getActiveContactIds(db: ReturnType<typeof assertDatabase> | Prisma.TransactionClient, contactIds: string[]) {
  if (contactIds.length === 0) {
    return new Set<string>();
  }

  const activeSince = new Date(Date.now() - 365 * DAY_MS);
  const [timelineMatches, manualMatches] = await Promise.all([
    db.timelineEvent.findMany({
      where: {
        contactId: { in: contactIds },
        laneKey: { not: PrismaLaneKey.EMAIL },
        occurredAt: { gte: activeSince }
      },
      select: {
        contactId: true
      },
      distinct: ["contactId"]
    }),
    db.manualInteraction.findMany({
      where: {
        contactId: { in: contactIds },
        laneKey: { not: PrismaLaneKey.EMAIL },
        occurredAt: { gte: activeSince }
      },
      select: {
        contactId: true
      },
      distinct: ["contactId"]
    })
  ]);

  return new Set<string>([
    ...timelineMatches.map((entry) => entry.contactId),
    ...manualMatches.map((entry) => entry.contactId)
  ]);
}

async function getDonorContactIds(
  db: ReturnType<typeof assertDatabase> | Prisma.TransactionClient,
  contactIds?: string[]
) {
  if (contactIds && contactIds.length === 0) {
    return new Set<string>();
  }

  const withContactFilter =
    contactIds && contactIds.length > 0
      ? {
          contactId: {
            in: contactIds
          }
        }
      : {};

  const [timelineMatches, manualMatches] = await Promise.all([
    db.timelineEvent.findMany({
      where: {
        eventKind: "donation",
        ...withContactFilter
      },
      select: {
        contactId: true
      },
      distinct: ["contactId"]
    }),
    db.manualInteraction.findMany({
      where: {
        ...withContactFilter,
        interactionType: {
          is: {
            slug: "donation"
          }
        }
      },
      select: {
        contactId: true
      },
      distinct: ["contactId"]
    })
  ]);

  return new Set<string>([
    ...timelineMatches.map((entry) => entry.contactId),
    ...manualMatches.map((entry) => entry.contactId)
  ]);
}

function compareDateValuesDesc(left?: string | Date | null, right?: string | Date | null) {
  const leftValue = left ? new Date(left).getTime() : Number.NEGATIVE_INFINITY;
  const rightValue = right ? new Date(right).getTime() : Number.NEGATIVE_INFINITY;

  return rightValue - leftValue;
}

function compareStringsAsc(left: string, right: string) {
  return left.localeCompare(right, undefined, {
    sensitivity: "base",
    numeric: true
  });
}

function getLastNameSortValue(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "";
  }

  return parts[parts.length - 1]?.toLowerCase() ?? "";
}

function sortContactListItems(
  contacts: ContactListItem[],
  sortBy: PeopleSortKey,
  aggregates?: {
    donorLevelCentsByContactId?: Map<string, number>;
    volunteerMinutesByContactId?: Map<string, number>;
    spaceUseCountByContactId?: Map<string, number>;
  }
) {
  const donorLevelCentsByContactId = aggregates?.donorLevelCentsByContactId ?? new Map<string, number>();
  const volunteerMinutesByContactId = aggregates?.volunteerMinutesByContactId ?? new Map<string, number>();
  const spaceUseCountByContactId = aggregates?.spaceUseCountByContactId ?? new Map<string, number>();

  return [...contacts].sort((left, right) => {
    if (left.isActive !== right.isActive) {
      return left.isActive ? -1 : 1;
    }

    if (sortBy === "LAST_NAME") {
      const byLastName = compareStringsAsc(
        getLastNameSortValue(left.displayName),
        getLastNameSortValue(right.displayName)
      );
      if (byLastName !== 0) {
        return byLastName;
      }

      const byName = compareStringsAsc(left.displayName, right.displayName);
      if (byName !== 0) {
        return byName;
      }

      return compareDateValuesDesc(left.lastInteractionAt, right.lastInteractionAt);
    }

    if (sortBy === "DONOR_LEVEL") {
      const byGiving =
        (donorLevelCentsByContactId.get(right.id) ?? 0) - (donorLevelCentsByContactId.get(left.id) ?? 0);
      if (byGiving !== 0) {
        return byGiving;
      }

      const byRecent = compareDateValuesDesc(left.lastInteractionAt, right.lastInteractionAt);
      if (byRecent !== 0) {
        return byRecent;
      }

      return compareStringsAsc(left.displayName, right.displayName);
    }

    if (sortBy === "VOLUNTEER_HOURS") {
      const byVolunteerHours =
        (volunteerMinutesByContactId.get(right.id) ?? 0) - (volunteerMinutesByContactId.get(left.id) ?? 0);
      if (byVolunteerHours !== 0) {
        return byVolunteerHours;
      }

      const byRecent = compareDateValuesDesc(left.lastInteractionAt, right.lastInteractionAt);
      if (byRecent !== 0) {
        return byRecent;
      }

      return compareStringsAsc(left.displayName, right.displayName);
    }

    if (sortBy === "SPACE_USE_FREQUENCY") {
      const bySpaceUseCount =
        (spaceUseCountByContactId.get(right.id) ?? 0) - (spaceUseCountByContactId.get(left.id) ?? 0);
      if (bySpaceUseCount !== 0) {
        return bySpaceUseCount;
      }

      const byRecent = compareDateValuesDesc(left.lastInteractionAt, right.lastInteractionAt);
      if (byRecent !== 0) {
        return byRecent;
      }

      return compareStringsAsc(left.displayName, right.displayName);
    }

    const byRecent = compareDateValuesDesc(left.lastInteractionAt, right.lastInteractionAt);
    if (byRecent !== 0) {
      return byRecent;
    }

    return compareStringsAsc(left.displayName, right.displayName);
  });
}

function getAvailableRoleTags() {
  return CONTACT_EFFECTIVE_ROLE_TAGS.map((key) => ({
    key,
    label: CONTACT_ROLE_TAG_META[key].label
  }));
}

async function getContactIdsForEffectiveRoleTag(
  db: ReturnType<typeof assertDatabase>,
  roleTag: ContactEffectiveRoleTagKey
) {
  if (roleTag === "DONOR") {
    const donorIds = await getDonorContactIds(db);
    if (donorIds.size === 0) {
      return [];
    }

    const contacts = await db.contact.findMany({
      where: {
        mergedIntoId: null,
        id: {
          in: Array.from(donorIds)
        }
      },
      select: {
        id: true
      }
    });

    return contacts.map((contact) => contact.id);
  }

  const contacts = await db.contact.findMany({
    where: {
      mergedIntoId: null,
      manualRoleTags: {
        has: roleTag as PrismaContactManualRoleTag
      }
    },
    select: {
      id: true
    }
  });

  return contacts.map((contact) => contact.id);
}

function buildContactNoteContent(input: {
  title: string | null;
  body: string | null;
}) {
  const title = input.title?.trim() ?? "";
  const body = input.body?.trim() ?? "";

  if (body && title && title.toLowerCase() !== "note") {
    return `${title}\n${body}`;
  }

  if (body) {
    return body;
  }

  return title || "Note";
}

function scoreBand(score: number) {
  if (score >= 75) {
    return "High";
  }

  if (score >= 45) {
    return "Moderate";
  }

  return "Low";
}

function churnRiskBand(score: number) {
  if (score >= 70) {
    return "High risk";
  }

  if (score >= 40) {
    return "Watch";
  }

  return "Low risk";
}

function averageDonationIntervalDays(donations: MetricActivity[]) {
  if (donations.length < 2) {
    return null;
  }

  const ascending = [...donations].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
  let totalGapDays = 0;

  for (let index = 1; index < ascending.length; index += 1) {
    totalGapDays += dayDifference(ascending[index - 1]!.occurredAt, ascending[index]!.occurredAt);
  }

  return totalGapDays / (ascending.length - 1);
}

function detectRecurringDonationAmount(donations: MetricActivity[], now: Date) {
  const donationsWithAmount = donations
    .filter(
      (donation): donation is MetricActivity & { amountCents: number } =>
        typeof donation.amountCents === "number" && donation.amountCents > 0
    )
    .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());

  const groups = new Map<number, Date[]>();
  for (const donation of donationsWithAmount) {
    const dates = groups.get(donation.amountCents) ?? [];
    dates.push(donation.occurredAt);
    groups.set(donation.amountCents, dates);
  }

  const cadenceWindows = [
    [20, 45],
    [75, 105],
    [165, 200],
    [330, 390]
  ] as const;

  let bestCandidate: { amountCents: number; count: number; lastAt: number } | null = null;

  for (const [amountCents, dates] of groups.entries()) {
    if (dates.length < 3) {
      continue;
    }

    const intervals = dates.slice(1).map((date, index) => dayDifference(dates[index]!, date));
    const averageInterval = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    const matchesCadence = cadenceWindows.some(
      ([minDays, maxDays]) => averageInterval >= minDays && averageInterval <= maxDays
    );

    if (!matchesCadence) {
      continue;
    }

    const lastAt = dates[dates.length - 1]!.getTime();
    if (dayDifference(new Date(lastAt), now) > 450) {
      continue;
    }

    if (
      !bestCandidate ||
      dates.length > bestCandidate.count ||
      (dates.length === bestCandidate.count && lastAt > bestCandidate.lastAt) ||
      (dates.length === bestCandidate.count &&
        lastAt === bestCandidate.lastAt &&
        amountCents > bestCandidate.amountCents)
    ) {
      bestCandidate = {
        amountCents,
        count: dates.length,
        lastAt
      };
    }
  }

  return bestCandidate?.amountCents ?? null;
}

function buildContactMetricSections(input: {
  importedActivities: MetricActivity[];
  manualActivities: MetricActivity[];
}): MetricSection[] {
  const now = new Date();
  const allActivities = [...input.importedActivities, ...input.manualActivities].sort(
    (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime()
  );

  const donationEvents = allActivities.filter((event) => event.eventKind === "donation");
  const donationAmounts = donationEvents.filter(
    (event): event is MetricActivity & { amountCents: number } => typeof event.amountCents === "number"
  );
  const sortedDonationsAsc = [...donationEvents].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
  const sortedDonationsDesc = [...sortedDonationsAsc].reverse();
  const latestDonation = sortedDonationsDesc[0] ?? null;
  const firstDonation = sortedDonationsAsc[0] ?? null;
  const lifetimeGivingCents = donationAmounts.reduce((sum, event) => sum + event.amountCents, 0);
  const largestDonationCents = donationAmounts.reduce((largest, event) => Math.max(largest, event.amountCents), 0);
  const averageDonationCents =
    donationAmounts.length > 0 ? Math.round(lifetimeGivingCents / donationAmounts.length) : null;
  const givingIntervalDays = averageDonationIntervalDays(donationEvents);
  const recurringDonationCents = detectRecurringDonationAmount(donationEvents, now);

  const eventAttendanceCount = allActivities.filter((event) => event.laneKey === "COMMUNITY_EVENT").length;
  const classCount = allActivities.filter((event) => event.laneKey === "CLASS").length;
  const emailSendCount = input.importedActivities.filter((event) => event.eventKind === "email_send").length;
  const emailClickEvents = input.importedActivities.filter((event) => event.eventKind === "email_click");
  const emailClickCount = emailClickEvents.length;
  const lastEmailClick =
    [...emailClickEvents].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())[0] ?? null;

  const volunteerShiftEvents = input.importedActivities.filter((event) => event.eventKind === "volunteer_shift");
  const volunteerMinutes = volunteerShiftEvents.reduce((sum, event) => {
    const metadata = toJsonRecord(event.metadata);
    return sum + Math.max(0, readJsonNumber(metadata?.durationMinutes) ?? 0);
  }, 0);

  const memberEvents = allActivities.filter((event) => event.laneKey === "MEMBER");
  const firstActivity = allActivities[allActivities.length - 1] ?? null;
  const lastActivity = allActivities[0] ?? null;
  const yearsActive = firstActivity ? dayDifference(firstActivity.occurredAt, now) / YEAR_DAYS : 0;
  const daysSinceLastDonation = latestDonation ? dayDifference(latestDonation.occurredAt, now) : null;
  const daysSinceLastEngagement = lastActivity ? dayDifference(lastActivity.occurredAt, now) : null;
  const lastClickDays = lastEmailClick ? dayDifference(lastEmailClick.occurredAt, now) : null;

  let donorRetentionValue = "None";
  let donorRetentionDetail = "No donor history";
  if (donationEvents.length > 0) {
    const rollingYearAgo = new Date(now.getTime() - 365 * DAY_MS);
    const rollingTwoYearsAgo = new Date(now.getTime() - 730 * DAY_MS);
    const currentYearCount = donationEvents.filter((event) => event.occurredAt >= rollingYearAgo).length;
    const priorYearCount = donationEvents.filter(
      (event) => event.occurredAt < rollingYearAgo && event.occurredAt >= rollingTwoYearsAgo
    ).length;

    if (currentYearCount > 0 && priorYearCount > 0) {
      donorRetentionValue = "Retained";
      donorRetentionDetail = `${formatCount(currentYearCount)} gifts in the last 12 months`;
    } else if (currentYearCount > 0 && priorYearCount === 0 && donationEvents.length === currentYearCount) {
      donorRetentionValue = "New";
      donorRetentionDetail = "First donor year on record";
    } else if (currentYearCount > 0 && priorYearCount === 0) {
      donorRetentionValue = "Reactivated";
      donorRetentionDetail = "Gave again after a gap year";
    } else if ((daysSinceLastDonation ?? 0) <= 730) {
      donorRetentionValue = "At risk";
      donorRetentionDetail = "No gifts in the last 12 months";
    } else {
      donorRetentionValue = "Lapsed";
      donorRetentionDetail = "More than 24 months since last gift";
    }
  }

  let lapsedDonorValue = "None";
  let lapsedDonorDetail = "No donor history";
  if (daysSinceLastDonation !== null) {
    if (daysSinceLastDonation > 365) {
      lapsedDonorValue = "Lapsed";
      lapsedDonorDetail = `${formatCount(daysSinceLastDonation)} days since last gift`;
    } else if (daysSinceLastDonation > 300) {
      lapsedDonorValue = "Watch";
      lapsedDonorDetail = "Approaching a year without a gift";
    } else {
      lapsedDonorValue = "Active";
      lapsedDonorDetail = `${formatCount(daysSinceLastDonation)} days since last gift`;
    }
  }

  let churnRiskScore = 0;
  if (daysSinceLastEngagement !== null) {
    if (daysSinceLastEngagement > 180) {
      churnRiskScore += 35;
    } else if (daysSinceLastEngagement > 90) {
      churnRiskScore += 20;
    } else if (daysSinceLastEngagement > 30) {
      churnRiskScore += 10;
    }
  }

  if (daysSinceLastDonation !== null) {
    if (daysSinceLastDonation > 365) {
      churnRiskScore += 35;
    } else if (daysSinceLastDonation > 180) {
      churnRiskScore += 20;
    } else if (daysSinceLastDonation > 90) {
      churnRiskScore += 10;
    }
  }

  if (memberEvents.length > 0 && !memberEvents.some((event) => dayDifference(event.occurredAt, now) <= 365)) {
    churnRiskScore += 10;
  }

  if (emailClickCount === 0) {
    churnRiskScore += 10;
  } else if ((lastClickDays ?? 0) > 180) {
    churnRiskScore += 5;
  }

  if (volunteerMinutes > 0 || classCount > 0 || eventAttendanceCount > 0) {
    churnRiskScore -= 10;
  }

  const signInCount = allActivities.filter((event) => event.eventKind === "sign_in").length;
  const reservationCount = input.importedActivities.filter(
    (event) => event.eventKind === "reservation" || event.eventKind === "reservation_cancelled"
  ).length;

  if (signInCount + reservationCount >= 5) {
    churnRiskScore -= 10;
  }

  churnRiskScore = Math.max(0, Math.min(100, Math.round(churnRiskScore)));

  let donorEngagementScore = 0;
  if (donationEvents.length > 0) {
    donorEngagementScore += 20;
    if ((daysSinceLastDonation ?? 9999) <= 30) {
      donorEngagementScore += 20;
    } else if ((daysSinceLastDonation ?? 9999) <= 90) {
      donorEngagementScore += 15;
    } else if ((daysSinceLastDonation ?? 9999) <= 365) {
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

  if (volunteerMinutes > 0) {
    donorEngagementScore += 10;
  }

  if (classCount + eventAttendanceCount > 0) {
    donorEngagementScore += 10;
  }

  if (emailClickCount > 0) {
    donorEngagementScore += 5;
  }

  if ((daysSinceLastEngagement ?? 9999) <= 30) {
    donorEngagementScore += 10;
  } else if ((daysSinceLastEngagement ?? 9999) <= 90) {
    donorEngagementScore += 5;
  }

  donorEngagementScore = Math.max(0, Math.min(100, Math.round(donorEngagementScore)));

  let communityValueScore = 0;
  if (memberEvents.length > 0) {
    communityValueScore += 15;
  }

  if (donationEvents.length > 0) {
    communityValueScore += 10;
    if (lifetimeGivingCents >= 50000) {
      communityValueScore += 5;
    }
  }

  if (volunteerMinutes >= 1200) {
    communityValueScore += 20;
  } else if (volunteerMinutes >= 600) {
    communityValueScore += 15;
  } else if (volunteerMinutes > 0) {
    communityValueScore += 8;
  }

  if (classCount >= 10) {
    communityValueScore += 15;
  } else if (classCount >= 5) {
    communityValueScore += 10;
  } else if (classCount > 0) {
    communityValueScore += 5;
  }

  if (eventAttendanceCount >= 5) {
    communityValueScore += 10;
  } else if (eventAttendanceCount > 0) {
    communityValueScore += 5;
  }

  if (signInCount + reservationCount >= 20) {
    communityValueScore += 10;
  } else if (signInCount + reservationCount >= 5) {
    communityValueScore += 5;
  }

  if (emailClickCount >= 5) {
    communityValueScore += 10;
  } else if (emailClickCount > 0) {
    communityValueScore += 5;
  }

  if ((daysSinceLastEngagement ?? 9999) <= 60) {
    communityValueScore += 10;
  } else if ((daysSinceLastEngagement ?? 9999) <= 180) {
    communityValueScore += 5;
  }

  communityValueScore = Math.max(0, Math.min(100, Math.round(communityValueScore)));

  const membershipDonorOverlapValue =
    donationEvents.length > 0 && memberEvents.length > 0
      ? "Yes"
      : donationEvents.length > 0 || memberEvents.length > 0
        ? "No"
        : "N/A";
  const membershipDonorOverlapDetail =
    membershipDonorOverlapValue === "Yes"
      ? "Member and donor history on record"
      : membershipDonorOverlapValue === "No"
        ? "Only one side of the relationship is on record"
        : "No member or donor history yet";

  const firstVolunteerActivity =
    [...allActivities]
      .filter((event) => event.laneKey === "VOLUNTEER")
      .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())[0] ?? null;
  let volunteerToDonorValue = "N/A";
  let volunteerToDonorDetail = "No volunteer history";

  if (firstVolunteerActivity && firstDonation) {
    if (firstVolunteerActivity.occurredAt.getTime() <= firstDonation.occurredAt.getTime()) {
      volunteerToDonorValue = "Yes";
      volunteerToDonorDetail = `${formatCount(dayDifference(firstVolunteerActivity.occurredAt, firstDonation.occurredAt))} days from first volunteer activity to first gift`;
    } else {
      volunteerToDonorValue = "Donor first";
      volunteerToDonorDetail = "First gift predates volunteer history";
    }
  } else if (firstVolunteerActivity) {
    volunteerToDonorValue = "Not yet";
    volunteerToDonorDetail = `Volunteer history starts ${formatDateOnly(firstVolunteerActivity.occurredAt)}`;
  }

  let majorDonorPotentialScore = 0;
  if (largestDonationCents >= 50000) {
    majorDonorPotentialScore += 35;
  } else if (largestDonationCents >= 25000) {
    majorDonorPotentialScore += 25;
  } else if (largestDonationCents >= 10000) {
    majorDonorPotentialScore += 15;
  } else if (largestDonationCents > 0) {
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

  if (donorRetentionValue === "Retained" || donorRetentionValue === "Reactivated") {
    majorDonorPotentialScore += 10;
  }

  if (memberEvents.length > 0) {
    majorDonorPotentialScore += 10;
  }

  if (volunteerMinutes >= 300) {
    majorDonorPotentialScore += 10;
  }

  if (emailClickCount >= 3) {
    majorDonorPotentialScore += 5;
  }

  majorDonorPotentialScore = Math.max(0, Math.min(100, Math.round(majorDonorPotentialScore)));

  let ambassadorScore = 0;
  if (emailClickCount >= 3) {
    ambassadorScore += 20;
  } else if (emailClickCount > 0) {
    ambassadorScore += 10;
  }

  if (volunteerMinutes >= 600) {
    ambassadorScore += 20;
  } else if (volunteerMinutes > 0) {
    ambassadorScore += 10;
  }

  if (eventAttendanceCount >= 3) {
    ambassadorScore += 15;
  } else if (eventAttendanceCount > 0) {
    ambassadorScore += 8;
  }

  if (classCount >= 3) {
    ambassadorScore += 15;
  } else if (classCount > 0) {
    ambassadorScore += 8;
  }

  if (yearsActive >= 2) {
    ambassadorScore += 10;
  } else if (yearsActive > 0.5) {
    ambassadorScore += 5;
  }

  if (memberEvents.length > 0) {
    ambassadorScore += 10;
  }

  if (signInCount + reservationCount >= 5) {
    ambassadorScore += 10;
  }

  ambassadorScore = Math.max(0, Math.min(100, Math.round(ambassadorScore)));

  return [
    {
      id: "giving-financial",
      title: "Giving & financial",
      metrics: [
        metric("lifetime-giving", "Lifetime Giving", formatMetricCurrency(lifetimeGivingCents), `${formatCount(donationEvents.length)} gifts on record`, "DONOR"),
        metric("donation-count", "Total Number of Donations", formatCount(donationEvents.length), "Donation events on record", "DONOR"),
        metric("average-donation", "Average Donation Amount", averageDonationCents !== null ? formatMetricCurrency(averageDonationCents) : "—", donationAmounts.length > 0 ? `Across ${formatCount(donationAmounts.length)} gifts with amounts` : "No donation amounts yet", "DONOR"),
        metric("largest-donation", "Largest Donation", largestDonationCents > 0 ? formatMetricCurrency(largestDonationCents) : "—", largestDonationCents > 0 ? "Single largest recorded gift" : "No donation amounts yet", "DONOR"),
        metric("first-donation", "First Donation Amount", firstDonation?.amountCents != null ? formatMetricCurrency(firstDonation.amountCents) : "—", firstDonation ? formatDateOnly(firstDonation.occurredAt) : "No donor history", "DONOR"),
        metric("recent-donation", "Most Recent Donation Amount", latestDonation?.amountCents != null ? formatMetricCurrency(latestDonation.amountCents) : "—", latestDonation ? formatDateOnly(latestDonation.occurredAt) : "No donor history", "DONOR"),
        metric("giving-frequency", "Giving Frequency", givingIntervalDays !== null ? `Every ${formatCount(Math.round(givingIntervalDays))}d` : donationEvents.length === 1 ? "One-time" : "—", donationEvents.length > 1 ? "Average gap between gifts" : donationEvents.length === 1 ? "Only one gift on record" : "No donor history", "DONOR"),
        metric("recurring-donation", "Recurring Donation Value", recurringDonationCents !== null ? formatMetricCurrency(recurringDonationCents) : "—", recurringDonationCents !== null ? "Detected repeated same-amount gift pattern" : "No recurring pattern detected", "DONOR")
      ]
    },
    {
      id: "engagement",
      title: "Engagement",
      metrics: [
        metric("event-attendance", "Event Attendance Count", formatCount(eventAttendanceCount), "Community event interactions", "COMMUNITY_EVENT"),
        metric("last-engagement", "Last Engagement Date", lastActivity ? formatDateOnly(lastActivity.occurredAt) : "—", lastActivity ? "Most recent recorded interaction" : "No interactions on record", "OTHER"),
        metric("volunteer-hours", "Volunteer Hours", formatHours(volunteerMinutes), volunteerShiftEvents.length > 0 ? `${formatCount(volunteerShiftEvents.length)} completed shifts` : "No completed volunteer shifts", "VOLUNTEER"),
        metric("class-count", "Program / Class Count", formatCount(classCount), "Program and class interactions", "CLASS"),
        metric("total-emails", "Total Emails", formatCount(emailSendCount), "Newsletter send records", "EMAIL"),
        metric("total-email-clicks", "Total Email Clicks", formatCount(emailClickCount), emailClickCount > 0 && lastEmailClick ? `Most recent click ${formatDateOnly(lastEmailClick.occurredAt)}` : "No email clicks on record", "EMAIL")
      ]
    },
    {
      id: "retention-risk",
      title: "Retention & risk",
      metrics: [
        metric("days-since-donation", "Days Since Last Donation", daysSinceLastDonation !== null ? formatCount(daysSinceLastDonation) : "—", latestDonation ? formatDateOnly(latestDonation.occurredAt) : "No donor history", "DONOR"),
        metric("donor-retention", "Donor Retention Status", donorRetentionValue, donorRetentionDetail, "DONOR"),
        metric("years-active", "Years Active", firstActivity ? yearsActive < 1 ? `${formatCount(monthsDifference(firstActivity.occurredAt, now))} mos` : `${yearsActive < 10 ? yearsActive.toFixed(1) : yearsActive.toFixed(0)} yrs` : "—", firstActivity ? `Since ${formatDateOnly(firstActivity.occurredAt)}` : "No interactions on record", "MEMBER"),
        metric("churn-risk", "Churn Risk Score", formatCount(churnRiskScore), churnRiskBand(churnRiskScore), "OTHER"),
        metric("lapsed-donor", "Lapsed Donor Status", lapsedDonorValue, lapsedDonorDetail, "DONOR")
      ]
    },
    {
      id: "strategic-composite",
      title: "Strategic / composite",
      metrics: [
        metric("donor-engagement", "Donor Engagement Score", formatCount(donorEngagementScore), scoreBand(donorEngagementScore), "DONOR"),
        metric("community-value", "Community Value Score", formatCount(communityValueScore), scoreBand(communityValueScore), "COMMUNITY_EVENT"),
        metric("member-donor-overlap", "Membership + Donor Overlap", membershipDonorOverlapValue, membershipDonorOverlapDetail, "MEMBER"),
        metric("volunteer-to-donor", "Volunteer-to-Donor Conversion", volunteerToDonorValue, volunteerToDonorDetail, "VOLUNTEER"),
        metric("major-donor-potential", "Major Donor Potential Score", formatCount(majorDonorPotentialScore), scoreBand(majorDonorPotentialScore), "DONOR"),
        metric("advocacy-score", "Advocacy / Ambassador Score", formatCount(ambassadorScore), scoreBand(ambassadorScore), "EMAIL")
      ]
    }
  ];
}

export async function getDashboardData(
  selectedRoleTag: ContactEffectiveRoleTagKey | "ALL" = "ALL"
): Promise<DashboardData> {
  if (!prisma) {
    if (selectedRoleTag === "ALL") {
      return demoDashboardData;
    }

    return {
      ...demoDashboardData,
      selectedRoleTag,
      taggedContacts: demoContacts.filter((contact) => contact.effectiveRoleTags.includes(selectedRoleTag)),
      availableRoleTags: getAvailableRoleTags()
    };
  }

  await ensureCatalogSeeded();

  const db = assertDatabase();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const selectedContactIds =
    selectedRoleTag === "ALL" ? null : await getContactIdsForEffectiveRoleTag(db, selectedRoleTag);

  const [favoriteContacts, syncStates] = await Promise.all([
    db.contact.findMany({
      where: {
        mergedIntoId: null,
        isFavorite: true
      },
      include: {
        emails: true,
        timelineEvents: {
          orderBy: { occurredAt: "desc" },
          take: 6,
          select: {
            laneKey: true,
            occurredAt: true,
            rawPayload: true
          }
        },
        manualInteractions: {
          orderBy: { occurredAt: "desc" },
          take: 6,
          select: {
            laneKey: true,
            occurredAt: true
          }
        }
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 8
    }),
    db.sourceSyncState.findMany({
      orderBy: { source: "asc" }
    })
  ]);

  const recentMetricEvents =
    selectedContactIds !== null && selectedContactIds.length === 0
      ? []
      : await db.timelineEvent.findMany({
          where: {
            occurredAt: {
              gte: thirtyDaysAgo
            },
            ...(selectedContactIds !== null
              ? {
                  contactId: {
                    in: selectedContactIds
                  }
                }
              : {})
          }
        });

  const donationEvents = recentMetricEvents.filter((event) => event.laneKey === PrismaLaneKey.DONOR);
  const membershipEvents = recentMetricEvents.filter((event) => event.laneKey === PrismaLaneKey.MEMBER);
  const signInEvents = recentMetricEvents.filter((event) => event.eventKind === "sign_in");
  const reservationEvents = recentMetricEvents.filter((event) => event.eventKind === "reservation");
  const emailSendEvents = recentMetricEvents.filter((event) => event.eventKind === "email_send");

  const metrics = [
    {
      id: "memberships",
      label: "Memberships",
      value: String(membershipEvents.length),
      detail: "Membership interactions in the last 30 days",
      laneKey: "MEMBER" as LaneKey
    },
    {
      id: "donations",
      label: "Donations",
      value: formatCurrency(
        donationEvents.reduce((sum, event) => sum + (event.amountCents ?? 0), 0),
        "USD"
      ) ?? "$0.00",
      detail: `${donationEvents.length} donor interactions in the last 30 days`,
      laneKey: "DONOR" as LaneKey
    },
    {
      id: "space-use",
      label: "Space Use",
      value: String(signInEvents.length),
      detail: "Sign-ins in the last 30 days",
      laneKey: "SPACE_USE" as LaneKey
    },
    {
      id: "reservations",
      label: "Reservations",
      value: String(reservationEvents.length),
      detail: "Reservations in the last 30 days",
      laneKey: "RESERVER" as LaneKey
    },
    {
      id: "email",
      label: "Email Sends",
      value: String(emailSendEvents.length),
      detail: "Newsletter sends in the last 30 days",
      laneKey: "EMAIL" as LaneKey
    }
  ];

  const syncStatus = syncStates.map((state) => ({
    source: state.source as SourceSystemKey,
    label: sourceLabel(state.source as SourceSystemKey),
    lastSuccessfulSyncAt: state.lastSuccessfulSyncAt?.toISOString() ?? null,
    stale: isStale(state.lastSuccessfulSyncAt)
  }));
  const favoriteContactIds = favoriteContacts.map((contact) => contact.id);
  const activeFavoriteContactIds = await getActiveContactIds(
    db,
    favoriteContactIds
  );
  const favoriteDonorContactIds = await getDonorContactIds(db, favoriteContactIds);

  let taggedContacts: ContactListItem[] = [];
  if (selectedRoleTag !== "ALL" && selectedContactIds && selectedContactIds.length > 0) {
    const taggedContactRecords = await db.contact.findMany({
      where: {
        mergedIntoId: null,
        id: {
          in: selectedContactIds
        }
      },
      include: {
        emails: true,
        timelineEvents: {
          orderBy: { occurredAt: "desc" },
          take: 6,
          select: {
            laneKey: true,
            occurredAt: true,
            rawPayload: true
          }
        },
        manualInteractions: {
          orderBy: { occurredAt: "desc" },
          take: 6,
          select: {
            laneKey: true,
            occurredAt: true
          }
        }
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    });

    const taggedContactIds = taggedContactRecords.map((contact) => contact.id);
    const activeTaggedContactIds = await getActiveContactIds(db, taggedContactIds);
    const donorTaggedContactIds =
      selectedRoleTag === "DONOR"
        ? new Set<string>(selectedContactIds)
        : await getDonorContactIds(db, taggedContactIds);

    taggedContacts = sortContactListItems(
      taggedContactRecords.map((contact) =>
        mapContactListItem(contact, {
          isActive: activeTaggedContactIds.has(contact.id),
          hasDonorRole: donorTaggedContactIds.has(contact.id)
        })
      ),
      "LAST_INTERACTION"
    ).slice(0, 8);
  }

  return {
    metrics,
    favoriteContacts: favoriteContacts.map((contact) =>
      mapContactListItem(contact, {
        isActive: activeFavoriteContactIds.has(contact.id),
        hasDonorRole: favoriteDonorContactIds.has(contact.id)
      })
    ),
    selectedRoleTag,
    availableRoleTags: getAvailableRoleTags(),
    taggedContacts,
    syncStatus,
    needsBackgroundRefresh: syncStates.some((state) =>
      isAutoRefreshStale(state.source as SourceSystemKey, state.lastSuccessfulSyncAt)
    )
  };
}

export async function getPeople(
  search?: string | null,
  options?: {
    limit?: number;
    excludeContactId?: string | null;
    searchMode?: "all" | "email";
    laneKey?: LaneKey | null;
    sortBy?: PeopleSortKey;
    activeOnly?: boolean;
  }
): Promise<ContactListItem[]> {
  const sortBy = options?.sortBy ?? "LAST_INTERACTION";
  const activeOnly = options?.activeOnly ?? options?.searchMode !== "email";

  if (!prisma) {
    const query = search?.trim().toLowerCase();
    const demoResults = demoContacts.filter((contact) => {
      const matchesQuery = query
        ? [
            options?.searchMode === "email" ? "" : contact.displayName,
            contact.primaryEmail ?? ""
          ].some((value) => value.toLowerCase().includes(query))
        : true;
      const matchesLane = options?.laneKey ? contact.recentLaneKeys.includes(options.laneKey) : true;
      const matchesActive = activeOnly ? contact.isActive : true;

      return matchesQuery && matchesLane && matchesActive;
    });

    const spaceUseCountByContactId =
      sortBy === "SPACE_USE_FREQUENCY"
        ? new Map(
            demoResults.map((contact) => [
              contact.id,
              contact.recentLaneKeys.includes("SPACE_USE") ? 1 : 0
            ])
          )
        : undefined;

    return sortContactListItems(
      demoResults.filter((contact) => (options?.excludeContactId ? contact.id !== options.excludeContactId : true)),
      sortBy,
      {
        spaceUseCountByContactId
      }
    ).slice(0, options?.limit ?? 100);
  }

  await ensureCatalogSeeded();

  const normalizedSearch = normalizeEmail(search) ?? search?.trim() ?? "";
  const emailOnly = options?.searchMode === "email";
  const db = assertDatabase();
  const andFilters: Prisma.ContactWhereInput[] = [];
  const searchFilters: Prisma.ContactWhereInput[] = [];

  if (normalizedSearch) {
    if (!emailOnly) {
      searchFilters.push({
        displayName: {
          contains: normalizedSearch,
          mode: Prisma.QueryMode.insensitive
        }
      });
    }

    searchFilters.push({
      emails: {
        some: {
          normalizedEmail: {
            contains: normalizedSearch.toLowerCase()
          }
        }
      }
    });
  }

  if (searchFilters.length > 0) {
    andFilters.push({ OR: searchFilters });
  }

  if (options?.laneKey) {
    andFilters.push({
      OR: [
        {
          timelineEvents: {
            some: {
              laneKey: options.laneKey as PrismaLaneKey
            }
          }
        },
        {
          manualInteractions: {
            some: {
              laneKey: options.laneKey as PrismaLaneKey
            }
          }
        }
      ]
    });
  }

  if (activeOnly) {
    const activeSince = new Date(Date.now() - 365 * DAY_MS);
    andFilters.push({
      OR: [
        {
          timelineEvents: {
            some: {
              laneKey: { not: PrismaLaneKey.EMAIL },
              occurredAt: { gte: activeSince }
            }
          }
        },
        {
          manualInteractions: {
            some: {
              laneKey: { not: PrismaLaneKey.EMAIL },
              occurredAt: { gte: activeSince }
            }
          }
        }
      ]
    });
  }

  const contacts = await db.contact.findMany({
    where: {
      mergedIntoId: null,
      ...(options?.excludeContactId ? { id: { not: options.excludeContactId } } : {}),
      ...(andFilters.length > 0 ? { AND: andFilters } : {})
    },
    include: {
      emails: true,
      timelineEvents: {
        orderBy: { occurredAt: "desc" },
        take: 6,
        select: {
          laneKey: true,
          occurredAt: true,
          rawPayload: true
        }
      },
      manualInteractions: {
        orderBy: { occurredAt: "desc" },
        take: 6,
        select: {
          laneKey: true,
          occurredAt: true
        }
      }
    },
    orderBy: {
      updatedAt: "desc"
    }
  });

  const uniqueContacts = Array.from(new Map(contacts.map((contact) => [contact.id, contact])).values());
  const donorLevelCentsByContactId = new Map<string, number>();
  const volunteerMinutesByContactId = new Map<string, number>();
  const spaceUseCountByContactId = new Map<string, number>();
  const contactIds = uniqueContacts.map((contact) => contact.id);
  const [computedActiveContactIds, donorContactIds] = await Promise.all([
    activeOnly ? Promise.resolve(new Set<string>(contactIds)) : getActiveContactIds(db, contactIds),
    getDonorContactIds(db, contactIds)
  ]);
  const mappedContacts = uniqueContacts.map((contact) =>
    mapContactListItem(contact, {
      isActive: computedActiveContactIds.has(contact.id),
      hasDonorRole: donorContactIds.has(contact.id)
    })
  );

  if (contactIds.length > 0 && sortBy === "DONOR_LEVEL") {
    const [donationEvents, manualDonationInteractions] = await Promise.all([
      db.timelineEvent.findMany({
        where: {
          contactId: { in: contactIds },
          eventKind: "donation"
        },
        select: {
          contactId: true,
          amountCents: true
        }
      }),
      db.manualInteraction.findMany({
        where: {
          contactId: { in: contactIds },
          laneKey: PrismaLaneKey.DONOR
        },
        select: {
          contactId: true,
          metadata: true
        }
      })
    ]);

    for (const event of donationEvents) {
      if (!event.amountCents) {
        continue;
      }

      donorLevelCentsByContactId.set(
        event.contactId,
        (donorLevelCentsByContactId.get(event.contactId) ?? 0) + event.amountCents
      );
    }

    for (const interaction of manualDonationInteractions) {
      const amountCents = readAmountCentsFromMetadata(interaction.metadata);
      if (!amountCents) {
        continue;
      }

      donorLevelCentsByContactId.set(
        interaction.contactId,
        (donorLevelCentsByContactId.get(interaction.contactId) ?? 0) + amountCents
      );
    }
  }

  if (contactIds.length > 0 && sortBy === "VOLUNTEER_HOURS") {
    const volunteerShiftEvents = await db.timelineEvent.findMany({
      where: {
        contactId: { in: contactIds },
        eventKind: "volunteer_shift"
      },
      select: {
        contactId: true,
        metadata: true
      }
    });

    for (const event of volunteerShiftEvents) {
      const metadata = toJsonRecord(event.metadata);
      const durationMinutes = Math.max(0, readJsonNumber(metadata?.durationMinutes) ?? 0);
      if (durationMinutes <= 0) {
        continue;
      }

      volunteerMinutesByContactId.set(
        event.contactId,
        (volunteerMinutesByContactId.get(event.contactId) ?? 0) + durationMinutes
      );
    }
  }

  if (contactIds.length > 0 && sortBy === "SPACE_USE_FREQUENCY") {
    const [timelineSpaceUseCounts, manualSpaceUseCounts] = await Promise.all([
      db.timelineEvent.groupBy({
        by: ["contactId"],
        where: {
          contactId: { in: contactIds },
          laneKey: PrismaLaneKey.SPACE_USE
        },
        _count: {
          _all: true
        }
      }),
      db.manualInteraction.groupBy({
        by: ["contactId"],
        where: {
          contactId: { in: contactIds },
          laneKey: PrismaLaneKey.SPACE_USE
        },
        _count: {
          _all: true
        }
      })
    ]);

    for (const entry of timelineSpaceUseCounts) {
      spaceUseCountByContactId.set(entry.contactId, entry._count._all);
    }

    for (const entry of manualSpaceUseCounts) {
      spaceUseCountByContactId.set(
        entry.contactId,
        (spaceUseCountByContactId.get(entry.contactId) ?? 0) + entry._count._all
      );
    }
  }

  return sortContactListItems(mappedContacts, sortBy, {
    donorLevelCentsByContactId,
    volunteerMinutesByContactId,
    spaceUseCountByContactId
  }).slice(0, options?.limit ?? 100);
}

export async function getContactDetail(contactId: string): Promise<ContactDetail | null> {
  if (!prisma) {
    return contactId === demoContactDetail.id ? demoContactDetail : null;
  }

  await ensureCatalogSeeded();

  const db = assertDatabase();
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    include: {
      emails: true,
      profileValues: true,
      certifications: true,
      timelineEvents: {
        orderBy: { occurredAt: "desc" }
      },
      manualInteractions: {
        include: {
          interactionType: true
        }
      }
    }
  });

  if (!contact || contact.mergedIntoId) {
    return null;
  }

  const [interactionTypes, syncStates] = await Promise.all([
    db.interactionType.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" }
    }),
    db.sourceSyncState.findMany()
  ]);

  const primaryEmail = contact.emails.find((email) => email.id === contact.primaryEmailId) ?? contact.emails.find((email) => email.isPrimary) ?? contact.emails[0] ?? null;

  const timelineEntries: TimelineEntry[] = [
    ...contact.timelineEvents.map((event) =>
      mapTimelineEntry({
        ...event,
        rawPayload: event.rawPayload
      })
    ),
    ...contact.manualInteractions.map((interaction) =>
      mapTimelineEntry({
        id: interaction.id,
        recordType: "MANUAL",
        laneKey: interaction.laneKey,
        eventKind: interaction.interactionType.slug,
        typeLabel: interaction.interactionType.name,
        title: interaction.title,
        summary: interaction.body,
        occurredAt: interaction.occurredAt,
        source: PrismaSourceSystem.MANUAL,
        amountCents:
          interaction.interactionType.slug === "donation"
            ? readAmountCentsFromMetadata(interaction.metadata)
            : null,
        metadata: interaction.metadata,
        manualInteractionTypeId: interaction.interactionTypeId
      })
    )
  ].sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime());

  const metricSections = buildContactMetricSections({
    importedActivities: contact.timelineEvents.map((event) => ({
      occurredAt: event.occurredAt,
      laneKey: event.laneKey as LaneKey,
      eventKind: event.eventKind,
      amountCents: event.amountCents,
      metadata: event.metadata
    })),
    manualActivities: contact.manualInteractions.map((interaction) => ({
      occurredAt: interaction.occurredAt,
      laneKey: interaction.laneKey as LaneKey,
      eventKind: interaction.interactionType.slug,
      amountCents:
        interaction.interactionType.slug === "donation"
          ? readAmountCentsFromMetadata(interaction.metadata)
          : null,
      metadata: interaction.metadata
    }))
  });

  const notes: ContactNote[] = contact.manualInteractions
    .filter((interaction) => interaction.interactionType.slug === "general-note")
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
    .map((interaction) => ({
      id: interaction.id,
      authorName: interaction.createdByName?.trim() || "Staff",
      occurredAt: interaction.occurredAt.toISOString(),
      content: buildContactNoteContent({
        title: interaction.title,
        body: interaction.body
      })
    }));

  const hasDonorHistory =
    contact.timelineEvents.some((event) => event.eventKind === "donation") ||
    contact.manualInteractions.some((interaction) => interaction.interactionType.slug === "donation");

  return {
    id: contact.id,
    displayName: contact.displayName ?? primaryEmail?.email ?? "Unnamed contact",
    primaryEmail: primaryEmail?.email ?? null,
    isActive: hasRecentNonEmailInteraction(
      [
        ...contact.timelineEvents.map((event) => ({
          laneKey: event.laneKey as LaneKey,
          occurredAt: event.occurredAt
        })),
        ...contact.manualInteractions.map((interaction) => ({
          laneKey: interaction.laneKey as LaneKey,
          occurredAt: interaction.occurredAt
        }))
      ],
      new Date()
    ),
    isFavorite: contact.isFavorite,
    manualRoleTags: contact.manualRoleTags as ContactManualRoleTagKey[],
    effectiveRoleTags: buildEffectiveRoleTags({
      manualRoleTags: contact.manualRoleTags as ContactManualRoleTagKey[],
      hasDonorHistory
    }),
    emails: contact.emails.map((email) => email.email),
    profileFields: buildCanonicalProfileFields(
      contact.profileValues.map((value) => ({
        fieldKey: value.fieldKey,
        source: value.source as SourceSystemKey,
        displayValue: value.displayValue,
        observedAt: value.observedAt.toISOString()
      }))
    ),
    certifications: mapContactCertifications(contact.certifications),
    notes,
    metricSections,
    timeline: timelineEntries,
    interactionTypeOptions: interactionTypes.map((type) => ({
      id: type.id,
      name: type.name,
      slug: type.slug,
      laneKey: type.laneKey as LaneKey
    })).sort((left, right) => {
      const leftPriority = left.laneKey === "DONOR" ? 0 : left.laneKey === "MEMBER" ? 1 : 2;
      const rightPriority = right.laneKey === "DONOR" ? 0 : right.laneKey === "MEMBER" ? 1 : 2;

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return left.name.localeCompare(right.name);
    }),
    needsBackgroundRefresh: syncStates.some((state) =>
      isAutoRefreshStale(state.source as SourceSystemKey, state.lastSuccessfulSyncAt)
    )
  };
}

export async function setContactFavorite(input: {
  contactId: string;
  isFavorite: boolean;
}) {
  if (!prisma) {
    return {
      id: input.contactId,
      isFavorite: input.isFavorite
    };
  }

  const db = assertDatabase();
  const contact = await db.contact.findUnique({
    where: { id: input.contactId },
    select: {
      id: true,
      mergedIntoId: true
    }
  });

  if (!contact || contact.mergedIntoId) {
    throw new Error("Contact not found.");
  }

  const updated = await db.contact.update({
    where: { id: input.contactId },
    data: {
      isFavorite: input.isFavorite
    },
    select: {
      id: true,
      isFavorite: true
    }
  });

  return updated;
}

export async function setContactManualRoleTag(input: {
  contactId: string;
  roleTag: ContactManualRoleTagKey;
  enabled: boolean;
}) {
  if (!CONTACT_MANUAL_ROLE_TAGS.includes(input.roleTag)) {
    throw new Error("Role tag not found.");
  }

  const db = assertDatabase();
  const contact = await db.contact.findUnique({
    where: { id: input.contactId },
    select: {
      id: true,
      mergedIntoId: true,
      manualRoleTags: true
    }
  });

  if (!contact || contact.mergedIntoId) {
    throw new Error("Contact not found.");
  }

  const nextTags = new Set<ContactManualRoleTagKey>(contact.manualRoleTags as ContactManualRoleTagKey[]);
  if (input.enabled) {
    nextTags.add(input.roleTag);
  } else {
    nextTags.delete(input.roleTag);
  }

  const updated = await db.contact.update({
    where: { id: input.contactId },
    data: {
      manualRoleTags: Array.from(nextTags) as PrismaContactManualRoleTag[]
    },
    select: {
      manualRoleTags: true
    }
  });

  const donorContactIds = await getDonorContactIds(db, [input.contactId]);

  return {
    manualRoleTags: updated.manualRoleTags as ContactManualRoleTagKey[],
    effectiveRoleTags: buildEffectiveRoleTags({
      manualRoleTags: updated.manualRoleTags as ContactManualRoleTagKey[],
      hasDonorHistory: donorContactIds.has(input.contactId)
    })
  };
}

export async function getReviewQueueItems(): Promise<ReviewQueueItem[]> {
  if (!prisma) {
    return demoReviewQueue;
  }

  const db = assertDatabase();
  const items = await db.unmatchedEvent.findMany({
    where: {
      status: ReviewStatus.PENDING
    },
    orderBy: {
      occurredAt: "desc"
    },
    take: 100
  });

  return items.map((item) => {
    const metadata = (item.metadata as Record<string, unknown> | null) ?? {};
    const rawPayload = (item.rawPayload as Record<string, unknown> | null) ?? {};
    const sourceLink = buildWordPressSourceLink({
      source: item.source as SourceSystemKey,
      eventKind: item.eventKind ?? "manual_assignment",
      metadata,
      rawPayload,
      labelMode: "reference"
    });

    return {
      id: item.id,
      source: item.source as SourceSystemKey,
      title: decodeHtmlEntities(typeof metadata.title === "string" ? metadata.title : "Unmatched interaction") ?? "Unmatched interaction",
      summary: decodeHtmlEntities(typeof metadata.summary === "string" ? metadata.summary : null),
      occurredAt: item.occurredAt.toISOString(),
      candidateEmail: item.candidateEmail,
      reason: item.reason,
      laneKey: item.laneKey as LaneKey | null,
      eventKind: item.eventKind,
      reviewEventTypeKey: findReviewEventType(item.eventKind, item.laneKey as LaneKey | null)?.key ?? null,
      sourceAdminUrl: sourceLink?.url ?? null,
      sourceAdminLabel: sourceLink?.label ?? null
    };
  });
}

export async function dismissUnmatchedEvent(unmatchedEventId: string) {
  const db = assertDatabase();

  const unmatched = await db.unmatchedEvent.findUnique({
    where: { id: unmatchedEventId },
    select: { id: true }
  });

  if (!unmatched) {
    throw new Error("Review queue item not found.");
  }

  await db.unmatchedEvent.update({
    where: { id: unmatchedEventId },
    data: {
      status: ReviewStatus.IGNORED,
      assignedContactId: null,
      resolvedAt: new Date()
    }
  });
}

export async function updateUnmatchedEventClassification(
  unmatchedEventId: string,
  reviewEventTypeKey: ReviewEventTypeKey
) {
  const db = assertDatabase();
  const eventType = findReviewEventTypeByKey(reviewEventTypeKey);
  if (!eventType) {
    throw new Error("Review queue event type not found.");
  }

  const unmatched = await db.unmatchedEvent.findUnique({
    where: { id: unmatchedEventId },
    select: { id: true }
  });

  if (!unmatched) {
    throw new Error("Review queue item not found.");
  }

  await db.unmatchedEvent.update({
    where: { id: unmatchedEventId },
    data: {
      eventKind: eventType.eventKind,
      laneKey: eventType.laneKey as PrismaLaneKey
    }
  });
}

export async function getMappingsScreenData(): Promise<MappingScreenData> {
  if (!prisma) {
    return demoMappingsData;
  }

  await ensureCatalogSeeded();

  const db = assertDatabase();
  const [mappingRules, interactionTypes] = await Promise.all([
    db.mappingRule.findMany({
      orderBy: [{ source: "asc" }, { priority: "asc" }, { name: "asc" }]
    }),
    db.interactionType.findMany({
      orderBy: { name: "asc" }
    })
  ]);

  return {
    mappingRules: mappingRules.map((rule) => ({
      id: rule.id,
      source: rule.source as SourceSystemKey,
      name: rule.name,
      matcherType: rule.matcherType,
      matcherValue: rule.matcherValue,
      eventKind: rule.eventKind,
      laneKey: rule.laneKey as LaneKey,
      priority: rule.priority,
      isActive: rule.isActive,
      isDefault: isDefaultMappingRuleName(rule.source as SourceSystemKey, rule.name)
    })),
    interactionTypes: interactionTypes.map((type) => ({
      id: type.id,
      name: type.name,
      slug: type.slug,
      laneKey: type.laneKey as LaneKey,
      isActive: type.isActive
    }))
  };
}

export async function createContactWithPrimaryEmail(options: {
  email: string;
  displayName?: string | null;
  source?: SourceSystemKey;
}) {
  const db = assertDatabase();
  return db.$transaction(async (tx) => createContactWithPrimaryEmailTx(tx, options));
}

export async function createManualContact(input: {
  displayName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}) {
  const displayName = input.displayName.trim();
  if (!displayName) {
    throw new Error("Full name is required.");
  }

  const email = input.email?.trim() ?? "";
  const normalizedEmail = email ? normalizeEmail(email) : null;
  if (email && !normalizedEmail) {
    throw new Error("A valid email address is required.");
  }

  const phone = input.phone?.trim() ?? "";
  const address = input.address?.trim() ?? "";
  const occurredAt = new Date();
  const db = assertDatabase();

  return db.$transaction(async (tx) => {
    let contactId: string;

    if (email) {
      const existingEmail = await tx.contactEmail.findUnique({
        where: { normalizedEmail: normalizedEmail! },
        select: {
          contactId: true
        }
      });

      if (existingEmail?.contactId) {
        contactId = existingEmail.contactId;

        const existingContact = await tx.contact.findUnique({
          where: { id: contactId },
          select: { displayName: true }
        });

        const currentDisplayName = existingContact?.displayName?.trim() ?? "";
        if (!currentDisplayName || normalizeEmail(currentDisplayName) === normalizedEmail) {
          await tx.contact.update({
            where: { id: contactId },
            data: { displayName }
          });
        }
      } else {
        contactId = await createContactWithPrimaryEmailTx(tx, {
          email,
          displayName,
          source: PrismaSourceSystem.MANUAL
        });
      }
    } else {
      const contact = await tx.contact.create({
        data: {
          displayName
        }
      });

      contactId = contact.id;
    }

    await persistProfileValues(tx, {
      contactId,
      source: PrismaSourceSystem.MANUAL,
      profile: {
        fullName: displayName,
        phone: phone || null,
        address: address || null
      },
      occurredAt
    });

    return contactId;
  });
}

function mergeTimelineEventMetadataWithOverride(
  metadata: Prisma.JsonValue | null,
  override: {
    eventKind: string;
    laneKey: LaneKey;
    typeLabel: string;
    updatedAt: string;
    updatedByName?: string | null;
    updatedByUserId?: string | null;
  }
) {
  const nextMetadata =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? ({ ...(metadata as Record<string, unknown>) } satisfies Record<string, unknown>)
      : {};

  nextMetadata.classificationOverride = {
    eventKind: override.eventKind,
    laneKey: override.laneKey,
    typeLabel: override.typeLabel,
    updatedAt: override.updatedAt,
    updatedByName: override.updatedByName ?? null,
    updatedByUserId: override.updatedByUserId ?? null
  };

  return nextMetadata;
}

export async function updateTimelineEventClassification(input: {
  eventId: string;
  reviewEventTypeKey: ReviewEventTypeKey;
  actor?: SessionUser | null;
}) {
  const db = assertDatabase();
  const eventType = findReviewEventTypeByKey(input.reviewEventTypeKey);
  if (!eventType) {
    throw new Error("Interaction type not found.");
  }

  const event = await db.timelineEvent.findUnique({
    where: { id: input.eventId },
    select: {
      id: true,
      metadata: true
    }
  });

  if (!event) {
    throw new Error("Timeline event not found.");
  }

  const updatedAt = new Date().toISOString();
  const metadata = mergeTimelineEventMetadataWithOverride(event.metadata, {
    eventKind: eventType.eventKind,
    laneKey: eventType.laneKey,
    typeLabel: eventType.label,
    updatedAt,
    updatedByName: input.actor?.name ?? null,
    updatedByUserId: input.actor?.id ?? null
  });

  await db.timelineEvent.update({
    where: { id: event.id },
    data: {
      eventKind: eventType.eventKind,
      laneKey: eventType.laneKey as PrismaLaneKey,
      mappingRuleId: null,
      metadata: toInputJson(metadata)
    }
  });

  return {
    eventKind: eventType.eventKind,
    laneKey: eventType.laneKey,
    typeLabel: eventType.label
  };
}

export async function updateManualInteractionClassification(input: {
  interactionId: string;
  interactionTypeId: string;
}) {
  const db = assertDatabase();
  const interactionType = await db.interactionType.findUnique({
    where: { id: input.interactionTypeId }
  });

  if (!interactionType) {
    throw new Error("Interaction type not found.");
  }

  const interaction = await db.manualInteraction.findUnique({
    where: { id: input.interactionId },
    select: { id: true }
  });

  if (!interaction) {
    throw new Error("Manual interaction not found.");
  }

  await db.manualInteraction.update({
    where: { id: interaction.id },
    data: {
      interactionTypeId: interactionType.id,
      laneKey: interactionType.laneKey
    }
  });

  return {
    eventKind: interactionType.slug,
    laneKey: interactionType.laneKey as LaneKey,
    typeLabel: interactionType.name,
    manualInteractionTypeId: interactionType.id
  };
}

export async function createManualInteraction(input: {
  contactId: string;
  interactionTypeId: string;
  occurredAt: string;
  title: string;
  body?: string | null;
  amountValue?: string | null;
  actor?: SessionUser | null;
}) {
  const db = assertDatabase();
  const interactionType = await db.interactionType.findUnique({
    where: { id: input.interactionTypeId }
  });

  if (!interactionType) {
    throw new Error("Interaction type not found.");
  }

  const amountCents = parseCurrencyAmountToCents(input.amountValue ?? null);
  if (interactionType.slug === "donation" && (!amountCents || amountCents <= 0)) {
    throw new Error("Donation amount is required.");
  }

  const metadata =
    interactionType.slug === "donation" && amountCents
      ? {
          amountCents,
          currency: "USD"
        }
      : null;

  await db.manualInteraction.create({
    data: {
      contactId: input.contactId,
      interactionTypeId: interactionType.id,
      occurredAt: new Date(input.occurredAt),
      title: input.title.trim(),
      body: input.body?.trim() || null,
      laneKey: interactionType.laneKey,
      metadata: metadata ? toInputJson(metadata) : Prisma.JsonNull,
      createdByUserId: input.actor?.id,
      createdByName: input.actor?.name
    }
  });
}

export async function createContactNote(input: {
  contactId: string;
  content: string;
  actor?: SessionUser | null;
}) {
  const content = input.content.trim();
  if (!content) {
    throw new Error("Note content is required.");
  }

  await ensureCatalogSeeded();

  const db = assertDatabase();
  const interactionType = await db.interactionType.findUnique({
    where: { slug: "general-note" }
  });

  if (!interactionType) {
    throw new Error("General note interaction type not found.");
  }

  await db.manualInteraction.create({
    data: {
      contactId: input.contactId,
      interactionTypeId: interactionType.id,
      occurredAt: new Date(),
      title: "Note",
      body: content,
      laneKey: interactionType.laneKey,
      metadata: Prisma.JsonNull,
      createdByUserId: input.actor?.id,
      createdByName: input.actor?.name
    }
  });
}

export async function saveInteractionType(input: {
  name: string;
  laneKey: LaneKey;
}) {
  const db = assertDatabase();
  const slug = slugify(input.name);
  if (!slug) {
    throw new Error("A name is required.");
  }

  await db.interactionType.upsert({
    where: { slug },
    update: {
      name: input.name.trim(),
      laneKey: input.laneKey as PrismaLaneKey,
      isActive: true
    },
    create: {
      name: input.name.trim(),
      slug,
      laneKey: input.laneKey as PrismaLaneKey,
      colorToken: LANE_META[input.laneKey].color,
      isActive: true
    }
  });
}

export async function saveMappingRule(input: {
  source: SourceSystemKey;
  name: string;
  matcherType: string;
  matcherValue: string;
  eventKind: string;
  laneKey: LaneKey;
  priority: number;
}) {
  const db = assertDatabase();
  const existing = await db.mappingRule.findFirst({
    where: {
      source: input.source as PrismaSourceSystem,
      name: input.name.trim()
    }
  });

  if (existing) {
    await db.mappingRule.update({
      where: { id: existing.id },
      data: {
        matcherType: input.matcherType.trim().toUpperCase(),
        matcherValue: input.matcherValue.trim(),
        eventKind: input.eventKind.trim(),
        laneKey: input.laneKey as PrismaLaneKey,
        priority: input.priority,
        isActive: true
      }
    });
    return;
  }

  await db.mappingRule.create({
    data: {
      source: input.source as PrismaSourceSystem,
      name: input.name.trim(),
      matcherType: input.matcherType.trim().toUpperCase(),
      matcherValue: input.matcherValue.trim(),
      eventKind: input.eventKind.trim(),
      laneKey: input.laneKey as PrismaLaneKey,
      priority: input.priority,
      isActive: true
    }
  });
}

export async function deleteMappingRule(mappingRuleId: string) {
  const db = assertDatabase();
  const rule = await db.mappingRule.findUnique({
    where: { id: mappingRuleId }
  });

  if (!rule) {
    throw new Error("Mapping rule not found.");
  }

  if (isDefaultMappingRuleName(rule.source as SourceSystemKey, rule.name)) {
    throw new Error("Default mapping rules cannot be deleted.");
  }

  await db.mappingRule.delete({
    where: { id: rule.id }
  });
}

export async function mergeContacts(primaryContactId: string, mergedContactId: string, actor?: SessionUser | null) {
  if (primaryContactId === mergedContactId) {
    throw new Error("A contact cannot be merged into itself.");
  }

  const db = assertDatabase();

  await db.$transaction(async (tx) => {
    const [primary, merged] = await Promise.all([
      tx.contact.findUnique({
        where: { id: primaryContactId },
        include: {
          emails: true,
          profileValues: true
        }
      }),
      tx.contact.findUnique({
        where: { id: mergedContactId },
        include: {
          emails: true,
          externalIds: true,
          profileValues: true
        }
      })
    ]);

    if (!primary || !merged) {
      throw new Error("One of the contacts could not be found.");
    }

    const snapshot = {
      contact: {
        id: merged.id,
        displayName: merged.displayName
      },
      emails: merged.emails.map((email) => ({
        id: email.id,
        email: email.email,
        normalizedEmail: email.normalizedEmail
      }))
    };

    const primaryEmailMap = new Map(primary.emails.map((email) => [email.normalizedEmail, email.id]));

    for (const email of merged.emails) {
      if (primaryEmailMap.has(email.normalizedEmail)) {
        await tx.contactEmail.delete({
          where: { id: email.id }
        });
        continue;
      }

      await tx.contactEmail.update({
        where: { id: email.id },
        data: {
          contactId: primary.id,
          isPrimary: false
        }
      });
    }

    for (const identity of merged.externalIds) {
      const duplicate = await tx.externalIdentity.findFirst({
        where: {
          contactId: primary.id,
          source: identity.source,
          externalType: identity.externalType,
          externalId: identity.externalId
        }
      });

      if (duplicate) {
        await tx.externalIdentity.delete({
          where: { id: identity.id }
        });
        continue;
      }

      await tx.externalIdentity.update({
        where: { id: identity.id },
        data: {
          contactId: primary.id
        }
      });
    }

    for (const value of merged.profileValues) {
      const existing = await tx.contactProfileValue.findFirst({
        where: {
          contactId: primary.id,
          fieldKey: value.fieldKey,
          source: value.source
        }
      });

      if (existing) {
        if (existing.observedAt < value.observedAt) {
          await tx.contactProfileValue.update({
              where: { id: existing.id },
              data: {
                displayValue: value.displayValue,
                valueJson: toNullableInputJson(value.valueJson),
                observedAt: value.observedAt
              }
            });
        }

        await tx.contactProfileValue.delete({
          where: { id: value.id }
        });
        continue;
      }

      await tx.contactProfileValue.update({
        where: { id: value.id },
        data: {
          contactId: primary.id
        }
      });
    }

    await Promise.all([
      tx.timelineEvent.updateMany({
        where: { contactId: merged.id },
        data: { contactId: primary.id }
      }),
      tx.manualInteraction.updateMany({
        where: { contactId: merged.id },
        data: { contactId: primary.id }
      }),
      tx.unmatchedEvent.updateMany({
        where: { assignedContactId: merged.id },
        data: { assignedContactId: primary.id }
      })
    ]);

    const nextPrimaryEmailId =
      primary.primaryEmailId ??
      primary.emails.find((email) => email.isPrimary)?.id ??
      (await tx.contactEmail.findFirst({
        where: { contactId: primary.id },
        orderBy: { createdAt: "asc" }
      }))?.id ??
      null;

    await tx.contact.update({
      where: { id: primary.id },
      data: {
        primaryEmailId: nextPrimaryEmailId
      }
    });

    await tx.contact.update({
      where: { id: merged.id },
      data: {
        mergedIntoId: primary.id,
        primaryEmailId: null
      }
    });

    await tx.mergeAudit.create({
      data: {
        primaryContactId: primary.id,
        mergedContactId: merged.id,
        mergedByUserId: actor?.id,
        mergedByName: actor?.name,
        snapshot
      }
    });
  });
}

export async function assignUnmatchedEvent(input: {
  unmatchedEventId: string;
  contactId?: string | null;
  createContact?: boolean;
}) {
  const db = assertDatabase();

  return db.$transaction(async (tx) => {
    const unmatched = await tx.unmatchedEvent.findUnique({
      where: { id: input.unmatchedEventId }
    });

    if (!unmatched) {
      throw new Error("Review queue item not found.");
    }

    const unmatchedNormalizedEmail =
      unmatched.normalizedEmail ?? normalizeEmail(unmatched.candidateEmail);
    let contactId = input.contactId ?? null;
    if (input.createContact) {
      if (!unmatched.candidateEmail) {
        throw new Error("Cannot create a contact without a usable email address.");
      }

      contactId = await createContactWithPrimaryEmailTx(tx, {
        email: unmatched.candidateEmail,
        displayName: deriveDisplayNameFromUnmatched(unmatched),
        source: PrismaSourceSystem.MANUAL
      });
    }

    if (!contactId) {
      throw new Error("Choose a contact or create a new one.");
    }

    const unmatchedEvents =
      input.createContact && unmatchedNormalizedEmail
        ? await tx.unmatchedEvent.findMany({
            where: {
              normalizedEmail: unmatchedNormalizedEmail,
              status: ReviewStatus.PENDING
            },
            orderBy: [{ occurredAt: "asc" }, { id: "asc" }]
          })
        : [unmatched];

    const eventsToAssign = unmatchedEvents.length > 0 ? unmatchedEvents : [unmatched];
    const resolvedUnmatchedEventIds = eventsToAssign.map((event) => event.id);

    for (const event of eventsToAssign) {
      if (event.candidateEmail && event.normalizedEmail) {
        const existingEmail = await tx.contactEmail.findUnique({
          where: {
            normalizedEmail: event.normalizedEmail
          }
        });

        if (!existingEmail) {
          await tx.contactEmail.create({
            data: {
              contactId,
              email: event.candidateEmail,
              normalizedEmail: event.normalizedEmail,
              source: PrismaSourceSystem.MANUAL
            }
          });
        }
      }

      await importUnmatchedEventToContact(tx, event, contactId);
    }

    return {
      resolvedUnmatchedEventIds
    };
  });
}

function deriveDisplayNameFromUnmatched(unmatched: {
  candidateEmail: string | null;
  metadata: unknown;
}) {
  const metadata = (unmatched.metadata as Record<string, unknown> | null) ?? {};
  if (typeof metadata.fullName === "string" && metadata.fullName.trim()) {
    return metadata.fullName.trim();
  }

  return unmatched.candidateEmail ?? "New contact";
}

export async function persistProfileValues(
  tx: Prisma.TransactionClient,
  input: {
    contactId: string;
    source: PrismaSourceSystem;
    profile: WordPressProfilePayload;
    occurredAt: Date;
  }
) {
  const entries: Array<{
    fieldKey: PrismaProfileFieldKey;
    displayValue: string;
  }> = [];

  if (input.profile.fullName?.trim()) {
    entries.push({
      fieldKey: PrismaProfileFieldKey.FULL_NAME,
      displayValue: input.profile.fullName.trim()
    });
  }

  if (input.profile.phone?.trim()) {
    entries.push({
      fieldKey: PrismaProfileFieldKey.PHONE,
      displayValue: input.profile.phone.trim()
    });
  }

  if (input.profile.address?.trim()) {
    entries.push({
      fieldKey: PrismaProfileFieldKey.ADDRESS,
      displayValue: input.profile.address.trim()
    });
  }

  for (const entry of entries) {
    const existing = await tx.contactProfileValue.findFirst({
      where: {
        contactId: input.contactId,
        source: input.source,
        fieldKey: entry.fieldKey
      }
    });

    if (existing) {
      await tx.contactProfileValue.update({
        where: { id: existing.id },
        data: {
          displayValue: entry.displayValue,
          observedAt: input.occurredAt,
          valueJson: toInputJson({ value: entry.displayValue })
        }
      });
      continue;
    }

    await tx.contactProfileValue.create({
      data: {
        contactId: input.contactId,
        source: input.source,
        fieldKey: entry.fieldKey,
        displayValue: entry.displayValue,
        observedAt: input.occurredAt,
        valueJson: toInputJson({ value: entry.displayValue })
      }
    });
  }
}

export async function persistContactCertifications(
  tx: Prisma.TransactionClient,
  input: {
    contactId: string;
    source: PrismaSourceSystem;
    certifications: WordPressCertificationPayload[];
    observedAt: Date;
  }
) {
  const entries = input.certifications
    .map((certification) => {
      const certificationId = certification.id?.trim();
      const name = certification.name?.trim();

      if (!certificationId || !name) {
        return null;
      }

      const lastUsedAt = certification.lastUsedAt ? new Date(certification.lastUsedAt) : null;
      const expiresAt = certification.expiresAt ? new Date(certification.expiresAt) : null;

      return {
        certificationId,
        name,
        statusKey: certification.statusKey?.trim() || null,
        statusLabel: certification.statusLabel?.trim() || null,
        lastUsedAt: lastUsedAt && !Number.isNaN(lastUsedAt.getTime()) ? lastUsedAt : null,
        lastUsedLabel: certification.lastUsedLabel?.trim() || null,
        expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
        expiresLabel: certification.expiresLabel?.trim() || null,
        detail: certification.detail?.trim() || null,
        imageUrl: certification.imageUrl?.trim() || null
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const nextIds = entries.map((entry) => entry.certificationId);

  if (nextIds.length === 0) {
    await tx.contactCertification.deleteMany({
      where: {
        contactId: input.contactId
      }
    });
    return;
  }

  for (const entry of entries) {
    await tx.contactCertification.upsert({
      where: {
        contactId_certificationId: {
          contactId: input.contactId,
          certificationId: entry.certificationId
        }
      },
      update: {
        source: input.source,
        name: entry.name,
        statusKey: entry.statusKey,
        statusLabel: entry.statusLabel,
        lastUsedAt: entry.lastUsedAt,
        lastUsedLabel: entry.lastUsedLabel,
        expiresAt: entry.expiresAt,
        expiresLabel: entry.expiresLabel,
        detail: entry.detail,
        imageUrl: entry.imageUrl,
        observedAt: input.observedAt
      },
      create: {
        contactId: input.contactId,
        certificationId: entry.certificationId,
        source: input.source,
        name: entry.name,
        statusKey: entry.statusKey,
        statusLabel: entry.statusLabel,
        lastUsedAt: entry.lastUsedAt,
        lastUsedLabel: entry.lastUsedLabel,
        expiresAt: entry.expiresAt,
        expiresLabel: entry.expiresLabel,
        detail: entry.detail,
        imageUrl: entry.imageUrl,
        observedAt: input.observedAt
      }
    });
  }

  await tx.contactCertification.deleteMany({
    where: {
      contactId: input.contactId,
      certificationId: {
        notIn: nextIds
      }
    }
  });
}

export async function persistExternalIdentities(
  tx: Prisma.TransactionClient,
  input: {
    contactId: string;
    source: PrismaSourceSystem;
    identities: WordPressIdentityPayload[];
  }
) {
  for (const identity of input.identities) {
    const existing = await tx.externalIdentity.findFirst({
      where: {
        source: input.source,
        externalType: identity.type,
        externalId: identity.id
      }
    });

    if (existing) {
      if (existing.contactId !== input.contactId) {
        await tx.externalIdentity.update({
          where: { id: existing.id },
          data: { contactId: input.contactId }
        });
      }
      continue;
    }

    await tx.externalIdentity.create({
      data: {
        contactId: input.contactId,
        source: input.source,
        externalType: identity.type,
        externalId: identity.id
      }
    });
  }
}

export async function findContactIdByNormalizedEmail(email: string) {
  const db = assertDatabase();
  const match = await db.contactEmail.findUnique({
    where: { normalizedEmail: email },
    select: { contactId: true }
  });

  return match?.contactId ?? null;
}

export async function getMappingRulesBySource(source: SourceSystemKey) {
  const db = assertDatabase();
  const rules = await db.mappingRule.findMany({
    where: {
      source: source as PrismaSourceSystem,
      isActive: true
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
  });

  return rules.map((rule) => ({
    id: rule.id,
    source: rule.source as SourceSystemKey,
    name: rule.name,
    matcherType: rule.matcherType,
    matcherValue: rule.matcherValue,
    eventKind: rule.eventKind,
    laneKey: rule.laneKey as LaneKey,
    roleKey: rule.roleKey,
    titleTemplate: rule.titleTemplate,
    priority: rule.priority,
    isActive: rule.isActive
  }));
}

export async function upsertUnmatchedEvent(input: {
  source: SourceSystemKey;
  sourceEventId: string;
  sourceCursor?: string | null;
  occurredAt: Date;
  eventKind: string;
  laneKey: LaneKey;
  candidateEmail?: string | null;
  normalizedEmail?: string | null;
  reason: string;
  rawPayload: WordPressSourceEvent;
  syncRunId?: string | null;
}) {
  const db = assertDatabase();

  await db.unmatchedEvent.upsert({
    where: {
      source_sourceEventId: {
        source: input.source as PrismaSourceSystem,
        sourceEventId: input.sourceEventId
      }
    },
    update: {
      sourceCursor: input.sourceCursor,
      occurredAt: input.occurredAt,
      eventKind: input.eventKind,
      laneKey: input.laneKey as PrismaLaneKey,
      candidateEmail: input.candidateEmail ?? null,
      normalizedEmail: input.normalizedEmail ?? null,
      status: ReviewStatus.PENDING,
      reason: input.reason,
      rawPayload: toInputJson(input.rawPayload),
      metadata: {
        title: decodeHtmlEntities(input.rawPayload.title ?? "Imported interaction") ?? "Imported interaction",
        summary: decodeHtmlEntities(input.rawPayload.summary ?? null),
        amountCents: input.rawPayload.amountCents ?? null,
        currency: input.rawPayload.currency ?? "USD",
        fullName: input.rawPayload.profile?.fullName ?? null
      },
      syncRunId: input.syncRunId ?? null
    },
    create: {
      source: input.source as PrismaSourceSystem,
      sourceEventId: input.sourceEventId,
      sourceCursor: input.sourceCursor ?? null,
      occurredAt: input.occurredAt,
      eventKind: input.eventKind,
      laneKey: input.laneKey as PrismaLaneKey,
      candidateEmail: input.candidateEmail ?? null,
      normalizedEmail: input.normalizedEmail ?? null,
      status: ReviewStatus.PENDING,
      reason: input.reason,
      rawPayload: toInputJson(input.rawPayload),
      metadata: {
        title: decodeHtmlEntities(input.rawPayload.title ?? "Imported interaction") ?? "Imported interaction",
        summary: decodeHtmlEntities(input.rawPayload.summary ?? null),
        amountCents: input.rawPayload.amountCents ?? null,
        currency: input.rawPayload.currency ?? "USD",
        fullName: input.rawPayload.profile?.fullName ?? null
      },
      syncRunId: input.syncRunId ?? null
    }
  });
}

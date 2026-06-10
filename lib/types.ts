import type {
  CultivationStatusKey,
  ContactEffectiveRoleTagKey,
  ContactManualRoleTagKey,
  LaneKey,
  ReviewEventTypeKey,
  SourceSystemKey
} from "@/lib/constants";

export type ProfileFieldKey = "FULL_NAME" | "PHONE" | "ADDRESS";
export type ReviewStatusKey = "PENDING" | "ASSIGNED" | "IGNORED";
export type SyncModeKey = "BACKFILL" | "INCREMENTAL";
export type SyncStatusKey = "PENDING" | "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
export type SyncActivityPhase = "IDLE" | "RUNNING" | "SUCCESS" | "FAILED";
export type TimelineEntryRecordType = "IMPORTED" | "MANUAL";

export interface SyncSourceProgressState {
  source: SourceSystemKey;
  label: string;
  status: SyncStatusKey;
  fetchedCount: number;
  importedCount: number;
  unmatchedCount: number;
  errorCount: number;
  estimatedTotalCount: number | null;
  progressPercent: number;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  wordpressUserId?: number;
}

export interface DashboardMetric {
  id: string;
  label: string;
  value: string;
  detail: string;
  laneKey: LaneKey;
}

export interface MetricSection {
  id: string;
  title: string;
  metrics: DashboardMetric[];
}

export interface SyncStatusCard {
  source: SourceSystemKey;
  label: string;
  lastSuccessfulSyncAt: string | null;
  stale: boolean;
}

export interface DashboardData {
  metrics: DashboardMetric[];
  favoriteContacts: ContactListItem[];
  selectedRoleTag: ContactEffectiveRoleTagKey | "ALL";
  availableRoleTags: Array<{
    key: ContactEffectiveRoleTagKey;
    label: string;
  }>;
  taggedContacts: ContactListItem[];
  syncStatus: SyncStatusCard[];
  needsBackgroundRefresh: boolean;
  needsStaleNotice: boolean;
}

export interface CultivationOwnerOption {
  id: string;
  name: string;
  email: string;
}

export interface CultivationWorkflowState {
  status: CultivationStatusKey;
  nextFollowUpAt: string | null;
  owner: CultivationOwnerOption | null;
}

export interface PriorityDonorItem extends CultivationWorkflowState {
  contactId: string;
  displayName: string;
  primaryEmail: string | null;
  priorityScore: number;
  suggestedAskAmount: string;
  suggestedAskAmountCents: number | null;
  lastInteractionAt: string | null;
  lastDonationAt: string | null;
  lastDonationAmount: string | null;
  lastDonationAmountCents: number | null;
  daysSinceLastDonation: number | null;
  urgencyLabel: string;
  urgencyTone: "critical" | "warn" | "info" | "calm";
  upgradeScore: number;
  upgradeIndicators: string[];
}

export interface UpgradeDonorItem {
  contactId: string;
  displayName: string;
  primaryEmail: string | null;
  owner: CultivationOwnerOption | null;
  suggestedAskAmount: string;
  suggestedAskAmountCents: number | null;
  lastDonationAt: string | null;
  lastDonationAmount: string | null;
  lastDonationAmountCents: number | null;
  upgradeScore: number;
  upgradeIndicators: string[];
}

export interface LapsedDonorItem {
  contactId: string;
  displayName: string;
  primaryEmail: string | null;
  owner: CultivationOwnerOption | null;
  lastInteractionAt: string | null;
  lastDonationAt: string | null;
  lastDonationAmount: string | null;
  lastDonationAmountCents: number | null;
  daysSinceLastDonation: number | null;
  urgencyLabel: string;
  urgencyTone: "critical" | "warn" | "info" | "calm";
}

export interface CultivationDashboardData {
  ownerOptions: CultivationOwnerOption[];
  priorityQueue: PriorityDonorItem[];
  upgradeCandidates: UpgradeDonorItem[];
  lapsedDonors: LapsedDonorItem[];
  needsBackgroundRefresh: boolean;
  needsStaleNotice: boolean;
}

export interface DonationMonthlyPoint {
  month: string; // "YYYY-MM"
  totalCents: number;
  avgCents: number | null;
  count: number;
}

export interface DonationAnalyticsData {
  monthlyData: DonationMonthlyPoint[];
  overallAvgCents: number | null;
  avgDonationsPerActiveDonor: number | null;
  activeDonorCount: number;
  totalCents: number;
  totalCount: number;
}

export interface ContactListItem {
  id: string;
  displayName: string;
  primaryEmail: string | null;
  photoUrl: string | null;
  isActive: boolean;
  isFavorite: boolean;
  effectiveRoleTags: ContactEffectiveRoleTagKey[];
  recentLaneKeys: LaneKey[];
  lastInteractionAt: string | null;
}

export interface ContactProfileField {
  fieldKey: ProfileFieldKey;
  displayValue: string | null;
  source: SourceSystemKey | null;
  rawValues: Array<{
    source: SourceSystemKey;
    displayValue: string;
    observedAt: string;
  }>;
}

export interface ContactNote {
  id: string;
  authorName: string;
  occurredAt: string;
  content: string;
}

export interface ContactCertification {
  id: string;
  name: string;
  source: SourceSystemKey;
  statusKey: string | null;
  statusLabel: string | null;
  lastUsedAt: string | null;
  lastUsedLabel: string | null;
  expiresAt: string | null;
  expiresLabel: string | null;
  detail: string | null;
  imageUrl: string | null;
}

export interface TimelineEntry {
  id: string;
  recordType: TimelineEntryRecordType;
  laneKey: LaneKey;
  eventKind: string;
  typeLabel: string;
  title: string;
  summary: string | null;
  occurredAt: string;
  source: SourceSystemKey;
  amountLabel?: string | null;
  metadata?: Record<string, unknown> | null;
  sourceAdminUrl?: string | null;
  sourceAdminLabel?: string | null;
  manualInteractionTypeId?: string | null;
  manualAmountValue?: string | null;
  editedAt?: string | null;
  editedByName?: string | null;
}

export interface ContactDetail {
  id: string;
  displayName: string;
  primaryEmail: string | null;
  isActive: boolean;
  isFavorite: boolean;
  manualRoleTags: ContactManualRoleTagKey[];
  effectiveRoleTags: ContactEffectiveRoleTagKey[];
  emails: string[];
  profileFields: ContactProfileField[];
  certifications: ContactCertification[];
  notes: ContactNote[];
  metricSections: MetricSection[];
  timeline: TimelineEntry[];
  interactionTypeOptions: Array<{
    id: string;
    name: string;
    slug: string;
    laneKey: LaneKey;
  }>;
  needsBackgroundRefresh: boolean;
  needsStaleNotice: boolean;
}

export interface ReviewQueueItem {
  id: string;
  source: SourceSystemKey;
  title: string;
  summary: string | null;
  occurredAt: string;
  amountLabel?: string | null;
  candidateEmail: string | null;
  fullName?: string | null;
  phone?: string | null;
  address?: string | null;
  reason: string;
  laneKey: LaneKey | null;
  eventKind: string | null;
  reviewEventTypeKey: ReviewEventTypeKey | null;
  manualInteractionTypeId?: string | null;
  manualInteractionTypeName?: string | null;
  manualInteractionTypeSlug?: string | null;
  sourceAdminUrl?: string | null;
  sourceAdminLabel?: string | null;
}

export interface ReviewQueueInteractionTypeOption {
  id: string;
  name: string;
  slug: string;
  laneKey: LaneKey;
}

export interface ReviewQueuePageData {
  items: ReviewQueueItem[];
  interactionTypeOptions: ReviewQueueInteractionTypeOption[];
}

export interface MappingRuleView {
  id: string;
  source: SourceSystemKey;
  name: string;
  matcherType: string;
  matcherValue: string;
  eventKind: string;
  laneKey: LaneKey;
  priority: number;
  isActive: boolean;
  isDefault: boolean;
}

export interface InteractionTypeView {
  id: string;
  name: string;
  slug: string;
  laneKey: LaneKey;
  isActive: boolean;
}

export interface MappingScreenData {
  mappingRules: MappingRuleView[];
  interactionTypes: InteractionTypeView[];
}

export interface SyncActivityState {
  active: boolean;
  mode: SyncModeKey | null;
  phase: SyncActivityPhase;
  source: SourceSystemKey | null;
  totalSources: number;
  completedSources: number;
  currentSource: SourceSystemKey | null;
  currentSourceLabel: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  progressPercent: number;
  fetchedCount: number;
  importedCount: number;
  unmatchedCount: number;
  errorCount: number;
  currentSourceFetchedCount: number;
  currentSourceImportedCount: number;
  currentSourceUnmatchedCount: number;
  currentSourceErrorCount: number;
  currentSourceEstimatedTotalCount: number | null;
  currentSourceProgressPercent: number;
  sourceProgress: SyncSourceProgressState[];
  message: string | null;
}

export interface WordPressProfilePayload {
  fullName?: string | null;
  phone?: string | null;
  address?: string | null;
  photoUrl?: string | null;
  certifications?: WordPressCertificationPayload[] | null;
}

export interface WordPressCertificationPayload {
  id: string;
  name: string;
  statusKey?: string | null;
  statusLabel?: string | null;
  lastUsedAt?: string | null;
  lastUsedLabel?: string | null;
  expiresAt?: string | null;
  expiresLabel?: string | null;
  detail?: string | null;
  imageUrl?: string | null;
}

export interface WordPressIdentityPayload {
  type: string;
  id: string;
}

export interface MappingHint {
  type: string;
  value: string;
}

export interface WordPressSourceEvent {
  externalId: string;
  occurredAt: string;
  email?: string | null;
  title?: string | null;
  summary?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  eventKind?: string | null;
  laneKey?: LaneKey | null;
  roleKey?: string | null;
  profile?: WordPressProfilePayload | null;
  identities?: WordPressIdentityPayload[];
  mappingHints?: MappingHint[];
  metadata?: Record<string, unknown> | null;
  rawPayload?: Record<string, unknown> | null;
}

export interface WordPressEventFeed {
  source: SourceSystemKey;
  items: WordPressSourceEvent[];
  mode: SyncModeKey;
  nextCursor: string | null;
  page: number;
  hasMore: boolean;
  estimatedTotal?: number | null;
}

export interface WordPressMetadataFeed {
  source: SourceSystemKey;
  items: Array<Record<string, unknown>>;
}

export interface ClassificationRule {
  id?: string;
  source: SourceSystemKey;
  name: string;
  matcherType: string;
  matcherValue: string;
  eventKind: string;
  laneKey: LaneKey;
  roleKey?: string | null;
  titleTemplate?: string | null;
  priority: number;
  isActive?: boolean;
}

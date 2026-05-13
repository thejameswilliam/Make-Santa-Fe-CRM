import {
  LaneKey as PrismaLaneKey,
  Prisma,
  ReviewStatus,
  SourceSystem as PrismaSourceSystem,
  SyncMode as PrismaSyncMode,
  SyncStatus as PrismaSyncStatus
} from "@prisma/client";

import { ensureCatalogSeeded } from "@/lib/catalog";
import {
  createContactWithPrimaryEmail,
  findContactIdByNormalizedEmail,
  getMappingRulesBySource,
  persistContactCertifications,
  persistExternalIdentities,
  persistProfileValues,
  upsertUnmatchedEvent
} from "@/lib/crm";
import { config } from "@/lib/config";
import {
  AUTO_BACKGROUND_REFRESH_SOURCES,
  LANE_META,
  SOURCE_LABELS,
  SOURCE_SYSTEMS,
  type LaneKey,
  type SourceSystemKey
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { classifyWordPressEvent } from "@/lib/sync/classify";
import {
  getAutoCreateContactDisplayName,
  requiresExistingContactForImport
} from "@/lib/sync/contact-resolution";
import type {
  SyncActivityState,
  SyncModeKey,
  SyncSourceProgressState,
  SyncStatusKey,
  WordPressSourceEvent
} from "@/lib/types";
import { decodeHtmlEntities, normalizeEmail } from "@/lib/utils";
import { fetchSourceEvents } from "@/lib/wordpress";

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readClassificationOverride(metadata: Prisma.JsonValue | null | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const override = (metadata as Record<string, unknown>).classificationOverride;
  if (!override || typeof override !== "object" || Array.isArray(override)) {
    return null;
  }

  const overrideRecord = override as Record<string, unknown>;
  const eventKind = typeof overrideRecord.eventKind === "string" ? overrideRecord.eventKind.trim() : "";
  const laneKey =
    typeof overrideRecord.laneKey === "string" &&
    Object.prototype.hasOwnProperty.call(LANE_META, overrideRecord.laneKey)
      ? (overrideRecord.laneKey as LaneKey)
      : null;

  if (!eventKind || !laneKey) {
    return null;
  }

  return {
    eventKind,
    laneKey
  };
}

function mergeImportedMetadataWithOverride(
  metadata: Record<string, unknown> | null | undefined,
  classificationOverride: Prisma.JsonValue | null | undefined
) {
  if (!classificationOverride) {
    return metadata ?? undefined;
  }

  return {
    ...(metadata ?? {}),
    classificationOverride
  };
}

function assertDatabase() {
  if (!prisma) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return prisma;
}

const ACTIVE_SYNC_SOURCES = SOURCE_SYSTEMS.filter((source) => source !== "MANUAL");
const SYNC_PAGE_SIZE = config.wordpressSyncPageSize;
const incrementalSyncInFlight = new Map<SourceSystemKey, Promise<SyncSourceProgressSnapshot>>();

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

interface SyncSourceProgressSnapshot {
  source: SourceSystemKey;
  mode: SyncModeKey;
  status: SyncStatusKey;
  fetchedCount: number;
  importedCount: number;
  unmatchedCount: number;
  errorCount: number;
  estimatedTotalCount: number | null;
}

function createIdleSyncActivityState(): SyncActivityState {
  return {
    active: false,
    mode: null,
    phase: "IDLE",
    source: null,
    totalSources: 0,
    completedSources: 0,
    currentSource: null,
    currentSourceLabel: null,
    startedAt: null,
    finishedAt: null,
    progressPercent: 0,
    fetchedCount: 0,
    importedCount: 0,
    unmatchedCount: 0,
    errorCount: 0,
    currentSourceFetchedCount: 0,
    currentSourceImportedCount: 0,
    currentSourceUnmatchedCount: 0,
    currentSourceErrorCount: 0,
    currentSourceEstimatedTotalCount: null,
    currentSourceProgressPercent: 0,
    sourceProgress: [],
    message: null
  };
}

function createSourceProgressEntries(targets: SourceSystemKey[]): SyncSourceProgressState[] {
  return targets.map((source) => ({
    source,
    label: SOURCE_LABELS[source],
    status: "PENDING",
    fetchedCount: 0,
    importedCount: 0,
    unmatchedCount: 0,
    errorCount: 0,
    estimatedTotalCount: null,
    progressPercent: 0
  }));
}

function sourceCountProgressPercent(fetchedCount: number, estimatedTotalCount: number | null) {
  if (!estimatedTotalCount || estimatedTotalCount <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((fetchedCount / estimatedTotalCount) * 100)));
}

function updateSourceProgressEntry(
  entries: SyncSourceProgressState[],
  source: SourceSystemKey,
  partial: Partial<SyncSourceProgressState>
) {
  return entries.map((entry) => (entry.source === source ? { ...entry, ...partial } : entry));
}

let syncActivityState: SyncActivityState = createIdleSyncActivityState();

function setSyncActivityState(nextState: SyncActivityState) {
  syncActivityState = nextState;
}

function updateSyncActivityState(partial: Partial<SyncActivityState>) {
  syncActivityState = {
    ...syncActivityState,
    ...partial
  };
}

function snapshotSyncActivityState(): SyncActivityState {
  return { ...syncActivityState };
}

function progressPercent(completedSources: number, totalSources: number) {
  if (totalSources <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((completedSources / totalSources) * 100)));
}

export function getSyncActivityState() {
  return snapshotSyncActivityState();
}

export function hasActiveBackfill() {
  return syncActivityState.active && syncActivityState.mode === "BACKFILL";
}

export function startBackfill(source?: SourceSystemKey) {
  if (hasActiveBackfill()) {
    return {
      started: false,
      state: snapshotSyncActivityState()
    };
  }

  const targets = source ? [source] : ACTIVE_SYNC_SOURCES;
  const startedAt = new Date().toISOString();

  setSyncActivityState({
    active: true,
    mode: "BACKFILL",
    phase: "RUNNING",
    source: source ?? null,
    totalSources: targets.length,
    completedSources: 0,
    currentSource: targets[0] ?? null,
    currentSourceLabel: targets[0] ? SOURCE_LABELS[targets[0]] : null,
    startedAt,
    finishedAt: null,
    progressPercent: 0,
    fetchedCount: 0,
    importedCount: 0,
    unmatchedCount: 0,
    errorCount: 0,
    currentSourceFetchedCount: 0,
    currentSourceImportedCount: 0,
    currentSourceUnmatchedCount: 0,
    currentSourceErrorCount: 0,
    currentSourceEstimatedTotalCount: null,
    currentSourceProgressPercent: 0,
    sourceProgress: createSourceProgressEntries(targets),
    message: null
  });

  void performBackfill(source, {
    onSourceStart(target, completedSources, totalSources) {
      updateSyncActivityState({
        active: true,
        phase: "RUNNING",
        currentSource: target,
        currentSourceLabel: SOURCE_LABELS[target],
        completedSources,
        totalSources,
        progressPercent: progressPercent(completedSources, totalSources),
        currentSourceFetchedCount: 0,
        currentSourceImportedCount: 0,
        currentSourceUnmatchedCount: 0,
        currentSourceErrorCount: 0,
        currentSourceEstimatedTotalCount: null,
        currentSourceProgressPercent: 0,
        sourceProgress: updateSourceProgressEntry(syncActivityState.sourceProgress, target, {
          status: "RUNNING",
          fetchedCount: 0,
          importedCount: 0,
          unmatchedCount: 0,
          errorCount: 0,
          estimatedTotalCount: null,
          progressPercent: 0
        }),
        message: `Backfilling ${SOURCE_LABELS[target]}`
      });
    },
    onSourceProgress(progress) {
      updateSyncActivityState({
        currentSource: progress.source,
        currentSourceLabel: SOURCE_LABELS[progress.source],
        currentSourceFetchedCount: progress.fetchedCount,
        currentSourceImportedCount: progress.importedCount,
        currentSourceUnmatchedCount: progress.unmatchedCount,
        currentSourceErrorCount: progress.errorCount,
        currentSourceEstimatedTotalCount: progress.estimatedTotalCount,
        currentSourceProgressPercent: sourceCountProgressPercent(progress.fetchedCount, progress.estimatedTotalCount),
        sourceProgress: updateSourceProgressEntry(syncActivityState.sourceProgress, progress.source, {
          status: progress.status,
          fetchedCount: progress.fetchedCount,
          importedCount: progress.importedCount,
          unmatchedCount: progress.unmatchedCount,
          errorCount: progress.errorCount,
          estimatedTotalCount: progress.estimatedTotalCount,
          progressPercent: sourceCountProgressPercent(progress.fetchedCount, progress.estimatedTotalCount)
        })
      });
    },
    onSourceComplete(target, result, completedSources, totalSources, totals) {
      updateSyncActivityState({
        active: completedSources < totalSources,
        phase: completedSources < totalSources ? "RUNNING" : totals.errorCount > 0 ? "FAILED" : "SUCCESS",
        currentSource: completedSources < totalSources ? syncActivityState.currentSource : null,
        currentSourceLabel: completedSources < totalSources ? syncActivityState.currentSourceLabel : null,
        completedSources,
        totalSources,
        progressPercent: progressPercent(completedSources, totalSources),
        fetchedCount: totals.fetchedCount,
        importedCount: totals.importedCount,
        unmatchedCount: totals.unmatchedCount,
        errorCount: totals.errorCount,
        currentSourceFetchedCount: result.fetchedCount,
        currentSourceImportedCount: result.importedCount,
        currentSourceUnmatchedCount: result.unmatchedCount,
        currentSourceErrorCount: result.errorCount,
        currentSourceEstimatedTotalCount: completedSources < totalSources ? syncActivityState.currentSourceEstimatedTotalCount : null,
        currentSourceProgressPercent:
          completedSources < totalSources ? syncActivityState.currentSourceProgressPercent : 0,
        sourceProgress: updateSourceProgressEntry(syncActivityState.sourceProgress, target, {
          status: result.status,
          fetchedCount: result.fetchedCount,
          importedCount: result.importedCount,
          unmatchedCount: result.unmatchedCount,
          errorCount: result.errorCount,
          estimatedTotalCount: result.estimatedTotalCount,
          progressPercent:
            result.estimatedTotalCount && result.estimatedTotalCount > 0
              ? 100
              : result.status === "SUCCESS" || result.status === "PARTIAL"
                ? 100
                : sourceCountProgressPercent(result.fetchedCount, result.estimatedTotalCount)
        }),
        message:
          completedSources < totalSources
            ? `Completed ${SOURCE_LABELS[target]}`
            : totals.errorCount > 0
              ? "Backfill finished with errors"
              : "Backfill complete"
      });
    },
    onComplete(result) {
      updateSyncActivityState({
        active: false,
        phase: result.errorCount > 0 ? "FAILED" : "SUCCESS",
        currentSource: null,
        currentSourceLabel: null,
        finishedAt: new Date().toISOString(),
        progressPercent: 100,
        fetchedCount: result.fetchedCount,
        importedCount: result.importedCount,
        unmatchedCount: result.unmatchedCount,
        errorCount: result.errorCount,
        currentSourceFetchedCount: 0,
        currentSourceImportedCount: 0,
        currentSourceUnmatchedCount: 0,
        currentSourceErrorCount: 0,
        currentSourceEstimatedTotalCount: null,
        currentSourceProgressPercent: 0,
        sourceProgress: syncActivityState.sourceProgress.map((entry) => {
          const finalEntry = result.sourceProgress.find((item) => item.source === entry.source);
          if (!finalEntry) {
            return entry;
          }

          return {
            ...entry,
            status: finalEntry.status,
            fetchedCount: finalEntry.fetchedCount,
            importedCount: finalEntry.importedCount,
            unmatchedCount: finalEntry.unmatchedCount,
            errorCount: finalEntry.errorCount,
            estimatedTotalCount: finalEntry.estimatedTotalCount,
            progressPercent:
              finalEntry.estimatedTotalCount && finalEntry.estimatedTotalCount > 0
                ? 100
                : finalEntry.status === "SUCCESS" || finalEntry.status === "PARTIAL"
                  ? 100
                  : entry.progressPercent
          };
        }),
        message: result.errorCount > 0 ? "Backfill finished with errors" : "Backfill complete"
      });
    },
    onError(error, totals) {
      updateSyncActivityState({
        active: false,
        phase: "FAILED",
        finishedAt: new Date().toISOString(),
        fetchedCount: totals.fetchedCount,
        importedCount: totals.importedCount,
        unmatchedCount: totals.unmatchedCount,
        errorCount: totals.errorCount + 1,
        currentSourceEstimatedTotalCount: null,
        currentSourceProgressPercent: 0,
        message: error instanceof Error ? error.message : "Backfill failed"
      });
    }
  }).catch(() => undefined);

  return {
    started: true,
    state: snapshotSyncActivityState()
  };
}

export async function ensureFreshData(source?: SourceSystemKey) {
  if (!prisma || !config.hasWordPressBridge) {
    return { refreshed: false, sources: [] as SourceSystemKey[] };
  }

  if (hasActiveBackfill()) {
    return { refreshed: false, sources: [] as SourceSystemKey[] };
  }

  await ensureCatalogSeeded();

  const db = assertDatabase();
  const targets = source ? [source] : [...AUTO_BACKGROUND_REFRESH_SOURCES];
  const states = await db.sourceSyncState.findMany({
    where: {
      source: {
        in: targets as PrismaSourceSystem[]
      }
    }
  });

  const stateBySource = new Map(states.map((state) => [state.source as SourceSystemKey, state]));
  const staleSources = targets.filter((target) => {
    const state = stateBySource.get(target);
    return !state?.lastSuccessfulSyncAt || Date.now() - state.lastSuccessfulSyncAt.getTime() > config.syncFreshnessMs;
  });

  const nextStaleSource = staleSources[0];
  if (!nextStaleSource) {
    return { refreshed: false, sources: [] as SourceSystemKey[] };
  }

  await runIncrementalSyncSingleFlight(nextStaleSource);

  return {
    refreshed: true,
    sources: [nextStaleSource]
  };
}

interface BackfillObserver {
  onSourceStart?(source: SourceSystemKey, completedSources: number, totalSources: number): void;
  onSourceProgress?(progress: SyncSourceProgressSnapshot): void;
  onSourceComplete?(
    source: SourceSystemKey,
    result: SyncSourceProgressSnapshot,
    completedSources: number,
    totalSources: number,
    totals: {
      fetchedCount: number;
      importedCount: number;
      unmatchedCount: number;
      errorCount: number;
    }
  ): void;
  onComplete?(result: {
    refreshed: boolean;
    sources: SourceSystemKey[];
    fetchedCount: number;
    importedCount: number;
    unmatchedCount: number;
    errorCount: number;
    sourceProgress: SyncSourceProgressSnapshot[];
  }): void;
  onError?(
    error: unknown,
    totals: {
      fetchedCount: number;
      importedCount: number;
      unmatchedCount: number;
      errorCount: number;
    }
  ): void;
}

async function performBackfill(source?: SourceSystemKey, observer?: BackfillObserver) {
  if (!prisma || !config.hasWordPressBridge) {
    return { refreshed: false, sources: [] as SourceSystemKey[] };
  }

  const targets = source ? [source] : ACTIVE_SYNC_SOURCES;
  const totals = {
    fetchedCount: 0,
    importedCount: 0,
    unmatchedCount: 0,
    errorCount: 0
  };
  const sourceProgress: SyncSourceProgressSnapshot[] = [];

  try {
    for (const [index, target] of targets.entries()) {
      observer?.onSourceStart?.(target, index, targets.length);
      const result = await syncSource(target, "BACKFILL", observer?.onSourceProgress);

      totals.fetchedCount += result.fetchedCount;
      totals.importedCount += result.importedCount;
      totals.unmatchedCount += result.unmatchedCount;
      totals.errorCount += result.errorCount;
      sourceProgress.push(result);

      observer?.onSourceComplete?.(target, result, index + 1, targets.length, totals);
    }
  } catch (error) {
    observer?.onError?.(error, totals);
    throw error;
  }

  const result = {
    refreshed: true,
    sources: targets,
    fetchedCount: totals.fetchedCount,
    importedCount: totals.importedCount,
    unmatchedCount: totals.unmatchedCount,
    errorCount: totals.errorCount,
    sourceProgress
  };

  observer?.onComplete?.(result);

  return result;
}

export async function runBackfill(source?: SourceSystemKey) {
  return performBackfill(source);
}

function runIncrementalSyncSingleFlight(source: SourceSystemKey) {
  const inFlight = incrementalSyncInFlight.get(source);
  if (inFlight) {
    return inFlight;
  }

  const syncPromise = syncSource(source, "INCREMENTAL").finally(() => {
    incrementalSyncInFlight.delete(source);
  });

  incrementalSyncInFlight.set(source, syncPromise);
  return syncPromise;
}

export async function syncSource(
  source: SourceSystemKey,
  mode: SyncModeKey,
  onProgress?: (progress: SyncSourceProgressSnapshot) => void
) {
  if (!prisma) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!config.hasWordPressBridge) {
    throw new Error("WordPress bridge configuration is incomplete.");
  }

  await ensureCatalogSeeded();

  const db = assertDatabase();
  const state = await db.sourceSyncState.upsert({
    where: { source: source as PrismaSourceSystem },
    update: {},
    create: { source: source as PrismaSourceSystem }
  });

  const syncRun = await db.syncRun.create({
    data: {
      source: source as PrismaSourceSystem,
      mode: mode as PrismaSyncMode,
      status: PrismaSyncStatus.RUNNING,
      cursorBefore: mode === "INCREMENTAL" ? state.lastCursor : null
    }
  });

  const rules = await getMappingRulesBySource(source);
  let page = 1;
  let cursor = mode === "INCREMENTAL" ? state.lastCursor : null;
  let fetchedCount = 0;
  let importedCount = 0;
  let unmatchedCount = 0;
  let errorCount = 0;
  let hasMore = true;
  const errors: string[] = [];
  const contactResolutionCache = new Map<string, string | null>();
  let estimatedTotalCount: number | null = null;

  const emitProgress = (status: SyncStatusKey) => {
    onProgress?.({
      source,
      mode,
      status,
      fetchedCount,
      importedCount,
      unmatchedCount,
      errorCount,
      estimatedTotalCount
    });
  };

  try {
    emitProgress("RUNNING");

    while (hasMore) {
      const feed = await fetchSourceEvents(source, {
        mode,
        cursor,
        page,
        limit: SYNC_PAGE_SIZE
      });

      if (typeof feed.estimatedTotal === "number") {
        estimatedTotalCount = feed.estimatedTotal;
      }

      await primeContactResolutionCache(feed.items, contactResolutionCache);

      if (feed.items.length === 0) {
        hasMore = false;
      }

      for (const item of feed.items) {
        fetchedCount += 1;

        try {
          const result = await ingestSourceEvent({
            source,
            event: item,
            sourceCursor: feed.nextCursor ?? cursor,
            syncRunId: syncRun.id,
            rules,
            contactResolutionCache
          });

          if (result === "IMPORTED") {
            importedCount += 1;
          } else if (result === "UNMATCHED") {
            unmatchedCount += 1;
          }
        } catch (error) {
          errorCount += 1;
          errors.push(error instanceof Error ? error.message : "Unknown import error");
        }
      }

      await db.syncRun.update({
        where: { id: syncRun.id },
        data: {
          fetchedCount,
          importedCount,
          unmatchedCount,
          errorCount
        }
      });

      emitProgress("RUNNING");

      if (mode === "BACKFILL") {
        page += 1;
        hasMore = feed.hasMore;
      } else {
        hasMore = feed.hasMore;
        cursor = feed.nextCursor ?? cursor;
        if (feed.nextCursor === null) {
          hasMore = false;
        }
      }

      if (hasMore && mode === "BACKFILL" && config.wordpressSyncRequestDelayMs > 0) {
        await delay(config.wordpressSyncRequestDelayMs);
      }
    }

    const status = errorCount > 0 ? PrismaSyncStatus.PARTIAL : PrismaSyncStatus.SUCCESS;

    await db.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status,
        cursorAfter: cursor,
        fetchedCount,
        importedCount,
        unmatchedCount,
        errorCount,
        errorLog: errors.length > 0 ? errors : undefined,
        finishedAt: new Date()
      }
    });

    await db.sourceSyncState.update({
      where: { source: source as PrismaSourceSystem },
      data: {
        lastCursor: mode === "INCREMENTAL" ? cursor : state.lastCursor,
        lastBackfillPage: mode === "BACKFILL" ? page - 1 : state.lastBackfillPage,
        lastBackfillCompletedAt: mode === "BACKFILL" ? new Date() : state.lastBackfillCompletedAt,
        lastSuccessfulSyncAt: new Date(),
        lastSyncRunId: syncRun.id
      }
    });

    const result = {
      source,
      mode,
      status: (status === PrismaSyncStatus.PARTIAL ? "PARTIAL" : "SUCCESS") as SyncStatusKey,
      fetchedCount,
      importedCount,
      unmatchedCount,
      errorCount,
      estimatedTotalCount
    };

    emitProgress(result.status);

    return result;
  } catch (error) {
    await db.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: PrismaSyncStatus.FAILED,
        fetchedCount,
        importedCount,
        unmatchedCount,
        errorCount: errorCount + 1,
        errorLog: [...errors, error instanceof Error ? error.message : "Unknown sync failure"],
        finishedAt: new Date()
      }
    });

    emitProgress("FAILED");

    throw error;
  }
}

async function ingestSourceEvent(input: {
  source: SourceSystemKey;
  event: WordPressSourceEvent;
  sourceCursor?: string | null;
  syncRunId: string;
  rules: Awaited<ReturnType<typeof getMappingRulesBySource>>;
  contactResolutionCache?: Map<string, string | null>;
}) {
  const db = assertDatabase();
  const classified = classifyWordPressEvent(input.source, input.event, input.rules);
  const normalized = normalizeEmail(input.event.email);

  if (!normalized) {
    if (requiresExistingContactForImport(input.source)) {
      return "SKIPPED" as const;
    }

    await upsertUnmatchedEvent({
      source: input.source,
      sourceEventId: input.event.externalId,
      sourceCursor: input.sourceCursor,
      occurredAt: new Date(input.event.occurredAt),
      eventKind: classified.eventKind,
      laneKey: classified.laneKey,
      candidateEmail: input.event.email ?? null,
      normalizedEmail: null,
      reason: "Event does not include a usable email address.",
      rawPayload: input.event,
      syncRunId: input.syncRunId
    });
    return "UNMATCHED" as const;
  }

  let contactId =
    input.contactResolutionCache?.has(normalized)
      ? input.contactResolutionCache.get(normalized) ?? null
      : null;

  if (!input.contactResolutionCache?.has(normalized)) {
    contactId = await findContactIdByNormalizedEmail(normalized);
    input.contactResolutionCache?.set(normalized, contactId);
  }

  if (!contactId) {
    if (requiresExistingContactForImport(input.source)) {
      input.contactResolutionCache?.set(normalized, null);
      return "SKIPPED" as const;
    }

    const displayName = getAutoCreateContactDisplayName(input.event);

    if (displayName) {
      contactId = await createContactWithPrimaryEmail({
        email: input.event.email ?? normalized,
        displayName,
        source: input.source
      });
      input.contactResolutionCache?.set(normalized, contactId);
    }
  }

  if (!contactId) {
    input.contactResolutionCache?.set(normalized, null);
    await upsertUnmatchedEvent({
      source: input.source,
      sourceEventId: input.event.externalId,
      sourceCursor: input.sourceCursor,
      occurredAt: new Date(input.event.occurredAt),
      eventKind: classified.eventKind,
      laneKey: classified.laneKey,
      candidateEmail: input.event.email ?? null,
      normalizedEmail: normalized,
      reason: "No exact email match found.",
      rawPayload: input.event,
      syncRunId: input.syncRunId
    });
    return "UNMATCHED" as const;
  }

  const existingTimelineEvent = await db.timelineEvent.findUnique({
    where: {
      source_sourceEventId: {
        source: input.source as PrismaSourceSystem,
        sourceEventId: input.event.externalId
      }
    },
    select: {
      eventKind: true,
      laneKey: true,
      metadata: true
    }
  });

  const classificationOverride = readClassificationOverride(existingTimelineEvent?.metadata);
  const nextEventKind = classificationOverride?.eventKind ?? classified.eventKind;
  const nextLaneKey = classificationOverride?.laneKey ?? classified.laneKey;
  const nextMetadata = mergeImportedMetadataWithOverride(
    input.event.metadata ?? null,
    existingTimelineEvent?.metadata &&
      typeof existingTimelineEvent.metadata === "object" &&
      !Array.isArray(existingTimelineEvent.metadata)
      ? (existingTimelineEvent.metadata as Record<string, unknown>).classificationOverride ?? null
      : null
  );

  await db.$transaction(async (tx) => {
    await tx.timelineEvent.upsert({
      where: {
        source_sourceEventId: {
          source: input.source as PrismaSourceSystem,
          sourceEventId: input.event.externalId
        }
      },
      update: {
        contactId,
        sourceCursor: input.sourceCursor ?? null,
        occurredAt: new Date(input.event.occurredAt),
        eventKind: nextEventKind,
        laneKey: nextLaneKey as PrismaLaneKey,
        title: decodeHtmlEntities(classified.title) ?? classified.title,
        summary: decodeHtmlEntities(classified.summary),
        amountCents: input.event.amountCents ?? null,
        currency: input.event.currency ?? "USD",
        roleKey: classified.roleKey,
        metadata: nextMetadata ? toInputJson(nextMetadata) : undefined,
        rawPayload: toInputJson(input.event.rawPayload ?? input.event),
        mappingRuleId: classificationOverride ? null : classified.mappingRuleId ?? null,
        syncRunId: input.syncRunId
      },
      create: {
        contactId,
        source: input.source as PrismaSourceSystem,
        sourceEventId: input.event.externalId,
        sourceCursor: input.sourceCursor ?? null,
        occurredAt: new Date(input.event.occurredAt),
        eventKind: nextEventKind,
        laneKey: nextLaneKey as PrismaLaneKey,
        title: decodeHtmlEntities(classified.title) ?? classified.title,
        summary: decodeHtmlEntities(classified.summary),
        amountCents: input.event.amountCents ?? null,
        currency: input.event.currency ?? "USD",
        roleKey: classified.roleKey,
        metadata: nextMetadata ? toInputJson(nextMetadata) : undefined,
        rawPayload: toInputJson(input.event.rawPayload ?? input.event),
        mappingRuleId: classificationOverride ? null : classified.mappingRuleId ?? null,
        syncRunId: input.syncRunId
      }
    });

    if (input.event.profile) {
      await persistProfileValues(tx, {
        contactId,
        source: input.source as PrismaSourceSystem,
        profile: input.event.profile,
        occurredAt: new Date(input.event.occurredAt)
      });

      if (Array.isArray(input.event.profile.certifications)) {
        await persistContactCertifications(tx, {
          contactId,
          source: input.source as PrismaSourceSystem,
          certifications: input.event.profile.certifications,
          observedAt: new Date(input.event.occurredAt)
        });
      }
    }

    if ((input.event.identities?.length ?? 0) > 0) {
      await persistExternalIdentities(tx, {
        contactId,
        source: input.source as PrismaSourceSystem,
        identities: input.event.identities ?? []
      });
    }

    await tx.unmatchedEvent.updateMany({
      where: {
        source: input.source as PrismaSourceSystem,
        sourceEventId: input.event.externalId,
        status: ReviewStatus.PENDING
      },
      data: {
        status: ReviewStatus.ASSIGNED,
        assignedContactId: contactId,
        resolvedAt: new Date()
      }
    });
  });

  return "IMPORTED" as const;
}

async function primeContactResolutionCache(
  items: WordPressSourceEvent[],
  cache: Map<string, string | null>
) {
  const db = assertDatabase();
  const normalizedEmails = Array.from(
    new Set(
      items
        .map((item) => normalizeEmail(item.email))
        .filter((email): email is string => Boolean(email))
        .filter((email) => !cache.has(email))
    )
  );

  if (normalizedEmails.length === 0) {
    return;
  }

  const matches = await db.contactEmail.findMany({
    where: {
      normalizedEmail: {
        in: normalizedEmails
      }
    },
    select: {
      normalizedEmail: true,
      contactId: true
    }
  });

  for (const email of normalizedEmails) {
    cache.set(email, null);
  }

  for (const match of matches) {
    cache.set(match.normalizedEmail, match.contactId);
  }
}

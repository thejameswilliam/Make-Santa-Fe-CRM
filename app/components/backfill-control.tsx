"use client";

import { startTransition, useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import type { SyncActivityState } from "@/lib/types";

const IDLE_ACTIVITY: SyncActivityState = {
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

function formatProgressValue(activity: SyncActivityState, starting: boolean) {
  if (activity.active) {
    return Math.max(activity.progressPercent, 6);
  }

  if (starting) {
    return 8;
  }

  if (activity.phase === "SUCCESS" || activity.phase === "FAILED") {
    return 100;
  }

  return 0;
}

function formatCount(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "Unknown";
  }

  return value.toLocaleString();
}

export function BackfillControl({
  variant = "default"
}: {
  variant?: "default" | "compact";
}) {
  const router = useRouter();
  const [activity, setActivity] = useState<SyncActivityState>(IDLE_ACTIVITY);
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFinishedAt = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialActivity() {
      const response = await fetch("/api/sync", {
        method: "GET",
        cache: "no-store"
      });

      if (!response.ok || cancelled) {
        return;
      }

      const payload = (await response.json()) as SyncActivityState;

      if (!cancelled) {
        setActivity(payload);
      }
    }

    void loadInitialActivity();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activity.active && !starting) {
      return;
    }

    let cancelled = false;

    async function refreshActivity() {
      const response = await fetch("/api/sync", {
        method: "GET",
        cache: "no-store"
      });

      if (!response.ok || cancelled) {
        return;
      }

      const payload = (await response.json()) as SyncActivityState;

      if (!cancelled) {
        setActivity(payload);
      }
    }

    void refreshActivity();

    const interval = window.setInterval(() => {
      void refreshActivity();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activity.active, starting]);

  useEffect(() => {
    if (!activity.finishedAt || activity.finishedAt === lastFinishedAt.current) {
      return;
    }

    lastFinishedAt.current = activity.finishedAt;
    setStarting(false);

    if (activity.phase === "FAILED") {
      setError(activity.message ?? "Backfill finished with errors.");
    } else {
      setError(null);
    }

    startTransition(() => {
      router.refresh();
    });
  }, [activity.finishedAt, activity.message, activity.phase, router]);

  const overlayVisible = starting || activity.active;

  useEffect(() => {
    if (overlayVisible) {
      setConfirming(false);
    }
  }, [overlayVisible]);

  async function startBackfill() {
    setError(null);
    setStarting(true);
    setConfirming(false);
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode: "BACKFILL",
          async: true,
          source: null
        })
      });

      const payload = (await response.json()) as
        | { error?: string; state?: SyncActivityState }
        | { started?: boolean; state?: SyncActivityState };

      if (!response.ok) {
        setStarting(false);
        setError("error" in payload && payload.error ? payload.error : "Unable to start backfill.");
        return;
      }

      if ("state" in payload && payload.state) {
        setActivity(payload.state);
      }
    } catch {
      setStarting(false);
      setError("Unable to start backfill.");
    }
  }

  function handleBackfillClick() {
    if (overlayVisible) {
      return;
    }

    if (!confirming) {
      setConfirming(true);
      setError(null);
      return;
    }

    void startBackfill();
  }

  const progressValue = formatProgressValue(activity, starting);
  const currentSourceHasEstimate = typeof activity.currentSourceEstimatedTotalCount === "number";

  return (
    <>
      <div className={variant === "compact" ? "backfill-control-compact" : "backfill-control"}>
        <div className={variant === "compact" ? "button-row-compact" : "button-row"}>
          <button
            className={variant === "compact" ? "topbar-action-button topbar-action-button-danger" : "button"}
            disabled={overlayVisible}
            onClick={handleBackfillClick}
            type="button"
          >
            {overlayVisible
              ? "Backfill running"
              : confirming
                ? "Start full backfill"
                : variant === "compact"
                  ? "Backfill"
                  : "Run full backfill"}
          </button>

          {confirming ? (
            <button className="button-ghost" onClick={() => setConfirming(false)} type="button">
              Cancel
            </button>
          ) : null}
        </div>

        {confirming ? (
          <div className="backfill-confirmation">
            <strong>Warning</strong>
            <p className="form-note">
              Full backfill re-imports every source, can take several minutes, and puts extra load on WordPress.
              Only run it when you intentionally need a complete refresh.
            </p>
          </div>
        ) : null}

        {error ? <div className="inline-alert inline-alert-error">{error}</div> : null}
      </div>

      {overlayVisible ? (
        <div className="sync-overlay" role="alert" aria-live="polite">
          <div className="sync-overlay-card">
            <div className="section-stack">
              <span className="eyebrow">Backfill</span>
              <h2 className="section-title">{activity.currentSourceLabel ?? "Starting backfill"}</h2>
              <p className="form-note">
                {activity.totalSources > 0
                  ? `${activity.completedSources} of ${activity.totalSources} sources completed`
                  : "Preparing sources"}
              </p>
            </div>

            <div className="progress-track" aria-hidden="true">
              <div className="progress-fill" style={{ width: `${progressValue}%` }} />
            </div>

            <div className="surface-row sync-source-progress-heading">
              <strong>Overall progress</strong>
              <span className="muted">
                {activity.totalSources > 0
                  ? `${activity.completedSources} / ${activity.totalSources} sources`
                  : "Preparing sources"}
              </span>
            </div>

            <div className="section-stack">
              <div className="surface-row sync-source-progress-heading">
                <strong>{activity.currentSourceLabel ?? "Current source"}</strong>
                <span className="muted">
                  {activity.currentSourceFetchedCount.toLocaleString()}
                  {currentSourceHasEstimate ? ` / ${formatCount(activity.currentSourceEstimatedTotalCount)}` : ""}
                </span>
              </div>
              <div className="progress-track progress-track-secondary" aria-hidden="true">
                <div
                  className="progress-fill progress-fill-secondary"
                  style={{
                    width: currentSourceHasEstimate
                      ? `${Math.max(activity.currentSourceProgressPercent, activity.currentSourceFetchedCount > 0 ? 4 : 0)}%`
                      : activity.currentSourceFetchedCount > 0
                        ? "100%"
                        : "0%"
                  }}
                />
              </div>
              <p className="helper-copy helper-copy-compact">
                {currentSourceHasEstimate
                  ? `Estimated events for this source: ${formatCount(activity.currentSourceEstimatedTotalCount)}`
                  : "Total event estimate is not available for this source yet."}
              </p>
            </div>

            <div className="field-grid sync-overlay-stats">
              <div className="surface-row">
                <strong>Fetched</strong>
                <span className="muted">{activity.fetchedCount.toLocaleString()}</span>
              </div>
              <div className="surface-row">
                <strong>Imported</strong>
                <span className="muted">{activity.importedCount.toLocaleString()}</span>
              </div>
              <div className="surface-row">
                <strong>Review queue</strong>
                <span className="muted">{activity.unmatchedCount.toLocaleString()}</span>
              </div>
              <div className="surface-row">
                <strong>Errors</strong>
                <span className="muted">{activity.errorCount.toLocaleString()}</span>
              </div>
            </div>

            <p className="helper-copy">
              {activity.currentSourceLabel
                ? `Processing ${activity.currentSourceLabel}... ${activity.currentSourceFetchedCount.toLocaleString()} events read for this source so far.`
                : "Starting backfill..."}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

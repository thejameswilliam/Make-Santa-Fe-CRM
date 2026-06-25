"use client";

import { useEffect, useState } from "react";

const BACKGROUND_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
const BACKGROUND_REFRESH_IDLE_TIMEOUT_MS = 1500;

export function BackgroundRefresh({
  enabled,
  notifyEnabled,
  source,
  message
}: {
  enabled: boolean;
  notifyEnabled?: boolean;
  source?: string;
  message: string;
}) {
  const [status, setStatus] = useState<"idle" | "scheduled" | "syncing" | "done" | "error">("idle");

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }

    const key = `msf-crm-refresh:${source ?? "all"}`;
    const lastRefresh = Number(window.sessionStorage.getItem(key) ?? "0");
    if (Date.now() - lastRefresh < BACKGROUND_REFRESH_COOLDOWN_MS) {
      return;
    }

    let cancelled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let idleHandle: number | undefined;

    const runRefresh = async () => {
      if (cancelled) {
        return;
      }

      window.sessionStorage.setItem(key, String(Date.now()));
      setStatus("syncing");

      try {
        const response = await fetch("/api/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            mode: "INCREMENTAL",
            source: source ?? null
          })
        });

        if (!response.ok) {
          if (!cancelled) {
            setStatus("error");
          }
          return;
        }

        const payload = (await response.json()) as { refreshed?: boolean };
        if (!cancelled) {
          setStatus(payload.refreshed ? "done" : "idle");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
        }
      }
    };

    setStatus("scheduled");

    if ("requestIdleCallback" in window) {
      idleHandle = window.requestIdleCallback(() => {
        void runRefresh();
      }, { timeout: BACKGROUND_REFRESH_IDLE_TIMEOUT_MS });
    } else {
      timeoutHandle = setTimeout(() => {
        void runRefresh();
      }, BACKGROUND_REFRESH_IDLE_TIMEOUT_MS);
    }

    return () => {
      cancelled = true;
      if (typeof idleHandle === "number" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    };
  }, [enabled, source]);

  if (!enabled || !notifyEnabled) {
    return null;
  }

  let statusMessage = message;
  if (status === "scheduled") {
    statusMessage = `${message} Refresh queued.`;
  } else if (status === "syncing") {
    statusMessage = `${message} Refreshing stale data in the background…`;
  } else if (status === "done") {
    statusMessage = `${message} Background refresh complete. Updated data will appear on the next page load.`;
  } else if (status === "error") {
    statusMessage = `${message} Background refresh could not complete right now.`;
  }

  return (
    <p className="form-note">{statusMessage}</p>
  );
}

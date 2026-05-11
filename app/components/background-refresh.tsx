"use client";

import { startTransition, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

export function BackgroundRefresh({
  enabled,
  source,
  message
}: {
  enabled: boolean;
  source?: string;
  message: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "syncing" | "done">("idle");

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const key = `msf-crm-refresh:${source ?? "all"}`;
    const lastRefresh = Number(window.sessionStorage.getItem(key) ?? "0");
    if (Date.now() - lastRefresh < 30_000) {
      return;
    }

    window.sessionStorage.setItem(key, String(Date.now()));
    setStatus("syncing");

    startTransition(async () => {
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

      if (response.ok) {
        const payload = (await response.json()) as { refreshed?: boolean };
        if (payload.refreshed) {
          router.refresh();
        }
      }

      setStatus("done");
    });
  }, [enabled, router, source]);

  if (!enabled) {
    return null;
  }

  return (
    <p className="form-note">
      {status === "syncing" ? `${message} Refreshing source data in the background…` : message}
    </p>
  );
}

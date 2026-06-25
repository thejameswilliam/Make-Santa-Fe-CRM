"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const START_PROGRESS = 12;
const MAX_AUTO_PROGRESS = 88;
const FINISH_DELAY_MS = 180;
const FAILSAFE_RESET_MS = 12_000;

function buildCurrentRouteKey(pathname: string, searchParams: { toString(): string }) {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function NavigationLoadingBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentRouteKey = useMemo(
    () => buildCurrentRouteKey(pathname, searchParams),
    [pathname, searchParams]
  );

  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [settling, setSettling] = useState(false);
  const activeRouteRef = useRef(currentRouteKey);
  const finishTimeoutRef = useRef<number | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const failsafeTimeoutRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (finishTimeoutRef.current) {
      window.clearTimeout(finishTimeoutRef.current);
      finishTimeoutRef.current = null;
    }

    if (progressIntervalRef.current) {
      window.clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    if (failsafeTimeoutRef.current) {
      window.clearTimeout(failsafeTimeoutRef.current);
      failsafeTimeoutRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    clearTimers();
    setProgress(100);
    setSettling(true);

    finishTimeoutRef.current = window.setTimeout(() => {
      setVisible(false);
      setSettling(false);
      setProgress(0);
      finishTimeoutRef.current = null;
    }, FINISH_DELAY_MS);
  }, [clearTimers]);

  const start = useCallback(() => {
    clearTimers();
    setVisible(true);
    setSettling(false);
    setProgress((current) => (current > 0 ? Math.max(current, START_PROGRESS) : START_PROGRESS));

    progressIntervalRef.current = window.setInterval(() => {
      setProgress((current) => {
        if (current >= MAX_AUTO_PROGRESS) {
          return current;
        }

        if (current < 32) {
          return Math.min(current + 14, MAX_AUTO_PROGRESS);
        }

        if (current < 58) {
          return Math.min(current + 7, MAX_AUTO_PROGRESS);
        }

        if (current < 76) {
          return Math.min(current + 3, MAX_AUTO_PROGRESS);
        }

        return Math.min(current + 1, MAX_AUTO_PROGRESS);
      });
    }, 140);

    failsafeTimeoutRef.current = window.setTimeout(() => {
      finish();
    }, FAILSAFE_RESET_MS);
  }, [clearTimers, finish]);

  useEffect(() => {
    activeRouteRef.current = currentRouteKey;

    if (visible) {
      finish();
    }
  }, [currentRouteKey, finish, visible]);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      if (
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        anchor.getAttribute("rel")?.includes("external")
      ) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) {
        return;
      }

      let nextUrl: URL;
      try {
        nextUrl = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      if (nextUrl.origin !== window.location.origin) {
        return;
      }

      const nextRouteKey = `${nextUrl.pathname}${nextUrl.search}`;
      if (nextRouteKey === activeRouteRef.current) {
        return;
      }

      start();
    }

    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      clearTimers();
    };
  }, [clearTimers, start]);

  return (
    <div
      aria-hidden="true"
      className={`navigation-progress${visible ? " is-visible" : ""}${settling ? " is-settling" : ""}`}
    >
      <span className="navigation-progress-bar" style={{ width: `${progress}%` }} />
    </div>
  );
}

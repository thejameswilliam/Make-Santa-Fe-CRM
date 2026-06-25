"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";
import type { Route } from "next";

import { BackfillControl } from "@/app/components/backfill-control";

export function TopbarMenu({
  currentPath,
  adminItems
}: {
  currentPath: string;
  adminItems: ReadonlyArray<{ href: Route; label: string }>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    setIsOpen(false);
  }, [currentPath]);

  return (
    <div className={`topbar-menu${isOpen ? " is-open" : ""}`} ref={menuRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="topbar-menu-trigger"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="topbar-menu-icon" aria-hidden="true">
          ...
        </span>
        <span>Admin</span>
      </button>

      <div aria-hidden={!isOpen} className="topbar-menu-panel" hidden={!isOpen} role="menu">
        <div className="topbar-menu-section">
          <span className="topbar-menu-label">Pages</span>
          <div className="topbar-menu-links">
            {adminItems.map((item) => (
              <Link
                key={item.href}
                className={`topbar-menu-link${currentPath === item.href ? " active" : ""}`}
                href={item.href}
                onClick={() => setIsOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="topbar-menu-section topbar-menu-section-danger">
          <span className="topbar-menu-label">Data tools</span>
          <BackfillControl variant="compact" />
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import type { Route } from "next";

import { BackfillControl } from "@/app/components/backfill-control";
import { config } from "@/lib/config";
import type { SessionUser } from "@/lib/types";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/cultivation", label: "Cultivation" },
  { href: "/people", label: "People" },
  { href: "/review-queue", label: "Donation Review" }
] as const satisfies ReadonlyArray<{ href: Route; label: string }>;

const ADMIN_ITEMS = [
  { href: "/manual", label: "Manual" },
  { href: "/mappings", label: "Mappings" }
] as const satisfies ReadonlyArray<{ href: Route; label: string }>;

export function AppShell({
  currentPath,
  session,
  children
}: {
  currentPath: string;
  session: SessionUser;
  children: React.ReactNode;
}) {
  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">CRM</span>
        </div>

        <nav className="topbar-links" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              className={`topbar-link${currentPath === item.href ? " active" : ""}`}
              href={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="topbar-meta">
          <details className="topbar-menu">
            <summary className="topbar-menu-trigger" aria-label="Open tools menu">
              <span className="topbar-menu-icon" aria-hidden="true">
                ☰
              </span>
              <span>Tools</span>
            </summary>

            <div className="topbar-menu-panel">
              <div className="topbar-menu-section">
                <span className="topbar-menu-label">Pages</span>
                <div className="topbar-menu-links">
                  {ADMIN_ITEMS.map((item) => (
                    <Link
                      key={item.href}
                      className={`topbar-menu-link${currentPath === item.href ? " active" : ""}`}
                      href={item.href}
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
          </details>

          {!config.hasDatabase ? <span className="status-pill">Demo data mode</span> : null}
          <span className="status-pill">{session.name}</span>
          <form action="/api/auth/logout" method="post">
            <button className="button-ghost" type="submit">
              Log out
            </button>
          </form>
        </div>
      </header>

      <main className="page-grid">{children}</main>
    </div>
  );
}

import Link from "next/link";
import type { Route } from "next";

import { BackfillControl } from "@/app/components/backfill-control";
import { config } from "@/lib/config";
import type { SessionUser } from "@/lib/types";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/cultivation", label: "Cultivation" },
  { href: "/people", label: "People" },
  { href: "/review-queue", label: "Review Queue" },
  { href: "/mappings", label: "Mappings" },
  { href: "/manual", label: "Manual" }
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
          <BackfillControl variant="compact" />
        </nav>

        <div className="topbar-meta">
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

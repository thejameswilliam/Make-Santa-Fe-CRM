import Link from "next/link";
import type { Route } from "next";

import { ThemeToggle } from "@/app/components/theme-toggle";
import { TopbarMenu } from "@/app/components/topbar-menu";
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
          <span className="brand-kicker">Make Santa Fe</span>
          <span className="brand-mark">CRM Workspace</span>
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
          <ThemeToggle />
          <TopbarMenu adminItems={ADMIN_ITEMS} currentPath={currentPath} />

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

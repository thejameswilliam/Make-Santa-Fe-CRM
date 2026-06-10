"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem("msf-crm-theme");
    if (stored === "light" || stored === "dark") return stored;
  } catch {}
  return null;
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("msf-crm-theme", theme);
  } catch {}
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const initial = getStoredTheme() ?? getSystemTheme();
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
      className="topbar-action-button theme-toggle-btn"
      onClick={toggle}
      title={theme === "light" ? "Dark mode" : "Light mode"}
      type="button"
    >
      {theme === "light" ? "◑" : "○"}
    </button>
  );
}

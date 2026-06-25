"use client";

import { useEffect, useState } from "react";

import type { DonationAnalyticsData, DonationMonthlyPoint } from "@/lib/types";
import { formatDateInputValue, formatInCrmTimeZone } from "@/lib/utils";

// ── Date helpers ──────────────────────────────────────────────────────────────

function toDateString(date: Date): string {
  return formatDateInputValue(date);
}

function defaultRange(months: number): { startDate: string; endDate: string } {
  const end = toDateString(new Date());
  const [year, month, day] = end.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1 - months, day, 12));

  return { startDate: toDateString(start), endDate: end };
}

function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(monthNum) - 1, 1, 12));
  return formatInCrmTimeZone(date, { month: "short", year: "2-digit" });
}

// ── Number formatters ─────────────────────────────────────────────────────────

function centsToDisplay(cents: number | null): string {
  if (cents === null) return "—";
  const dollars = cents / 100;
  if (dollars >= 10000) return `$${(dollars / 1000).toFixed(0)}k`;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${dollars.toFixed(0)}`;
}

function axisLabel(dollars: number): string {
  if (dollars === 0) return "$0";
  if (dollars >= 10000) return `$${(dollars / 1000).toFixed(0)}k`;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${dollars.toFixed(0)}`;
}

function niceMax(max: number): number {
  if (max <= 0) return 100;
  const mag = Math.pow(10, Math.floor(Math.log10(max)));
  const norm = max / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

// ── SVG Line Chart ────────────────────────────────────────────────────────────

const W = 640;
const H = 190;
const PAD = { top: 12, right: 18, bottom: 38, left: 58 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

interface ChartData {
  month: string;
  dollars: number;
}

function SvgLineChart({
  id,
  data,
  color,
  empty,
}: {
  id: string;
  data: ChartData[];
  color: string;
  empty: boolean;
}) {
  const maxVal = Math.max(...data.map((d) => d.dollars), 0);
  const yMax = niceMax(maxVal);
  const n = data.length;

  function toX(i: number) {
    return PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  }

  function toY(dollars: number) {
    return PAD.top + plotH - (dollars / yMax) * plotH;
  }

  const points = data.map((d, i) => ({ x: toX(i), y: toY(d.dollars), dollars: d.dollars, month: d.month }));
  const polyPoints = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  const baseY = PAD.top + plotH;
  const areaPath =
    points.length > 1
      ? [
          `M ${points[0].x.toFixed(1)} ${baseY}`,
          ...points.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
          `L ${points[points.length - 1].x.toFixed(1)} ${baseY}`,
          "Z",
        ].join(" ")
      : "";

  const yTicks = [0, yMax * 0.5, yMax].map((v) => ({ v, y: toY(v) }));

  const maxLabels = 8;
  const step = Math.ceil(n / maxLabels);
  const xLabels = data
    .map((d, i) => ({ month: d.month, x: toX(i), show: i % step === 0 || i === n - 1 }))
    .filter((l) => l.show);

  const gradId = `da-grad-${id}`;

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {/* Y grid + labels */}
      {yTicks.map(({ v, y }) => (
        <g key={v}>
          <line
            x1={PAD.left}
            y1={y}
            x2={W - PAD.right}
            y2={y}
            stroke="rgba(121,98,255,0.14)"
            strokeWidth="1"
          />
          <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca4c7">
            {axisLabel(v)}
          </text>
        </g>
      ))}

      {/* X labels */}
      {xLabels.map((l) => (
        <text
          key={l.month}
          x={l.x}
          y={H - 6}
          textAnchor="middle"
          fontSize="10"
          fill="#9ca4c7"
        >
          {formatMonthLabel(l.month)}
        </text>
      ))}

      {empty || points.length < 2 ? (
        <text
          x={W / 2}
          y={H / 2}
          textAnchor="middle"
          fontSize="12"
          fill="#9ca4c7"
        >
          No data for this period
        </text>
      ) : (
        <>
          <path d={areaPath} fill={`url(#${gradId})`} />
          <polyline
            points={polyPoints}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 5px ${color}66)` }}
          />
          {points.map((p, i) => (
            <g key={i}>
              <title>{`${formatMonthLabel(p.month)}: ${axisLabel(p.dollars)}`}</title>
              <circle
                cx={p.x}
                cy={p.y}
                r="3.5"
                fill={color}
                stroke="rgba(9,5,19,0.85)"
                strokeWidth="1.5"
              />
            </g>
          ))}
        </>
      )}
    </svg>
  );
}

// ── Stat widget ───────────────────────────────────────────────────────────────

function StatWidget({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="donation-stat-widget">
      <span className="donation-stat-label">{label}</span>
      <strong className="donation-stat-value">{value}</strong>
      {sub ? <span className="donation-stat-sub">{sub}</span> : null}
    </div>
  );
}

// ── Preset buttons ────────────────────────────────────────────────────────────

const PRESETS = [
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "12M", months: 12 },
  { label: "24M", months: 24 },
] as const;

// ── Main component ────────────────────────────────────────────────────────────

export function DonationAnalytics() {
  const initial = defaultRange(12);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [activePreset, setActivePreset] = useState<number | null>(12);
  const [data, setData] = useState<DonationAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/cultivation/donation-analytics?startDate=${startDate}&endDate=${endDate}`
        );
        if (cancelled) return;

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: unknown };
          setError(typeof body.error === "string" ? body.error : "Could not load analytics.");
          return;
        }

        const payload = (await res.json()) as DonationAnalyticsData;
        if (!cancelled) setData(payload);
      } catch {
        if (!cancelled) setError("Could not load analytics.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate]);

  function applyPreset(months: number) {
    const range = defaultRange(months);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
    setActivePreset(months);
  }

  function handleStartDate(value: string) {
    setStartDate(value);
    setActivePreset(null);
  }

  function handleEndDate(value: string) {
    setEndDate(value);
    setActivePreset(null);
  }

  const totalChart: ChartData[] =
    data?.monthlyData.map((p: DonationMonthlyPoint) => ({
      month: p.month,
      dollars: p.totalCents / 100,
    })) ?? [];

  const avgChart: ChartData[] =
    data?.monthlyData.map((p: DonationMonthlyPoint) => ({
      month: p.month,
      dollars: (p.avgCents ?? 0) / 100,
    })) ?? [];

  const isEmpty = !data || data.totalCount === 0;

  return (
    <section className="panel cultivation-section donation-analytics-section">
      <div className="panel-header donation-analytics-header">
        <div>
          <span className="eyebrow">Donor Analytics</span>
          <h2 className="section-title">Donation Trends</h2>
        </div>
        <div className="donation-analytics-controls">
          <div className="donation-preset-buttons">
            {PRESETS.map((p) => (
              <button
                className={`donation-preset-btn${activePreset === p.months ? " is-active" : ""}`}
                key={p.months}
                onClick={() => applyPreset(p.months)}
                type="button"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="donation-date-inputs">
            <label className="donation-date-label">
              From
              <input
                className="donation-date-input"
                max={endDate}
                onChange={(e) => handleStartDate(e.target.value)}
                type="date"
                value={startDate}
              />
            </label>
            <label className="donation-date-label">
              To
              <input
                className="donation-date-input"
                min={startDate}
                onChange={(e) => handleEndDate(e.target.value)}
                type="date"
                value={endDate}
              />
            </label>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="donation-analytics-loading">Loading…</div>
      ) : error ? (
        <div className="inline-alert inline-alert-error">{error}</div>
      ) : (
        <>
          <div className="donation-charts-grid">
            <div className="donation-chart-panel">
              <span className="donation-chart-title">Total Donations per Month</span>
              <SvgLineChart
                color="#58e9ff"
                data={totalChart}
                empty={isEmpty}
                id="total"
              />
            </div>
            <div className="donation-chart-panel">
              <span className="donation-chart-title">Average Donation per Month</span>
              <SvgLineChart
                color="#8f66ff"
                data={avgChart}
                empty={isEmpty}
                id="avg"
              />
            </div>
          </div>

          <div className="donation-stats-row">
            <StatWidget
              label="Average Donation"
              sub="per gift over period"
              value={centsToDisplay(data?.overallAvgCents ?? null)}
            />
            <StatWidget
              label="Avg Donations per Active Donor"
              sub={
                data && data.activeDonorCount > 0
                  ? `across ${data.activeDonorCount} donors`
                  : undefined
              }
              value={
                data?.avgDonationsPerActiveDonor != null
                  ? `${data.avgDonationsPerActiveDonor.toFixed(1)}×`
                  : "—"
              }
            />
          </div>
        </>
      )}
    </section>
  );
}

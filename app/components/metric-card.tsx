import { LANE_META, type LaneKey } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  detail,
  laneKey,
  compact = false
}: {
  label: string;
  value: string;
  detail: string;
  laneKey: LaneKey;
  compact?: boolean;
}) {
  const lane = LANE_META[laneKey];

  return (
    <article
      className={cn("metric-card", compact && "metric-card-compact")}
      style={{ ["--metric-accent" as string]: lane.color }}
    >
      <span className="metric-label">{label}</span>
      <h3 className={cn("metric-value", compact && "metric-value-compact")} style={{ color: lane.color }}>
        {value}
      </h3>
      <p className="muted">{detail}</p>
    </article>
  );
}

import { TIERS, TIER_COLORS, TIER_LABELS, type Tier } from "@/lib/api";

export function TierBar({ tiers, height = 8 }: { tiers: Record<Tier, number>; height?: number }) {
  return (
    <div
      className="flex w-full overflow-hidden rounded"
      style={{ height }}
      title={TIERS.map((t) => `${TIER_LABELS[t]}: ${Math.round(tiers[t] * 100)}%`).join(" · ")}
    >
      {TIERS.map((t) => (
        <span
          key={t}
          style={{ width: `${tiers[t] * 100}%`, background: TIER_COLORS[t] }}
        />
      ))}
    </div>
  );
}

export function TierLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--muted)" }}>
      {TIERS.map((t) => (
        <span key={t} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: TIER_COLORS[t] }}
          />
          {TIER_LABELS[t]}
        </span>
      ))}
      <span style={{ color: "var(--faint)" }}>
        Each bar is the model&apos;s chance the player&apos;s first 4 NBA seasons land in that tier.
      </span>
    </div>
  );
}

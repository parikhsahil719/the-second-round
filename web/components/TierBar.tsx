import Link from "next/link";
import { TIERS, TIER_COLORS, TIER_LABELS, type Tier } from "@/lib/api";
import Term from "./Term";

export function TierBar({
  tiers,
  height = 8,
  reveal = "scroll",
  variant = "solid",
}: {
  tiers: Record<Tier, number>;
  height?: number;
  // "scroll" draws the bar as it scrolls into view; "load" draws it on mount
  // (for bars that sit above the fold); "none" renders it static.
  reveal?: "scroll" | "load" | "none";
  // "market" = the market's prior, not a model opinion: same segments, muted,
  // dashed outline. One grammar per signal — dashed always means market.
  variant?: "solid" | "market";
}) {
  const revealClass =
    reveal === "scroll" ? " tier-wipe" : reveal === "load" ? " tier-wipe-load" : "";
  const marketStyle =
    variant === "market"
      ? { opacity: 0.72, outline: "1px dashed var(--faint)", outlineOffset: 1 }
      : undefined;
  return (
    <div
      className={`flex w-full overflow-hidden rounded${revealClass}`}
      style={{ height, ...marketStyle }}
      title={TIERS.map((t) => `${TIER_LABELS[t]}: ${Math.round(tiers[t] * 100)}%`).join(" · ")}
    >
      {TIERS.map((t) => (
        <span
          key={t}
          style={{ width: `${tiers[t] * 100}%`, background: TIER_COLORS[t], boxShadow: "inset -1px 0 0 var(--bg)" }}
        />
      ))}
    </div>
  );
}

export function TierLegend() {
  return (
    <div className="text-sm" style={{ color: "var(--muted)" }}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {TIERS.map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: TIER_COLORS[t], boxShadow: "0 0 0 1px var(--border)" }}
            />
            <Term id={t.toLowerCase()}>{TIER_LABELS[t]}</Term>
          </span>
        ))}
      </div>
      <p className="mt-1.5" style={{ color: "var(--muted)" }}>
        Each bar is the model&apos;s chance the player&apos;s first 4 NBA seasons land in that
        tier. <Link href="/glossary" className="link">Full glossary →</Link>
      </p>
    </div>
  );
}

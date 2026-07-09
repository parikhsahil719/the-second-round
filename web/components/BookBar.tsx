"use client";

import { TIER_LABELS, TIERS, type Tier } from "@/lib/api";
import { canUseNotes, useLens } from "@/lib/lens";
import { useScoutBook } from "@/lib/useScoutBook";
import { TierBar } from "./TierBar";

/** One distribution bar, always: the scout's posterior overtakes the given
 * distribution (model or market prior) when they have saved notes on the player.
 * The violet marker line carries the note count, your EV, and your rank. */
export default function BookBar({
  slug,
  tiers,
  height = 14,
  variant = "solid",
  showGrid = false,
}: {
  slug: string;
  tiers: Record<Tier, number>;
  height?: number;
  variant?: "solid" | "market";
  showGrid?: boolean;
}) {
  const lensState = useLens();
  const book = useScoutBook(canUseNotes(lensState));
  const entry = book.get(slug);
  const shown = entry ? entry.posterior : tiers;
  return (
    <div>
      <TierBar
        tiers={shown}
        height={height}
        reveal="load"
        variant={entry ? "solid" : variant}
      />
      {entry && (
        <p className="mt-1.5 text-xs" style={{ color: "var(--purple)" }}>
          ✎ Your view ({entry.noteCount} note{entry.noteCount === 1 ? "" : "s"}) ·{" "}
          <span className="num">EV {entry.view.ev_user.toFixed(1)}</span> · rank{" "}
          <span className="num">#{entry.view.your_rank}</span>
        </p>
      )}
      {showGrid && (
        <div className="num mt-2 grid grid-cols-3 gap-1 text-xs sm:grid-cols-6" style={{ color: "var(--muted)" }}>
          {TIERS.map((t) => (
            <span key={t}>
              {TIER_LABELS[t]}: {Math.round((shown[t] ?? 0) * 100)}%
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

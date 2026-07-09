"use client";

import { canUseNotes, useLens } from "@/lib/lens";
import { useScoutBook } from "@/lib/useScoutBook";
import { type Tier } from "@/lib/api";
import { TierBar, TierLegend } from "./TierBar";

const logit = (p: number) => {
  const c = Math.min(Math.max(p, 0.001), 0.999);
  return Math.log(c / (1 - c));
};
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const starOf = (d: Record<Tier, number>) => (d.ALL_STAR ?? 0) + (d.ELITE ?? 0);

/** One distribution row, always one bar: the scout's posterior overtakes the given
 * distribution (model or market prior) when they have saved notes on the player.
 * With `star`, the best-guess block renders beside the bar — the scout's star
 * chance when noted, with the model's interval tilted by the same evidence shift. */
export default function BookBar({
  slug,
  tiers,
  height = 14,
  variant = "solid",
  star,
  showLegend = false,
}: {
  slug: string;
  tiers: Record<Tier, number>;
  height?: number;
  variant?: "solid" | "market";
  star?: { p: number; lo: number; hi: number };
  showLegend?: boolean;
}) {
  const lensState = useLens();
  const book = useScoutBook(canUseNotes(lensState));
  const entry = book.get(slug);
  const shown = entry ? entry.posterior : tiers;

  // your star chance, with the model's interval endpoints shifted by the same
  // logit displacement your notes applied to the point estimate — the model's
  // uncertainty, tilted by your evidence, never a fabricated new interval
  let starShown = star;
  if (entry && star) {
    const d = logit(starOf(entry.posterior)) - logit(starOf(tiers));
    starShown = {
      p: starOf(entry.posterior),
      lo: sigmoid(logit(star.lo) + d),
      hi: sigmoid(logit(star.hi) + d),
    };
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="min-w-56 flex-1">
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
        </div>
        {starShown && (
          <div className="text-right">
            <p className="leading-tight">
              <span className="num text-2xl" style={{ color: "var(--purple)" }}>
                {Math.round(starShown.p * 100)}%
              </span>{" "}
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {entry ? "your best guess" : "best guess"}
              </span>
            </p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--faint)" }}>
              range {Math.round(starShown.lo * 100)}% to {Math.round(starShown.hi * 100)}%
              (wider = less sure)
            </p>
          </div>
        )}
      </div>
      {showLegend && (
        <div className="mt-3">
          <TierLegend tiers={shown} />
        </div>
      )}
    </div>
  );
}

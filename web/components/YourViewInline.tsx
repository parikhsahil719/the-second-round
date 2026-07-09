"use client";

import { TierBar } from "./TierBar";
import { canUseNotes, useLens } from "@/lib/lens";
import { useScoutBook } from "@/lib/useScoutBook";

/** The scout's posterior beside the page's primary card (model or market prior).
 * Renders nothing unless the signed-in user has saved notes on this player. */
export default function YourViewInline({ slug }: { slug: string }) {
  const lensState = useLens();
  const book = useScoutBook(canUseNotes(lensState));
  const entry = book.get(slug);
  if (!entry) return null;
  const star = (entry.posterior.ALL_STAR ?? 0) + (entry.posterior.ELITE ?? 0);
  return (
    <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border)" }}>
      <p className="mb-1 text-xs" style={{ color: "var(--purple)" }}>
        ✎ Your view ({entry.noteCount} note{entry.noteCount === 1 ? "" : "s"}) · star
        chance {Math.round(star * 100)}% · <span className="num">EV {entry.view.ev_user.toFixed(1)}</span>
        {" "}· rank <span className="num">#{entry.view.your_rank}</span>
      </p>
      <TierBar tiers={entry.posterior} height={9} reveal="load" />
    </div>
  );
}

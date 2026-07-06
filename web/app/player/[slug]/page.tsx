import Link from "next/link";
import { notFound } from "next/navigation";
import NotesPanel from "@/components/NotesPanel";
import { TierBar, TierLegend } from "@/components/TierBar";
import { getPlayer, TIERS, TIER_LABELS } from "@/lib/api";

export default async function PlayerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPlayer(slug);
  if (!p) notFound();

  const posLabel = p.pos === "G" ? "Guard" : p.pos === "W" ? "Wing" : p.pos === "B" ? "Big" : null;

  return (
    <>
      <Link href="/" className="text-xs" style={{ color: "var(--muted)" }}>
        ← Back to the board
      </Link>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="serif text-3xl">{p.player_name}</h1>
        <span className="text-sm" style={{ color: "var(--muted)" }}>
          {p.pick != null ? `Pick ${p.pick}` : "Undrafted"}
          {p.consensus_rank != null ? ` · consensus #${p.consensus_rank}` : ""}
          {p.college ? ` · ${p.college}` : ""}
          {posLabel ? ` · ${posLabel}` : ""}
          {p.age != null ? ` · ${p.age} on draft night` : ""}
        </span>
      </div>

      {p.coverage !== "model" ? (
        <div className="card mt-6 px-5 py-6 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          {p.coverage === "outside_coverage"
            ? "This player didn't play a Division 1 college season, so the fair-value model doesn't score him — international and alternative-pathway prospects are outside v1 coverage. His market prices still count in the slot base rates."
            : "This player's college sample is below the reliability floor (40% of team minutes), so the model declines to score him rather than fake confidence. Market prices only."}
        </div>
      ) : (
        <>
          <section className="card mt-6 px-5 py-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">Fair-value distribution</h2>
              <span className="num text-sm" style={{ color: "var(--purple)" }}>
                P(star) {Math.round(p.p_star! * 100)}%{" "}
                <span style={{ color: "var(--faint)" }}>
                  [{Math.round(p.p_star_lo! * 100)}–{Math.round(p.p_star_hi! * 100)}% bootstrap]
                </span>
              </span>
            </div>
            <div className="mt-3">
              <TierBar tiers={p.tiers!} height={14} />
            </div>
            <div className="num mt-2 grid grid-cols-3 gap-1 text-xs sm:grid-cols-6" style={{ color: "var(--muted)" }}>
              {TIERS.map((t) => (
                <span key={t}>
                  {TIER_LABELS[t]}: {Math.round((p.tiers![t] ?? 0) * 100)}%
                </span>
              ))}
            </div>
            <div className="mt-3">
              <TierLegend />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4 text-center" style={{ borderColor: "var(--border)" }}>
              <div>
                <p className="num text-lg">{p.ev_model?.toFixed(1)}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>model EV</p>
              </div>
              <div>
                <p className="num text-lg">{p.ev_slot?.toFixed(1)}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  slot-implied EV{p.pick != null ? ` (pick ${p.pick})` : " (undrafted)"}
                </p>
              </div>
              <div>
                <p className="num text-lg">{p.ev_consensus != null ? p.ev_consensus.toFixed(1) : "—"}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>consensus-implied EV</p>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="card px-5 py-5">
              <h2 className="text-sm font-semibold">Why the model prices him here</h2>
              <ul className="mt-3 space-y-2.5">
                {(p.why ?? []).map((w) => (
                  <li key={w.feature} className="text-sm leading-snug">
                    <span style={{ color: w.contribution > 0 ? "var(--pos)" : "var(--neg)" }}>
                      {w.contribution > 0 ? "▲" : "▼"}
                    </span>{" "}
                    {w.text}
                    <span className="num ml-1 text-xs" style={{ color: "var(--faint)" }}>
                      ({w.feature} {w.contribution > 0 ? "+" : ""}
                      {w.contribution.toFixed(2)})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card px-5 py-5">
              <h2 className="text-sm font-semibold">Closest historical profiles</h2>
              <p className="mt-1 text-xs" style={{ color: "var(--faint)" }}>
                Same position group, matched on career-predictive stats
              </p>
              <ul className="mt-3 space-y-2.5">
                {(p.comps ?? []).map((c) => (
                  <li key={c.name} className="flex items-baseline justify-between text-sm">
                    <span className="serif">{c.name}</span>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      {TIER_LABELS[c.tier] ?? c.tier}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <NotesPanel slug={p.slug} playerName={p.player_name} seedNotes={p.seed_notes} tiers={p.tiers!} />
        </>
      )}
    </>
  );
}

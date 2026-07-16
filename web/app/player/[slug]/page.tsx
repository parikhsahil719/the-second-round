import Link from "next/link";
import { notFound } from "next/navigation";
import Headshot from "@/components/Headshot";
import BookBar from "@/components/BookBar";
import NotesPanel from "@/components/NotesPanel";
import Term from "@/components/Term";
import YourComps from "@/components/YourComps";
import { getPlayer, seasonLabel, shortDate, TIER_LABELS, type SlBlock } from "@/lib/api";
import TeamBadge from "@/components/TeamBadge";

// The Summer League stat line. The evidence itself is already folded into the
// distribution and EV above (the API bakes the posterior in); this card is the
// receipt: what he actually did in July, and what the model said before it.
function SlCard({
  sl,
  draftCall,
}: {
  sl: SlBlock;
  draftCall?: { rank: number; ev: number; rankNow: number; evNow: number };
}) {
  return (
    <section className="card mt-6 px-5 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="serif text-xl" style={{ color: "var(--purple-bright)" }}>Summer League</h2>
        <p className="text-xs" style={{ color: "var(--faint)" }}>as of {shortDate(sl.as_of)}</p>
      </div>
      <p className="num mt-2 text-sm" style={{ color: "var(--muted)" }}>
        {sl.box.gp} GP · {sl.box.mpg.toFixed(1)} MPG · {sl.box.pts.toFixed(1)} PTS ·{" "}
        {sl.box.reb.toFixed(1)} REB · {sl.box.ast.toFixed(1)} AST · {Math.round(sl.box.ts * 100)} TS%
      </p>
      {draftCall && (
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          <Term id="draft_day_call">Draft-day call</Term>:{" "}
          <span className="num">rank #{draftCall.rank} · EV {draftCall.ev.toFixed(1)}</span>
          {" → "}after July:{" "}
          <span
            className="num"
            style={{
              color:
                draftCall.rankNow < draftCall.rank
                  ? "var(--pos)"
                  : draftCall.rankNow > draftCall.rank
                    ? "var(--neg)"
                    : "var(--muted)",
            }}
          >
            rank #{draftCall.rankNow} · EV {draftCall.evNow.toFixed(1)}
          </span>
        </p>
      )}
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--faint)" }}>
        Already folded into the numbers above as{" "}
        <Term id="sl_updated">saturating evidence</Term>: the hotter the July, the less
        each extra game adds, so a summer informs the call but never decides it.
      </p>
    </section>
  );
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { slug } = await params;
  const { from } = await searchParams;
  const p = await getPlayer(slug);
  if (!p) notFound();

  const back = from === "war-room"
    ? { href: "/war-room", label: "← Back to the war room" }
    : { href: "/#board", label: "← Back to the board" };
  const posLabel = p.pos === "G" ? "Guard" : p.pos === "W" ? "Wing" : p.pos === "B" ? "Big" : null;

  return (
    <>
      <Link href={back.href} className="link text-xs">
        {back.label}
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Headshot url={p.headshot_url} name={p.player_name} size={84} />
          <h1 className="serif text-4xl">{p.player_name}</h1>
        </div>
        <span className="max-w-sm text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          {p.pick != null ? `Pick ${p.pick}` : "Undrafted"}
          {p.team ? (
            <>
              {" · "}
              <TeamBadge code={p.team} showName logoSize={16} className="align-middle" />
            </>
          ) : null}
          {p.drafted_by && (
            <span style={{ color: "var(--faint)" }}>
              {" "}
              (drafted by <TeamBadge code={p.drafted_by} logoSize={12} className="align-middle" />)
            </span>
          )}
          {p.model_rank != null && (
            <>
              {" · "}
              <Term id="model_rank">model&apos;s rank</Term> #{p.model_rank}
            </>
          )}
          {p.sl && p.draft_rank != null && (
            <>
              {" · "}
              <Term id="draft_day_call">draft day</Term> #{p.draft_rank}
            </>
          )}
          {p.consensus_rank != null && (
            <>
              {" · "}
              <Term id="consensus_rank">consensus</Term> #{p.consensus_rank}
            </>
          )}
          {p.college ? ` · ${p.college}` : ""}
          {posLabel ? ` · ${posLabel}` : ""}
          {p.age != null ? ` · ${p.age} on draft night` : ""}
        </span>
      </div>

      {p.coverage !== "model" ? (
        <>
          <div className="card mt-6 px-5 py-6 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            {p.coverage === "outside_coverage"
              ? "This player didn't play a Division 1 college season, so the fair-value model doesn't score him. International and alternative-pathway prospects are outside coverage for now."
              : "This player's college sample is below the reliability floor (40% of team minutes) with no earlier qualifying season, so the model declines to score him rather than fake confidence."}
          </div>
          {p.market_tiers && (
            <section className="card mt-6 px-5 py-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="serif text-xl" style={{ color: "var(--purple-bright)" }}>
                  The market&apos;s price
                </h2>
                <div className="text-right">
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    <Term id="market_prior">Market EV</Term>
                    {p.sl ? ` · SL-updated ${shortDate(p.sl.as_of)}` : ""}
                  </p>
                  <p className="num text-2xl leading-tight">
                    {(p.sl ? p.sl.ev : p.ev_market)?.toFixed(1)}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <BookBar
                  slug={p.slug}
                  tiers={p.sl ? p.sl.tiers : p.market_tiers}
                  height={14}
                  variant="market"
                />
              </div>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                This is{" "}
                {p.market_basis === "slot" && p.pick != null
                  ? `what pick ${p.pick} has historically become`
                  : p.market_basis === "consensus"
                    ? `what consensus rank #${p.consensus_rank} has historically become`
                    : "what undrafted prospects have historically become"}
                {p.sl ? ", updated with his Summer League play as capped evidence" : ""}
                . It is the market&apos;s expectation, not a model opinion; the model has no
                D1 data to form one. Your notes below update this prior with what you saw.
              </p>
            </section>
          )}
          {p.sl && <SlCard sl={p.sl} />}
          {p.market_tiers && (
            <NotesPanel
              slug={p.slug}
              playerName={p.player_name}
              seedNotes={p.seed_notes ?? []}
              tiers={p.market_tiers}
              priorLabel="Market prior"
            />
          )}
        </>
      ) : (
        <>
          <section className="card mt-6 px-5 py-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="serif text-xl" style={{ color: "var(--purple-bright)" }}>Fair-value distribution</h2>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {p.sl ? `SL-updated · as of ${shortDate(p.sl.as_of)} · ` : ""}
                Chance of reaching All-Star level or better
              </p>
            </div>
            <div className="mt-3">
              <BookBar
                slug={p.slug}
                tiers={p.tiers!}
                height={14}
                showLegend
                star={{ p: p.p_star!, lo: p.p_star_lo!, hi: p.p_star_hi! }}
              />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4 text-center" style={{ borderColor: "var(--border)" }}>
              <div>
                <p className="num text-lg">{p.ev_model?.toFixed(1)}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  <Term id="model_value">model EV</Term>
                </p>
              </div>
              <div>
                <p className="num text-lg">{p.ev_slot?.toFixed(1)}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  <Term id="slot_price">slot-implied EV</Term>
                  {p.pick != null ? ` (pick ${p.pick})` : " (undrafted)"}
                </p>
              </div>
              <div>
                <p className="num text-lg">{p.ev_consensus != null ? p.ev_consensus.toFixed(1) : "—"}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  <Term id="consensus_ev">consensus-implied EV</Term>
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              The model&apos;s number is his fair price; the other two are what his draft slot
              and consensus rank usually buy. Hover any underlined term for its meaning.
            </p>
            {p.sample_blend != null && (
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--faint)" }}>
                His final college season was too small to grade on its own, so the model
                scores a <Term id="sample_blend">minutes-weighted blend</Term> anchored on
                his {seasonLabel(p.sample_blend)} season. The model cannot see the injury
                or absence itself; read the range accordingly.
              </p>
            )}
          </section>

          {p.sl && (
            <SlCard
              sl={p.sl}
              draftCall={
                p.draft_rank != null && p.draft_ev != null &&
                p.model_rank != null && p.ev_model != null
                  ? { rank: p.draft_rank, ev: p.draft_ev, rankNow: p.model_rank, evNow: p.ev_model }
                  : undefined
              }
            />
          )}

          <section className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="card px-5 py-5">
              <h2 className="serif text-xl" style={{ color: "var(--purple-bright)" }}>Why the model prices him here</h2>
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
              <h2 className="serif text-xl" style={{ color: "var(--purple-bright)" }}>
                <Term id="comps">Closest historical profiles</Term>
              </h2>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                The closest college profiles at his position, showing the range this profile has
                produced, floor to ceiling. A <span style={{ color: "var(--gold)" }}>★</span> is an{" "}
                <Term id="allstar_mark">All-Star selection</Term>; the role word
                (<Term id="archetype_engine">Engine</Term>,{" "}
                <Term id="archetype_connector">Connector</Term>,{" "}
                <Term id="archetype_costar">Co-star</Term>) says how he produced it;{" "}
                <Term id="late_bloom">&quot;later&quot;</Term> flags a career that kept climbing.
              </p>
              <ul className="mt-3 space-y-2.5">
                {(p.comps ?? []).map((c) => (
                  <li key={c.name} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="serif">{c.name}</span>
                    <span className="text-right text-xs" style={{ color: "var(--muted)" }}>
                      {TIER_LABELS[c.tier] ?? c.tier}
                      {c.all_star && (
                        <span
                          title="Selected to a real All-Star team in his first four seasons"
                          style={{ color: "var(--gold)" }}
                        >
                          {" "}★
                        </span>
                      )}
                      {c.archetype && <span> · {c.archetype}</span>}
                      {c.late_bloom && (
                        <span style={{ color: "var(--pos)" }}>
                          , later {TIER_LABELS[c.late_bloom] ?? c.late_bloom}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <YourComps slug={p.slug} exclude={(p.comps ?? []).map((c) => c.name)} />
            </div>
          </section>

          <NotesPanel slug={p.slug} playerName={p.player_name} seedNotes={p.seed_notes} tiers={p.tiers!} />
        </>
      )}
    </>
  );
}

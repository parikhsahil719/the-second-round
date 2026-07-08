"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Headshot from "@/components/Headshot";
import Term from "@/components/Term";
import { API } from "@/lib/api";
import { canUseOffice, useLens } from "@/lib/lens";

interface WarRoomRow {
  player_name: string;
  slug: string | null;
  headshot_url: string | null;
  consensus_rank: number;
  actual_pick: number | null;
  availability: number;
  ev_model: number | null;
  p_star: number | null;
  surplus: number | null;
  chip: "STEAL" | "FAIR" | "REACH" | "N/A";
}

export default function WarRoom() {
  const lensState = useLens();
  const { lens } = lensState;
  const officeAllowed = canUseOffice(lensState);
  const [pick, setPick] = useState(1);
  const [rows, setRows] = useState<WarRoomRow[] | null>(null);
  const [pickPrice, setPickPrice] = useState<number | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    fetch(`${API}/warroom/${pick}`)
      .then((r) => r.json())
      .then((d) => {
        if (live) {
          setRows(d.players);
          setPickPrice(d.pick_price ?? null);
          setNote(d.note);
        }
      })
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [pick]);

  if (!officeAllowed) {
    return (
      <>
        <h1 className="serif text-3xl">The war room</h1>
        <div className="locked-note mt-6 px-6 py-10 text-center">
          <span className="locked-tag">FRONT OFFICE ONLY</span>
          <p className="serif mt-3 text-lg" style={{ color: "var(--text)" }}>
            This is a front office tool
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed">
            Pick planning, availability odds from 10,000 simulated drafts, and the edge
            numbers live here. Your current role doesn&apos;t include it.
          </p>
          <Link href="/account" className="btn mt-5 inline-block text-sm">
            Switch role in account settings
          </Link>
        </div>
        <div className="mt-4 flex flex-col gap-2" aria-hidden="true" style={{ opacity: 0.35, pointerEvents: "none", filter: "blur(2px)" }}>
          {(rows ?? []).slice(0, 4).map((r) => (
            <div key={r.player_name} className="card flex items-center gap-3 px-3.5 py-2.5">
              <Headshot url={r.headshot_url} name={r.player_name} size={36} />
              <span className="serif text-sm">{r.player_name}</span>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="serif text-3xl">The war room</h1>
      <p className="mt-2 max-w-prose text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
        {lens === "fan" ? (
          <>
            Every team picks in order on draft night; being{" "}
            <Term id="on_the_clock">on the clock</Term> means it&apos;s your turn. Slide to a pick,
            1 through 60, and see which players were realistically still available that late, and
            which ones the model liked best.
          </>
        ) : (
          <>
            You hold a pick. We simulated the draft 10,000 times, calibrated on how far players
            actually slid from consensus in 2026. Here is who is likely to be there when
            you&apos;re <Term id="on_the_clock">on the clock</Term>.
          </>
        )}
      </p>

      <div className="card mt-6 flex flex-wrap items-center gap-4 px-5 py-4">
        <label className="text-sm" htmlFor="pick-slider" style={{ color: "var(--muted)" }}>
          Your pick
        </label>
        <input
          id="pick-slider"
          type="range"
          min={1}
          max={60}
          step={1}
          value={pick}
          onChange={(e) => setPick(Number(e.target.value))}
          className="flex-1 min-w-40"
        />
        <span className="num serif text-3xl" style={{ color: "var(--gold)" }}>
          {pick}
        </span>
      </div>
      {pickPrice != null && (
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          This pick&apos;s <Term id="pick_price">price</Term> is about {pickPrice.toFixed(1)}{" "}
          career-value points. A <Term id="steal">STEAL</Term> is worth more than that; a{" "}
          <Term id="reach">REACH</Term> less.
          {lens !== "fan" && (
            <>
              {" "}
              The number on each row is that gap, his <Term id="surplus">surplus</Term>.
            </>
          )}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {rows === null ? (
          <p className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
            Simulating…
          </p>
        ) : (
          rows.slice(0, 20).map((r) => (
            <Link
              key={r.player_name}
              href={r.slug ? `/player/${r.slug}?from=war-room` : "#"}
              className="card card-link flex items-center gap-3 px-3.5 py-2.5"
            >
              <Headshot url={r.headshot_url} name={r.player_name} size={36} />
              <div className="min-w-0 flex-1">
                <span className="serif text-sm">{r.player_name}</span>
                <span className="ml-2 text-xs" style={{ color: "var(--faint)" }}>
                  consensus #{r.consensus_rank}
                  {r.actual_pick ? ` · went #${r.actual_pick}` : " · went undrafted"}
                </span>
              </div>
              <div className="flex w-40 items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--panel)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${r.availability * 100}%`,
                      background: r.availability > 0.6 ? "var(--pos)" : r.availability > 0.25 ? "var(--gold)" : "var(--neg)",
                    }}
                  />
                </div>
                <span className="num w-10 text-right text-xs" style={{ color: "var(--muted)" }}>
                  {Math.round(r.availability * 100)}%
                </span>
              </div>
              {lens !== "fan" && r.surplus != null && (
                <span
                  className="num w-14 text-right text-xs"
                  title="Model valuation minus this pick's price"
                  style={{ color: r.surplus > 0 ? "var(--pos)" : "var(--neg)" }}
                >
                  {r.surplus > 0 ? "+" : ""}
                  {r.surplus.toFixed(1)}
                </span>
              )}
              <span className={`chip ${r.chip === "STEAL" ? "chip-buy" : r.chip === "REACH" ? "chip-fade" : r.chip === "FAIR" ? "chip-hold" : "chip-na"}`}>
                {r.chip}
              </span>
            </Link>
          ))
        )}
      </div>
      <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
        {note} Sorted by the model&apos;s valuation, so the top of this list is the best
        realistically available. <Term id="availability">Availability %</Term> is the share of
        simulations where the player is still on the board when your pick arrives; each row also
        shows his <Term id="consensus_rank">consensus rank</Term> and where he actually went.
        Labels and numbers update with your pick.
      </p>
    </>
  );
}

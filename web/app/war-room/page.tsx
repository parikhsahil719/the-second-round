"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Headshot from "@/components/Headshot";
import { API } from "@/lib/api";
import { chipLabel, useLens } from "@/lib/lens";

interface WarRoomRow {
  player_name: string;
  slug: string | null;
  headshot_url: string | null;
  consensus_rank: number;
  actual_pick: number | null;
  availability: number;
  ev_model: number | null;
  p_star: number | null;
  chip: string;
}

export default function WarRoom() {
  const { lens } = useLens();
  const [pick, setPick] = useState(9);
  const [rows, setRows] = useState<WarRoomRow[] | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    fetch(`${API}/warroom/${pick}`)
      .then((r) => r.json())
      .then((d) => {
        if (live) {
          setRows(d.players);
          setNote(d.note);
        }
      })
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [pick]);

  return (
    <>
      <h1 className="serif text-3xl">The war room</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
        {lens === "fan"
          ? "Pretend your team is on the clock. Slide to your pick and see who was realistically still on the board, and who the numbers loved."
          : "You hold a pick. We simulated the draft 10,000 times, calibrated on how far players actually slid from consensus in 2026. Here is who is likely to be there when you're on the clock."}
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

      <div className="mt-4 flex flex-col gap-2">
        {rows === null ? (
          <p className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
            Simulating…
          </p>
        ) : (
          rows.slice(0, 20).map((r) => (
            <Link
              key={r.player_name}
              href={r.slug ? `/player/${r.slug}` : "#"}
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
              {lens !== "fan" && r.ev_model != null && (
                <span className="num w-12 text-right text-xs" style={{ color: "var(--muted)" }}>
                  EV {r.ev_model.toFixed(1)}
                </span>
              )}
              <span className={`chip ${r.chip === "BUY" ? "chip-buy" : r.chip === "FADE" ? "chip-fade" : r.chip === "HOLD" ? "chip-hold" : "chip-na"}`}>
                {chipLabel(r.chip, lens)}
              </span>
            </Link>
          ))
        )}
      </div>
      <p className="mt-4 text-xs leading-relaxed" style={{ color: "var(--faint)" }}>
        {note} Sorted by model EV, so the top of this list is the best realistically
        available. Availability % is the share of simulations where the player is still
        on the board.
      </p>
    </>
  );
}

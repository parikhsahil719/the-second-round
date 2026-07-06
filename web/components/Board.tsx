"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { type BoardRow } from "@/lib/api";
import { chipLabel, useLens, type Lens } from "@/lib/lens";
import Headshot from "./Headshot";
import { TierBar, TierLegend } from "./TierBar";

function Chip({ chip, lens }: { chip?: string; lens: Lens }) {
  const cls =
    chip === "BUY" ? "chip-buy" : chip === "FADE" ? "chip-fade" : chip === "HOLD" ? "chip-hold" : "chip-na";
  return <span className={`chip ${cls}`}>{chipLabel(chip, lens)}</span>;
}

function PickSquare({ row }: { row: BoardRow }) {
  if (row.pick == null)
    return <div className="pick-square small-label">UDFA</div>;
  return (
    <div className={`pick-square num ${row.pick <= 14 ? "lottery" : ""}`}>{row.pick}</div>
  );
}

export function Row({ row }: { row: BoardRow }) {
  const { lens } = useLens();
  return (
    <Link
      href={`/player/${row.slug}`}
      className="card card-link flex items-center gap-3 px-3.5 py-3"
    >
      <PickSquare row={row} />
      <Headshot url={row.headshot_url} name={row.player_name} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="serif truncate text-[15px]">{row.player_name}</span>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {row.college ?? "—"}
            {row.pos ? ` · ${row.pos === "G" ? "Guard" : row.pos === "W" ? "Wing" : "Big"}` : ""}
          </span>
        </div>
        {row.coverage === "model" && row.tiers ? (
          <div className="mt-1.5 flex items-center gap-3">
            <div className="flex-1">
              <TierBar tiers={row.tiers} height={7} />
            </div>
            <span className="num w-24 text-right text-xs" style={{ color: "var(--muted)" }}>
              STAR {Math.round((row.p_star ?? 0) * 100)}%
              <span style={{ color: "var(--faint)" }}>
                {" "}
                [{Math.round((row.p_star_lo ?? 0) * 100)}–{Math.round((row.p_star_hi ?? 0) * 100)}]
              </span>
            </span>
          </div>
        ) : (
          <p className="mt-1 text-xs" style={{ color: "var(--faint)" }}>
            {row.coverage === "outside_coverage"
              ? "Outside model coverage (no D1 season): market prices only"
              : "Insufficient college sample: market prices only"}
          </p>
        )}
      </div>
      <div className="flex w-24 flex-col items-end gap-1">
        <Chip chip={row.chip} lens={lens} />
        {lens !== "fan" && row.edge_slot != null && (
          <span
            className="num text-sm"
            style={{ color: row.edge_slot > 0 ? "var(--pos)" : "var(--neg)" }}
          >
            {row.edge_slot > 0 ? "+" : ""}
            {row.edge_slot.toFixed(1)}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function Board({ rows }: { rows: BoardRow[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.player_name.toLowerCase().includes(needle) ||
        (r.college ?? "").toLowerCase().includes(needle)
    );
  }, [rows, q]);

  return (
    <section id="board" className="mt-10">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="serif text-lg">The full board</h2>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          edge = model EV − slot EV · BUY &gt; +2 · FADE &lt; −2
        </span>
      </div>
      <input
        type="text"
        placeholder="Search a player or school…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-3"
        aria-label="Search players"
      />
      <div className="mb-4">
        <TierLegend />
      </div>
      <div className="flex flex-col gap-2">
        {filtered.map((r) => (
          <Row key={r.slug} row={r} />
        ))}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
            No players match “{q}”
          </p>
        )}
      </div>
    </section>
  );
}

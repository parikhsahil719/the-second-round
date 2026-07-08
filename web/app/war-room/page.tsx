"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Headshot from "@/components/Headshot";
import Term from "@/components/Term";
import { API } from "@/lib/api";
import { canUseWarRoom, useLens } from "@/lib/lens";

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

type WrSort = "model" | "consensus" | "surplus";
const PER_PAGE = 10;

const SORT_LABELS: Record<WrSort, string> = {
  model: "Best available",
  consensus: "Consensus rank",
  surplus: "Surplus",
};

export default function WarRoom() {
  const lensState = useLens();
  const { lens, signedIn, role } = lensState;
  const allowed = canUseWarRoom(lensState);
  // Surplus/value numbers stay Front-office-only even though scouts can open the room.
  // For visitors that means the Front-office lens; Fan and Scout see availability only.
  const officeView = signedIn ? role === "office" : lens === "office";

  const [pick, setPick] = useState(1);
  const [rows, setRows] = useState<WarRoomRow[] | null>(null);
  const [pickPrice, setPickPrice] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<WrSort>("model");
  const [page, setPage] = useState(0);
  const [pickText, setPickText] = useState("1"); // editable field; may be empty mid-typing

  // Commit a real pick: clamp to 1-60 and sync both the slider value and the text field.
  const commitPick = (n: number) => {
    const c = Math.max(1, Math.min(60, Math.round(n)));
    setPick(c);
    setPickText(String(c));
  };

  useEffect(() => {
    let live = true;
    setPage(0); // new pick, new pool: back to page 1
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

  // "Surplus" sort is an office concept; fall back to best-available otherwise.
  const activeSort: WrSort = sort === "surplus" && !officeView ? "model" : sort;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (rows ?? []).filter(
      (r) => !needle || r.player_name.toLowerCase().includes(needle)
    );
    const sorted = [...list];
    if (activeSort === "consensus") sorted.sort((a, b) => a.consensus_rank - b.consensus_rank);
    else if (activeSort === "surplus")
      sorted.sort((a, b) => (b.surplus ?? -Infinity) - (a.surplus ?? -Infinity));
    else sorted.sort((a, b) => (b.ev_model ?? -Infinity) - (a.ev_model ?? -Infinity));
    return sorted;
  }, [rows, q, activeSort]);

  useEffect(() => setPage(0), [q, activeSort]); // new search/sort: back to page 1
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pageCount - 1);
  const visible = filtered.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);
  const sortKeys: WrSort[] = officeView
    ? ["model", "consensus", "surplus"]
    : ["model", "consensus"];

  if (!allowed) {
    return (
      <>
        <h1 className="serif text-4xl">The war room</h1>
        <div className="locked-note mt-6 px-6 py-10 text-center">
          <span className="locked-tag">SCOUT + FRONT OFFICE</span>
          <p className="serif mt-3 text-lg" style={{ color: "var(--text)" }}>
            A tool for scouts and front offices
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed">
            Pick planning and availability odds from 10,000 simulated drafts live here. Switch
            your role to Scout or Front office to use it.
          </p>
          <Link href="/account" className="btn mt-5 inline-block text-sm">
            Switch role in account settings
          </Link>
        </div>
        <div
          className="mt-4 flex flex-col gap-2"
          aria-hidden="true"
          style={{ opacity: 0.35, pointerEvents: "none", filter: "blur(2px)" }}
        >
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
      <h1 className="serif text-4xl">The war room</h1>
      <p className="mt-2 max-w-prose text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
        {!officeView ? (
          <>
            Every team picks in order on draft night; being{" "}
            <Term id="on_the_clock">on the clock</Term>{" "}means it&apos;s your turn. Slide or type
            any pick, 1 through 60, and see which players were realistically still available that
            late, and which ones the model liked best.
          </>
        ) : (
          <>
            You hold a pick. We simulated the draft 10,000 times, calibrated on how far players
            actually slid from consensus in 2026. Here is who is likely to be there when
            you&apos;re <Term id="on_the_clock">on the clock</Term>.
          </>
        )}
      </p>

      <div className="card mt-6 flex flex-wrap items-center gap-3 px-5 py-4">
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
          onChange={(e) => commitPick(Number(e.target.value))}
          className="flex-1 min-w-40"
        />
        <input
          type="text"
          inputMode="numeric"
          maxLength={2}
          value={pickText}
          onChange={(e) => {
            // digits only; allow empty so a single digit can be typed after clearing.
            const raw = e.target.value.replace(/[^0-9]/g, "").slice(0, 2);
            if (raw === "") {
              setPickText("");
              return;
            }
            const n = Math.min(60, parseInt(raw, 10)); // clamp the max as you type
            setPickText(String(n));
            if (n >= 1) setPick(n);
          }}
          onBlur={() => {
            const n = parseInt(pickText, 10);
            commitPick(Number.isNaN(n) ? pick : n);
          }}
          aria-label="Type a pick number from 1 to 60"
          className="pick-input num serif"
          style={{
            width: "3.6rem",
            flex: "none",
            textAlign: "center",
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--gold)",
            fontSize: "1.5rem",
            padding: "4px 6px",
          }}
        />
        <span className="num text-sm" style={{ color: "var(--faint)" }}>
          of 60
        </span>
      </div>
      {pickPrice != null && (
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          This pick&apos;s <Term id="pick_price">price</Term> is about {pickPrice.toFixed(1)}{" "}
          career-value points. A <Term id="steal">STEAL</Term> is worth more than that; a{" "}
          <Term id="reach">REACH</Term> less.
          {officeView && (
            <>
              {" "}
              The number on each row is that gap, his <Term id="surplus">surplus</Term>.
            </>
          )}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search a player…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1"
          style={{ width: "auto", minWidth: "11rem" }}
          aria-label="Search prospects"
        />
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
          Sort:
          <select
            value={activeSort}
            onChange={(e) => setSort(e.target.value as WrSort)}
            aria-label="Sort prospects"
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text)",
              padding: "10px 12px",
              cursor: "pointer",
            }}
          >
            {sortKeys.map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
        {note ? `${note} ` : ""}
        Showing who is realistically on the board at pick {pick}.{" "}
        <Term id="availability">Availability</Term>{" "}is his chance of still being there (green
        likely, gold a toss-up, red a long shot); the chip is his value at this pick
        {officeView && (
          <>
            {" "}
            and the green or red number is his <Term id="surplus">surplus</Term>
          </>
        )}
        .
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {rows === null ? (
          <p className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
            Simulating…
          </p>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
            {q ? `No prospect matches “${q}”` : "No prospects available at this pick."}
          </p>
        ) : (
          visible.map((r) => (
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
                <div
                  className="h-1.5 flex-1 overflow-hidden rounded-full"
                  style={{ background: "var(--panel)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${r.availability * 100}%`,
                      background:
                        r.availability > 0.6
                          ? "var(--pos)"
                          : r.availability > 0.25
                            ? "var(--gold)"
                            : "var(--neg)",
                    }}
                  />
                </div>
                <span
                  className="num w-10 text-right text-xs"
                  style={{ color: "var(--muted)" }}
                  title="Chance he is still on the board when your pick arrives"
                >
                  {Math.round(r.availability * 100)}%
                </span>
              </div>
              {officeView && r.surplus != null && (
                <span
                  className="num w-14 text-right text-xs"
                  title="Model value minus this pick's price"
                  style={{ color: r.surplus > 0 ? "var(--pos)" : "var(--neg)" }}
                >
                  {r.surplus > 0 ? "+" : ""}
                  {r.surplus.toFixed(1)}
                </span>
              )}
              <span
                className={`chip ${r.chip === "STEAL" ? "chip-buy" : r.chip === "REACH" ? "chip-fade" : r.chip === "FAIR" ? "chip-hold" : "chip-na"}`}
              >
                {r.chip}
              </span>
            </Link>
          ))
        )}
      </div>

      {rows !== null && pageCount > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-xs">
          <button
            className="btn-ghost"
            style={{ padding: "6px 12px", opacity: current === 0 ? 0.4 : 1 }}
            onClick={() => setPage(current - 1)}
            disabled={current === 0}
          >
            Prev
          </button>
          {Array.from({ length: pageCount }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              aria-label={`Page ${i + 1}`}
              aria-current={i === current ? "page" : undefined}
              className="num rounded-lg"
              style={{
                minWidth: 34,
                padding: "6px 0",
                border: "1px solid var(--border)",
                background: i === current ? "var(--purple)" : "transparent",
                color: i === current ? "#16141b" : "var(--muted)",
                fontWeight: i === current ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {i + 1}
            </button>
          ))}
          <button
            className="btn-ghost"
            style={{ padding: "6px 12px", opacity: current === pageCount - 1 ? 0.4 : 1 }}
            onClick={() => setPage(current + 1)}
            disabled={current === pageCount - 1}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}

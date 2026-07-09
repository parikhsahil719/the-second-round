"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { seasonLabel, type BoardRow } from "@/lib/api";
import { useLens } from "@/lib/lens";
import Headshot from "./Headshot";
import TeamBadge from "./TeamBadge";
import { TierBar, TierLegend } from "./TierBar";
import Term from "./Term";

function Chip({ chip }: { chip?: string }) {
  // Green = the model likes him more than the market did (STEAL for drafted, SLEEPER
  // for undrafted); red = REACH; gray = FAIR / UNDRAFTED / N/A.
  const cls =
    chip === "STEAL" || chip === "SLEEPER"
      ? "chip-buy"
      : chip === "REACH"
        ? "chip-fade"
        : chip === "FAIR"
          ? "chip-hold"
          : "chip-na";
  return <span className={`chip ${cls}`}>{chip ?? "N/A"}</span>;
}

function PickSquare({ row }: { row: BoardRow }) {
  if (row.pick == null)
    return <div className="pick-square small-label">UDFA</div>;
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className={`pick-square num ${row.pick <= 14 ? "lottery" : ""}`}>{row.pick}</div>
      {row.team && (
        <TeamBadge
          code={row.team}
          logoSize={14}
          className="text-[10px] tracking-wide"
          style={{ color: "var(--faint)" }}
        />
      )}
    </div>
  );
}

export function Row({ row }: { row: BoardRow }) {
  const { lens, signedIn, role } = useLens();
  // Value/edge numbers are a Front-office thing. For visitors the Front-office
  // lens shows them; Fan and Scout keep the clean board (Scout's layer is notes).
  const showEv = signedIn ? role === "office" : lens === "office";
  return (
    <Link
      href={`/player/${row.slug}`}
      className="card card-link reveal flex items-center gap-3 px-3.5 py-3"
      style={{ viewTransitionName: `row-${row.slug}` } as React.CSSProperties}
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
              {/* plain text, no Term: this sits inside the row Link and a term
                  popover's glossary link would nest <a> in <a> */}
              {row.sample_blend != null && (
                <p className="mt-1 text-[10px]" style={{ color: "var(--faint)" }}>
                  Blended sample anchored on his {seasonLabel(row.sample_blend)} season
                </p>
              )}
            </div>
            <span
              className="num w-28 whitespace-nowrap text-right text-xs"
              style={{ color: "var(--muted)" }}
              title="His chance of reaching All-Star level or better. The bracket is the model's range: wider means less sure."
            >
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
        <Chip chip={row.chip} />
        {showEv && row.edge_slot != null && (
          <span
            className="num text-sm"
            style={{ color: row.edge_slot > 0 ? "var(--pos)" : "var(--neg)" }}
            title="Value versus this pick's slot price. The chip grades draft rank, this grades value, so the two can point different ways."
          >
            {row.edge_slot > 0 ? "+" : ""}
            {row.edge_slot.toFixed(1)}
          </span>
        )}
      </div>
    </Link>
  );
}

type SortKey = "model" | "drafted" | "consensus" | "edge" | "age";
type ViewKey = "all" | "undrafted" | "steals" | "reaches";

const PER_PAGE = 20;

const SORT_LABELS: Record<SortKey, string> = {
  model: "Model value",
  drafted: "As drafted",
  consensus: "Consensus board",
  age: "Age (youngest)",
  edge: "Value gap",
};

// Reorders (sort/filter/page) glide rows to their new spots via the View
// Transitions API. Browsers without it, and reduced-motion users, update instantly.
function withRowGlide(update: () => void) {
  const vtDoc = document as Document & { startViewTransition?: (cb: () => void) => void };
  if (vtDoc.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    vtDoc.startViewTransition(() => flushSync(update));
  } else {
    update();
  }
}

// Sort helper: ascending when dir=1, descending when dir=-1, missing values always last.
function nullsLast(a: number | null | undefined, b: number | null | undefined, dir: number) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * dir;
}

export default function Board({ rows }: { rows: BoardRow[] }) {
  const { lens, signedIn, role } = useLens();
  const officeView = signedIn ? role === "office" : lens === "office";
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("model");
  const [view, setView] = useState<ViewKey>("all");
  const [page, setPage] = useState(0);

  // "Value gap" is a Front-office concept (the edge number only shows there), so if the
  // lens leaves office while it is selected, fall back to the model order.
  const activeSort: SortKey = sort === "edge" && !officeView ? "model" : sort;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (
        needle &&
        !(
          r.player_name.toLowerCase().includes(needle) ||
          (r.college ?? "").toLowerCase().includes(needle)
        )
      )
        return false;
      if (view === "undrafted") return r.pick == null;
      if (view === "steals") return r.chip === "STEAL";
      if (view === "reaches") return r.chip === "REACH";
      return true;
    });
    if (activeSort === "model") return list; // incoming order is already the model's valuation
    const sorted = [...list];
    if (activeSort === "drafted") sorted.sort((a, b) => nullsLast(a.pick, b.pick, 1));
    else if (activeSort === "consensus") sorted.sort((a, b) => nullsLast(a.consensus_rank, b.consensus_rank, 1));
    else if (activeSort === "edge") sorted.sort((a, b) => nullsLast(a.edge_slot, b.edge_slot, -1));
    else if (activeSort === "age") sorted.sort((a, b) => nullsLast(a.age, b.age, 1));
    return sorted;
  }, [rows, q, activeSort, view]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  // Any change to the result set collapses back to the first page.
  useEffect(() => setPage(0), [q, activeSort, view]);
  const current = Math.min(page, pageCount - 1);
  const visible = filtered.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);

  const sortKeys: SortKey[] = officeView
    ? ["model", "drafted", "consensus", "age", "edge"]
    : ["model", "drafted", "consensus", "age"];
  const views: { id: ViewKey; label: string }[] = [
    { id: "all", label: "All" },
    { id: "undrafted", label: "Undrafted" },
    { id: "steals", label: "Steals" },
    { id: "reaches", label: "Reaches" },
  ];

  return (
    <section id="board" className="mt-10">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="serif text-3xl" style={{ color: "var(--purple-bright)" }}>The full board</h2>
        <span className="text-sm" style={{ color: "var(--muted)" }}>
          {filtered.length} {filtered.length === 1 ? "player" : "players"}
        </span>
      </div>
      <details className="mb-3 mt-1 text-sm" style={{ color: "var(--muted)" }}>
        <summary className="cursor-pointer select-none font-medium" style={{ color: "var(--text)" }}>
          New here? How to read a row
        </summary>
        <p className="mt-1.5 leading-relaxed">
          The colored bar is the model&apos;s odds across six career tiers;{" "}
          <Term id="star_pct">STAR %</Term>{" "}is his chance at All-Star level or better. The chip is
          the model&apos;s call: <Term id="steal">STEAL</Term>, <Term id="fair">FAIR</Term>, or{" "}
          <Term id="reach">REACH</Term>. An undrafted player the model liked is a{" "}
          <Term id="sleeper">SLEEPER</Term> instead. A player{" "}
          <Term id="coverage_outside">outside model coverage</Term> or with an{" "}
          <Term id="coverage_insufficient">insufficient sample</Term>{" "}shows market prices only.
          Hover or tap any underlined word for its meaning.
          {officeView && (
            <>
              {" "}
              The green or red number is his <Term id="value_gap">value gap</Term> versus his{" "}
              <Term id="slot_price">slot price</Term>, which can point a different way from the
              chip, and that is not a bug.
            </>
          )}
        </p>
      </details>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search a player or school…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1"
          style={{ width: "auto", minWidth: "11rem" }}
          aria-label="Search players"
        />
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
          Sort:
          <select
            value={activeSort}
            onChange={(e) => {
              const next = e.target.value as SortKey;
              withRowGlide(() => setSort(next));
            }}
            aria-label="Sort the board"
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
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
          Filter:
          <div
            className="flex overflow-hidden rounded-lg border text-xs"
            style={{ borderColor: "var(--border)" }}
            role="tablist"
            aria-label="Filter the board"
          >
            {views.map((o) => (
              <button
                key={o.id}
                role="tab"
                aria-selected={view === o.id}
                onClick={() => withRowGlide(() => setView(o.id))}
                className="px-3 py-2"
                style={{
                  background: view === o.id ? "var(--purple)" : "transparent",
                  color: view === o.id ? "#16141b" : "var(--muted)",
                  fontWeight: view === o.id ? 600 : 400,
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <TierLegend />
      </div>
      <div className="flex flex-col gap-2">
        {visible.map((r) => (
          <Row key={r.slug} row={r} />
        ))}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
            {view === "steals"
              ? "No steals on the board right now."
              : view === "reaches"
                ? "No reaches on the board right now."
                : view === "undrafted"
                  ? "No undrafted players match."
                  : `No players match “${q}”`}
          </p>
        )}
      </div>
      {pageCount > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-xs">
          <button
            className="btn-ghost"
            style={{ padding: "6px 12px", opacity: current === 0 ? 0.4 : 1 }}
            onClick={() => withRowGlide(() => setPage(current - 1))}
            disabled={current === 0}
          >
            Prev
          </button>
          {Array.from({ length: pageCount }, (_, i) => (
            <button
              key={i}
              onClick={() => withRowGlide(() => setPage(i))}
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
            onClick={() => withRowGlide(() => setPage(current + 1))}
            disabled={current === pageCount - 1}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}

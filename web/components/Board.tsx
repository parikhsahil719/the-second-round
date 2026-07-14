"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { seasonLabel, shortDate, type BoardRow, type BookEntry } from "@/lib/api";
import { canUseNotes, useLens } from "@/lib/lens";
import { useScoutBook } from "@/lib/useScoutBook";
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

export function Row({ row, book, slMode }: { row: BoardRow; book?: BookEntry; slMode?: boolean }) {
  const { lens, signedIn, role } = useLens();
  // The SL-updated view swaps in the posterior; a noted row keeps the scout's
  // own posterior (which already stacks on SL evidence server-side).
  const sl = slMode ? row.sl : undefined;
  // Value/edge numbers are a Front-office thing. For visitors the Front-office
  // lens shows them; Fan and Scout keep the clean board (Scout's layer is notes).
  const showEv = signedIn ? role === "office" : lens === "office";
  // A noted row shows the scout's read: their posterior bar, EV, and chip.
  // Un-noted rows are untouched (posterior = prior by construction).
  const yourStar = book ? (book.posterior.ALL_STAR ?? 0) + (book.posterior.ELITE ?? 0) : null;
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
        {book ? (
          <div className="mt-1.5 flex items-center gap-3">
            <div className="flex-1">
              <TierBar tiers={book.posterior} height={7} />
              <p className="mt-1 text-[10px]" style={{ color: "var(--purple)" }}>
                ✎ Your view · {book.noteCount} note{book.noteCount === 1 ? "" : "s"}
                {book.tilt !== 0 && (
                  <span className="num"> · tilt {book.tilt > 0 ? "+" : ""}{book.tilt.toFixed(2)}</span>
                )}
              </p>
            </div>
            {row.p_star != null ? (
              <span
                className="num w-28 whitespace-nowrap text-right text-xs"
                style={{ color: "var(--muted)" }}
                title="His chance of reaching All-Star level or better. The bracket is the model's range: wider means less sure."
              >
                STAR {Math.round(row.p_star * 100)}%
                <span style={{ color: "var(--faint)" }}>
                  {" "}
                  [{Math.round((row.p_star_lo ?? 0) * 100)}–{Math.round((row.p_star_hi ?? 0) * 100)}]
                </span>
              </span>
            ) : (
              <span
                className="num w-28 whitespace-nowrap text-right text-xs"
                style={{ color: "var(--muted)" }}
                title="Your star chance: All-Star level or better under your posterior. No model range exists for this player."
              >
                STAR {Math.round((yourStar ?? 0) * 100)}%
              </span>
            )}
          </div>
        ) : row.coverage === "model" && row.tiers ? (
          <div className="mt-1.5 flex items-center gap-3">
            <div className="flex-1">
              <TierBar tiers={sl ? sl.tiers : row.tiers} height={7} />
              {/* plain text, no Term: this sits inside the row Link and a term
                  popover's glossary link would nest <a> in <a> */}
              {sl ? (
                <p className="mt-1 text-[10px]" style={{ color: "var(--faint)" }}>
                  SL-updated · as of {shortDate(sl.as_of)} ·{" "}
                  <span className="num">
                    tilt {sl.tilt >= 0 ? "+" : ""}{sl.tilt.toFixed(2)}
                  </span>
                </p>
              ) : row.sample_blend != null && (
                <p className="mt-1 text-[10px]" style={{ color: "var(--faint)" }}>
                  Blended sample anchored on his {seasonLabel(row.sample_blend)} season
                </p>
              )}
            </div>
            {sl ? (
              <span
                className="num w-28 whitespace-nowrap text-right text-xs"
                style={{ color: "var(--muted)" }}
                title="His chance of reaching All-Star level or better, after capped Summer League evidence. The model's range belongs to the draft-day view."
              >
                STAR {Math.round(sl.p_star * 100)}%
              </span>
            ) : (
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
            )}
          </div>
        ) : row.market_tiers ? (
          <div className="mt-1.5 flex items-center gap-3">
            <div className="flex-1">
              <TierBar tiers={sl ? sl.tiers : row.market_tiers} height={7} variant="market" />
              <p className="mt-1 text-[10px]" style={{ color: "var(--faint)" }}>
                {sl ? (
                  <>Market prior + Summer League · as of {shortDate(sl.as_of)}</>
                ) : (
                  <>
                    Market prior
                    {row.market_basis === "slot" && row.pick != null ? ` (pick ${row.pick})` :
                     row.market_basis === "consensus" ? ` (consensus #${row.consensus_rank})` : ""}
                    {" · "}
                    {row.coverage === "outside_coverage"
                      ? "outside model coverage (no D1 season)"
                      : "insufficient college sample"}
                  </>
                )}
              </p>
            </div>
            <span
              className="num w-28 whitespace-nowrap text-right text-xs"
              style={{ color: "var(--faint)" }}
              title={sl
                ? "The market's expected career value, updated with capped Summer League evidence. Still not a model opinion."
                : "The market's expected career value: what his draft position has historically returned. Not a model opinion."}
            >
              {sl ? <>MKT+SL {sl.ev.toFixed(1)}</> : <>MKT EV {row.ev_market?.toFixed(1)}</>}
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
        <Chip chip={book ? book.view.your_chip : row.chip} />
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

type SortKey = "model" | "myboard" | "drafted" | "consensus" | "edge" | "age";
type ViewKey = "all" | "undrafted" | "steals" | "reaches";

const PER_PAGE = 20;

const SORT_LABELS: Record<SortKey, string> = {
  model: "Model value",
  myboard: "My board",
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

const STATE_KEY = "board-ui:v1";

export default function Board({ rows }: { rows: BoardRow[] }) {
  const lensState = useLens();
  const { lens, signedIn, role } = lensState;
  const officeView = signedIn ? role === "office" : lens === "office";
  const book = useScoutBook(canUseNotes(lensState));
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("model");
  const [view, setView] = useState<ViewKey>("all");
  const [page, setPage] = useState(0);
  // Default to the current, SL-updated view; the draft-day call stays one tap away.
  const [slView, setSlView] = useState(true);
  const slAsOf = useMemo(
    () => rows.reduce<string | null>(
      (m, r) => (r.sl && (m == null || r.sl.as_of > m) ? r.sl.as_of : m), null),
    [rows],
  );

  // Leaving for a player page and coming back should land where you were:
  // page/sort/filter/search persist for the session and restore on mount.
  const restored = useRef<{ q: string; sort: SortKey; view: ViewKey } | null>(null);
  const hadSaved = useRef(false);
  useEffect(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(STATE_KEY) ?? "null");
      if (s) {
        hadSaved.current = true;
        restored.current = { q: s.q ?? "", sort: s.sort ?? "model", view: s.view ?? "all" };
        setQ(s.q ?? "");
        setSort(s.sort ?? "model");
        setView(s.view ?? "all");
        setPage(s.page ?? 0);
        setSlView(s.slv ?? true);
      }
    } catch {
      // corrupted state: fall back to defaults
    }
  }, []);

  // A scout with saved notes lands on their own board; auto-flip once, never
  // fighting a manual sort choice afterwards (or a restored one from this session).
  const flipped = useRef(false);
  useEffect(() => {
    if (book.size > 0 && !flipped.current && !hadSaved.current) {
      flipped.current = true;
      setSort("myboard");
    }
  }, [book]);

  // "Value gap" is a Front-office concept (the edge number only shows there), so if the
  // lens leaves office while it is selected, fall back to the model order. "My board"
  // needs a non-empty book.
  const activeSort: SortKey =
    (sort === "edge" && !officeView) || (sort === "myboard" && book.size === 0)
      ? "model"
      : sort;

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
    // Your EV where you have notes, the model's where it speaks, the market's where
    // it abstains: the whole class ranks on one board.
    const myEv = (r: BoardRow) =>
      book.get(r.slug)?.view.ev_user ?? r.ev_model ?? r.ev_market ?? null;
    if (activeSort === "myboard") sorted.sort((a, b) => nullsLast(myEv(a), myEv(b), -1));
    else if (activeSort === "drafted") sorted.sort((a, b) => nullsLast(a.pick, b.pick, 1));
    else if (activeSort === "consensus") sorted.sort((a, b) => nullsLast(a.consensus_rank, b.consensus_rank, 1));
    else if (activeSort === "edge") sorted.sort((a, b) => nullsLast(a.edge_slot, b.edge_slot, -1));
    else if (activeSort === "age") sorted.sort((a, b) => nullsLast(a.age, b.age, 1));
    return sorted;
  }, [rows, q, activeSort, view, book]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  // Any USER change to the result set collapses back to the first page — but not
  // the mount run, and not the echo of restoring this session's saved state.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const r = restored.current;
    restored.current = null;
    if (r && r.q === q && r.sort === sort && r.view === view) return;
    setPage(0);
  }, [q, sort, view]);
  const current = Math.min(page, pageCount - 1);

  useEffect(() => {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify({ q, sort, view, page: current, slv: slView }));
    } catch {
      // storage unavailable (private mode quota etc.): state just won't persist
    }
  }, [q, sort, view, current, slView]);
  const visible = filtered.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);

  const sortKeys: SortKey[] = [
    ...(book.size > 0 ? ["myboard" as const] : []),
    "model" as const, "drafted" as const, "consensus" as const, "age" as const,
    ...(officeView ? ["edge" as const] : []),
  ];
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
        {slAsOf != null && (
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
            View:
            <div
              className="flex overflow-hidden rounded-lg border text-xs"
              style={{ borderColor: "var(--border)" }}
              role="tablist"
              aria-label="Board view: Summer League updated or draft day"
            >
              {[
                { id: true, label: `SL-updated · ${shortDate(slAsOf)}` },
                { id: false, label: "Draft day" },
              ].map((o) => (
                <button
                  key={o.label}
                  role="tab"
                  aria-selected={slView === o.id}
                  onClick={() => withRowGlide(() => setSlView(o.id))}
                  className="px-3 py-2"
                  style={{
                    background: slView === o.id ? "var(--purple)" : "transparent",
                    color: slView === o.id ? "#16141b" : "var(--muted)",
                    fontWeight: slView === o.id ? 600 : 400,
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}
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
          <Row key={r.slug} row={r} book={book.get(r.slug)} slMode={slView} />
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

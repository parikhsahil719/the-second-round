import Link from "next/link";
import Board from "@/components/Board";
import Term from "@/components/Term";
import { getBoard, type BoardRow } from "@/lib/api";

function Callout({ row, side }: { row: BoardRow; side: "buy" | "fade" }) {
  return (
    <Link
      href={`/player/${row.slug}`}
      className="card card-link block px-4 py-3.5"
      style={{ borderColor: side === "buy" ? "rgba(93,202,165,0.35)" : "rgba(224,138,122,0.35)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="serif text-[15px]">{row.player_name}</span>
        <span className="text-right">
          <span className="num block text-base leading-tight" style={{ color: side === "buy" ? "var(--pos)" : "var(--neg)" }}>
            {row.edge_slot! > 0 ? "+" : ""}
            {row.edge_slot!.toFixed(1)}
          </span>
          <span className="block text-[10px] tracking-wide" style={{ color: "var(--faint)" }}>
            VS SLOT PRICE
          </span>
        </span>
      </div>
      <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
        {row.pick != null ? `Pick ${row.pick}` : "Undrafted"} · {row.college}
      </p>
      <ul className="mt-2 space-y-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        {((side === "buy" ? row.why_pos : row.why_neg) ?? []).map((w) => (
          <li key={w}>· {w}</li>
        ))}
      </ul>
    </Link>
  );
}

export default async function Home() {
  const rows = await getBoard();
  const scored = rows.filter((r) => r.coverage === "model" && r.edge_slot != null);
  const buys = [...scored].sort((a, b) => b.edge_slot! - a.edge_slot!).slice(0, 3);
  const fades = [...scored].sort((a, b) => a.edge_slot! - b.edge_slot!).slice(0, 3);

  return (
    <>
      <section>
        <h1 className="serif text-4xl leading-snug">What the market missed in 2026</h1>
        <p className="mt-2 max-w-prose text-base leading-relaxed" style={{ color: "var(--muted)" }}>
          We built a model that grades every college prospect on his college resume alone:
          what he did on the court, how young he was, how big he was. It never sees mock
          drafts or where anyone gets picked. Then we compare its grades to the market,
          meaning where NBA teams actually drafted each player and where the mock-draft
          consensus ranked him. Most of the time the market is right. But when the model
          disagrees loudly, history says the model usually wins. Below are this year&apos;s
          loudest disagreements.
        </p>
      </section>

      <p className="mt-6 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
        The number on each card is the <Term id="value_gap">gap</Term>{" "}between what the model
        thinks the player is worth and what his{" "}
        <Term id="slot_price">draft slot historically returns</Term>, in career-value points.
        Bigger number, louder disagreement. Pick numbers and consensus ranks appear
        everywhere on this site. They are the market&apos;s opinion, shown so you can see
        where the model differs. The model never uses them.
      </p>

      <section className="mt-3 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--pos)" }}>
            The model wanted more
          </h2>
          <div className="flex flex-col gap-2">
            {buys.map((r) => (
              <Callout key={r.slug} row={r} side="buy" />
            ))}
          </div>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--neg)" }}>
            The model would have passed
          </h2>
          <div className="flex flex-col gap-2">
            {fades.map((r) => (
              <Callout key={r.slug} row={r} side="fade" />
            ))}
          </div>
        </div>
      </section>

      <Board rows={rows} />
    </>
  );
}

"use client";

import { useState } from "react";
import { API, TIERS, TIER_LABELS, type SeedNote, type Tier } from "@/lib/api";
import { TierBar } from "./TierBar";

interface NoteResult {
  mode: string;
  traits: { trait: string; score: number; confidence: number; evidence: string }[];
  tilt: number;
  prior: Record<Tier, number>;
  posterior: Record<Tier, number>;
}

function toRecord(arr: number[]): Record<Tier, number> {
  return Object.fromEntries(TIERS.map((t, i) => [t, arr[i]])) as Record<Tier, number>;
}

function PriorPosterior({ prior, posterior }: { prior: Record<Tier, number>; posterior: Record<Tier, number> }) {
  const star = (d: Record<Tier, number>) => (d.ALL_STAR ?? 0) + (d.ELITE ?? 0);
  return (
    <div className="mt-3 space-y-2">
      <div>
        <p className="mb-1 text-xs" style={{ color: "var(--faint)" }}>
          Stats prior · P(star) {Math.round(star(prior) * 100)}%
        </p>
        <TierBar tiers={prior} height={9} />
      </div>
      <div>
        <p className="mb-1 text-xs" style={{ color: "var(--purple)" }}>
          With this note · P(star) {Math.round(star(posterior) * 100)}%
        </p>
        <TierBar tiers={posterior} height={9} />
      </div>
    </div>
  );
}

function TraitList({ traits }: { traits: NoteResult["traits"] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {traits.map((t) => (
        <li
          key={t.trait}
          className="rounded px-2 py-0.5 text-xs"
          title={`"${t.evidence}" (confidence ${Math.round(t.confidence * 100)}%)`}
          style={{
            background: t.score > 0 ? "rgba(93,202,165,0.13)" : t.score < 0 ? "rgba(224,138,122,0.13)" : "rgba(143,138,148,0.13)",
            color: t.score > 0 ? "var(--pos)" : t.score < 0 ? "var(--neg)" : "var(--muted)",
          }}
        >
          {t.trait.replaceAll("_", " ")} {t.score > 0 ? "+" : ""}
          {t.score}
        </li>
      ))}
    </ul>
  );
}

export default function NotesPanel({
  slug,
  playerName,
  seedNotes,
  tiers,
}: {
  slug: string;
  playerName: string;
  seedNotes: SeedNote[];
  tiers: Record<Tier, number>;
}) {
  const [note, setNote] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NoteResult | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, note, api_key: apiKey || null }),
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => null))?.detail;
        throw new Error(detail ?? `request failed (${res.status})`);
      }
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mt-6 px-5 py-5">
      <h2 className="text-sm font-semibold">Scout&apos;s desk</h2>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        Write what you saw on film. The system extracts it into a fixed rubric and
        Bayesian-updates the statistical prior — capped, so a note is evidence, never a
        veto. Notes are session-only and never stored.
      </p>

      <textarea
        rows={3}
        className="mt-3 text-sm"
        placeholder={`e.g. "${playerName} guards the point of attack better than the numbers suggest, but the jumper is a project…"`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={2000}
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button className="btn text-sm" onClick={submit} disabled={busy || note.trim().length < 20}>
          {busy ? "Reading the note…" : "Update the numbers"}
        </button>
        <button
          className="text-xs underline"
          style={{ color: "var(--faint)" }}
          onClick={() => setShowKey(!showKey)}
        >
          {showKey ? "hide" : "bring your own API key"}
        </button>
        {showKey && (
          <input
            type="text"
            placeholder="sk-ant-… (skips demo limits, never stored)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="max-w-xs text-xs"
          />
        )}
      </div>
      {error && (
        <p className="mt-2 text-xs" style={{ color: "var(--neg)" }}>
          {error}
        </p>
      )}

      {result && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Extracted {result.traits.length} trait{result.traits.length === 1 ? "" : "s"} (
            {result.mode === "llm" ? "Claude" : "keyword fallback"}) · net tilt{" "}
            {result.tilt > 0 ? "+" : ""}
            {result.tilt.toFixed(2)}
          </p>
          <TraitList traits={result.traits} />
          <PriorPosterior prior={result.prior} posterior={result.posterior} />
        </div>
      )}

      {seedNotes.length > 0 && (
        <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <h3 className="text-xs font-semibold tracking-wide" style={{ color: "var(--muted)" }}>
            FROM THE SCOUTING FILE
          </h3>
          {seedNotes.map((s) => (
            <div key={s.note.slice(0, 40)} className="mt-3">
              <p className="serif text-sm leading-relaxed">“{s.note}”</p>
              <p className="mt-1 text-xs" style={{ color: "var(--faint)" }}>
                <a href={s.source_url} target="_blank" rel="noreferrer" className="underline">
                  {s.source}
                </a>
              </p>
              <TraitList
                traits={s.traits.map((t) => ({ ...t }))}
              />
              <PriorPosterior prior={toRecord(s.prior)} posterior={toRecord(s.posterior)} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { API, TIERS, type SeedNote, type Tier } from "@/lib/api";
import {
  combineTraits,
  deleteNote,
  getMyNotes,
  saveNote,
  supabase,
  type SavedNote,
} from "@/lib/supabase";
import { canUseNotes, chipLabel, useLens, type Lens } from "@/lib/lens";
import ConfirmDialog from "./ConfirmDialog";
import { TierBar } from "./TierBar";

interface YourView {
  ev_model: number;
  ev_user: number;
  model_rank: number | null;
  your_rank: number;
  model_chip: string;
  your_chip: string;
}

interface NoteResult {
  mode: string;
  traits: { trait: string; score: number; confidence: number; evidence: string }[];
  tilt: number;
  comps?: string[];
  prior: Record<Tier, number>;
  posterior: Record<Tier, number>;
  view?: YourView;
}

function toRecord(arr: number[]): Record<Tier, number> {
  return Object.fromEntries(TIERS.map((t, i) => [t, arr[i]])) as Record<Tier, number>;
}

const star = (d: Record<Tier, number>) => (d.ALL_STAR ?? 0) + (d.ELITE ?? 0);

function PriorPosterior({
  prior,
  posterior,
  label = "With this note",
}: {
  prior: Record<Tier, number>;
  posterior: Record<Tier, number>;
  label?: string;
}) {
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
          {label} · P(star) {Math.round(star(posterior) * 100)}%
        </p>
        <TierBar tiers={posterior} height={9} />
      </div>
    </div>
  );
}

function chipCls(chip: string) {
  return chip === "BUY" ? "chip-buy" : chip === "FADE" ? "chip-fade" : chip === "HOLD" ? "chip-hold" : "chip-na";
}

function ViewLine({ view, lens }: { view: YourView; lens: Lens }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-xs" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
      <span>
        Model says <span className={`chip ${chipCls(view.model_chip)}`}>{chipLabel(view.model_chip, lens)}</span>
        {view.model_rank != null ? <span className="num"> (rank #{view.model_rank})</span> : null}
      </span>
      <span>·</span>
      <span>
        your book says <span className={`chip ${chipCls(view.your_chip)}`}>{chipLabel(view.your_chip, lens)}</span>
        <span className="num"> (rank #{view.your_rank})</span>
      </span>
      <span className="num" style={{ color: "var(--faint)" }}>
        value {view.ev_model.toFixed(1)} → {view.ev_user.toFixed(1)}
      </span>
    </div>
  );
}

function CompChips({ comps, label = "Comp noted:" }: { comps?: string[]; label?: string }) {
  if (!comps || comps.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap items-center gap-1.5">
      <li className="text-xs" style={{ color: "var(--faint)" }}>{label}</li>
      {comps.map((c) => (
        <li
          key={c}
          className="rounded px-2 py-0.5 text-xs"
          style={{ background: "rgba(138,123,216,0.13)", color: "var(--purple)" }}
        >
          {c}
        </li>
      ))}
    </ul>
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
            background:
              t.score > 0 ? "rgba(93,202,165,0.13)" : t.score < 0 ? "rgba(224,138,122,0.13)" : "rgba(143,138,148,0.13)",
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
  const lensState = useLens();
  const notesAllowed = canUseNotes(lensState);
  const [note, setNote] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NoteResult | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [saved, setSaved] = useState<SavedNote[]>([]);
  const [myView, setMyView] = useState<{ tiers: Record<Tier, number>; view?: YourView } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SavedNote | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refreshBook = useCallback(async () => {
    const notes = await getMyNotes(slug);
    setSaved(notes);
    const combined = combineTraits(notes);
    if (combined.length === 0) {
      setMyView(null);
      return;
    }
    const res = await fetch(`${API}/posterior`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, traits: combined }),
    });
    if (res.ok) {
      const d = await res.json();
      setMyView({ tiers: d.posterior, view: d.view });
    }
  }, [slug]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      setSignedIn(!!data.user);
      if (data.user) refreshBook();
    });
  }, [refreshBook]);

  async function submit() {
    setBusy(true);
    setError(null);
    setJustSaved(false);
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

  async function saveToBook() {
    if (!result) return;
    try {
      await saveNote(slug, note, result.traits, result.comps ?? []);
      setJustSaved(true);
      await refreshBook();
      window.dispatchEvent(new Event("book-updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not save");
    }
  }

  return (
    <section className="card mt-6 px-5 py-5" id="desk">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Scout&apos;s desk</h2>
        {!signedIn && supabase && (
          <a href="/signup" className="link text-xs">
            Create a free account to keep your book
          </a>
        )}
      </div>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        Write what you saw on film. The system reads it against a fixed checklist of
        skills and nudges the numbers. The update is capped, so a note is evidence, never
        a veto.{signedIn ? " Saved notes combine into your view, newest word per skill." : ""}
      </p>

      {myView && (
        <div className="mt-3 rounded-lg px-4 py-3" style={{ background: "var(--panel)" }}>
          <PriorPosterior prior={tiers} posterior={myView.tiers} label={`Your view (${saved.length} note${saved.length === 1 ? "" : "s"})`} />
          <CompChips comps={[...new Set(saved.flatMap((n) => n.comps ?? []))]} label="Your comps:" />
          {myView.view && <ViewLine view={myView.view} lens={lensState.lens} />}
        </div>
      )}

      {!notesAllowed && (
        <div className="locked-note mt-3 px-4 py-3 text-xs leading-relaxed">
          <span className="locked-tag mr-2">LOCKED</span>
          Note-taking is a Scout and Front office tool. Fans watch the game; scouts write
          it down.{" "}
          <a href="/account" className="underline" style={{ color: "var(--gold)" }}>
            Switch your role in account settings
          </a>{" "}
          to open the desk.
        </div>
      )}
      <textarea
        rows={3}
        className="mt-3 text-sm"
        placeholder={`e.g. "${playerName} guards the point of attack better than the numbers suggest, but the jumper is a project…"`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={2000}
        disabled={!notesAllowed}
        style={!notesAllowed ? { opacity: 0.45 } : undefined}
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button className="btn text-sm" onClick={submit}
                disabled={!notesAllowed || busy || note.trim().length < 20}
                style={!notesAllowed ? { opacity: 0.45 } : undefined}>
          {busy ? "Reading the note…" : "Update the numbers"}
        </button>
        {result && signedIn && !justSaved && (
          <button
            className="btn text-sm"
            style={{ background: "var(--pos)" }}
            onClick={saveToBook}
          >
            Save to my book
          </button>
        )}
        {result && !signedIn && supabase && (
          <a href="/signup" className="link text-xs">
            Want to keep this note? Sign up free
          </a>
        )}
        <button
          className="link text-xs"
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
      {justSaved && (
        <div
          className="mt-3 rounded-lg px-4 py-2.5 text-sm"
          style={{ background: "rgba(93,202,165,0.12)", color: "var(--pos)" }}
        >
          ✓ Saved to your book. It now counts toward your view of this player.
        </div>
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
          <CompChips comps={result.comps} />
          <PriorPosterior prior={result.prior} posterior={result.posterior} />
          {result.view && <ViewLine view={result.view} lens={lensState.lens} />}
        </div>
      )}

      {saved.length > 0 && (
        <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <h3 className="text-xs font-semibold tracking-wide" style={{ color: "var(--muted)" }}>
            MY BOOK ON {playerName.toUpperCase()}
          </h3>
          {saved.map((n) => (
            <div key={n.id} className="mt-3">
              <p className="serif text-sm leading-relaxed">“{n.note_text}”</p>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <TraitList traits={n.traits} />
                  <CompChips comps={n.comps} />
                </div>
                <button
                  className="btn-ghost mt-2 shrink-0 text-xs"
                  style={{ color: "var(--neg)", borderColor: "rgba(224,138,122,0.4)" }}
                  onClick={() => setDeleteTarget(n)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this note?"
        body={
          deleteTarget
            ? `"${deleteTarget.note_text.slice(0, 100)}${deleteTarget.note_text.length > 100 ? "…" : ""}" leaves your book and your view updates without it. This can't be undone.`
            : undefined
        }
        confirmLabel="Delete note"
        danger
        busy={deleting}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleting(true);
          await deleteNote(deleteTarget.id);
          setDeleting(false);
          setDeleteTarget(null);
          await refreshBook();
          window.dispatchEvent(new Event("book-updated"));
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {seedNotes.length > 0 && (
        <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <h3 className="text-xs font-semibold tracking-wide" style={{ color: "var(--muted)" }}>
            FROM THE SCOUTING FILE
          </h3>
          {seedNotes.map((s) => (
            <div key={s.note.slice(0, 40)} className="mt-3">
              <p className="serif text-sm leading-relaxed">“{s.note}”</p>
              <p className="mt-1 text-xs">
                <a href={s.source_url} target="_blank" rel="noreferrer" className="link">
                  {s.source}
                </a>
              </p>
              <TraitList traits={s.traits.map((t) => ({ ...t }))} />
              <PriorPosterior prior={toRecord(s.prior)} posterior={toRecord(s.posterior)} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

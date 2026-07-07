"use client";

import { useCallback, useEffect, useState } from "react";
import { compName, compStar, compTier, type Comp } from "@/components/NotesPanel";
import { TIER_LABELS, type Tier } from "@/lib/api";
import { getMyNotes, supabase } from "@/lib/supabase";

/** The signed-in user's noted comps, rendered inside the historical-profiles card.
 * Names the model's own comp list already shows are excluded: the same player
 * never appears twice on one card. Listens for "book-updated" so a save or
 * delete on the notes desk refreshes it. */
export default function YourComps({ slug, exclude = [] }: { slug: string; exclude?: string[] }) {
  const [comps, setComps] = useState<Comp[]>([]);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const notes = await getMyNotes(slug);
    const taken = new Set(exclude.map((n) => n.toLowerCase()));
    const all = notes.flatMap((n) => n.comps ?? []).filter((c) => !taken.has(compName(c).toLowerCase()));
    setComps([...new Map(all.map((c) => [compName(c).toLowerCase(), c])).values()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, exclude.join("|")]);

  useEffect(() => {
    load();
    window.addEventListener("book-updated", load);
    return () => window.removeEventListener("book-updated", load);
  }, [load]);

  if (comps.length === 0) return null;

  return (
    <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border)" }}>
      <h3 className="text-xs font-semibold tracking-wide" style={{ color: "var(--purple)" }}>
        YOUR COMPS
      </h3>
      <p className="mt-0.5 text-xs" style={{ color: "var(--faint)" }}>
        From your notes. Only you see these.
      </p>
      <ul className="mt-2 space-y-1.5">
        {comps.map((c) => (
          <li key={compName(c)} className="flex items-baseline justify-between text-sm">
            <span className="serif">{compName(c)}</span>
            {compTier(c) && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {TIER_LABELS[compTier(c) as Tier] ?? compTier(c)}
                {compStar(c) && (
                  <span title="Selected to a real All-Star team in his first four seasons"
                        style={{ color: "var(--gold)" }}>
                    {" "}★
                  </span>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

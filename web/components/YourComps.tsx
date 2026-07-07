"use client";

import { useCallback, useEffect, useState } from "react";
import { getMyNotes, supabase } from "@/lib/supabase";

/** The signed-in user's noted comps, rendered inside the historical-profiles card.
 * Listens for "book-updated" so a save or delete on the notes desk refreshes it. */
export default function YourComps({ slug }: { slug: string }) {
  const [comps, setComps] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const notes = await getMyNotes(slug);
    setComps([...new Set(notes.flatMap((n) => n.comps ?? []))]);
  }, [slug]);

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
          <li key={c} className="serif text-sm">
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}

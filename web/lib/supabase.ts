import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Graceful degradation: without env keys the app runs account-less
// (sign-in hidden, notes stay session-only).
// The env var must be the bare project origin; people paste the REST endpoint
// (with /rest/v1/) from the dashboard often enough that we normalize it here.
function origin(u: string | undefined): string | null {
  if (!u) return null;
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
}

const url = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anon ? createClient(url, anon) : null;

export interface SavedNote {
  id: string;
  slug: string;
  note_text: string;
  traits: { trait: string; score: number; confidence: number; evidence: string }[];
  comps?: string[];
  updated_at: string;
}

export async function getMyNotes(slug?: string): Promise<SavedNote[]> {
  if (!supabase) return [];
  let q = supabase.from("scout_notes").select("*").order("updated_at", { ascending: false });
  if (slug) q = q.eq("slug", slug);
  const { data } = await q;
  return (data as SavedNote[]) ?? [];
}

export async function saveNote(
  slug: string,
  noteText: string,
  traits: SavedNote["traits"],
  comps: string[] = []
) {
  if (!supabase) throw new Error("accounts not configured");
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("sign in to save notes");
  let { error } = await supabase.from("scout_notes").insert({
    user_id: u.user.id, slug, note_text: noteText, traits, comps,
  });
  if (error && /comps/i.test(error.message)) {
    // schema not migrated yet; keep the note rather than lose it
    ({ error } = await supabase.from("scout_notes").insert({
      user_id: u.user.id, slug, note_text: noteText, traits,
    }));
  }
  if (error) throw new Error(error.message);
}

export async function deleteNote(id: string) {
  if (!supabase) return;
  await supabase.from("scout_notes").delete().eq("id", id);
}

/** Latest-per-trait across all saved notes on a player (a scout's evolving view). */
export function combineTraits(notes: SavedNote[]): SavedNote["traits"] {
  const latest = new Map<string, SavedNote["traits"][number]>();
  const chrono = [...notes].sort(
    (a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
  );
  for (const n of chrono) for (const t of n.traits) latest.set(t.trait, t);
  return [...latest.values()];
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { API, type BookEntry } from "./api";
import { combineTraits, getMyNotes, supabase, type SavedNote } from "./supabase";

/** The signed-in scout's whole book, hydrated slug -> posterior/EV/chip in one
 * batch call. Empty when signed out, no notes, or notes disabled for the lens.
 * Listens for the existing "book-updated" window event to refresh. */
export function useScoutBook(enabled: boolean): Map<string, BookEntry> {
  const [book, setBook] = useState<Map<string, BookEntry>>(new Map());

  const refresh = useCallback(async () => {
    if (!enabled || !supabase) return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const notes = await getMyNotes();
    if (notes.length === 0) {
      setBook(new Map());
      return;
    }
    const bySlug = new Map<string, SavedNote[]>();
    for (const n of notes) bySlug.set(n.slug, [...(bySlug.get(n.slug) ?? []), n]);
    const items = [...bySlug.entries()].map(([slug, ns]) => ({
      slug,
      traits: combineTraits(ns),
    }));
    const res = await fetch(`${API}/posteriors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) return;
    const d = await res.json();
    const m = new Map<string, BookEntry>();
    for (const [slug, entry] of Object.entries(d.results ?? {})) {
      m.set(slug, {
        ...(entry as Omit<BookEntry, "noteCount">),
        noteCount: bySlug.get(slug)?.length ?? 1,
      });
    }
    setBook(m);
  }, [enabled]);

  useEffect(() => {
    refresh();
    window.addEventListener("book-updated", refresh);
    return () => window.removeEventListener("book-updated", refresh);
  }, [refresh]);

  return book;
}

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Lens } from "@/lib/lens";
import { useLens } from "@/lib/lens";

export default function AccountPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { lens, setLens } = useLens();

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabase)
    return (
      <div className="card mx-auto max-w-md px-6 py-8 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
        Accounts aren&apos;t configured on this deployment. Set
        NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see
        supabase/schema.sql in the repo) to enable scout books.
      </div>
    );

  async function sendLink() {
    setError(null);
    const { error } = await supabase!.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + "/account" },
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  const roles: { id: Lens; label: string; blurb: string }[] = [
    { id: "fan", label: "Fan", blurb: "Plain-English verdicts, comps, no jargon" },
    { id: "office", label: "Front office", blurb: "Edges, chips, and the war room first" },
    { id: "scout", label: "Scout", blurb: "Your notes and your book, front and center" },
  ];

  return (
    <div className="mx-auto max-w-md">
      <h1 className="serif text-2xl">Your account</h1>
      {!user ? (
        <div className="card mt-4 px-5 py-5">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Sign in with a magic link to save scout notes across sessions. No password.
          </p>
          <input
            type="text"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-3 text-sm"
            aria-label="Email address"
          />
          <button className="btn mt-3 text-sm" onClick={sendLink} disabled={!email.includes("@")}>
            Send magic link
          </button>
          {sent && (
            <p className="mt-2 text-xs" style={{ color: "var(--pos)" }}>
              Link sent. Check your email.
            </p>
          )}
          {error && (
            <p className="mt-2 text-xs" style={{ color: "var(--neg)" }}>
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="card mt-4 px-5 py-5">
          <p className="text-sm">
            Signed in as <span style={{ color: "var(--purple)" }}>{user.email}</span>
          </p>
          <p className="mt-4 text-xs font-semibold tracking-wide" style={{ color: "var(--muted)" }}>
            DEFAULT LENS
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {roles.map((r) => (
              <button
                key={r.id}
                onClick={() => setLens(r.id)}
                className="card px-4 py-3 text-left"
                style={{ borderColor: lens === r.id ? "var(--purple)" : "var(--border)" }}
              >
                <span className="text-sm font-medium">{r.label}</span>
                <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
                  {r.blurb}
                </span>
              </button>
            ))}
          </div>
          <button
            className="mt-5 text-xs underline"
            style={{ color: "var(--faint)" }}
            onClick={() => supabase!.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

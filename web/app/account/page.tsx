"use client";

import { useRouter } from "next/navigation";
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
  const router = useRouter();

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

  const roles: { id: Lens; label: string; blurb: string; dest: string; action: string }[] = [
    { id: "fan", label: "Fan", blurb: "Plain-English verdicts, comps, no jargon",
      dest: "/", action: "Take me to the board" },
    { id: "office", label: "Front office", blurb: "Edges, buy/fade calls, and pick planning",
      dest: "/war-room", action: "Open the war room" },
    { id: "scout", label: "Scout", blurb: "Write notes, build your book, argue with the model",
      dest: "/", action: "Pick a player to scout" },
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
            You&apos;re in as <span style={{ color: "var(--purple)" }}>{user.email}</span>
          </p>
          <p className="serif mt-4 text-lg">How do you want to see the draft?</p>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            This sets your view. You can switch anytime with the toggle in the header.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {roles.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setLens(r.id);
                  router.push(r.dest);
                }}
                className="card card-link px-4 py-3.5 text-left"
                style={{ borderColor: lens === r.id ? "var(--purple)" : "var(--border)" }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{r.label}</span>
                  <span className="text-xs" style={{ color: "var(--purple)" }}>
                    {r.action} →
                  </span>
                </div>
                <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                  {r.blurb}
                </p>
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

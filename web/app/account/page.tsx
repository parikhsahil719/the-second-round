"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Lens } from "@/lib/lens";
import { useLens } from "@/lib/lens";

type Mode = "signin" | "signup";

export default function AccountPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const { lens, setLens } = useLens();
  const router = useRouter();

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setUser(s?.user ?? null);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
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

  async function run(fn: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const msg = await fn();
      if (msg) setInfo(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const signIn = () =>
    run(async () => {
      const { error } = await supabase!.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return null;
    });

  const signUp = () =>
    run(async () => {
      const { error } = await supabase!.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + "/account" },
      });
      if (error) throw error;
      return "Almost there. Check your email to confirm your account, then come back and sign in.";
    });

  const magicLink = () =>
    run(async () => {
      const { error } = await supabase!.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + "/account" },
      });
      if (error) throw error;
      return "Sign-in link sent. Check your email.";
    });

  const forgot = () =>
    run(async () => {
      const { error } = await supabase!.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/account",
      });
      if (error) throw error;
      return "Password reset email sent. The link brings you back here to set a new one.";
    });

  const saveNewPassword = () =>
    run(async () => {
      const { error } = await supabase!.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setRecovery(false);
      setNewPassword("");
      return "Password updated. You're signed in.";
    });

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

      {user && recovery ? (
        <div className="card mt-4 px-5 py-5">
          <p className="text-sm">Set a new password for {user.email}.</p>
          <input
            type="password"
            placeholder="New password (8+ characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-3 text-sm"
            aria-label="New password"
          />
          <button className="btn mt-3 text-sm" onClick={saveNewPassword}
                  disabled={busy || newPassword.length < 8}>
            Save new password
          </button>
        </div>
      ) : !user ? (
        <div className="card mt-4 px-5 py-5">
          <div className="flex gap-4 text-sm">
            <button
              onClick={() => setMode("signin")}
              className={mode === "signin" ? "font-semibold underline" : ""}
              style={{ color: mode === "signin" ? "var(--text)" : "var(--muted)" }}
            >
              Sign in
            </button>
            <button
              onClick={() => setMode("signup")}
              className={mode === "signup" ? "font-semibold underline" : ""}
              style={{ color: mode === "signup" ? "var(--text)" : "var(--muted)" }}
            >
              Create account
            </button>
          </div>
          <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            {mode === "signup"
              ? "One confirmation email, then it's just your password from there. Accounts keep your scout notes across visits."
              : "Welcome back. Email and password, or have a one-time link emailed instead."}
          </p>
          <input
            type="text"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-3 text-sm"
            aria-label="Email address"
          />
          <input
            type="password"
            placeholder={mode === "signup" ? "Choose a password (8+ characters)" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 text-sm"
            aria-label="Password"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              className="btn text-sm"
              onClick={mode === "signin" ? signIn : signUp}
              disabled={busy || !email.includes("@") || password.length < (mode === "signup" ? 8 : 1)}
            >
              {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
            {mode === "signin" && (
              <>
                <button className="text-xs underline" style={{ color: "var(--faint)" }}
                        onClick={forgot} disabled={busy || !email.includes("@")}>
                  Forgot password?
                </button>
                <button className="text-xs underline" style={{ color: "var(--faint)" }}
                        onClick={magicLink} disabled={busy || !email.includes("@")}>
                  Email me a link instead
                </button>
              </>
            )}
          </div>
          {info && (
            <p className="mt-2 text-xs" style={{ color: "var(--pos)" }}>{info}</p>
          )}
          {error && (
            <p className="mt-2 text-xs" style={{ color: "var(--neg)" }}>{error}</p>
          )}
        </div>
      ) : (
        <div className="card mt-4 px-5 py-5">
          {info && (
            <p className="mb-2 text-xs" style={{ color: "var(--pos)" }}>{info}</p>
          )}
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

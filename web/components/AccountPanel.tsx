"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Lens } from "@/lib/lens";
import { useLens } from "@/lib/lens";

export type Mode = "signin" | "signup";

// Client-side gate for a stronger UX. Also set the matching server-side policy in
// Supabase (Auth > Providers > Email > Password Requirements) so it can't be bypassed.
const PW_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: "8+ characters", test: (p) => p.length >= 8 },
  { label: "an uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "a lowercase letter", test: (p) => /[a-z]/.test(p) },
  { label: "a number", test: (p) => /[0-9]/.test(p) },
  { label: "a symbol", test: (p) => /[^A-Za-z0-9]/.test(p) },
];
const pwValid = (p: string) => PW_RULES.every((r) => r.test(p));

function PasswordStrength({ pw }: { pw: string }) {
  if (!pw) return null;
  const passed = PW_RULES.filter((r) => r.test(pw));
  const n = passed.length;
  const unmet = PW_RULES.filter((r) => !r.test(pw)).map((r) => r.label);
  const color = n <= 2 ? "var(--neg)" : n < PW_RULES.length ? "var(--gold)" : "var(--pos)";
  const label = n <= 2 ? "Weak" : n < PW_RULES.length ? "Getting there" : "Strong";
  return (
    <div className="mt-2">
      <div className="flex gap-1" aria-hidden="true">
        {PW_RULES.map((_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full"
            style={{ background: i < n ? color : "var(--panel)" }}
          />
        ))}
      </div>
      <p className="mt-1 text-xs" style={{ color }}>
        {label}
        {unmet.length > 0 && (
          <span style={{ color: "var(--faint)" }}> · still needs {unmet.join(", ")}</span>
        )}
      </p>
    </div>
  );
}

export default function AccountPanel({ initialMode = "signin" }: { initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newConfirm, setNewConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const { lens, setLens } = useLens();
  const router = useRouter();

  const canSubmit = !busy && email.includes("@") &&
    (mode === "signin" ? password.length >= 1
                       : pwValid(password) && confirm === password);

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

  const resendConfirm = () =>
    run(async () => {
      const { error } = await supabase!.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: window.location.origin + "/account" },
      });
      if (error) throw error;
      return "Confirmation email sent again. If it doesn't arrive, the shared email limit may be reached (about 2 per hour); wait a bit and retry.";
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
    { id: "fan", label: "Fan", blurb: "The board and player pages in plain English",
      dest: "/", action: "Take me to the board" },
    { id: "scout", label: "Scout", blurb: "Everything fans get, plus notes and your book",
      dest: "/", action: "Pick a player to scout" },
    { id: "office", label: "Front office", blurb: "Everything scouts get, plus the war room and edge numbers",
      dest: "/war-room", action: "Open the war room" },
  ];

  return (
    <div className="mx-auto max-w-md">
      <h1 className="serif text-2xl">Your account</h1>

      {user && recovery ? (
        <div className="card mt-4 px-5 py-5">
          <p className="text-sm">Set a new password for {user.email}.</p>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-3 text-sm"
            aria-label="New password"
          />
          <PasswordStrength pw={newPassword} />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Confirm new password"
            value={newConfirm}
            onChange={(e) => setNewConfirm(e.target.value)}
            className="mt-2 text-sm"
            aria-label="Confirm new password"
          />
          {newConfirm.length > 0 && newConfirm !== newPassword && (
            <p className="mt-1 text-xs" style={{ color: "var(--neg)" }}>
              Passwords don&apos;t match yet.
            </p>
          )}
          <button className="btn mt-3 text-sm" onClick={saveNewPassword}
                  disabled={busy || !pwValid(newPassword) || newConfirm !== newPassword}>
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
              ? "Pick a password with an uppercase and lowercase letter, a number, and a symbol. One confirmation email, then it's just your password from there. Accounts keep your scout notes across visits."
              : "Welcome back. Email and password, or have a one-time link emailed instead."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) (mode === "signin" ? signIn : signUp)();
            }}
          >
          <input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-3 text-sm"
            aria-label="Email address"
          />
          <input
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder={mode === "signup" ? "Choose a strong password" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 text-sm"
            aria-label="Password"
          />
          {mode === "signup" && (
            <>
              <PasswordStrength pw={password} />
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-2 text-sm"
                aria-label="Confirm password"
              />
              {confirm.length > 0 && confirm !== password && (
                <p className="mt-1 text-xs" style={{ color: "var(--neg)" }}>
                  Passwords don&apos;t match yet.
                </p>
              )}
            </>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="btn text-sm"
              disabled={!canSubmit}
            >
              {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
            {mode === "signin" && (
              <>
                <button type="button" className="text-xs underline" style={{ color: "var(--faint)" }}
                        onClick={forgot} disabled={busy || !email.includes("@")}>
                  Forgot password?
                </button>
                <button type="button" className="text-xs underline" style={{ color: "var(--faint)" }}
                        onClick={magicLink} disabled={busy || !email.includes("@")}>
                  Email me a link instead
                </button>
              </>
            )}
          </div>
          </form>
          {info && (
            <p className="mt-2 text-xs" style={{ color: "var(--pos)" }}>{info}</p>
          )}
          {error && (
            <p className="mt-2 text-xs" style={{ color: "var(--neg)" }}>{error}</p>
          )}
          {(mode === "signup" || (error ?? "").toLowerCase().includes("confirm")) && (
            <button
              type="button"
              className="mt-2 text-xs underline"
              style={{ color: "var(--faint)" }}
              onClick={resendConfirm}
              disabled={busy || !email.includes("@")}
            >
              Didn&apos;t get the confirmation email? Resend it
            </button>
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
          <p className="serif mt-4 text-lg">Choose your role</p>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            Your role shapes what you see and unlocks its tools. You can change it here
            anytime.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {roles.map((r) => (
              <button
                key={r.id}
                onClick={async () => {
                  await supabase!.auth.updateUser({ data: { role: r.id } });
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

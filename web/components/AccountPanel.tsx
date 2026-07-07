"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { getMyUsername, supabase } from "@/lib/supabase";
import type { Lens } from "@/lib/lens";
import { useLens } from "@/lib/lens";

export type Mode = "signin" | "signup";

// Mirrors the check constraint on profiles.username; the database is the enforcer,
// this just fails fast in the form.
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

// Client-side gate for a stronger UX. Also set the matching server-side policy in
// Supabase (Auth > Providers > Email > Password Requirements) so it can't be bypassed.
export const PW_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: "8+ characters", test: (p) => p.length >= 8 },
  { label: "an uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "a lowercase letter", test: (p) => /[a-z]/.test(p) },
  { label: "a number", test: (p) => /[0-9]/.test(p) },
  { label: "a symbol", test: (p) => /[^A-Za-z0-9]/.test(p) },
];
export const pwValid = (p: string) => PW_RULES.every((r) => r.test(p));

export function PasswordStrength({ pw }: { pw: string }) {
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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [curPassword, setCurPassword] = useState("");
  const [chgPassword, setChgPassword] = useState("");
  const [chgConfirm, setChgConfirm] = useState("");
  const [showChange, setShowChange] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const { lens, setLens } = useLens();
  const router = useRouter();

  const usernameValid = USERNAME_RE.test(username.trim());
  const canSubmit = !busy && email.includes("@") &&
    (mode === "signin" ? password.length >= 1
                       : usernameValid && pwValid(password) && confirm === password);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setUser(s?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) getMyUsername().then(setMyUsername);
    else setMyUsername(null);
  }, [user]);

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
        options: {
          data: { username: username.trim() },
          emailRedirectTo: window.location.origin + "/account",
        },
      });
      if (error) throw error;
      return "Almost there. Check your email to confirm your account, then come back and sign in.";
    });

  const changePassword = () =>
    run(async () => {
      // reauthenticate first: prove the current password before accepting a new one
      const { error: authErr } = await supabase!.auth.signInWithPassword({
        email: user!.email!,
        password: curPassword,
      });
      if (authErr) throw new Error("Current password is incorrect.");
      const { error } = await supabase!.auth.updateUser({ password: chgPassword });
      if (error) throw error;
      setCurPassword("");
      setChgPassword("");
      setChgConfirm("");
      setShowChange(false);
      return "Password updated.";
    });

  const resetFromSettings = () =>
    run(async () => {
      const { error } = await supabase!.auth.resetPasswordForEmail(user!.email!, {
        redirectTo: window.location.origin + "/reset-password",
      });
      if (error) throw error;
      return `Reset link sent to ${user!.email}.`;
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
        redirectTo: window.location.origin + "/reset-password",
      });
      if (error) throw error;
      return "Password reset email sent. The link takes you to a page to choose a new one.";
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

      {!user ? (
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
              ? "Pick a username (it's permanent for now) and a password with an uppercase and lowercase letter, a number, and a symbol. One confirmation email, then it's just your password from there. Accounts keep your scout notes across visits."
              : "Welcome back. Email and password, or have a one-time link emailed instead."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) (mode === "signin" ? signIn : signUp)();
            }}
          >
          {mode === "signup" && (
            <>
              <input
                type="text"
                autoComplete="username"
                placeholder="Username (letters, numbers, underscores)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-3 text-sm"
                aria-label="Username"
                maxLength={20}
              />
              {username.length > 0 && !usernameValid && (
                <p className="mt-1 text-xs" style={{ color: "var(--neg)" }}>
                  3 to 20 characters: letters, numbers, and underscores only.
                </p>
              )}
            </>
          )}
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
                <button type="button" className="link text-xs"
                        onClick={forgot} disabled={busy || !email.includes("@")}>
                  Forgot password?
                </button>
                <button type="button" className="link text-xs"
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
              className="link mt-2 text-xs"
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
          {error && (
            <p className="mb-2 text-xs" style={{ color: "var(--neg)" }}>{error}</p>
          )}
          <p className="text-sm">
            You&apos;re in as{" "}
            <span style={{ color: "var(--purple)" }}>{myUsername ?? user.email}</span>
            {myUsername && (
              <span className="text-xs" style={{ color: "var(--faint)" }}> · {user.email}</span>
            )}
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
          <div className="mt-6 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <button
              className="link text-sm"
              onClick={() => setShowChange(!showChange)}
            >
              {showChange ? "Hide change password" : "Change password"}
            </button>
            {showChange && (
              <div className="mt-3">
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Current password"
                  value={curPassword}
                  onChange={(e) => setCurPassword(e.target.value)}
                  className="text-sm"
                  aria-label="Current password"
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="New password"
                  value={chgPassword}
                  onChange={(e) => setChgPassword(e.target.value)}
                  className="mt-2 text-sm"
                  aria-label="New password"
                />
                <PasswordStrength pw={chgPassword} />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Confirm new password"
                  value={chgConfirm}
                  onChange={(e) => setChgConfirm(e.target.value)}
                  className="mt-2 text-sm"
                  aria-label="Confirm new password"
                />
                {chgConfirm.length > 0 && chgConfirm !== chgPassword && (
                  <p className="mt-1 text-xs" style={{ color: "var(--neg)" }}>
                    Passwords don&apos;t match yet.
                  </p>
                )}
                <button
                  className="btn mt-3 text-sm"
                  onClick={changePassword}
                  disabled={busy || curPassword.length < 1 || !pwValid(chgPassword) || chgConfirm !== chgPassword}
                >
                  {busy ? "One moment…" : "Update password"}
                </button>
                <p className="mt-2 text-xs" style={{ color: "var(--faint)" }}>
                  Signed up with a link and never set a password?{" "}
                  <button className="link" onClick={resetFromSettings} disabled={busy}>
                    Email me a reset link instead
                  </button>
                </p>
              </div>
            )}
          </div>
          <button
            className="btn-ghost mt-5 text-sm"
            onClick={() => setConfirmSignOut(true)}
          >
            Sign out
          </button>
          <ConfirmDialog
            open={confirmSignOut}
            title="Sign out?"
            body="Your saved notes stay in your book. You can sign back in anytime."
            confirmLabel="Sign out"
            onConfirm={async () => {
              await supabase!.auth.signOut();
              setConfirmSignOut(false);
            }}
            onCancel={() => setConfirmSignOut(false)}
          />
        </div>
      )}
    </div>
  );
}

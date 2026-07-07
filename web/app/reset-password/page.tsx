"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PasswordStrength, pwValid } from "@/components/AccountPanel";
import { supabase } from "@/lib/supabase";

/** The reset email lands here. Unlike catching a transient auth event on the
 * account page, this page IS the recovery flow: if the link signed you in, you
 * set a new password before going anywhere else. */
export default function ResetPassword() {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<boolean | null>(null); // null = still checking
  const router = useRouter();

  useEffect(() => {
    if (!supabase) {
      setReady(false);
      return;
    }
    // the recovery token in the URL signs the user in; give it a moment to process
    const timer = setTimeout(async () => {
      const { data } = await supabase!.auth.getUser();
      setReady(!!data.user);
    }, 1500);
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.user) {
        clearTimeout(timer);
        setReady(true);
      }
    });
    return () => {
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase!.auth.updateUser({ password: pw });
      if (error) throw error;
      router.push("/account");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="serif text-2xl">Choose a new password</h1>

      {ready === null && (
        <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
          Checking your reset link…
        </p>
      )}

      {ready === false && (
        <div className="card mt-4 px-5 py-5 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          This reset link is invalid or has expired. Links only work once and for a
          limited time.{" "}
          <Link href="/signin" className="underline" style={{ color: "var(--purple)" }}>
            Request a new one from the sign-in page.
          </Link>
        </div>
      )}

      {ready && (
        <div className="card mt-4 px-5 py-5">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Pick a password with an uppercase and lowercase letter, a number, and a
            symbol.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy && pwValid(pw) && confirm === pw) save();
            }}
          >
            <input
              type="password"
              autoComplete="new-password"
              placeholder="New password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="mt-3 text-sm"
              aria-label="New password"
            />
            <PasswordStrength pw={pw} />
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-2 text-sm"
              aria-label="Confirm new password"
            />
            {confirm.length > 0 && confirm !== pw && (
              <p className="mt-1 text-xs" style={{ color: "var(--neg)" }}>
                Passwords don&apos;t match yet.
              </p>
            )}
            <button
              type="submit"
              className="btn mt-3 text-sm"
              disabled={busy || !pwValid(pw) || confirm !== pw}
            >
              {busy ? "One moment…" : "Save new password"}
            </button>
          </form>
          {error && (
            <p className="mt-2 text-xs" style={{ color: "var(--neg)" }}>{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

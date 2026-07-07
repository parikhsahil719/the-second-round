"use client";

import Link from "next/link";
import { useState } from "react";
import { API } from "@/lib/api";
import { supabase } from "@/lib/supabase";

/** Standalone reset-request page, the way market login systems do it: enter who
 * you are (email or username), get a link. The answer never reveals whether an
 * account exists. */
export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/auth/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: identifier.trim(),
          action: "reset",
          redirect_to: window.location.origin + "/reset-password",
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.detail ?? "Could not send the email. Try again in a moment.");
      setSent(d.message ?? "If an account matches, an email is on its way. Check your inbox.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!supabase)
    return (
      <div className="card mx-auto max-w-md px-6 py-8 text-sm" style={{ color: "var(--muted)" }}>
        Accounts aren&apos;t configured on this deployment.
      </div>
    );

  return (
    <div className="mx-auto max-w-md">
      <h1 className="serif text-3xl">Reset your password</h1>
      <div className="card mt-4 px-5 py-5">
        {sent ? (
          <>
            <p className="text-sm leading-relaxed">{sent}</p>
            <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
              The link takes you to a page to choose a new password. Nothing arriving?
              Check spam, or wait a minute and try again.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              Enter your email or username and we&apos;ll send a reset link to the email
              on the account.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy && identifier.trim().length >= 2) send();
              }}
            >
              <input
                type="text"
                autoComplete="username"
                placeholder="Email or username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="mt-3 text-sm"
                aria-label="Email or username"
              />
              <button
                type="submit"
                className="btn mt-3 text-sm"
                disabled={busy || identifier.trim().length < 2}
              >
                {busy ? "One moment…" : "Send reset link"}
              </button>
            </form>
            {error && <div className="form-error mt-3">{error}</div>}
          </>
        )}
        <p className="mt-4 text-xs" style={{ color: "var(--faint)" }}>
          Remembered it after all?{" "}
          <Link href="/signin" className="link">
            Back to sign in.
          </Link>
        </p>
      </div>
    </div>
  );
}

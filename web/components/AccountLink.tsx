"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { getMyUsername, supabase } from "@/lib/supabase";

export default function AccountLink() {
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setLoaded(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setEmail(session?.user?.email ?? null)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (email) getMyUsername().then(setName);
    else setName(null);
  }, [email]);

  if (!supabase) return null;

  const closeMenu = () => menuRef.current?.removeAttribute("open");

  if (email)
    return (
      <>
        <details className="menu" ref={menuRef}>
          <summary>{name ?? email.split("@")[0]} ▾</summary>
          <div className="menu-panel">
            <p className="px-3 pb-1 pt-2 text-xs" style={{ color: "var(--faint)" }}>
              {email}
            </p>
            <Link href="/account" className="menu-item" onClick={closeMenu}>
              Account settings
            </Link>
            <button
              className="menu-item danger"
              onClick={() => {
                closeMenu();
                setConfirmSignOut(true);
              }}
            >
              Sign out
            </button>
          </div>
        </details>
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
      </>
    );

  return (
    <span className="flex items-center gap-2.5" style={{ visibility: loaded ? "visible" : "hidden" }}>
      <Link href="/signin" className="text-xs" style={{ color: "var(--muted)" }}>
        Sign in
      </Link>
      <Link
        href="/signup"
        className="rounded-lg px-3 py-1.5 text-xs font-semibold"
        style={{ background: "var(--purple)", color: "#16141b" }}
      >
        Sign up free
      </Link>
    </span>
  );
}

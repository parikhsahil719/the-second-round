"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AccountLink() {
  const [email, setEmail] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

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

  if (!supabase) return null;

  if (email)
    return (
      <Link href="/account" className="text-xs underline" style={{ color: "var(--muted)" }}>
        {email.split("@")[0]}
      </Link>
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

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AccountLink() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setEmail(session?.user?.email ?? null)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabase) return null;
  return (
    <Link href="/account" className="text-xs underline" style={{ color: "var(--muted)" }}>
      {email ? email.split("@")[0] : "Sign in"}
    </Link>
  );
}

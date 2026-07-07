"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";

export type Lens = "fan" | "office" | "scout";

interface LensState {
  lens: Lens;
  setLens: (l: Lens) => void;
  signedIn: boolean;
  role: Lens | null; // account role; non-null locks the lens to it
}

const LensContext = createContext<LensState>({
  lens: "fan",
  setLens: () => {},
  signedIn: false,
  role: null,
});

function isLens(v: unknown): v is Lens {
  return v === "fan" || v === "office" || v === "scout";
}

export function LensProvider({ children }: { children: React.ReactNode }) {
  const [lens, setLensState] = useState<Lens>("fan");
  const [signedIn, setSignedIn] = useState(false);
  const [role, setRole] = useState<Lens | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("lens");
    if (isLens(saved)) setLensState(saved);
    if (!supabase) return;

    const apply = (user: { user_metadata?: Record<string, unknown> } | null) => {
      setSignedIn(!!user);
      const r = user?.user_metadata?.role;
      if (isLens(r)) {
        setRole(r);
        setLensState(r); // signed-in accounts see the app as their role
      } else {
        setRole(null);
      }
    };
    supabase.auth.getUser().then(({ data }) => apply(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => {
      apply(s?.user ?? null);
      // recovery links can land anywhere (Supabase falls back to the Site URL when
      // a redirect isn't allowlisted); this provider mounts on every page, so route
      // the user to the reset form no matter where they arrived
      if (e === "PASSWORD_RECOVERY" && !window.location.pathname.startsWith("/reset-password")) {
        // the flag is the reset page's proof this is a real recovery, not just
        // any signed-in visitor typing the URL
        sessionStorage.setItem("tsr-recovery", "1");
        window.location.assign("/reset-password");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const setLens = (l: Lens) => {
    setLensState(l);
    localStorage.setItem("lens", l);
  };

  return (
    <LensContext.Provider value={{ lens, setLens, signedIn, role }}>
      {children}
    </LensContext.Provider>
  );
}

export const useLens = () => useContext(LensContext);

const LABELS: Record<Lens, string> = { fan: "Fan", office: "Front office", scout: "Scout" };

export function LensToggle() {
  const { lens, setLens, signedIn, role } = useLens();

  // Signed-in accounts have a role, not a toggle. The role chip links to settings.
  if (signedIn) {
    return (
      <Link
        href="/account"
        className="rounded-lg border px-2.5 py-1.5 text-xs"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        title="Change your role in account settings"
      >
        {role ? `Viewing as ${LABELS[role]}` : "Choose your role"}
      </Link>
    );
  }

  const opts: { id: Lens; label: string }[] = [
    { id: "fan", label: "Fan" },
    { id: "office", label: "Front office" },
    { id: "scout", label: "Scout" },
  ];
  return (
    <div
      className="flex overflow-hidden rounded-lg border text-xs"
      style={{ borderColor: "var(--border)" }}
      role="tablist"
      aria-label="Viewing lens"
    >
      {opts.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={lens === o.id}
          onClick={() => setLens(o.id)}
          className="px-2.5 py-1.5"
          style={{
            background: lens === o.id ? "var(--purple)" : "transparent",
            color: lens === o.id ? "#16141b" : "var(--muted)",
            fontWeight: lens === o.id ? 600 : 400,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function chipLabel(chip: string | undefined, lens: Lens): string {
  if (!chip || chip === "N/A") return "N/A";
  if (lens === "fan")
    return chip === "BUY" ? "STEAL" : chip === "FADE" ? "PRICEY" : "FAIR";
  return chip;
}

/** Gate: may this user use front-office tools (war room, edge numbers)?
 * Visitors get full demo access; gating applies to accounts by role. */
export function canUseOffice(state: Pick<LensState, "signedIn" | "role">): boolean {
  return state.signedIn ? state.role === "office" : true;
}

/** Gate: may this user write and keep notes? (Visitors may try session-only notes.) */
export function canUseNotes(state: Pick<LensState, "signedIn" | "role">): boolean {
  return state.signedIn ? state.role === "scout" || state.role === "office" : true;
}

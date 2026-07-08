"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
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

// One source of truth for what each lens is and what it shows. The label feeds
// the toggle + the signed-in role chip; the blurb feeds the "?" explainer.
// Order is the ascending-complexity ladder the explainer teaches.
export const LENS_INFO: Record<Lens, { label: string; blurb: string }> = {
  fan: {
    label: "Fan",
    blurb:
      "The clean read: career-tier odds, star chance, and the model's STEAL / FAIR / REACH call on every prospect.",
  },
  scout: {
    label: "Scout",
    blurb:
      "Everything a fan sees, plus a desk to log what you saw on film. Your notes update the model to your own view of a player.",
  },
  office: {
    label: "Front office",
    blurb:
      "Everything a scout sees, plus value-vs-price numbers on the board and the war-room draft simulator.",
  },
};
const LENS_ORDER: Lens[] = ["fan", "scout", "office"];

/** The "?" next to the toggle: opens one popover explaining all three lenses.
 * Click-to-toggle (no hover machinery); JS-positioned below the button and
 * viewport-clamped, mirroring the glossary Term popover. */
function LensInfoButton() {
  const panelId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const panel = panelRef.current;
    const btn = btnRef.current;
    if (!panel || !btn) return;

    const place = () => {
      const r = btn.getBoundingClientRect();
      const pr = panel.getBoundingClientRect();
      const pw = pr.width || 320;
      const ph = pr.height || 0;
      // Right-align the panel to the button, then clamp to the viewport.
      let left = Math.min(r.right - pw, window.innerWidth - pw - 8);
      left = Math.max(8, left);
      const top = Math.min(r.bottom + 6, window.innerHeight - ph - 8);
      panel.style.left = `${left}px`;
      panel.style.top = `${Math.max(8, top)}px`;
    };

    const onToggle = (e: Event) => {
      const open = (e as Event & { newState?: string }).newState === "open";
      setExpanded(open);
      if (open) {
        place();
        window.addEventListener("scroll", place, true);
        window.addEventListener("resize", place);
      } else {
        window.removeEventListener("scroll", place, true);
        window.removeEventListener("resize", place);
      }
    };

    panel.addEventListener("beforetoggle", onToggle);
    panel.addEventListener("toggle", onToggle);
    return () => {
      panel.removeEventListener("beforetoggle", onToggle);
      panel.removeEventListener("toggle", onToggle);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, []);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="What each view shows"
        aria-expanded={expanded}
        aria-details={panelId}
        onClick={() => {
          const p = panelRef.current;
          if (!p) return;
          p.matches(":popover-open") ? p.hidePopover() : p.showPopover();
        }}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
      >
        ?
      </button>
      <div ref={panelRef} id={panelId} popover="auto" className="term-pop lens-pop">
        <p className="font-semibold" style={{ color: "var(--text)" }}>
          Pick your view
        </p>
        <dl className="mt-2 space-y-2">
          {LENS_ORDER.map((id) => (
            <div key={id}>
              <dt className="font-semibold" style={{ color: "var(--text)" }}>
                {LENS_INFO[id].label}
                {id === "fan" && (
                  <span style={{ color: "var(--purple-bright)", fontWeight: 400 }}> · start here</span>
                )}
              </dt>
              <dd className="mt-0.5" style={{ color: "var(--muted)" }}>
                {LENS_INFO[id].blurb}
              </dd>
            </div>
          ))}
        </dl>
        <p
          className="mt-3 border-t pt-2 text-xs"
          style={{ borderColor: "var(--border)", color: "var(--faint)" }}
        >
          Signing up locks a role and saves your book across visits.
        </p>
      </div>
    </>
  );
}

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
        {role ? `Viewing as ${LENS_INFO[role].label}` : "Choose your role"}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs sm:inline" style={{ color: "var(--faint)" }}>
        Viewing as
      </span>
      <div
        className="flex overflow-hidden rounded-lg border text-xs"
        style={{ borderColor: "var(--border)" }}
        role="tablist"
        aria-label="Viewing lens"
      >
        {LENS_ORDER.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={lens === id}
            onClick={() => setLens(id)}
            className="px-2.5 py-1.5"
            style={{
              background: lens === id ? "var(--purple)" : "transparent",
              color: lens === id ? "#16141b" : "var(--muted)",
              fontWeight: lens === id ? 600 : 400,
            }}
          >
            {LENS_INFO[id].label}
          </button>
        ))}
      </div>
      <LensInfoButton />
    </div>
  );
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

/** Gate: may this user open the war room? Scouts and front office; visitors get the demo.
 * (The edge/surplus numbers inside it stay front-office-only, gated separately.) */
export function canUseWarRoom(state: Pick<LensState, "signedIn" | "role">): boolean {
  return state.signedIn ? state.role === "scout" || state.role === "office" : true;
}

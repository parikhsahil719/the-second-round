"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Lens = "fan" | "office" | "scout";

const LensContext = createContext<{ lens: Lens; setLens: (l: Lens) => void }>({
  lens: "fan",
  setLens: () => {},
});

export function LensProvider({ children }: { children: React.ReactNode }) {
  const [lens, setLensState] = useState<Lens>("fan");
  useEffect(() => {
    const saved = localStorage.getItem("lens") as Lens | null;
    if (saved === "fan" || saved === "office" || saved === "scout") setLensState(saved);
  }, []);
  const setLens = (l: Lens) => {
    setLensState(l);
    localStorage.setItem("lens", l);
  };
  return <LensContext.Provider value={{ lens, setLens }}>{children}</LensContext.Provider>;
}

export const useLens = () => useContext(LensContext);

export function LensToggle() {
  const { lens, setLens } = useLens();
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

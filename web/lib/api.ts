export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8765";

export const TIERS = ["OOL", "FRINGE", "ROTATION", "STARTER", "ALL_STAR", "ELITE"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABELS: Record<Tier, string> = {
  OOL: "Out of league",
  FRINGE: "Fringe",
  ROTATION: "Rotation",
  STARTER: "Starter",
  ALL_STAR: "All-Star level",
  ELITE: "Elite",
};

export const TIER_COLORS: Record<Tier, string> = {
  OOL: "var(--t-ool)",
  FRINGE: "var(--t-fringe)",
  ROTATION: "var(--t-rotation)",
  STARTER: "var(--t-starter)",
  ALL_STAR: "var(--t-allstar)",
  ELITE: "var(--t-elite)",
};

export interface BoardRow {
  slug: string;
  player_name: string;
  college: string | null;
  headshot_url?: string | null;
  pick: number | null;
  consensus_rank: number | null;
  coverage: "model" | "insufficient_sample" | "outside_coverage";
  pos: string | null;
  tiers?: Record<Tier, number>;
  p_star?: number;
  p_star_lo?: number;
  p_star_hi?: number;
  ev_model?: number;
  ev_slot?: number;
  ev_consensus?: number | null;
  edge_slot?: number | null;
  chip?: "BUY" | "HOLD" | "FADE" | "N/A";
  age?: number | null;
  model_rank?: number | null;
  why_pos?: string[];
  why_neg?: string[];
}

export interface WhyItem {
  text: string;
  feature: string;
  contribution: number;
}

export interface SeedNote {
  player_name: string;
  note: string;
  source: string;
  source_url: string;
  traits: { trait: string; score: number; confidence: number; evidence: string }[];
  prior: number[];
  posterior: number[];
  tilt: number;
}

export interface PlayerDetail extends BoardRow {
  why?: WhyItem[];
  comps?: { name: string; tier: Tier }[];
  seed_notes: SeedNote[];
}

export async function getBoard(): Promise<BoardRow[]> {
  const res = await fetch(`${API}/board`, { cache: "no-store" });
  if (!res.ok) throw new Error("board fetch failed");
  return (await res.json()).rows;
}

export async function getPlayer(slug: string): Promise<PlayerDetail | null> {
  const res = await fetch(`${API}/player/${slug}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("player fetch failed");
  return res.json();
}

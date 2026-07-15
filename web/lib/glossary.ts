import { TIER_DEFINITIONS, TIER_LABELS } from "./api";

export type GlossaryCategory =
  | "Career tiers"
  | "Board calls"
  | "Value"
  | "Ranking"
  | "Coverage"
  | "War room"
  | "Scouting";

export const GLOSSARY_CATEGORIES: GlossaryCategory[] = [
  "Career tiers",
  "Board calls",
  "Value",
  "Ranking",
  "Coverage",
  "War room",
  "Scouting",
];

export interface GlossaryEntry {
  term: string;
  short: string;
  category: GlossaryCategory;
  long?: string;
}

// The six career tiers reuse the single source of truth in api.ts so a tier is defined once.
const tierEntry = (key: keyof typeof TIER_LABELS): GlossaryEntry => ({
  term: TIER_LABELS[key],
  short: TIER_DEFINITIONS[key],
  category: "Career tiers",
});

export const GLOSSARY: Record<string, GlossaryEntry> = {
  ool: tierEntry("OOL"),
  fringe: tierEntry("FRINGE"),
  rotation: tierEntry("ROTATION"),
  starter: tierEntry("STARTER"),
  all_star: tierEntry("ALL_STAR"),
  elite: tierEntry("ELITE"),

  steal: {
    term: "STEAL",
    short: "Drafted well below where the model ranked him this class, a bargain on draft rank.",
    category: "Board calls",
  },
  fair: {
    term: "FAIR",
    short: "Drafted about where the model ranked him.",
    category: "Board calls",
  },
  reach: {
    term: "REACH",
    short: "Drafted well above where the model ranked him, a premium on draft rank.",
    category: "Board calls",
  },
  sleeper: {
    term: "SLEEPER",
    short:
      "An undrafted player the model rated as draftable. Steal and reach grade where a player was picked, so they don't fit someone who went undrafted; a sleeper is one the whole league passed on but the model would have taken.",
    category: "Board calls",
  },

  model_value: {
    term: "Model value",
    short:
      "The model's expected career value for a player, on a 0 to 40 scale: 1 is a fringe player, 8 a starter, 20 an All-Star, 40 an all-time great.",
    category: "Value",
  },
  value_gap: {
    term: "Value gap",
    short:
      "Model value minus what his draft slot has historically returned. Positive means the model prices him above his slot.",
    category: "Value",
  },
  slot_price: {
    term: "Slot price",
    short:
      "The average career value a draft slot has returned historically. What that pick costs in value terms.",
    category: "Value",
  },
  consensus_ev: {
    term: "Consensus-implied EV",
    short:
      "The career value players ranked where the consensus put him have historically returned. Like slot price, but from the mock-draft consensus instead of his actual pick.",
    category: "Value",
  },
  star_pct: {
    term: "STAR %",
    short:
      "The model's best guess at his chance of reaching All-Star level or Elite. The range shows how sure it is: a wide spread like 26 to 80 means low confidence, a narrow one means high.",
    category: "Value",
  },

  consensus_rank: {
    term: "Consensus rank",
    short: "Where the pre-draft consensus of mock boards ranked the player.",
    category: "Ranking",
  },
  model_rank: {
    term: "Model rank",
    short: "Where the model ranks the player within this class by expected value.",
    category: "Ranking",
  },

  coverage_outside: {
    term: "Outside coverage",
    short:
      "No Division-1 college season on record, so the model cannot grade him. The market's prior is shown instead, as a dashed bar.",
    category: "Coverage",
  },
  market_prior: {
    term: "Market prior",
    short:
      "What his draft position has historically become: the market's expectation, shown as a dashed bar. Not a model opinion. Your notes can update it; the model stays silent.",
    category: "Coverage",
  },
  coverage_insufficient: {
    term: "Insufficient sample",
    short:
      "Too little college data to grade reliably, and no earlier qualifying season to fall back on. Market prices only.",
    category: "Coverage",
  },
  sample_blend: {
    term: "Blended sample",
    short:
      "His final college season was too small to grade alone, so the model scores a minutes-weighted blend of his last full season plus everything after it. The tiny recent sample still counts, just at its real weight.",
    category: "Coverage",
  },

  availability: {
    term: "Availability",
    short:
      "The share of 10,000 simulated drafts where the player is still on the board when your pick arrives.",
    category: "War room",
  },
  surplus: {
    term: "Surplus",
    short:
      "Model value minus this pick's price. Positive means he is worth more than the slot costs.",
    category: "War room",
  },
  on_the_clock: {
    term: "On the clock",
    short: "It is your team's turn to pick. Every earlier pick is already spent.",
    category: "War room",
  },
  pick_price: {
    term: "Pick price",
    short: "The career value this pick has historically returned, its price in value terms.",
    category: "War room",
  },

  archetype_engine: {
    term: "Engine",
    short: "Carries the offense: high usage, the primary creator.",
    category: "Scouting",
  },
  archetype_connector: {
    term: "Connector",
    short: "Wins without the ball: complements stars rather than needing volume.",
    category: "Scouting",
  },
  archetype_costar: {
    term: "Co-star",
    short: "A high-usage secondary star alongside a lead option.",
    category: "Scouting",
  },
  late_bloom: {
    term: "Late bloom",
    short: "A career that kept climbing after the four-year window the tiers measure.",
    category: "Scouting",
  },
  allstar_mark: {
    term: "All-Star mark",
    short: "The star marks a real All-Star selection in the player's first four seasons.",
    category: "Scouting",
  },
  scout_note: {
    term: "Scout note",
    short:
      "Free text you write about what you saw. The model reads it and nudges the numbers, capped so a note is evidence, never a veto.",
    category: "Scouting",
  },
  sl_updated: {
    term: "SL-updated",
    short:
      "These numbers fold in Summer League box scores as reliability-weighted evidence. July minutes are weighted by sample size, and the hotter the summer, the less each extra game adds — history sets that curve, so a great July informs the call but never decides it.",
    category: "Scouting",
  },
  prior: {
    term: "Prior",
    short: "The model's numbers before your notes are applied.",
    category: "Scouting",
  },
  posterior: {
    term: "Posterior",
    short: "The model's numbers after your notes nudge them.",
    category: "Scouting",
  },
  comps: {
    term: "Comps",
    short:
      "Closest historical college profiles at the player's position, showing the range his profile has produced.",
    category: "Scouting",
  },
};

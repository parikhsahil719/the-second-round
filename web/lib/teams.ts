// Draft-team lookup. The board data carries Basketball-Reference codes (BRK, PHO,
// CHA); we display the NBA-standard abbreviation and a logo from ESPN's CDN (the
// same CDN the headshots use). `espn` is the logo code, which differs from the
// abbreviation for two teams: New Orleans is "no", Utah is "utah". All 30 verified.
interface Team {
  abbr: string; // NBA-standard abbreviation, for display
  name: string;
  espn: string; // ESPN logo-CDN code
}

// Keyed by every code that can arrive in the data: the B-Ref spelling plus the
// NBA-standard alias, so both resolve.
const TEAMS: Record<string, Team> = {
  ATL: { abbr: "ATL", name: "Atlanta Hawks", espn: "atl" },
  BOS: { abbr: "BOS", name: "Boston Celtics", espn: "bos" },
  BRK: { abbr: "BKN", name: "Brooklyn Nets", espn: "bkn" },
  BKN: { abbr: "BKN", name: "Brooklyn Nets", espn: "bkn" },
  CHA: { abbr: "CHA", name: "Charlotte Hornets", espn: "cha" },
  CHO: { abbr: "CHA", name: "Charlotte Hornets", espn: "cha" },
  CHI: { abbr: "CHI", name: "Chicago Bulls", espn: "chi" },
  CLE: { abbr: "CLE", name: "Cleveland Cavaliers", espn: "cle" },
  DAL: { abbr: "DAL", name: "Dallas Mavericks", espn: "dal" },
  DEN: { abbr: "DEN", name: "Denver Nuggets", espn: "den" },
  DET: { abbr: "DET", name: "Detroit Pistons", espn: "det" },
  GSW: { abbr: "GSW", name: "Golden State Warriors", espn: "gsw" },
  HOU: { abbr: "HOU", name: "Houston Rockets", espn: "hou" },
  IND: { abbr: "IND", name: "Indiana Pacers", espn: "ind" },
  LAC: { abbr: "LAC", name: "Los Angeles Clippers", espn: "lac" },
  LAL: { abbr: "LAL", name: "Los Angeles Lakers", espn: "lal" },
  MEM: { abbr: "MEM", name: "Memphis Grizzlies", espn: "mem" },
  MIA: { abbr: "MIA", name: "Miami Heat", espn: "mia" },
  MIL: { abbr: "MIL", name: "Milwaukee Bucks", espn: "mil" },
  MIN: { abbr: "MIN", name: "Minnesota Timberwolves", espn: "min" },
  NOP: { abbr: "NOP", name: "New Orleans Pelicans", espn: "no" },
  NYK: { abbr: "NYK", name: "New York Knicks", espn: "nyk" },
  OKC: { abbr: "OKC", name: "Oklahoma City Thunder", espn: "okc" },
  ORL: { abbr: "ORL", name: "Orlando Magic", espn: "orl" },
  PHI: { abbr: "PHI", name: "Philadelphia 76ers", espn: "phi" },
  PHO: { abbr: "PHX", name: "Phoenix Suns", espn: "phx" },
  PHX: { abbr: "PHX", name: "Phoenix Suns", espn: "phx" },
  POR: { abbr: "POR", name: "Portland Trail Blazers", espn: "por" },
  SAC: { abbr: "SAC", name: "Sacramento Kings", espn: "sac" },
  SAS: { abbr: "SAS", name: "San Antonio Spurs", espn: "sas" },
  TOR: { abbr: "TOR", name: "Toronto Raptors", espn: "tor" },
  UTA: { abbr: "UTA", name: "Utah Jazz", espn: "utah" },
  WAS: { abbr: "WAS", name: "Washington Wizards", espn: "was" },
};

export interface TeamInfo {
  abbr: string;
  name: string;
  logo: string; // "" when the code is unknown
}

/** Resolve a raw team code to its NBA-standard abbreviation, full name, and logo
 * URL. Unknown codes degrade to the code itself with no logo. */
export function team(code: string | null | undefined): TeamInfo | null {
  if (!code) return null;
  const t = TEAMS[code] ?? TEAMS[code.toUpperCase()];
  if (!t) return { abbr: code, name: code, logo: "" };
  return {
    abbr: t.abbr,
    name: t.name,
    logo: `https://a.espncdn.com/i/teamlogos/nba/500/${t.espn}.png`,
  };
}

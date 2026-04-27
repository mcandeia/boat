// Resets-ranking scraper.
//
// Mu Patos publishes the top 99 by total resets (overall + per-class) at:
//   https://mupatos.com.br/site/rankings/resets
//   https://mupatos.com.br/site/rankings/resets?class={mg|fe|dk|dw|dl}
//
// Each ranking is a single page with a 99-row <table>. Each row:
//   <tr>
//     <td>{rank}</td>
//     <td>... <a href="/site/profile/character/{name}">{name}</a> ... </td>
//     <td>{class display name}</td>
//     <td>{guild}</td>
//     <td>{resets}</td>
//     <td>-</td>
//   </tr>
//
// We pull all six rankings per cron pass — chars not in the top 99 just
// won't show a rank.

const BROWSER_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
  "accept-encoding": "gzip, deflate, br",
  "sec-ch-ua": '"Chromium";v="124", "Not-A.Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
};

export const CLASS_CODES = ["mg", "fe", "dk", "dw", "dl"] as const;
export type ClassCode = typeof CLASS_CODES[number];

export interface RankEntry {
  rank: number;
  name: string;
  className: string;
  resets: number;
}

export type RankingMap = {
  overall: RankEntry[];
  byClass: Record<ClassCode, RankEntry[]>;
};

// Map a Mu Patos profile-page class string ("Magic Gladiator", "Soul Master",
// etc.) to the ranking-page class code. Returns null if we don't recognize
// the class — the char will only get an overall rank in that case.
export function classCodeFor(className: string | null): ClassCode | null {
  if (!className) return null;
  const c = className.toLowerCase();
  if (c.includes("gladiator") || c.includes("duel master")) return "mg";
  if (c.includes("elf")) return "fe";
  if (c.includes("knight") || c.includes("blade master") || c.includes("blade knight")) return "dk";
  if (c.includes("lord") || c.includes("emperor")) return "dl";
  if (c.includes("wizard") || c.includes("soul master") || c.includes("grand master")) return "dw";
  return null;
}

export async function fetchRankings(): Promise<RankingMap> {
  const overall = await fetchOne(null);
  const byClass = {} as Record<ClassCode, RankEntry[]>;
  // Sequential — politeness; 6 small fetches total.
  for (const code of CLASS_CODES) {
    byClass[code] = await fetchOne(code);
  }
  return { overall, byClass };
}

async function fetchOne(code: ClassCode | null): Promise<RankEntry[]> {
  const base = "https://mupatos.com.br/site/rankings/resets";
  const url = code ? `${base}?class=${code}` : base;
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (!res.ok) {
      console.log(`rankings ${code ?? "overall"}: HTTP ${res.status}`);
      return [];
    }
    return parseRankings(await res.text());
  } catch (err) {
    console.log(`rankings ${code ?? "overall"} fetch failed: ${(err as Error).message}`);
    return [];
  }
}

// Parse all <tr> rows that link to a character profile.
const ROW_RE = new RegExp(
  "<tr[^>]*>\\s*" +
    "<td>(\\d+)</td>\\s*" +                                             // rank
    "<td[^>]*>[\\s\\S]*?/profile/character/([^\"']+)\"[^>]*>([^<]+)</a>[\\s\\S]*?</td>\\s*" + // url-name + display name
    "<td[^>]*>([^<]*)</td>\\s*" +                                       // class
    "<td[^>]*>[\\s\\S]*?</td>\\s*" +                                    // guild (skipped)
    "<td[^>]*>(\\d+)</td>",                                             // resets
  "gi",
);

export function parseRankings(html: string): RankEntry[] {
  const out: RankEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = ROW_RE.exec(html)) !== null) {
    out.push({
      rank: Number(m[1]),
      name: m[3].trim(),
      className: m[4].replace(/<[^>]+>/g, "").trim(),
      resets: Number(m[5]),
    });
  }
  return out;
}

// Find a character in a ranking list by case-insensitive name match.
// Returns the entry's rank and the entry one rank above ("next target") —
// or null if the char isn't in the list.
export function findRank(list: RankEntry[], name: string):
  | { rank: number; nextTarget: RankEntry | null }
  | null {
  const lower = name.toLowerCase();
  const idx = list.findIndex((e) => e.name.toLowerCase() === lower);
  if (idx === -1) return null;
  return {
    rank: list[idx].rank,
    nextTarget: idx > 0 ? list[idx - 1] : null,
  };
}

import type { Env, ProfileSnapshot } from "./types";

// mupatos.com.br is fronted by Cloudflare/LiteSpeed and 403s most clients,
// but we discovered it accepts requests that include the modern Chrome
// client-hint headers (sec-ch-ua*, sec-fetch-*) — even from CF Workers.
// So we just use plain fetch() with a complete browser-shaped header set.
// No Browser Rendering, no quota worries, ~2 s per scrape.

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

export async function scrapeMany(
  env: Env,
  names: string[],
  options: { totalTimeoutMs?: number } = {},
): Promise<Map<string, ProfileSnapshot>> {
  const result = new Map<string, ProfileSnapshot>();
  if (names.length === 0) return result;

  // Per-character timeout — small enough that the total pass stays bounded
  // even with several characters. We run them sequentially; concurrent
  // fetch() to the same origin would be polite-by-default but we keep it
  // simple.
  const perCharTimeoutMs = Math.min(options.totalTimeoutMs ?? 25_000, 15_000);

  for (const name of names) {
    const url = `${env.PROFILE_BASE_URL}/${encodeURIComponent(name)}`;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), perCharTimeoutMs);
      const res = await fetch(url, { headers: BROWSER_HEADERS, signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) {
        console.log(`scrape ${name}: HTTP ${res.status}`);
        result.set(name, emptySnapshot(name));
        continue;
      }
      const html = await res.text();
      result.set(name, parseProfile(html, name));
    } catch (err) {
      console.log(`scrape ${name} failed: ${(err as Error).message}`);
      result.set(name, emptySnapshot(name));
    }
  }
  return result;
}

export async function scrapeOne(
  env: Env,
  name: string,
  options: { totalTimeoutMs?: number } = {},
): Promise<ProfileSnapshot> {
  const map = await scrapeMany(env, [name], options);
  return map.get(name) ?? emptySnapshot(name);
}

function emptySnapshot(name: string): ProfileSnapshot {
  return {
    name,
    class: null,
    resets: null,
    level: null,
    map: null,
    mapName: null,
    mapX: null,
    mapY: null,
    status: null,
    exists: false,
    scraped: false,
  };
}

// "Stadium (47/35)" -> { name: "Stadium", x: 47, y: 35 }
export function parseMap(s: string | null): { name: string | null; x: number | null; y: number | null } {
  if (!s) return { name: null, x: null, y: null };
  const coord = s.match(/\((\d+)\s*\/\s*(\d+)\)/);
  const x = coord ? Number(coord[1]) : null;
  const y = coord ? Number(coord[2]) : null;
  const name = s.replace(/\([^)]*\)/, "").trim() || null;
  return { name, x, y };
}

// The page emits a single <table class="table table-striped"> with rows like:
//   <tr><td>Personagem</td><td>daddy</td></tr>
//   <tr><td>Classe</td><td>Magic Gladiator</td></tr>
//   <tr><td>Resets</td><td>25</td></tr>
//   <tr><td>Level</td><td>345</td></tr>
//   <tr><td>Mapa</td><td>Stadium  (47/35)</td></tr>
//   <tr><td>Situação</td><td><span class="text-success">Online</span></td></tr>
//
// "exists" is true if we found at least one labelled row; non-existent
// names render a different page (no profile table).
export function parseProfile(html: string, name: string): ProfileSnapshot {
  const snap: ProfileSnapshot = {
    name,
    class: null,
    resets: null,
    level: null,
    map: null,
    mapName: null,
    mapX: null,
    mapY: null,
    status: null,
    exists: false,
    scraped: true,
  };

  const get = (label: RegExp): string | null => {
    const re = new RegExp(`<td[^>]*>\\s*${label.source}\\s*</td>\\s*<td[^>]*>([\\s\\S]*?)</td>`, "i");
    const m = html.match(re);
    if (!m) return null;
    const text = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return text || null;
  };

  const cls = get(/Classe/);
  const resets = get(/Resets/);
  const level = get(/Level/);
  const map = get(/Mapa/);
  const status = get(/Situa[cç][aã]o/);

  if (cls) snap.class = cls;
  if (resets) snap.resets = parseIntOrNull(resets);
  if (level) snap.level = parseIntOrNull(level);
  if (map) {
    snap.map = map;
    const parsed = parseMap(map);
    snap.mapName = parsed.name;
    snap.mapX = parsed.x;
    snap.mapY = parsed.y;
  }
  if (status) {
    const lower = status.toLowerCase();
    snap.status = lower.startsWith("on") ? "Online" : lower.startsWith("off") ? "Offline" : null;
  }

  snap.exists = !!(cls || level || map || status);
  return snap;
}

function parseIntOrNull(s: string): number | null {
  const m = s.match(/\d+/);
  return m ? Number(m[0]) : null;
}

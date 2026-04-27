import puppeteer from "@cloudflare/puppeteer";
import type { Env, ProfileSnapshot } from "./types";

// mupatos.com.br is fronted by LiteSpeed AI guard which 403s plain fetch().
// Cloudflare Browser Rendering gives us a real Chromium session that passes.
//
// We open one browser per scrape pass, scrape every requested character on the
// same page (sequentially, reusing the page context), then close it. That keeps
// the cron job under a few seconds and conserves the Browser Rendering budget.

export async function scrapeMany(
  env: Env,
  names: string[],
  options: { totalTimeoutMs?: number } = {},
): Promise<Map<string, ProfileSnapshot>> {
  const result = new Map<string, ProfileSnapshot>();
  if (names.length === 0) return result;

  const totalTimeoutMs = options.totalTimeoutMs ?? 25_000;
  const work = (async () => {
    const browser = await puppeteer.launch(env.BROWSER);
    try {
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      );
      await page.setViewport({ width: 1280, height: 800 });

      for (const name of names) {
        const url = `${env.PROFILE_BASE_URL}/${encodeURIComponent(name)}`;
        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
          const html = await page.content();
          result.set(name, parseProfile(html, name));
        } catch (err) {
          console.log(`scrape error for ${name}: ${(err as Error).message}`);
          result.set(name, emptySnapshot(name));
        }
      }
    } finally {
      await browser.close().catch(() => {});
    }
  })();

  // Wall-clock budget for the whole scrape pass. If we blow through it (cold
  // Browser Rendering, Mu Patos slow, etc.), bail and let the caller fall back
  // to whatever default they want — partial results stay in `result`.
  await Promise.race([
    work,
    new Promise<void>((resolve) => setTimeout(() => {
      console.log(`scrape pass timed out after ${totalTimeoutMs}ms (names=${names.join(",")})`);
      resolve();
    }, totalTimeoutMs)),
  ]);
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
// "Stadium" (no coords) -> { name: "Stadium", x: null, y: null }
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
// "exists" is true if we found at least one of the labelled rows; non-existent
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
    scraped: true,             // we got HTML; only `exists` decides whether the char is real
  };

  const get = (label: RegExp): string | null => {
    const re = new RegExp(`<td[^>]*>\\s*${label.source}\\s*</td>\\s*<td[^>]*>([\\s\\S]*?)</td>`, "i");
    const m = html.match(re);
    if (!m) return null;
    // Strip nested HTML tags and collapse whitespace.
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


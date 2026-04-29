import type { Env } from "./types";
import { now } from "./util";

// Items that aren't (always) in shop-gold but matter for trading: jewels
// drop in-game, event tickets are transitive, common pets/wings appear
// in player-to-player trades. Image URLs left null — Mercado renders the
// title without a thumbnail when image_url is missing.
const STATIC_ITEMS: Array<{ slug: string; name: string; category: string }> = [
  { slug: "jewel-of-soul",     name: "Jewel of Soul",       category: "jewels" },
  { slug: "jewel-of-life",     name: "Jewel of Life",       category: "jewels" },
  { slug: "jewel-of-bless",    name: "Jewel of Bless",      category: "jewels" },
  { slug: "jewel-of-chaos",    name: "Jewel of Chaos",      category: "jewels" },
  { slug: "jewel-of-creation", name: "Jewel of Creation",   category: "jewels" },
  { slug: "jewel-of-harmony",  name: "Jewel of Harmony",    category: "jewels" },
  { slug: "jewel-of-guardian", name: "Jewel of Guardian",   category: "jewels" },
  { slug: "armor-of-guardsman",name: "Armor of Guardsman",  category: "event-tickets" },
  { slug: "invisibility-cloak",name: "Invisibility Cloak",  category: "event-tickets" },
  { slug: "devils-invitation", name: "Devil's Invitation",  category: "event-tickets" },
  { slug: "scroll-of-blood",   name: "Scroll of Blood",     category: "event-tickets" },
  { slug: "dark-horse",        name: "Dark Horse",          category: "pets" },
  { slug: "dark-raven",        name: "Dark Raven",          category: "pets" },
  { slug: "demon-pet",         name: "Demon (pet)",         category: "pets" },
  { slug: "spirit-of-guardian",name: "Spirit of Guardian",  category: "pets" },
  { slug: "dinorant",          name: "Dinorant",            category: "pets" },
  { slug: "fenrir",            name: "Fenrir",              category: "pets" },
];

// Scrape mupatos.com.br/site/shop/shop-gold + each category page to seed
// the items table. The shop renders without login; the per-item options
// page DOES need login, but we don't need it — the index pages have name
// + image + category, which is plenty for the Mercado autocomplete.
//
// Page structure (observed):
//   index: <a href="/site/shop/shop-gold/<category-slug>" ...>Category Name</a>
//   per-category: <div class="card h-100">
//                   <div class="card-header webshop-product-name">Item Name</div>
//                   <img class="img-fluid" src="/site/resources/.../X.webp" />
//                   <a href="/site/shop/shop-gold/<cat>/<item-slug>">+ detalhes</a>
//                 </div>

const SHOP_BASE = "https://mupatos.com.br";
const INDEX_URL = SHOP_BASE + "/site/shop/shop-gold";

const BROWSER_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
  "sec-ch-ua": '"Chromium";v="124", "Not-A.Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
};

async function fetchHtml(url: string, timeoutMs = 12_000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: ctrl.signal });
    if (!res.ok) throw new Error(url + " HTTP " + res.status);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

interface ScrapedItem {
  slug: string;
  name: string;
  category: string;
  image_url: string | null;
}

function parseCategorySlugs(html: string): string[] {
  // Anchor matches: href="/site/shop/shop-gold/<slug>" with no extra '/' after.
  const re = /href="\/site\/shop\/shop-gold\/([a-z0-9][a-z0-9\-]*)"/gi;
  const slugs = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    slugs.add(m[1]);
  }
  return [...slugs];
}

function parseItemsForCategory(html: string, category: string): ScrapedItem[] {
  // Cards look like:
  //   <div class="card h-100">
  //     <div class="card-header webshop-product-name"> NAME </div>
  //     ...<img class="img-fluid" src="REL" />...
  //     <a href="/site/shop/shop-gold/CAT/SLUG" class="btn ...">+ detalhes</a>
  //   </div>
  const items: ScrapedItem[] = [];
  const cardRe = /<div class="card h-100">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
  const nameRe = /<div class="card-header webshop-product-name">\s*([\s\S]*?)\s*<\/div>/i;
  const imgRe  = /<img[^>]*class="img-fluid"[^>]*src="([^"]+)"/i;
  const slugRe = new RegExp('href="/site/shop/shop-gold/' + category + '/([a-z0-9\\-]+)"', "i");

  let m: RegExpExecArray | null;
  while ((m = cardRe.exec(html)) !== null) {
    const block = m[0];
    const nameMatch = block.match(nameRe);
    const imgMatch = block.match(imgRe);
    const slugMatch = block.match(slugRe);
    if (!nameMatch || !slugMatch) continue;
    const name = nameMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const slug = slugMatch[1];
    if (!name || !slug) continue;
    const imgRel = imgMatch ? imgMatch[1] : null;
    items.push({
      slug,
      name,
      category,
      image_url: imgRel ? (imgRel.startsWith("http") ? imgRel : SHOP_BASE + imgRel) : null,
    });
  }
  return items;
}

export async function refreshCatalog(env: Env): Promise<{ scraped: number; categories: number }> {
  const indexHtml = await fetchHtml(INDEX_URL);
  const slugs = parseCategorySlugs(indexHtml);

  // All categories in parallel — keeps wallclock close to the slowest
  // single page (~5s) instead of (chunks * slowest). CF paid plan handles
  // a few dozen concurrent subrequests easily.
  const results = await Promise.all(slugs.map(async (cat) => {
    try {
      const html = await fetchHtml(SHOP_BASE + "/site/shop/shop-gold/" + cat);
      return parseItemsForCategory(html, cat);
    } catch (e) {
      console.log("catalog scrape failed cat=" + cat + " err=" + (e as Error).message);
      return [];
    }
  }));
  const all: ScrapedItem[] = [];
  for (const arr of results) all.push(...arr);

  const t = now();
  // Upsert scraped items.
  const stmt = env.DB.prepare(
    "INSERT INTO items (slug, name, category, image_url, updated_at) VALUES (?, ?, ?, ?, ?) " +
    "ON CONFLICT(slug) DO UPDATE SET name = excluded.name, category = excluded.category, image_url = excluded.image_url, updated_at = excluded.updated_at",
  );
  const scrapedBatch = all.map((it) => stmt.bind(it.slug, it.name, it.category, it.image_url, t));
  if (scrapedBatch.length > 0) await env.DB.batch(scrapedBatch);

  // Always seed the static fallback (jewels, tickets, pets) — INSERT OR
  // IGNORE so we don't clobber an entry that the shop scrape already
  // returned (with a real image).
  const seedStmt = env.DB.prepare(
    "INSERT OR IGNORE INTO items (slug, name, category, image_url, updated_at) VALUES (?, ?, ?, NULL, ?)",
  );
  await env.DB.batch(STATIC_ITEMS.map((it) => seedStmt.bind(it.slug, it.name, it.category, t)));

  return { scraped: all.length + STATIC_ITEMS.length, categories: slugs.length };
}

// Lazy-seed the catalog if the items table is (mostly) empty. Idempotent —
// repeat calls are cheap when the catalog is already populated. Used by
// the Mercado UI when it loads, so the user never has to think about it.
export async function ensureCatalog(env: Env): Promise<{ count: number; seeded: boolean }> {
  const cnt = await env.DB
    .prepare("SELECT COUNT(*) AS n FROM items")
    .first<{ n: number }>();
  const n = cnt?.n ?? 0;
  if (n >= 50) return { count: n, seeded: false };

  // Race-prevention: a concurrent caller will see a partial table here,
  // but refreshCatalog is upsert-based so duplicates resolve cleanly.
  await refreshCatalog(env);
  const after = await env.DB
    .prepare("SELECT COUNT(*) AS n FROM items")
    .first<{ n: number }>();
  return { count: after?.n ?? 0, seeded: true };
}

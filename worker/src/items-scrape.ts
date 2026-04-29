import type { Env } from "./types";
import { now } from "./util";

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

async function fetchHtml(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);
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

  const all: ScrapedItem[] = [];
  // Fan out in chunks of 5 — polite, well within CF subrequest budget.
  for (let i = 0; i < slugs.length; i += 5) {
    const batch = slugs.slice(i, i + 5);
    const results = await Promise.all(batch.map(async (cat) => {
      try {
        const html = await fetchHtml(SHOP_BASE + "/site/shop/shop-gold/" + cat);
        return parseItemsForCategory(html, cat);
      } catch (e) {
        console.log("catalog scrape failed cat=" + cat + " err=" + (e as Error).message);
        return [];
      }
    }));
    for (const arr of results) all.push(...arr);
  }

  const t = now();
  // Upsert each item — small batches so we don't blow the D1 statement count.
  const stmt = env.DB.prepare(
    "INSERT INTO items (slug, name, category, image_url, updated_at) VALUES (?, ?, ?, ?, ?) " +
    "ON CONFLICT(slug) DO UPDATE SET name = excluded.name, category = excluded.category, image_url = excluded.image_url, updated_at = excluded.updated_at",
  );
  const batch = all.map((it) => stmt.bind(it.slug, it.name, it.category, it.image_url, t));
  if (batch.length > 0) await env.DB.batch(batch);

  return { scraped: all.length, categories: slugs.length };
}

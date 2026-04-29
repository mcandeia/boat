import type { Env } from "./types";
import { now } from "./util";

// Mupatos origin. Defined at the very top of the module because
// STATIC_ITEMS / setPieces / spriteUrl below all reference it during
// the module's top-level initialization — a previous reorder put the
// declaration further down and SHOP_BASE was in the TDZ when those
// initializers ran, which silently produced "undefined/site/..." URLs
// in the database.
const SHOP_BASE = "https://mupatos.com.br";
const SHOPS = ["shop-gold", "rarius", "rings-pendants"];

// Items that aren't (always) in the mupatos shops but matter for
// trading: jewels drop in-game, event tickets are transitive, common
// pets/wings appear in player-to-player trades. Plus mid-tier armor
// sets (Storm Crow et al) that aren't sold in any shop. Image URLs
// left null — Mercado renders the title without a thumbnail when
// image_url is missing.
// MU Online sprite slot types (helm/armor/pants/gloves/boots) — same
// across servers using s6 spec, including mupatos. The static fallback
// uses these to point at images mupatos.com.br already hosts.
const PIECE_SLOTS = [
  { type: 7,  name: "Helm" },
  { type: 8,  name: "Armor" },
  { type: 9,  name: "Pants" },
  { type: 10, name: "Gloves" },
  { type: 11, name: "Boots" },
];
function spriteUrl(type: number, id: number): string {
  return SHOP_BASE + "/site/resources/images/items/" + type + "/" + id + ".webp";
}
function setPieces(
  setName: string,
  slugBase: string,
  spriteId?: number,
): Array<{ slug: string; name: string; category: string; image_url: string | null }> {
  return PIECE_SLOTS.map((s) => ({
    slug: slugBase + "-" + s.name.toLowerCase(),
    name: setName + " " + s.name,
    category: "sets-extra",
    image_url: spriteId != null ? spriteUrl(s.type, spriteId) : null,
  }));
}

const STATIC_ITEMS: Array<{ slug: string; name: string; category: string; image_url: string | null }> = [
  { slug: "jewel-of-soul",     name: "Jewel of Soul",       category: "jewels", image_url: null },
  { slug: "jewel-of-life",     name: "Jewel of Life",       category: "jewels", image_url: null },
  { slug: "jewel-of-bless",    name: "Jewel of Bless",      category: "jewels", image_url: null },
  { slug: "jewel-of-chaos",    name: "Jewel of Chaos",      category: "jewels", image_url: null },
  { slug: "jewel-of-creation", name: "Jewel of Creation",   category: "jewels", image_url: null },
  { slug: "jewel-of-harmony",  name: "Jewel of Harmony",    category: "jewels", image_url: null },
  { slug: "jewel-of-guardian", name: "Jewel of Guardian",   category: "jewels", image_url: null },
  { slug: "armor-of-guardsman",name: "Armor of Guardsman",  category: "event-tickets", image_url: null },
  { slug: "invisibility-cloak",name: "Invisibility Cloak",  category: "event-tickets", image_url: null },
  { slug: "devils-invitation", name: "Devil's Invitation",  category: "event-tickets", image_url: null },
  { slug: "scroll-of-blood",   name: "Scroll of Blood",     category: "event-tickets", image_url: null },
  { slug: "dark-horse",        name: "Dark Horse",          category: "pets", image_url: null },
  { slug: "dark-raven",        name: "Dark Raven",          category: "pets", image_url: null },
  { slug: "demon-pet",         name: "Demon (pet)",         category: "pets", image_url: null },
  { slug: "spirit-of-guardian",name: "Spirit of Guardian",  category: "pets", image_url: null },
  { slug: "dinorant",          name: "Dinorant",            category: "pets", image_url: null },
  { slug: "fenrir",            name: "Fenrir",              category: "pets", image_url: null },
  // Mid-tier armor sets that aren't in any shop (drop / craft only).
  // Sprite IDs follow MU Online s6 standard; mupatos hosts each at
  // /site/resources/images/items/<slot>/<id>.webp. Only sprite IDs we're
  // confident about get baked in — the rest fall back to text-only.
  ...setPieces("Bronze",            "bronze",            0),
  ...setPieces("Dragon",            "dragon",            1),  // DK
  ...setPieces("Pad",               "pad",               2),
  ...setPieces("Legendary",         "legendary",         3),  // DW low
  ...setPieces("Bone",              "bone",              4),
  ...setPieces("Leather",           "leather",           5),
  ...setPieces("Scale",             "scale",             6),  // DK
  ...setPieces("Sphinx",            "sphinx",            7),  // DW
  ...setPieces("Brass",             "brass",             8),  // DK
  ...setPieces("Plate",             "plate",             9),  // DK
  ...setPieces("Vine",              "vine",              10), // Elf low
  ...setPieces("Silk",              "silk",              11), // Elf mid
  ...setPieces("Wind",              "wind",              12), // Elf high
  ...setPieces("Storm Crow",        "storm-crow",        13), // MG
  ...setPieces("Adventurer",        "adventurer",        14), // Elf
  ...setPieces("Light Plate",       "light-plate",       15), // DK
  ...setPieces("Black Dragon",      "black-dragon",      16),
  ...setPieces("Dark Phoenix",      "dark-phoenix",      17),
  ...setPieces("Grand Soul",        "grand-soul",        18), // DW
  ...setPieces("Divine",            "divine",            19), // Elf
  ...setPieces("Thunder Hawk",      "thunder-hawk",      20),
  ...setPieces("Great Dragon",      "great-dragon",      21), // BK
  ...setPieces("Dark Soul",         "dark-soul",         22), // DW
  ...setPieces("Hurricane",         "hurricane",         23),
  ...setPieces("Red Spirit",        "red-spirit",        24),
  ...setPieces("Iris",              "iris",              25),
  ...setPieces("Valiant",           "valiant",           26),
  ...setPieces("Sunlight",          "sunlight",          27),
  // Sets without a confident sprite mapping — name only.
  ...setPieces("Mist",              "mist"),
  ...setPieces("Eclipse",           "eclipse"),
  ...setPieces("Hyon Dragon",       "hyon-dragon"),
  ...setPieces("Piercing Grove",    "piercing-grove"),
  ...setPieces("Phoenix Soul",      "phoenix-soul"),
  ...setPieces("Storm Roar",        "storm-roar"),
  ...setPieces("Storm Reign",       "storm-reign"),
  ...setPieces("Ashcrow",           "ashcrow"),
  ...setPieces("Glorious",          "glorious"),
  ...setPieces("Brave",             "brave"),
  ...setPieces("Tower",             "tower"),
  ...setPieces("Pad of Greatness",  "pad-greatness"),
  ...setPieces("Robe of Wizardry",  "robe-wizardry"),
];

// Scrape every mupatos shop (shop-gold, rarius, rings-pendants) to seed
// the items table. The shop renders without login; the per-item options
// page DOES need login, but we don't need it — the index pages have name
// + image + category, which is plenty for the Mercado autocomplete.
//
// Page structure (observed):
//   per-shop index: <a href="/site/shop/<shop>/<category-slug>" ...>Cat</a>
//   per-category:   <div class="card h-100">
//                     <div class="card-header webshop-product-name">Item Name</div>
//                     <img class="img-fluid" src="/site/resources/.../X.webp" />
//                     <a href="/site/shop/<shop>/<cat>/<item-slug>">+ detalhes</a>
//                   </div>

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
  detail_url: string;
  shop: string;
}

function parseCategorySlugs(html: string, shop: string): string[] {
  // Anchor matches: href="/site/shop/<shop>/<slug>" with no extra '/' after.
  const re = new RegExp('href="\\/site\\/shop\\/' + shop + '\\/([a-z0-9][a-z0-9\\-]*)"', "gi");
  const slugs = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    slugs.add(m[1]);
  }
  return [...slugs];
}

function parseItemsForCategory(html: string, category: string, shop: string): ScrapedItem[] {
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
  const slugRe = new RegExp('href="/site/shop/' + shop + '/' + category + '/([a-z0-9\\-]+)"', "i");

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
      detail_url: SHOP_BASE + "/site/shop/" + shop + "/" + category + "/" + slug,
      shop,
    });
  }
  return items;
}

export async function refreshCatalog(env: Env): Promise<{ scraped: number; categories: number; shops: number; rules_upserted: number }> {
  // Fetch each shop's index in parallel, collect (shop, category) pairs.
  const shopIndices = await Promise.all(SHOPS.map(async (shop) => {
    try {
      const html = await fetchHtml(SHOP_BASE + "/site/shop/" + shop);
      return { shop, slugs: parseCategorySlugs(html, shop) };
    } catch (e) {
      console.log("shop index scrape failed shop=" + shop + " err=" + (e as Error).message);
      return { shop, slugs: [] };
    }
  }));
  const pairs: Array<{ shop: string; cat: string }> = [];
  for (const { shop, slugs } of shopIndices) for (const cat of slugs) pairs.push({ shop, cat });

  // All categories across all shops in parallel — wallclock ≈ slowest page.
  const results = await Promise.all(pairs.map(async ({ shop, cat }) => {
    try {
      const html = await fetchHtml(SHOP_BASE + "/site/shop/" + shop + "/" + cat);
      return parseItemsForCategory(html, cat, shop);
    } catch (e) {
      console.log("catalog scrape failed shop=" + shop + " cat=" + cat + " err=" + (e as Error).message);
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

  // Persist detail links so we can scrape logged per-item option pages later.
  const srcStmt = env.DB.prepare(
    "INSERT INTO item_sources (item_slug, shop, category, detail_url, updated_at) VALUES (?, ?, ?, ?, ?) " +
    "ON CONFLICT(item_slug, shop) DO UPDATE SET " +
    "  category = excluded.category, " +
    "  detail_url = excluded.detail_url, " +
    "  updated_at = excluded.updated_at",
  );
  const srcBatch = all.map((it) => srcStmt.bind(it.slug, it.shop, it.category, it.detail_url, t));
  if (srcBatch.length > 0) await env.DB.batch(srcBatch);

  // Seed the static fallback. Always overwrite image_url with whatever
  // the array currently says — no COALESCE — because we've shipped at
  // least one bad version of this seed (SHOP_BASE was in the TDZ at
  // module init, persisting "undefined/..." URLs). Static slugs don't
  // collide with shop-scraped slugs, so unconditional overwrite is safe.
  const seedStmt = env.DB.prepare(
    "INSERT INTO items (slug, name, category, image_url, updated_at) VALUES (?, ?, ?, ?, ?) " +
    "ON CONFLICT(slug) DO UPDATE SET " +
    "  name = excluded.name, category = excluded.category, " +
    "  image_url = excluded.image_url, " +
    "  updated_at = excluded.updated_at",
  );
  await env.DB.batch(STATIC_ITEMS.map((it) => seedStmt.bind(it.slug, it.name, it.category, it.image_url, t)));

  // Seed/update item_rules from the catalog so the Mercado can enforce a
  // deterministic baseline even before server-specific rules are imported.
  // We keep it conservative: Harmony defaults to false; everything else true.
  // Any later imports (server rules / shop scrape) overwrite these rows.
  let rulesUpserted = 0;
  try {
    const lifeJson = JSON.stringify([4, 8, 12, 16, 20, 24, 28]);
    const emptyJson = JSON.stringify([]);
    // 1) Update existing rules matched by slug (name) to attach item_slug.
    await env.DB.prepare(
      "UPDATE item_rules " +
      "   SET item_slug = (SELECT slug FROM items i WHERE lower(trim(i.name)) = item_rules.slug LIMIT 1), " +
      "       kind = (SELECT category FROM items i WHERE lower(trim(i.name)) = item_rules.slug LIMIT 1), " +
      "       name = (SELECT name FROM items i WHERE lower(trim(i.name)) = item_rules.slug LIMIT 1), " +
      "       updated_at = ? " +
      " WHERE item_slug IS NULL " +
      "   AND EXISTS (SELECT 1 FROM items i WHERE lower(trim(i.name)) = item_rules.slug)",
    ).bind(t).run();

    // 2) Insert new baseline rules for items that don't have a rule yet.
    const rr = await env.DB.prepare(
      "INSERT INTO item_rules " +
      "(slug, item_slug, name, kind, allow_excellent, allow_luck, allow_skill, allow_life, allow_harmony, life_values, harmony_values, excellent_values, updated_at) " +
      "SELECT lower(trim(name)) AS slug, items.slug AS item_slug, name, category AS kind, 1, 1, 1, 1, 0, ?, ?, ?, ? " +
      "  FROM items " +
      " WHERE NOT EXISTS (SELECT 1 FROM item_rules r WHERE r.item_slug = items.slug OR r.slug = lower(trim(items.name)))",
    ).bind(lifeJson, emptyJson, emptyJson, t).run();
    rulesUpserted = rr.meta.changes ?? 0;
  } catch (e) {
    console.log("item_rules seed skipped: " + (e as Error).message);
  }

  return { scraped: all.length + STATIC_ITEMS.length, categories: pairs.length, shops: SHOPS.length, rules_upserted: rulesUpserted };
}

// Lazy-seed the catalog. Triggers refreshCatalog when:
//   - the items table is (nearly) empty, OR
//   - older shops aren't represented yet (first deploy after we widened
//     the scrape from shop-gold to all three shops). The category prefix
//     check is a cheap upgrade signal that avoids a forced version table.
// Idempotent — repeat calls are no-ops once the catalog is healthy.
export async function ensureCatalog(env: Env): Promise<{ count: number; seeded: boolean }> {
  const cnt = await env.DB
    .prepare("SELECT COUNT(*) AS n FROM items")
    .first<{ n: number }>();
  const n = cnt?.n ?? 0;
  const hasRarius = await env.DB
    .prepare("SELECT 1 AS x FROM items WHERE category LIKE 'classic-%' LIMIT 1")
    .first<{ x: number }>();
  const hasRings = await env.DB
    .prepare("SELECT 1 AS x FROM items WHERE category LIKE 'rings-pendants-%' LIMIT 1")
    .first<{ x: number }>();
  // After a deploy that adds sprite URLs to the static seed, existing
  // rows still hold image_url=NULL (or worse — "undefined/..." from a
  // bad previous deploy). Use storm-crow-helm as a canary: refresh
  // whenever its URL is missing or doesn't look like a real https URL.
  const canary = await env.DB
    .prepare("SELECT image_url FROM items WHERE slug = 'storm-crow-helm'")
    .first<{ image_url: string | null }>();
  const canaryUrl = canary?.image_url ?? "";
  const needsSpriteRefresh = !canaryUrl || !canaryUrl.startsWith("https://");
  if (n >= 50 && hasRarius && hasRings && !needsSpriteRefresh) return { count: n, seeded: false };

  await refreshCatalog(env);
  const after = await env.DB
    .prepare("SELECT COUNT(*) AS n FROM items")
    .first<{ n: number }>();
  return { count: after?.n ?? 0, seeded: true };
}

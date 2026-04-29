import type { Env } from "./types";

export type ShopItemRule = {
  name: string;
  item_slug?: string | null;
  kind?: string | null;
  options?: {
    excellent?: boolean;
    luck?: boolean;
    skill?: boolean;
    life?: boolean;
    harmony?: boolean;
  };
  suggested?: {
    life_values?: number[];
    harmony_values?: string[];
  };
  excellent_values?: string[];
  ancient_values?: string[];
};

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|h\d|br|tr|td)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function isLoginPage(text: string): boolean {
  // MuPatos sometimes renders login strings with/without accents and can vary
  // copy slightly; detect by multiple signals to avoid parsing the login page
  // as if it were a product page (which would yield empty excellent/ancient).
  const t = text.toLowerCase();
  const hasUser = t.includes("usuário") || t.includes("usuario") || t.includes("username");
  const hasPass = t.includes("senha") || t.includes("password");
  const hasLoginWord = t.includes("login") || t.includes("entrar") || t.includes("acessar");
  const hasForgot = t.includes("forgot-password") || t.includes("esqueci") || t.includes("recuperar");
  return (hasLoginWord && hasUser && hasPass) || (hasPass && hasForgot);
}

function pickName(html: string): string | null {
  // Try common meta first, then fallback to any standalone title in stripped text.
  const og = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
  if (og) {
    const v = og.trim();
    if (!/mupatos/i.test(v)) return v;
  }
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  if (title) {
    const v = title.replace(/\s+/g, " ").trim();
    if (!/mupatos/i.test(v)) return v.replace(/MuPatos.*$/i, "").trim();
  }
  return null;
}

function extractShopItemName(html: string): string | null {
  // The shop product page has a visible product name; capture common patterns.
  // Example observed: a block with the item name near the image/card header.
  const m1 = html.match(/<div[^>]*class="card-header[^"]*webshop-product-name[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/div>/i)?.[1];
  if (m1) return m1.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const m2 = html.match(/<h1[^>]*>\s*([\s\S]*?)\s*<\/h1>/i)?.[1];
  if (m2) return m2.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return null;
}

function extractExcellentOptionsFromText(text: string): string[] {
  // Heuristic: locate "EXCELLENT" and then capture next bullet-ish lines.
  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  const idx = lines.findIndex((l) => {
    const u = l.toUpperCase();
    return u === "EXCELLENT" || u === "EXCELENTE";
  });
  if (idx < 0) return [];
  const out: string[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    if (l.toUpperCase() === "CUPON DE DESCONTO" || l.toUpperCase() === "BASIC") break;
    // Skip non-option UI labels.
    if (/^(level|option|ancient|luck)$/i.test(l)) continue;
    if (/^disponível para$/i.test(l)) continue;
    // The shop tends to use readable strings for options; keep short-ish.
    if (l.length > 2 && l.length < 80) out.push(l);
    if (out.length >= 12) break;
  }
  // Remove obvious duplicates.
  return [...new Set(out)];
}

function extractAncientSetsFromText(text: string): string[] {
  // Heuristic: locate "ANCIENT" label and capture next short lines until a new section.
  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  const idx = lines.findIndex((l) => l.toUpperCase() === "ANCIENT");
  if (idx < 0) return [];
  const out: string[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    const up = l.toUpperCase();
    if (up === "CUPON DE DESCONTO" || up === "BASIC" || up === "EXCELLENT") break;
    if (/^(level|option|ancient|luck)$/i.test(l)) continue;
    if (/^disponível para$/i.test(l)) continue;
    // Many shops show just the set name (e.g. "Gaion", "Anonymous", "Hyon").
    if (l.length >= 2 && l.length <= 40) {
      out.push(l.replace(/\s*\+\s*(?:5|10)\s*$/i, "").trim());
    }
    if (out.length >= 12) break;
  }
  return [...new Set(out)];
}

function extractAncientSetsFromHtml(html: string): string[] {
  // Prefer parsing the Ancient <select> options when available.
  // Many shop pages render an "Ancient" selector with option texts like:
  //   <option>Gaion +5</option>
  // We match select elements whose id/name mentions ancient.
  const blocks: string[] = [];
  const re = /<select[^>]*(?:id|name)=["'][^"']*ancient[^"']*["'][\s\S]*?<\/select>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    blocks.push(m[0]);
    if (blocks.length >= 5) break;
  }
  const out: string[] = [];
  for (const b of blocks) {
    const opts = b.match(/<option[^>]*>([\s\S]*?)<\/option>/gi) ?? [];
    for (const o of opts) {
      const txt = o.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (!txt || txt === "—" || /^selecion/i.test(txt)) continue;
      out.push(txt.replace(/\s*\+\s*(?:5|10)\s*$/i, "").trim());
    }
  }
  return [...new Set(out)].slice(0, 20);
}

export function parseShopItemRuleFromHtml(html: string, fallbackName?: string): { rule: ShopItemRule } | { error: string } {
  const text = stripTags(html);
  if (isLoginPage(text)) {
    return { error: "a loja retornou página de login (precisa estar autenticado ou enviar HTML já logado)" };
  }
  const name = (extractShopItemName(html) || fallbackName || pickName(html) || "").trim();
  if (!name) return { error: "não consegui extrair o nome do item da página" };

  const exc = extractExcellentOptionsFromText(text);
  const ancientSets = [...new Set([...extractAncientSetsFromHtml(html), ...extractAncientSetsFromText(text)])];
  const hasLuck = /\bluck\b/i.test(text);
  const hasOption = /\boption\b/i.test(text);
  const hasExcellent = exc.length > 0;

  // For the shop UI, "Option" corresponds to the Life add-option slider.
  const allowLife = hasOption;

  return {
    rule: {
      name,
      kind: null,
      options: {
        excellent: hasExcellent,
        luck: hasLuck,
        // Skill/harmony are not represented reliably on the shop UI; keep false until server rules overwrite.
        skill: false,
        life: allowLife,
        harmony: false,
      },
      suggested: {
        life_values: allowLife ? [4, 8, 12, 16, 20, 24, 28] : [],
        harmony_values: [],
      },
      excellent_values: exc,
      ancient_values: ancientSets,
    },
  };
}

export async function fetchShopItemHtml(url: string): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  if (!/^https:\/\/mupatos\.com\.br\/site\/shop\//i.test(url)) {
    return { ok: false, error: "url inválida (precisa ser mupatos.com.br/site/shop/...)" };
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, error: "upstream " + res.status };
    const html = await res.text();
    return { ok: true, html };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function getSetCookies(headers: Headers): string[] {
  const h = headers as unknown as { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === "function") return h.getSetCookie();
  const one = headers.get("set-cookie");
  if (!one) return [];
  // Best-effort split. Works for simple cookies (what we need: session + xsrf).
  return one.split(/,(?=[^;]+=[^;]+)/g).map((s) => s.trim()).filter(Boolean);
}

function cookieHeaderFromSetCookies(setCookies: string[]): string {
  const jar = new Map<string, string>();
  for (const sc of setCookies) {
    const part = sc.split(";")[0]?.trim();
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (!k) continue;
    jar.set(k, v);
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function parseCookieHeader(cookieHeader: string): Map<string, string> {
  const jar = new Map<string, string>();
  for (const partRaw of (cookieHeader || "").split(";")) {
    const part = partRaw.trim();
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (!k) continue;
    jar.set(k, v);
  }
  return jar;
}

function mergeCookieHeaders(...cookies: Array<string | null | undefined>): string {
  const jar = new Map<string, string>();
  for (const c of cookies) {
    for (const [k, v] of parseCookieHeader(c ?? "")) jar.set(k, v);
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function cookieNames(cookieHeader: string): string[] {
  return [...parseCookieHeader(cookieHeader).keys()];
}

const BROWSER_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
  "sec-ch-ua": "\"Chromium\";v=\"124\", \"Not-A.Brand\";v=\"99\"",
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": "\"macOS\"",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
};

async function loginShopAndGetCookie(env: Env): Promise<{ ok: true; cookie: string } | { ok: false; error: string }> {
  const user = env.SHOP_SCRAPER_USERNAME;
  const pass = env.SHOP_SCRAPER_PASSWORD;
  if (!user || !pass) {
    return { ok: false, error: "credenciais ausentes (defina SHOP_SCRAPER_USERNAME/SHOP_SCRAPER_PASSWORD como secrets/vars)" };
  }

  const base = "https://mupatos.com.br";
  const loginUrl = base + "/site/login";
  const loginPostUrl = base + "/site/login";

  try {
    // 1) GET login page → csrf token + initial cookies.
    const loginRes = await fetch(loginUrl, { headers: BROWSER_HEADERS });
    if (!loginRes.ok) return { ok: false, error: "login page HTTP " + loginRes.status };
    const loginHtml = await loginRes.text();
    const token =
      loginHtml.match(/name=["']_token["']\s+value=["']([^"']+)["']/i)?.[1] ||
      loginHtml.match(/meta name=["']csrf-token["']\s+content=["']([^"']+)["']/i)?.[1] ||
      "";
    if (!token) return { ok: false, error: "não encontrei csrf token na página de login" };
    const loginCookies = cookieHeaderFromSetCookies(getSetCookies(loginRes.headers));

    // 2) POST login → session cookie.
    const form = new URLSearchParams();
    form.set("_token", token);
    form.set("username", user);
    form.set("password", pass);
    form.set("redirect", "");

    const postRes = await fetch(loginPostUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        ...BROWSER_HEADERS,
        "content-type": "application/x-www-form-urlencoded",
        "referer": loginUrl,
        "cookie": loginCookies,
      },
      body: form.toString(),
    });
    // Even on 302, Set-Cookie should exist.
    let cookie = mergeCookieHeaders(loginCookies, cookieHeaderFromSetCookies(getSetCookies(postRes.headers)));
    if (!cookie) return { ok: false, error: "login não retornou cookies" };

    // Some deployments finalize/refresh cookies on the first redirect target.
    const loc = postRes.headers.get("location");
    if (loc && (postRes.status === 301 || postRes.status === 302 || postRes.status === 303)) {
      const target = loc.startsWith("http") ? loc : (base + loc);
      const r2 = await fetch(target, {
        headers: {
          ...BROWSER_HEADERS,
          "cookie": cookie,
          "referer": loginUrl,
        },
      });
      const more = cookieHeaderFromSetCookies(getSetCookies(r2.headers));
      if (more) cookie = mergeCookieHeaders(cookie, more);
    }

    return { ok: true, cookie };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function getShopAuthCookie(env: Env): Promise<{ ok: true; cookie: string } | { ok: false; error: string }> {
  return await loginShopAndGetCookie(env);
}

async function fetchShopItemHtmlAuthed(env: Env, itemUrl: string): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  const base = "https://mupatos.com.br";
  const logged = await loginShopAndGetCookie(env);
  if (!logged.ok) return logged;
  const res = await fetch(itemUrl, {
    headers: {
      ...BROWSER_HEADERS,
      "cookie": logged.cookie,
      "referer": base + "/site/shops",
    },
  });
  if (!res.ok) return { ok: false, error: "item page HTTP " + res.status };
  const html = await res.text();
  const txt = stripTags(html);
  if (isLoginPage(txt)) {
    return { ok: false, error: "login não efetivou (cookies=" + cookieNames(logged.cookie).join(",") + ")" };
  }
  return { ok: true, html };
}

async function fetchShopItemHtmlWithCookie(url: string, cookie: string): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  if (!cookie) return { ok: false, error: "cookie vazio" };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      headers: {
        ...BROWSER_HEADERS,
        "cookie": cookie,
        "referer": "https://mupatos.com.br/site/shops",
      },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, error: "upstream " + res.status };
    const html = await res.text();
    return { ok: true, html };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function scrapeShopItemRule(_env: Env, input: { url?: string; html?: string; name?: string }): Promise<{ rule: ShopItemRule } | { error: string }> {
  if (input.html && String(input.html).trim()) {
    return parseShopItemRuleFromHtml(String(input.html), input.name);
  }
  const u = (input.url ?? "").trim();
  if (!u) return { error: "informe url ou html" };
  const itemSlugFromUrl = (() => {
    try {
      const uu = new URL(u);
      const seg = uu.pathname.split("/").filter(Boolean).pop() || "";
      return seg || null;
    } catch { return null; }
  })();
  const cookie = (input as unknown as { cookie?: string }).cookie;
  if (cookie && cookie.trim()) {
    const fetched = await fetchShopItemHtmlWithCookie(u, cookie.trim());
    if (!fetched.ok) return { error: "falha ao buscar loja (cookie): " + fetched.error };
    const parsed = parseShopItemRuleFromHtml(fetched.html, input.name);
    if (!("error" in parsed) && itemSlugFromUrl) parsed.rule.item_slug = itemSlugFromUrl;
    return parsed;
  }
  // Try unauthenticated first; if it yields login page, retry with auth (if configured).
  const fetched = await fetchShopItemHtml(u);
  if (fetched.ok) {
    const parsed = parseShopItemRuleFromHtml(fetched.html, input.name);
    if (!("error" in parsed) && itemSlugFromUrl) parsed.rule.item_slug = itemSlugFromUrl;
    if (!("error" in parsed)) return parsed;
    // If it looks like login page, retry authed.
    if (String(parsed.error).toLowerCase().includes("login")) {
      const authed = await fetchShopItemHtmlAuthed(_env, u);
      if (!authed.ok) return { error: "falha ao buscar loja (auth): " + authed.error };
      const parsed2 = parseShopItemRuleFromHtml(authed.html, input.name);
      if (!("error" in parsed2) && itemSlugFromUrl) parsed2.rule.item_slug = itemSlugFromUrl;
      return parsed2;
    }
    return parsed;
  }
  // Directly retry authed if unauth fetch failed (bot guard / redirect etc).
  const authed = await fetchShopItemHtmlAuthed(_env, u);
  if (!authed.ok) return { error: "falha ao buscar loja: " + fetched.error + " / auth: " + authed.error };
  const parsed3 = parseShopItemRuleFromHtml(authed.html, input.name);
  if (!("error" in parsed3) && itemSlugFromUrl) parsed3.rule.item_slug = itemSlugFromUrl;
  return parsed3;
}


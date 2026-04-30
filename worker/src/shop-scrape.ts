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

/** Product pages rarely need the full document; trimming reduces CPU on huge HTMLs. */
const MAX_SHOP_HTML_CHARS = 520_000;

const DEFAULT_SHOP_FETCH_BASE_MS = 30_000;
const SHOP_FETCH_TIMEOUT_MIN_MS = 5_000;
const SHOP_FETCH_TIMEOUT_MAX_MS = 120_000;

/**
 * Three attempt timeouts from optional env: base, ~1.5×, 2× (same shape as the old fixed ladder).
 * Omit or invalid `SHOP_FETCH_TIMEOUT_MS` → 30s / 45s / 60s.
 */
export function resolveShopFetchTimeoutsMs(env?: { SHOP_FETCH_TIMEOUT_MS?: string }): readonly [number, number, number] {
  const raw = env?.SHOP_FETCH_TIMEOUT_MS;
  const parsed = raw != null && String(raw).trim() !== "" ? Number(String(raw).trim()) : NaN;
  const base = Number.isFinite(parsed)
    ? Math.min(SHOP_FETCH_TIMEOUT_MAX_MS, Math.max(SHOP_FETCH_TIMEOUT_MIN_MS, Math.floor(parsed)))
    : DEFAULT_SHOP_FETCH_BASE_MS;
  return [base, Math.round(base * 1.5), base * 2] as const;
}

function isTransientNetworkMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("aborted") ||
    m.includes("abort") ||
    m.includes("timeout") ||
    m.includes("network") ||
    m.includes("fetch failed") ||
    m.includes("econnreset") ||
    m.includes("socket") ||
    m.includes("und_err")
  );
}

function isRetryableShopHttpStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

async function staggerShopRetryDelay(attemptIndex: number): Promise<void> {
  await new Promise((r) => setTimeout(r, 200 + attemptIndex * 200 + Math.floor(Math.random() * 400)));
}

export function parseShopItemRuleFromHtml(html: string, fallbackName?: string): { rule: ShopItemRule } | { error: string } {
  const h = html.length > MAX_SHOP_HTML_CHARS ? html.slice(0, MAX_SHOP_HTML_CHARS) : html;
  const text = stripTags(h);
  if (isLoginPage(text)) {
    return { error: "a loja retornou página de login (precisa estar autenticado ou enviar HTML já logado)" };
  }
  const name = (extractShopItemName(h) || fallbackName || pickName(h) || "").trim();
  if (!name) return { error: "não consegui extrair o nome do item da página" };

  const exc = extractExcellentOptionsFromText(text);
  const ancientSets = [...new Set([...extractAncientSetsFromHtml(h), ...extractAncientSetsFromText(text)])];
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

/** Public helper: fetch shop HTML without session. `scrapeShopItemRule` always uses auth (or explicit `cookie`). */
export async function fetchShopItemHtml(
  url: string,
  env?: Pick<Env, "SHOP_FETCH_TIMEOUT_MS">,
): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  if (!/^https:\/\/mupatos\.com\.br\/site\/shop\//i.test(url)) {
    return { ok: false, error: "url inválida (precisa ser mupatos.com.br/site/shop/...)" };
  }
  const timeouts = resolveShopFetchTimeoutsMs(env);
  let lastErr = "";
  for (let i = 0; i < timeouts.length; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeouts[i]);
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-encoding": "gzip, deflate, br",
        },
        signal: ctrl.signal,
      });
      if (!res.ok) {
        lastErr = "upstream " + res.status;
        if (isRetryableShopHttpStatus(res.status) && i < timeouts.length - 1) {
          await staggerShopRetryDelay(i);
          continue;
        }
        return { ok: false, error: lastErr };
      }
      const html = await res.text();
      return { ok: true, html };
    } catch (e) {
      lastErr = (e as Error).message || String(e);
      if (i === timeouts.length - 1) break;
      if (!isTransientNetworkMessage(lastErr)) break;
      await staggerShopRetryDelay(i);
    } finally {
      clearTimeout(t);
    }
  }
  return { ok: false, error: lastErr || "erro ao buscar loja" };
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
  /** Smaller payloads on the wire (runtime decompresses). */
  "accept-encoding": "gzip, deflate, br",
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

/** Cold requests without a browser cookie reuse one login per isolate TTL (fewer RTTs). */
const SHOP_AUTH_CACHE_TTL_MS = 5 * 60 * 1000;
let shopAuthCookieCache: { cookie: string; at: number } | null = null;
/** Dedupe concurrent logins across parallel scrapes */
let loginInflight: Promise<{ ok: true; cookie: string } | { ok: false; error: string }> | null = null;

function peekCachedShopCookie(): string | null {
  if (!shopAuthCookieCache) return null;
  if (Date.now() - shopAuthCookieCache.at > SHOP_AUTH_CACHE_TTL_MS) {
    shopAuthCookieCache = null;
    return null;
  }
  return shopAuthCookieCache.cookie;
}

function rememberCachedShopCookie(cookie: string): void {
  shopAuthCookieCache = { cookie, at: Date.now() };
}

function invalidateCachedShopCookie(): void {
  shopAuthCookieCache = null;
}

async function loginShopAndGetCookie(env: Env): Promise<{ ok: true; cookie: string } | { ok: false; error: string }> {
  const user = env.SHOP_SCRAPER_USERNAME;
  const pass = env.SHOP_SCRAPER_PASSWORD;
  if (!user || !pass) {
    return { ok: false, error: "credenciais ausentes (defina SHOP_SCRAPER_USERNAME/SHOP_SCRAPER_PASSWORD como secrets/vars)" };
  }

  const base = "https://mupatos.com.br";
  const loginUrl = base + "/site/login";
  const loginPostUrl = base + "/site/login";
  const timeouts = resolveShopFetchTimeoutsMs(env);

  try {
    // 1) GET login page → csrf token + initial cookies (retries on timeout / 5xx / 429).
    let loginRes: Response | undefined;
    let loginPageErr = "";
    for (let i = 0; i < timeouts.length; i++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeouts[i]);
      try {
        const res = await fetch(loginUrl, { headers: BROWSER_HEADERS, signal: ctrl.signal });
        if (!res.ok) {
          loginPageErr = "login page HTTP " + res.status;
          if (isRetryableShopHttpStatus(res.status) && i < timeouts.length - 1) {
            await staggerShopRetryDelay(i);
            continue;
          }
          return { ok: false, error: loginPageErr };
        }
        loginRes = res;
        break;
      } catch (e) {
        loginPageErr = (e as Error).message || String(e);
        if (i === timeouts.length - 1) return { ok: false, error: loginPageErr };
        if (!isTransientNetworkMessage(loginPageErr)) return { ok: false, error: loginPageErr };
        await staggerShopRetryDelay(i);
      } finally {
        clearTimeout(t);
      }
    }
    if (!loginRes) return { ok: false, error: loginPageErr || "login GET falhou" };
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

    let postRes: Response | undefined;
    let postErr = "";
    for (let i = 0; i < timeouts.length; i++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeouts[i]);
      try {
        const res = await fetch(loginPostUrl, {
          method: "POST",
          redirect: "manual",
          headers: {
            ...BROWSER_HEADERS,
            "content-type": "application/x-www-form-urlencoded",
            "referer": loginUrl,
            "cookie": loginCookies,
          },
          body: form.toString(),
          signal: ctrl.signal,
        });
        if (isRetryableShopHttpStatus(res.status) && i < timeouts.length - 1) {
          postErr = "login POST HTTP " + res.status;
          await staggerShopRetryDelay(i);
          continue;
        }
        postRes = res;
        break;
      } catch (e) {
        postErr = (e as Error).message || String(e);
        if (i === timeouts.length - 1) return { ok: false, error: postErr };
        if (!isTransientNetworkMessage(postErr)) return { ok: false, error: postErr };
        await staggerShopRetryDelay(i);
      } finally {
        clearTimeout(t);
      }
    }
    if (!postRes) return { ok: false, error: postErr || "login POST falhou" };
    // Even on 302, Set-Cookie should exist.
    let cookie = mergeCookieHeaders(loginCookies, cookieHeaderFromSetCookies(getSetCookies(postRes.headers)));
    if (!cookie) return { ok: false, error: "login não retornou cookies" };

    // Some deployments finalize/refresh cookies on the first redirect target.
    const loc = postRes.headers.get("location");
    if (loc && (postRes.status === 301 || postRes.status === 302 || postRes.status === 303)) {
      const target = loc.startsWith("http") ? loc : (base + loc);
      let r2: Response | undefined;
      let r2Err = "";
      for (let i = 0; i < timeouts.length; i++) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeouts[i]);
        try {
          const res = await fetch(target, {
            headers: {
              ...BROWSER_HEADERS,
              "cookie": cookie,
              "referer": loginUrl,
            },
            signal: ctrl.signal,
          });
          if (!res.ok) {
            r2Err = "login redirect HTTP " + res.status;
            if (isRetryableShopHttpStatus(res.status) && i < timeouts.length - 1) {
              await staggerShopRetryDelay(i);
              continue;
            }
            break;
          }
          r2 = res;
          break;
        } catch (e) {
          r2Err = (e as Error).message || String(e);
          if (i === timeouts.length - 1) break;
          if (!isTransientNetworkMessage(r2Err)) break;
          await staggerShopRetryDelay(i);
        } finally {
          clearTimeout(t);
        }
      }
      if (r2) {
        const more = cookieHeaderFromSetCookies(getSetCookies(r2.headers));
        if (more) cookie = mergeCookieHeaders(cookie, more);
      }
    }

    return { ok: true, cookie };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function getShopAuthCookie(env: Env): Promise<{ ok: true; cookie: string } | { ok: false; error: string }> {
  const r = await loginShopAndGetCookie(env);
  if (r.ok) rememberCachedShopCookie(r.cookie);
  return r;
}

/**
 * Full MuPatos login → new session cookie only. Does **not** read/write `shopAuthCookieCache`
 * (parallel backfill category threads each get their own session without clobbering shared cache).
 */
export async function createShopSessionCookie(env: Env): Promise<{ ok: true; cookie: string } | { ok: false; error: string }> {
  return loginShopAndGetCookie(env);
}

/** Shared session for scrape paths that don't receive an explicit cookie (avoid N× login per run). */
async function ensureShopAuthCookieForFetch(env: Env): Promise<{ ok: true; cookie: string } | { ok: false; error: string }> {
  const peek = peekCachedShopCookie();
  if (peek) return { ok: true, cookie: peek };
  if (loginInflight) return loginInflight;
  loginInflight = (async () => {
    const logged = await loginShopAndGetCookie(env);
    if (logged.ok) rememberCachedShopCookie(logged.cookie);
    return logged;
  })().finally(() => {
    loginInflight = null;
  });
  return loginInflight;
}

async function fetchShopItemHtmlAuthed(env: Env, itemUrl: string): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  const base = "https://mupatos.com.br";
  const timeouts = resolveShopFetchTimeoutsMs(env);

  type TryOnce =
    | { kind: "ok"; html: string }
    | { kind: "http"; status: number }
    | { kind: "login" }
    | { kind: "net"; message: string };

  const tryOnce = async (cookie: string, timeoutMs: number): Promise<TryOnce> => {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(itemUrl, {
        headers: {
          ...BROWSER_HEADERS,
          "cookie": cookie,
          "referer": base + "/site/shops",
        },
        signal: ctrl.signal,
      });
      if (!res.ok) return { kind: "http", status: res.status };
      const html = await res.text();
      const capped = html.length > MAX_SHOP_HTML_CHARS ? html.slice(0, MAX_SHOP_HTML_CHARS) : html;
      const txt = stripTags(capped);
      if (isLoginPage(txt)) return { kind: "login" };
      return { kind: "ok", html };
    } catch (e) {
      return { kind: "net", message: (e as Error).message || String(e) };
    } finally {
      clearTimeout(tm);
    }
  };

  const fetchItemWithRetries = async (cookie: string): Promise<TryOnce> => {
    let lastNet = "";
    for (let i = 0; i < timeouts.length; i++) {
      const r = await tryOnce(cookie, timeouts[i]);
      if (r.kind === "ok" || r.kind === "login") return r;
      if (r.kind === "http") {
        if (isRetryableShopHttpStatus(r.status) && i < timeouts.length - 1) {
          await staggerShopRetryDelay(i);
          continue;
        }
        return r;
      }
      lastNet = r.message;
      if (i < timeouts.length - 1 && isTransientNetworkMessage(r.message)) {
        await staggerShopRetryDelay(i);
        continue;
      }
      return r;
    }
    return { kind: "net", message: lastNet || "erro de rede" };
  };

  async function cookieOrFail(): Promise<{ ok: true; cookie: string } | { ok: false; error: string }> {
    return ensureShopAuthCookieForFetch(env);
  }

  let auth = await cookieOrFail();
  if (!auth.ok) return auth;

  let r = await fetchItemWithRetries(auth.cookie);
  if (r.kind === "login") {
    invalidateCachedShopCookie();
    auth = await cookieOrFail();
    if (!auth.ok) return { ok: false, error: "relogin falhou após página de login: " + auth.error };
    r = await fetchItemWithRetries(auth.cookie);
  }
  if (r.kind === "login") {
    return { ok: false, error: "login não efetivou (sessão da loja)" };
  }
  if (r.kind === "http") {
    return { ok: false, error: "item page HTTP " + r.status };
  }
  if (r.kind === "net") {
    return { ok: false, error: r.message };
  }
  return { ok: true, html: r.html };
}

async function fetchShopItemHtmlWithCookie(
  url: string,
  cookie: string,
  env?: Pick<Env, "SHOP_FETCH_TIMEOUT_MS">,
): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  if (!cookie) return { ok: false, error: "cookie vazio" };
  const timeouts = resolveShopFetchTimeoutsMs(env);
  let lastErr = "";
  for (let i = 0; i < timeouts.length; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeouts[i]);
    try {
      const res = await fetch(url, {
        headers: {
          ...BROWSER_HEADERS,
          "cookie": cookie,
          "referer": "https://mupatos.com.br/site/shops",
        },
        signal: ctrl.signal,
      });
      if (!res.ok) {
        lastErr = "upstream " + res.status;
        if (isRetryableShopHttpStatus(res.status) && i < timeouts.length - 1) {
          await staggerShopRetryDelay(i);
          continue;
        }
        return { ok: false, error: lastErr };
      }
      const html = await res.text();
      return { ok: true, html };
    } catch (e) {
      lastErr = (e as Error).message || String(e);
      if (i === timeouts.length - 1) break;
      if (!isTransientNetworkMessage(lastErr)) break;
      await staggerShopRetryDelay(i);
    } finally {
      clearTimeout(t);
    }
  }
  return { ok: false, error: lastErr || "erro ao buscar (cookie)" };
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
    const fetched = await fetchShopItemHtmlWithCookie(u, cookie.trim(), _env);
    if (!fetched.ok) return { error: "falha ao buscar loja (cookie): " + fetched.error };
    const parsed = parseShopItemRuleFromHtml(fetched.html, input.name);
    if (!("error" in parsed) && itemSlugFromUrl) parsed.rule.item_slug = itemSlugFromUrl;
    return parsed;
  }

  // Always fetch product HTML with shop session (env credentials); no unauthenticated probe.
  const authed = await fetchShopItemHtmlAuthed(_env, u);
  if (!authed.ok) return { error: "falha ao buscar loja (auth): " + authed.error };
  const parsed = parseShopItemRuleFromHtml(authed.html, input.name);
  if (!("error" in parsed) && itemSlugFromUrl) parsed.rule.item_slug = itemSlugFromUrl;
  return parsed;
}


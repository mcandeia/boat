import type { Env } from "../types";
import { bad, now } from "../util";
import { Resvg } from "@cf-wasm/resvg/workerd";
import { PhotonImage, SamplingFilter, resize } from "@cf-wasm/photon/workerd";

let FONT_CACHE: { regular: Uint8Array; bold: Uint8Array } | null = null;
async function loadOgFonts(): Promise<{ regular: Uint8Array; bold: Uint8Array } | null> {
  if (FONT_CACHE) return FONT_CACHE;
  // Use WOFF2 (supported by resvg-wasm >= 2.5). Keep pinned versions/paths.
  const REGULAR_URL = "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.19/files/inter-latin-400-normal.woff2";
  const BOLD_URL = "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.19/files/inter-latin-800-normal.woff2";
  try {
    const [r1, r2] = await Promise.all([
      fetch(REGULAR_URL, { cf: { cacheTtl: 86400, cacheEverything: true } as RequestInitCfProperties }),
      fetch(BOLD_URL, { cf: { cacheTtl: 86400, cacheEverything: true } as RequestInitCfProperties }),
    ]);
    if (!r1.ok || !r2.ok) return null;
    const [b1, b2] = await Promise.all([r1.arrayBuffer(), r2.arrayBuffer()]);
    FONT_CACHE = { regular: new Uint8Array(b1), bold: new Uint8Array(b2) };
    return FONT_CACHE;
  } catch {
    return null;
  }
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

function stripTags(s: string): string {
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function fmtPrice(currency: string | null, price: number | null): string {
  if (!currency) return "";
  if (currency === "free") return "grátis";
  if (currency === "cash") return "R$ " + (price != null ? Number(price).toLocaleString("pt-BR") : "?");
  if (price == null) return currency;
  return Number(price).toLocaleString("pt-BR") + " " + currency;
}

function fmtAttrs(attrsJson: string | null): string {
  if (!attrsJson) return "";
  try {
    const a = JSON.parse(attrsJson) as Record<string, unknown>;
    const parts: string[] = [];
    if (a.full) parts.push("Full");
    else {
      if (a.excellent) parts.push("Excellent");
      if (a.option != null) parts.push("opt+" + String(a.option));
      if (a.luck) parts.push("luck");
      if (a.skill) parts.push("skill");
    }
    if (a.refinement != null) parts.push("+" + String(a.refinement));
    if (a.harmony) parts.push("harmony");
    if (a.ancient) parts.push("ancient");
    if (a.extras) parts.push("extras");
    return parts.join(" · ");
  } catch {
    return "";
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  // btoa is available in Workers.
  return btoa(bin);
}

function guessMime(urlOrCt: string): string {
  const s = (urlOrCt || "").toLowerCase();
  if (s.includes("image/png") || s.endsWith(".png")) return "image/png";
  if (s.includes("image/webp") || s.endsWith(".webp")) return "image/webp";
  if (s.includes("image/jpeg") || s.includes("image/jpg") || s.endsWith(".jpg") || s.endsWith(".jpeg")) return "image/jpeg";
  if (s.includes("image/gif") || s.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

function tryDecodeAndThumbToPng(bytes: Uint8Array, maxSize = 256): Uint8Array | null {
  try {
    const input = PhotonImage.new_from_byteslice(bytes);
    const w = input.get_width();
    const h = input.get_height();
    // Scale down while keeping aspect ratio.
    const scale = Math.min(1, maxSize / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const out = (scale < 1) ? resize(input, tw, th, SamplingFilter.Lanczos3) : input;
    const png = out.get_bytes(); // PNG bytes
    // Free rust memory (out may alias input when scale==1, so free carefully).
    if (out !== input) out.free();
    input.free();
    return png;
  } catch {
    return null;
  }
}

async function fetchBytes(url: string, opts: { timeoutMs: number; headers?: Record<string, string> }): Promise<{ ok: boolean; bytes: Uint8Array; contentType: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Math.max(500, opts.timeoutMs));
  try {
    const res = await fetch(url, {
      headers: opts.headers,
      signal: ctrl.signal,
      cf: { cacheTtl: 86400, cacheEverything: true } as RequestInitCfProperties,
    });
    const ct = res.headers.get("content-type") || "";
    const buf = await res.arrayBuffer().catch(() => new ArrayBuffer(0));
    return { ok: res.ok, bytes: new Uint8Array(buf), contentType: ct };
  } catch {
    return { ok: false, bytes: new Uint8Array(), contentType: "" };
  } finally {
    clearTimeout(t);
  }
}

export async function renderMarketListingOgPng(env: Env, url: URL, listingId: number): Promise<Response> {
  // Cache the final PNG aggressively at the edge. Discord in particular may
  // bail out if the OG image takes too long on first fetch.
  const cache = (globalThis as unknown as { caches?: CacheStorage }).caches?.default;
  const cacheKey = new Request(url.toString(), { method: "GET" });
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  const origin = url.origin;
  const row = await env.DB.prepare(
    `SELECT
       l.id,
       l.side,
       l.kind,
       l.item_name,
       l.item_attrs,
       l.currency,
       l.price,
       l.notes,
       l.status,
       l.created_at,
       l.item_image_url,
       u.nickname AS nickname
     FROM listings l
     JOIN users u ON u.id = l.user_id
    WHERE l.id = ?
    LIMIT 1`,
  ).bind(listingId).first<{
    id: number;
    side: string;
    kind?: string | null;
    item_name: string;
    item_attrs: string | null;
    currency: string | null;
    price: number | null;
    notes: string | null;
    status: string;
    created_at: number;
    item_image_url: string | null;
    nickname: string | null;
  }>();
  if (!row) return bad(404, "anúncio não encontrado");

  const W = 1200;
  const H = 630;

  const sideLabel = row.side === "buy" ? "comprar" : row.side === "donate" ? "doação" : "vender";
  const statusLabel = row.status === "open" ? "" : row.status === "held" ? "reservado" : "fechado";
  const price = fmtPrice(row.currency, row.price);
  const attrs = fmtAttrs(row.item_attrs);
  const notes = stripTags(row.notes ?? "");
  const who = row.nickname ?? "?";
  const ageMin = Math.max(0, Math.floor((now() - Number(row.created_at || now())) / 60));
  const age = ageMin < 60 ? (ageMin + "min") : (Math.floor(ageMin / 60) + "h");

  // Fetch and embed item image as data URI (Resvg doesn't fetch remote hrefs).
  let imgDataUri = "";
  const rawImg = (row.item_image_url ?? "").trim();
  if (rawImg) {
    try {
      const isMupatosSprite = /^https:\/\/mupatos\.com\.br\/site\/resources\/images\//i.test(rawImg);
      // In prod, fetching our own /img-proxy can be flaky (self-fetch / loops / edge routing).
      // Prefer fetching the upstream sprite directly with browser-like headers.
      const src = rawImg;
      const upstream = await fetchBytes(src, {
        timeoutMs: 8000,
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "accept": "image/avif,image/webp,image/*,*/*;q=0.8",
          ...(isMupatosSprite ? { "referer": "https://mupatos.com.br/" } : {}),
        },
      });
      if (upstream.ok && upstream.bytes.length > 0) {
        const mime = guessMime(upstream.contentType || src);

        // WebP sprites are common (mupatos). resvg-wasm can fail to render WebP
        // when embedded as a data URI; convert to PNG to be safe.
        const rawBytes = upstream.bytes;
        if (mime === "image/webp") {
          const pngBytes = tryDecodeAndThumbToPng(rawBytes, 256);
          if (pngBytes) {
            imgDataUri = "data:image/png;base64," + bytesToBase64(pngBytes);
          } else {
            // Fallback: try embedding webp as-is (may work depending on decoder build).
            imgDataUri = "data:image/webp;base64," + bytesToBase64(rawBytes);
          }
        } else {
          imgDataUri = "data:" + mime + ";base64," + bytesToBase64(rawBytes);
        }
      }
    } catch {}
  }

  const title = `${row.item_name}`.slice(0, 80);
  const sub = [attrs, price, statusLabel].filter(Boolean).join(" · ").slice(0, 140);
  const noteLine = notes ? notes.slice(0, 160) : "";

  const fontFamily = "Inter";
  const badge = (text: string, fill: string, stroke: string) =>
    `<g>
      <rect rx="18" ry="18" x="0" y="0" width="${Math.max(120, text.length * 10 + 54)}" height="36" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
      <text x="18" y="24" font-size="14" font-weight="800" fill="#E5E7EB" font-family="${fontFamily}, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial">${esc(text.toUpperCase())}</text>
    </g>`;

  const imgBox = imgDataUri
    ? `<image href="${esc(imgDataUri)}" x="86" y="150" width="220" height="220" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="196" y="270" text-anchor="middle" font-size="72" fill="#CBD5E1" font-family="ui-sans-serif, system-ui">📦</text>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0B0F16"/>
          <stop offset="55%" stop-color="#0F172A"/>
          <stop offset="100%" stop-color="#0B0F16"/>
        </linearGradient>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#F0A93B"/>
          <stop offset="100%" stop-color="#F59E0B"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#000" flood-opacity="0.55"/>
        </filter>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>

      <rect x="60" y="60" width="${W - 120}" height="${H - 120}" rx="28" fill="rgba(15,23,42,0.55)" stroke="rgba(240,169,59,0.35)" stroke-width="2" filter="url(#shadow)"/>

      <!-- Left image block -->
      <rect x="80" y="140" width="260" height="260" rx="24" fill="rgba(2,6,23,0.45)" stroke="rgba(148,163,184,0.25)" stroke-width="2"/>
      ${imgBox}

      <!-- Top meta -->
      <text x="80" y="110" font-size="18" fill="#9CA3AF" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial">
        Mu Patos · Mercado · anúncio #${esc(row.id)} · ${esc(age)} · por ${esc(who)}
      </text>

      <!-- Badges -->
      <g transform="translate(370, 140)">
        ${badge(sideLabel, "rgba(240,169,59,0.18)", "rgba(240,169,59,0.50)")}
      </g>
      ${statusLabel
        ? `<g transform="translate(370, 190)">${badge(statusLabel, "rgba(234,179,8,0.16)", "rgba(234,179,8,0.45)")}</g>`
        : ""}

      <!-- Title -->
      <text x="370" y="280" font-size="54" font-weight="800" fill="#E5E7EB"
        font-family="${fontFamily}, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial">
        ${esc(title)}
      </text>

      <!-- Subtitle -->
      ${sub
        ? `<text x="370" y="330" font-size="22" fill="#CBD5E1" font-family="${fontFamily}, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial">
            ${esc(sub)}
          </text>`
        : ""}

      <!-- Notes -->
      ${noteLine
        ? `<text x="370" y="380" font-size="18" fill="#9CA3AF" font-family="${fontFamily}, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial">
            ${esc(noteLine)}
          </text>`
        : ""}

      <!-- Footer -->
      <rect x="80" y="${H - 130}" width="${W - 160}" height="2" fill="rgba(148,163,184,0.18)"/>
      <text x="80" y="${H - 90}" font-size="18" fill="#9CA3AF" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial">
        ${esc(origin.replace(/^https?:\/\//, ""))} · abra: /s/${esc(row.id)}
      </text>
      <text x="${W - 80}" y="${H - 90}" text-anchor="end" font-size="18" fill="#F3D08D" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial">
        compartilhar
      </text>
      <rect x="${W - 260}" y="${H - 118}" width="180" height="48" rx="24" fill="url(#gold)"/>
      <text x="${W - 170}" y="${H - 87}" text-anchor="middle" font-size="18" font-weight="800" fill="#0B0F16"
        font-family="${fontFamily}, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial">
        ver anúncio
      </text>
    </svg>`;

  const fonts = await loadOgFonts();
  const r = await Resvg.async(svg, {
    fitTo: { mode: "width", value: W },
    font: fonts
      ? {
        loadSystemFonts: false,
        defaultFontFamily: fontFamily,
        fontBuffers: [fonts.regular, fonts.bold],
      }
      : { loadSystemFonts: false, defaultFontFamily: "sans-serif" },
  });
  const png = r.render().asPng();

  const res = new Response(png, {
    headers: {
      "content-type": "image/png",
      // Cache at edge; this is immutable for a given listingId unless user edits.
      // Keep it short so updates show up quickly.
      // If the share page includes ?v=..., this can be safely longer.
      "cache-control": url.searchParams.get("v") ? "public, max-age=86400" : "public, max-age=600",
    },
  });
  if (cache) {
    // Best-effort cache populate.
    try { await cache.put(cacheKey, res.clone()); } catch {}
  }
  return res;
}


import type { Env } from "./types";
import { now } from "./util";

// Scrape mupatos.net /eventos + /invasoes, parse the per-event/invasion
// schedules (Free vs VIP rooms), and upsert into the server_events table.
// The Wix page structure is consistent across both URLs:
//   <h5>Event name</h5>
//     <p>... description ...</p>
//     <p>Horários Sala Free:</p>
//     <p>13h30 | 19h30 | 21h30</p>
//     <p>Horários Sala VIP:</p>
//     <p>14h30 | 20h30 | 22h30</p>
// Some events (Castle Siege) have no time list — only a "Domingo" note,
// which we keep as `meta`.
//
// Cron calls refreshServerEvents() at most once per hour. The page rarely
// changes, but staff sometimes nudge schedules and we want to track that.

const REFRESH_INTERVAL_SECS = 3600;

const PAGES: Array<{ url: string; category: "event" | "invasion" }> = [
  { url: "https://www.mupatos.net/eventos",  category: "event" },
  { url: "https://www.mupatos.net/invasoes", category: "invasion" },
];

const BROWSER_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
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

interface ParsedEntry {
  name: string;
  freeSchedule: string[];     // ["13:30", "19:30", ...]
  vipSchedule: string[];
  meta?: string;
}

function decode(s: string): string {
  return s
    .replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó").replace(/&uacute;/gi, "ú").replace(/&atilde;/gi, "ã")
    .replace(/&otilde;/gi, "õ").replace(/&ccedil;/gi, "ç").replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/​/g, "").trim();
}

function stripTags(html: string): string {
  return decode(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function parseTimes(line: string): string[] {
  // "13h30 | 19h30 | 21h30" → ["13:30", "19:30", "21:30"]
  return [...line.matchAll(/(\d{1,2})\s*h\s*(\d{2})/g)].map(
    (m) => String(m[1]).padStart(2, "0") + ":" + m[2],
  );
}

interface Token { type: "h5" | "p"; text: string }

export function parseEventsHtml(html: string): ParsedEntry[] {
  // Walk h5 + p tags in document order.
  const tokens: Token[] = [];
  const tokenRe = /<(h5|p)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(html)) !== null) {
    const text = stripTags(m[2]);
    if (!text) continue;
    tokens.push({ type: m[1].toLowerCase() as "h5" | "p", text });
  }

  const entries: ParsedEntry[] = [];
  let cur: ParsedEntry | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "h5") {
      cur = { name: t.text, freeSchedule: [], vipSchedule: [] };
      entries.push(cur);
      continue;
    }
    if (!cur) continue;
    // The label paragraph is followed by the times paragraph. Look ahead.
    const next = tokens[i + 1];
    if (/hor[áa]rio[s]?\s+sala\s+free/i.test(t.text) && next?.type === "p") {
      const tt = parseTimes(next.text);
      if (tt.length) cur.freeSchedule = cur.freeSchedule.length ? cur.freeSchedule : tt;
    } else if (/hor[áa]rio[s]?\s+sala\s+vip/i.test(t.text) && next?.type === "p") {
      const tt = parseTimes(next.text);
      if (tt.length) cur.vipSchedule = cur.vipSchedule.length ? cur.vipSchedule : tt;
    } else if (/domingo|s[áa]bado|semanal|toda semana/i.test(t.text) && !cur.meta) {
      cur.meta = t.text;
    }
  }
  // Filter out the menu/nav fake entries — real ones have either a schedule
  // or a meta note.
  return entries.filter((e) => e.freeSchedule.length || e.vipSchedule.length || e.meta);
}

async function fetchOnePage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (!res.ok) {
      console.log("server-events fetch ${url}: HTTP " + res.status);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.log(`server-events fetch ${url} failed: ${(err as Error).message}`);
    return null;
  }
}

export async function shouldRefreshServerEvents(env: Env): Promise<boolean> {
  const r = await env.DB
    .prepare("SELECT MAX(updated_at) AS last FROM server_events")
    .first<{ last: number | null }>();
  const last = r?.last ?? 0;
  return now() - last >= REFRESH_INTERVAL_SECS;
}

export async function refreshServerEvents(env: Env): Promise<{ entries: number }> {
  const t = now();
  let total = 0;
  for (const p of PAGES) {
    const html = await fetchOnePage(p.url);
    if (!html) continue;
    const entries = parseEventsHtml(html);
    for (const e of entries) {
      // Daily entries: insert one row per (Free, VIP) when present. Special
      // (weekly etc.) entries get one 'special' row carrying the meta note.
      if (e.freeSchedule.length) {
        await upsertEvent(env, p.category, e.name, "free", e.freeSchedule.join(","), null, t);
        total++;
      }
      if (e.vipSchedule.length) {
        await upsertEvent(env, p.category, e.name, "vip", e.vipSchedule.join(","), null, t);
        total++;
      }
      if (!e.freeSchedule.length && !e.vipSchedule.length && e.meta) {
        await upsertEvent(env, p.category, e.name, "special", "", e.meta, t);
        total++;
      }
    }
  }
  // Drop rows that the latest scrape didn't touch — staff removed them.
  await env.DB
    .prepare("DELETE FROM server_events WHERE updated_at < ?")
    .bind(t - 60)
    .run();
  return { entries: total };
}

async function upsertEvent(
  env: Env,
  category: string,
  name: string,
  room: string,
  schedule: string,
  meta: string | null,
  t: number,
): Promise<void> {
  await env.DB
    .prepare(
      `INSERT INTO server_events (category, name, room, schedule, meta, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(category, name, room) DO UPDATE SET
         schedule = excluded.schedule,
         meta = excluded.meta,
         updated_at = excluded.updated_at`,
    )
    .bind(category, name, room, schedule, meta, t)
    .run();
}

// ---------- Schedule evaluation (BR local time, UTC-3) ----------
//
// Mu Patos is in Brazil and the page lists times in local hours. CF Workers
// run on UTC. Convert by subtracting 3h from "now".

const BR_OFFSET_MIN = -180;

export function brNowParts(unixSecs: number): { hour: number; minute: number; weekday: number } {
  const d = new Date((unixSecs + BR_OFFSET_MIN * 60) * 1000);
  return {
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

// "13:30,19:30,21:30" → list of {h, m}
export function parseSchedule(s: string): Array<{ h: number; m: number }> {
  return s.split(",").map((t) => t.trim()).filter(Boolean).map((t) => {
    const [h, m] = t.split(":").map(Number);
    return { h, m };
  });
}

// Returns true iff the current BR-local minute equals (scheduled - leadMinutes)
// for any time on the schedule.
export function shouldFireServerAlert(
  schedule: Array<{ h: number; m: number }>,
  leadMinutes: number,
  brNow: { hour: number; minute: number },
): boolean {
  const nowMin = brNow.hour * 60 + brNow.minute;
  for (const s of schedule) {
    let alertMin = s.h * 60 + s.m - leadMinutes;
    if (alertMin < 0) alertMin += 1440;
    alertMin %= 1440;
    if (alertMin === nowMin) return true;
  }
  return false;
}

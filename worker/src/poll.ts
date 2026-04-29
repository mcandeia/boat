import type { CharacterRow, Env, ProfileSnapshot, SubscriptionRow } from "./types";
import { parseMap, scrapeOne } from "./scraper";
import { now } from "./util";
import { sendTelegram } from "./telegram";
import { formatAlert, formatServerEventAlert } from "./messages";
import { classCodeFor, fetchRankings, findRank, type RankingMap } from "./rankings";
import {
  brNowParts,
  parseSchedule,
  refreshServerEvents,
  shouldFireServerAlert,
  shouldRefreshServerEvents,
} from "./server-events";

// Per-character poll. The CharWatcher Durable Object calls this from its
// alarm handler — one call per character per minute, spread across
// independent DO instances so a slow scrape on one char doesn't drop
// the rest.
export async function pollSingleChar(
  env: Env,
  charId: number,
): Promise<{ scraped: boolean; fired: number }> {
  const char = await env.DB
    .prepare("SELECT * FROM characters WHERE id = ?")
    .bind(charId)
    .first<CharacterRow>();
  if (!char || char.blocked) return { scraped: false, fired: 0 };

  // Skip if there are no active subs for this char AND nothing is watching it.
  // Still useful to keep snapshots for the dashboard, so we don't actually
  // skip — only abort early on truly dead chars (none registered, fully blocked).

  const snap = await scrapeOne(env, char.name, { totalTimeoutMs: 25_000 });
  if (!snap.exists) return { scraped: snap.scraped, fired: 0 };

  type SubRow = SubscriptionRow & { owner_chat_id: number; is_gm: number };
  const subsRes = await env.DB
    .prepare(
      `SELECT
         s.*,
         u.telegram_chat_id AS owner_chat_id,
         COALESCE(uc.is_gm, 0) AS is_gm
       FROM subscriptions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN user_characters uc
         ON uc.user_id = s.user_id AND uc.character_id = s.character_id
      WHERE s.active = 1 AND s.character_id = ?`,
    )
    .bind(charId)
    .all<SubRow>();
  const subs = subsRes.results ?? [];

  const t = now();
  const cooldown = Number(env.COOLDOWN_SECONDS || "3600");
  let fired = 0;

  const prevMap = parseMap(char.last_map);
  const prev: ProfileSnapshot = {
    name: char.name,
    class: char.class,
    resets: char.resets,
    level: char.last_level,
    map: char.last_map,
    mapName: prevMap.name,
    mapX: prevMap.x,
    mapY: prevMap.y,
    status: char.last_status as "Online" | "Offline" | null,
    exists: true,
    scraped: true,
  };

  for (const sub of subs) {
    if (sub.cooldown_until > t) continue;
    const trigger = evaluate(sub, prev, snap, !!sub.is_gm, {
      last_level_change_at: char.last_level_change_at,
      now: t,
    });
    if (!trigger) continue;

    const msg = formatAlert(char.name, sub, snap);
    console.log(`fire sub=${sub.id} type=${sub.event_type} char=${char.name} chat=${sub.owner_chat_id} prevLevel=${prev.level} nextLevel=${snap.level} prevStatus=${prev.status} nextStatus=${snap.status}`);
    const sendRes = await sendTelegram(env, sub.owner_chat_id, msg);
    if (!sendRes.ok) {
      console.log(`telegram send FAILED sub=${sub.id} status=${sendRes.status} body=${sendRes.body}`);
      continue;
    }
    await env.DB
      .prepare("UPDATE subscriptions SET cooldown_until = ?, last_fired_at = ? WHERE id = ?")
      .bind(t + cooldown, t, sub.id)
      .run();
    fired++;
  }

  // Fetch rankings only when this char's level/resets actually changed —
  // ranks are reset+name based, so unchanged scrapes don't need a refetch.
  let ranks = {
    classCode: char.class_code,
    rankOverall: char.rank_overall,
    rankClass: char.rank_class,
    nextTargetName: char.next_target_name,
    nextTargetResets: char.next_target_resets,
  };
  if (snap.level !== prev.level || snap.resets !== prev.resets || snap.class !== prev.class) {
    try {
      const rankings = await fetchRankings();
      ranks = enrichRanks(snap, rankings);
    } catch (e) {
      // Rankings page is best-effort — keep prior values on failure.
      console.log(`rankings fetch failed for ${char.name}: ${(e as Error).message}`);
    }
  }

  const levelChangedAt = snap.level !== prev.level && snap.level != null ? t : null;
  await env.DB
    .prepare(
      `UPDATE characters
          SET class = COALESCE(?, class),
              resets = COALESCE(?, resets),
              last_level = COALESCE(?, last_level),
              last_map = COALESCE(?, last_map),
              last_status = COALESCE(?, last_status),
              last_checked_at = ?,
              last_level_change_at = COALESCE(?, last_level_change_at),
              class_code = ?,
              rank_overall = ?,
              rank_class = ?,
              next_target_name = ?,
              next_target_resets = ?
        WHERE id = ?`,
    )
    .bind(
      snap.class, snap.resets, snap.level, snap.map, snap.status, t,
      levelChangedAt,
      ranks.classCode, ranks.rankOverall, ranks.rankClass,
      ranks.nextTargetName, ranks.nextTargetResets,
      charId,
    )
    .run();

  // Snapshot row when something visible changed, OR every ~5 min as a
  // heartbeat so the chart isn't empty for stable chars.
  const changed =
    snap.level !== prev.level ||
    snap.resets !== prev.resets ||
    snap.map !== prev.map ||
    snap.status !== prev.status;
  let needHeartbeat = false;
  if (!changed) {
    const lastSnap = await env.DB
      .prepare("SELECT MAX(ts) AS last_ts FROM char_snapshots WHERE char_id = ?")
      .bind(charId)
      .first<{ last_ts: number | null }>();
    needHeartbeat = (t - (lastSnap?.last_ts ?? 0)) >= 300;
  }
  if (changed || needHeartbeat) {
    await env.DB
      .prepare(
        `INSERT INTO char_snapshots (char_id, ts, level, resets, map, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(charId, t, snap.level, snap.resets, snap.map, snap.status)
      .run();
  }

  return { scraped: true, fired };
}

// Loop over every active char and run pollSingleChar. Used by the admin
// "Rodar cron agora" button as a backstop / debug tool. The production
// path is per-char DOs with alarms, not this loop.
export async function pollOnce(env: Env): Promise<{ scraped: number; fired: number }> {
  const rs = await env.DB
    .prepare(
      `SELECT DISTINCT c.id
         FROM characters c
         JOIN subscriptions s ON s.character_id = c.id AND s.active = 1
        WHERE c.blocked = 0`,
    )
    .all<{ id: number }>();
  const ids = (rs.results ?? []).map((r) => r.id);
  if (ids.length === 0) return { scraped: 0, fired: 0 };

  let scraped = 0;
  let fired = 0;
  // Modest concurrency — this is admin-triggered and CPU is per-tick now,
  // not per-char, so keep it tame to stay under the budget.
  const CONC = 5;
  for (let i = 0; i < ids.length; i += CONC) {
    const batch = ids.slice(i, i + CONC);
    const out = await Promise.all(batch.map((id) => pollSingleChar(env, id).catch(() => ({ scraped: false, fired: 0 }))));
    for (const r of out) {
      if (r.scraped) scraped++;
      fired += r.fired;
    }
  }
  return { scraped, fired };
}

// Server-event scheduling pass. Two responsibilities:
//   1. Refresh the scraped schedules at most once per hour.
//   2. For every active server_event subscription whose threshold is encoded
//      as "<event>|<room>|<minutesBefore>", fire a Telegram message in the
//      minute that hits "scheduled - minutesBefore" in BR local time.
export async function pollServerEvents(env: Env): Promise<{ refreshed: boolean; fired: number }> {
  const t = now();
  let refreshed = false;
  if (await shouldRefreshServerEvents(env)) {
    const r = await refreshServerEvents(env);
    refreshed = true;
    console.log(`server-events refresh: entries=${r.entries}`);
  }

  type SubAndOwner = SubscriptionRow & { owner_chat_id: number };
  const subsRes = await env.DB
    .prepare(
      `SELECT s.*, u.telegram_chat_id AS owner_chat_id
         FROM subscriptions s
         JOIN users u ON u.id = s.user_id
        WHERE s.event_type = 'server_event' AND s.active = 1`,
    )
    .all<SubAndOwner>();
  const subs = subsRes.results ?? [];
  if (subs.length === 0) return { refreshed, fired: 0 };

  // Per-user char list (name + level) so formatServerEventAlert can
  // pick the BEST char for each event's tier instead of just suggesting
  // a generic ticket bracket from the user's max-level char.
  const charsRes = await env.DB
    .prepare(
      `SELECT uc.user_id AS user_id, c.name AS name, c.last_level AS level
         FROM user_characters uc
         JOIN characters c ON c.id = uc.character_id
        WHERE c.blocked = 0`,
    )
    .all<{ user_id: number; name: string; level: number | null }>();
  const charsByUser = new Map<number, Array<{ name: string; level: number | null }>>();
  for (const r of charsRes.results ?? []) {
    const list = charsByUser.get(r.user_id) ?? [];
    list.push({ name: r.name, level: r.level });
    charsByUser.set(r.user_id, list);
  }

  const cooldown = Number(env.COOLDOWN_SECONDS || "3600");
  const br = brNowParts(t);
  let fired = 0;

  for (const sub of subs) {
    if (sub.cooldown_until > t) continue;
    const parsed = parseServerEventThreshold(sub.threshold);
    if (!parsed) continue;
    const ev = await env.DB
      .prepare(
        "SELECT schedule FROM server_events WHERE name = ? AND room = ? COLLATE NOCASE",
      )
      .bind(parsed.name, parsed.room)
      .first<{ schedule: string }>();
    if (!ev?.schedule) continue;
    const schedule = parseSchedule(ev.schedule);
    if (!shouldFireServerAlert(schedule, parsed.lead, br)) continue;

    const msg = formatServerEventAlert({
      name: parsed.name,
      room: parsed.room,
      leadMinutes: parsed.lead,
      userChars: charsByUser.get(sub.user_id) ?? [],
      customMessage: sub.custom_message ?? null,
    });
    const send = await sendTelegram(env, sub.owner_chat_id, msg);
    if (!send.ok) {
      console.log(`telegram send FAILED server-event sub=${sub.id} status=${send.status}`);
      continue;
    }
    await env.DB
      .prepare("UPDATE subscriptions SET cooldown_until = ?, last_fired_at = ? WHERE id = ?")
      .bind(t + cooldown, t, sub.id)
      .run();
    fired++;
  }

  return { refreshed, fired };
}

// Threshold format: "<EventName>|<room>|<leadMinutes>", e.g.
// "Chaos Castle|vip|5". Returns null on malformed input.
export function parseServerEventThreshold(threshold: string | null):
  | { name: string; room: string; lead: number }
  | null {
  if (!threshold) return null;
  const parts = threshold.split("|").map((p) => p.trim());
  if (parts.length !== 3) return null;
  const lead = Number(parts[2]);
  if (!Number.isFinite(lead) || lead < 0 || lead > 1440) return null;
  const room = parts[1].toLowerCase();
  if (!parts[0] || !room) return null;
  return { name: parts[0], room, lead };
}

// True iff the subscription should fire given old vs new snapshot.
function evaluate(
  sub: SubscriptionRow,
  prev: ProfileSnapshot,
  next: ProfileSnapshot,
  isGm: boolean,
  ctx: { last_level_change_at: number | null; now: number },
): boolean {
  switch (sub.event_type) {
    case "level_gte": {
      const target = Number(sub.threshold);
      if (!Number.isFinite(target)) return false;
      const was = prev.level ?? -1;
      const is = next.level ?? -1;
      return is >= target && was < target;
    }
    case "map_eq": {
      const want = (sub.threshold ?? "").toLowerCase();
      if (!want) return false;
      const p = (prev.mapName ?? "").toLowerCase();
      const n = (next.mapName ?? "").toLowerCase();
      return n === want && p !== want;
    }
    case "coords_in": {
      const box = parseCoordsBox(sub.threshold);
      if (!box) return false;
      return inBox(next, box) && !inBox(prev, box);
    }
    case "status_eq": {
      const want = sub.threshold;
      if (!want) return false;
      return next.status === want && prev.status !== want;
    }
    case "gm_online": {
      if (!isGm) return false;
      return next.status === "Online" && prev.status !== "Online";
    }
    case "server_event":
      return false;
    case "level_stale": {
      const minutes = Number(sub.threshold);
      if (!Number.isFinite(minutes) || minutes < 1) return false;
      if (ctx.last_level_change_at == null) return false;
      if (sub.last_fired_at != null && ctx.last_level_change_at <= sub.last_fired_at) return false;
      const idleSecs = ctx.now - ctx.last_level_change_at;
      return idleSecs >= minutes * 60;
    }
  }
}

export function parseCoordsBox(
  threshold: string | null,
): { map: string; x1: number; x2: number; y1: number; y2: number } | null {
  if (!threshold) return null;
  const m = threshold.match(/^([^:]+):(\d+)-(\d+):(\d+)-(\d+)$/);
  if (!m) return null;
  const x1 = Number(m[2]);
  const x2 = Number(m[3]);
  const y1 = Number(m[4]);
  const y2 = Number(m[5]);
  if (x1 > x2 || y1 > y2) return null;
  return { map: m[1].trim(), x1, x2, y1, y2 };
}

function inBox(
  snap: ProfileSnapshot,
  box: { map: string; x1: number; x2: number; y1: number; y2: number },
): boolean {
  if (!snap.mapName || snap.mapX == null || snap.mapY == null) return false;
  if (snap.mapName.toLowerCase() !== box.map.toLowerCase()) return false;
  return snap.mapX >= box.x1 && snap.mapX <= box.x2 && snap.mapY >= box.y1 && snap.mapY <= box.y2;
}

function enrichRanks(snap: ProfileSnapshot, rankings: RankingMap): {
  classCode: string | null;
  rankOverall: number | null;
  rankClass: number | null;
  nextTargetName: string | null;
  nextTargetResets: number | null;
} {
  const code = classCodeFor(snap.class);
  const overall = findRank(rankings.overall, snap.name);
  const inClass = code ? findRank(rankings.byClass[code], snap.name) : null;
  return {
    classCode: code,
    rankOverall: overall?.rank ?? null,
    rankClass: inClass?.rank ?? null,
    nextTargetName: inClass?.nextTarget?.name ?? null,
    nextTargetResets: inClass?.nextTarget?.resets ?? null,
  };
}

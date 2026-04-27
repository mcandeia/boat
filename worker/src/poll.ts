import type { CharacterRow, Env, ProfileSnapshot, SubscriptionRow } from "./types";
import { parseMap, scrapeMany } from "./scraper";
import { now } from "./util";
import { sendWhatsApp } from "./whatsapp";

// One pass:
//   1. Pick every distinct character name that has at least one active sub.
//   2. Scrape them all in one Browser Rendering session.
//   3. For each character row, evaluate every active subscription against the
//      previous snapshot vs the new one, fire WhatsApp alerts, set cooldowns.
//   4. Persist the new snapshot.
export async function pollOnce(env: Env): Promise<{ scraped: number; fired: number }> {
  const t0 = now();
  const distinctNames = await env.DB
    .prepare(
      `SELECT DISTINCT c.name
         FROM characters c
         JOIN subscriptions s
           ON s.character_id = c.id AND s.active = 1
        WHERE c.next_check_at <= ?`,
    )
    .bind(t0)
    .all<{ name: string }>();

  const names = (distinctNames.results ?? []).map((r) => r.name);
  if (names.length === 0) return { scraped: 0, fired: 0 };

  const snapshots = await scrapeMany(env, names);

  // Pull all character rows for those names, plus their owners' WhatsApp.
  const placeholders = names.map(() => "?").join(",");
  const charsRes = await env.DB
    .prepare(
      `SELECT c.*, u.whatsapp AS owner_whatsapp
         FROM characters c
         JOIN users u ON u.id = c.user_id
        WHERE c.name IN (${placeholders})`,
    )
    .bind(...names)
    .all<CharacterRow & { owner_whatsapp: string }>();

  const subsRes = await env.DB
    .prepare(
      `SELECT * FROM subscriptions
        WHERE active = 1
          AND character_id IN (
            SELECT id FROM characters WHERE name IN (${placeholders})
          )`,
    )
    .bind(...names)
    .all<SubscriptionRow>();

  const charsById = new Map<number, CharacterRow & { owner_whatsapp: string }>();
  for (const c of charsRes.results ?? []) charsById.set(c.id, c);

  const subsByChar = new Map<number, SubscriptionRow[]>();
  for (const s of subsRes.results ?? []) {
    if (s.character_id == null) continue;
    const arr = subsByChar.get(s.character_id) ?? [];
    arr.push(s);
    subsByChar.set(s.character_id, arr);
  }

  const t = now();
  const cooldown = Number(env.COOLDOWN_SECONDS || "21600");
  let fired = 0;

  for (const char of charsById.values()) {
    const snap = snapshots.get(char.name);
    if (!snap || !snap.exists) continue;

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
    };

    for (const sub of subsByChar.get(char.id) ?? []) {
      if (sub.cooldown_until > t) continue;
      const trigger = evaluate(sub, prev, snap, !!char.is_gm);
      if (!trigger) continue;

      const msg = formatMessage(char.name, sub, snap);
      const sendRes = await sendWhatsApp(env, char.owner_whatsapp, msg);
      if (!sendRes.ok) {
        console.log(`whatsapp send failed for sub ${sub.id}: ${sendRes.status} ${sendRes.body}`);
        continue;
      }
      await env.DB
        .prepare(
          "UPDATE subscriptions SET cooldown_until = ?, last_fired_at = ? WHERE id = ?",
        )
        .bind(t + cooldown, t, sub.id)
        .run();
      fired++;
    }

    // Adaptive cadence: offline chars don't move much — wait an hour before
    // burning Browser Rendering quota on them. Online chars get the normal
    // ~10 minute cadence (slightly under the cron interval so a 5-minute
    // cron always finds them due).
    const nextCheck = t + (snap.status === "Offline" ? 3600 : 600);

    await env.DB
      .prepare(
        `UPDATE characters
            SET class = COALESCE(?, class),
                resets = COALESCE(?, resets),
                last_level = COALESCE(?, last_level),
                last_map = COALESCE(?, last_map),
                last_status = COALESCE(?, last_status),
                last_checked_at = ?,
                next_check_at = ?
          WHERE name = ?`,
      )
      .bind(snap.class, snap.resets, snap.level, snap.map, snap.status, t, nextCheck, char.name)
      .run();
  }

  return { scraped: snapshots.size, fired };
}

// True iff the subscription should fire given old vs new snapshot.
// All checks are "edge-triggered" — we only alert on the transition into the
// matching state, not while it remains in that state, so cooldown is a backup.
function evaluate(
  sub: SubscriptionRow,
  prev: ProfileSnapshot,
  next: ProfileSnapshot,
  isGm: boolean,
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
      // Not yet wired to a data source. Skipped silently for now.
      return false;
  }
}

function formatMessage(
  name: string,
  sub: SubscriptionRow,
  snap: ProfileSnapshot,
): string {
  switch (sub.event_type) {
    case "level_gte":
      return `🎯 ${name} reached level ${snap.level} (target ${sub.threshold}).`;
    case "map_eq":
      return `📍 ${name} entered ${snap.map}.`;
    case "coords_in":
      return `📍 ${name} is at ${snap.map} (zone match: ${sub.threshold}).`;
    case "status_eq":
      return `🟢 ${name} is now ${snap.status}.`;
    case "gm_online":
      return `🛡️ GM ${name} just came online.`;
    case "server_event":
      return `📣 Server event: ${sub.threshold}.`;
  }
}

// "Stadium:60-90:80-100" -> {map, x1, x2, y1, y2}
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

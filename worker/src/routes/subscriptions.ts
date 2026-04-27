import type { CharacterRow, Env, EventType, SubscriptionRow } from "../types";
import { bad, json, now } from "../util";

const EVENT_TYPES: ReadonlySet<EventType> = new Set([
  "level_gte",
  "map_eq",
  "status_eq",
  "gm_online",
  "server_event",
]);

export async function listSubscriptions(env: Env, userId: number): Promise<Response> {
  const rows = await env.DB
    .prepare("SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC")
    .bind(userId)
    .all<SubscriptionRow>();
  return json({ subscriptions: rows.results ?? [] });
}

export async function createSubscription(env: Env, userId: number, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    character_id?: number;
    event_type?: string;
    threshold?: string;
  };
  const eventType = body.event_type as EventType;
  if (!EVENT_TYPES.has(eventType)) return bad(400, "invalid event_type");

  // Validate threshold per event type, and verify char ownership when used.
  let threshold: string | null = (body.threshold ?? "").trim() || null;
  let characterId: number | null = body.character_id ?? null;

  if (eventType === "level_gte") {
    const n = Number(threshold);
    if (!Number.isInteger(n) || n < 1 || n > 1000) return bad(400, "level threshold must be 1..1000");
    threshold = String(n);
    if (!characterId) return bad(400, "character_id required");
  } else if (eventType === "map_eq") {
    if (!threshold) return bad(400, "map name required");
    if (!characterId) return bad(400, "character_id required");
  } else if (eventType === "status_eq") {
    const v = (threshold ?? "").toLowerCase();
    if (v !== "online" && v !== "offline") return bad(400, "status must be Online or Offline");
    threshold = v === "online" ? "Online" : "Offline";
    if (!characterId) return bad(400, "character_id required");
  } else if (eventType === "gm_online") {
    threshold = null;
    if (!characterId) return bad(400, "character_id required");
  } else if (eventType === "server_event") {
    if (!threshold) return bad(400, "event name required");
    characterId = null;
  }

  if (characterId !== null) {
    const owned = await env.DB
      .prepare("SELECT id, is_gm FROM characters WHERE id = ? AND user_id = ?")
      .bind(characterId, userId)
      .first<Pick<CharacterRow, "id" | "is_gm">>();
    if (!owned) return bad(404, "character not found");
    if (eventType === "gm_online" && !owned.is_gm) {
      return bad(400, "character is not flagged as GM");
    }
  }

  const t = now();
  const r = await env.DB
    .prepare(
      `INSERT INTO subscriptions
         (user_id, character_id, event_type, threshold, active, cooldown_until, created_at)
       VALUES (?, ?, ?, ?, 1, 0, ?)`,
    )
    .bind(userId, characterId, eventType, threshold, t)
    .run();
  return json({ ok: true, id: r.meta.last_row_id });
}

export async function deleteSubscription(env: Env, userId: number, id: number): Promise<Response> {
  const r = await env.DB
    .prepare("DELETE FROM subscriptions WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .run();
  if (r.meta.changes === 0) return bad(404, "not found");
  return json({ ok: true });
}

export async function toggleSubscription(env: Env, userId: number, id: number, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { active?: boolean };
  if (typeof body.active !== "boolean") return bad(400, "active boolean required");
  const r = await env.DB
    .prepare("UPDATE subscriptions SET active = ? WHERE id = ? AND user_id = ?")
    .bind(body.active ? 1 : 0, id, userId)
    .run();
  if (r.meta.changes === 0) return bad(404, "not found");
  return json({ ok: true });
}

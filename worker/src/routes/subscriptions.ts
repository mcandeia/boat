import type { CharacterRow, Env, EventType, SubscriptionRow } from "../types";
import { bad, json, now } from "../util";

const EVENT_TYPES: ReadonlySet<EventType> = new Set([
  "level_gte",
  "map_eq",
  "coords_in",
  "status_eq",
  "gm_online",
  "server_event",
]);

const COORDS_RE = /^[A-Za-z][A-Za-z0-9 _-]{0,30}:\d{1,3}-\d{1,3}:\d{1,3}-\d{1,3}$/;

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
  if (!EVENT_TYPES.has(eventType)) return bad(400, "tipo de evento inválido");

  // Validate threshold per event type, and verify char ownership when used.
  let threshold: string | null = (body.threshold ?? "").trim() || null;
  let characterId: number | null = body.character_id ?? null;

  if (eventType === "level_gte") {
    const n = Number(threshold);
    if (!Number.isInteger(n) || n < 1 || n > 1000) return bad(400, "nível alvo deve estar entre 1 e 1000");
    threshold = String(n);
    if (!characterId) return bad(400, "selecione um personagem");
  } else if (eventType === "map_eq") {
    if (!threshold) return bad(400, "nome do mapa obrigatório");
    if (!characterId) return bad(400, "selecione um personagem");
  } else if (eventType === "coords_in") {
    if (!threshold || !COORDS_RE.test(threshold)) {
      return bad(400, "use o formato 'Stadium:60-90:80-100'");
    }
    const [, , x1s, x2s, y1s, y2s] = threshold.match(/^([^:]+):(\d+)-(\d+):(\d+)-(\d+)$/)!;
    if (Number(x1s) > Number(x2s) || Number(y1s) > Number(y2s)) {
      return bad(400, "intervalo de coordenadas deve ser do menor para o maior");
    }
    if (!characterId) return bad(400, "selecione um personagem");
  } else if (eventType === "status_eq") {
    const v = (threshold ?? "").toLowerCase();
    if (v !== "online" && v !== "offline") return bad(400, "status deve ser Online ou Offline");
    threshold = v === "online" ? "Online" : "Offline";
    if (!characterId) return bad(400, "selecione um personagem");
  } else if (eventType === "gm_online") {
    threshold = null;
    if (!characterId) return bad(400, "selecione um personagem");
  } else if (eventType === "server_event") {
    if (!threshold) return bad(400, "nome do evento obrigatório");
    characterId = null;
  }

  if (characterId !== null) {
    const owned = await env.DB
      .prepare("SELECT id, is_gm FROM characters WHERE id = ? AND user_id = ?")
      .bind(characterId, userId)
      .first<Pick<CharacterRow, "id" | "is_gm">>();
    if (!owned) return bad(404, "personagem não encontrado");
    if (eventType === "gm_online" && !owned.is_gm) {
      return bad(400, "personagem não está marcado como GM");
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
  if (r.meta.changes === 0) return bad(404, "não encontrado");
  return json({ ok: true });
}

export async function toggleSubscription(env: Env, userId: number, id: number, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { active?: boolean };
  if (typeof body.active !== "boolean") return bad(400, "campo 'active' obrigatório");
  const r = await env.DB
    .prepare("UPDATE subscriptions SET active = ? WHERE id = ? AND user_id = ?")
    .bind(body.active ? 1 : 0, id, userId)
    .run();
  if (r.meta.changes === 0) return bad(404, "não encontrado");
  return json({ ok: true });
}

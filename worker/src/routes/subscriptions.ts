import type { CharacterRow, Env, EventType, ProfileSnapshot, SubscriptionRow, UserRow } from "../types";
import { bad, json, now } from "../util";
import { currentlyMatches, formatAlert } from "../messages";
import { parseMap } from "../scraper";
import { sendTelegram } from "../telegram";

const EVENT_TYPES: ReadonlySet<EventType> = new Set([
  "level_gte",
  "map_eq",
  "coords_in",
  "status_eq",
  "gm_online",
  "server_event",
  "level_stale",
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
    custom_message?: string;
  };
  const eventType = body.event_type as EventType;
  if (!EVENT_TYPES.has(eventType)) return bad(400, "tipo de evento inválido");

  // Validate threshold per event type, and verify char ownership when used.
  let threshold: string | null = (body.threshold ?? "").trim() || null;
  let characterId: number | null = body.character_id ?? null;
  let customMessage: string | null = (body.custom_message ?? "").trim() || null;
  if (customMessage && customMessage.length > 200) {
    return bad(400, "mensagem customizada muito longa (máx 200 caracteres)");
  }

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
    // Threshold format: "<event>|<room>|<leadMinutes>", e.g. "Chaos Castle|vip|5".
    if (!threshold || !/^[^|]+\|(free|vip|special)\|\d+$/i.test(threshold)) {
      return bad(400, "use o formato 'Nome do Evento|free|5'");
    }
    threshold = threshold.replace(/^([^|]+)\|(free|vip|special)\|(\d+)$/i, (_a, n, r, m) => `${n.trim()}|${r.toLowerCase()}|${Number(m)}`);
    characterId = null;
  } else if (eventType === "level_stale") {
    const n = Number(threshold);
    if (!Number.isInteger(n) || n < 1 || n > 1440) return bad(400, "minutos sem subir level deve estar entre 1 e 1440");
    threshold = String(n);
    if (!characterId) return bad(400, "selecione um personagem");
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
         (user_id, character_id, event_type, threshold, active, cooldown_until, created_at, custom_message)
       VALUES (?, ?, ?, ?, 1, 0, ?, ?)`
    )
    .bind(userId, characterId, eventType, threshold, t, customMessage)
    .run();

  // If the alert's condition already holds with the data we have on file,
  // fire one notification immediately. Makes brand-new subs feel responsive
  // (otherwise the edge-trigger means an already-true state never alerts).
  // Then set cooldown so the cron won't re-fire on the next tick.
  const subId = r.meta.last_row_id;
  await maybeFireOnCreate(env, userId, Number(subId), {
    user_id: userId,
    character_id: characterId,
    event_type: eventType,
    threshold,
    active: 1,
    cooldown_until: 0,
    last_fired_at: null,
    created_at: t,
    custom_message: customMessage,
    id: Number(subId),
  });

  return json({ ok: true, id: subId });
}

async function maybeFireOnCreate(
  env: Env,
  userId: number,
  subId: number,
  sub: SubscriptionRow,
): Promise<void> {
  if (!sub.character_id) return;             // server_event only

  const char = await env.DB
    .prepare("SELECT * FROM characters WHERE id = ? AND user_id = ?")
    .bind(sub.character_id, userId)
    .first<CharacterRow>();
  if (!char || char.last_checked_at == null) return;   // never scraped, nothing to evaluate

  const parsed = parseMap(char.last_map);
  const snap: ProfileSnapshot = {
    name: char.name,
    class: char.class,
    resets: char.resets,
    level: char.last_level,
    map: char.last_map,
    mapName: parsed.name,
    mapX: parsed.x,
    mapY: parsed.y,
    status: char.last_status as "Online" | "Offline" | null,
    exists: true,
    scraped: true,
  };

  if (!currentlyMatches(sub, snap, !!char.is_gm, {
    last_level_change_at: char.last_level_change_at,
    now: now(),
  })) return;

  const owner = await env.DB
    .prepare("SELECT telegram_chat_id FROM users WHERE id = ?")
    .bind(userId)
    .first<Pick<UserRow, "telegram_chat_id">>();
  if (!owner) return;

  const msg = formatAlert(char.name, sub, snap);
  const send = await sendTelegram(env, owner.telegram_chat_id, msg);
  if (!send.ok) {
    console.log(`fire-on-create send failed for sub ${subId}: ${send.status} ${send.body}`);
    return;
  }

  const t = now();
  const cooldown = Number(env.COOLDOWN_SECONDS || "3600");
  await env.DB
    .prepare("UPDATE subscriptions SET cooldown_until = ?, last_fired_at = ? WHERE id = ?")
    .bind(t + cooldown, t, subId)
    .run();
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

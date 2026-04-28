import type { ProfileSnapshot, SubscriptionRow } from "./types";
import { escHtml } from "./telegram";

// "Currently matches" — non-edge check used by createSubscription so a
// freshly-added alert fires once if the condition is already true. After
// that the regular edge-trigger logic in poll.ts takes over so we don't
// spam every poll.
export function currentlyMatches(
  sub: SubscriptionRow,
  snap: ProfileSnapshot,
  isGm: boolean,
  ctx?: { last_level_change_at: number | null; now: number },
): boolean {
  switch (sub.event_type) {
    case "level_gte": {
      const target = Number(sub.threshold);
      return Number.isFinite(target) && snap.level != null && snap.level >= target;
    }
    case "map_eq": {
      const want = (sub.threshold ?? "").toLowerCase();
      return !!want && (snap.mapName ?? "").toLowerCase() === want;
    }
    case "coords_in": {
      const m = (sub.threshold ?? "").match(/^([^:]+):(\d+)-(\d+):(\d+)-(\d+)$/);
      if (!m || snap.mapName == null || snap.mapX == null || snap.mapY == null) return false;
      const [, mapWant, x1, x2, y1, y2] = m;
      if (snap.mapName.toLowerCase() !== mapWant.trim().toLowerCase()) return false;
      return snap.mapX >= +x1 && snap.mapX <= +x2 && snap.mapY >= +y1 && snap.mapY <= +y2;
    }
    case "status_eq":
      return !!sub.threshold && snap.status === sub.threshold;
    case "gm_online":
      return isGm && snap.status === "Online";
    case "server_event":
      return false;
    case "level_stale": {
      if (!ctx || ctx.last_level_change_at == null) return false;
      const minutes = Number(sub.threshold);
      if (!Number.isFinite(minutes) || minutes < 1) return false;
      return (ctx.now - ctx.last_level_change_at) >= minutes * 60;
    }
  }
}

// HTML messages — Telegram parse_mode: "HTML". Use escHtml on any text that
// might contain user-supplied content (character name, threshold, scraped
// map string) to be safe against accidental tags.
export function formatAlert(
  charName: string,
  sub: SubscriptionRow,
  snap: ProfileSnapshot,
): string {
  const n = escHtml(charName);
  const thr = escHtml(sub.threshold ?? "");
  const mapName = escHtml(snap.mapName ?? snap.map ?? "");
  const coords = (snap.mapX != null && snap.mapY != null) ? `${snap.mapX}/${snap.mapY}` : null;
  const where = mapName
    ? (coords ? `<b>${mapName}</b> (${escHtml(coords)})` : `<b>${mapName}</b>`)
    : `<span class="text-muted">?</span>`;
  const lv = snap.level != null ? String(snap.level) : "?";
  const rr = snap.resets != null ? String(snap.resets) : "?";
  const status = escHtml(snap.status ?? "");
  if (sub.custom_message) {
    const dict: Record<string, string> = {
      username: n,
      char: n,
      lv: snap.level != null ? String(snap.level) : "?",
      level: snap.level != null ? String(snap.level) : "?",
      resets: snap.resets != null ? String(snap.resets) : "?",
      map: escHtml(snap.mapName ?? snap.map ?? ""),
      status: escHtml(snap.status ?? ""),
      threshold: thr,
    };
    if (sub.event_type === "coords_in") {
      dict.coords = thr;
    }
    return applyTemplate(sub.custom_message, dict);
  }
  switch (sub.event_type) {
    case "level_gte":
      return `🎯 <b>${n}</b> chegou no nível <b>${lv}</b> (alvo ${thr}).\n📍 Local: ${where}.\n♻️ Resets: <b>${rr}</b>.`;
    case "map_eq":
      return `📍 <b>${n}</b> entrou em ${where}.\n🎚️ Level: <b>${lv}</b> • ♻️ Resets: <b>${rr}</b>.`;
    case "coords_in":
      return `📍 <b>${n}</b> está em ${where}.\n🧭 Zona do alerta: <b>${thr}</b>.\n🎚️ Level: <b>${lv}</b> • ♻️ Resets: <b>${rr}</b>.`;
    case "status_eq":
      return `🟢 <b>${n}</b> agora está <b>${status}</b>.\n📍 Local: ${where}.\n🎚️ Level: <b>${lv}</b> • ♻️ Resets: <b>${rr}</b>.`;
    case "gm_online":
      return `🛡️ GM <b>${n}</b> acabou de ficar online.\n📍 Local: ${where}.\n🎚️ Level: <b>${lv}</b> • ♻️ Resets: <b>${rr}</b>.`;
    case "server_event":
      return `📣 Evento do servidor: <b>${thr}</b>.`;
    case "level_stale":
      return `⏸️ <b>${n}</b> sem subir level há <b>${thr} min</b>.\n🟢 Status: <b>${status || "?"}</b> • 📍 Local: ${where}.\n🎚️ Level: <b>${lv}</b> • ♻️ Resets: <b>${rr}</b>.`;
  }
}

function applyTemplate(tpl: string, dict: Record<string, string>): string {
  // Escape the template itself (so users can't inject HTML), then
  // substitute whitelisted tokens.
  let out = escHtml(tpl);
  for (const [k, v] of Object.entries(dict)) {
    const re = new RegExp("\\\\{" + k + "\\\\}", "gi");
    out = out.replace(re, v);
  }
  return out;
}

type EntryReq = {
  itemLabel: string;         // e.g. "Armor of Guardsman"
  itemTiered: boolean;       // +1..+7 by level range
  npc?: { name: string; map: string; coords?: string };
};

function tierForLevel(level: number | null): { tier: number; min: number; max: number } | null {
  if (level == null || !Number.isFinite(level)) return null;
  // Classic MU ticket ranges. Conservative defaults.
  const ranges = [
    { tier: 1, min: 15, max: 49 },
    { tier: 2, min: 50, max: 119 },
    { tier: 3, min: 120, max: 179 },
    { tier: 4, min: 180, max: 239 },
    { tier: 5, min: 240, max: 299 },
    { tier: 6, min: 300, max: 349 },
    { tier: 7, min: 350, max: 9999 },
  ];
  for (const r of ranges) if (level >= r.min && level <= r.max) return r;
  return null;
}

function serverEventEntryReq(eventNameRaw: string): EntryReq | null {
  const n = (eventNameRaw || "").toLowerCase();
  if (!n) return null;
  if (n.includes("chaos castle")) {
    return { itemLabel: "Armor of Guardsman", itemTiered: true, npc: { name: "Chaos Goblin", map: "Noria", coords: "168,96" } };
  }
  if (n.includes("blood castle")) {
    return { itemLabel: "Blood Bone", itemTiered: true, npc: { name: "Archangel Messenger", map: "Devias", coords: "198,47" } };
  }
  if (n.includes("devil square")) {
    return { itemLabel: "Devil's Invitation", itemTiered: true, npc: { name: "Charon", map: "Noria", coords: "167,90" } };
  }
  return null;
}

export function formatServerEventAlert(opts: {
  name: string;
  room: string;
  leadMinutes: number;
  // Best-effort: user's highest character level (so we can suggest the right ticket).
  userMaxLevel?: number | null;
  customMessage?: string | null;
}): string {
  const name = escHtml(opts.name);
  const room = escHtml((opts.room || "").toUpperCase());
  const lead = Number(opts.leadMinutes) || 0;

  const req = serverEventEntryReq(opts.name);
  const tier = tierForLevel(opts.userMaxLevel ?? null);

  let extra = "";
  let itemLine = "";
  let npcLine = "";
  if (req) {
    if (req.itemTiered) {
      if (tier) {
        itemLine = `🎟️ Entrada: <b>${escHtml(req.itemLabel)} +${tier.tier}</b> (lvl ${tier.min}–${tier.max}).`;
      } else {
        itemLine = `🎟️ Entrada: <b>${escHtml(req.itemLabel)} +N</b> (depende do level; +1…+7).`;
      }
    } else {
      itemLine = `🎟️ Entrada: <b>${escHtml(req.itemLabel)}</b>.`;
    }
    if (req.npc) {
      const loc = `${req.npc.map}${req.npc.coords ? " (" + req.npc.coords + ")" : ""}`;
      npcLine = `📍 NPC: <b>${escHtml(req.npc.name)}</b> — ${escHtml(loc)}.`;
    }
  }
  if (itemLine) extra += "\n" + itemLine;
  if (npcLine) extra += "\n" + npcLine;

  if (opts.customMessage) {
    const dict: Record<string, string> = {
      event: name,
      room,
      lead: String(lead),
      leadMinutes: String(lead),
      threshold: escHtml(opts.name + "|" + (opts.room || "").toLowerCase() + "|" + lead),
      item: itemLine ? itemLine.replace(/^🎟️ Entrada:\s*/i, "").replace(/\.$/, "") : "",
      npc: req?.npc?.name ? escHtml(req.npc.name) : "",
      npc_map: req?.npc?.map ? escHtml(req.npc.map) : "",
      npc_coords: req?.npc?.coords ? escHtml(req.npc.coords) : "",
    };
    return applyTemplate(opts.customMessage, dict);
  }

  return `📣 <b>${name}</b> (${room}) começa em <b>${lead} min</b>.${extra}`;
}


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
      // Edge-trigger: same guard as the cron's evaluate() — don't fire
      // for an idle run we've already alerted on.
      if (sub.last_fired_at != null && ctx.last_level_change_at <= sub.last_fired_at) return false;
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
    const re = new RegExp("\\{" + k + "\\}", "gi");
    out = out.replace(re, v);
  }
  return out;
}

type EntryReq = {
  itemLabel: string;         // e.g. "Armor of Guardsman"
  itemTiered: boolean;       // +1..+7 by level range
  tierTable: TierTableKey;   // 'bc' for BC/CC, 'ds' for Devil Square
  npc?: { name: string; map: string; coords?: string };
};

// Per-event tier brackets. mupatos doesn't publish exact tables in
// /eventos so we use the canonical community ranges. BC + CC share the
// same brackets; DS is wider (every tier covers ~50 more levels). MG/DL
// get a shifted (lower) version of each table because those classes are
// created at higher level and the server balancing lets them queue for
// bigger tiers earlier. Easy to tune if a player corrects us.

type TierRange = { tier: number; min: number; max: number };
type TierTableKey = "bc" | "ds";

const TIER_RANGES_BC: TierRange[] = [
  { tier: 1, min: 15,  max: 80 },
  { tier: 2, min: 81,  max: 130 },
  { tier: 3, min: 131, max: 180 },
  { tier: 4, min: 181, max: 230 },
  { tier: 5, min: 231, max: 280 },
  { tier: 6, min: 281, max: 330 },
  { tier: 7, min: 331, max: 9999 },
];
const TIER_RANGES_BC_MG_DL: TierRange[] = [
  { tier: 1, min: 15,  max: 50 },
  { tier: 2, min: 51,  max: 100 },
  { tier: 3, min: 101, max: 150 },
  { tier: 4, min: 151, max: 200 },
  { tier: 5, min: 201, max: 250 },
  { tier: 6, min: 251, max: 300 },
  { tier: 7, min: 301, max: 9999 },
];
// Source of truth: the in-game DS NPC (Charon) lists these ranges.
// DS only goes up to 6 on mupatos; the "tier 7" entry is a sentinel
// for chars past the cap so they still resolve to a row instead of null.
const TIER_RANGES_DS: TierRange[] = [
  { tier: 1, min: 15,  max: 110 },
  { tier: 2, min: 111, max: 160 },
  { tier: 3, min: 161, max: 210 },
  { tier: 4, min: 211, max: 260 },
  { tier: 5, min: 261, max: 310 },
  { tier: 6, min: 311, max: 400 },
  { tier: 7, min: 401, max: 9999 },
];
// MG/DL are -30 across the board (same magnitude as the BC shift),
// so a level 280 MG sits in the same tier as a level 310 BK.
const TIER_RANGES_DS_MG_DL: TierRange[] = [
  { tier: 1, min: 15,  max: 80 },
  { tier: 2, min: 81,  max: 130 },
  { tier: 3, min: 131, max: 180 },
  { tier: 4, min: 181, max: 230 },
  { tier: 5, min: 231, max: 280 },
  { tier: 6, min: 281, max: 370 },
  { tier: 7, min: 371, max: 9999 },
];

function isMgOrDl(charClass: string | null | undefined): boolean {
  if (!charClass) return false;
  const c = charClass.toLowerCase();
  // Cover the base names + the known evolutions across MU versions.
  return c.includes("magic gladiator")
      || c.includes("duel master")
      || c.includes("dark lord")
      || c.includes("lord emperor");
}

function tierTableFor(tableKey: TierTableKey, charClass: string | null | undefined): TierRange[] {
  const mg = isMgOrDl(charClass);
  if (tableKey === "ds") return mg ? TIER_RANGES_DS_MG_DL : TIER_RANGES_DS;
  return mg ? TIER_RANGES_BC_MG_DL : TIER_RANGES_BC;
}

function tierForLevel(level: number | null, tableKey: TierTableKey, charClass?: string | null): TierRange | null {
  if (level == null || !Number.isFinite(level)) return null;
  for (const r of tierTableFor(tableKey, charClass)) if (level >= r.min && level <= r.max) return r;
  return null;
}

// mupatos labels Blood Castle events as "Blood Castle 1..7". The trailing
// digit is the cloak tier the player needs to bring. Same convention for
// other tiered events.
function fixedTierFromName(eventNameRaw: string): number | null {
  const m = (eventNameRaw || "").trim().match(/(\d)$/);
  if (!m) return null;
  const t = Number(m[1]);
  return t >= 1 && t <= 7 ? t : null;
}

function serverEventEntryReq(eventNameRaw: string): EntryReq | null {
  const n = (eventNameRaw || "").toLowerCase();
  if (!n) return null;
  if (n.includes("chaos castle")) {
    return { itemLabel: "Armor of Guardsman", itemTiered: true, tierTable: "bc", npc: { name: "Chaos Goblin", map: "Noria", coords: "168,96" } };
  }
  if (n.includes("blood castle")) {
    return { itemLabel: "Invisibility Cloak", itemTiered: true, tierTable: "bc", npc: { name: "Archangel Messenger", map: "Devias", coords: "198,47" } };
  }
  if (n.includes("devil square")) {
    return { itemLabel: "Devil's Invitation", itemTiered: true, tierTable: "ds", npc: { name: "Charon", map: "Noria", coords: "167,90" } };
  }
  return null;
}

// Pick the best char from a user's roster for a given target tier. If
// the event has a fixed tier (e.g. "Blood Castle 5"), prefer chars whose
// level qualifies for THAT tier; fall back to the next-lowest qualifying
// tier. If no fixed tier, pick the highest-tier char (= biggest reward).
function pickBestCharForTier(
  chars: Array<{ name: string; level: number | null; charClass?: string | null }>,
  fixedTier: number | null,
  tableKey: TierTableKey,
): { name: string; level: number; tier: number; charClass: string | null } | null {
  const ranked = chars
    .filter((c): c is { name: string; level: number; charClass?: string | null } => c.level != null && Number.isFinite(c.level))
    .map((c) => {
      const cls = c.charClass ?? null;
      const r = tierForLevel(c.level, tableKey, cls);
      return { name: c.name, level: c.level, tier: r?.tier ?? 0, charClass: cls };
    })
    .filter((c) => c.tier > 0);
  if (ranked.length === 0) return null;
  if (fixedTier != null) {
    // Char must be tier >= fixedTier (lower-tier chars can't enter higher
    // BC). Prefer the smallest qualifying tier so they bring the right
    // cloak; tie-break by highest level inside that tier.
    const eligible = ranked.filter((c) => c.tier >= fixedTier);
    if (eligible.length === 0) return null;
    eligible.sort((a, b) => a.tier - b.tier || b.level - a.level);
    return eligible[0];
  }
  // No fixed tier — recommend the highest-tier char.
  ranked.sort((a, b) => b.tier - a.tier || b.level - a.level);
  return ranked[0];
}

export function formatServerEventAlert(opts: {
  name: string;
  room: string;
  leadMinutes: number;
  // The user's chars (name + level + class) — used to suggest THE
  // specific char best suited for this event's tier. Class lets us
  // apply the MG/DL shifted brackets so a 250 MG isn't told they need
  // BC5 when the server actually qualifies them for BC6.
  userChars?: Array<{ name: string; level: number | null; charClass?: string | null }>;
  // Back-compat shim: if only userMaxLevel is supplied (old callers),
  // we wrap it as a one-element char list with name="?".
  userMaxLevel?: number | null;
  customMessage?: string | null;
}): string {
  const name = escHtml(opts.name);
  const room = escHtml((opts.room || "").toUpperCase());
  const lead = Number(opts.leadMinutes) || 0;

  const req = serverEventEntryReq(opts.name);
  const fixedTier = fixedTierFromName(opts.name);

  // Normalise input: prefer userChars; fall back to userMaxLevel.
  const chars: Array<{ name: string; level: number | null; charClass?: string | null }> =
    opts.userChars && opts.userChars.length > 0
      ? opts.userChars
      : opts.userMaxLevel != null
      ? [{ name: "?", level: opts.userMaxLevel, charClass: null }]
      : [];
  const best = req?.itemTiered ? pickBestCharForTier(chars, fixedTier, req.tierTable) : null;

  let extra = "";
  let itemLine = "";
  let npcLine = "";
  let recLine = "";
  if (req) {
    if (req.itemTiered) {
      // Display tier: fixed by event name when present, else inferred
      // from the recommended char's level, else generic placeholder.
      const displayTier = fixedTier ?? best?.tier ?? null;
      if (displayTier != null) {
        // Show the level range for THIS event type (BC vs DS) and the
        // recommended char's class (MG/DL shifted, else standard).
        const table = tierTableFor(req.tierTable, best?.charClass);
        const range = table.find((r) => r.tier === displayTier);
        const levelRange = range ? ` (lvl ${range.min}–${range.max}${isMgOrDl(best?.charClass) ? ", MG/DL" : ""})` : "";
        itemLine = `🎟️ Entrada: <b>${escHtml(req.itemLabel)} +${displayTier}</b>${levelRange}.`;
      } else {
        itemLine = `🎟️ Entrada: <b>${escHtml(req.itemLabel)} +N</b> (depende do level; +1…+7).`;
      }
      if (best) {
        // Mention the picked char unless the placeholder ("?") came from
        // the back-compat path — no point recommending an unnamed char.
        if (best.name !== "?") {
          recLine = `🎮 Sugestão: <b>${escHtml(best.name)}</b> (lvl ${best.level}).`;
        }
      } else if (chars.length > 0) {
        // The user has chars but none qualify for the required tier.
        recLine = `⚠️ Nenhum dos seus chars atinge o tier necessário.`;
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
  if (recLine) extra += "\n" + recLine;
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
      char: best && best.name !== "?" ? escHtml(best.name) : "",
      char_level: best ? String(best.level) : "",
      tier: best ? String(best.tier) : "",
    };
    return applyTemplate(opts.customMessage, dict);
  }

  return `📣 <b>${name}</b> (${room}) começa em <b>${lead} min</b>.${extra}`;
}

// Format an admin-managed custom event (GM event etc) for Telegram.
// Schedule is already evaluated by the cron — this is just rendering.
export function formatCustomEventAlert(opts: {
  name: string;
  gmName?: string | null;
  description?: string | null;
  gifts?: string | null;     // JSON array
  leadMinutes: number;
  scheduleHuman?: string | null;  // e.g. "diário 20:00", "sáb 21:00", "30/04 19:00"
}): string {
  const name = escHtml(opts.name);
  const lead = Number(opts.leadMinutes) || 0;

  let giftsLine = "";
  if (opts.gifts) {
    try {
      const arr = JSON.parse(opts.gifts) as Array<{ kind?: string; qty?: number; tier?: number; name?: string }>;
      const parts: string[] = [];
      for (const g of arr) {
        if (g.kind === "rarius" && g.qty != null) parts.push(`🪙 <b>${g.qty}</b> rarius`);
        else if (g.kind === "kundun" && g.tier != null) parts.push(`📦 Box of Kundun +<b>${g.tier}</b>`);
        else if (g.kind === "custom" && g.name) parts.push(`⚔️ ${escHtml(g.name)}`);
      }
      if (parts.length > 0) giftsLine = "\n🎁 Prêmios: " + parts.join(" · ");
    } catch { /* ignore */ }
  }

  const gmLine = opts.gmName ? `\n👤 GM: <b>${escHtml(opts.gmName)}</b>` : "";
  const descLine = opts.description ? `\n📝 ${escHtml(opts.description)}` : "";
  const whenLine = opts.scheduleHuman ? `\n⏰ Quando: <b>${escHtml(opts.scheduleHuman)}</b>` : "";

  return `🎉 <b>Evento GM: ${name}</b> começa em <b>${lead} min</b>.${gmLine}${giftsLine}${descLine}${whenLine}`;
}


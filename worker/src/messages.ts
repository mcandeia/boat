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
  const map = escHtml(snap.map ?? "");
  switch (sub.event_type) {
    case "level_gte":
      return `🎯 <b>${n}</b> chegou no nível <b>${snap.level}</b> (alvo ${thr}).`;
    case "map_eq":
      return `📍 <b>${n}</b> entrou em <b>${map}</b>.`;
    case "coords_in":
      return `📍 <b>${n}</b> está em <b>${map}</b> (zona ${thr}).`;
    case "status_eq":
      return `🟢 <b>${n}</b> agora está <b>${escHtml(snap.status ?? "")}</b>.`;
    case "gm_online":
      return `🛡️ GM <b>${n}</b> acabou de ficar online.`;
    case "server_event":
      return `📣 Evento do servidor: <b>${thr}</b>.`;
  }
}


import type { Env } from "./types";
import { pollSingleChar } from "./poll";

// One Durable Object instance per character. Each instance owns its own
// 60-second alarm and is responsible for one scrape + alert evaluation
// per minute. Replaces the single-cron fan-out (which kept exhausting
// per-tick CPU) — work is now per-DO and isolated, so a slow scrape on
// one char doesn't delay the rest.
//
// State: minimal — char_id + (optional) name. All persistent business
// data still lives in D1; the DO is a timer + scheduler, nothing more.
//
// Lifecycle:
//   POST /init?charId=N  → store charId, schedule first alarm
//   POST /poke           → run alarm work right now (admin debug)
//   POST /stop           → cancel alarm; instance goes idle
//   GET  /status         → { charId, nextAlarm }
export class CharWatcher {
  private state: DurableObjectState;
  private env: Env;

  // Default cadence. Pass DO_ALARM_INTERVAL_SECS to tune without code changes.
  private get intervalMs(): number {
    const cfg = Number(this.env.DO_ALARM_INTERVAL_SECS ?? "60");
    return Math.max(15, Math.min(600, cfg)) * 1000;
  }

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/init") {
      const charId = Number(url.searchParams.get("charId") ?? "0");
      if (!Number.isInteger(charId) || charId <= 0) {
        return new Response("missing/invalid charId", { status: 400 });
      }
      await this.state.storage.put("charId", charId);
      // Stagger first fire within the first minute so spawning all DOs at
      // once doesn't cause a thundering herd against mupatos.
      const jitterMs = Math.floor(Math.random() * this.intervalMs);
      await this.state.storage.setAlarm(Date.now() + jitterMs);
      return Response.json({ ok: true, charId, firstAlarmInMs: jitterMs });
    }

    if (path === "/poke") {
      // Run the alarm body immediately; reschedule the next regular alarm.
      await this.runOne();
      await this.state.storage.setAlarm(Date.now() + this.intervalMs);
      return Response.json({ ok: true });
    }

    if (path === "/stop") {
      await this.state.storage.deleteAlarm();
      await this.state.storage.delete("charId");
      return Response.json({ ok: true });
    }

    if (path === "/status") {
      const charId = (await this.state.storage.get<number>("charId")) ?? null;
      const nextAlarm = await this.state.storage.getAlarm();
      return Response.json({ charId, nextAlarm });
    }

    return new Response("not found", { status: 404 });
  }

  // CF Workers calls this when the alarm time arrives. We always
  // reschedule the next alarm, even on failure — otherwise a bad scrape
  // would silently disable the watcher forever.
  async alarm(): Promise<void> {
    try {
      await this.runOne();
    } catch (e) {
      console.error("CharWatcher alarm failed:", (e as Error).message);
    } finally {
      // Add a small jitter (<= 5s) so chars don't all fire on the same second.
      const jitter = Math.floor(Math.random() * 5_000);
      await this.state.storage.setAlarm(Date.now() + this.intervalMs + jitter);
    }
  }

  private async runOne(): Promise<void> {
    const charId = await this.state.storage.get<number>("charId");
    if (!charId) {
      console.log("CharWatcher.runOne: no charId, skipping");
      return;
    }
    const r = await pollSingleChar(this.env, charId);
    if (r.fired > 0) console.log(`CharWatcher[${charId}]: fired=${r.fired}`);
  }
}

// Helpers for the rest of the worker — keep DO-namespace lookups in one
// place so callers don't have to know about `idFromName`.
export function watcherStub(env: Env, charId: number): DurableObjectStub {
  const id = env.CHAR_WATCHERS.idFromName(String(charId));
  return env.CHAR_WATCHERS.get(id);
}

export async function spawnWatcher(env: Env, charId: number): Promise<void> {
  const stub = watcherStub(env, charId);
  await stub.fetch("https://do/init?charId=" + charId, { method: "POST" });
}

export async function stopWatcher(env: Env, charId: number): Promise<void> {
  const stub = watcherStub(env, charId);
  await stub.fetch("https://do/stop", { method: "POST" }).catch(() => {});
}

export async function pokeWatcher(env: Env, charId: number): Promise<void> {
  const stub = watcherStub(env, charId);
  await stub.fetch("https://do/poke", { method: "POST" });
}

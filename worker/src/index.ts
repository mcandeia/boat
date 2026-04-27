import type { Env } from "./types";
import { bad, json } from "./util";
import { readSession } from "./session";
import { logout, requestPin, verifyPin } from "./routes/auth";
import {
  createCharacter,
  deleteCharacter,
  listCharacters,
  lookupCharacter,
} from "./routes/characters";
import {
  createSubscription,
  deleteSubscription,
  listSubscriptions,
  toggleSubscription,
} from "./routes/subscriptions";
import { me } from "./routes/me";
import { pollOnce } from "./poll";
import { INDEX_HTML } from "./ui";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;
    const method = req.method;
    const cookie = req.headers.get("cookie");

    try {
      if (pathname === "/" || pathname === "/index.html") {
        return new Response(INDEX_HTML, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }

      // ---- public auth routes ----
      if (pathname === "/api/auth/request-pin" && method === "POST") return await requestPin(env, req);
      if (pathname === "/api/auth/verify-pin" && method === "POST") return await verifyPin(env, req);
      if (pathname === "/api/auth/logout" && method === "POST") return logout(env);

      // ---- everything below requires a session ----
      const sess = await readSession(env, cookie);
      if (!sess) return bad(401, "not signed in");
      const userId = sess.userId;

      if (pathname === "/api/me" && method === "GET") return await me(env, userId);

      if (pathname === "/api/characters" && method === "GET") return await listCharacters(env, userId);
      if (pathname === "/api/characters" && method === "POST") return await createCharacter(env, userId, req);
      if (pathname === "/api/characters/lookup" && method === "GET") {
        return await lookupCharacter(env, url.searchParams.get("name") ?? "");
      }
      const charDelete = pathname.match(/^\/api\/characters\/(\d+)$/);
      if (charDelete && method === "DELETE") {
        return await deleteCharacter(env, userId, Number(charDelete[1]));
      }

      if (pathname === "/api/subscriptions" && method === "GET") return await listSubscriptions(env, userId);
      if (pathname === "/api/subscriptions" && method === "POST") return await createSubscription(env, userId, req);
      const subMatch = pathname.match(/^\/api\/subscriptions\/(\d+)$/);
      if (subMatch && method === "DELETE") {
        return await deleteSubscription(env, userId, Number(subMatch[1]));
      }
      if (subMatch && method === "PATCH") {
        return await toggleSubscription(env, userId, Number(subMatch[1]), req);
      }

      // Manual cron trigger for testing — guarded by an admin secret.
      if (pathname === "/admin/poll" && method === "POST") {
        const auth = req.headers.get("authorization");
        if (!env.SESSION_SECRET || auth !== `Bearer ${env.SESSION_SECRET}`) {
          return bad(403, "forbidden");
        }
        const r = await pollOnce(env);
        return json({ ok: true, ...r });
      }

      return bad(404, "not found");
    } catch (err) {
      console.error("unhandled", err);
      return bad(500, (err as Error).message);
    }
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      pollOnce(env)
        .then((r) => console.log(`poll: scraped=${r.scraped} fired=${r.fired}`))
        .catch((e) => console.error("poll failed", e)),
    );
  },
};

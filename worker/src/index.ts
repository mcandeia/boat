import type { Env } from "./types";
import { bad, json } from "./util";
import { readSession } from "./session";
import { logout, pollTelegramLogin, startTelegramLogin } from "./routes/auth";
import {
  createCharacter,
  deleteCharacter,
  listCharacters,
  lookupCharacter,
  refreshCharacter,
} from "./routes/characters";
import {
  createSubscription,
  deleteSubscription,
  listSubscriptions,
  toggleSubscription,
} from "./routes/subscriptions";
import { me } from "./routes/me";
import {
  adminCharHistory,
  adminListCharSubs,
  adminListChars,
  adminRefreshChar,
  adminRunCron,
  adminSetBlocked,
} from "./routes/admin";
import { telegramWebhook } from "./routes/telegram-webhook";
import { pollOnce } from "./poll";
import { setTelegramWebhook } from "./telegram";
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
      if (pathname === "/api/auth/telegram/start" && method === "POST") {
        return await startTelegramLogin(env);
      }
      if (pathname === "/api/auth/telegram/status" && method === "GET") {
        return await pollTelegramLogin(env, url.searchParams.get("token") ?? "");
      }
      if (pathname === "/api/auth/logout" && method === "POST") return logout(env);

      // ---- Telegram webhook (public, secret-token guarded) ----
      if (pathname === "/api/telegram/webhook" && method === "POST") {
        return await telegramWebhook(env, req);
      }

      // ---- Local dev login backdoor ----
      if (pathname === "/dev-login" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
        await env.DB.prepare(`
          INSERT INTO users (telegram_chat_id, telegram_username, first_name, created_at, admin)
          VALUES (123456789, 'dev_user', 'Dev Local', 0, 1)
          ON CONFLICT(telegram_chat_id) DO UPDATE SET admin = 1
        `).run();
        const user = await env.DB.prepare("SELECT id FROM users WHERE telegram_chat_id = 123456789").first<{id: number}>();
        if (user) {
          const { createSession, setCookieHeader } = await import("./session");
          const token = await createSession(env, user.id);
          return new Response("Redirecionando...", {
            status: 302,
            headers: {
              "Location": "/",
              "Set-Cookie": setCookieHeader(env, token)
            }
          });
        }
      }


      // ---- everything below requires a session ----
      const sess = await readSession(env, cookie);
      if (!sess) return bad(401, "você não está autenticado");
      const userId = sess.userId;

      if (pathname === "/api/me" && method === "GET") return await me(env, userId);

      if (pathname === "/api/characters" && method === "GET") return await listCharacters(env, userId);
      if (pathname === "/api/characters" && method === "POST") return await createCharacter(env, userId, req);
      if (pathname === "/api/characters/lookup" && method === "GET") {
        return await lookupCharacter(env, url.searchParams.get("name") ?? "");
      }
      const charById = pathname.match(/^\/api\/characters\/(\d+)$/);
      if (charById && method === "DELETE") {
        return await deleteCharacter(env, userId, Number(charById[1]));
      }
      const charRefresh = pathname.match(/^\/api\/characters\/(\d+)\/refresh$/);
      if (charRefresh && method === "POST") {
        return await refreshCharacter(env, userId, Number(charRefresh[1]));
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

      // ---- admin routes (gated by users.admin = 1) ----
      if (pathname.startsWith("/api/admin/")) {
        const isAdmin = await env.DB
          .prepare("SELECT admin FROM users WHERE id = ?")
          .bind(userId)
          .first<{ admin: number }>()
          .then((r) => !!r?.admin);
        if (!isAdmin) return bad(403, "acesso restrito a admins");

        if (pathname === "/api/admin/chars" && method === "GET") return await adminListChars(env);
        const charSet = pathname.match(/^\/api\/admin\/chars\/(\d+)$/);
        if (charSet && method === "PATCH") return await adminSetBlocked(env, Number(charSet[1]), req);
        const charRefresh = pathname.match(/^\/api\/admin\/chars\/(\d+)\/refresh$/);
        if (charRefresh && method === "POST") return await adminRefreshChar(env, Number(charRefresh[1]));
        const charSubs = pathname.match(/^\/api\/admin\/chars\/(\d+)\/subs$/);
        if (charSubs && method === "GET") return await adminListCharSubs(env, Number(charSubs[1]));
        const charHistory = pathname.match(/^\/api\/admin\/chars\/(\d+)\/history$/);
        if (charHistory && method === "GET") return await adminCharHistory(env, Number(charHistory[1]), req);
        if (pathname === "/api/admin/poll" && method === "POST") return await adminRunCron(env);
      }

      // ---- maintenance (Bearer SESSION_SECRET) — for ops/CI use ----
      if (pathname.startsWith("/admin/")) {
        const auth = req.headers.get("authorization");
        if (!env.SESSION_SECRET || auth !== `Bearer ${env.SESSION_SECRET}`) {
          return bad(403, "proibido");
        }
        if (pathname === "/admin/telegram/set-webhook" && method === "POST") {
          const webhookUrl = `${url.origin}/api/telegram/webhook`;
          const r = await setTelegramWebhook(env, webhookUrl);
          return json({ ok: r.ok, status: r.status, body: r.body, webhookUrl });
        }
      }

      return bad(404, "rota não encontrada");
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

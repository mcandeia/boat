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

      // TEMP diagnostic 2: plain fetch() with browser-like headers.
      // mupatos.com.br is fronted by Cloudflare; CF-to-CF traffic might
      // pass where curl-from-laptop gets 403. If this works, we can
      // ditch Browser Rendering entirely.
      if (pathname === "/diag/fetch" && method === "GET") {
        const name = url.searchParams.get("name") || "daddy";
        const target = `${env.PROFILE_BASE_URL}/${encodeURIComponent(name)}`;
        const t0 = Date.now();
        try {
          const res = await fetch(target, {
            headers: {
              "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
              "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
              "accept-encoding": "gzip, deflate, br",
              "sec-fetch-dest": "document",
              "sec-fetch-mode": "navigate",
              "sec-fetch-site": "none",
              "sec-fetch-user": "?1",
              "upgrade-insecure-requests": "1",
            },
          });
          const text = await res.text();
          return json({
            took_ms: Date.now() - t0,
            status: res.status,
            content_type: res.headers.get("content-type"),
            length: text.length,
            // Only useful if we got HTML — show the table area we'd parse.
            has_profile_table: /<td[^>]*>\s*Personagem\s*<\/td>/i.test(text),
            head: text.slice(0, 600),
          });
        } catch (err) {
          return json({ error: (err as Error).message, took_ms: Date.now() - t0 });
        }
      }

      // TEMP diagnostic — runs Browser Rendering directly so we can see
      // any thrown error message verbatim instead of swallowing it.
      if (pathname === "/diag/scrape" && method === "GET") {
        const name = url.searchParams.get("name") || "daddy";
        const t0 = Date.now();
        const out: Record<string, unknown> = { name, took_ms: 0 };
        try {
          const puppeteer = (await import("@cloudflare/puppeteer")).default;
          const browser = await puppeteer.launch(env.BROWSER);
          out.launchedAt = Date.now() - t0;
          try {
            const page = await browser.newPage();
            await page.goto(`${env.PROFILE_BASE_URL}/${encodeURIComponent(name)}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
            const html = await page.content();
            out.htmlLength = html.length;
            out.htmlHead = html.slice(0, 400);
          } finally {
            await browser.close().catch(() => {});
          }
        } catch (err) {
          out.error = (err as Error).message;
          out.errorName = (err as Error).name;
          out.errorStack = (err as Error).stack?.split("\n").slice(0, 5).join("\n");
        }
        out.took_ms = Date.now() - t0;
        return json(out);
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

      // ---- admin (Bearer SESSION_SECRET) ----
      if (pathname.startsWith("/admin/")) {
        const auth = req.headers.get("authorization");
        if (!env.SESSION_SECRET || auth !== `Bearer ${env.SESSION_SECRET}`) {
          return bad(403, "proibido");
        }
        if (pathname === "/admin/poll" && method === "POST") {
          const r = await pollOnce(env);
          return json({ ok: true, ...r });
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

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
  userCharHistory,
} from "./routes/characters";
import {
  createSubscription,
  deleteSubscription,
  listSubscriptions,
  toggleSubscription,
} from "./routes/subscriptions";
import { me, setNickname } from "./routes/me";
import {
  commentListing,
  createOffer,
  createListing,
  decideOffer,
  deleteComment,
  deleteListing,
  expireListingOffers,
  getListing,
  getItemInfoFanz,
  imgProxy,
  listItems,
  listListings,
  listReceivedOffers,
  pingListing,
  reactListing,
  updateListing,
  warmupCatalog,
  getItemRules,
} from "./routes/market";
import { renderMarketListingSharePage } from "./routes/market-share";
import { publicListingOffer, publicListingPing } from "./routes/market-public";
import {
  adminHealth,
  adminCharHistory,
  adminClearCharSnapshots,
  adminListCharSubs,
  adminListChars,
  adminListEvents,
  adminRefreshEvents,
  adminPokeWatcher,
  adminRefreshChar,
  adminRefreshItems,
  adminWipeCatalog,
  adminImportItemRules,
  adminImportAncientSets,
  adminSyncAncientSetsFromFanz,
  adminScrapeShopItemRule,
  adminBackfillItemRulesFromSources,
  adminBackfillWorkflowOutput,
  adminBackfillWorkflowStatus,
  adminRunCron,
  adminSetBlocked,
  adminSpawnAllWatchers,
  adminUpdateEvent,
} from "./routes/admin";
import { telegramWebhook } from "./routes/telegram-webhook";
import {
  adminCreateCustomEvent,
  adminDeleteCustomEvent,
  adminUpdateCustomEvent,
  listCustomEvents,
  listMyGiftSubs,
  subscribeCustomEvent,
  subscribeGiftKind,
  unsubscribeCustomEvent,
  unsubscribeGiftKind,
} from "./routes/custom-events";
import { pollCustomEvents, pollServerEvents } from "./poll";
import { setTelegramWebhook } from "./telegram";
import { INDEX_HTML } from "./ui";

// Re-exported so wrangler can register the DO class. The class itself
// lives in char-watcher.ts; this is just the public binding.
export { CharWatcher } from "./char-watcher";

export { ItemRulesBackfillWorkflow } from "./workflows/item-rules-backfill";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;
    const method = req.method;
    const cookie = req.headers.get("cookie");

    try {
      if (pathname === "/" || pathname === "/index.html" || /^\/m\/\d+$/.test(pathname)) {
        // Single-page worker. The home, the listing PDP (/m/:id), and
        // the index alias all serve the same HTML; the JS picks up the
        // path and renders the right view (feed vs PDP).
        return new Response(INDEX_HTML, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            // Avoid stale UI after deploy/dev reload.
            "cache-control": "no-store, max-age=0",
          },
        });
      }

      // Public share page for Mercado listings — lightweight HTML with OG tags.
      const shareMatch = pathname.match(/^\/s\/(\d+)$/);
      if (shareMatch && method === "GET") {
        return await renderMarketListingSharePage(env, url.origin, Number(shareMatch[1]));
      }

      // Public anonymous actions from share pages.
      const pubPing = pathname.match(/^\/api\/public\/market\/listings\/(\d+)\/ping$/);
      if (pubPing && method === "POST") return await publicListingPing(env, req, url.origin, Number(pubPing[1]));
      const pubOffer = pathname.match(/^\/api\/public\/market\/listings\/(\d+)\/offer$/);
      if (pubOffer && method === "POST") return await publicListingOffer(env, req, url.origin, Number(pubOffer[1]));

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

      // Same-origin proxy for mupatos sprite URLs. Public, whitelisted to
      // mupatos.com.br/site/resources/images/* — fixes inconsistent
      // cross-origin image loads in some browsers.
      if (pathname === "/img-proxy" && method === "GET") return await imgProxy(env, url);

      // Public schedule list (used by the alert form to populate the
      // event-name dropdown). Read-only.
      if (pathname === "/api/events" && method === "GET") {
        const rs = await env.DB
          .prepare("SELECT category, name, room, schedule, meta, updated_at FROM server_events ORDER BY category, name, room")
          .all<{ category: string; name: string; room: string; schedule: string; meta: string | null; updated_at: number }>();
        return json({ events: rs.results ?? [] });
      }

      // ---- Public Mercado (read-only) ----
      // Anyone can browse the feed and the catalog without logging in.
      // Writes (post/react/comment/ping) still require auth — those routes
      // live behind the gate further down. We try to read the session
      // best-effort so logged-in users still see "mine" reaction highlights
      // when hitting these public endpoints.
      if (pathname === "/api/items" && method === "GET") return await listItems(env, url);
      if (pathname === "/api/market/listings" && method === "GET") {
        const sess = await readSession(env, cookie).catch(() => null);
        return await listListings(env, sess?.userId ?? null, url);
      }
      const publicListingMatch = pathname.match(/^\/api\/market\/listings\/(\d+)$/);
      if (publicListingMatch && method === "GET") {
        const sess = await readSession(env, cookie).catch(() => null);
        return await getListing(env, sess?.userId ?? null, Number(publicListingMatch[1]));
      }

      // ---- Local-only admin login helper (dev) ----
      // Creates/promotes a local admin user and mints a session cookie.
      // Guarded by hostname so it only works on `wrangler dev`.
      if (pathname === "/local-admin-login" && method === "GET" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
        const DEV_CHAT_ID = 123456789;
        await env.DB.prepare(`
          INSERT INTO users (telegram_chat_id, telegram_username, first_name, created_at, admin)
          VALUES (?, 'local_admin', 'Local Admin', 0, 1)
          ON CONFLICT(telegram_chat_id) DO UPDATE SET admin = 1
        `).bind(DEV_CHAT_ID).run();

        const user = await env.DB
          .prepare("SELECT id FROM users WHERE telegram_chat_id = ?")
          .bind(DEV_CHAT_ID)
          .first<{ id: number }>();

        if (user?.id) {
          const { createSession, setCookieHeader } = await import("./session");
          const token = await createSession(env, user.id);
          return new Response("Redirecionando...", {
            status: 302,
            headers: {
              Location: "/",
              "Set-Cookie": setCookieHeader(env, token),
            },
          });
        }
        return bad(500, "falha ao criar usuário local");
      }

      // ---- Local-only regular-user impersonation helper (dev) ----
      // Usage:
      //  - /local-user-login                 -> create/login a local non-admin user
      //  - /local-user-login?user_id=123     -> impersonate existing user id (forces admin=0)
      if (pathname === "/local-user-login" && method === "GET" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
        const requestedUserId = Number(url.searchParams.get("user_id") ?? "");

        let userId: number | null = null;
        if (Number.isFinite(requestedUserId) && requestedUserId > 0) {
          const existing = await env.DB
            .prepare("SELECT id FROM users WHERE id = ?")
            .bind(requestedUserId)
            .first<{ id: number }>();
          if (!existing) return bad(404, "usuário não encontrado");
          userId = existing.id;
          // Keep this route strictly for common users.
          await env.DB.prepare("UPDATE users SET admin = 0 WHERE id = ?").bind(userId).run();
        } else {
          const DEV_CHAT_ID = 123456790;
          await env.DB.prepare(`
            INSERT INTO users (telegram_chat_id, telegram_username, first_name, created_at, admin)
            VALUES (?, 'local_user', 'Local User', 0, 0)
            ON CONFLICT(telegram_chat_id) DO UPDATE SET admin = 0
          `).bind(DEV_CHAT_ID).run();
          const localUser = await env.DB
            .prepare("SELECT id FROM users WHERE telegram_chat_id = ?")
            .bind(DEV_CHAT_ID)
            .first<{ id: number }>();
          userId = localUser?.id ?? null;
        }

        if (userId) {
          const { createSession, setCookieHeader } = await import("./session");
          const token = await createSession(env, userId);
          return new Response("Redirecionando...", {
            status: 302,
            headers: {
              Location: "/",
              "Set-Cookie": setCookieHeader(env, token),
            },
          });
        }
        return bad(500, "falha ao impersonar usuário local");
      }

      // ---- everything below requires a session ----
      const sess = await readSession(env, cookie);
      if (!sess) return bad(401, "você não está autenticado");
      const userId = sess.userId;

      if (pathname === "/api/me" && method === "GET") return await me(env, userId);
      if (pathname === "/api/me/nickname" && method === "POST") return await setNickname(env, userId, req);

      // ---- Custom events (admin-managed GM events) ----
      if (pathname === "/api/custom-events" && method === "GET") return await listCustomEvents(env, userId);
      const customEvSub = pathname.match(/^\/api\/custom-events\/(\d+)\/subscribe$/);
      if (customEvSub && method === "POST") return await subscribeCustomEvent(env, userId, Number(customEvSub[1]), req);
      if (customEvSub && method === "DELETE") return await unsubscribeCustomEvent(env, userId, Number(customEvSub[1]));
      if (pathname === "/api/me/gift-subs" && method === "GET") return await listMyGiftSubs(env, userId);
      if (pathname === "/api/me/gift-subs" && method === "POST") return await subscribeGiftKind(env, userId, req);
      const giftUnsub = pathname.match(/^\/api\/me\/gift-subs\/([a-z]+)$/);
      if (giftUnsub && method === "DELETE") return await unsubscribeGiftKind(env, userId, giftUnsub[1]);

      // ---- Market (writes — public GETs are above the auth gate) ----
      if (pathname === "/api/items/warmup" && method === "POST") return await warmupCatalog(env);
      if (pathname === "/api/items/fanz" && method === "GET") return await getItemInfoFanz(env, url);
      if (pathname === "/api/items/rules" && method === "GET") return await getItemRules(env, url);
      if (pathname === "/api/market/listings" && method === "GET") return await listListings(env, userId, url);
      if (pathname === "/api/market/listings" && method === "POST") return await createListing(env, userId, req);
      const listingMatch = pathname.match(/^\/api\/market\/listings\/(\d+)$/);
      if (listingMatch && method === "PATCH") return await updateListing(env, userId, Number(listingMatch[1]), req);
      if (listingMatch && method === "DELETE") return await deleteListing(env, userId, Number(listingMatch[1]));
      const reactMatch = pathname.match(/^\/api\/market\/listings\/(\d+)\/react$/);
      if (reactMatch && method === "POST") return await reactListing(env, userId, Number(reactMatch[1]), req);
      const commentMatch = pathname.match(/^\/api\/market\/listings\/(\d+)\/comment$/);
      if (commentMatch && method === "POST") return await commentListing(env, userId, Number(commentMatch[1]), req);
      const offerCreateMatch = pathname.match(/^\/api\/market\/listings\/(\d+)\/offers$/);
      if (offerCreateMatch && method === "POST") return await createOffer(env, userId, Number(offerCreateMatch[1]), req);
      if (pathname === "/api/market/offers/received" && method === "GET") return await listReceivedOffers(env, userId);
      const offerDecideMatch = pathname.match(/^\/api\/market\/offers\/(\d+)$/);
      if (offerDecideMatch && method === "PATCH") return await decideOffer(env, userId, Number(offerDecideMatch[1]), req);
      const commentDelMatch = pathname.match(/^\/api\/market\/comments\/(\d+)$/);
      if (commentDelMatch && method === "DELETE") return await deleteComment(env, userId, Number(commentDelMatch[1]));
      const pingMatch = pathname.match(/^\/api\/market\/listings\/(\d+)\/ping$/);
      if (pingMatch && method === "POST") {
        return await pingListing(env, userId, Number(pingMatch[1]), req, {
          origin: url.origin,
          buildAppUrl: (origin, id) => origin + "/m/" + id,
        });
      }

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
      const charHistoryUser = pathname.match(/^\/api\/characters\/(\d+)\/history$/);
      if (charHistoryUser && method === "GET") {
        return await userCharHistory(env, userId, Number(charHistoryUser[1]), req);
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

        if (pathname === "/api/admin/health" && method === "GET") return await adminHealth(env);
        if (pathname === "/api/admin/chars" && method === "GET") return await adminListChars(env);
        const charSet = pathname.match(/^\/api\/admin\/chars\/(\d+)$/);
        if (charSet && method === "PATCH") return await adminSetBlocked(env, Number(charSet[1]), req);
        const charRefresh = pathname.match(/^\/api\/admin\/chars\/(\d+)\/refresh$/);
        if (charRefresh && method === "POST") return await adminRefreshChar(env, Number(charRefresh[1]));
        const charSubs = pathname.match(/^\/api\/admin\/chars\/(\d+)\/subs$/);
        if (charSubs && method === "GET") return await adminListCharSubs(env, Number(charSubs[1]));
        const charHistory = pathname.match(/^\/api\/admin\/chars\/(\d+)\/history$/);
        if (charHistory && method === "GET") return await adminCharHistory(env, Number(charHistory[1]), req);
        const charSnapsClear = pathname.match(/^\/api\/admin\/chars\/(\d+)\/snapshots$/);
        if (charSnapsClear && method === "DELETE") return await adminClearCharSnapshots(env, Number(charSnapsClear[1]));
        if (pathname === "/api/admin/poll" && method === "POST") return await adminRunCron(env);
        if (pathname === "/api/admin/items/refresh" && method === "POST") return await adminRefreshItems(env);
        if (pathname === "/api/admin/items/wipe" && method === "POST") return await adminWipeCatalog(env);
        if (pathname === "/api/admin/item-rules/import" && method === "POST") return await adminImportItemRules(env, req);
        if (pathname === "/api/admin/ancients/import" && method === "POST") return await adminImportAncientSets(env, req);
        if (pathname === "/api/admin/ancients/fanz-sync" && method === "POST") return await adminSyncAncientSetsFromFanz(env);
        if (pathname === "/api/admin/item-rules/scrape-shop" && method === "POST") return await adminScrapeShopItemRule(env, req);
        if (pathname === "/api/admin/item-rules/backfill" && method === "POST") {
          return await adminBackfillItemRulesFromSources(env, req);
        }
        if (pathname === "/api/admin/item-rules/backfill/status" && method === "GET") {
          return await adminBackfillWorkflowStatus(env, req);
        }
        if (pathname === "/api/admin/item-rules/backfill/output" && method === "GET") {
          return await adminBackfillWorkflowOutput(env, req);
        }
        if (pathname === "/api/admin/watchers/spawn-all" && method === "POST") return await adminSpawnAllWatchers(env);
        if (pathname === "/api/admin/custom-events" && method === "POST") return await adminCreateCustomEvent(env, userId, req);
        const customEvAdminMatch = pathname.match(/^\/api\/admin\/custom-events\/(\d+)$/);
        if (customEvAdminMatch && method === "PATCH") return await adminUpdateCustomEvent(env, Number(customEvAdminMatch[1]), req);
        if (customEvAdminMatch && method === "DELETE") return await adminDeleteCustomEvent(env, Number(customEvAdminMatch[1]));
        const charPoke = pathname.match(/^\/api\/admin\/chars\/(\d+)\/poke$/);
        if (charPoke && method === "POST") return await adminPokeWatcher(env, Number(charPoke[1]));
        if (pathname === "/api/admin/events" && method === "GET") return await adminListEvents(env);
        if (pathname === "/api/admin/events/refresh" && method === "POST") return await adminRefreshEvents(env);
        const evPatch = pathname.match(/^\/api\/admin\/events\/(\d+)$/);
        if (evPatch && method === "PATCH") return await adminUpdateEvent(env, Number(evPatch[1]), req);
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

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Per-char polling is now handled by per-character CharWatcher DOs
    // (each owns its own 60s alarm). The cron's only remaining job is
    // the global server-events tick (Chaos Castle / Blood Castle / etc.) —
    // light, single-pass, no fan-out. That keeps us comfortably inside
    // the per-tick CPU budget.
    ctx.waitUntil(
      pollServerEvents(env)
        .then((r) => console.log(`server-events: refreshed=${r.refreshed} fired=${r.fired}`))
        .catch((e) => console.error("server-events poll failed", e)),
    );
    // Admin-managed GM events (Find the GM, daily/weekly raids, etc.).
    // Light query — cap is the total number of subs across all events.
    ctx.waitUntil(
      pollCustomEvents(env)
        .then((r) => { if (r.fired > 0) console.log(`custom-events: fired=${r.fired}`); })
        .catch((e) => console.error("custom-events poll failed", e)),
    );
    ctx.waitUntil(
      expireListingOffers(env)
        .then((r) => { if (r.expired > 0) console.log("market offers expired=" + r.expired); })
        .catch((e) => console.error("market offer expiration failed", e)),
    );
  },
};

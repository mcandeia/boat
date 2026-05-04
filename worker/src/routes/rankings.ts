import { CLASS_CODES, type ClassCode, fetchRankingList } from "../rankings";
import { bad, json } from "../util";

// Public ranking lookup. The dashboard's "Próximo alvo" cards open a
// modal that calls this to show the leaderboard with the user's char
// highlighted. Scoped to one ranking list per call (overall or one of
// the five class lists) so we don't waste 6× the bandwidth when the
// user only cares about one scope.
//
// Caching: hot paths use caches.default with a 5-minute TTL. Mu Patos
// only updates resets a few times per hour at most, so 5 min is a
// safe ceiling and keeps the upstream load minimal even if multiple
// users open the modal in the same window.
export async function apiRankings(url: URL): Promise<Response> {
  const scopeRaw = (url.searchParams.get("scope") ?? "overall").toLowerCase();
  const isClass = (CLASS_CODES as readonly string[]).includes(scopeRaw);
  if (scopeRaw !== "overall" && !isClass) return bad(400, "scope inválido");
  const scope = scopeRaw as "overall" | ClassCode;
  const focus = (url.searchParams.get("focus") ?? "").trim();

  const cacheKey = "https://internal/rankings/" + scope;
  type CachedShape = { entries: ReturnType<typeof entryShape>[]; fetched_at: number };
  let cachedData: CachedShape | null = null;
  try {
    const cached = await caches.default.match(cacheKey);
    if (cached) cachedData = await cached.json<CachedShape>();
  } catch { /* cache miss / parse fail — fall through to refetch */ }

  if (cachedData) {
    return json({ scope, focus, fetched_at: cachedData.fetched_at, entries: cachedData.entries });
  }

  const fetched_at = Math.floor(Date.now() / 1000);
  const entries = await fetchRankingList(scope);
  const payload: CachedShape = { entries, fetched_at };
  const fresh = new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300",
    },
  });
  try { await caches.default.put(cacheKey, fresh.clone()); } catch { /* best-effort */ }
  return json({ scope, focus, fetched_at, entries });
}

// Helper just so CachedShape's entry type has a stable name for the linter.
function entryShape() {
  return { rank: 0, name: "", className: "", resets: 0 };
}

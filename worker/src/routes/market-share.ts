import type { Env } from "../types";

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

function stripTags(s: string): string {
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function fmtPrice(currency: string | null, price: number | null): string {
  if (!currency) return "";
  if (currency === "free") return "grátis";
  if (currency === "cash") return "R$ " + (price != null ? Number(price).toLocaleString("pt-BR") : "?");
  if (price == null) return currency;
  return Number(price).toLocaleString("pt-BR") + " " + currency;
}

function fmtAttrs(attrsJson: string | null): string {
  if (!attrsJson) return "";
  try {
    const a = JSON.parse(attrsJson) as Record<string, unknown>;
    const parts: string[] = [];
    if (a.full) parts.push("Full");
    if (a.excellent) parts.push("Excellent");
    if (a.option != null) parts.push("opt+" + String(a.option));
    if (a.luck) parts.push("luck");
    if (a.skill) parts.push("skill");
    if (a.refinement != null) parts.push("+" + String(a.refinement));
    if (a.ancient) parts.push("ancient: " + String(a.ancient));
    if (a.extras) parts.push(String(a.extras));
    return parts.join(" · ");
  } catch {
    return "";
  }
}

function attrsDetailRows(attrsJson: string | null): Array<{ k: string; v: string }> {
  if (!attrsJson) return [];
  try {
    const a = JSON.parse(attrsJson) as Record<string, unknown>;
    const rows: Array<{ k: string; v: string }> = [];
    const push = (k: string, v: unknown) => {
      const vv = String(v ?? "").trim();
      if (vv) rows.push({ k, v: vv });
    };
    if (a.full) push("Full", "sim");
    if (a.excellent) push("Excellent", "sim");
    if (a.luck) push("Luck", "sim");
    if (a.skill) push("Skill", "sim");
    if (a.option != null) push("Option", "+" + String(a.option));
    if (a.refinement != null) push("Refine", "+" + String(a.refinement));
    if (a.ancient) push("Ancient", String(a.ancient));
    if (a.extras) {
      const raw = String(a.extras);
      // Common format: "Excellent: ..., Excellent: ..., ..." — break on commas for readability.
      const pretty = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 60)
        .join("\n");
      push("Extras", pretty || raw);
    }
    return rows;
  } catch {
    return [];
  }
}

function fmtAgoSeconds(secs: number): string {
  if (secs < 60) return "agora";
  const m = Math.floor(secs / 60);
  if (m < 60) return m + "min";
  const h = Math.floor(m / 60);
  if (h < 48) return h + "h";
  const d = Math.floor(h / 24);
  return d + "d";
}

export async function renderMarketListingSharePage(env: Env, origin: string, listingId: number): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT
       l.id,
       l.user_id,
       l.side,
       l.kind,
       l.char_id,
       l.item_name,
       l.item_attrs,
       l.currency,
       l.price,
       l.notes,
       l.status,
       l.created_at,
       l.item_slug,
       l.item_image_url,
       u.nickname AS nickname,
       c.name AS char_name,
       c.last_level AS char_level,
       c.resets AS char_resets,
       c.last_status AS char_status,
       c.last_map AS char_map,
       c.last_checked_at AS char_checked_at
     FROM listings l
     JOIN users u ON u.id = l.user_id
     LEFT JOIN characters c ON c.id = l.char_id
    WHERE l.id = ?
    LIMIT 1`,
  ).bind(listingId).first<{
    id: number;
    user_id: number;
    side: string;
    kind?: string | null;
    char_id: number | null;
    item_name: string;
    item_attrs: string | null;
    currency: string | null;
    price: number | null;
    notes: string | null;
    status: string;
    created_at: number;
    item_slug: string | null;
    item_image_url: string | null;
    nickname: string | null;
    char_name: string | null;
    char_level: number | null;
    char_resets: number | null;
    char_status: string | null;
    char_map: string | null;
    char_checked_at: number | null;
  }>();

  if (!row) return new Response("anúncio não encontrado", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });

  // "Ir para o Market": use pagination-aware deep link.
  // We use the "new" ordering (status group + created_at DESC) because it's stable and cheap to rank.
  const MARKET_PAGE_LIMIT = 40;
  const myGroup = row.status === "open" ? 1 : row.status === "held" ? 0 : -1;
  const ahead = await env.DB
    .prepare(
      `SELECT COUNT(*) AS c
         FROM listings l
        WHERE
          (CASE l.status WHEN 'open' THEN 1 WHEN 'held' THEN 0 ELSE -1 END) > ?
           OR (
             (CASE l.status WHEN 'open' THEN 1 WHEN 'held' THEN 0 ELSE -1 END) = ?
             AND l.created_at > ?
           )`,
    )
    .bind(myGroup, myGroup, row.created_at)
    .first<{ c: number }>()
    .then((r) => Number(r?.c ?? 0))
    .catch(() => 0);
  const page = Math.max(1, Math.floor(ahead / MARKET_PAGE_LIMIT) + 1);

  const title =
    "Mercado #" +
    row.id +
    " · " +
    (row.side === "buy" ? "comprar" : row.side === "donate" ? "doação" : "vender") +
    " · " +
    row.item_name;
  const attrs = fmtAttrs(row.item_attrs);
  const attrsRows = attrsDetailRows(row.item_attrs);
  const price = fmtPrice(row.currency, row.price);
  const statusLabel = row.status === "open" ? "" : (row.status === "held" ? "reservado" : "fechado");
  const notes = stripTags(row.notes ?? "");
  const nowSecs = Math.floor(Date.now() / 1000);
  const age = fmtAgoSeconds(Math.max(0, nowSecs - Number(row.created_at || nowSecs)));
  const freshChar = row.char_checked_at != null && (nowSecs - row.char_checked_at) < 300;
  const charStatusBadge =
    row.char_id && freshChar && row.char_status === "Online"
      ? ("🟢 online" + (row.char_map ? (" · " + row.char_map) : ""))
      : row.char_id && freshChar && row.char_status === "Offline"
        ? "offline"
        : "";

  const commentCount = await env.DB
    .prepare("SELECT COUNT(*) AS c FROM listing_comments WHERE listing_id = ?")
    .bind(listingId)
    .first<{ c: number }>()
    .then((r) => Number(r?.c ?? 0))
    .catch(() => 0);

  const reactions = await env.DB
    .prepare("SELECT kind, COUNT(*) AS c FROM listing_reactions WHERE listing_id = ? GROUP BY kind ORDER BY c DESC, kind")
    .bind(listingId)
    .all<{ kind: string; c: number }>()
    .then((r) => r.results ?? [])
    .catch(() => []);

  const comments = await env.DB
    .prepare(
      `SELECT c.body AS body, c.created_at AS created_at, u.nickname AS nickname
         FROM listing_comments c
         LEFT JOIN users u ON u.id = c.user_id
        WHERE c.listing_id = ?
        ORDER BY c.created_at ASC
        LIMIT 120`,
    )
    .bind(listingId)
    .all<{ body: string; created_at: number; nickname: string | null }>()
    .then((r) => r.results ?? [])
    .catch(() => []);

  const descParts = [
    attrs ? attrs : null,
    price ? price : null,
    notes ? notes : null,
  ].filter(Boolean);
  const description = (descParts.join(" · ") || "Anúncio no Mercado do Mu Patos") + (statusLabel ? (" · " + statusLabel) : "");

  // Add a cache-buster so crawlers (Discord) don't get stuck with a stale/bad fetch.
  // created_at is stable; if we ever add listing.updated_at, switch to that.
  const ogPng = origin + "/og/market/" + String(row.id) + ".png?v=" + String(row.created_at || "");

  // Inline thumbnail used by the share page itself (not the OG image).
  const rawImg = (row.item_image_url ?? "").trim();
  const isMupatosSprite = /^https:\/\/mupatos\.com\.br\/site\/resources\/images\//i.test(rawImg);
  // Only proxy mupatos sprites. Other hosts (e.g. wiki/CDNs) should be used directly.
  const img = rawImg
    ? (isMupatosSprite ? (origin + "/img-proxy?u=" + encodeURIComponent(rawImg)) : rawImg)
    : "";

  const shareUrl = origin + "/s/" + String(row.id);
  const appUrl = origin + "/?market=" + String(row.id) + "&sort=new&page=" + String(page);

  const sidePill =
    row.side === "buy"
      ? '<span class="badge b-blue">comprar</span>'
      : row.side === "donate"
        ? '<span class="badge b-green">doação</span>'
        : '<span class="badge b-gold">vender</span>';
  const kindPill = row.kind === "char" ? '<span class="badge b-purple">🎮 char</span>' : "";
  const statusPill =
    row.status === "open"
      ? ""
      : row.status === "held"
        ? '<span class="badge b-yellow">reservado</span>'
        : '<span class="badge b-zinc">fechado</span>';

  const reactionsHtml = reactions.length
    ? reactions.map((r) =>
        '<span class="chip">' + esc(r.kind) + (r.c ? (' <span class="num">' + esc(r.c) + "</span>") : "") + "</span>"
      ).join("")
    : '<span class="muted">sem reações ainda</span>';

  const commentsHtml = comments.length
    ? comments.map((c) => {
        const who = esc(c.nickname ?? "?");
        const ago = fmtAgoSeconds(Math.max(0, nowSecs - Number(c.created_at || nowSecs)));
        const body = esc(String(c.body ?? "")).replace(/\n/g, "<br/>");
        return (
          '<div class="cmt">' +
            '<div class="cmt-meta"><b class="cmt-who">' + who + '</b><span class="cmt-ago">' + esc(ago) + '</span></div>' +
            '<div class="cmt-body">' + body + "</div>" +
          "</div>"
        );
      }).join("")
    : '<div class="muted">sem comentários ainda</div>';

  const html =
    "<!doctype html>" +
    '<html lang="pt-BR">' +
    "<head>" +
    '<meta charset="utf-8" />' +
    '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
    "<title>" + esc(title) + "</title>" +
    '<meta name="description" content="' + esc(description).slice(0, 320) + '" />' +
    '<meta property="og:type" content="website" />' +
    '<meta property="og:title" content="' + esc(title).slice(0, 120) + '" />' +
    '<meta property="og:description" content="' + esc(description).slice(0, 300) + '" />' +
    '<meta property="og:url" content="' + esc(shareUrl) + '" />' +
    '<meta property="og:image" content="' + esc(ogPng) + '" />' +
    '<meta property="og:image:secure_url" content="' + esc(ogPng) + '" />' +
    '<meta property="og:image:type" content="image/png" />' +
    '<meta property="og:image:width" content="1200" />' +
    '<meta property="og:image:height" content="630" />' +
    '<meta name="twitter:image" content="' + esc(ogPng) + '" />' +
    '<meta name="twitter:card" content="summary_large_image" />' +
    '<meta name="theme-color" content="#0b0f16" />' +
    "<style>" +
    "html,body{margin:0;padding:0;background:#0b0f16;color:#e5e7eb;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial}" +
    "a{color:#f0a93b;text-decoration:none}" +
    ".wrap{max-width:860px;margin:0 auto;padding:20px}" +
    ".card{border:1px solid rgba(240,169,59,.25);background:rgba(15,23,42,.35);border-radius:14px;padding:16px}" +
    ".muted{color:#9ca3af;font-size:12px}" +
    ".title{font-size:18px;font-weight:700;line-height:1.25;margin:8px 0 4px}" +
    ".row{display:flex;gap:14px;align-items:flex-start}" +
    ".img{width:64px;height:64px;border-radius:12px;border:1px solid rgba(148,163,184,.25);background:rgba(2,6,23,.4);display:flex;align-items:center;justify-content:center;overflow:hidden;flex:0 0 auto}" +
    ".img img{width:100%;height:100%;object-fit:contain}" +
    ".badge{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;border:1px solid rgba(148,163,184,.25);background:rgba(2,6,23,.35);color:#cbd5e1}" +
    ".b-gold{border-color:rgba(240,169,59,.45);background:rgba(240,169,59,.10);color:#f3d08d}" +
    ".b-blue{border-color:rgba(59,130,246,.45);background:rgba(59,130,246,.10);color:#bfdbfe}" +
    ".b-green{border-color:rgba(16,185,129,.45);background:rgba(16,185,129,.10);color:#a7f3d0}" +
    ".b-purple{border-color:rgba(168,85,247,.45);background:rgba(168,85,247,.10);color:#e9d5ff}" +
    ".b-yellow{border-color:rgba(234,179,8,.45);background:rgba(234,179,8,.10);color:#fde68a}" +
    ".b-zinc{border-color:rgba(113,113,122,.45);background:rgba(113,113,122,.10);color:#e4e4e7}" +
    ".pill{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(148,163,184,.25);background:rgba(2,6,23,.35);padding:6px 10px;border-radius:999px;font-size:12px;color:#cbd5e1}" +
    ".meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:2px}" +
    ".chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}" +
    ".chip{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(148,163,184,.25);background:rgba(2,6,23,.35);padding:6px 10px;border-radius:999px;font-size:12px;color:#cbd5e1}" +
    ".num{font-variant-numeric:tabular-nums;color:#f3d08d}" +
    ".attrs{margin-top:12px;border-top:1px solid rgba(148,163,184,.18);padding-top:12px}" +
    ".attrs h4{margin:0 0 10px 0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#9ca3af}" +
    ".attrs-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}" +
    ".attr{border:1px solid rgba(148,163,184,.18);background:rgba(2,6,23,.25);border-radius:12px;padding:10px 10px;min-height:66px}" +
    ".attr-wide{grid-column:1 / -1}" +
    ".attr-k{color:#9ca3af;font-size:11px;letter-spacing:.08em;text-transform:uppercase}" +
    ".attr-v{margin-top:6px;color:#e5e7eb;font-size:13px;line-height:1.25;word-break:break-word}" +
    ".attr-v.pre{white-space:pre-wrap}" +
    ".attr-v.scroll{max-height:128px;overflow:auto;padding-right:4px}" +
    ".comments{margin-top:14px;border-top:1px solid rgba(148,163,184,.18);padding-top:12px}" +
    ".comments h4{margin:0 0 10px 0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#9ca3af}" +
    ".cmt{padding:10px 10px;border:1px solid rgba(148,163,184,.18);background:rgba(2,6,23,.25);border-radius:12px;margin-bottom:10px}" +
    ".cmt-meta{display:flex;align-items:baseline;justify-content:space-between;gap:10px;color:#9ca3af;font-size:12px}" +
    ".cmt-who{color:#f3d08d}" +
    ".cmt-ago{font-variant-numeric:tabular-nums}" +
    ".cmt-body{margin-top:6px;color:#e5e7eb;font-size:13px;line-height:1.35;word-break:break-word}" +
    ".cta{margin-top:14px;display:flex;gap:10px;flex-wrap:wrap}" +
    ".btn{display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border-radius:10px;font-weight:700;font-size:13px;border:1px solid rgba(240,169,59,.35);cursor:pointer}" +
    ".btn.primary{background:#f0a93b;color:#0b0f16;border-color:#f0a93b}" +
    ".btn.ghost{background:transparent;color:#f0a93b}" +
    ".btn.muted{background:transparent;border-color:rgba(148,163,184,.25);color:#cbd5e1}" +
    "</style>" +
    "</head>" +
    "<body>" +
    '<div class="wrap">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px">' +
      '<div class="muted" style="font-size:11px">link público do anúncio</div>' +
      '<a class="btn primary" href="' + esc(appUrl) + '">Ir para o Market</a>' +
    "</div>" +
    '<div class="card">' +
    '<div class="muted">Mu Patos · Mercado · anúncio #' + esc(row.id) + " · " + esc(age) + '</div>' +
    '<div class="row">' +
    '<div class="img">' +
    (img ? ('<img src="' + esc(img) + '" alt="" loading="lazy" />') : "📦") +
    "</div>" +
    '<div style="min-width:0;flex:1">' +
    '<div class="meta">' + sidePill + kindPill + statusPill + '<span class="muted">por <b style="color:#f3d08d">' + esc(row.nickname ?? "?") + "</b></span></div>" +
    '<div class="title">' + esc(row.item_name) + "</div>" +
    (row.char_name ? ('<div class="muted">🎮 ' + esc(row.char_name) + (row.char_level != null ? (" (" + esc(row.char_level) + "/" + esc(row.char_resets ?? "?") + "rr)") : "") + "</div>") : "") +
    (charStatusBadge ? ('<div class="muted" style="margin-top:6px"><span class="badge b-green">' + esc(charStatusBadge) + "</span></div>") : "") +
    (attrs ? ('<div class="chips"><span class="chip">✨ ' + esc(attrs) + "</span></div>") : "") +
    (price ? ('<div class="chips"><span class="chip">💰 ' + esc(price) + "</span></div>") : "") +
    (notes ? ('<div style="margin-top:12px;color:#d1d5db;white-space:pre-wrap">' + esc(notes) + "</div>") : "") +
    (attrsRows.length
      ? (
        '<div class="attrs">' +
          "<h4>Atributos do item</h4>" +
          '<div class="attrs-grid">' +
            attrsRows.map((r) => {
              const isExtras = r.k === "Extras";
              const cls = "attr" + (isExtras ? " attr-wide" : "");
              const vcls = "attr-v" + (isExtras ? " pre scroll" : "");
              return '<div class="' + cls + '"><div class="attr-k">' + esc(r.k) + '</div><div class="' + vcls + '">' + esc(r.v) + "</div></div>";
            }).join("") +
          "</div>" +
        "</div>"
      )
      : "") +
    '<div class="chips" style="margin-top:12px"><span class="chip">💬 comentários <span class="num">' + esc(commentCount) + "</span></span></div>" +
    '<div class="chips" style="margin-top:10px">' + reactionsHtml + "</div>" +
    '<div class="comments">' +
      "<h4>Comentários</h4>" +
      commentsHtml +
    "</div>" +
    '<div class="cta">' +
    '<a class="btn muted" href="' + esc(appUrl) + '">💬 comentar</a>' +
    '<button class="btn muted" type="button" id="btn-offer">💸 fazer oferta</button>' +
    '<button class="btn muted" type="button" id="btn-ping">📣 tenho interesse</button>' +
    '<button class="btn ghost" type="button" id="copy-link">🔗 copiar link</button>' +
    "</div>" +
    "</div>" +
    "</div>" +
    "</div>" +
    '<div class="muted" style="margin-top:12px;text-align:center">Dica: para ver e gerenciar todas as interações, use <a href="' + esc(appUrl) + '">o Market no app</a>.</div>' +
    "</div>" +
    "<script>(function(){" +
      "var shareUrl=" + JSON.stringify(shareUrl) + ";" +
      "var listingId=" + JSON.stringify(String(row.id)) + ";" +
      "var appUrl=" + JSON.stringify(appUrl) + ";" +
      "function q(id){return document.getElementById(id);} " +
      "async function copy(t){try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(t);return true;}}catch(e){}" +
      "try{var ta=document.createElement('textarea');ta.value=t;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.select();var ok=document.execCommand&&document.execCommand('copy');document.body.removeChild(ta);return !!ok;}catch(e){return false;}}" +
      "var copyBtn=q('copy-link'); if(copyBtn){copyBtn.addEventListener('click',function(ev){try{ev.preventDefault();}catch(e){};copy(shareUrl).then(function(ok){if(!ok){try{window.prompt('Copie o link:',shareUrl);}catch(e){};}copyBtn.textContent=ok?'✅ copiado':'📋 copie';setTimeout(function(){copyBtn.textContent='🔗 copiar link';},1400);});});}" +
      "var isLoggedIn=false;" +
      "var myChars=[];" +
      "function setupActions(){" +
        "function openModal(kind){ " +
          "var overlay=document.createElement('div');" +
          "overlay.style.position='fixed';overlay.style.inset='0';overlay.style.background='rgba(0,0,0,.55)';overlay.style.zIndex='50';overlay.style.display='flex';overlay.style.alignItems='center';overlay.style.justifyContent='center';overlay.style.padding='16px';" +
          "var box=document.createElement('div');" +
          "box.style.maxWidth='640px';box.style.width='100%';box.style.boxSizing='border-box';box.style.border='1px solid rgba(240,169,59,.25)';box.style.background='rgba(15,23,42,.92)';box.style.borderRadius='14px';box.style.padding='14px';box.style.boxShadow='0 20px 60px rgba(0,0,0,.55)';box.style.maxHeight='calc(100vh - 32px)';box.style.overflow='auto';" +
          "function make(tag, attrs, text){var el=document.createElement(tag);if(attrs){for(var k in attrs){if(k==='class')el.className=attrs[k];else el.setAttribute(k,attrs[k]);}}if(text!=null)el.textContent=text;return el;}" +
          "function styleField(el){el.style.width='100%';el.style.minWidth='0';el.style.boxSizing='border-box';el.style.padding='10px';el.style.borderRadius='10px';el.style.border='1px solid rgba(148,163,184,.25)';el.style.background='rgba(2,6,23,.5)';el.style.color='#e5e7eb';}" +
          "function label(txt){var l=make('div',{class:'muted'},txt);l.style.marginTop='10px';l.style.fontSize='11px';l.style.letterSpacing='.08em';l.style.textTransform='uppercase';return l;}" +
          "function close(){overlay.remove();}" +
          "overlay.addEventListener('click',function(ev){if(ev.target===overlay)close();});" +
          "var title=make('div',{class:'title'},kind==='offer'?'💸 Fazer oferta':'📣 Tenho interesse');title.style.fontSize='16px';title.style.margin='0 0 6px 0';" +
          "var info=make('div',{class:'muted'},(isLoggedIn?'Você está logado — envia como você.':'Você não está logado — envia como anônimo.'));info.style.marginTop='6px';" +
          "var name=make('input',{id:'anon-name',placeholder:(isLoggedIn?'(logado)':'Seu nome (opcional, só anônimo)')},null);" +
          "name.style.marginTop='12px';styleField(name);" +
          "if(isLoggedIn){name.disabled=true;}" +
          "var grid=make('div',null,null);grid.style.display='grid';grid.style.gridTemplateColumns='minmax(0,1fr) minmax(0,1fr)';grid.style.gap='10px';grid.style.marginTop='10px';grid.style.minWidth='0';" +
          "var charSel=make('select',{id:'char-id'},null);styleField(charSel);" +
          "charSel.appendChild((function(){var o=document.createElement('option');o.value='';o.textContent='personagem (opcional)';return o;})());" +
          "if(isLoggedIn && Array.isArray(myChars) && myChars.length){myChars.forEach(function(c){try{var o=document.createElement('option');o.value=String(c.id);o.textContent=(c.name||('char '+c.id)) + (c.resets!=null?(' · '+c.resets+'rr'):'');charSel.appendChild(o);}catch(e){}});}" +
          "var pingMsgHelp=make('div',{class:'muted'},'');pingMsgHelp.style.gridColumn='1 / -1';pingMsgHelp.style.marginTop='2px';" +
          "grid.appendChild(charSel);" +
          "var offerWrap=make('div',{id:'offer-fields'},null);offerWrap.style.display=(kind==='offer'?'block':'none');offerWrap.style.gridColumn='1 / -1';" +
          "var offerGrid=make('div',null,null);offerGrid.style.display='grid';offerGrid.style.gridTemplateColumns='minmax(0,1fr) minmax(0,1fr)';offerGrid.style.gap='10px';offerGrid.style.minWidth='0';" +
          "var cur=make('select',{id:'anon-cur'},null);styleField(cur);" +
          "function opt(v, t){var o=document.createElement('option');o.value=v;o.textContent=t;return o;}" +
          "cur.appendChild(opt('','moeda (opcional)'));cur.appendChild(opt('zeny','zeny'));cur.appendChild(opt('gold','gold'));cur.appendChild(opt('cash','cash'));cur.appendChild(opt('free','free'));" +
          "var price=make('input',{id:'anon-price',type:'number',inputmode:'numeric',placeholder:'valor (opcional)'},null);styleField(price);" +
          "offerGrid.appendChild(cur);offerGrid.appendChild(price);" +
          "offerWrap.appendChild(offerGrid);" +
          "grid.appendChild(offerWrap);" +
          "var msg=document.createElement('textarea');msg.id='anon-msg';msg.rows=4;msg.placeholder='Mensagem (opcional)';" +
          "msg.style.marginTop='10px';styleField(msg);msg.style.resize='vertical';msg.style.maxWidth='100%';" +
          "var err=make('div',{id:'anon-err',class:'muted'},'');err.style.marginTop='8px';err.style.color='#fca5a5';" +
          "var row=make('div',null,null);row.style.display='flex';row.style.gap='10px';row.style.justifyContent='flex-end';row.style.marginTop='12px';row.style.flexWrap='wrap';" +
          "var cancel=make('button',{id:'anon-cancel',type:'button',class:'btn ghost'},'cancelar');" +
          "var send=make('button',{id:'anon-send',type:'button',class:'btn primary'},'enviar');" +
          "cancel.onclick=close;" +
          "send.onclick=function(){" +
            "var nameVal=(name.value||'').trim();" +
            "var charId=(charSel && charSel.value)?Number(charSel.value):null;" +
            "var msgVal=(msg.value||'').trim();" +
            "var payload={message:msgVal};" +
            "var endpoint=isLoggedIn?('/api/market/listings/'+listingId+'/ping'):'/api/public/market/listings/'+listingId+'/ping';" +
            "var creds=isLoggedIn?'same-origin':'omit';" +
            "if(kind==='offer'){" +
              "endpoint=isLoggedIn?('/api/market/listings/'+listingId+'/offers'):'/api/public/market/listings/'+listingId+'/offer';" +
              "payload={message:msgVal,currency:(cur.value||null),price:(price.value!==''?Number(price.value):null)};" +
            "}" +
            "if(isLoggedIn && charId){ payload.char_id=charId; }" +
            "if(!isLoggedIn){ payload.name=nameVal; }" +
            "err.textContent='';" +
            "fetch(endpoint,{method:'POST',credentials:creds,headers:{'content-type':'application/json'},body:JSON.stringify(payload)})" +
              ".then(function(r){return r.json().catch(function(){return {};}).then(function(b){if(!r.ok)throw new Error(b.error||('HTTP '+r.status));return b;});})" +
              ".then(function(){send.textContent='✅ enviado';setTimeout(close,700);})" +
              ".catch(function(e){err.textContent=e.message;});" +
          "};" +
          "row.appendChild(cancel);row.appendChild(send);" +
          "box.appendChild(title);box.appendChild(info);if(!isLoggedIn){box.appendChild(name);}box.appendChild(label('personagem'));box.appendChild(grid);box.appendChild(label('mensagem'));box.appendChild(msg);box.appendChild(err);box.appendChild(row);" +
          "overlay.appendChild(box);document.body.appendChild(overlay);" +
        "}" +
        "var pingBtn=q('btn-ping'); if(pingBtn){pingBtn.onclick=function(){ openModal('ping'); };}" +
        "var offerBtn=q('btn-offer'); if(offerBtn){offerBtn.onclick=function(){ openModal('offer'); };}" +
      "}" +
      "fetch('/api/me',{credentials:'same-origin'})" +
        ".then(function(r){isLoggedIn=!!r.ok; if(!r.ok) return null; return r.json().catch(function(){return null;});})" +
        ".then(function(me){ try{ if(me && Array.isArray(me.characters)) myChars=me.characters; }catch(e){} })" +
        ".catch(function(){isLoggedIn=false;})" +
        ".then(function(){setupActions();});" +
    "})();</script>" +
    "</body>" +
    "</html>";

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
}


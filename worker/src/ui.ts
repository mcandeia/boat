// Single-page UI served from the Worker. No bundler — Tailwind via CDN.
// pt-BR strings throughout.

export const INDEX_HTML = /* html */ `<!doctype html>
<html lang="pt-BR" class="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Painel do jogador Mu Patos (by daddy)</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          bg:     '#0b0d12',
          panel:  '#11141b',
          border: '#252a36',
          muted:  '#8a93a3',
          gold:   '#f0a93b',
          goldsoft: '#f7c779',
          danger: '#f25a5a',
          ok:     '#3fb950',
        },
        fontFamily: {
          display: ['"Cinzel"', 'serif'],
        },
        boxShadow: {
          glow: '0 0 0 1px rgba(240,169,59,0.25), 0 12px 40px -10px rgba(240,169,59,0.25)',
        },
      },
    },
  };
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  body { background: radial-gradient(1200px 600px at 50% -10%, #1a1d28 0%, #0b0d12 60%) #0b0d12; font-family: 'Inter', system-ui, sans-serif; }
  .brand { font-family: 'Cinzel', serif; letter-spacing: 0.02em; }
  .scrollbox::-webkit-scrollbar { width: 8px; }
  .scrollbox::-webkit-scrollbar-thumb { background: #252a36; border-radius: 4px; }
</style>
</head>
<body class="text-slate-100 min-h-screen antialiased">

<!-- ============================================================ -->
<!-- CONSENT GATE                                                 -->
<!-- ============================================================ -->
<section id="consent" class="hidden fixed inset-0 z-50 bg-bg/95 backdrop-blur flex items-center justify-center p-4">
  <div class="max-w-xl w-full bg-panel border border-border rounded-xl shadow-glow p-6 relative">
    <button id="consent-close" class="hidden absolute top-3 right-3 h-8 w-8 rounded-md hover:bg-bg text-muted hover:text-slate-100 flex items-center justify-center text-lg" aria-label="Fechar">×</button>
    <div class="flex items-center gap-3 mb-3">
      <div class="h-10 w-10 rounded-lg bg-gold/15 border border-gold/30 flex items-center justify-center text-gold text-xl">⚔️</div>
      <div>
        <h1 class="brand text-xl text-goldsoft">Painel do jogador Mu Patos</h1>
        <div class="text-xs text-muted">by daddy</div>
      </div>
    </div>
    <div id="consent-scroll" class="scrollbox max-h-[55vh] overflow-y-auto pr-2 space-y-3 text-sm leading-relaxed text-slate-300">
      <p>Antes de entrar, dá uma lida rapidinho — é importante:</p>
      <p><b class="text-goldsoft">É de graça.</b> Não tem assinatura, não tem upsell, não tem propaganda. A ideia é só se divertir e ajudar a galera a acompanhar os personagens sem ficar dando F5 no site do servidor.</p>
      <p><b class="text-goldsoft">Todas as informações aqui são públicas.</b> O painel só lê o que já está aberto em <code class="text-xs bg-bg px-1.5 py-0.5 rounded">mupatos.com.br/site/profile/character/&lt;nome&gt;</code>. Nada de invadir conta, nada de senha, nada de informação privada — é o mesmo dado que qualquer um vê visitando a página do personagem.</p>
      <p><b class="text-goldsoft">Isso NÃO é um bot de jogo.</b> Não automatiza ações dentro do MU, não joga por você, não clica em nada no servidor. Só lê uma página pública e dispara uma mensagem no Telegram quando algo que <i>você cadastrou</i> acontece (ex.: seu char passou de nível 360, entrou no Stadium, etc.).</p>
      <p><b class="text-goldsoft">Os alertas chegam pelo Telegram.</b> Pra entrar você só clica em <i>Conectar com Telegram</i> e aperta <i>Iniciar</i> no bot — sem senha, sem código pra digitar, sem cadastrar email ou telefone. O Telegram só passa pro bot um <i>chat_id</i> e seu nome de exibição.</p>
      <p><b class="text-goldsoft">Se bugar, a culpa é do daddy.</b> Reclama com ele no jogo. (Xibata, vai com Deus.)</p>
      <div class="border-t border-border pt-3 mt-3 text-xs text-muted leading-relaxed">
        <p><b class="text-slate-300">Aviso legal.</b> Este painel é uma iniciativa pessoal do jogador <span class="text-goldsoft">daddy</span>. A equipe do Mu Patos <b>não tem envolvimento, afiliação ou responsabilidade</b> sobre este site. É um projeto gratuito feito por um jogador, sem vínculo oficial com o servidor. Qualquer problema, suporte ou reclamação deve ser direcionado ao daddy — não ao staff do Mu Patos.</p>
      </div>
      <p class="text-muted text-xs pt-2">Role até o final pra liberar o botão.</p>
    </div>
    <div class="mt-4 flex items-center gap-3">
      <button id="consent-accept" disabled class="flex-1 px-4 py-2.5 rounded-md bg-gold text-bg font-semibold disabled:bg-border disabled:text-muted disabled:cursor-not-allowed transition">Aceitar e continuar</button>
      <span id="consent-hint" class="text-xs text-muted">Role até o final</span>
    </div>
  </div>
</section>

<main class="max-w-3xl mx-auto px-4 py-10">
  <header class="mb-8 flex items-end justify-between gap-4 flex-wrap">
    <div>
      <h1 class="brand text-2xl md:text-3xl text-goldsoft">Painel do jogador Mu Patos</h1>
      <div class="text-sm text-muted mt-1">by daddy · alertas no Telegram pra eventos do seu char</div>
    </div>
    <a href="#" id="show-consent" class="text-xs text-muted hover:text-goldsoft underline underline-offset-4">sobre / política</a>
  </header>

  <!-- ============================================================ -->
  <!-- LOGIN (Telegram deep-link)                                   -->
  <!-- ============================================================ -->
  <section id="login" class="hidden bg-panel border border-border rounded-xl p-5 mb-5">
    <h2 class="text-xs uppercase tracking-widest text-muted mb-3">Entrar</h2>
    <p class="text-sm text-slate-400 mb-4">Conecte com Telegram em um clique. Você não precisa criar conta nem digitar nada.</p>

    <button id="connect-tg" class="w-full sm:w-auto px-5 py-3 rounded-md bg-[#229ED9] text-white font-semibold hover:brightness-110 transition flex items-center justify-center gap-2">
      <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.13-3.05-1.99 1.93c-.23.23-.42.42-.84.42z"/></svg>
      <span>Conectar com Telegram</span>
    </button>

    <div id="login-waiting" class="hidden mt-4 p-4 rounded-md border border-border bg-bg space-y-4">
      <ol class="text-sm text-slate-300 space-y-1.5 list-decimal list-inside">
        <li>Abra o Telegram com uma das opções abaixo.</li>
        <li>No chat com o bot, toque em <b class="text-goldsoft">INICIAR</b> (ou <i>START</i>).</li>
        <li>Volta pra cá — vai liberar sozinho.</li>
      </ol>

      <div class="flex items-center gap-2 text-xs text-muted">
        <svg class="animate-spin h-4 w-4 text-gold" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.25" stroke-width="4"></circle>
          <path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="4" stroke-linecap="round"></path>
        </svg>
        <span>Aguardando…</span>
      </div>

      <div id="login-options" class="grid sm:grid-cols-2 gap-3">
        <!-- Order is set by JS based on mobile vs desktop. -->
      </div>

      <div class="border-t border-border pt-3">
        <div class="text-xs text-muted mb-2">Ou abra esse link em qualquer device com Telegram:</div>
        <div class="flex gap-2">
          <input id="login-link-text" readonly class="flex-1 min-w-0 bg-panel border border-border rounded-md px-2 py-1.5 text-xs text-slate-300 font-mono" />
          <button id="login-copy" class="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-panel">Copiar</button>
        </div>
      </div>

      <div class="border-t border-border pt-3">
        <div class="text-xs text-muted mb-2">Tem Telegram só no celular? Escaneie esse QR:</div>
        <div class="flex justify-center">
          <img id="login-qr" alt="QR pra abrir no Telegram" class="rounded-md bg-white p-2" width="160" height="160" />
        </div>
      </div>
    </div>

    <div id="login-msg" class="text-sm mt-3 min-h-[1.25rem]"></div>
  </section>

  <!-- ============================================================ -->
  <!-- DASHBOARD                                                    -->
  <!-- ============================================================ -->
  <section id="dash" class="hidden space-y-5">

    <div class="bg-panel border border-border rounded-xl p-5">
      <h2 class="text-xs uppercase tracking-widest text-muted mb-3">Conta</h2>
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="text-sm">Conectado como <code id="me-phone" class="bg-bg px-2 py-0.5 rounded text-goldsoft tabular-nums"></code></div>
        <button id="logout" class="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-bg transition">Sair</button>
      </div>
    </div>

    <div class="bg-panel border border-border rounded-xl p-5">
      <details>
        <summary class="cursor-pointer flex items-center justify-between gap-3">
          <span class="flex items-center gap-2">
            <span class="text-gold">💡</span>
            <span class="text-sm font-semibold text-goldsoft">Receba os alertas com som diferente (recomendado)</span>
          </span>
          <span class="text-xs text-muted">expandir</span>
        </summary>
        <div class="mt-4 pt-4 border-t border-border space-y-4 text-sm leading-relaxed text-slate-300">
          <p>O Telegram permite definir um <b class="text-goldsoft">som de notificação por chat</b> e prioridade alta. Configure no chat com o bot pra saber na hora que é um alerta de level.</p>

          <div>
            <div class="font-semibold text-goldsoft mb-1">📱 Android (Telegram)</div>
            <ol class="list-decimal list-inside space-y-1 text-slate-300">
              <li>Abra o chat do bot no Telegram.</li>
              <li>Toque no nome do bot no topo → <b>Notificações</b>.</li>
              <li>Em <b>Som</b>, escolha um som exclusivo (pode importar um MP3).</li>
              <li>Em <b>Importância</b>, marque <b>Alta</b> ou <b>Urgente</b> — alertas urgentes ignoram o modo silencioso.</li>
              <li>Ligue a <b>Vibração</b> em <i>Longa</i>.</li>
              <li>(Opcional) Fixe o chat no topo da lista (ícone de pino) pra encontrar fácil.</li>
            </ol>
          </div>

          <div>
            <div class="font-semibold text-goldsoft mb-1">🍏 iPhone (Telegram)</div>
            <ol class="list-decimal list-inside space-y-1 text-slate-300">
              <li>Abra o chat do bot.</li>
              <li>Toque no nome no topo → <b>Notificações</b>.</li>
              <li>Em <b>Som</b>, escolha um som exclusivo.</li>
              <li>Em <b>Personalizar Notificações</b>, marque o som e ative o badge.</li>
              <li>Volte aos <b>Ajustes do iPhone</b> → <b>Foco</b> → seu Foco ativo → <b>Pessoas</b> → adicione o bot em <b>Permitir notificações de</b>.</li>
              <li>Em <b>Ajustes do iPhone</b> → <b>Notificações</b> → <b>Telegram</b>, ative <b>Notificações Sensíveis ao Tempo</b>.</li>
            </ol>
          </div>
        </div>
      </details>
    </div>

    <div class="bg-panel border border-border rounded-xl p-5">
      <h2 class="text-xs uppercase tracking-widest text-muted mb-3">Personagens</h2>
      <ul id="char-list" class="divide-y divide-border"></ul>
      <div class="mt-4 pt-4 border-t border-border">
        <label class="text-xs text-muted block mb-1.5" for="new-char">Cadastrar um personagem</label>
        <div class="flex gap-2 flex-wrap">
          <input id="new-char" placeholder="nome do personagem (ex.: daddy)"
            class="flex-1 min-w-[180px] bg-bg border border-border rounded-md px-3 py-2 outline-none focus:border-gold/60" />
          <label class="inline-flex items-center gap-2 px-3 border border-border rounded-md text-sm">
            <input id="new-char-gm" type="checkbox" class="accent-gold" /> GM
          </label>
          <button id="add-char" class="px-4 py-2 rounded-md bg-gold text-bg font-semibold hover:brightness-110 transition">Adicionar</button>
        </div>
        <div id="char-msg" class="text-sm text-danger mt-2 min-h-[1.25rem]"></div>
      </div>
    </div>

    <div class="bg-panel border border-border rounded-xl p-5">
      <h2 class="text-xs uppercase tracking-widest text-muted mb-3">Alertas</h2>
      <ul id="sub-list" class="divide-y divide-border"></ul>
      <div class="mt-4 pt-4 border-t border-border">
        <label class="text-xs text-muted block mb-1.5">Adicionar um alerta</label>
        <div class="grid gap-2 sm:grid-cols-[1fr_1.4fr_1fr_auto]">
          <select id="sub-char" class="bg-bg border border-border rounded-md px-3 py-2 outline-none focus:border-gold/60"></select>
          <select id="sub-type" class="bg-bg border border-border rounded-md px-3 py-2 outline-none focus:border-gold/60">
            <option value="level_gte">Nível atingido (≥)</option>
            <option value="map_eq">Entrou no mapa</option>
            <option value="coords_in">Entrou em zona de coordenadas</option>
            <option value="status_eq">Online / offline</option>
            <option value="gm_online">GM online (este personagem)</option>
            <option value="server_event">Evento do servidor (em breve)</option>
          </select>
          <input id="sub-thr" placeholder="valor"
            class="bg-bg border border-border rounded-md px-3 py-2 outline-none focus:border-gold/60" />
          <button id="add-sub" class="px-4 py-2 rounded-md bg-gold text-bg font-semibold hover:brightness-110 transition">Adicionar</button>
        </div>
        <div id="sub-msg" class="text-sm text-danger mt-2 min-h-[1.25rem]"></div>
        <details class="mt-3 text-sm">
          <summary class="cursor-pointer text-muted hover:text-goldsoft">O que vai em "valor"?</summary>
          <ul class="mt-2 space-y-1 text-slate-300">
            <li><b class="text-goldsoft">Nível atingido:</b> um número, ex.: <code class="bg-bg px-1.5 py-0.5 rounded text-xs">360</code></li>
            <li><b class="text-goldsoft">Entrou no mapa:</b> nome do mapa, ex.: <code class="bg-bg px-1.5 py-0.5 rounded text-xs">Stadium</code></li>
            <li><b class="text-goldsoft">Entrou em zona de coordenadas:</b> <code class="bg-bg px-1.5 py-0.5 rounded text-xs">Mapa:x1-x2:y1-y2</code>, ex.: <code class="bg-bg px-1.5 py-0.5 rounded text-xs">Stadium:60-90:80-100</code> pra detectar respawn em área segura</li>
            <li><b class="text-goldsoft">Online / offline:</b> <code class="bg-bg px-1.5 py-0.5 rounded text-xs">Online</code> ou <code class="bg-bg px-1.5 py-0.5 rounded text-xs">Offline</code></li>
            <li><b class="text-goldsoft">GM online:</b> deixe em branco</li>
            <li><b class="text-goldsoft">Evento do servidor:</b> ainda não conectado a uma fonte</li>
          </ul>
        </details>
      </div>
    </div>
  </section>
</main>

<script>
const $ = (id) => document.getElementById(id);

// ---- Consent gate ----
// First-visit gate: must scroll to the end before "Aceitar" lights up.
// Subsequent visits via "sobre / política": informational only — close
// button + Aceitar are always available.
const CONSENT_KEY = "mlw.consent.v1";
const SCROLL_TOLERANCE_PX = 16;
function alreadyConsented() { return !!localStorage.getItem(CONSENT_KEY); }
function unlockConsent() {
  $("consent-accept").disabled = false;
  $("consent-hint").textContent = "Liberado ✓";
}
function checkConsentScroll() {
  const el = $("consent-scroll");
  // If the content fits without scrolling, treat as already-at-bottom.
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_TOLERANCE_PX;
  if (atBottom) unlockConsent();
}
function showConsent() {
  $("consent").classList.remove("hidden");
  if (alreadyConsented()) {
    unlockConsent();
    $("consent-hint").textContent = "Já aceito";
    $("consent-close").classList.remove("hidden");
  } else {
    $("consent-accept").disabled = true;
    $("consent-hint").textContent = "Role até o final";
    $("consent-close").classList.add("hidden");
    // If the content already fits in the box, the user has nothing to scroll.
    requestAnimationFrame(checkConsentScroll);
  }
}
function hideConsent() { $("consent").classList.add("hidden"); }

$("consent-scroll").addEventListener("scroll", checkConsentScroll);
$("consent-accept").onclick = () => {
  localStorage.setItem(CONSENT_KEY, "1");
  hideConsent();
};
$("consent-close").onclick = hideConsent;
$("show-consent").onclick = (e) => { e.preventDefault(); showConsent(); };

// ---- API helper ----
const fetchJSON = async (url, opts = {}) => {
  const r = await fetch(url, { credentials: "same-origin", headers: { "content-type": "application/json" }, ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || ("HTTP " + r.status));
  return body;
};

// Replace the button's label with a spinner while \`fn\` runs. Restores the
// original markup whether \`fn\` resolves or throws.
async function withSpinner(btn, fn) {
  const original = btn.innerHTML;
  const wasDisabled = btn.disabled;
  btn.disabled = true;
  btn.innerHTML = '<span class="inline-flex items-center gap-2"><svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.25" stroke-width="4"></circle><path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="4" stroke-linecap="round"></path></svg><span>' + original + '</span></span>';
  try {
    return await fn();
  } finally {
    btn.disabled = wasDisabled;
    btn.innerHTML = original;
  }
}

// ---- App state ----
let state = { user: null, characters: [], subscriptions: [] };

async function refresh() {
  try {
    const data = await fetchJSON("/api/me");
    state = data;
    renderDash();
  } catch {
    $("login").classList.remove("hidden");
    $("dash").classList.add("hidden");
  }
}

function renderCharLeft(container, c) {
  const tags = [];
  if (c.class) tags.push(c.class);
  if (typeof c.resets === "number") tags.push("R" + c.resets);
  if (c.last_level != null) tags.push("Nv " + c.last_level);
  if (c.last_map) tags.push(c.last_map);
  if (c.is_gm) tags.push('<span class="px-2 py-0.5 rounded-full bg-gold/10 text-goldsoft text-xs border border-gold/20">GM</span>');
  if (c.last_status) {
    const cls = c.last_status === "Online"
      ? 'bg-ok/10 text-ok border-ok/20'
      : 'bg-border text-muted border-border';
    tags.push('<span class="px-2 py-0.5 rounded-full ' + cls + ' text-xs border">' + c.last_status + '</span>');
  }
  if (tags.length === 0 && c.last_checked_at == null) {
    tags.push('<span class="text-muted italic">carregando…</span>');
  }
  container.innerHTML = '<div class="font-semibold text-goldsoft">' + c.name + '</div>' +
    '<div class="text-xs text-muted mt-0.5 flex flex-wrap gap-x-2 gap-y-1 items-center">' +
    tags.join('<span class="text-border">·</span>') + '</div>';
}

// Per-char on-demand refresh. Called by the ↻ button and by the lazy
// auto-refresh for chars with no last_checked_at. Updates the row in place
// when done.
async function refreshCharacterRow(li, id, silent = false) {
  const left = li.querySelector("div");
  const btn = li.querySelector("button[title='Atualizar dados']");
  const originalBtnHtml = btn ? btn.innerHTML : null;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<svg class="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.25" stroke-width="4"></circle><path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="4" stroke-linecap="round"></path></svg>';
  }
  try {
    const res = await fetchJSON("/api/characters/" + id + "/refresh", { method: "POST" });
    if (res.character) {
      // Patch local state and re-render this row.
      const idx = state.characters.findIndex((c) => c.id === id);
      if (idx >= 0) state.characters[idx] = res.character;
      renderCharLeft(left, res.character);
    }
    if (!silent && res.scraped === false) {
      // Browser Rendering didn't come up — be transparent rather than silent.
      console.warn("refresh: scrape didn't complete for char", id);
    }
  } catch (e) {
    if (!silent) alert(e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalBtnHtml;
    }
  }
}

function renderDash() {
  $("login").classList.add("hidden");
  $("dash").classList.remove("hidden");
  const u = state.user;
  const display = u.first_name || (u.username ? "@" + u.username : "Telegram");
  $("me-phone").textContent = display;

  const cl = $("char-list");
  cl.innerHTML = "";
  if (state.characters.length === 0) {
    cl.innerHTML = '<li class="py-3 text-muted text-sm">Nenhum personagem ainda. Adicione um abaixo.</li>';
  }
  const stale = []; // chars that need a background refresh
  for (const c of state.characters) {
    const li = document.createElement("li");
    li.className = "py-3 flex items-center justify-between gap-3";
    li.dataset.charId = c.id;
    const left = document.createElement("div");
    left.className = "min-w-0";
    renderCharLeft(left, c);
    const right = document.createElement("div");
    right.className = "flex items-center gap-2 shrink-0";
    const refreshBtn = document.createElement("button");
    refreshBtn.className = "h-8 w-8 rounded-md border border-border text-sm hover:bg-bg transition flex items-center justify-center";
    refreshBtn.title = "Atualizar dados";
    refreshBtn.innerHTML = "↻";
    refreshBtn.onclick = () => refreshCharacterRow(li, c.id);
    const del = document.createElement("button");
    del.className = "px-3 py-1.5 rounded-md border border-border text-danger text-sm hover:bg-bg transition";
    del.textContent = "Remover";
    del.onclick = async () => {
      if (!confirm("Remover " + c.name + "? Os alertas dele também serão excluídos.")) return;
      await fetchJSON("/api/characters/" + c.id, { method: "DELETE" });
      refresh();
    };
    right.appendChild(refreshBtn);
    right.appendChild(del);
    li.appendChild(left);
    li.appendChild(right);
    cl.appendChild(li);
    if (c.last_checked_at == null) stale.push(c.id);
  }

  // Lazy-fill: any char that's never been scraped (added during a Browser
  // Rendering cold-start, e.g.) gets refreshed in the background, sequentially
  // so we don't fan out browsers.
  (async () => {
    for (const id of stale) {
      const li = cl.querySelector('li[data-char-id="' + id + '"]');
      if (!li) continue;
      await refreshCharacterRow(li, id, /*silent*/ true);
    }
  })();

  const sel = $("sub-char");
  sel.innerHTML = "";
  for (const c of state.characters) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  }

  const sl = $("sub-list");
  sl.innerHTML = "";
  if (state.subscriptions.length === 0) {
    sl.innerHTML = '<li class="py-3 text-muted text-sm">Nenhum alerta ainda.</li>';
  }
  const charById = Object.fromEntries(state.characters.map((c) => [c.id, c.name]));
  for (const s of state.subscriptions) {
    const li = document.createElement("li");
    li.className = "py-3 flex items-center justify-between gap-3";
    const left = document.createElement("div");
    left.className = "min-w-0";
    const charName = s.character_id ? charById[s.character_id] || ("#" + s.character_id) : "(servidor)";
    let label = "";
    if (s.event_type === "level_gte") label = charName + ' — nível ≥ <b class="text-goldsoft">' + s.threshold + '</b>';
    else if (s.event_type === "map_eq") label = charName + ' — entra em <b class="text-goldsoft">' + s.threshold + '</b>';
    else if (s.event_type === "coords_in") label = charName + ' — entra na zona <b class="text-goldsoft">' + s.threshold + '</b>';
    else if (s.event_type === "status_eq") label = charName + ' — fica <b class="text-goldsoft">' + s.threshold + '</b>';
    else if (s.event_type === "gm_online") label = "GM " + charName + " — online";
    else if (s.event_type === "server_event") label = "evento do servidor: " + s.threshold;
    const status = s.active
      ? '<span class="px-2 py-0.5 rounded-full bg-ok/10 text-ok border border-ok/20 text-xs">ativo</span>'
      : '<span class="px-2 py-0.5 rounded-full bg-border text-muted border border-border text-xs">pausado</span>';
    left.innerHTML = '<div class="text-sm">' + label + '</div><div class="mt-1">' + status + '</div>';
    const right = document.createElement("div");
    right.className = "flex gap-2 shrink-0";
    const toggle = document.createElement("button");
    toggle.className = "px-3 py-1.5 rounded-md border border-border text-sm hover:bg-bg transition";
    toggle.textContent = s.active ? "Pausar" : "Retomar";
    toggle.onclick = async () => {
      await fetchJSON("/api/subscriptions/" + s.id, { method: "PATCH", body: JSON.stringify({ active: !s.active }) });
      refresh();
    };
    const del = document.createElement("button");
    del.className = "px-3 py-1.5 rounded-md border border-border text-danger text-sm hover:bg-bg transition";
    del.textContent = "Excluir";
    del.onclick = async () => {
      await fetchJSON("/api/subscriptions/" + s.id, { method: "DELETE" });
      refresh();
    };
    right.appendChild(toggle);
    right.appendChild(del);
    li.appendChild(left);
    li.appendChild(right);
    sl.appendChild(li);
  }
}

// ---- Auth handlers ----
// ---- Telegram deep-link login ----
// We don't auto-open the deeplink — some browsers (Chrome on macOS without
// Telegram Desktop) try the tg:// scheme and fail with "scheme has no
// registered handler." Instead we surface multiple ways to reach the bot
// (app, web, copy, QR) and poll for the webhook to redeem the token.
let pollHandle = null;
function buildWebLink(botUsername, token) {
  // Telegram Web doesn't accept ?start= directly, but it does honour the
  // tgaddr query that mirrors the tg:// resolve URL. This opens the bot
  // chat with the start parameter prefilled inside web.telegram.org.
  const tg = "tg://resolve?domain=" + encodeURIComponent(botUsername) + "&start=" + encodeURIComponent(token);
  return "https://web.telegram.org/k/?tgaddr=" + encodeURIComponent(tg);
}
function isMobile() {
  // navigator.userAgentData is the modern API; userAgent string is the
  // fallback. Either way, conservative — anything that isn't clearly mobile
  // is treated as desktop, which means Web gets recommended.
  if (navigator.userAgentData?.mobile) return true;
  return /android|iphone|ipad|ipod|opera mini|iemobile/i.test(navigator.userAgent);
}
function makeOptionButton({ href, primary, icon, label, hint }) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  a.className = primary
    ? "flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-md bg-[#229ED9] text-white text-sm font-semibold hover:brightness-110"
    : "flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-md border border-border text-sm hover:bg-panel";
  a.innerHTML =
    '<div class="flex items-center gap-2"><span>' + icon + '</span><span>' + label + '</span></div>' +
    '<div class="text-xs ' + (primary ? "text-white/80" : "text-muted") + '">' + hint + '</div>';
  return a;
}
async function startTelegramLogin() {
  const m = $("login-msg");
  m.textContent = "";
  m.className = "text-sm mt-3 min-h-[1.25rem]";

  let data;
  try {
    data = await fetchJSON("/api/auth/telegram/start", { method: "POST" });
  } catch (err) {
    m.classList.add("text-danger");
    m.textContent = err.message;
    return;
  }

  // Build the option buttons. Primary (highlighted) is whichever is most
  // likely to work on the user's device.
  const botFromLink = (data.deeplink.match(/t\\.me\\/([^?]+)/) || [])[1] || "mu_patos_bot";
  const webLink = buildWebLink(botFromLink, data.token);
  const appBtn = makeOptionButton({
    href: data.deeplink,
    primary: isMobile(),
    icon: "📱",
    label: "Abrir no app do Telegram",
    hint: "(precisa ter o Telegram instalado)",
  });
  const webBtn = makeOptionButton({
    href: webLink,
    primary: !isMobile(),
    icon: "🌐",
    label: "Abrir no Telegram Web",
    hint: "(funciona no navegador, sem instalar nada)",
  });
  const opts = $("login-options");
  opts.innerHTML = "";
  if (isMobile()) {
    opts.appendChild(appBtn);
    opts.appendChild(webBtn);
  } else {
    opts.appendChild(webBtn);
    opts.appendChild(appBtn);
  }

  $("login-link-text").value = data.deeplink;
  $("login-qr").src = "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=" + encodeURIComponent(data.deeplink);
  $("login-waiting").classList.remove("hidden");

  // Poll until the webhook redeems the token, or it expires.
  if (pollHandle) clearInterval(pollHandle);
  pollHandle = setInterval(async () => {
    try {
      const res = await fetch("/api/auth/telegram/status?token=" + encodeURIComponent(data.token), { credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 200 && body.ok) {
        clearInterval(pollHandle); pollHandle = null;
        refresh();
        return;
      }
      if (res.status === 410 || res.status === 404) {
        clearInterval(pollHandle); pollHandle = null;
        $("login-waiting").classList.add("hidden");
        m.classList.add("text-danger");
        m.textContent = body.error || "login expirou — tente de novo";
      }
    } catch {}
  }, 2000);
}
$("connect-tg").onclick = startTelegramLogin;
$("login-copy").onclick = async () => {
  const el = $("login-link-text");
  try {
    await navigator.clipboard.writeText(el.value);
    $("login-copy").textContent = "Copiado ✓";
    setTimeout(() => { $("login-copy").textContent = "Copiar"; }, 1500);
  } catch {
    el.select();
    document.execCommand && document.execCommand("copy");
  }
};
$("logout").onclick = async () => {
  await fetchJSON("/api/auth/logout", { method: "POST" });
  location.reload();
};

// ---- Char + sub handlers ----
$("add-char").onclick = async (e) => {
  const btn = e.currentTarget;
  $("char-msg").textContent = "";
  try {
    const name = $("new-char").value.trim();
    const is_gm = $("new-char-gm").checked;
    await withSpinner(btn, () =>
      fetchJSON("/api/characters", { method: "POST", body: JSON.stringify({ name, is_gm }) }),
    );
    $("new-char").value = "";
    $("new-char-gm").checked = false;
    refresh();
  } catch (err) {
    $("char-msg").textContent = err.message;
  }
};
$("add-sub").onclick = async (e) => {
  const btn = e.currentTarget;
  $("sub-msg").textContent = "";
  try {
    const character_id = Number($("sub-char").value) || null;
    const event_type = $("sub-type").value;
    const threshold = $("sub-thr").value.trim() || undefined;
    await withSpinner(btn, () =>
      fetchJSON("/api/subscriptions", { method: "POST", body: JSON.stringify({ character_id, event_type, threshold }) }),
    );
    $("sub-thr").value = "";
    refresh();
  } catch (err) {
    $("sub-msg").textContent = err.message;
  }
};

// ---- Boot ----
if (!localStorage.getItem(CONSENT_KEY)) showConsent();
refresh();
</script>
</body>
</html>`;

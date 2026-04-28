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

<!-- Toast host. Stacks notifications top-right; each toast slides in and
     auto-removes after a few seconds. -->
<div id="toasts" class="fixed top-4 right-4 z-[60] flex flex-col items-end gap-2 pointer-events-none max-w-[calc(100%-2rem)]"></div>
<div id="chart-tip" class="hidden fixed z-[70] pointer-events-none px-2 py-1 rounded bg-bg border border-gold/40 text-xs text-slate-100 shadow-lg whitespace-nowrap"></div>
<style>
  @keyframes mlw-toast-in {
    from { transform: translateX(120%); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
  }
  @keyframes mlw-toast-out {
    from { transform: translateX(0);    opacity: 1; }
    to   { transform: translateX(120%); opacity: 0; }
  }
  .mlw-toast { animation: mlw-toast-in 220ms cubic-bezier(.2,.7,.3,1) both; }
  .mlw-toast.leaving { animation: mlw-toast-out 220ms ease-in both; }

  /* Force every form-row control to exactly the same 40px box. Browser
     defaults give <select>, <input>, and <button> different intrinsic
     heights even with Tailwind's preflight — this overrides them. */
  main input[type="text"],
  main input[type="tel"],
  main select,
  main button.gold-btn {
    height: 40px !important;
    min-height: 40px !important;
    box-sizing: border-box;
    line-height: 1;
  }
</style>

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
      <p><b class="text-goldsoft">Se bugar, a culpa é do daddy.</b> Reclama com ele no jogo.</p>
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
              <li>Toque no nome / avatar do bot no topo da conversa pra abrir o perfil.</li>
              <li>Toque em <b>Notificações</b>.</li>
              <li>Em <b>Som</b>, escolha um toque diferente do padrão (pode ser um dos da lista do Telegram ou um som que você adicionou no iPhone).</li>
              <li>(Opcional) Em <b>Tom de Aviso</b>, ative pra repetir caso você ignore.</li>
              <li>(Opcional) Volte ao chat, deslize pra direita na lista de conversas e toque <b>Fixar</b> — fica sempre no topo.</li>
              <li>Em <b>Ajustes do iPhone</b> → <b>Notificações</b> → <b>Telegram</b>: confirme que <b>Permitir Notificações</b>, <b>Sons</b> e <b>Pré-visualizações</b> estão ligados.</li>
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
            class="flex-1 min-w-[180px] h-10 bg-bg border border-border rounded-md px-3 outline-none focus:border-gold/60" />
          <label class="inline-flex items-center gap-2 h-10 px-3 border border-border rounded-md text-sm">
            <input id="new-char-gm" type="checkbox" class="accent-gold" /> GM
          </label>
          <button id="add-char" class="gold-btn block px-4 rounded-md bg-gold text-bg font-semibold text-center border border-transparent hover:brightness-110 transition">Adicionar</button>
        </div>
      </div>
    </div>

    <div id="admin-card" class="hidden bg-panel border border-gold/30 rounded-xl p-5">
      <div class="flex items-center justify-between gap-3 mb-3">
        <h2 class="text-xs uppercase tracking-widest text-gold">Admin</h2>
        <button id="admin-poll" class="gold-btn block px-3 rounded-md bg-gold text-bg font-semibold text-center border border-transparent hover:brightness-110 transition text-xs">Rodar cron agora</button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead class="text-muted text-left border-b border-border">
            <tr>
              <th class="py-1.5 pr-2">#</th>
              <th class="py-1.5 pr-2">Char</th>
              <th class="py-1.5 pr-2">Dono</th>
              <th class="py-1.5 pr-2">Classe</th>
              <th class="py-1.5 pr-2">Lv</th>
              <th class="py-1.5 pr-2">Status</th>
              <th class="py-1.5 pr-2">Subs</th>
              <th class="py-1.5 pr-2">Ações</th>
            </tr>
          </thead>
          <tbody id="admin-chars"></tbody>
        </table>
      </div>
      <div id="admin-msg" class="text-[11px] text-muted mt-2"></div>
    </div>

    <div class="bg-panel border border-border rounded-xl p-5">
      <h2 class="text-xs uppercase tracking-widest text-muted mb-3">Alertas</h2>
      <ul id="sub-list" class="divide-y divide-border"></ul>
      <div class="mt-4 pt-4 border-t border-border space-y-3">
        <label class="text-xs text-muted block">Adicionar um alerta</label>
        <div class="grid gap-2 sm:grid-cols-2">
          <div>
            <label class="text-[11px] text-muted block mb-1">Personagem</label>
            <select id="sub-char" class="w-full bg-bg border border-border rounded-md px-3 outline-none focus:border-gold/60"></select>
          </div>
          <div>
            <label class="text-[11px] text-muted block mb-1">Tipo de alerta</label>
            <select id="sub-type" class="w-full bg-bg border border-border rounded-md px-3 outline-none focus:border-gold/60">
              <option value="level_gte">Nível atingido (≥)</option>
              <option value="map_eq">Entrou no mapa</option>
              <option value="status_eq">Online / offline</option>
              <option value="gm_online">GM online (este personagem)</option>
              <option value="level_stale">Sem subir level (idle)</option>
              <option value="server_event" disabled>Evento do servidor (em breve)</option>
            </select>
          </div>
        </div>
        <div id="sub-fields"></div>
        <div class="mt-3 mb-4">
          <label class="text-[11px] text-muted block mb-1">Mensagem customizada (opcional)</label>
          <input id="sub-custom-message" type="text" maxlength="200" placeholder="ex.: {username} upou para o nivel {lv}!" class="h-10 w-full bg-bg border border-border rounded-md px-3 outline-none focus:border-gold/60" />
          <div class="text-[11px] text-muted mt-1">Use <span class="text-goldsoft">{username}</span> e <span class="text-goldsoft">{lv}</span> para inserir dados.</div>
        </div>
        <button id="add-sub" class="gold-btn block px-5 rounded-md bg-gold text-bg font-semibold text-center border border-transparent hover:brightness-110 transition">Adicionar alerta</button>
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

// ---- Toasts ----
// kind: "ok" | "err" | "info" (default). Auto-dismiss after the ttl arg
// (ms); the user can also click a toast to dismiss it.
function toast(message, kind = "info", ttl = 4500) {
  const host = $("toasts");
  if (!host) return;
  const el = document.createElement("div");
  const palette = kind === "ok"
    ? "bg-ok/15 border-ok/40 text-ok"
    : kind === "err"
    ? "bg-danger/15 border-danger/40 text-danger"
    : "bg-panel border-border text-slate-200";
  el.className =
    "mlw-toast pointer-events-auto cursor-pointer min-w-[220px] max-w-sm border rounded-md px-3 py-2 text-sm shadow-lg backdrop-blur " + palette;
  el.textContent = message;
  const dismiss = () => {
    if (el.classList.contains("leaving")) return;
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 250);
  };
  el.onclick = dismiss;
  host.appendChild(el);
  if (ttl > 0) setTimeout(dismiss, ttl);
}

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

function relativeTime(unixSeconds) {
  if (!unixSeconds) return null;
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 30) return "agora";
  if (diff < 60) return diff + "s atrás";
  if (diff < 3600) return Math.floor(diff / 60) + " min atrás";
  if (diff < 86400) return Math.floor(diff / 3600) + "h atrás";
  return Math.floor(diff / 86400) + " d atrás";
}
function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;");
}
function statRow(label, value) {
  return '<div class="flex justify-between gap-3 py-1.5 border-b border-border/60 last:border-0">' +
    '<span class="text-muted">' + escapeHtml(label) + '</span>' +
    '<span class="text-slate-100 text-right">' + value + '</span>' +
    '</div>';
}
function renderCharLeft(container, c) {
  const profileUrl = "https://mupatos.com.br/site/profile/character/" + encodeURIComponent(c.name);

  // Loading state — first scrape hasn't landed yet.
  if (c.last_checked_at == null) {
    container.innerHTML =
      '<a href="' + profileUrl + '" target="_blank" rel="noopener" class="font-semibold text-goldsoft text-base hover:underline">' + escapeHtml(c.name) + '</a>' +
      '<div class="text-xs text-muted italic mt-1">carregando…</div>';
    return;
  }

  const statusBadge = c.last_status
    ? (c.last_status === "Online"
        ? '<span class="px-2 py-0.5 rounded-full bg-ok/10 text-ok border border-ok/20 text-xs">Online</span>'
        : '<span class="px-2 py-0.5 rounded-full bg-border text-muted border border-border text-xs">Offline</span>')
    : '<span class="text-muted text-xs">—</span>';

  const dash = '<span class="text-muted">—</span>';
  const rows = [];
  rows.push(statRow("Classe", c.class ? escapeHtml(c.class) : dash));
  rows.push(statRow("Resets", typeof c.resets === "number" ? String(c.resets) : dash));
  rows.push(statRow("Level", c.last_level != null ? '<b class="text-goldsoft">' + c.last_level + '</b>' : dash));
  rows.push(statRow("Mapa", c.last_map ? escapeHtml(c.last_map) : dash));
  rows.push(statRow("Situação", statusBadge));

  // Rankings (rank in the resets ladder + next target one slot above).
  // Both are null for chars not in the top 99 — show — instead.
  const rankOverall = c.rank_overall ? '#' + c.rank_overall : dash;
  const classBadge = c.class_code ? ' <span class="text-muted">(' + escapeHtml(c.class_code.toUpperCase()) + ')</span>' : '';
  const rankClass = c.rank_class ? '#' + c.rank_class + classBadge : dash;
  rows.push(statRow("Rank geral", rankOverall));
  rows.push(statRow("Rank classe", rankClass));
  if (c.next_target_name && c.next_target_resets != null) {
    const gap = (c.next_target_resets - (c.resets ?? 0));
    const gapTxt = gap > 0 ? ' <span class="text-muted">(+' + gap + ' resets)</span>' : '';
    rows.push(statRow("Próximo alvo", '<b class="text-goldsoft">' + escapeHtml(c.next_target_name) + '</b>' + gapTxt));
  }

  const checked = relativeTime(c.last_checked_at);
  const checkedLine = checked
    ? '<div class="text-[11px] text-muted mt-2">atualizado ' + checked + '</div>'
    : '';
  const gmTag = c.is_gm
    ? ' <span class="ml-2 px-2 py-0.5 rounded-full bg-gold/10 text-goldsoft text-xs border border-gold/20 align-middle">GM</span>'
    : '';

  container.innerHTML =
    '<div class="flex items-baseline gap-2 mb-2">' +
      '<a href="' + profileUrl + '" target="_blank" rel="noopener" class="font-semibold text-goldsoft text-base hover:underline">' + escapeHtml(c.name) + '</a>' +
      gmTag +
    '</div>' +
    '<div class="text-xs">' + rows.join("") + '</div>' +
    checkedLine;
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
    if (!silent) toast(e.message, "err");
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
  if (u.is_admin) {
    $("admin-card").classList.remove("hidden");
    loadAdminChars();
  }

  const cl = $("char-list");
  cl.innerHTML = "";
  if (state.characters.length === 0) {
    cl.innerHTML = '<li class="py-3 text-muted text-sm">Nenhum personagem ainda. Adicione um abaixo.</li>';
  }
  const stale = []; // chars that need a background refresh
  for (const c of state.characters) {
    const li = document.createElement("li");
    li.className = "py-3 flex items-start justify-between gap-3";
    li.dataset.charId = c.id;
    const left = document.createElement("div");
    left.className = "min-w-0 flex-1";
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
  const charById = Object.fromEntries(state.characters.map((c) => [c.id, c]));
  const now = Math.floor(Date.now() / 1000);
  for (const s of state.subscriptions) {
    const li = document.createElement("li");
    li.className = "py-3 flex items-center justify-between gap-3";
    const left = document.createElement("div");
    left.className = "min-w-0";
    const linkedChar = s.character_id ? charById[s.character_id] : null;
    const charName = linkedChar ? linkedChar.name : (s.character_id ? "#" + s.character_id : "(servidor)");
    let label = "";
    if (s.event_type === "level_gte") label = charName + ' — nível ≥ <b class="text-goldsoft">' + s.threshold + '</b>';
    else if (s.event_type === "map_eq") label = charName + ' — entra em <b class="text-goldsoft">' + s.threshold + '</b>';
    else if (s.event_type === "coords_in") label = charName + ' — entra na zona <b class="text-goldsoft">' + s.threshold + '</b>';
    else if (s.event_type === "status_eq") label = charName + ' — fica <b class="text-goldsoft">' + s.threshold + '</b>';
    else if (s.event_type === "gm_online") label = "GM " + charName + " — online";
    else if (s.event_type === "level_stale") label = charName + ' — sem subir level por <b class="text-goldsoft">' + s.threshold + ' min</b>';
    else if (s.event_type === "server_event") label = "evento do servidor: " + s.threshold;
    const activeBadge = s.active
      ? '<span class="px-2 py-0.5 rounded-full bg-ok/10 text-ok border border-ok/20 text-xs">ativo</span>'
      : '<span class="px-2 py-0.5 rounded-full bg-border text-muted border border-border text-xs">pausado</span>';

    // Last result badge:
    //   - cooldown_until > now -> "em cooldown"
    //   - last_fired_at present -> "disparou há X"
    //   - else -> "ainda não disparou"
    let resultBadge;
    if (s.cooldown_until && s.cooldown_until > now) {
      const remaining = relativeTime(now * 2 - s.cooldown_until); // hack: format the diff
      resultBadge = '<span class="px-2 py-0.5 rounded-full bg-gold/10 text-goldsoft border border-gold/20 text-xs">disparou recentemente · cooldown</span>';
    } else if (s.last_fired_at) {
      resultBadge = '<span class="px-2 py-0.5 rounded-full bg-ok/10 text-ok border border-ok/20 text-xs">disparou ' + relativeTime(s.last_fired_at) + '</span>';
    } else {
      resultBadge = '<span class="px-2 py-0.5 rounded-full bg-border text-muted border border-border text-xs">ainda não disparou</span>';
    }

    const meta = [];
    meta.push("criado " + (relativeTime(s.created_at) || "—"));
    if (linkedChar && linkedChar.last_checked_at) {
      meta.push("último check " + relativeTime(linkedChar.last_checked_at));
    } else if (s.character_id) {
      meta.push("ainda não checado");
    }

    left.innerHTML =
      '<div class="text-sm">' + label + '</div>' +
      '<div class="mt-1.5 flex flex-wrap gap-1.5 items-center">' + activeBadge + resultBadge + '</div>' +
      '<div class="text-[11px] text-muted mt-1">' + meta.join(' · ') + '</div>';
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
  let data;
  try {
    data = await fetchJSON("/api/auth/telegram/start", { method: "POST" });
  } catch (err) {
    toast(err.message, "err");
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
        toast(body.error || "login expirou — tente de novo", "err");
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
  try {
    const name = $("new-char").value.trim();
    const is_gm = $("new-char-gm").checked;
    await withSpinner(btn, () =>
      fetchJSON("/api/characters", { method: "POST", body: JSON.stringify({ name, is_gm }) }),
    );
    $("new-char").value = "";
    $("new-char-gm").checked = false;
    toast(name + " adicionado", "ok");
    refresh();
  } catch (err) {
    toast(err.message, "err");
  }
};
// ---- Subscription form: per-type fields ----
//
// We render a different mini-form for each event type so the user doesn't
// have to memorize threshold formats. On submit we read those fields and
// build the (event_type, threshold) tuple expected by the API. Note: the
// "Entrou no mapa" option can produce two different server-side event
// types — plain map_eq if coords are blank, or coords_in (with the
// Map:x1-x2:y1-y2 threshold) if the user filled the optional coord box.

const subTypeEl = $("sub-type");
const subFieldsEl = $("sub-fields");

const ctrlClass = "h-10 w-full bg-bg border border-border rounded-md px-3 outline-none focus:border-gold/60";

// Hand-curated coordinate boxes for known maps. When the user types one
// of these as the map name on a "Entrou no mapa" alert, we offer a
// checkbox that auto-fills the coords instead of forcing manual entry.
// Add more presets here as we identify them.
const SAFE_ZONES = {
  stadium: { x1: 60, x2: 70, y1: 39, y2: 50, label: "Área segura / Respawn (baú)" },
};
function safeZoneFor(mapName) {
  const k = (mapName || "").trim().toLowerCase();
  return SAFE_ZONES[k] || null;
}

function renderSubFields() {
  const t = subTypeEl.value;
  let html = "";
  if (t === "level_gte") {
    html = '<label class="text-[11px] text-muted block mb-1">Nível alvo (≥)</label>' +
      '<input id="sf-level" type="number" min="1" max="1000" placeholder="ex.: 360" class="' + ctrlClass + '" />';
  } else if (t === "map_eq") {
    html =
      '<label class="text-[11px] text-muted block mb-1">Nome do mapa</label>' +
      '<input id="sf-map" type="text" placeholder="ex.: Stadium" class="' + ctrlClass + '" />' +
      '<div id="sf-safezone-wrap" class="hidden mt-2">' +
        '<label class="inline-flex items-center gap-2 text-sm text-slate-300 cursor-pointer">' +
          '<input id="sf-safezone" type="checkbox" class="accent-gold" />' +
          '<span id="sf-safezone-label">Área segura</span>' +
        '</label>' +
        '<div class="text-[11px] text-muted mt-1">Marca quando o personagem aparece na área de respawn (útil pra detectar morte / AFK).</div>' +
      '</div>' +
      '<details id="sf-coords-details" class="mt-2 text-sm">' +
        '<summary class="cursor-pointer text-muted hover:text-goldsoft">Filtrar por coordenadas (opcional)</summary>' +
        '<div class="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">' +
          '<div><label class="text-[11px] text-muted block mb-1">X mínimo</label><input id="sf-x1" type="number" min="0" max="255" placeholder="60" class="' + ctrlClass + '" /></div>' +
          '<div><label class="text-[11px] text-muted block mb-1">X máximo</label><input id="sf-x2" type="number" min="0" max="255" placeholder="90" class="' + ctrlClass + '" /></div>' +
          '<div><label class="text-[11px] text-muted block mb-1">Y mínimo</label><input id="sf-y1" type="number" min="0" max="255" placeholder="80" class="' + ctrlClass + '" /></div>' +
          '<div><label class="text-[11px] text-muted block mb-1">Y máximo</label><input id="sf-y2" type="number" min="0" max="255" placeholder="100" class="' + ctrlClass + '" /></div>' +
        '</div>' +
        '<div class="text-[11px] text-muted mt-2">Para uma posição exata, use o mesmo número em mín e máx.</div>' +
      '</details>';
  } else if (t === "status_eq") {
    html =
      '<label class="text-[11px] text-muted block mb-1">Quando o personagem ficar…</label>' +
      '<select id="sf-status" class="' + ctrlClass + '">' +
        '<option value="Online">Online</option>' +
        '<option value="Offline">Offline</option>' +
      '</select>';
  } else if (t === "gm_online") {
    html = '<div class="text-xs text-muted bg-bg border border-border rounded-md px-3 py-2">Sem campos extras. O personagem precisa estar marcado como <b class="text-goldsoft">GM</b> na lista de personagens.</div>';
  } else if (t === "level_stale") {
    html =
      '<label class="text-[11px] text-muted block mb-1">Minutos sem subir de nível</label>' +
      '<input id="sf-stale" type="number" min="1" max="1440" placeholder="ex.: 5" class="' + ctrlClass + '" />' +
      '<div class="text-[11px] text-muted mt-1">Avisa se o personagem ficou esse tempo sem subir level (provavelmente AFK, morreu ou desconectou).</div>';
  } else if (t === "server_event") {
    html = '<div class="text-xs text-muted bg-bg border border-border rounded-md px-3 py-2">Evento do servidor ainda não está conectado a uma fonte. Em breve.</div>';
  }
  subFieldsEl.innerHTML = html;

  // map_eq: react to map-name typing → toggle the safe-zone checkbox.
  // When the checkbox is on, hide the manual-coords details so the user
  // isn't confused which one wins.
  const mapEl = $("sf-map");
  const wrap = $("sf-safezone-wrap");
  const cb = $("sf-safezone");
  const lbl = $("sf-safezone-label");
  const details = $("sf-coords-details");
  if (mapEl && wrap && cb && lbl && details) {
    const sync = () => {
      const z = safeZoneFor(mapEl.value);
      if (z) {
        wrap.classList.remove("hidden");
        lbl.textContent = z.label;
      } else {
        wrap.classList.add("hidden");
        cb.checked = false;
      }
      details.classList.toggle("hidden", !!cb.checked);
    };
    mapEl.addEventListener("input", sync);
    cb.addEventListener("change", sync);
  }
}
subTypeEl.addEventListener("change", renderSubFields);
renderSubFields();

function readSubFormPayload() {
  const character_id = Number($("sub-char").value) || null;
  const custom_message = ($("sub-custom-message")?.value || "").trim();
  const base = custom_message ? { character_id, custom_message } : { character_id };
  const t = subTypeEl.value;
  if (t === "level_gte") {
    const v = ($("sf-level").value || "").trim();
    if (!v) throw new Error("informe o nível");
    return { ...base, event_type: "level_gte", threshold: v };
  }
  if (t === "map_eq") {
    const map = ($("sf-map").value || "").trim();
    if (!map) throw new Error("informe o mapa");
    // Preset wins if it's checked: send the canned coord box.
    const safezoneOn = !!($("sf-safezone") && $("sf-safezone").checked);
    if (safezoneOn) {
      const z = safeZoneFor(map);
      if (z) {
        return {
          ...base,
          event_type: "coords_in",
          threshold: map + ":" + z.x1 + "-" + z.x2 + ":" + z.y1 + "-" + z.y2,
        };
      }
    }
    const x1 = ($("sf-x1") || {}).value, x2 = ($("sf-x2") || {}).value;
    const y1 = ($("sf-y1") || {}).value, y2 = ($("sf-y2") || {}).value;
    const anyCoord = [x1, x2, y1, y2].some((v) => (v ?? "").toString().trim() !== "");
    if (anyCoord) {
      if ([x1, x2, y1, y2].some((v) => (v ?? "").toString().trim() === "")) {
        throw new Error("preencha os 4 valores de coordenadas (ou deixe os 4 em branco)");
      }
      return {
        ...base,
        event_type: "coords_in",
        threshold: map + ":" + x1 + "-" + x2 + ":" + y1 + "-" + y2,
      };
    }
    return { ...base, event_type: "map_eq", threshold: map };
  }
  if (t === "status_eq") {
    return { ...base, event_type: "status_eq", threshold: $("sf-status").value };
  }
  if (t === "gm_online") {
    return { ...base, event_type: "gm_online" };
  }
  if (t === "level_stale") {
    const v = ($("sf-stale").value || "").trim();
    if (!v) throw new Error("informe os minutos");
    return { ...base, event_type: "level_stale", threshold: v };
  }
  throw new Error("evento do servidor ainda não disponível");
}

$("add-sub").onclick = async (e) => {
  const btn = e.currentTarget;
  try {
    const payload = readSubFormPayload();
    await withSpinner(btn, () =>
      fetchJSON("/api/subscriptions", { method: "POST", body: JSON.stringify(payload) }),
    );
    renderSubFields();   // resets the dynamic inputs to their empty state
    toast("alerta criado", "ok");
    refresh();
  } catch (err) {
    toast(err.message, "err");
  }
};

// ---- Admin panel ----
async function loadAdminChars() {
  const tbody = $("admin-chars");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" class="py-2 text-muted">carregando…</td></tr>';
  try {
    const data = await fetchJSON("/api/admin/chars");
    const chars = data.characters || [];
    if (chars.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="py-2 text-muted">nenhum char</td></tr>';
      return;
    }
    tbody.innerHTML = chars.map(adminCharRowHtml).join("");
    for (const c of chars) wireAdminCharActions(c);
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="8" class="py-2 text-danger">' + escapeHtml(e.message) + '</td></tr>';
  }
}
function adminCharRowHtml(c) {
  const owner = c.owner_first_name || (c.owner_username ? "@" + c.owner_username : "user " + c.user_id);
  const status = c.last_status
    ? (c.last_status === "Online"
        ? '<span class="text-ok">Online</span>'
        : '<span class="text-muted">Offline</span>')
    : '<span class="text-muted">—</span>';
  const blockedBadge = c.blocked ? ' <span class="px-1.5 py-0.5 rounded bg-danger/20 text-danger text-[10px] uppercase">blocked</span>' : '';
  const subBtn = (c.sub_count ?? 0) > 0
    ? '<button class="text-goldsoft hover:underline cursor-pointer" data-action="subs">' + c.sub_count + '</button>'
    : '<span class="text-muted">0</span>';
  const historyBtn = '<button class="px-2 py-1 rounded border border-border hover:bg-bg ml-1" data-action="history" title="Histórico">📈</button>';
  return '<tr class="border-b border-border/60" data-row="' + c.id + '">' +
    '<td class="py-1.5 pr-2 text-muted">' + c.id + '</td>' +
    '<td class="py-1.5 pr-2 font-semibold">' +
      '<a href="https://mupatos.com.br/site/profile/character/' + encodeURIComponent(c.name) + '" target="_blank" rel="noopener" class="text-goldsoft hover:underline">' + escapeHtml(c.name) + '</a>' +
      blockedBadge + (c.is_gm ? ' <span class="text-[10px] text-gold uppercase">GM</span>' : '') +
    '</td>' +
    '<td class="py-1.5 pr-2">' + escapeHtml(owner) + ' <span class="text-muted">#' + c.user_id + '</span></td>' +
    '<td class="py-1.5 pr-2">' + (c.class ? escapeHtml(c.class) : '<span class="text-muted">—</span>') + '</td>' +
    '<td class="py-1.5 pr-2">' + (c.last_level != null ? c.last_level : '<span class="text-muted">—</span>') + '</td>' +
    '<td class="py-1.5 pr-2">' + status + '</td>' +
    '<td class="py-1.5 pr-2">' + subBtn + '</td>' +
    '<td class="py-1.5 pr-2 whitespace-nowrap">' +
      '<button class="px-2 py-1 rounded border border-border hover:bg-bg" data-action="block">' + (c.blocked ? "Desbloquear" : "Bloquear") + '</button>' +
      ' <button class="px-2 py-1 rounded border border-border hover:bg-bg ml-1" data-action="refresh">↻</button>' +
      historyBtn +
    '</td>' +
    '</tr>' +
    '<tr class="hidden bg-bg/50" data-subs-for="' + c.id + '">' +
      '<td colspan="8" class="px-3 py-2 text-[11px]" data-subs-body></td>' +
    '</tr>' +
    '<tr class="hidden bg-bg/50" data-history-for="' + c.id + '">' +
      '<td colspan="8" class="px-3 py-2" data-history-body></td>' +
    '</tr>';
}
function wireAdminCharActions(c) {
  const row = document.querySelector('tr[data-row="' + c.id + '"]');
  if (!row) return;
  row.querySelector('[data-action="block"]').onclick = async () => {
    try {
      await fetchJSON("/api/admin/chars/" + c.id, {
        method: "PATCH",
        body: JSON.stringify({ blocked: !c.blocked }),
      });
      toast(c.blocked ? "desbloqueado" : "bloqueado", "ok");
      loadAdminChars();
    } catch (e) { toast(e.message, "err"); }
  };
  row.querySelector('[data-action="refresh"]').onclick = async () => {
    try {
      await fetchJSON("/api/admin/chars/" + c.id + "/refresh", { method: "POST" });
      toast("dados atualizados", "ok");
      loadAdminChars();
    } catch (e) { toast(e.message, "err"); }
  };
  const subsBtn = row.querySelector('[data-action="subs"]');
  if (subsBtn) subsBtn.onclick = () => toggleAdminSubs(c.id);
  const historyBtnEl = row.querySelector('[data-action="history"]');
  if (historyBtnEl) historyBtnEl.onclick = () => toggleAdminHistory(c.id, c.name);
}

async function toggleAdminHistory(charId, charName) {
  const expansion = document.querySelector('tr[data-history-for="' + charId + '"]');
  if (!expansion) return;
  if (!expansion.classList.contains("hidden")) {
    expansion.classList.add("hidden");
    return;
  }
  expansion.classList.remove("hidden");
  const cell = expansion.querySelector('[data-history-body]');
  cell.innerHTML = '<span class="text-muted text-xs">carregando histórico…</span>';
  try {
    const data = await fetchJSON("/api/admin/chars/" + charId + "/history?days=7");
    cell.innerHTML = renderHistoryChart(data, charName);
    wireHistoryTooltips(cell);
  } catch (e) {
    cell.innerHTML = '<span class="text-danger text-xs">' + escapeHtml(e.message) + '</span>';
  }
}

// Floating tooltip for the resets-over-time chart. One singleton tip div
// (top of body), positioned near the cursor on dot mouseover; hidden on
// mouseleave. Cheaper and more reliable than native <title> tooltips,
// which have a 1.5s show delay and don't work on inline SVG in some
// browsers (Chrome/macOS in particular).
function wireHistoryTooltips(cell) {
  const tip = $("chart-tip");
  if (!tip) return;
  const setBarsHighlight = (on) => {
    cell.querySelectorAll(".cycle-bar").forEach((b) => {
      b.setAttribute("stroke-opacity", on ? "1" : (b.getAttribute("stroke") === "#f0a93b" ? "0.85" : "0.5"));
      b.setAttribute("stroke-width", on ? "1.8" : (b.getAttribute("stroke") === "#f0a93b" ? "1.6" : "1.2"));
    });
  };
  cell.addEventListener("mousemove", (e) => {
    const t = e.target;
    const isHit = t instanceof Element && (t.classList.contains("hist-dot") || t.classList.contains("cycle-bar"));
    if (!isHit) {
      tip.classList.add("hidden");
      setBarsHighlight(false);
      return;
    }
    tip.textContent = t.getAttribute("data-tip") || "";
    tip.style.top = (e.clientY - 28) + "px";
    tip.style.left = (e.clientX + 12) + "px";
    tip.classList.remove("hidden");
    // Linked hover: any cycle-bar hovered → all of them highlight at once.
    setBarsHighlight(t.classList.contains("cycle-bar"));
  });
  cell.addEventListener("mouseleave", () => {
    tip.classList.add("hidden");
    setBarsHighlight(false);
  });
}

// Step-plot of resets over time. Resets only go up, so this shows progress
// at a glance — slope = leveling speed.
function renderHistoryChart(data, charName) {
  // Flatten cycles to a single sample list.
  const samples = [];
  for (const cyc of data.cycles ?? []) for (const s of cyc.samples) samples.push(s);
  if (samples.length === 0) {
    return '<div class="text-xs text-muted">sem snapshots ainda — espera alguns minutos pro cron registrar mudanças.</div>';
  }

  const tMin = samples[0].ts;
  const tMax = samples[samples.length - 1].ts;
  const span = Math.max(tMax - tMin, 1);
  const rMin = Math.min(...samples.map((s) => s.resets ?? 0));
  const rMax = Math.max(...samples.map((s) => s.resets ?? 0));
  const rSpan = Math.max(rMax - rMin, 1);
  const lMin = Math.min(...samples.map((s) => s.level ?? 0));
  const lMax = Math.max(...samples.map((s) => s.level ?? 0));
  const lSpan = Math.max(lMax - lMin, 1);

  // Padding on the right grew because we now show level ticks there too.
  const W = 720, H = 240, padL = 36, padR = 36, padT = 22, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  const xOf = (t) => padL + ((t - tMin) / span) * innerW;
  const yOf  = (r) => padT + innerH - ((r - rMin) / rSpan) * innerH;
  const yOfL = (l) => padT + innerH - ((l - lMin) / lSpan) * innerH;

  // Step path (horizontal then vertical).
  let d = "";
  samples.forEach((s, i) => {
    const x = xOf(s.ts), y = yOf(s.resets ?? 0);
    if (i === 0) d += "M" + x + "," + y;
    else {
      d += " L" + x + "," + yOf(samples[i - 1].resets ?? 0) + " L" + x + "," + y;
    }
  });

  // One small dot per sample with a native <title> tooltip — hover shows the
  // exact time, level, and reset count.
  const fmtFull = (ts) => {
    const d = new Date(ts * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  };
  // Level path: smooth line through samples (no step). Drops naturally on
  // each reset since level resets to a low number — produces the sawtooth
  // look user wants for "progression inside each reset".
  let lDp = "";
  samples.forEach((s, i) => {
    const x = xOf(s.ts), y = yOfL(s.level ?? lMin);
    lDp += (i === 0 ? "M" : " L") + x + "," + y;
  });

  const dots = samples.map((s) => {
    const x = xOf(s.ts);
    const yR = yOf(s.resets ?? 0);
    const yL = yOfL(s.level ?? lMin);
    const tip =
      fmtFull(s.ts) + " · resets " + (s.resets ?? "?") +
      " · lv " + (s.level ?? "?") +
      (s.map ? " · " + s.map : "") +
      (s.status ? " · " + s.status : "");
    const safeTip = escapeHtml(tip);
    return '<circle cx="' + x + '" cy="' + yR + '" r="3.5" fill="#f0a93b" stroke="#0b0d12" stroke-width="1.2" class="hist-dot cursor-pointer" data-tip="' + safeTip + '"></circle>' +
           '<circle cx="' + x + '" cy="' + yL + '" r="3" fill="#7aa2f7" stroke="#0b0d12" stroke-width="1.2" class="hist-dot cursor-pointer" data-tip="' + safeTip + '"></circle>';
  }).join("");

  // "Cycle benchmark" markers — one for the current cycle, one for the
  // previous (when applicable). Each marker is a vertical dashed line at
  // the moment the cycle first reached the current level, with a tooltip
  // showing how long that took from the cycle's local-min level. Linked
  // hover (any bar hovered → both highlight) makes side-by-side speed
  // comparison obvious.
  const last = samples[samples.length - 1];
  function cycleStats(resetCount, targetLevel) {
    const samp = samples.filter((s) => s.resets === resetCount);
    if (samp.length === 0) return null;
    let lowest = Infinity, fromTs = 0;
    for (const s of samp) {
      const lv = s.level ?? Infinity;
      if (lv < lowest) { lowest = lv; fromTs = s.ts; }
    }
    if (!isFinite(lowest)) return null;
    const hit = samp.find((s) => (s.level ?? -Infinity) >= targetLevel && s.ts >= fromTs);
    if (!hit) return null;
    return { fromLevel: lowest, fromTs, hitTs: hit.ts, duration: hit.ts - fromTs };
  }
  function fmtDur(secs) {
    if (secs < 60) return secs + "s";
    const m = Math.floor(secs / 60);
    if (m < 60) return m + "min";
    const h = Math.floor(m / 60), r = m % 60;
    return h + "h" + (r ? " " + r + "min" : "");
  }
  function bar(stats, resetCount, isCurrent) {
    if (!stats) return "";
    const x = xOf(stats.hitTs);
    const tip =
      "R" + resetCount + (isCurrent ? " (atual)" : "") +
      " · lv " + last.level + " em " +
      escapeHtml(fmtDur(stats.duration)) +
      " (desde lv " + stats.fromLevel + ")";
    const color = isCurrent ? "#f0a93b" : "#8a93a3";
    const opacity = isCurrent ? "0.85" : "0.5";
    const w = isCurrent ? "1.6" : "1.2";
    return '<line x1="' + x + '" x2="' + x + '" y1="' + padT + '" y2="' + (H - padB) + '" stroke="' + color + '" stroke-width="' + w + '" stroke-dasharray="4,3" stroke-opacity="' + opacity + '" class="cycle-bar cursor-pointer" data-tip="' + tip + '"></line>';
  }
  let markers = "";
  let inlineLabels = "";
  if (last.resets != null && last.level != null) {
    // One bar per distinct reset cycle visible in the window.
    const distinctResets = [...new Set(samples.map((s) => s.resets).filter((r) => r != null))].sort((a, b) => a - b);
    for (const r of distinctResets) {
      const stats = cycleStats(r, last.level);
      if (!stats) continue;
      const isCurrent = r === last.resets;
      markers += bar(stats, r, isCurrent);
      // Tiny duration label above each bar — gold for current cycle, muted
      // for past ones. Lets users scan-compare without hovering.
      const x = xOf(stats.hitTs);
      const fill = isCurrent ? "#f7c779" : "#8a93a3";
      inlineLabels += '<text x="' + (x + 3) + '" y="' + (padT + 10) + '" fill="' + fill + '" font-size="9">' + fmtDur(stats.duration) + '</text>';
    }
  }

  // Tiny legend in the top-right of the chart area.
  const legend =
    '<g transform="translate(' + (padL + 6) + ',' + (padT - 6) + ')" font-size="10" font-family="Inter,system-ui,sans-serif">' +
      '<circle cx="0" cy="0" r="3" fill="#f0a93b" />' +
      '<text x="6" y="3" fill="#f7c779">resets</text>' +
      '<circle cx="56" cy="0" r="3" fill="#7aa2f7" />' +
      '<text x="62" y="3" fill="#7aa2f7">level</text>' +
      '<line x1="100" x2="116" y1="0" y2="0" stroke="#f0a93b" stroke-dasharray="4,3" />' +
      '<text x="120" y="3" fill="#f7c779">ciclo atual</text>' +
      '<line x1="166" x2="182" y1="0" y2="0" stroke="#8a93a3" stroke-dasharray="4,3" />' +
      '<text x="186" y="3" fill="#8a93a3">ciclos passados</text>' +
    '</g>';

  // Gridlines at uniform fractions of the plot height; cap at 5, fewer
  // when the resets range is tiny (e.g. only 32→33). At each gridline the
  // left axis shows the resets value and the right shows level. Stable
  // even when both spans are small or huge.
  const tickCount = Math.max(2, Math.min(5, rSpan + 1));
  const yTickLines = [];
  for (let i = 0; i < tickCount; i++) {
    const frac = i / (tickCount - 1);          // 0=bottom, 1=top
    const y = padT + innerH * (1 - frac);
    const rVal = Math.round(rMin + rSpan * frac);
    const lVal = Math.round(lMin + lSpan * frac);
    yTickLines.push(
      '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y + '" y2="' + y + '" stroke="#252a36" stroke-dasharray="2,3" />' +
      '<text x="' + (padL - 4) + '" y="' + (y + 3) + '" fill="#f0a93b" font-size="10" text-anchor="end">' + rVal + '</text>' +
      '<text x="' + (W - padR + 4) + '" y="' + (y + 3) + '" fill="#7aa2f7" font-size="10" text-anchor="start">' + lVal + '</text>',
    );
  }

  // X labels — start, mid, end timestamps
  const fmt = (ts) => {
    const d = new Date(ts * 1000);
    return d.getDate() + "/" + (d.getMonth() + 1) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  };
  const xLabels = [tMin, tMin + span / 2, tMax].map((t, i) => {
    const x = xOf(t);
    const anchor = i === 0 ? "start" : i === 2 ? "end" : "middle";
    return '<text x="' + x + '" y="' + (H - padB + 14) + '" fill="#8a93a3" font-size="10" text-anchor="' + anchor + '">' + fmt(t) + '</text>';
  }).join("");

  const stats =
    '<div class="text-[11px] text-muted mb-2">' +
      '<b class="text-goldsoft">' + escapeHtml(charName) + '</b> · últimos ' + data.days + ' dias · ' +
      data.count + ' snapshots · resets ' + rMin + ' → <b class="text-goldsoft">' + rMax + '</b>' +
    '</div>';

  return stats +
    '<svg viewBox="0 0 ' + W + ' ' + H + '" class="w-full h-auto bg-bg border border-border rounded-md">' +
      yTickLines.join("") +
      markers +
      '<path d="' + lDp + '" fill="none" stroke="#7aa2f7" stroke-width="1.5" stroke-opacity="0.85" />' +
      '<path d="' + d + '" fill="none" stroke="#f0a93b" stroke-width="2" />' +
      dots +
      inlineLabels +
      xLabels +
      legend +
    '</svg>';
}

async function toggleAdminSubs(charId) {
  const expansion = document.querySelector('tr[data-subs-for="' + charId + '"]');
  if (!expansion) return;
  if (!expansion.classList.contains("hidden")) {
    expansion.classList.add("hidden");
    return;
  }
  expansion.classList.remove("hidden");
  const cell = expansion.querySelector('[data-subs-body]');
  cell.innerHTML = '<span class="text-muted">carregando…</span>';
  try {
    const data = await fetchJSON("/api/admin/chars/" + charId + "/subs");
    const subs = data.subscriptions || [];
    if (subs.length === 0) {
      cell.innerHTML = '<span class="text-muted">nenhum alerta</span>';
      return;
    }
    cell.innerHTML = renderAdminSubs(subs);
  } catch (e) {
    cell.innerHTML = '<span class="text-danger">' + escapeHtml(e.message) + '</span>';
  }
}

function renderAdminSubs(subs) {
  const nowSec = Math.floor(Date.now() / 1000);
  const items = subs.map((s) => {
    const owner = s.owner_first_name || (s.owner_username ? "@" + s.owner_username : "user " + s.user_id);
    let label = "";
    if (s.event_type === "level_gte") label = "nível ≥ <b class=\\"text-goldsoft\\">" + escapeHtml(s.threshold ?? "") + "</b>";
    else if (s.event_type === "map_eq") label = "entra em <b class=\\"text-goldsoft\\">" + escapeHtml(s.threshold ?? "") + "</b>";
    else if (s.event_type === "coords_in") label = "zona <b class=\\"text-goldsoft\\">" + escapeHtml(s.threshold ?? "") + "</b>";
    else if (s.event_type === "status_eq") label = "fica <b class=\\"text-goldsoft\\">" + escapeHtml(s.threshold ?? "") + "</b>";
    else if (s.event_type === "gm_online") label = "GM online";
    else if (s.event_type === "level_stale") label = "sem subir level por <b class=\\"text-goldsoft\\">" + escapeHtml(s.threshold ?? "") + " min</b>";
    else if (s.event_type === "server_event") label = "evento: " + escapeHtml(s.threshold ?? "");
    else label = escapeHtml(s.event_type);
    const status = s.active
      ? '<span class="text-ok">ativo</span>'
      : '<span class="text-muted">pausado</span>';
    let fired;
    if (s.cooldown_until && s.cooldown_until > nowSec) fired = '<span class="text-gold">cooldown ' + relativeTime(s.cooldown_until) + '</span>';
    else if (s.last_fired_at) fired = '<span class="text-ok">disparou ' + relativeTime(s.last_fired_at) + '</span>';
    else fired = '<span class="text-muted">ainda não</span>';
    return '<li class="flex flex-wrap gap-x-3 gap-y-0.5 py-1 border-b border-border/40 last:border-0">' +
      '<span class="text-muted">#' + s.id + '</span>' +
      '<span>' + label + '</span>' +
      '<span>' + status + '</span>' +
      '<span>' + fired + '</span>' +
      '<span class="text-muted">por ' + escapeHtml(owner) + '</span>' +
      '</li>';
  });
  return '<ul class="leading-snug">' + items.join("") + '</ul>';
}
$("admin-poll").onclick = async (e) => {
  const btn = e.currentTarget;
  try {
    const r = await withSpinner(btn, () => fetchJSON("/api/admin/poll", { method: "POST" }));
    toast("cron rodado: scraped=" + r.scraped + " fired=" + r.fired, "ok");
    loadAdminChars();
  } catch (err) { toast(err.message, "err"); }
};

// ---- Boot ----
if (!localStorage.getItem(CONSENT_KEY)) showConsent();
refresh();
</script>
</body>
</html>`;

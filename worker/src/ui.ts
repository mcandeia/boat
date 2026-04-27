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
  <div class="max-w-xl w-full bg-panel border border-border rounded-xl shadow-glow p-6">
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
      <p><b class="text-goldsoft">Isso NÃO é um bot de jogo.</b> Não automatiza ações dentro do MU, não joga por você, não clica em nada no servidor. Só lê uma página pública e dispara um WhatsApp quando algo que <i>você cadastrou</i> acontece (ex.: seu char passou de nível 360, entrou no Stadium, etc.).</p>
      <p><b class="text-goldsoft">Os alertas chegam por WhatsApp.</b> Pra entrar a gente te manda um código de 6 dígitos no zap — sem senha, sem cadastro de email. Seu número fica salvo só pra te avisar.</p>
      <p><b class="text-goldsoft">Se bugar, a culpa é do daddy.</b> Reclama com ele no jogo. (Xibata, vai com Deus.)</p>
      <div class="border-t border-border pt-3 mt-3 text-xs text-muted leading-relaxed">
        <p><b class="text-slate-300">Aviso legal.</b> Este painel é uma iniciativa pessoal do jogador <span class="text-goldsoft">daddy</span>. A equipe do Mu Patos <b>não tem envolvimento, afiliação ou responsabilidade</b> sobre este site. É um projeto gratuito feito por um jogador, sem vínculo oficial com o servidor. Qualquer problema, suporte ou reclamação deve ser direcionado ao daddy — não ao staff do Mu Patos.</p>
      </div>
      <p class="text-muted text-xs pt-2">Role até o final pra liberar o botão.</p>
      <div id="consent-bottom" class="h-1"></div>
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
      <div class="text-sm text-muted mt-1">by daddy · alertas no WhatsApp pra eventos do seu char</div>
    </div>
    <a href="#" id="show-consent" class="text-xs text-muted hover:text-goldsoft underline underline-offset-4">sobre / política</a>
  </header>

  <!-- ============================================================ -->
  <!-- LOGIN                                                        -->
  <!-- ============================================================ -->
  <section id="login" class="hidden bg-panel border border-border rounded-xl p-5 mb-5">
    <h2 class="text-xs uppercase tracking-widest text-muted mb-3">Entrar</h2>
    <p class="text-sm text-slate-400 mb-3">Te enviamos um código de 6 dígitos no seu WhatsApp.</p>

    <label class="text-xs text-muted block mb-1.5" for="phone">Número de WhatsApp</label>
    <div class="flex gap-2">
      <div class="flex flex-1 min-w-0">
        <span class="inline-flex items-center px-3 bg-bg border border-r-0 border-border rounded-l-md text-muted tabular-nums">+55</span>
        <input id="phone" type="tel" inputmode="numeric" placeholder="(83) 91234-5678" autocomplete="tel" maxlength="16"
          class="flex-1 min-w-0 bg-bg border border-border rounded-r-md px-3 py-2 outline-none focus:border-gold/60 text-slate-100" />
      </div>
      <button id="send-pin" class="px-4 py-2 rounded-md bg-gold text-bg font-semibold hover:brightness-110 transition">Enviar código</button>
    </div>

    <div id="login-step2" class="hidden mt-3">
      <label class="text-xs text-muted block mb-1.5" for="pin">Código de 6 dígitos</label>
      <div class="flex gap-2">
        <input id="pin" type="text" inputmode="numeric" maxlength="6" pattern="\\d{6}"
          class="flex-1 bg-bg border border-border rounded-md px-3 py-2 outline-none focus:border-gold/60 text-slate-100 tabular-nums tracking-widest" />
        <button id="verify-pin" class="px-4 py-2 rounded-md bg-gold text-bg font-semibold hover:brightness-110 transition">Verificar</button>
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
          <p>Como os alertas chegam pelo número do bot no WhatsApp, dá pra dar a esse contato um <b class="text-goldsoft">toque exclusivo</b> e prioridade alta — assim você sabe na hora que é um alerta de level e não outra mensagem qualquer.</p>

          <div>
            <div class="font-semibold text-goldsoft mb-1">📱 Android (WhatsApp)</div>
            <ol class="list-decimal list-inside space-y-1 text-slate-300">
              <li>Abra a conversa do bot no WhatsApp.</li>
              <li>Toque no nome do contato no topo → <b>Notificações personalizadas</b>.</li>
              <li>Ative <b>Usar notificações personalizadas</b>.</li>
              <li>Em <b>Som da notificação</b>, escolha um toque exclusivo (ex.: "Bamboo" ou um MP3 customizado).</li>
              <li>Ligue <b>Vibração: longa</b> e <b>Prioridade: alta</b>.</li>
              <li>(Opcional) Marque a conversa como <b>Conversa prioritária</b> — segure a conversa na lista, toque no ícone de estrela. Aparece em cima de tudo, inclusive no modo Não Perturbe.</li>
            </ol>
          </div>

          <div>
            <div class="font-semibold text-goldsoft mb-1">🍏 iPhone (WhatsApp)</div>
            <ol class="list-decimal list-inside space-y-1 text-slate-300">
              <li>Abra a conversa do bot.</li>
              <li>Toque no nome do contato no topo → <b>Notificações personalizadas</b>.</li>
              <li>Ative o switch e escolha um <b>Som</b> exclusivo.</li>
              <li>Volte aos <b>Ajustes do iPhone</b> → <b>Foco</b> → seu Foco ativo (ex.: "Não perturbar") → <b>Pessoas</b> → adicione o contato do bot em <b>Permitir notificações de</b>.</li>
              <li>Em <b>Ajustes do iPhone</b> → <b>Notificações</b> → <b>WhatsApp</b>, ative <b>Notificações Sensíveis ao Tempo</b>.</li>
            </ol>
          </div>

          <p class="text-xs text-muted">Dica: salve o número do bot na sua agenda com um nome claro (ex.: <code class="bg-bg px-1.5 py-0.5 rounded">MU Alerta</code>) antes de configurar — fica mais fácil achar e o nome aparece nas notificações.</p>
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
const CONSENT_KEY = "mlw.consent.v1";
function showConsent() {
  $("consent").classList.remove("hidden");
  $("consent-accept").disabled = true;
  $("consent-hint").textContent = "Role até o final";
}
function hideConsent() { $("consent").classList.add("hidden"); }

const obs = new IntersectionObserver((entries) => {
  if (entries.some((e) => e.isIntersecting)) {
    $("consent-accept").disabled = false;
    $("consent-hint").textContent = "Liberado ✓";
  }
}, { root: $("consent-scroll"), threshold: 1.0 });
obs.observe($("consent-bottom"));

$("consent-accept").onclick = () => {
  localStorage.setItem(CONSENT_KEY, "1");
  hideConsent();
};
$("show-consent").onclick = (e) => { e.preventDefault(); showConsent(); };

// ---- Phone formatting ----
// (83) 91234-5678 / (11) 3456-7890 — reformat on each keystroke. The worker's
// normalizePhone() prepends "55" automatically when we send digits-only.
function formatBrPhone(input) {
  const d = (input || "").replace(/\\D+/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return "(" + d;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length === 0) return "(" + ddd + ")";
  if (rest.length <= 4) return "(" + ddd + ") " + rest;
  if (rest.length <= 8) return "(" + ddd + ") " + rest.slice(0, rest.length - 4) + "-" + rest.slice(rest.length - 4);
  return "(" + ddd + ") " + rest.slice(0, 5) + "-" + rest.slice(5);
}
const phoneEl = $("phone");
phoneEl.addEventListener("input", () => { phoneEl.value = formatBrPhone(phoneEl.value); });
const phoneDigits = () => phoneEl.value.replace(/\\D+/g, "");

// ---- API helper ----
const fetchJSON = async (url, opts = {}) => {
  const r = await fetch(url, { credentials: "same-origin", headers: { "content-type": "application/json" }, ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || ("HTTP " + r.status));
  return body;
};

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

function renderDash() {
  $("login").classList.add("hidden");
  $("dash").classList.remove("hidden");
  $("me-phone").textContent = state.user.whatsapp;

  const cl = $("char-list");
  cl.innerHTML = "";
  if (state.characters.length === 0) {
    cl.innerHTML = '<li class="py-3 text-muted text-sm">Nenhum personagem ainda. Adicione um abaixo.</li>';
  }
  for (const c of state.characters) {
    const li = document.createElement("li");
    li.className = "py-3 flex items-center justify-between gap-3";
    const left = document.createElement("div");
    left.className = "min-w-0";
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
    left.innerHTML = '<div class="font-semibold text-goldsoft">' + c.name + '</div><div class="text-xs text-muted mt-0.5 flex flex-wrap gap-x-2 gap-y-1">' + tags.join('<span class="text-border">·</span>') + '</div>';
    const del = document.createElement("button");
    del.className = "px-3 py-1.5 rounded-md border border-border text-danger text-sm hover:bg-bg transition shrink-0";
    del.textContent = "Remover";
    del.onclick = async () => {
      if (!confirm("Remover " + c.name + "? Os alertas dele também serão excluídos.")) return;
      await fetchJSON("/api/characters/" + c.id, { method: "DELETE" });
      refresh();
    };
    li.appendChild(left);
    li.appendChild(del);
    cl.appendChild(li);
  }

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
$("send-pin").onclick = async () => {
  const m = $("login-msg");
  m.textContent = "";
  m.className = "text-sm mt-3 min-h-[1.25rem]";
  try {
    await fetchJSON("/api/auth/request-pin", { method: "POST", body: JSON.stringify({ whatsapp: phoneDigits() }) });
    $("login-step2").classList.remove("hidden");
    m.classList.add("text-ok");
    m.textContent = "Código enviado. Verifique seu WhatsApp.";
  } catch (e) {
    m.classList.add("text-danger");
    m.textContent = e.message;
  }
};
$("verify-pin").onclick = async () => {
  const m = $("login-msg");
  m.textContent = "";
  m.className = "text-sm mt-3 min-h-[1.25rem]";
  try {
    const pin = $("pin").value.trim();
    await fetchJSON("/api/auth/verify-pin", { method: "POST", body: JSON.stringify({ whatsapp: phoneDigits(), pin }) });
    refresh();
  } catch (e) {
    m.classList.add("text-danger");
    m.textContent = e.message;
  }
};
$("logout").onclick = async () => {
  await fetchJSON("/api/auth/logout", { method: "POST" });
  location.reload();
};

// ---- Char + sub handlers ----
$("add-char").onclick = async () => {
  $("char-msg").textContent = "";
  try {
    const name = $("new-char").value.trim();
    const is_gm = $("new-char-gm").checked;
    await fetchJSON("/api/characters", { method: "POST", body: JSON.stringify({ name, is_gm }) });
    $("new-char").value = "";
    $("new-char-gm").checked = false;
    refresh();
  } catch (e) {
    $("char-msg").textContent = e.message;
  }
};
$("add-sub").onclick = async () => {
  $("sub-msg").textContent = "";
  try {
    const character_id = Number($("sub-char").value) || null;
    const event_type = $("sub-type").value;
    const threshold = $("sub-thr").value.trim() || undefined;
    await fetchJSON("/api/subscriptions", { method: "POST", body: JSON.stringify({ character_id, event_type, threshold }) });
    $("sub-thr").value = "";
    refresh();
  } catch (e) {
    $("sub-msg").textContent = e.message;
  }
};

// ---- Boot ----
if (!localStorage.getItem(CONSENT_KEY)) showConsent();
refresh();
</script>
</body>
</html>`;

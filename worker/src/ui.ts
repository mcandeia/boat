// Single-page UI served from the Worker. No bundler - Tailwind via CDN.
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

<main id="app" class="max-w-3xl mx-auto px-4 py-10">
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
  <section id="dash" class="hidden">
    <div class="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5 items-start">
      <!-- Side menu (Dashboard/Admin) -->
      <nav class="bg-panel border border-border rounded-xl p-3 lg:sticky lg:top-6">
        <div class="text-[11px] uppercase tracking-widest text-muted px-2 pt-1 pb-2">Menu</div>
        <div class="flex lg:flex-col gap-2">
          <button id="nav-dashboard" class="flex-1 lg:flex-none px-3 py-2 rounded-md border border-border text-sm hover:bg-bg transition text-left">Dashboard</button>
          <button id="nav-market" class="flex-1 lg:flex-none px-3 py-2 rounded-md border border-border text-sm hover:bg-bg transition text-left">🛒 Mercado</button>
          <button id="nav-admin" class="hidden flex-1 lg:flex-none px-3 py-2 rounded-md border border-gold/40 text-goldsoft hover:bg-gold/10 transition text-left">Admin</button>
        </div>
        <div id="nav-hint" class="hidden mt-3 text-[11px] text-muted px-2 leading-relaxed">
          Dica: use o menu para alternar entre Dashboard, Mercado e Admin.
        </div>
      </nav>

      <!-- Main content -->
      <div class="min-w-0">
      <!-- Normal user dashboard -->
      <div id="dash-main" class="space-y-5">
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
          <div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h2 class="text-xs uppercase tracking-widest text-muted">Personagens</h2>
            <button id="user-compare" class="hidden px-3 py-1.5 rounded-md border border-border text-xs hover:bg-bg transition">📊 Comparar</button>
          </div>
          <div id="user-comparison-chart" class="hidden mb-4 bg-bg/50 p-4 rounded-xl border border-border"></div>
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

        <div class="bg-panel border border-border rounded-xl p-5">
          <h2 class="text-xs uppercase tracking-widest text-muted mb-3">Alertas</h2>
          <div id="sub-list" class="space-y-2"></div>
          <div class="mt-4 pt-4 border-t border-border">
            <details open class="group">
              <summary class="cursor-pointer select-none flex items-center justify-between gap-3">
                <div>
                  <div class="text-xs text-muted uppercase tracking-widest">Adicionar um alerta</div>
                  <div class="text-[11px] text-muted mt-1">Escolha o tipo, preencha os campos e veja um preview antes de criar.</div>
                </div>
                <span class="text-xs text-muted group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <div class="mt-3 space-y-3">
                <div class="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label class="text-[11px] text-muted block mb-1">Personagem</label>
                    <select id="sub-char" class="w-full bg-bg border border-border rounded-md px-3 outline-none focus:border-gold/60"></select>
                    <div class="text-[11px] text-muted mt-1">Para eventos do servidor, esse campo é ignorado.</div>
                  </div>
                  <div>
                    <label class="text-[11px] text-muted block mb-1">Tipo de alerta</label>
                    <select id="sub-type" class="w-full bg-bg border border-border rounded-md px-3 outline-none focus:border-gold/60">
                      <option value="level_gte">Nível atingido (≥)</option>
                      <option value="map_eq">Entrou no mapa</option>
                      <option value="status_eq">Online / offline</option>
                      <option value="gm_online">GM online (este personagem)</option>
                      <option value="level_stale">Sem subir level (idle)</option>
                      <option value="server_event">Evento do servidor (Chaos Castle, invasões, etc.)</option>
                    </select>
                  </div>
                </div>
                <div id="sub-fields"></div>
                <div class="rounded-md border border-border bg-bg/40 px-3 py-2">
                  <div class="text-[11px] uppercase tracking-widest text-muted mb-1">Preview</div>
                  <div id="sub-preview" class="text-sm text-slate-200">—</div>
                  <div id="sub-preview-hint" class="text-[11px] text-muted mt-1"></div>
                </div>
                <div>
                  <label class="text-[11px] text-muted block mb-1">Mensagem customizada (opcional)</label>
                  <input id="sub-custom-message" type="text" maxlength="200" placeholder="ex.: {username} upou para o nivel {lv}!" class="h-10 w-full bg-bg border border-border rounded-md px-3 outline-none focus:border-gold/60" />
                  <div class="text-[11px] text-muted mt-1">Use tokens (ex.: <span class="text-goldsoft">{username}</span>, <span class="text-goldsoft">{lv}</span>) para inserir dados.</div>
                  <div id="token-help" class="mt-2"></div>
                </div>
                <div class="flex items-center gap-3 flex-wrap">
                  <button id="add-sub" class="gold-btn block px-5 rounded-md bg-gold text-bg font-semibold text-center border border-transparent hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed" disabled>Adicionar alerta</button>
                  <div id="sub-form-error" class="text-[11px] text-danger"></div>
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>

      <!-- Market panel -->
      <div id="market-card" class="hidden space-y-4">
        <div class="bg-panel border border-border rounded-xl p-5">
          <div class="flex items-center justify-between gap-3 flex-wrap mb-3">
            <h2 class="text-xs uppercase tracking-widest text-muted">🛒 Mercado</h2>
            <button id="market-new-btn" class="gold-btn block px-4 rounded-md bg-gold text-bg font-semibold text-center border border-transparent hover:brightness-110 transition">+ novo anúncio</button>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-xs mb-3">
            <span class="text-muted mr-1">ordenar:</span>
            <button data-sort="hot" class="market-sort px-2 py-0.5 rounded border border-goldsoft text-goldsoft">🔥 em alta</button>
            <button data-sort="new" class="market-sort px-2 py-0.5 rounded border border-border text-muted hover:text-slate-300">🆕 novos</button>
            <span class="text-muted mx-1">·</span>
            <span class="text-muted">tipo:</span>
            <button data-side="" class="market-side px-2 py-0.5 rounded border border-goldsoft text-goldsoft">todos</button>
            <button data-side="sell" class="market-side px-2 py-0.5 rounded border border-border text-muted hover:text-slate-300">vendendo</button>
            <button data-side="buy" class="market-side px-2 py-0.5 rounded border border-border text-muted hover:text-slate-300">comprando</button>
            <button data-side="donate" class="market-side px-2 py-0.5 rounded border border-border text-muted hover:text-slate-300">doação</button>
            <input id="market-search" placeholder="buscar item ou nota..." class="ml-auto h-8 bg-bg border border-border rounded-md px-2 outline-none focus:border-gold/60 text-xs min-w-[160px]" />
          </div>
          <div id="market-list" class="space-y-3"></div>
        </div>
      </div>

      <!-- Admin panel (only visible for admins + when tab selected) -->
      <div id="admin-card" class="hidden bg-panel border border-gold/30 rounded-xl p-5">
          <div class="flex items-center justify-between gap-3 mb-3">
            <h2 class="text-xs uppercase tracking-widest text-gold">Admin</h2>
            <div class="flex gap-2">
              <button id="admin-compare" class="px-3 py-1.5 rounded-md border border-gold/40 text-goldsoft hover:bg-gold/10 transition text-xs">📈 Comparar</button>
              <button id="admin-scrape-items" class="px-3 py-1.5 rounded-md border border-gold/40 text-goldsoft hover:bg-gold/10 transition text-xs">🛍️ Scrapear catálogo</button>
              <button id="admin-poll" class="gold-btn block px-3 rounded-md bg-gold text-bg font-semibold text-center border border-transparent hover:brightness-110 transition text-xs">Rodar cron agora</button>
            </div>
          </div>
          <div id="admin-comparison-chart" class="hidden mb-6 bg-bg/50 p-4 rounded-xl border border-border"></div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="text-muted text-left border-b border-border">
                <tr>
                  <th class="py-1.5 pr-2 w-6"></th>
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

          <div class="mt-5 pt-4 border-t border-border">
            <div class="flex items-center justify-between gap-3 mb-2">
              <h3 class="text-xs uppercase tracking-widest text-gold">Eventos do servidor</h3>
              <span class="text-[11px] text-muted">scraped de mupatos.net (1×/h). Marca <b>Manual</b> pra travar o horário.</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead class="text-muted text-left border-b border-border">
                  <tr>
                    <th class="py-1.5 pr-2">Cat</th>
                    <th class="py-1.5 pr-2">Evento</th>
                    <th class="py-1.5 pr-2">Sala</th>
                    <th class="py-1.5 pr-2">Horários (HH:MM,HH:MM,...)</th>
                    <th class="py-1.5 pr-2">Manual</th>
                    <th class="py-1.5 pr-2"></th>
                  </tr>
                </thead>
                <tbody id="admin-events"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div> <!-- /main content -->
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
let userCompareMode = false;

async function refresh() {
  try {
    const data = await fetchJSON("/api/me");
    state = data;
    renderDash();
  } catch {
    $("login").classList.remove("hidden");
    $("dash").classList.add("hidden");
    setAppAdminLayout(false);
  }
}

function setAppAdminLayout(isAdmin) {
  const app = $("app");
  if (!app) return;
  app.classList.remove("max-w-3xl", "max-w-6xl");
  app.classList.add(isAdmin ? "max-w-6xl" : "max-w-3xl");
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
function formatDuration(seconds) {
  if (seconds == null || isNaN(seconds)) return null;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return h + "h " + m + "m";
  return m + "m";
}
function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;");
}

// ---- Class symbols (MU) ----
// Keep it resilient to naming variants coming from the scrape.
const CLASS_SYMBOLS = [
  { re: /\b(dark\s*wizard|dw|wizard|mago)\b/i, sym: "🧙", label: "Dark Wizard" },
  { re: /\b(dark\s*knight|dk|knight|guerreiro)\b/i, sym: "🗡️", label: "Dark Knight" },
  { re: /\b(elf|fairy\s*elf|fe|arqueira)\b/i, sym: "🏹", label: "Elf" },
  { re: /\b(summoner|su|invocadora)\b/i, sym: "🔮", label: "Summoner" },
  { re: /\b(magic\s*gladiator|mg|gladiator)\b/i, sym: "⚔️", label: "Magic Gladiator" },
  { re: /\b(dark\s*lord|dl|lord)\b/i, sym: "👑", label: "Dark Lord" },
  { re: /\b(rage\s*fighter|rf|fighter)\b/i, sym: "🥊", label: "Rage Fighter" },
];
function classBadgeHtml(className) {
  if (!className) return "";
  const hit = CLASS_SYMBOLS.find((x) => x.re.test(className));
  if (!hit) return "";
  return '<span class="mr-1.5" title="' + escapeHtml(hit.label) + '">' + hit.sym + '</span>';
}
function fmtFullTs(unixSeconds) {
  if (!unixSeconds) return null;
  const d = new Date(unixSeconds * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() +
    " " + pad(d.getHours()) + ":" + pad(d.getMinutes())
  );
}
function statRow(label, value) {
  return '<div class="flex justify-between gap-3 py-1.5 border-b border-border/60 last:border-0">' +
    '<span class="text-muted">' + escapeHtml(label) + '</span>' +
    '<span class="text-slate-100 text-right">' + value + '</span>' +
    '</div>';
}
function statRowIcon(icon, label, value) {
  return '<div class="flex justify-between gap-3 py-1.5 border-b border-border/60 last:border-0">' +
    '<span class="text-muted flex items-center gap-2"><span class="text-slate-300" aria-hidden="true">' + icon + '</span><span>' + escapeHtml(label) + '</span></span>' +
    '<span class="text-slate-100 text-right">' + value + '</span>' +
    '</div>';
}
function statCard(icon, label, value) {
  // Label is allowed to wrap to a second line; the value still truncates so
  // a long map/character name doesn't blow up the card.
  return (
    '<div class="rounded-lg border border-border bg-bg/40 px-3 py-2.5 min-w-0">' +
      '<div class="flex items-start gap-1.5 text-[10px] text-muted uppercase tracking-wide leading-tight">' +
        '<span class="text-slate-300 leading-none" aria-hidden="true">' + icon + '</span>' +
        '<span>' + escapeHtml(label) + '</span>' +
      '</div>' +
      '<div class="mt-1 text-sm text-slate-100 font-semibold truncate">' + value + '</div>' +
    '</div>'
  );
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
  const cards = [];
  cards.push(statCard("🎭", "Classe", c.class ? (classBadgeHtml(c.class) + escapeHtml(c.class)) : dash));
  cards.push(statCard("♻️", "Resets", typeof c.resets === "number" ? '<span class="text-goldsoft">' + String(c.resets) + '</span>' : dash));
  cards.push(statCard("⏱️", "Média/reset", c.avg_reset_time ? formatDuration(c.avg_reset_time) : dash));
  cards.push(statCard("📈", "Level", c.last_level != null ? '<span class="text-goldsoft">' + c.last_level + '</span>' : dash));
  cards.push(statCard("🗺️", "Mapa", c.last_map ? escapeHtml(c.last_map) : dash));
  cards.push(statCard("🟢", "Situação", statusBadge));

  // Rankings (rank in the resets ladder + next target one slot above).
  // Both are null for chars not in the top 99 — show — instead.
  const rankOverall = c.rank_overall ? '#' + c.rank_overall : dash;
  const classBadge = c.class_code ? ' <span class="text-muted">(' + escapeHtml(c.class_code.toUpperCase()) + ')</span>' : '';
  const rankClass = c.rank_class ? '#' + c.rank_class + classBadge : dash;
  cards.push(statCard("🏆", "Rank geral", rankOverall));
  cards.push(statCard("🥇", "Rank classe", rankClass));
  if (c.next_target_name && c.next_target_resets != null) {
    const gap = (c.next_target_resets - (c.resets ?? 0));
    const gapTxt = gap > 0 ? ' <span class="text-muted">(+' + gap + ' resets)</span>' : '';
    cards.push(statCard("🎯", "Próximo alvo", '<span class="text-goldsoft">' + escapeHtml(c.next_target_name) + '</span>' + gapTxt));
  }

  const checked = relativeTime(c.last_checked_at);
  const checkedFull = fmtFullTs(c.last_checked_at);
  const checkedLine = checked
    ? '<div class="text-[11px] text-muted mt-2" title="' + escapeHtml(checkedFull || "") + '">atualizado ' + checked + (checkedFull ? ' <span class="text-muted/70">(ver horário)</span>' : '') + '</div>'
    : '';
  const gmTag = c.is_gm
    ? ' <span class="ml-2 px-2 py-0.5 rounded-full bg-gold/10 text-goldsoft text-xs border border-gold/20 align-middle">GM</span>'
    : '';

  container.innerHTML =
    '<div class="flex items-baseline gap-2 mb-2">' +
      '<a href="' + profileUrl + '" target="_blank" rel="noopener" class="font-semibold text-goldsoft text-base hover:underline">' + escapeHtml(c.name) + '</a>' +
      gmTag +
    '</div>' +
    '<div class="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">' + cards.join("") + '</div>' +
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
  setAppAdminLayout(!!u.is_admin);
  if (u.is_admin) {
    $("nav-admin").classList.remove("hidden");
    $("nav-hint").classList.remove("hidden");
    loadAdminChars();
    loadAdminEvents();
  }

  // Initial tab on load: ?market=N from a Telegram link wins, else the
  // last persisted choice, else the dashboard.
  if (!window.__viewInitialized) {
    window.__viewInitialized = true;
    const params = new URLSearchParams(location.search);
    let initial = "dashboard";
    if (params.get("market")) initial = "market";
    else {
      try {
        const saved = localStorage.getItem("mlw.tab");
        if (saved === "market" || (saved === "admin" && u.is_admin) || saved === "dashboard") initial = saved;
      } catch {}
    }
    setDashView(initial);
  }

  const cl = $("char-list");
  cl.innerHTML = "";
  // User compare button only makes sense with 2+ chars.
  const userCompareBtn = $("user-compare");
  if (userCompareBtn) {
    userCompareBtn.classList.toggle("hidden", state.characters.length < 2);
    userCompareBtn.textContent = userCompareMode ? "Gerar comparativo" : "📊 Comparar";
  }
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
    if (userCompareMode) {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "accent-gold cursor-pointer";
      cb.setAttribute("data-user-compare", "1");
      cb.setAttribute("data-char-id", c.id);
      cb.setAttribute("data-char-name", c.name);
      right.appendChild(cb);
    }
    const refreshBtn = document.createElement("button");
    refreshBtn.className = "h-8 w-8 rounded-md border border-border text-sm hover:bg-bg transition flex items-center justify-center";
    refreshBtn.title = "Atualizar dados";
    refreshBtn.innerHTML = "↻";
    refreshBtn.onclick = () => refreshCharacterRow(li, c.id);
    const histBtn = document.createElement("button");
    histBtn.className = "h-8 w-8 rounded-md border border-border text-sm hover:bg-bg transition flex items-center justify-center";
    histBtn.title = "Histórico";
    histBtn.innerHTML = "📈";
    histBtn.onclick = () => toggleUserCharHistory(c.id, c.name);
    const del = document.createElement("button");
    del.className = "px-3 py-1.5 rounded-md border border-border text-danger text-sm hover:bg-bg transition";
    del.textContent = "Remover";
    del.onclick = async () => {
      if (!await confirmModal("Remover " + c.name + "? Os alertas dele também serão excluídos.", { okLabel: "Remover", danger: true })) return;
      await fetchJSON("/api/characters/" + c.id, { method: "DELETE" });
      refresh();
    };
    right.appendChild(refreshBtn);
    right.appendChild(histBtn);
    right.appendChild(del);
    li.appendChild(left);
    li.appendChild(right);
    cl.appendChild(li);
    // Hidden expansion <li> for the history chart, toggled by histBtn.
    const histLi = document.createElement("li");
    histLi.className = "hidden border-t border-border/60";
    histLi.dataset.userHistFor = c.id;
    histLi.innerHTML = '<div class="px-2 py-3" data-history-body></div>';
    cl.appendChild(histLi);
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
    sl.innerHTML = '<div class="py-3 text-muted text-sm">Nenhum alerta ainda.</div>';
  }
  const charById = Object.fromEntries(state.characters.map((c) => [c.id, c]));
  const now = Math.floor(Date.now() / 1000);
  for (const s of state.subscriptions) {
    const li = document.createElement("div");
    li.className = "rounded-xl border border-border bg-bg/40 px-4 py-3 flex items-start justify-between gap-3";
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
    else if (s.event_type === "server_event") {
      const parts = (s.threshold || "").split("|");
      label = '📣 <b class="text-goldsoft">' + (parts[0] || "?") + '</b> (' + (parts[1] || "?").toUpperCase() + ') — ' + (parts[2] || "?") + ' min antes';
      if (s.next_fire_at) {
        const secs = s.next_fire_at - now;
        if (secs > 0) label += ' · <span class="text-muted">próximo em <b class="text-goldsoft">' + escapeHtml(formatDuration(secs)) + '</b></span>';
      }
    }
    const activeBadge = s.active
      ? '<span class="px-2 py-0.5 rounded-full bg-ok/10 text-ok border border-ok/20 text-xs">ativo</span>'
      : '<span class="px-2 py-0.5 rounded-full bg-border text-muted border border-border text-xs">pausado</span>';

    // Last result badge:
    //   - cooldown_until > now -> "em cooldown"
    //   - last_fired_at present -> "disparou há X"
    //   - else -> "ainda não disparou"
    let resultBadge;
    if (s.cooldown_until && s.cooldown_until > now) {
      const remainingSecs = Math.max(0, s.cooldown_until - now);
      const remainingTxt = formatDuration(remainingSecs);
      resultBadge = '<span class="px-2 py-0.5 rounded-full bg-gold/10 text-goldsoft border border-gold/20 text-xs">cooldown · ' + (remainingTxt || "—") + '</span>';
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
      '<div class="text-sm leading-snug">' + label + '</div>' +
      '<div class="mt-2 flex flex-wrap gap-1.5 items-center">' + activeBadge + resultBadge + '</div>' +
      '<div class="text-[11px] text-muted mt-2">' + meta.join(' · ') + '</div>';
    const right = document.createElement("div");
    right.className = "flex gap-2 shrink-0 items-start";
    const toggle = document.createElement("button");
    toggle.className = "px-3 py-1.5 rounded-md border border-border text-sm hover:bg-bg transition min-w-[92px]";
    toggle.textContent = s.active ? "Pausar" : "Retomar";
    toggle.onclick = async () => {
      await fetchJSON("/api/subscriptions/" + s.id, { method: "PATCH", body: JSON.stringify({ active: !s.active }) });
      refresh();
    };
    const del = document.createElement("button");
    del.className = "px-3 py-1.5 rounded-md border border-border text-danger text-sm hover:bg-bg transition min-w-[92px]";
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

async function compareUserSelectedChars() {
  const checkboxes = document.querySelectorAll('input[data-user-compare="1"]:checked');
  if (checkboxes.length < 2) {
    toast("selecione pelo menos 2 personagens", "err");
    return;
  }
  const chartContainer = $("user-comparison-chart");
  chartContainer.classList.remove("hidden");
  chartContainer.innerHTML = '<div class="text-xs text-muted">carregando comparação...</div>';

  try {
    const promises = Array.from(checkboxes).map(async (cb) => {
      const charId = cb.getAttribute("data-char-id");
      const charName = cb.getAttribute("data-char-name");
      const data = await fetchJSON("/api/characters/" + charId + "/history?days=14");
      return { charId, charName, data };
    });
    const results = await Promise.all(promises);
    chartContainer.innerHTML = renderComparisonChartGeneric(results, {
      title: "Comparativo: resets por dia (últimos 14 dias)",
      closeBtnId: "user-compare-close",
    });
    const closeBtn = document.getElementById("user-compare-close");
    if (closeBtn) closeBtn.onclick = () => chartContainer.classList.add("hidden");
  } catch (e) {
    chartContainer.innerHTML = '<div class="text-xs text-danger">erro ao carregar: ' + escapeHtml(e.message) + '</div>';
  }
}

function setDashView(view) {
  const isAdmin = !!state.user?.is_admin;
  const dashBtn = $("nav-dashboard");
  const adminBtn = $("nav-admin");
  const marketBtn = $("nav-market");
  const main = $("dash-main");
  const admin = $("admin-card");
  const market = $("market-card");

  const activeCls = "bg-bg border-gold/40 text-goldsoft";
  const idleCls = "border-border text-slate-200 hover:bg-bg";

  const setBtn = (btn, active) => {
    if (!btn) return;
    btn.className = btn.className
      .replace(activeCls, "")
      .replace(idleCls, "")
      .replace(/\s+/g, " ")
      .trim();
    btn.className =
      btn.className +
      " " +
      (active ? activeCls : idleCls);
  };

  const isAdminView = view === "admin" && isAdmin;
  const isMarketView = view === "market";
  main.classList.toggle("hidden", isAdminView || isMarketView);
  admin.classList.toggle("hidden", !isAdminView);
  market.classList.toggle("hidden", !isMarketView);
  setBtn(dashBtn, !isAdminView && !isMarketView);
  setBtn(adminBtn, isAdminView);
  setBtn(marketBtn, isMarketView);

  // Persist so F5 restores the active tab. Reset to dashboard if the
  // user picked admin but isn't actually admin (defensive).
  const persisted = isAdminView ? "admin" : isMarketView ? "market" : "dashboard";
  try { localStorage.setItem("mlw.tab", persisted); } catch {}

  if (isMarketView) loadMarket();
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

function tokenHelpHtml(t) {
  const base = [
    ["{username}", "Nome do personagem"],
    ["{char}", "Alias de {username}"],
    ["{lv}", "Level atual"],
    ["{level}", "Alias de {lv}"],
    ["{resets}", "Resets atuais"],
    ["{threshold}", "O alvo/threshold do alerta (quando existir)"],
  ];
  const perType = [];
  if (t === "map_eq" || t === "coords_in") perType.push(["{map}", "Mapa atual"]);
  if (t === "status_eq" || t === "gm_online") perType.push(["{status}", "Status atual (Online/Offline)"]);
  if (t === "coords_in") perType.push(["{coords}", "Zona/coords do alerta (threshold completo)"]);
  if (t === "server_event") {
    perType.push(["{event}", "Nome do evento"]);
    perType.push(["{room}", "Sala (FREE/VIP/SPECIAL)"]);
    perType.push(["{lead}", "Minutos antes (lead time)"]);
    perType.push(["{leadMinutes}", "Alias de {lead}"]);
    perType.push(["{item}", "Item sugerido para entrada (quando conhecido)"]);
    perType.push(["{npc}", "NPC (quando conhecido)"]);
    perType.push(["{npc_map}", "Mapa do NPC (quando conhecido)"]);
    perType.push(["{npc_coords}", "Coords do NPC (quando conhecido)"]);
  }

  const row = (k, desc) =>
    '<li class="py-1 flex items-start justify-between gap-3 border-b border-border/40 last:border-0">' +
      '<code class="text-goldsoft text-[11px] bg-bg/60 border border-border/60 rounded px-1.5 py-0.5">' + k + "</code>" +
      '<span class="text-[11px] text-muted text-right">' + escapeHtml(desc) + "</span>" +
    "</li>";

  return (
    '<details class="rounded-md border border-border bg-bg/40 px-3 py-2">' +
      '<summary class="cursor-pointer text-[11px] text-muted hover:text-slate-200 select-none">Tokens disponíveis (clique para ver)</summary>' +
      '<div class="mt-2 grid sm:grid-cols-2 gap-3">' +
        '<div>' +
          '<div class="text-[11px] uppercase tracking-widest text-muted mb-1">Base</div>' +
          '<ul class="leading-snug">' + base.map(([k, d]) => row(k, d)).join("") + "</ul>" +
        "</div>" +
        '<div>' +
          '<div class="text-[11px] uppercase tracking-widest text-muted mb-1">Este alerta</div>' +
          (perType.length
            ? '<ul class="leading-snug">' + perType.map(([k, d]) => row(k, d)).join("") + "</ul>"
            : '<div class="text-[11px] text-muted">Sem tokens extras para este tipo.</div>') +
        "</div>" +
      "</div>" +
      '<div class="text-[11px] text-muted mt-2">Dica: tokens não reconhecidos ficam como texto normal.</div>' +
    "</details>"
  );
}

function syncTokenHelp() {
  const host = $("token-help");
  if (!host) return;
  host.innerHTML = tokenHelpHtml(subTypeEl.value);
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
    html =
      '<div class="grid sm:grid-cols-3 gap-2">' +
        '<div class="sm:col-span-2"><label class="text-[11px] text-muted block mb-1">Evento</label><select id="sf-event" class="' + ctrlClass + '"><option value="">carregando…</option></select></div>' +
        '<div><label class="text-[11px] text-muted block mb-1">Sala</label><select id="sf-room" class="' + ctrlClass + '"><option value="free">Free</option><option value="vip">VIP</option></select></div>' +
      '</div>' +
      '<div class="mt-2"><label class="text-[11px] text-muted block mb-1">Avisar quantos minutos antes</label><input id="sf-lead" type="number" min="0" max="120" placeholder="ex.: 5" class="' + ctrlClass + '" /></div>' +
      '<div class="text-[11px] text-muted mt-1">Os horários vêm de mupatos.net/eventos e mupatos.net/invasoes (atualizados de hora em hora).</div>';
  }
  subFieldsEl.innerHTML = html;
  syncTokenHelp();
  updateSubFormUi();

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

  // server_event: lazy-load the options the first time the user picks
  // this type. Cache the result so type-flips don't re-fetch.
  const evSelect = $("sf-event");
  if (evSelect) {
    fetchJSON("/api/events").then((data) => {
      const events = data.events || [];
      if (events.length === 0) {
        evSelect.innerHTML = '<option value="">(nenhum evento — ainda não foi sincronizado)</option>';
        return;
      }
      const byCat = { event: [], invasion: [] };
      for (const e of events) (byCat[e.category] || (byCat[e.category] = [])).push(e);
      let html = "";
      for (const [cat, list] of Object.entries(byCat)) {
        if (!list.length) continue;
        const seen = new Set();
        const names = list.map((e) => e.name).filter((n) => !seen.has(n) && seen.add(n));
        html += '<optgroup label="' + (cat === "event" ? "Eventos" : "Invasões") + '">';
        for (const n of names) html += '<option value="' + n.replace(/"/g, '&quot;') + '">' + n + '</option>';
        html += '</optgroup>';
      }
      evSelect.innerHTML = html;
    }).catch(() => {
      evSelect.innerHTML = '<option value="">(falha ao carregar eventos)</option>';
    });
  }
}
subTypeEl.addEventListener("change", renderSubFields);
renderSubFields();

// Live validation / preview for alert form.
let subFormWired = false;
function wireSubFormLivePreview() {
  if (subFormWired) return;
  subFormWired = true;
  ["sub-char", "sub-type", "sub-custom-message"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("input", updateSubFormUi);
    if (el) el.addEventListener("change", updateSubFormUi);
  });
  // Dynamic fields inside #sub-fields are replaced on type change, so use
  // event delegation on the container.
  if (subFieldsEl) {
    subFieldsEl.addEventListener("input", updateSubFormUi);
    subFieldsEl.addEventListener("change", updateSubFormUi);
  }
}
wireSubFormLivePreview();

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
  if (t === "server_event") {
    const ev = ($("sf-event").value || "").trim();
    const room = ($("sf-room").value || "").trim();
    const lead = ($("sf-lead").value || "").trim();
    if (!ev) throw new Error("selecione um evento");
    if (!room) throw new Error("selecione a sala");
    if (!lead) throw new Error("informe quantos minutos antes");
    // server_event ignores character_id.
    const baseNoChar = custom_message ? { custom_message } : {};
    return { ...baseNoChar, event_type: "server_event", threshold: ev + "|" + room + "|" + lead };
  }
  throw new Error("evento do servidor ainda não disponível");
}

function subLabelFromPayload(payload) {
  const t = payload.event_type;
  const nameById = Object.fromEntries(state.characters.map((c) => [c.id, c.name]));
  const charName = payload.character_id ? (nameById[payload.character_id] || ("#" + payload.character_id)) : "(servidor)";
  const thr = payload.threshold;
  if (t === "level_gte") return charName + " — nível ≥ " + thr;
  if (t === "map_eq") return charName + " — entrou no mapa " + thr;
  if (t === "coords_in") return charName + " — entrou na zona " + thr;
  if (t === "status_eq") return charName + " — ficou " + thr;
  if (t === "gm_online") return "GM " + charName + " — online";
  if (t === "level_stale") return charName + " — sem subir level por " + thr + " min";
  if (t === "server_event") {
    const parts = String(thr || "").split("|");
    return "📣 " + (parts[0] || "?") + " (" + (parts[1] || "?").toUpperCase() + ") — " + (parts[2] || "?") + " min antes";
  }
  return "—";
}

function updateSubFormUi() {
  const btn = $("add-sub");
  const err = $("sub-form-error");
  const prev = $("sub-preview");
  const hint = $("sub-preview-hint");
  if (!btn || !err || !prev || !hint) return;

  err.textContent = "";
  hint.textContent = "";
  function tierForLevelClient(level) {
    if (level == null || !Number.isFinite(level)) return null;
    const ranges = [
      { tier: 1, min: 15, max: 49 },
      { tier: 2, min: 50, max: 119 },
      { tier: 3, min: 120, max: 179 },
      { tier: 4, min: 180, max: 239 },
      { tier: 5, min: 240, max: 299 },
      { tier: 6, min: 300, max: 349 },
      { tier: 7, min: 350, max: 9999 },
    ];
    for (const r of ranges) if (level >= r.min && level <= r.max) return r;
    return null;
  }
  function serverEventEntryReqClient(eventNameRaw) {
    const n = String(eventNameRaw || "").toLowerCase();
    if (!n) return null;
    if (n.includes("chaos castle")) {
      return {
        itemLabel: "Armor of Guardsman",
        itemTiered: true,
        npc: { name: "Chaos Goblin", map: "Noria", coords: "168,96" },
      };
    }
    if (n.includes("blood castle")) {
      return {
        itemLabel: "Invisibility Cloak",
        itemTiered: true,
        npc: { name: "Archangel Messenger", map: "Devias", coords: "198,47" },
      };
    }
    if (n.includes("devil square")) {
      return {
        itemLabel: "Devil's Invitation",
        itemTiered: true,
        npc: { name: "Charon", map: "Noria", coords: "167,90" },
      };
    }
    return null;
  }
  function applyTemplateClient(tpl, dict) {
    let out = escapeHtml(tpl || "");
    for (const [k, v] of Object.entries(dict || {})) {
      const re = new RegExp("\\\\{" + k + "\\\\}", "gi");
      out = out.replace(re, v);
    }
    return out;
  }
  try {
    const payload = readSubFormPayload();
    const label = escapeHtml(subLabelFromPayload(payload));

    const custom = (payload.custom_message || "").trim();
    if (!custom) {
      const char = payload.character_id
        ? state.characters.find((c) => c.id === payload.character_id)
        : null;
      const charName = char ? (char.name || "") : "";
      const charMap = char ? (char.last_map || "") : "";
      const charLevel = char && typeof char.last_level === "number" ? char.last_level : null;
      const charResets = char && typeof char.resets === "number" ? char.resets : null;
      const charStatus = char ? (char.last_status || "") : "";

      function parseMapStr(s) {
        const raw = String(s || "").trim();
        if (!raw) return { mapName: "", coords: "" };
        // NOTE: this script is embedded inside a template string, so we must
        // escape backslashes to keep the regex intact in the browser.
        const m = raw.match(/^(.+?)\\s*\\((\\d+)\\s*\\/\\s*(\\d+)\\)\\s*$/);
        if (m) return { mapName: (m[1] || "").trim(), coords: String(m[2]) + "/" + String(m[3]) };
        return { mapName: raw, coords: "" };
      }

      const { mapName, coords } = parseMapStr(charMap);
      const where = mapName
        ? (coords ? "<b>" + escapeHtml(mapName) + "</b> (" + escapeHtml(coords) + ")" : "<b>" + escapeHtml(mapName) + "</b>")
        : '<span class="text-muted">?</span>';
      const lv = charLevel != null ? String(charLevel) : "?";
      const rr = charResets != null ? String(charResets) : "?";
      const status = escapeHtml(charStatus);

      let defaultMsg = "";
      if (payload.event_type === "level_gte") {
        defaultMsg = "🎯 <b>" + escapeHtml(charName) + "</b> chegou no nivel <b>" + escapeHtml(lv) + "</b> (alvo " + escapeHtml(payload.threshold || "") + ").\\n" +
          "📍 Local: " + where + ".\\n♻️ Resets: <b>" + escapeHtml(rr) + "</b>.";
      } else if (payload.event_type === "map_eq") {
        defaultMsg = "📍 <b>" + escapeHtml(charName) + "</b> entrou em " + where + ".\\n" +
          "🎚️ Level: <b>" + escapeHtml(lv) + "</b> • ♻️ Resets: <b>" + escapeHtml(rr) + "</b>.";
      } else if (payload.event_type === "coords_in") {
        defaultMsg = "📍 <b>" + escapeHtml(charName) + "</b> está em " + where + ".\\n" +
          "🧭 Zona do alerta: <b>" + escapeHtml(payload.threshold || "") + "</b>.\\n" +
          "🎚️ Level: <b>" + escapeHtml(lv) + "</b> • ♻️ Resets: <b>" + escapeHtml(rr) + "</b>.";
      } else if (payload.event_type === "status_eq") {
        defaultMsg = "🟢 <b>" + escapeHtml(charName) + "</b> agora está <b>" + escapeHtml(status || "?") + "</b>.\\n" +
          "📍 Local: " + where + ".\\n🎚️ Level: <b>" + escapeHtml(lv) + "</b> • ♻️ Resets: <b>" + escapeHtml(rr) + "</b>.";
      } else if (payload.event_type === "gm_online") {
        defaultMsg = "🛡️ GM <b>" + escapeHtml(charName) + "</b> acabou de ficar online.\\n" +
          "📍 Local: " + where + ".\\n🎚️ Level: <b>" + escapeHtml(lv) + "</b> • ♻️ Resets: <b>" + escapeHtml(rr) + "</b>.";
      } else if (payload.event_type === "level_stale") {
        defaultMsg = "⏸️ <b>" + escapeHtml(charName) + "</b> sem subir level há <b>" + escapeHtml(payload.threshold || "") + " min</b>.\\n" +
          "🟢 Status: <b>" + escapeHtml(status || "?") + "</b> • 📍 Local: " + where + ".\\n" +
          "🎚️ Level: <b>" + escapeHtml(lv) + "</b> • ♻️ Resets: <b>" + escapeHtml(rr) + "</b>.";
      } else if (payload.event_type === "server_event") {
        const parts = String(payload.threshold || "").split("|");
        const evName = (parts[0] || "").trim();
        const room = (parts[1] || "").trim().toUpperCase();
        const lead = String(Number(parts[2]) || 0);

        const req = serverEventEntryReqClient(evName);
        let itemLine = "";
        let npcLine = "";
        if (req) {
          const userMaxLevel = Math.max(
            ...state.characters
              .map((c) => (typeof c.last_level === "number" ? c.last_level : null))
              .filter((n) => n != null),
          );
          const tier = Number.isFinite(userMaxLevel) ? tierForLevelClient(userMaxLevel) : null;
          if (req.itemTiered) {
            if (tier) {
              itemLine = "Entrada: <b>" + escapeHtml(req.itemLabel) + " +" + tier.tier + "</b> (lvl " + tier.min + "–" + tier.max + ").";
            } else {
              itemLine = "Entrada: <b>" + escapeHtml(req.itemLabel) + " +N</b> (depende do level; +1…+7).";
            }
          } else {
            itemLine = "Entrada: <b>" + escapeHtml(req.itemLabel) + "</b>.";
          }
          if (req.npc) {
            const loc = String(req.npc.map || "") + (req.npc.coords ? " (" + req.npc.coords + ")" : "");
            npcLine = "NPC: <b>" + escapeHtml(req.npc.name) + "</b> — " + escapeHtml(loc) + ".";
          }
        }
        defaultMsg = "📣 <b>" + escapeHtml(evName || "?") + "</b> (" + escapeHtml(room || "?") + ") começa em <b>" + escapeHtml(lead) + " min</b>." +
          (itemLine ? "\\n" + itemLine : "") +
          (npcLine ? "\\n" + npcLine : "");
      } else {
        defaultMsg = label;
      }

      prev.innerHTML =
        '<div class="space-y-2">' +
          '<div><div class="text-[11px] uppercase tracking-widest text-muted mb-1">Regra do alerta</div><div class="text-sm text-slate-200">' + label + "</div></div>" +
          '<div><div class="text-[11px] uppercase tracking-widest text-muted mb-1">Mensagem padrao (preview)</div><div class="text-sm text-slate-200 whitespace-pre-line">' + defaultMsg + "</div></div>" +
        "</div>";
      hint.textContent = "Preview da mensagem padrao (sem custom message).";
    } else {
      // Build a best-effort token dict for preview using current form values + last known character snapshot.
      const char = payload.character_id
        ? state.characters.find((c) => c.id === payload.character_id)
        : null;
      const charName = char ? (char.name || "") : "";
      const charMap = char ? (char.last_map || "") : "";
      const charLevel = char && typeof char.last_level === "number" ? char.last_level : null;
      const charResets = char && typeof char.resets === "number" ? char.resets : null;
      const charStatus = char ? (char.last_status || "") : "";
      const isServerEvent = payload.event_type === "server_event";
      const thrParts = String(payload.threshold || "").split("|");
      const evNameRaw = isServerEvent ? (thrParts[0] || "") : "";
      const roomRaw = isServerEvent ? (thrParts[1] || "") : "";
      const leadRaw = isServerEvent ? (thrParts[2] || "") : "";

      let item = "";
      let npc = "";
      let npc_map = "";
      let npc_coords = "";
      if (isServerEvent) {
        const leadNum = Number(leadRaw) || 0;
        const req = serverEventEntryReqClient(evNameRaw);
        if (req) {
          // Mirror backend: use user's MAX level to suggest ticket tier.
          const userMaxLevel = Math.max(
            ...state.characters
              .map((c) => (typeof c.last_level === "number" ? c.last_level : null))
              .filter((n) => n != null),
          );
          const tier = Number.isFinite(userMaxLevel) ? tierForLevelClient(userMaxLevel) : null;

          let itemLine = "";
          if (req.itemTiered) {
            if (tier) {
              itemLine = "🎟️ Entrada: <b>" + escapeHtml(req.itemLabel) + " +" + tier.tier + "</b> (lvl " + tier.min + "–" + tier.max + ").";
            } else {
              itemLine = "🎟️ Entrada: <b>" + escapeHtml(req.itemLabel) + " +N</b> (depende do level; +1…+7).";
            }
          } else {
            itemLine = "🎟️ Entrada: <b>" + escapeHtml(req.itemLabel) + "</b>.";
          }
          item = itemLine ? itemLine.replace(/^🎟️ Entrada:\s*/i, "").replace(/\.$/, "") : "";
          if (req.npc) {
            npc = req.npc.name || "";
            npc_map = req.npc.map || "";
            npc_coords = req.npc.coords || "";
          }
        }
        // Normalize lead like backend does (Number(...) || 0).
        // Keep room lowercased in threshold like backend does.
        leadRaw = String(leadNum);
      }
      const normalizedServerThreshold = isServerEvent
        ? (evNameRaw + "|" + String(roomRaw || "").toLowerCase() + "|" + leadRaw)
        : String(payload.threshold || "");
      const dict = {
        username: escapeHtml(charName),
        char: escapeHtml(charName),
        lv: charLevel != null ? String(charLevel) : "?",
        level: charLevel != null ? String(charLevel) : "?",
        resets: charResets != null ? String(charResets) : "?",
        map: escapeHtml(charMap),
        status: escapeHtml(charStatus),
        threshold: escapeHtml(normalizedServerThreshold),
        coords: escapeHtml(payload.threshold || ""),
        // server_event extras (best-effort from threshold)
        event: escapeHtml(evNameRaw),
        room: escapeHtml(roomRaw ? roomRaw.toUpperCase() : ""),
        lead: escapeHtml(leadRaw),
        leadMinutes: escapeHtml(leadRaw),
        // item may contain <b>..</b> (same as backend token behavior).
        item,
        npc: escapeHtml(npc),
        npc_map: escapeHtml(npc_map),
        npc_coords: escapeHtml(npc_coords),
      };
      const rendered = applyTemplateClient(custom, dict);
      prev.innerHTML =
        '<div class="space-y-2">' +
          '<div><div class="text-[11px] uppercase tracking-widest text-muted mb-1">Regra do alerta</div><div class="text-sm text-slate-200">' + label + "</div></div>" +
          '<div><div class="text-[11px] uppercase tracking-widest text-muted mb-1">Mensagem custom (preview)</div><div class="text-sm text-slate-200">' + rendered + "</div></div>" +
        "</div>";
      hint.textContent = "Preview usa os últimos dados conhecidos do painel (pode variar no momento do disparo).";
    }
    btn.disabled = false;
  } catch (e) {
    prev.textContent = "—";
    err.textContent = (e && e.message) ? e.message : "preencha os campos";
    btn.disabled = true;
  }
}

$("add-sub").onclick = async (e) => {
  const btn = e.currentTarget;
  try {
    const payload = readSubFormPayload();
    await withSpinner(btn, () =>
      fetchJSON("/api/subscriptions", { method: "POST", body: JSON.stringify(payload) }),
    );
    renderSubFields();   // resets the dynamic inputs to their empty state
    updateSubFormUi();
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
  tbody.innerHTML = '<tr><td colspan="9" class="py-2 text-muted">carregando…</td></tr>';
  try {
    const data = await fetchJSON("/api/admin/chars");
    const chars = data.characters || [];
    if (chars.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="py-2 text-muted">nenhum char</td></tr>';
      return;
    }
    tbody.innerHTML = chars.map(adminCharRowHtml).join("");
    for (const c of chars) wireAdminCharActions(c);
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="9" class="py-2 text-danger">' + escapeHtml(e.message) + '</td></tr>';
  }
}
function adminCharRowHtml(c) {
  const ownerId = (c.owner_user_id != null) ? c.owner_user_id : (c.user_id != null ? c.user_id : null);
  const owner = c.owner_first_name || (c.owner_username ? "@" + c.owner_username : (ownerId != null ? ("user " + ownerId) : "—"));
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
  const classHtml = c.class ? (classBadgeHtml(c.class) + escapeHtml(c.class)) : '<span class="text-muted">—</span>';
  return '<tr class="border-b border-border/60" data-row="' + c.id + '">' +
    '<td class="py-1.5 pr-2"><input type="checkbox" class="admin-char-check accent-gold cursor-pointer" data-char-id="' + c.id + '" data-char-name="' + escapeHtml(c.name) + '" /></td>' +
    '<td class="py-1.5 pr-2 text-muted">' + c.id + '</td>' +
    '<td class="py-1.5 pr-2 font-semibold">' +
      '<a href="https://mupatos.com.br/site/profile/character/' + encodeURIComponent(c.name) + '" target="_blank" rel="noopener" class="text-goldsoft hover:underline">' + escapeHtml(c.name) + '</a>' +
      blockedBadge + (c.is_gm ? ' <span class="text-[10px] text-gold uppercase">GM</span>' : '') +
    '</td>' +
    '<td class="py-1.5 pr-2">' + escapeHtml(owner) + (ownerId != null ? (' <span class="text-muted">#' + ownerId + '</span>') : '') + '</td>' +
    '<td class="py-1.5 pr-2">' + classHtml + '</td>' +
    '<td class="py-1.5 pr-2">' + (c.last_level != null ? c.last_level : '<span class="text-muted">—</span>') + ' <span class="text-muted text-[10px]">lvl</span> / ' + (typeof c.resets === "number" ? c.resets : "—") + ' <span class="text-muted text-[10px]">rr</span>' + (c.avg_reset_time ? '<br><span class="text-muted text-[10px]">~' + formatDuration(c.avg_reset_time) + '/rr</span>' : '') + '</td>' +
    '<td class="py-1.5 pr-2">' + status + '</td>' +
    '<td class="py-1.5 pr-2">' + subBtn + '</td>' +
    '<td class="py-1.5 pr-2 whitespace-nowrap">' +
      '<button class="px-2 py-1 rounded border border-border hover:bg-bg" data-action="block">' + (c.blocked ? "Desbloquear" : "Bloquear") + '</button>' +
      ' <button class="px-2 py-1 rounded border border-border hover:bg-bg ml-1" data-action="refresh">↻</button>' +
      historyBtn +
    '</td>' +
    '</tr>' +
    '<tr class="hidden bg-bg/50" data-subs-for="' + c.id + '">' +
      '<td colspan="9" class="px-3 py-2 text-[11px]" data-subs-body></td>' +
    '</tr>' +
    '<tr class="hidden bg-bg/50" data-history-for="' + c.id + '">' +
      '<td colspan="9" class="px-3 py-2" data-history-body></td>' +
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

async function toggleUserCharHistory(charId, charName) {
  const expansion = document.querySelector('li[data-user-hist-for="' + charId + '"]');
  if (!expansion) return;
  if (!expansion.classList.contains("hidden")) {
    expansion.classList.add("hidden");
    return;
  }
  expansion.classList.remove("hidden");
  const cell = expansion.querySelector('[data-history-body]');
  cell.innerHTML = '<span class="text-muted text-xs">carregando histórico…</span>';
  try {
    const data = await fetchJSON("/api/characters/" + charId + "/history?days=14");
    const chart = renderHistoryChart(data, charName);
    const tabs = '<div class="flex gap-4 mb-3 border-b border-border text-sm">' +
      '<button class="pb-1 border-b-2 border-goldsoft text-goldsoft hist-tab-btn" data-target="uhist-evolucao-' + charId + '">Evolução</button>' +
      '<button class="pb-1 border-b-2 border-transparent text-muted hover:text-slate-300 hist-tab-btn" data-target="uhist-resets-' + charId + '">Resets/Dia</button>' +
      '</div>' +
      '<div id="uhist-evolucao-' + charId + '" class="hist-tab-content">' + chart.html + '</div>' +
      '<div id="uhist-resets-' + charId + '" class="hist-tab-content hidden">' + renderResetsPerDayChart(data, charName) + '</div>';
    cell.innerHTML = tabs;
    cell.__drawBars = chart.drawBars;
    cell.__lastLevel = chart.lastLevel;
    wireHistoryTooltips(cell);
    chart.wireZoom(cell);

    const btns = cell.querySelectorAll('.hist-tab-btn');
    btns.forEach(btn => {
      btn.onclick = () => {
        btns.forEach(b => b.className = "pb-1 border-b-2 border-transparent text-muted hover:text-slate-300 hist-tab-btn");
        cell.querySelectorAll('.hist-tab-content').forEach(c => c.classList.add("hidden"));
        btn.className = "pb-1 border-b-2 border-goldsoft text-goldsoft hist-tab-btn";
        document.getElementById(btn.getAttribute("data-target")).classList.remove("hidden");
      };
    });
  } catch (e) {
    cell.innerHTML = '<span class="text-danger text-xs">' + escapeHtml(e.message) + '</span>';
  }
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
    const data = await fetchJSON("/api/admin/chars/" + charId + "/history?days=14");
    const chart = renderHistoryChart(data, charName);
    const tabs = '<div class="flex items-center justify-between gap-3 mb-3 border-b border-border">' +
      '<div class="flex gap-4 text-sm">' +
        '<button class="pb-1 border-b-2 border-goldsoft text-goldsoft hist-tab-btn" data-target="hist-evolucao-' + charId + '">Evolução</button>' +
        '<button class="pb-1 border-b-2 border-transparent text-muted hover:text-slate-300 hist-tab-btn" data-target="hist-resets-' + charId + '">Resets/Dia</button>' +
      '</div>' +
      '<button class="text-[11px] text-muted hover:text-danger underline" data-action="clear-hist">limpar histórico</button>' +
      '</div>' +
      '<div id="hist-evolucao-' + charId + '" class="hist-tab-content">' + chart.html + '</div>' +
      '<div id="hist-resets-' + charId + '" class="hist-tab-content hidden">' + renderResetsPerDayChart(data, charName) + '</div>';
    cell.innerHTML = tabs;
    cell.__drawBars = chart.drawBars;
    cell.__lastLevel = chart.lastLevel;
    wireHistoryTooltips(cell);
    chart.wireZoom(cell);

    const btns = cell.querySelectorAll('.hist-tab-btn');
    btns.forEach(btn => {
      btn.onclick = () => {
        btns.forEach(b => b.className = "pb-1 border-b-2 border-transparent text-muted hover:text-slate-300 hist-tab-btn");
        cell.querySelectorAll('.hist-tab-content').forEach(c => c.classList.add("hidden"));
        btn.className = "pb-1 border-b-2 border-goldsoft text-goldsoft hist-tab-btn";
        document.getElementById(btn.getAttribute("data-target")).classList.remove("hidden");
      };
    });

    const clearBtn = cell.querySelector('[data-action="clear-hist"]');
    if (clearBtn) clearBtn.onclick = async () => {
      if (!await confirmModal("Apagar todos os snapshots de " + charName + "? Heartbeats vão repopular em ~5min.", { okLabel: "Apagar", danger: true })) return;
      try {
        const r = await fetchJSON("/api/admin/chars/" + charId + "/snapshots", { method: "DELETE" });
        toast("apagados " + r.deleted + " snapshots", "ok");
        // Re-open the panel to refresh chart.
        expansion.classList.add("hidden");
        toggleAdminHistory(charId, charName);
      } catch (e) { toast(e.message, "err"); }
    };
  } catch (e) {
    cell.innerHTML = '<span class="text-danger text-xs">' + escapeHtml(e.message) + '</span>';
  }
}

function renderResetsPerDayChart(data, charName) {
  const samples = [];
  for (const cyc of data.cycles ?? []) for (const s of cyc.samples) samples.push(s);
  if (samples.length === 0) {
    return '<div class="text-xs text-muted">sem snapshots ainda.</div>';
  }

  const maxResetsByDay = {};
  const dayList = [];
  for (const s of samples) {
    if (s.resets == null) continue;
    const d = new Date(s.ts * 1000);
    const dateStr = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
    if (maxResetsByDay[dateStr] === undefined) {
      maxResetsByDay[dateStr] = s.resets;
      dayList.push(dateStr);
    } else {
      maxResetsByDay[dateStr] = Math.max(maxResetsByDay[dateStr], s.resets);
    }
  }

  if (dayList.length === 0) return '<div class="text-xs text-muted">nenhum dado de resets.</div>';

  const chartData = [];
  let prevMax = null;
  if (dayList.length > 0) {
    let firstDayMin = Infinity;
    for (const s of samples) {
      if (s.resets == null) continue;
      const d = new Date(s.ts * 1000);
      const dateStr = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
      if (dateStr === dayList[0]) firstDayMin = Math.min(firstDayMin, s.resets);
    }
    prevMax = firstDayMin;
  }

  for (const day of dayList) {
    const curMax = maxResetsByDay[day];
    const gained = curMax - prevMax;
    chartData.push({ day, gained });
    prevMax = curMax;
  }

  const W = 720, H = 240, padL = 36, padR = 36, padT = 22, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const maxGain = Math.max(...chartData.map(d => d.gained), 1);
  
  const tickCount = Math.min(maxGain + 1, 6);
  const yTickLines = Array.from({length: tickCount}).map((_, i) => {
    const v = Math.round((maxGain * i) / Math.max(tickCount - 1, 1));
    const y = padT + innerH - (v / maxGain) * innerH;
    return '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y + '" y2="' + y + '" stroke="#252a36" stroke-dasharray="2,3" />' +
           '<text x="' + (padL - 4) + '" y="' + (y + 3) + '" fill="#8a93a3" font-size="10" text-anchor="end">' + v + '</text>';
  }).join("");

  const barW = Math.min(innerW / chartData.length * 0.6, 40);
  const step = innerW / Math.max(chartData.length, 1);
  
  const barsHtml = chartData.map((d, i) => {
    const x = padL + (i + 0.5) * step;
    const h = (d.gained / maxGain) * innerH;
    const y = padT + innerH - h;
    const xLabel = '<text x="' + x + '" y="' + (H - padB + 14) + '" fill="#8a93a3" font-size="10" text-anchor="middle">' + d.day + '</text>';
    const bar = '<rect class="hist-dot cursor-pointer transition-opacity hover:opacity-80" x="' + (x - barW/2) + '" y="' + y + '" width="' + barW + '" height="' + Math.max(h, 2) + '" fill="#f0a93b" fill-opacity="0.8" data-tip="' + d.gained + ' resets em ' + d.day + '" />';
    const valText = d.gained > 0 ? '<text x="' + x + '" y="' + (y - 4) + '" fill="#f7c779" font-size="10" text-anchor="middle">' + d.gained + '</text>' : '';
    return xLabel + bar + valText;
  }).join("");

  const stats =
    '<div class="text-[11px] text-muted mb-2">' +
      '<b class="text-goldsoft">' + escapeHtml(charName) + '</b> · resets por dia (últimos ' + data.days + ' dias)' +
    '</div>';

  return stats +
    '<svg viewBox="0 0 ' + W + ' ' + H + '" class="w-full h-auto bg-bg border border-border rounded-md">' +
      yTickLines +
      barsHtml +
    '</svg>';

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
    // Only the visible (pointer-events-none) bars get restyled — the wide
    // transparent hit-zones stay 14px so they're still easy to grab.
    cell.querySelectorAll(".cycle-bar.pointer-events-none").forEach((b) => {
      b.setAttribute("stroke-opacity", on ? "1" : (b.getAttribute("stroke") === "#f0a93b" ? "0.85" : "0.5"));
      b.setAttribute("stroke-width", on ? "1.8" : (b.getAttribute("stroke") === "#f0a93b" ? "1.6" : "1.2"));
    });
  };
  // Track which level the bars are currently drawn for, so we don't
  // thrash the SVG on every mousemove pixel.
  let barsLevel = cell.__lastLevel ?? null;
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
    setBarsHighlight(t.classList.contains("cycle-bar"));

    // Hover-redraw: when the cursor's on a dot tied to a level value,
    // redraw the cycle bars at THAT level so the user can compare how
    // long every cycle took to reach the level they're pointing at.
    if (t.classList.contains("hist-dot") && t.dataset.level && cell.__drawBars) {
      const lv = Number(t.dataset.level);
      if (lv !== barsLevel) {
        cell.__drawBars(cell, lv);
        barsLevel = lv;
      }
    }
  });
  cell.addEventListener("mouseleave", () => {
    tip.classList.add("hidden");
    setBarsHighlight(false);
    // Snap bars back to the latest level.
    if (cell.__drawBars && cell.__lastLevel != null && barsLevel !== cell.__lastLevel) {
      cell.__drawBars(cell, cell.__lastLevel);
      barsLevel = cell.__lastLevel;
    }
  });
}

// Step-plot of resets over time. Resets only go up, so this shows progress
// at a glance — slope = leveling speed.
function renderHistoryChart(data, charName, opts = {}) {
  // Flatten cycles to a single sample list.
  const allSamples = [];
  for (const cyc of data.cycles ?? []) for (const s of cyc.samples) allSamples.push(s);
  if (allSamples.length === 0) {
    return {
      html: '<div data-chart-host><div class="text-xs text-muted">sem snapshots ainda — espera alguns minutos pro cron registrar mudanças.</div></div>',
      drawBars: () => {},
      wireZoom: () => {},
      lastLevel: null,
    };
  }

  // Window the samples by trailing reset cycles. Keeps the chart legible
  // when a long-running player has 8+ resets in a 14-day window.
  const allDistinctResets = [...new Set(allSamples.map((s) => s.resets).filter((r) => r != null))].sort((a, b) => a - b);
  const totalCycles = allDistinctResets.length;
  const requestedWindow = opts.window != null ? String(opts.window) : (totalCycles > 4 ? "4" : "all");

  let samples;
  if (requestedWindow === "all" || totalCycles === 0) {
    samples = allSamples;
  } else {
    const n = Math.min(Number(requestedWindow) || totalCycles, totalCycles);
    const minReset = allDistinctResets[totalCycles - n];
    const cutoffIdx = allSamples.findIndex((s) => s.resets != null && s.resets >= minReset);
    samples = cutoffIdx >= 0 ? allSamples.slice(cutoffIdx) : allSamples;
  }
  if (samples.length === 0) samples = allSamples;

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
    const lvAttr = s.level != null ? ' data-level="' + s.level + '"' : "";
    return '<circle cx="' + x + '" cy="' + yR + '" r="5" fill="#f0a93b" stroke="#0b0d12" stroke-width="1.2" class="hist-dot cursor-pointer" data-tip="' + safeTip + '"' + lvAttr + '></circle>' +
           '<circle cx="' + x + '" cy="' + yL + '" r="4" fill="#7aa2f7" stroke="#0b0d12" stroke-width="1.2" class="hist-dot cursor-pointer" data-tip="' + safeTip + '"' + lvAttr + '></circle>';
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
  function bar(stats, resetCount, isCurrent, targetLevel) {
    if (!stats) return "";
    const x = xOf(stats.hitTs);
    const tip =
      "R" + resetCount + (isCurrent ? " (atual)" : "") +
      " · lv " + targetLevel + " em " +
      escapeHtml(fmtDur(stats.duration)) +
      " (desde lv " + stats.fromLevel + ")";
    const color = isCurrent ? "#f0a93b" : "#8a93a3";
    const opacity = isCurrent ? "0.85" : "0.5";
    const w = isCurrent ? "1.6" : "1.2";
    // Wide invisible hit-zone behind the visible dashed line — makes the
    // bar trivial to hover even on dense charts. Both share the .cycle-bar
    // class so the existing hover handler treats them identically.
    const hit = '<line x1="' + x + '" x2="' + x + '" y1="' + padT + '" y2="' + (H - padB) + '" stroke="transparent" stroke-width="14" class="cycle-bar cursor-pointer" data-tip="' + tip + '"></line>';
    const visible = '<line x1="' + x + '" x2="' + x + '" y1="' + padT + '" y2="' + (H - padB) + '" stroke="' + color + '" stroke-width="' + w + '" stroke-dasharray="4,3" stroke-opacity="' + opacity + '" class="cycle-bar pointer-events-none"></line>';
    return hit + visible;
  }
  // Bar + label markup is now computed lazily so we can re-render on hover
  // for whatever level the user is pointing at.
  function buildBarsAndLabels(targetLevel) {
    if (last == null || last.resets == null || targetLevel == null) {
      return { bars: "", labels: "" };
    }
    const distinctResets = [...new Set(samples.map((s) => s.resets).filter((r) => r != null))].sort((a, b) => a - b);
    let bars = "", labels = "";
    for (const r of distinctResets) {
      const stats = cycleStats(r, targetLevel);
      if (!stats) continue;
      const isCurrent = r === last.resets;
      bars += bar(stats, r, isCurrent, targetLevel);
      const x = xOf(stats.hitTs);
      const fill = isCurrent ? "#f7c779" : "#8a93a3";
      labels += '<text x="' + (x + 3) + '" y="' + (padT + 10) + '" fill="' + fill + '" font-size="9">' + fmtDur(stats.duration) + '</text>';
    }
    return { bars, labels };
  }
  // Initial render uses last.level so the chart looks the same on load.
  const initial = buildBarsAndLabels(last?.level);
  const markers = initial.bars;
  const inlineLabels = initial.labels;

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

  // Zoom toolbar — only render when there's actually something to zoom into.
  let toolbar = "";
  if (totalCycles > 1) {
    const presets = [
      { v: "3", l: "3 ciclos" },
      { v: "4", l: "4 ciclos" },
      { v: "7", l: "7 ciclos" },
      { v: "all", l: "tudo" },
    ].filter((p) => p.v === "all" || Number(p.v) < totalCycles);
    if (presets.length >= 2) {
      toolbar = '<div class="flex items-center gap-1 mb-2 text-[11px] flex-wrap">' +
        '<span class="text-muted mr-1">zoom:</span>' +
        presets.map((p) => {
          const active = String(requestedWindow) === p.v;
          const cls = active
            ? "px-2 py-0.5 rounded border border-goldsoft text-goldsoft"
            : "px-2 py-0.5 rounded border border-border text-muted hover:text-slate-300";
          return '<button class="' + cls + '" data-zoom="' + p.v + '">' + p.l + '</button>';
        }).join("") +
        '</div>';
    }
  }

  const visibleCycles = [...new Set(samples.map((s) => s.resets).filter((r) => r != null))].length;
  const showingTxt = (requestedWindow === "all" || visibleCycles >= totalCycles)
    ? 'últimos ' + data.days + ' dias · ' + data.count + ' snapshots · resets ' + rMin + ' → <b class="text-goldsoft">' + rMax + '</b>'
    : 'mostrando ' + visibleCycles + ' de ' + totalCycles + ' ciclos · ' + samples.length + ' snapshots · resets ' + rMin + ' → <b class="text-goldsoft">' + rMax + '</b>';
  const stats =
    '<div class="text-[11px] text-muted mb-2">' +
      '<b class="text-goldsoft">' + escapeHtml(charName) + '</b> · ' + showingTxt +
    '</div>';

  const html = '<div data-chart-host>' + stats + toolbar +
    '<svg viewBox="0 0 ' + W + ' ' + H + '" class="w-full h-auto bg-bg border border-border rounded-md">' +
      yTickLines.join("") +
      '<g class="bars-layer">' + markers + '</g>' +
      '<path d="' + lDp + '" fill="none" stroke="#7aa2f7" stroke-width="1.5" stroke-opacity="0.85" />' +
      '<path d="' + d + '" fill="none" stroke="#f0a93b" stroke-width="2" />' +
      dots +
      '<g class="labels-layer">' + inlineLabels + '</g>' +
      xLabels +
      legend +
    '</svg>' +
    '</div>';
  // Closure that the hover handler can call to repaint bars + labels at
  // whatever level the user points at. The container element it targets
  // must be the one where we set innerHTML = html.
  const drawBars = (cell, targetLevel) => {
    const { bars, labels } = buildBarsAndLabels(targetLevel);
    const barsEl = cell.querySelector(".bars-layer");
    const labelsEl = cell.querySelector(".labels-layer");
    if (barsEl) barsEl.innerHTML = bars;
    if (labelsEl) labelsEl.innerHTML = labels;
  };
  // Wires the zoom buttons inside the chart-host. On click, re-renders the
  // host in place — the cell-level mousemove tooltip handler keeps working
  // because it reads cell.__drawBars / cell.__lastLevel dynamically.
  const wireZoom = (cell) => {
    const host = cell.querySelector('[data-chart-host]');
    if (!host) return;
    host.querySelectorAll('[data-zoom]').forEach((btn) => {
      btn.onclick = () => {
        const w = btn.getAttribute('data-zoom');
        const next = renderHistoryChart(data, charName, { window: w });
        host.outerHTML = next.html;
        cell.__drawBars = next.drawBars;
        cell.__lastLevel = next.lastLevel;
        next.wireZoom(cell);
      };
    });
  };
  return { html, drawBars, wireZoom, lastLevel: last?.level ?? null };
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
    else if (s.event_type === "server_event") {
      const parts = (s.threshold || "").split("|");
      label = "evento " + escapeHtml(parts[0] || "?") + " (" + escapeHtml((parts[1] || "?").toUpperCase()) + ") · " + escapeHtml(parts[2] || "?") + "min antes";
    }
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
async function compareSelectedChars() {
  const checkboxes = document.querySelectorAll('.admin-char-check:checked');
  if (checkboxes.length === 0) {
    toast("selecione pelo menos um personagem", "err");
    return;
  }
  const chartContainer = $("admin-comparison-chart");
  chartContainer.classList.remove("hidden");
  chartContainer.innerHTML = '<div class="text-xs text-muted">carregando dados para comparação...</div>';
  
  const datasets = [];
  try {
    const promises = Array.from(checkboxes).map(async (cb) => {
      const charId = cb.getAttribute("data-char-id");
      const charName = cb.getAttribute("data-char-name");
      const data = await fetchJSON("/api/admin/chars/" + charId + "/history?days=14");
      return { charId, charName, data };
    });
    const results = await Promise.all(promises);
    chartContainer.innerHTML = renderComparisonChart(results);
    const closeBtn = document.getElementById('admin-compare-close');
    if (closeBtn) closeBtn.onclick = () => chartContainer.classList.add('hidden');
  } catch (e) {
    chartContainer.innerHTML = '<div class="text-xs text-danger">erro ao carregar: ' + escapeHtml(e.message) + '</div>';
  }
}

function renderComparisonChart(datasets) {
  return renderComparisonChartGeneric(datasets, {
    title: "Comparativo: resets por dia (últimos 14 dias)",
    closeBtnId: "admin-compare-close",
  });
}

function renderComparisonChartGeneric(datasets, opts) {
  // Bar chart: resets/day over the window (first → last snapshot).
  const W = 720, H = 260, padL = 36, padR = 22, padT = 22, padB = 52;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  const rows = [];
  for (const set of datasets) {
    const samples = [];
    for (const cyc of set.data.cycles ?? []) for (const s of cyc.samples) samples.push(s);
    if (samples.length === 0) continue;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const start = first.resets ?? 0;
    const end = last.resets ?? 0;
    const gained = Math.max(0, end - start);
    const spanDays = Math.max(1, (last.ts - first.ts) / 86400);
    const perDay = gained / spanDays;
    rows.push({ charName: set.charName, start, end, gained, perDay, spanDays });
  }

  if (rows.length === 0) {
    return '<div class="text-xs text-muted">sem dados para os personagens selecionados.</div>';
  }

  // Sort descending by resets/day so the ranking is obvious.
  rows.sort((a, b) => b.perDay - a.perDay);

  const maxPerDay = Math.max(...rows.map((r) => r.perDay), 0.01);
  const tickCount = 5;
  const yTickLines = Array.from({ length: tickCount }).map((_, i) => {
    const v = (maxPerDay * i) / Math.max(tickCount - 1, 1);
    const y = padT + innerH - (v / maxPerDay) * innerH;
    const lbl = (Math.round(v * 10) / 10).toFixed(v < 10 ? 1 : 0);
    return '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y + '" y2="' + y + '" stroke="#252a36" stroke-dasharray="2,3" />' +
      '<text x="' + (padL - 4) + '" y="' + (y + 3) + '" fill="#8a93a3" font-size="10" text-anchor="end">' + lbl + '</text>';
  }).join("");

  const step = innerW / Math.max(rows.length, 1);
  const barW = Math.min(step * 0.62, 56);
  const fmtShort = (name) => {
    const s = String(name || "");
    return s.length > 10 ? s.slice(0, 9) + "…" : s;
  };

  const barsHtml = rows.map((r, i) => {
    const x = padL + (i + 0.5) * step;
    const h = (r.perDay / maxPerDay) * innerH;
    const y = padT + innerH - h;
    const perDayTxt = (Math.round(r.perDay * 100) / 100).toFixed(r.perDay < 10 ? 2 : 1);
    const daysTxt = (Math.round(r.spanDays * 10) / 10).toFixed(1);
    const tip = escapeHtml(
      r.charName +
      ": " + perDayTxt + " rr/dia" +
      " (+" + r.gained + " em " + daysTxt + " dias · " + r.start + " → " + r.end + ")"
    );
    const label = escapeHtml(fmtShort(r.charName));
    const xLabel = '<text x="' + x + '" y="' + (H - padB + 14) + '" fill="#8a93a3" font-size="10" text-anchor="middle">' + label + '</text>';
    const bar = '<rect class="hist-dot cursor-pointer transition-opacity hover:opacity-80" x="' + (x - barW / 2) + '" y="' + y + '" width="' + barW + '" height="' + Math.max(h, 2) + '" fill="#f0a93b" fill-opacity="0.85" data-tip="' + tip + '" />';
    const val = r.perDay > 0
      ? '<text x="' + x + '" y="' + (y - 4) + '" fill="#f7c779" font-size="10" text-anchor="middle">' + perDayTxt + '</text>'
      : '';
    return xLabel + bar + val;
  }).join("");

  const header =
    '<div class="flex items-center justify-between mb-3">' +
      '<h3 class="text-xs font-semibold uppercase text-goldsoft">' + escapeHtml(opts?.title || "Comparativo") + '</h3>' +
      '<button id="' + escapeHtml(opts?.closeBtnId || "compare-close") + '" class="text-muted hover:text-slate-100 text-lg leading-none">&times;</button>' +
    '</div>';

  const hint = '<div class="text-[11px] text-muted mb-2">Passe o mouse nas barras para ver detalhes (início → fim).</div>';

  return header +
    hint +
    '<svg viewBox="0 0 ' + W + ' ' + H + '" class="w-full h-auto bg-bg border border-border rounded-md">' +
      yTickLines +
      barsHtml +
    '</svg>';
}

$("admin-poll").onclick = async (e) => {
  const btn = e.currentTarget;
  try {
    const r = await withSpinner(btn, () => fetchJSON("/api/admin/poll", { method: "POST" }));
    toast("cron rodado: scraped=" + r.scraped + " fired=" + r.fired, "ok");
    loadAdminChars();
  } catch (err) { toast(err.message, "err"); }
};
if ($("admin-compare")) $("admin-compare").onclick = compareSelectedChars;
if ($("admin-scrape-items")) $("admin-scrape-items").onclick = async (e) => {
  const btn = e.currentTarget;
  try {
    const r = await withSpinner(btn, () => fetchJSON("/api/admin/items/refresh", { method: "POST" }));
    toast("catálogo: " + r.scraped + " itens em " + r.categories + " categorias", "ok");
  } catch (err) { toast(err.message, "err"); }
};

async function loadAdminEvents() {
  const tbody = $("admin-events");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="py-2 text-muted">carregando…</td></tr>';
  try {
    const data = await fetchJSON("/api/admin/events");
    const evs = data.events || [];
    if (evs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="py-2 text-muted">nenhum evento — espera o cron sincronizar</td></tr>';
      return;
    }
    tbody.innerHTML = evs.map(adminEventRowHtml).join("");
    for (const ev of evs) wireAdminEventRow(ev);
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="6" class="py-2 text-danger">' + escapeHtml(e.message) + '</td></tr>';
  }
}
function adminEventRowHtml(ev) {
  const manualBadge = ev.manual ? ' <span class="text-[10px] uppercase text-gold">manual</span>' : '';
  return '<tr class="border-b border-border/60" data-evrow="' + ev.id + '">' +
    '<td class="py-1.5 pr-2 text-muted">' + escapeHtml(ev.category) + '</td>' +
    '<td class="py-1.5 pr-2 text-goldsoft font-semibold">' + escapeHtml(ev.name) + manualBadge + '</td>' +
    '<td class="py-1.5 pr-2 uppercase">' + escapeHtml(ev.room) + '</td>' +
    '<td class="py-1.5 pr-2"><input data-field="schedule" type="text" value="' + escapeHtml(ev.schedule) + '" class="w-full bg-bg border border-border rounded px-2 py-1 text-xs" /></td>' +
    '<td class="py-1.5 pr-2 text-center"><input data-field="manual" type="checkbox" ' + (ev.manual ? 'checked' : '') + ' class="accent-gold" /></td>' +
    '<td class="py-1.5 pr-2"><button class="px-2 py-1 rounded border border-border text-[11px] hover:bg-bg" data-action="save">Salvar</button></td>' +
    '</tr>';
}
function wireAdminEventRow(ev) {
  const row = document.querySelector('tr[data-evrow="' + ev.id + '"]');
  if (!row) return;
  row.querySelector('[data-action="save"]').onclick = async () => {
    const schedule = row.querySelector('[data-field="schedule"]').value.trim();
    const manual = row.querySelector('[data-field="manual"]').checked;
    try {
      await fetchJSON("/api/admin/events/" + ev.id, {
        method: "PATCH",
        body: JSON.stringify({ schedule, manual }),
      });
      toast("evento atualizado", "ok");
      loadAdminEvents();
    } catch (e) { toast(e.message, "err"); }
  };
}

// ---- Market ----
const marketState = { sort: "hot", side: "", q: "", listings: [] };
let marketSearchTimer = null;

function wireMarket() {
  if (!$("market-card")) return;
  document.querySelectorAll(".market-sort").forEach((b) => {
    b.onclick = () => { marketState.sort = b.getAttribute("data-sort"); refreshSortChips(); loadMarket(); };
  });
  document.querySelectorAll(".market-side").forEach((b) => {
    b.onclick = () => { marketState.side = b.getAttribute("data-side") || ""; refreshSideChips(); loadMarket(); };
  });
  $("market-search").addEventListener("input", () => {
    if (marketSearchTimer) clearTimeout(marketSearchTimer);
    marketSearchTimer = setTimeout(() => {
      marketState.q = $("market-search").value.trim();
      loadMarket();
    }, 250);
  });
  $("market-new-btn").onclick = openListingForm;
}

function refreshSortChips() {
  document.querySelectorAll(".market-sort").forEach((b) => {
    const active = b.getAttribute("data-sort") === marketState.sort;
    b.className = "market-sort px-2 py-0.5 rounded border " + (active ? "border-goldsoft text-goldsoft" : "border-border text-muted hover:text-slate-300");
  });
}
function refreshSideChips() {
  document.querySelectorAll(".market-side").forEach((b) => {
    const active = (b.getAttribute("data-side") || "") === marketState.side;
    b.className = "market-side px-2 py-0.5 rounded border " + (active ? "border-goldsoft text-goldsoft" : "border-border text-muted hover:text-slate-300");
  });
}

let marketWarmupFired = false;
async function loadMarket() {
  const list = $("market-list");
  list.innerHTML = '<div class="text-xs text-muted">carregando...</div>';
  // Fire-and-forget catalog warmup the first time the user opens Market.
  // Idempotent server-side: re-runs only when the items table is sparse.
  if (!marketWarmupFired) {
    marketWarmupFired = true;
    fetchJSON("/api/items/warmup", { method: "POST" }).catch(() => {});
  }
  try {
    const params = new URLSearchParams();
    params.set("sort", marketState.sort);
    if (marketState.side) params.set("side", marketState.side);
    if (marketState.q) params.set("q", marketState.q);
    const data = await fetchJSON("/api/market/listings?" + params.toString());
    marketState.listings = data.listings || [];
    renderMarket();
  } catch (e) {
    list.innerHTML = '<div class="text-xs text-danger">erro: ' + escapeHtml(e.message) + '</div>';
  }
}

function fmtPriceCurrency(listing) {
  if (!listing.currency) return "";
  if (listing.currency === "free") return "🎁 grátis";
  const price = listing.price != null ? Number(listing.price).toLocaleString("pt-BR") : "?";
  const ico = listing.currency === "zeny" ? "🟡" : listing.currency === "gold" ? "💠" : listing.currency === "cash" ? "💵" : "💰";
  return ico + " " + price + " " + listing.currency;
}

function wireItemTypeahead(scope) {
  const input = scope.querySelector('[data-f="item_name"]');
  const slug = scope.querySelector('[data-f="item_slug"]');
  const chip = scope.querySelector('[data-item-chip]');
  const chipName = scope.querySelector('[data-item-chip-name]');
  const chipImg = chip ? chip.querySelector("img") : null;
  const clearBtn = scope.querySelector('[data-item-clear]');
  const results = scope.querySelector('[data-item-results]');
  if (!input || !results) return;

  let timer = null;
  let lastQuery = "";

  const setSelected = (item) => {
    input.value = item.name;
    slug.value = item.slug;
    if (chip) {
      chip.classList.remove("hidden");
      chipName.textContent = item.name;
      if (chipImg) {
        if (item.image_url) chipImg.src = item.image_url;
        else chipImg.removeAttribute("src");
      }
    }
    results.classList.add("hidden");
  };

  if (clearBtn) clearBtn.onclick = () => {
    slug.value = "";
    input.value = "";
    if (chip) chip.classList.add("hidden");
    input.focus();
  };

  const fetchAndRender = async (q) => {
    try {
      const data = await fetchJSON("/api/items?limit=20&q=" + encodeURIComponent(q));
      const items = data.items || [];
      if (items.length === 0) {
        results.innerHTML = '<div class="px-3 py-2 text-xs text-muted">nenhum item — vai como texto livre</div>';
        results.classList.remove("hidden");
        return;
      }
      results.innerHTML = items.map((it) =>
        '<button type="button" data-pick="' + escapeHtml(it.slug) + '" class="w-full flex items-center gap-2 px-2 py-1 hover:bg-bg/60 text-left text-sm">' +
          (it.image_url ? '<img src="' + escapeHtml(it.image_url) + '" class="w-8 h-8 object-contain shrink-0" />' : '<div class="w-8 h-8 shrink-0"></div>') +
          '<span class="flex-1 min-w-0 truncate">' + escapeHtml(it.name) + '</span>' +
          '<span class="text-[10px] text-muted">' + escapeHtml(it.category || "") + '</span>' +
        '</button>'
      ).join("");
      results.classList.remove("hidden");
      results.querySelectorAll("[data-pick]").forEach((btn) => {
        btn.onclick = () => {
          const s = btn.getAttribute("data-pick");
          const it = items.find((x) => x.slug === s);
          if (it) setSelected(it);
        };
      });
    } catch (e) {
      results.innerHTML = '<div class="px-3 py-2 text-xs text-danger">' + escapeHtml(e.message) + '</div>';
      results.classList.remove("hidden");
    }
  };

  input.addEventListener("input", () => {
    // Typing invalidates any previously-picked slug.
    if (slug.value) {
      slug.value = "";
      if (chip) chip.classList.add("hidden");
    }
    const q = input.value.trim();
    if (timer) clearTimeout(timer);
    if (q.length < 2) {
      results.classList.add("hidden");
      return;
    }
    timer = setTimeout(() => {
      if (q === lastQuery) return;
      lastQuery = q;
      fetchAndRender(q);
    }, 200);
  });
  input.addEventListener("focus", () => {
    if (input.value.trim().length >= 2 && results.children.length > 0) results.classList.remove("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!scope.contains(e.target)) results.classList.add("hidden");
  });
}

function fmtAttrs(attrsJson) {
  if (!attrsJson) return null;
  try {
    const a = JSON.parse(attrsJson);
    const parts = [];
    if (a.full) {
      parts.push("Full");
    } else {
      if (a.excellent) parts.push("Excellent");
      if (a.option != null) parts.push("opt+" + a.option);
      if (a.luck) parts.push("luck");
      if (a.skill) parts.push("skill");
    }
    if (a.refinement != null) parts.push("+" + a.refinement);
    if (a.ancient) parts.push("ancient: " + a.ancient);
    if (a.extras) parts.push(a.extras);
    return parts.join(" · ");
  } catch { return null; }
}

function renderMarket() {
  refreshSortChips();
  refreshSideChips();
  const list = $("market-list");
  list.innerHTML = "";
  if (marketState.listings.length === 0) {
    list.innerHTML = '<div class="text-xs text-muted py-4">nenhum anúncio. seja o primeiro!</div>';
    return;
  }
  for (const l of marketState.listings) list.appendChild(renderListingCard(l));
  // Auto-open if URL has ?market=ID
  const urlId = new URLSearchParams(location.search).get("market");
  if (urlId) {
    const card = list.querySelector('[data-listing-id="' + urlId + '"]');
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      const detailBtn = card.querySelector('[data-action="toggle-detail"]');
      if (detailBtn) detailBtn.click();
    }
  }
}

function renderListingCard(l) {
  const card = document.createElement("div");
  card.className = "border border-border rounded-md bg-bg/60 p-3";
  card.dataset.listingId = String(l.id);
  const sideBadge = l.side === "buy"
    ? '<span class="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[10px] uppercase">comprar</span>'
    : l.side === "donate"
    ? '<span class="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] uppercase">doação</span>'
    : '<span class="px-1.5 py-0.5 rounded bg-gold/15 text-goldsoft border border-gold/40 text-[10px] uppercase">vender</span>';
  const kindBadge = l.kind === "char"
    ? '<span class="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px] uppercase">🎮 char</span>'
    : "";
  const statusBadge = l.status === "open"
    ? ""
    : l.status === "held"
    ? '<span class="px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-300 border border-yellow-500/30 text-[10px] uppercase">reservado</span>'
    : '<span class="px-1.5 py-0.5 rounded bg-zinc-500/15 text-zinc-300 border border-zinc-500/30 text-[10px] uppercase">fechado</span>';
  const attrs = fmtAttrs(l.item_attrs);
  const price = fmtPriceCurrency(l);
  const charLine = l.char_name ? "🎮 " + escapeHtml(l.char_name) + (l.char_level != null ? " (" + l.char_level + "/" + (l.char_resets ?? "?") + "rr)" : "") : "";
  // Owner presence: any of the listing owner's chars currently online.
  // Falls back to "offline" only when we have a recent check (otherwise
  // we don't know — show nothing).
  const charStatusBadge = l.owner_online_char
    ? '<span class="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px]">🟢 online · ' + escapeHtml(l.owner_online_char) + (l.owner_online_map ? ' · ' + escapeHtml(l.owner_online_map) : '') + '</span>'
    : (l.owner_last_seen && (Math.floor(Date.now()/1000) - l.owner_last_seen) < 600
        ? '<span class="px-1.5 py-0.5 rounded bg-zinc-500/15 text-zinc-400 border border-zinc-500/30 text-[10px]">offline</span>'
        : "");
  const isMine = state.user && l.user_id === state.user.id;
  const date = new Date(l.created_at * 1000);
  const ago = fmtAgo(state.now ? state.now - l.created_at : Math.floor(Date.now() / 1000) - l.created_at);

  const reactionsRow = l.reactions.map((r) =>
    '<button data-action="react" data-kind="' + escapeHtml(r.kind) + '" class="text-xs px-2 py-0.5 rounded border ' +
    (r.mine ? "border-goldsoft bg-gold/10 text-goldsoft" : "border-border text-muted hover:text-slate-200") +
    '">' + r.kind + (r.count ? ' <span class="tabular-nums">' + r.count + '</span>' : "") + '</button>'
  ).join("");

  // MU color rule: Full / Excellent → emerald glow, Ancient → amber
  // glow, Char listing → purple, otherwise default.
  let parsedAttrs = null;
  try { parsedAttrs = l.item_attrs ? JSON.parse(l.item_attrs) : null; } catch {}
  const titleClass = (() => {
    if (l.kind === "char") return "text-purple-300";
    if (parsedAttrs?.full || parsedAttrs?.excellent) return "text-emerald-300 drop-shadow-[0_0_4px_rgba(16,185,129,0.6)]";
    if (parsedAttrs?.ancient) return "text-amber-300 drop-shadow-[0_0_4px_rgba(245,158,11,0.5)]";
    return "text-slate-100";
  })();
  // For char listings, show resets prominently next to the title.
  const charSummary = l.kind === "char" && parsedAttrs ? (() => {
    const bits = [];
    if (parsedAttrs.charClass) bits.push(parsedAttrs.charClass);
    if (parsedAttrs.resets != null) bits.push('<b class="text-purple-200">' + parsedAttrs.resets + ' resets</b>');
    if (parsedAttrs.level != null) bits.push("lvl " + parsedAttrs.level);
    return bits.length ? '<div class="text-xs text-purple-200/80 mt-0.5">' + bits.join(" · ") + '</div>' : "";
  })() : "";

  card.innerHTML =
    '<div class="flex flex-wrap items-center gap-2 text-xs mb-1.5">' +
      sideBadge + kindBadge + statusBadge +
      '<span class="text-muted">por <b class="text-goldsoft">' + escapeHtml(l.nickname ?? "?") + '</b></span>' +
      (charLine ? '<span class="text-muted">· ' + charLine + '</span>' : "") +
      (charStatusBadge ? ' ' + charStatusBadge : '') +
      '<span class="text-muted ml-auto" title="' + escapeHtml(date.toLocaleString("pt-BR")) + '">' + escapeHtml(ago) + '</span>' +
    '</div>' +
    '<div class="flex gap-3 items-start">' +
      (l.item_image_url ? '<img src="' + escapeHtml(l.item_image_url) + '" class="w-12 h-12 object-contain shrink-0 mt-0.5" />' : "") +
      '<div class="min-w-0 flex-1">' +
        '<div class="font-semibold ' + titleClass + ' whitespace-pre-wrap">' + escapeHtml(l.item_name) + '</div>' +
        charSummary +
        (l.kind !== "char" && attrs ? '<div class="text-xs text-muted mt-0.5">' + escapeHtml(attrs) + '</div>' : "") +
        (price ? '<div class="text-sm text-goldsoft mt-1 tabular-nums">' + escapeHtml(price) + '</div>' : "") +
        (l.notes ? '<div class="text-sm text-slate-300 mt-2 whitespace-pre-wrap">' + escapeHtml(l.notes) + '</div>' : "") +
      '</div>' +
    '</div>' +
    '<div class="flex flex-wrap items-center gap-1.5 mt-3">' +
      reactionsRow +
      (isMine
        ? '<button data-action="edit" class="text-xs px-2 py-0.5 rounded border border-border text-muted hover:text-slate-200 ml-auto">editar</button>' +
          '<button data-action="delete" class="text-xs px-2 py-0.5 rounded border border-border text-danger hover:bg-danger/10">remover</button>'
        : '<button data-action="ping" class="text-xs px-2 py-0.5 rounded bg-gold text-bg font-semibold ml-auto hover:brightness-110">📣 tenho interesse</button>') +
      '<button data-action="toggle-detail" class="text-xs px-2 py-0.5 rounded border border-border text-muted hover:text-slate-200">💬 <span data-comment-count>' + (l.comment_count || 0) + '</span></button>' +
    '</div>' +
    '<div data-detail class="hidden mt-3 pt-3 border-t border-border/60"></div>';

  card.querySelectorAll("[data-action]").forEach((btn) => {
    const action = btn.getAttribute("data-action");
    btn.onclick = (e) => handleListingAction(action, l, card, e);
  });
  return card;
}

function fmtAgo(secs) {
  if (secs < 60) return "agora";
  const m = Math.floor(secs / 60);
  if (m < 60) return m + "min";
  const h = Math.floor(m / 60);
  if (h < 48) return h + "h";
  const d = Math.floor(h / 24);
  return d + "d";
}

async function handleListingAction(action, l, card, e) {
  if (action === "react") {
    if (!await ensureNickname()) return;
    const kind = e.currentTarget.getAttribute("data-kind");
    try {
      await fetchJSON("/api/market/listings/" + l.id + "/react", {
        method: "POST",
        body: JSON.stringify({ kind }),
      });
      await loadMarket();
    } catch (err) { toast(err.message, "err"); }
    return;
  }
  if (action === "delete") {
    if (!await confirmModal("Remover este anúncio?", { okLabel: "Remover", danger: true })) return;
    try {
      await fetchJSON("/api/market/listings/" + l.id, { method: "DELETE" });
      toast("removido", "ok");
      await loadMarket();
    } catch (err) { toast(err.message, "err"); }
    return;
  }
  if (action === "edit") { openListingForm(l); return; }
  if (action === "ping") {
    if (!await ensureNickname()) return;
    openPingModal(l);
    return;
  }
  if (action === "toggle-detail") { toggleListingDetail(l, card); return; }
}

async function toggleListingDetail(l, card) {
  const det = card.querySelector("[data-detail]");
  if (!det) return;
  if (!det.classList.contains("hidden")) {
    det.classList.add("hidden");
    return;
  }
  det.classList.remove("hidden");
  det.innerHTML = '<div class="text-xs text-muted">carregando comentários...</div>';
  try {
    const data = await fetchJSON("/api/market/listings/" + l.id);
    const comments = data.comments || [];
    const list = comments.map((c) => {
      const mine = state.user && c.user_id === state.user.id;
      const ownerOfListing = state.user && l.user_id === state.user.id;
      const removable = mine || ownerOfListing;
      return '<div class="text-sm py-1 border-b border-border/40 last:border-0">' +
        '<div class="flex items-center gap-2 text-[11px] text-muted">' +
          '<b class="text-goldsoft">' + escapeHtml(c.nickname ?? "?") + '</b>' +
          '<span>' + escapeHtml(fmtAgo(Math.floor(Date.now() / 1000) - c.created_at)) + '</span>' +
          (removable ? '<button data-comment-del="' + c.id + '" class="ml-auto text-danger hover:underline">apagar</button>' : "") +
        '</div>' +
        '<div class="whitespace-pre-wrap">' + escapeHtml(c.body) + '</div>' +
      '</div>';
    }).join("");
    det.innerHTML =
      '<div class="space-y-1 mb-3">' + (list || '<div class="text-xs text-muted">sem comentários ainda</div>') + '</div>' +
      '<div class="flex gap-2">' +
        '<input data-comment-input type="text" maxlength="500" placeholder="comentário..." class="flex-1 h-9 bg-bg border border-border rounded-md px-2 outline-none focus:border-gold/60 text-sm" />' +
        '<button data-comment-send class="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-bg transition">enviar</button>' +
      '</div>';
    det.querySelectorAll("[data-comment-del]").forEach((b) => {
      b.onclick = async () => {
        if (!await confirmModal("Apagar comentário?", { okLabel: "Apagar", danger: true })) return;
        try {
          await fetchJSON("/api/market/comments/" + b.getAttribute("data-comment-del"), { method: "DELETE" });
          toggleListingDetail(l, card); toggleListingDetail(l, card);
        } catch (err) { toast(err.message, "err"); }
      };
    });
    const input = det.querySelector("[data-comment-input]");
    const send = det.querySelector("[data-comment-send]");
    const submit = async () => {
      const txt = input.value.trim();
      if (!txt) return;
      if (!await ensureNickname()) return;
      try {
        await fetchJSON("/api/market/listings/" + l.id + "/comment", {
          method: "POST",
          body: JSON.stringify({ body: txt }),
        });
        input.value = "";
        // Reload listings (count) + this detail.
        const cc = card.querySelector("[data-comment-count]");
        if (cc) cc.textContent = String((Number(cc.textContent) || 0) + 1);
        await toggleListingDetail(l, card);  // close
        await toggleListingDetail(l, card);  // reopen with new comment
      } catch (err) { toast(err.message, "err"); }
    };
    send.onclick = submit;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  } catch (err) {
    det.innerHTML = '<div class="text-xs text-danger">erro: ' + escapeHtml(err.message) + '</div>';
  }
}

// ---- Listing form modal ----
function openListingForm(existing) {
  ensureNickname().then((ok) => {
    if (!ok) return;
    const isEdit = existing && typeof existing === "object" && existing.id;
    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 bg-black/70 flex items-start sm:items-center justify-center z-50 p-3 overflow-y-auto";
    const charOpts = (state.characters || []).map((c) =>
      '<option value="' + c.id + '"' + (isEdit && existing.char_id === c.id ? " selected" : "") + '>' + escapeHtml(c.name) + '</option>'
    ).join("");
    const a = isEdit && existing.item_attrs ? (() => { try { return JSON.parse(existing.item_attrs); } catch { return {}; } })() : {};
    const isCharListing = isEdit && existing.kind === "char";
    overlay.innerHTML =
      '<div class="bg-panel border border-border rounded-xl p-5 w-full max-w-lg my-4">' +
        '<h3 class="text-sm uppercase tracking-widest text-muted mb-3">' + (isEdit ? "Editar anúncio" : "Novo anúncio") + '</h3>' +
        '<div class="space-y-3 text-sm">' +
          '<div class="flex gap-2 text-xs">' +
            '<label class="flex-1 cursor-pointer"><input data-f="kind" type="radio" name="kind" value="item" class="peer sr-only"' + (!isCharListing ? " checked" : "") + ' />' +
              '<div class="px-3 py-2 rounded-md border border-border text-center peer-checked:border-goldsoft peer-checked:bg-gold/10 peer-checked:text-goldsoft hover:bg-bg/60">📦 Item</div></label>' +
            '<label class="flex-1 cursor-pointer"><input data-f="kind" type="radio" name="kind" value="char" class="peer sr-only"' + (isCharListing ? " checked" : "") + ' />' +
              '<div class="px-3 py-2 rounded-md border border-border text-center peer-checked:border-purple-400 peer-checked:bg-purple-500/15 peer-checked:text-purple-300 hover:bg-bg/60">🎮 Personagem</div></label>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-2">' +
            '<div><label class="text-[11px] text-muted block mb-1">Tipo</label>' +
              '<select data-f="side" class="w-full h-10 bg-bg border border-border rounded-md px-2">' +
                '<option value="sell"' + (isEdit && existing.side === "sell" ? " selected" : "") + '>vender</option>' +
                '<option value="buy"' + (isEdit && existing.side === "buy" ? " selected" : "") + '>comprar</option>' +
                '<option value="donate"' + (isEdit && existing.side === "donate" ? " selected" : "") + '>doar</option>' +
              '</select></div>' +
            '<div data-char-field><label class="text-[11px] text-muted block mb-1">Char vinculado</label>' +
              '<select data-f="char_id" class="w-full h-10 bg-bg border border-border rounded-md px-2">' +
                '<option value="">— sem char —</option>' + charOpts +
              '</select></div>' +
          '</div>' +
          '<div data-item-fields class="space-y-3"><div><label class="text-[11px] text-muted block mb-1" data-item-label>Item</label>' +
            '<div class="relative">' +
              '<div data-item-chip class="' + (isEdit && existing.item_image_url ? "" : "hidden ") + 'flex items-center gap-2 mb-2 px-2 py-1 rounded-md border border-goldsoft bg-gold/10">' +
                (isEdit && existing.item_image_url ? '<img src="' + escapeHtml(existing.item_image_url) + '" class="w-8 h-8 object-contain" />' : '<img class="w-8 h-8 object-contain" />') +
                '<span data-item-chip-name class="text-sm">' + (isEdit ? escapeHtml(existing.item_name) : "") + '</span>' +
                '<button type="button" data-item-clear class="ml-auto text-muted hover:text-danger text-xs">&times;</button>' +
              '</div>' +
              '<input data-f="item_name" maxlength="80" placeholder="busque no catálogo ou digite livre..." autocomplete="off" class="w-full h-10 bg-bg border border-border rounded-md px-2" value="' + (isEdit ? escapeHtml(existing.item_name) : "") + '" />' +
              '<input data-f="item_slug" type="hidden" value="' + (isEdit && existing.item_slug ? escapeHtml(existing.item_slug) : "") + '" />' +
              '<div data-item-results class="hidden absolute z-10 mt-1 w-full max-h-60 overflow-y-auto bg-panel border border-border rounded-md shadow-lg"></div>' +
            '</div></div>' +
          '<div class="grid grid-cols-2 gap-2">' +
            '<div><label class="text-[11px] text-muted block mb-1">Refinamento (+0..+13)</label>' +
              '<input data-f="refinement" type="number" min="0" max="13" class="w-full h-10 bg-bg border border-border rounded-md px-2" value="' + (a.refinement ?? "") + '" /></div>' +
            '<div><label class="text-[11px] text-muted block mb-1">Option (0..28)</label>' +
              '<input data-f="option" type="number" min="0" max="28" class="w-full h-10 bg-bg border border-border rounded-md px-2" value="' + (a.option ?? "") + '" /></div>' +
          '</div>' +
          '<div class="flex flex-wrap gap-3 text-xs items-center">' +
            '<label class="inline-flex items-center gap-2 px-2 py-1 rounded border border-emerald-400/40 bg-emerald-500/10"><input data-f="full" type="checkbox" class="accent-emerald-400"' + (a.full ? " checked" : "") + ' /> <span class="text-emerald-300 font-semibold drop-shadow">⭐ Item Full</span></label>' +
            '<span class="text-muted">ou:</span>' +
            '<label class="inline-flex items-center gap-2"><input data-f="excellent" type="checkbox" class="accent-emerald-400"' + (a.excellent ? " checked" : "") + ' /> <span class="text-emerald-300">Excellent</span></label>' +
            '<label class="inline-flex items-center gap-2"><input data-f="luck" type="checkbox" class="accent-gold"' + (a.luck ? " checked" : "") + ' /> luck</label>' +
            '<label class="inline-flex items-center gap-2"><input data-f="skill" type="checkbox" class="accent-gold"' + (a.skill ? " checked" : "") + ' /> skill</label>' +
          '</div>' +
          '<div class="text-[11px] text-muted -mt-1">"Item Full" = Excellent + opt 28 + luck + skill. Refinamento (+0..+13) você ainda escolhe acima.</div>' +
          '<div><label class="text-[11px] text-muted block mb-1">Conjunto ancient</label>' +
            '<input data-f="ancient" maxlength="40" placeholder="ex.: Gaion, Anonymous, Hyon..." class="w-full h-10 bg-bg border border-border rounded-md px-2" value="' + (a.ancient ? escapeHtml(a.ancient) : "") + '" /></div>' +
          '<div><label class="text-[11px] text-muted block mb-1">Bônus extras (texto livre)</label>' +
            '<input data-f="extras" maxlength="240" placeholder="ex.: dmg+15%, refl+5%, dr+5..." class="w-full h-10 bg-bg border border-border rounded-md px-2" value="' + (a.extras ? escapeHtml(a.extras) : "") + '" /></div>' +
          '</div>' + // /data-item-fields
          '<div data-char-fields class="hidden space-y-3">' +
            '<div><label class="text-[11px] text-muted block mb-1">Nome do personagem</label>' +
              '<input data-f="char_name" maxlength="80" placeholder="ex.: emigeNosfe" class="w-full h-10 bg-bg border border-border rounded-md px-2" value="' + (isCharListing ? escapeHtml(existing.item_name) : "") + '" />' +
            '</div>' +
            '<div class="grid grid-cols-3 gap-2">' +
              '<div><label class="text-[11px] text-muted block mb-1">Resets <span class="text-goldsoft">★</span></label>' +
                '<input data-f="char_resets" type="number" min="0" max="9999" placeholder="36" class="w-full h-10 bg-bg border border-border rounded-md px-2" value="' + (isCharListing && a.resets != null ? a.resets : "") + '" />' +
              '</div>' +
              '<div><label class="text-[11px] text-muted block mb-1">Level</label>' +
                '<input data-f="char_level" type="number" min="0" max="9999" placeholder="244" class="w-full h-10 bg-bg border border-border rounded-md px-2" value="' + (isCharListing && a.level != null ? a.level : "") + '" />' +
              '</div>' +
              '<div><label class="text-[11px] text-muted block mb-1">Classe</label>' +
                '<select data-f="char_class" class="w-full h-10 bg-bg border border-border rounded-md px-2">' +
                  // 99z classic only — 5 starter classes, with the 2nd/3rd
                  // evolutions for DW/DK/Elf. MG and DL stay as-is.
                  ['','Dark Wizard','Soul Master','Grand Master','Dark Knight','Blade Knight','Blade Master','Fairy Elf','Muse Elf','High Elf','Magic Gladiator','Dark Lord']
                    .map((cls) => '<option value="' + escapeHtml(cls) + '"' + (isCharListing && a.charClass === cls ? " selected" : "") + '>' + (cls || "—") + '</option>').join("") +
                '</select>' +
              '</div>' +
            '</div>' +
            '<div class="text-[11px] text-muted">★ resets é o destaque. Se escolher um char vinculado acima, preenchemos resets/level/classe direto do site.</div>' +
          '</div>' +
          '<div data-pricing-block class="grid grid-cols-2 gap-2">' +
            '<div><label class="text-[11px] text-muted block mb-1">Moeda</label>' +
              '<select data-f="currency" class="w-full h-10 bg-bg border border-border rounded-md px-2">' +
                '<option value="">—</option>' +
                ['zeny','gold','cash'].map((v) => '<option value="' + v + '"' + (isEdit && existing.currency === v ? " selected" : "") + '>' + v + '</option>').join("") +
              '</select></div>' +
            '<div><label class="text-[11px] text-muted block mb-1">Preço</label>' +
              '<input data-f="price" type="number" min="0" placeholder="0" class="w-full h-10 bg-bg border border-border rounded-md px-2" value="' + (isEdit && existing.price != null ? existing.price : "") + '" /></div>' +
          '</div>' +
          '<div><label class="text-[11px] text-muted block mb-1">Notas (opcional)</label>' +
            '<textarea data-f="notes" maxlength="1000" rows="2" placeholder="qualquer detalhe..." class="w-full bg-bg border border-border rounded-md px-2 py-1.5">' + (isEdit && existing.notes ? escapeHtml(existing.notes) : "") + '</textarea></div>' +
          '<label class="inline-flex items-center gap-2 text-xs"><input data-f="allow_message" type="checkbox" class="accent-gold"' + (!isEdit || existing.allow_message ? " checked" : "") + ' /> permitir mensagem ao pingar</label>' +
        '</div>' +
        '<div class="flex justify-end gap-2 mt-4">' +
          '<button data-cancel class="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-bg">cancelar</button>' +
          '<button data-save class="gold-btn block px-4 rounded-md bg-gold text-bg font-semibold text-center border border-transparent hover:brightness-110">' + (isEdit ? "salvar" : "publicar") + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    // Doação implies free — hide moeda/preço when side=doar.
    const sideSel = overlay.querySelector('[data-f="side"]');
    const pricingBlock = overlay.querySelector('[data-pricing-block]');
    const syncPricing = () => {
      const isDonate = sideSel.value === "donate";
      pricingBlock.classList.toggle("hidden", isDonate);
    };
    sideSel.addEventListener("change", syncPricing);
    syncPricing();
    // Item ↔ Personagem mode toggle. Char listings drop the catalog
    // combobox and item-attribute fields; they're pure free-form.
    const itemFields = overlay.querySelector('[data-item-fields]');
    const charFields = overlay.querySelector('[data-char-fields]');
    const syncKind = () => {
      const kind = (overlay.querySelector('input[name="kind"]:checked') || {}).value || "item";
      itemFields.classList.toggle("hidden", kind !== "item");
      charFields.classList.toggle("hidden", kind !== "char");
    };
    overlay.querySelectorAll('input[name="kind"]').forEach((r) => r.addEventListener("change", syncKind));
    syncKind();
    // When a char is linked AND we're in char-listing mode, auto-fill
    // name/resets/level/class from the registered character — saves the
    // user retyping and keeps the listing in sync with the live profile.
    const charLink = overlay.querySelector('[data-f="char_id"]');
    const charNameField = overlay.querySelector('[data-f="char_name"]');
    const charResetsField = overlay.querySelector('[data-f="char_resets"]');
    const charLevelField = overlay.querySelector('[data-f="char_level"]');
    const charClassField = overlay.querySelector('[data-f="char_class"]');
    const fillFromLinkedChar = () => {
      const id = charLink.value;
      if (!id) return;
      const c = (state.characters || []).find((x) => String(x.id) === id);
      if (!c) return;
      // Don't clobber a value the user already typed.
      if (charNameField && !charNameField.value) charNameField.value = c.name;
      if (charResetsField && !charResetsField.value && c.resets != null) charResetsField.value = c.resets;
      if (charLevelField && !charLevelField.value && c.last_level != null) charLevelField.value = c.last_level;
      if (charClassField && !charClassField.value && c.class) {
        // Match against the dropdown options (case-insensitive).
        const opt = [...charClassField.options].find((o) => o.value.toLowerCase() === c.class.toLowerCase());
        if (opt) charClassField.value = opt.value;
      }
    };
    charLink.addEventListener("change", () => {
      const isCharMode = (overlay.querySelector('input[name="kind"]:checked') || {}).value === "char";
      if (isCharMode) fillFromLinkedChar();
    });
    // "Item Full" — when checked, force-check excellent/luck/skill and
    // pin option to 28, then disable everything that Full implies (and
    // ancient/extras too — Full means the canonical fully-optioned item;
    // ancient/extras are not part of that shorthand). Refinement stays
    // editable since the user's hint above promises only that.
    const fullChk = overlay.querySelector('[data-f="full"]');
    const exChk = overlay.querySelector('[data-f="excellent"]');
    const luckChk = overlay.querySelector('[data-f="luck"]');
    const skillChk = overlay.querySelector('[data-f="skill"]');
    const optInput = overlay.querySelector('[data-f="option"]');
    const ancientInput = overlay.querySelector('[data-f="ancient"]');
    const extrasInput = overlay.querySelector('[data-f="extras"]');
    let savedOption = optInput.value;
    const lockedFields = [exChk, luckChk, skillChk, optInput, ancientInput, extrasInput];
    const syncFull = () => {
      const on = !!fullChk.checked;
      if (on) {
        savedOption = optInput.value;
        exChk.checked = true; luckChk.checked = true; skillChk.checked = true;
        optInput.value = "28";
      }
      lockedFields.forEach((el) => {
        el.disabled = on;
        el.parentElement.classList.toggle("opacity-50", on);
      });
      if (!on) optInput.value = savedOption;
    };
    fullChk.addEventListener("change", syncFull);
    syncFull();
    wireItemTypeahead(overlay);
    overlay.querySelector("[data-cancel]").onclick = () => overlay.remove();
    overlay.querySelector("[data-save]").onclick = async (e) => {
      const saveBtn = e.currentTarget;
      const get = (k) => overlay.querySelector('[data-f="' + k + '"]');
      const kindVal = (overlay.querySelector('input[name="kind"]:checked') || {}).value || "item";
      const item_name = kindVal === "char"
        ? get("char_name").value.trim()
        : get("item_name").value.trim();
      if (!item_name) {
        toast(kindVal === "char" ? "informe o nome do personagem" : "informe o item", "err");
        return;
      }
      const attrs = {};
      if (kindVal === "item") {
        const refn = Number(get("refinement").value); if (Number.isInteger(refn) && refn >= 0) attrs.refinement = refn;
        if (get("full").checked) {
          attrs.full = true;
        } else {
          const opt = Number(get("option").value); if (Number.isInteger(opt) && opt >= 0) attrs.option = opt;
          if (get("excellent").checked) attrs.excellent = true;
          if (get("luck").checked) attrs.luck = true;
          if (get("skill").checked) attrs.skill = true;
        }
        const anc = get("ancient").value.trim(); if (anc) attrs.ancient = anc;
        const ext = get("extras").value.trim(); if (ext) attrs.extras = ext;
      } else {
        // Char listings carry resets/level/class as first-class fields.
        const r = Number(get("char_resets").value); if (Number.isInteger(r) && r >= 0) attrs.resets = r;
        const lv = Number(get("char_level").value); if (Number.isInteger(lv) && lv >= 0) attrs.level = lv;
        const cls = get("char_class").value.trim(); if (cls) attrs.charClass = cls;
      }
      const sideVal = get("side").value;
      const isDonate = sideVal === "donate";
      const currencyVal = isDonate ? "free" : get("currency").value;
      const priceVal = get("price").value === "" ? null : Number(get("price").value);
      const charIdVal = get("char_id").value === "" ? null : Number(get("char_id").value);
      const slugVal = kindVal === "char" ? null : ((get("item_slug").value || "").trim() || null);
      const payload = {
        kind: kindVal,
        side: sideVal,
        char_id: charIdVal,
        item_name,
        item_slug: slugVal,
        item_attrs: kindVal === "item" ? attrs : null,
        currency: currencyVal || null,
        price: isDonate || currencyVal === "free" ? null : priceVal,
        notes: get("notes").value.trim() || null,
        allow_message: !!get("allow_message").checked,
      };
      try {
        await withSpinner(saveBtn, async () => {
          if (isEdit) {
            await fetchJSON("/api/market/listings/" + existing.id, { method: "PATCH", body: JSON.stringify(payload) });
          } else {
            await fetchJSON("/api/market/listings", { method: "POST", body: JSON.stringify(payload) });
          }
        });
        toast(isEdit ? "anúncio atualizado!" : "anúncio publicado!", "ok");
        overlay.remove();
        loadMarket();
      } catch (err) { toast(err.message, "err"); }
    };
  });
}

function openPingModal(l) {
  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-3";
  const charOpts = (state.characters || []).map((c) =>
    '<option value="' + c.id + '">' + escapeHtml(c.name) + (c.last_level != null ? " (lvl " + c.last_level + ")" : "") + '</option>'
  ).join("");
  overlay.innerHTML =
    '<div class="bg-panel border border-border rounded-xl p-5 w-full max-w-md">' +
      '<h3 class="text-sm uppercase tracking-widest text-muted mb-3">📣 Tenho interesse</h3>' +
      '<p class="text-xs text-muted mb-3">Vamos enviar um ping no Telegram do anunciante. Limite: 1 por hora.</p>' +
      '<div class="space-y-3 text-sm">' +
        '<div><label class="text-[11px] text-muted block mb-1">Seu personagem (opcional)</label>' +
          '<select data-f="char_id" class="w-full h-10 bg-bg border border-border rounded-md px-2">' +
            '<option value="">— não informar —</option>' + charOpts +
          '</select></div>' +
        (l.allow_message
          ? '<div><label class="text-[11px] text-muted block mb-1">Mensagem (opcional, máx 280 chars)</label>' +
            '<textarea data-f="message" rows="3" maxlength="280" placeholder="quanto você aceita por isso?" class="w-full bg-bg border border-border rounded-md px-2 py-1.5"></textarea></div>'
          : '<div class="text-[11px] text-muted">o anunciante não habilitou mensagens — ping será enviado sem texto</div>') +
      '</div>' +
      '<div class="flex justify-end gap-2 mt-4">' +
        '<button data-cancel class="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-bg">cancelar</button>' +
        '<button data-send class="gold-btn block px-4 rounded-md bg-gold text-bg font-semibold text-center border border-transparent hover:brightness-110">enviar ping</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.querySelector("[data-cancel]").onclick = () => overlay.remove();
  overlay.querySelector("[data-send]").onclick = async () => {
    const charSel = overlay.querySelector('[data-f="char_id"]');
    const msgEl = overlay.querySelector('[data-f="message"]');
    const charIdVal = charSel.value === "" ? null : Number(charSel.value);
    const message = msgEl ? msgEl.value.trim() : "";
    try {
      await fetchJSON("/api/market/listings/" + l.id + "/ping", {
        method: "POST",
        body: JSON.stringify({ char_id: charIdVal, message }),
      });
      toast("ping enviado!", "ok");
      overlay.remove();
      loadMarket();
    } catch (err) { toast(err.message, "err"); }
  };
}

// In-app confirmation modal — replaces native window.confirm so we don't
// surface the browser's ugly origin-prefixed dialog on destructive actions.
// Returns Promise<boolean>.
function confirmModal(message, opts = {}) {
  const { okLabel = "Confirmar", cancelLabel = "Cancelar", danger = false } = opts;
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-3";
    const okClass = danger
      ? "px-4 py-1.5 rounded-md bg-danger text-white font-semibold hover:brightness-110"
      : "px-4 py-1.5 rounded-md bg-gold text-bg font-semibold hover:brightness-110";
    overlay.innerHTML =
      '<div class="bg-panel border border-border rounded-xl p-5 w-full max-w-sm">' +
        '<div class="text-sm text-slate-200 whitespace-pre-wrap mb-4" data-msg></div>' +
        '<div class="flex justify-end gap-2">' +
          '<button data-cancel class="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-bg">' + escapeHtml(cancelLabel) + '</button>' +
          '<button data-ok class="' + okClass + '">' + escapeHtml(okLabel) + '</button>' +
        '</div>' +
      '</div>';
    overlay.querySelector("[data-msg]").textContent = message;
    document.body.appendChild(overlay);
    const close = (val) => { overlay.remove(); resolve(val); };
    overlay.querySelector("[data-cancel]").onclick = () => close(false);
    overlay.querySelector("[data-ok]").onclick = () => close(true);
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    });
    // Click outside the dialog to dismiss.
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
    overlay.querySelector("[data-ok]").focus();
  });
}

// Returns true if user already has nickname OR set one successfully.
async function ensureNickname() {
  if (state.user?.nickname) return true;
  return await new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-3";
    overlay.innerHTML =
      '<div class="bg-panel border border-border rounded-xl p-5 w-full max-w-sm">' +
        '<h3 class="text-sm uppercase tracking-widest text-muted mb-3">Escolha um apelido</h3>' +
        '<p class="text-xs text-muted mb-3">No Mercado, outros usuários só veem seu apelido (não seu nome real). 2–20 caracteres, letras/números/_-.</p>' +
        '<input data-nick type="text" maxlength="20" placeholder="ex.: daddyMU" class="w-full h-10 bg-bg border border-border rounded-md px-2 outline-none focus:border-gold/60" />' +
        '<div data-err class="text-xs text-danger mt-1"></div>' +
        '<div class="flex justify-end gap-2 mt-4">' +
          '<button data-cancel class="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-bg">cancelar</button>' +
          '<button data-save class="gold-btn block px-4 rounded-md bg-gold text-bg font-semibold text-center border border-transparent hover:brightness-110">salvar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    const input = overlay.querySelector("[data-nick]");
    const errEl = overlay.querySelector("[data-err]");
    input.focus();
    overlay.querySelector("[data-cancel]").onclick = () => { overlay.remove(); resolve(false); };
    const submit = async () => {
      const v = input.value.trim();
      if (!v) { errEl.textContent = "informe um apelido"; return; }
      try {
        const r = await fetchJSON("/api/me/nickname", { method: "POST", body: JSON.stringify({ nickname: v }) });
        state.user.nickname = r.nickname;
        toast("apelido definido!", "ok");
        overlay.remove();
        resolve(true);
      } catch (err) { errEl.textContent = err.message; }
    };
    overlay.querySelector("[data-save]").onclick = submit;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  });
}

// ---- Boot ----
if (!localStorage.getItem(CONSENT_KEY)) showConsent();
// Side-menu wiring (admin tab only shows for admins).
$("nav-dashboard").onclick = () => setDashView("dashboard");
if ($("nav-market")) $("nav-market").onclick = () => setDashView("market");
if ($("nav-admin")) $("nav-admin").onclick = () => setDashView("admin");
wireMarket();
// User comparison (own characters)
if ($("user-compare")) $("user-compare").onclick = async () => {
  const btn = $("user-compare");
  const chart = $("user-comparison-chart");
  if (!userCompareMode) {
    userCompareMode = true;
    if (chart) chart.classList.add("hidden");
    renderDash();
    toast("marque 2+ personagens e clique novamente", "info");
    return;
  }
  const checked = document.querySelectorAll('input[data-user-compare="1"]:checked');
  if (checked.length < 2) {
    // Second click with no selection cancels.
    userCompareMode = false;
    if (chart) chart.classList.add("hidden");
    renderDash();
    return;
  }
  await compareUserSelectedChars();
};
refresh();

// ---- Auto-refresh ----
//
// Polls /api/me on a 30s cadence and patches the dashboard in place when
// data has changed. Open history charts and inline expansions stay open
// because we update the per-char content (renderCharLeft) instead of
// blowing away the surrounding <li>. Subs list re-renders fully (no
// expansion to preserve there). The admin section stays as-is (it has
// its own expansions; reload manually).
async function autoRefresh() {
  if (document.hidden) return;     // skip when tab is in background
  let data;
  try { data = await fetchJSON("/api/me"); } catch { return; }
  if (!data || !data.user) return;

  const newCharIds = (data.characters || []).map((c) => c.id).sort().join(",");
  const oldCharIds = (state.characters || []).map((c) => c.id).sort().join(",");
  const newSubKey = (data.subscriptions || []).map((s) =>
    s.id + ":" + (s.active ? "1" : "0") + ":" + (s.last_fired_at ?? "")
  ).join(";");
  const oldSubKey = (state.subscriptions || []).map((s) =>
    s.id + ":" + (s.active ? "1" : "0") + ":" + (s.last_fired_at ?? "")
  ).join(";");

  state = data;

  // Char structure changed (added/removed) — full re-render.
  if (newCharIds !== oldCharIds) {
    renderDash();
    return;
  }

  // Otherwise patch each char card's contents in place. Preserves any
  // open history-chart expansion.
  for (const c of state.characters) {
    const li = document.querySelector('li[data-char-id="' + c.id + '"]');
    if (!li) continue;
    const left = li.querySelector(":scope > div:first-child");
    if (left) renderCharLeft(left, c);
  }

  // Re-render subs only when something subs-shaped changed.
  if (newSubKey !== oldSubKey) {
    renderDash();
  }
}
setInterval(autoRefresh, 30_000);

// Refresh on tab focus too — covers the case where the user returns to
// the tab after a few minutes away.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) autoRefresh();
});
</script>
</body>
</html>`;

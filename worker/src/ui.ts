// Single-page UI served from the Worker. No bundler, no framework.
// Talks to the JSON API via fetch().

export const INDEX_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MU Level Watcher</title>
<style>
  :root {
    --bg: #0e1116;
    --fg: #e6edf3;
    --muted: #8b949e;
    --accent: #d98c2e;
    --danger: #f85149;
    --card: #161b22;
    --border: #30363d;
  }
  * { box-sizing: border-box; }
  body { background: var(--bg); color: var(--fg); margin: 0; font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 24px 16px 80px; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -.01em; }
  .sub { color: var(--muted); margin-bottom: 24px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  .card h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 0 0 12px; }
  label { display: block; font-size: 13px; color: var(--muted); margin: 8px 0 4px; }
  input, select, button { font: inherit; }
  input, select {
    width: 100%; background: #0b0f14; color: var(--fg);
    border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px;
  }
  button {
    background: var(--accent); color: #1a0f00; border: 0; border-radius: 6px;
    padding: 8px 14px; font-weight: 600; cursor: pointer;
  }
  button.ghost { background: transparent; color: var(--fg); border: 1px solid var(--border); font-weight: 400; }
  button.danger { background: transparent; color: var(--danger); border: 1px solid var(--border); }
  .row { display: flex; gap: 8px; align-items: end; flex-wrap: wrap; }
  .row > * { flex: 1 1 140px; }
  .row > button { flex: 0 0 auto; }
  .err { color: var(--danger); font-size: 13px; min-height: 18px; }
  .ok { color: #3fb950; font-size: 13px; min-height: 18px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 10px 0; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  li:first-child { border-top: 0; }
  .muted { color: var(--muted); }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #21262d; color: var(--muted); font-size: 12px; }
  .pill.on { background: #0f2a17; color: #3fb950; }
  .grow { flex: 1; }
  hr { border: 0; border-top: 1px solid var(--border); margin: 16px 0; }
  details summary { cursor: pointer; color: var(--muted); }
  code { background: #21262d; padding: 1px 5px; border-radius: 4px; font-size: 13px; }
</style>
</head>
<body>
<main>
  <h1>MU Level Watcher</h1>
  <div class="sub">Get a WhatsApp ping when your MuPatos chars hit milestones.</div>

  <section id="login" class="card" hidden>
    <h2>Sign in</h2>
    <p class="muted">We text you a 6-digit code on WhatsApp.</p>
    <label for="phone">WhatsApp number (with country code)</label>
    <div class="row">
      <input id="phone" type="tel" placeholder="5583999998888" autocomplete="tel" />
      <button id="send-pin">Send code</button>
    </div>
    <div id="login-step2" hidden>
      <label for="pin">6-digit code</label>
      <div class="row">
        <input id="pin" type="text" inputmode="numeric" maxlength="6" pattern="\\d{6}" />
        <button id="verify-pin">Verify</button>
      </div>
    </div>
    <div id="login-msg" class="err"></div>
  </section>

  <section id="dash" hidden>
    <div class="card">
      <h2>Account</h2>
      <div class="row">
        <div class="grow">Signed in as <code id="me-phone"></code></div>
        <button id="logout" class="ghost">Sign out</button>
      </div>
    </div>

    <div class="card">
      <h2>Characters</h2>
      <ul id="char-list"></ul>
      <hr />
      <label for="new-char">Register a character</label>
      <div class="row">
        <input id="new-char" placeholder="character name (e.g. daddy)" />
        <label style="flex:0 0 auto;display:flex;align-items:center;gap:6px;color:var(--fg);margin:0;">
          <input id="new-char-gm" type="checkbox" style="width:auto" /> GM
        </label>
        <button id="add-char">Add</button>
      </div>
      <div id="char-msg" class="err"></div>
    </div>

    <div class="card">
      <h2>Subscriptions</h2>
      <ul id="sub-list"></ul>
      <hr />
      <label for="sub-char">Add a subscription</label>
      <div class="row">
        <select id="sub-char"></select>
        <select id="sub-type">
          <option value="level_gte">Level reached (≥)</option>
          <option value="map_eq">Entered map</option>
          <option value="coords_in">Entered coord box (e.g. safe spawn)</option>
          <option value="status_eq">Online / offline</option>
          <option value="gm_online">GM online (this char)</option>
          <option value="server_event">Server event (placeholder)</option>
        </select>
        <input id="sub-thr" placeholder="threshold" />
        <button id="add-sub">Add</button>
      </div>
      <div id="sub-msg" class="err"></div>
      <details style="margin-top:10px"><summary>What goes in "threshold"?</summary>
        <ul style="margin-top:6px">
          <li><b>Level reached:</b> a number, e.g. <code>360</code></li>
          <li><b>Entered map:</b> a map name, e.g. <code>Stadium</code></li>
          <li><b>Entered coord box:</b> <code>Map:x1-x2:y1-y2</code>, e.g. <code>Stadium:60-90:80-100</code> for a safe-spawn ping</li>
          <li><b>Online / offline:</b> <code>Online</code> or <code>Offline</code></li>
          <li><b>GM online:</b> leave blank</li>
          <li><b>Server event:</b> event name, e.g. <code>Chaos Castle</code> (not wired up yet)</li>
        </ul>
      </details>
    </div>
  </section>
</main>

<script>
const $ = (id) => document.getElementById(id);
const fetchJSON = async (url, opts = {}) => {
  const r = await fetch(url, { credentials: "same-origin", headers: { "content-type": "application/json" }, ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || ("HTTP " + r.status));
  return body;
};

let state = { user: null, characters: [], subscriptions: [] };

async function refresh() {
  try {
    const data = await fetchJSON("/api/me");
    state = data;
    renderDash();
  } catch {
    $("login").hidden = false;
    $("dash").hidden = true;
  }
}

function renderDash() {
  $("login").hidden = true;
  $("dash").hidden = false;
  $("me-phone").textContent = state.user.whatsapp;

  // Characters
  const cl = $("char-list");
  cl.innerHTML = "";
  if (state.characters.length === 0) {
    cl.innerHTML = '<li class="muted">No characters yet. Add one below.</li>';
  }
  for (const c of state.characters) {
    const li = document.createElement("li");
    const left = document.createElement("div");
    left.className = "grow";
    const tags = [];
    if (c.class) tags.push(c.class);
    if (typeof c.resets === "number") tags.push("R" + c.resets);
    if (c.last_level != null) tags.push("Lv " + c.last_level);
    if (c.last_map) tags.push(c.last_map);
    if (c.is_gm) tags.push('<span class="pill on">GM</span>');
    if (c.last_status) tags.push('<span class="pill ' + (c.last_status === "Online" ? "on" : "") + '">' + c.last_status + '</span>');
    left.innerHTML = '<b>' + c.name + '</b> <span class="muted" style="font-size:13px"> · ' + tags.join(" · ") + '</span>';
    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "Remove";
    del.onclick = async () => {
      if (!confirm("Remove " + c.name + "? This deletes its subscriptions too.")) return;
      await fetchJSON("/api/characters/" + c.id, { method: "DELETE" });
      refresh();
    };
    li.appendChild(left);
    li.appendChild(del);
    cl.appendChild(li);
  }

  // Sub character picker
  const sel = $("sub-char");
  sel.innerHTML = "";
  for (const c of state.characters) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  }

  // Subs
  const sl = $("sub-list");
  sl.innerHTML = "";
  if (state.subscriptions.length === 0) {
    sl.innerHTML = '<li class="muted">No subscriptions yet.</li>';
  }
  const charById = Object.fromEntries(state.characters.map((c) => [c.id, c.name]));
  for (const s of state.subscriptions) {
    const li = document.createElement("li");
    const left = document.createElement("div");
    left.className = "grow";
    const charName = s.character_id ? charById[s.character_id] || ("#" + s.character_id) : "(server)";
    let label = "";
    if (s.event_type === "level_gte") label = charName + " — level ≥ " + s.threshold;
    else if (s.event_type === "map_eq") label = charName + " — enters " + s.threshold;
    else if (s.event_type === "coords_in") label = charName + " — enters zone " + s.threshold;
    else if (s.event_type === "status_eq") label = charName + " — goes " + s.threshold;
    else if (s.event_type === "gm_online") label = "GM " + charName + " — online";
    else if (s.event_type === "server_event") label = "server event: " + s.threshold;
    const status = s.active ? '<span class="pill on">active</span>' : '<span class="pill">paused</span>';
    left.innerHTML = label + " " + status;
    const right = document.createElement("div");
    const toggle = document.createElement("button");
    toggle.className = "ghost";
    toggle.textContent = s.active ? "Pause" : "Resume";
    toggle.onclick = async () => {
      await fetchJSON("/api/subscriptions/" + s.id, { method: "PATCH", body: JSON.stringify({ active: !s.active }) });
      refresh();
    };
    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "Delete";
    del.style.marginLeft = "6px";
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

// --- login ---
$("send-pin").onclick = async () => {
  $("login-msg").textContent = "";
  try {
    const phone = $("phone").value.trim();
    await fetchJSON("/api/auth/request-pin", { method: "POST", body: JSON.stringify({ whatsapp: phone }) });
    $("login-step2").hidden = false;
    $("login-msg").className = "ok";
    $("login-msg").textContent = "Code sent. Check WhatsApp.";
  } catch (e) {
    $("login-msg").className = "err";
    $("login-msg").textContent = e.message;
  }
};
$("verify-pin").onclick = async () => {
  $("login-msg").textContent = "";
  try {
    const phone = $("phone").value.trim();
    const pin = $("pin").value.trim();
    await fetchJSON("/api/auth/verify-pin", { method: "POST", body: JSON.stringify({ whatsapp: phone, pin }) });
    refresh();
  } catch (e) {
    $("login-msg").className = "err";
    $("login-msg").textContent = e.message;
  }
};

$("logout").onclick = async () => {
  await fetchJSON("/api/auth/logout", { method: "POST" });
  location.reload();
};

// --- characters ---
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

// --- subscriptions ---
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

refresh();
</script>
</body>
</html>`;

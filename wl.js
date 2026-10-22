/*
 * Tracker de victorias/derrotas por campeón (ARAM Mayhem, partidas normales…).
 * Lo usan varias páginas; cada una se configura con atributos en <body>:
 *   data-wl-mode="aram-mayhem" | "normal"  → clave de almacenamiento propia
 *   lang del <html> ("en" | "es")          → idioma de la interfaz
 * Todo se guarda en localStorage del navegador; no se envía nada a ningún sitio.
 */
(function () {
  "use strict";

  const MODE = document.body.dataset.wlMode || "normal";
  const LANG = document.documentElement.lang === "es" ? "es" : "en";
  const STORAGE_KEY = "wl-" + MODE;
  const SORT_KEY = "wl-sort-" + MODE;

  const T = {
    en: {
      games: "Games", wins: "Wins", losses: "Losses", winrate: "Win rate",
      played: "Champions played", wonWith: "Champions with a win",
      addWin: "Add a win with {n}", addLoss: "Add a loss with {n}",
      subWin: "Remove a win from {n}", subLoss: "Remove a loss from {n}",
      added: "Added a {a} with {n}", removed: "Removed a {a} from {n}", undoShort: "Undo",
      undone: "Undone ({n})", nothingUndo: "Nothing to undo",
      win: "win", loss: "loss", noGames: "No games",
      exported: "Progress exported", imported: "Progress imported",
      importError: "That file isn't a valid progress export.",
      resetConfirm: "Delete all wins and losses for this tracker? This can't be undone. Export first if you want a backup.",
      reset: "Progress deleted", empty: "No champions match.",
      roles: { Fighter: "Fighter", Mage: "Mage", Marksman: "Marksman", Assassin: "Assassin", Tank: "Tank", Support: "Support" }
    },
    es: {
      games: "Partidas", wins: "Victorias", losses: "Derrotas", winrate: "% de victoria",
      played: "Campeones jugados", wonWith: "Campeones con victoria",
      addWin: "Añadir una victoria con {n}", addLoss: "Añadir una derrota con {n}",
      subWin: "Quitar una victoria a {n}", subLoss: "Quitar una derrota a {n}",
      added: "Añadida una {a} con {n}", removed: "Quitada una {a} a {n}", undoShort: "Deshacer",
      undone: "Deshecho ({n})", nothingUndo: "No hay nada que deshacer",
      win: "victoria", loss: "derrota", noGames: "Sin partidas",
      exported: "Progreso exportado", imported: "Progreso importado",
      importError: "Ese archivo no es una exportación de progreso válida.",
      resetConfirm: "¿Borrar todas las victorias y derrotas de este contador? No se puede deshacer. Exporta antes si quieres una copia.",
      reset: "Progreso borrado", empty: "Ningún campeón coincide.",
      roles: { Fighter: "Luchador", Mage: "Mago", Marksman: "Tirador", Assassin: "Asesino", Tank: "Tanque", Support: "Apoyo" }
    }
  }[LANG];
  const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k]);

  // ---------- estado ----------
  function readStore() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return data && typeof data === "object" ? data : {};
    } catch (e) { return {}; }
  }
  let stats = readStore();          // { championId: { w: n, l: n } }
  const history = [];               // pila de acciones de esta sesión, para deshacer
  let champions = [];

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stats)); } catch (e) { /* almacenamiento bloqueado */ }
  }
  const rec = id => stats[id] || { w: 0, l: 0 };
  const games = r => r.w + r.l;
  const pct = r => (games(r) ? Math.round((r.w / games(r)) * 1000) / 10 : null);

  // ---------- elementos ----------
  const $ = id => document.getElementById(id);
  const grid = $("wlGrid");
  const search = $("wlSearch");
  const filter = $("wlFilter");
  const roleSel = $("wlRole");
  const sortSel = $("wlSort");

  try { const s = localStorage.getItem(SORT_KEY); if (s) sortSel.value = s; } catch (e) {}

  // ---------- render ----------
  function pctClass(p) {
    if (p === null) return "";
    if (p >= 55) return "wl-good";
    if (p < 45) return "wl-bad";
    return "wl-mid";
  }

  function cardHTML(c) {
    const r = rec(c.id), p = pct(r), name = c.label;
    const esc = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    return (
      '<div class="wl-card' + (games(r) ? " wl-played" : "") + '" data-id="' + esc(c.id) + '">' +
        '<img src="' + esc(c.image) + '" alt="' + esc(name) + '" width="56" height="56" loading="lazy" decoding="async">' +
        '<span class="wl-name">' + esc(name) + "</span>" +
        '<span class="wl-pct ' + pctClass(p) + '">' + (p === null ? "—" : p.toLocaleString(LANG) + "%") + "</span>" +
        '<span class="wl-record">' + r.w + "W · " + r.l + "L</span>" +
        '<span class="wl-btns">' +
          '<button type="button" class="wl-add wl-add-w" data-act="w" data-delta="1" aria-label="' + esc(fmt(T.addWin, { n: name })) + '">+W</button>' +
          '<button type="button" class="wl-add wl-add-l" data-act="l" data-delta="1" aria-label="' + esc(fmt(T.addLoss, { n: name })) + '">+L</button>' +
        "</span>" +
        // Corrección: restar una victoria/derrota. Sólo aparece si hay algo que restar.
        '<span class="wl-fix">' +
          (r.w ? '<button type="button" class="wl-sub" data-act="w" data-delta="-1" aria-label="' + esc(fmt(T.subWin, { n: name })) + '">−W</button>' : "") +
          (r.l ? '<button type="button" class="wl-sub" data-act="l" data-delta="-1" aria-label="' + esc(fmt(T.subLoss, { n: name })) + '">−L</button>' : "") +
        "</span>" +
      "</div>"
    );
  }

  function visibleList() {
    const q = search.value.trim().toLowerCase();
    const f = filter.value, role = roleSel.value, sort = sortSel.value;
    let list = champions.filter(c => {
      const r = rec(c.id);
      if (q && !c.label.toLowerCase().includes(q) && !c.id.toLowerCase().includes(q)) return false;
      if (role !== "all" && !(c.roles || []).includes(role)) return false;
      if (f === "played" && !games(r)) return false;
      if (f === "unplayed" && games(r)) return false;
      if (f === "won" && !r.w) return false;
      if (f === "never-won" && r.w) return false;
      return true;
    });
    const byName = (a, b) => a.label.localeCompare(b.label, LANG);
    const cmp = {
      "name-asc": byName,
      "games-desc": (a, b) => games(rec(b.id)) - games(rec(a.id)) || byName(a, b),
      "wins-desc": (a, b) => rec(b.id).w - rec(a.id).w || byName(a, b),
      // Sin partidas siempre al final, en ambos órdenes por %.
      "pct-desc": (a, b) => (pct(rec(b.id)) ?? -1) - (pct(rec(a.id)) ?? -1) || games(rec(b.id)) - games(rec(a.id)) || byName(a, b),
      "pct-asc": (a, b) => (pct(rec(a.id)) ?? 101) - (pct(rec(b.id)) ?? 101) || games(rec(b.id)) - games(rec(a.id)) || byName(a, b)
    }[sort] || byName;
    return list.sort(cmp);
  }

  function renderGrid() {
    const list = visibleList();
    grid.innerHTML = list.length ? list.map(cardHTML).join("") : '<p class="wl-empty">' + T.empty + "</p>";
  }

  function renderSummary() {
    let w = 0, l = 0, playedN = 0, wonN = 0;
    champions.forEach(c => {
      const r = rec(c.id);
      w += r.w; l += r.l;
      if (games(r)) playedN++;
      if (r.w) wonN++;
    });
    const total = w + l;
    $("wlGames").textContent = total;
    $("wlWins").textContent = w;
    $("wlLosses").textContent = l;
    $("wlPct").textContent = total ? (Math.round((w / total) * 1000) / 10).toLocaleString(LANG) + "%" : "—";
    $("wlPlayed").textContent = playedN + " / " + champions.length;
    $("wlWonWith").textContent = wonN + " / " + champions.length;
    const fill = $("wlProgressFill");
    if (fill) fill.style.width = champions.length ? (wonN / champions.length) * 100 + "%" : "0";
  }

  function renderAll() { renderSummary(); renderGrid(); }

  // ---------- acciones ----------
  function nameOf(id) { const c = champions.find(x => x.id === id); return c ? c.label : id; }

  // Suma (delta 1) o resta (delta -1) una victoria/derrota. Devuelve false si
  // no había nada que restar.
  function applyDelta(id, kind, delta) {
    const r = Object.assign({ w: 0, l: 0 }, stats[id]);
    if (r[kind] + delta < 0) return false;
    r[kind] += delta;
    if (!r.w && !r.l) delete stats[id];
    else stats[id] = r;
    save();
    return true;
  }

  // Re-pinta sólo la tarjeta tocada para no perder la posición de scroll.
  function refreshCard(id, focusSelector) {
    const old = grid.querySelector('.wl-card[data-id="' + CSS.escape(id) + '"]');
    if (!old) return;
    const c = champions.find(x => x.id === id);
    const tmp = document.createElement("div");
    tmp.innerHTML = cardHTML(c);
    const fresh = tmp.firstChild;
    old.replaceWith(fresh);
    const target = fresh.querySelector(focusSelector) || fresh.querySelector(".wl-add");
    if (target) target.focus();
  }

  function change(id, kind, delta) {
    if (!applyDelta(id, kind, delta)) return;
    history.push({ id, kind, delta });
    renderSummary();
    refreshCard(id, delta > 0 ? '.wl-add[data-act="' + kind + '"]' : '.wl-sub[data-act="' + kind + '"]');
    const what = kind === "w" ? T.win : T.loss;
    toast(fmt(delta > 0 ? T.added : T.removed, { a: what, n: nameOf(id) }), true);
  }

  function undo() {
    const last = history.pop();
    if (!last) { toast(T.nothingUndo); return; }
    applyDelta(last.id, last.kind, -last.delta);
    renderAll();
    toast(fmt(T.undone, { n: nameOf(last.id) }));
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ mode: MODE, version: 1, exportedAt: new Date().toISOString(), stats }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "lol-" + MODE + "-win-tracker.json";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    toast(T.exported);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const src = data && data.stats && typeof data.stats === "object" ? data.stats : null;
        if (!src) throw new Error("bad");
        const clean = {};
        Object.keys(src).forEach(id => {
          const w = Math.max(0, parseInt(src[id].w, 10) || 0);
          const l = Math.max(0, parseInt(src[id].l, 10) || 0);
          if (w || l) clean[id] = { w, l };
        });
        stats = clean;
        history.length = 0;
        save();
        renderAll();
        toast(T.imported);
      } catch (e) {
        toast(T.importError);
      }
    };
    reader.readAsText(file);
  }

  function resetAll() {
    if (!window.confirm(T.resetConfirm)) return;
    stats = {};
    history.length = 0;
    save();
    renderAll();
    toast(T.reset);
  }

  let toastTimer;
  function toast(msg, withUndo) {
    const el = $("wlToast");
    el.textContent = "";
    const span = document.createElement("span");
    span.textContent = msg;
    el.appendChild(span);
    if (withUndo) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "wl-toast-undo";
      b.textContent = T.undoShort;
      b.addEventListener("click", () => undo());
      el.appendChild(b);
    }
    el.hidden = false;
    clearTimeout(toastTimer);
    // Con botón de deshacer se deja más tiempo para reaccionar.
    toastTimer = setTimeout(() => { el.hidden = true; }, withUndo ? 5000 : 2500);
  }

  // ---------- eventos ----------
  grid.addEventListener("click", e => {
    const btn = e.target.closest(".wl-add, .wl-sub");
    if (!btn) return;
    change(btn.closest(".wl-card").dataset.id, btn.dataset.act, parseInt(btn.dataset.delta, 10));
  });
  search.addEventListener("input", renderGrid);
  $("wlClear").addEventListener("click", () => { search.value = ""; renderGrid(); search.focus(); });
  filter.addEventListener("change", renderGrid);
  roleSel.addEventListener("change", renderGrid);
  sortSel.addEventListener("change", () => {
    try { localStorage.setItem(SORT_KEY, sortSel.value); } catch (e) {}
    renderGrid();
  });
  $("wlUndo").addEventListener("click", undo);
  $("wlExport").addEventListener("click", exportData);
  $("wlImportBtn").addEventListener("click", () => $("wlImport").click());
  $("wlImport").addEventListener("change", e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ""; });
  $("wlReset").addEventListener("click", resetAll);
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      undo();
    }
  });

  // ---------- opinión (mismo formulario de Formspree que la portada) ----------
  const fbModal = $("feedbackModal");
  if (fbModal) {
    const fbForm = $("feedbackForm"), fbOk = $("feedbackSuccess"), fbErr = $("feedbackError");
    const closeFb = () => { fbModal.style.display = "none"; $("feedbackBtn").focus(); };
    $("feedbackBtn").addEventListener("click", () => {
      fbModal.style.display = "flex";
      fbForm.hidden = false;
      fbOk.hidden = true;
      fbErr.hidden = true;
      $("feedbackMessage").focus();
    });
    $("closeFeedbackModal").addEventListener("click", closeFb);
    $("closeFeedbackModal").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); closeFb(); } });
    fbModal.addEventListener("click", e => { if (e.target === fbModal) closeFb(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && fbModal.style.display === "flex") closeFb(); });
    fbForm.addEventListener("submit", e => {
      e.preventDefault();
      fetch(fbForm.action, { method: "POST", body: new FormData(fbForm), headers: { Accept: "application/json" } })
        .then(res => {
          if (!res.ok) throw new Error("bad");
          fbForm.reset();
          fbForm.hidden = true;
          fbErr.hidden = true;
          fbOk.hidden = false;
        })
        .catch(() => { fbErr.hidden = false; });
    });
  }

  // ---------- carga ----------
  fetch("/data/champions.json")
    .then(r => r.json())
    .then(data => {
      champions = (data.champions || []).map(c => ({
        id: c.id,
        label: (c.name && (c.name[LANG] || c.name.en)) || c.id,
        image: c.image,
        roles: c.roles || []
      }));
      const roles = [...new Set(champions.flatMap(c => c.roles))];
      ["Fighter", "Mage", "Marksman", "Assassin", "Tank", "Support"].filter(r => roles.includes(r)).forEach(r => {
        const o = document.createElement("option");
        o.value = r;
        o.textContent = T.roles[r] || r;
        roleSel.appendChild(o);
      });
      renderAll();
    })
    .catch(() => {
      grid.innerHTML = '<p class="wl-empty">' + (LANG === "es" ? "No se pudo cargar la lista de campeones. Recarga la página." : "Couldn't load the champion list. Reload the page.") + "</p>";
    });
})();

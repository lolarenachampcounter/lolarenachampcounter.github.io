const grid = document.getElementById("championsGrid");
const searchInput = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearch");
const filterRadios = document.querySelectorAll("input[name='filter']");
const counter = document.getElementById("counter");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importInput = document.getElementById("importInput");
const suggestBtn = document.getElementById("suggestBtn");
const shareBtn = document.getElementById("shareBtn");
const roleList = document.getElementById("roleList");
const activeRoleChip = document.getElementById("activeRoleChip");
const activeRoleChipLabel = document.getElementById("activeRoleChipLabel");
const clearRoleFilterBtn = document.getElementById("clearRoleFilter");
// El idioma lo determina la propia URL de la página (/ = en, /es/ = es),
// no una preferencia guardada, para que cada versión sea siempre la misma
// para usuarios y buscadores.
const currentLang = window.APP_LANG === "es" ? "es" : "en";
const importModal = document.getElementById("importModal");
const modalText = document.getElementById("modalText");
const closeModal = document.getElementById("closeModal");
const replaceBtn = document.getElementById("replaceBtn");
const addBtn = document.getElementById("addBtn");
const sortSelect = document.getElementById("sortSelect");
const SORT_KEY = "lol-sort";


const translations = {
  es: {
    searchPlaceholder: "Buscar campeón...",
    completed: "Completados",
    export: "Exportar progreso",
    import: "Importar progreso",
    filterAll: "Todos",
    filterWon: "Con victoria",
    filterNotWon: "Sin victoria",
    donate: "Buy me a coffee",
    importReplaceOrAdd: "¿Quieres sustituir tu progreso actual o añadir los nuevos campeones?",
    replace: "Sustituir",
    add: "Añadir",
    sortLabel: "Ordenar",
    sortNameAsc: "Nombre A-Z",
    sortNameDesc: "Nombre Z-A",
    sortWonFirst: "Ganados primero",
    sortNotWonFirst: "Por ganar primero",
    buildLinkLabel: name => `Guía de build de Arena para ${name} (abre metasrc.com en una pestaña nueva)`,
    milestone: (pct, count, total) => `🎉 ¡${pct}% completado! ${count}/${total} campeones con victoria.`,
    roles: {
      Fighter: "Luchador",
      Mage: "Mago",
      Marksman: "Tirador",
      Assassin: "Asesino",
      Tank: "Tanque",
      Support: "Soporte"
    },
    allWon: "¡Ya has ganado con todos los campeones! 🏆",
    suggested: name => `Prueba con ${name} — todavía te falta esa victoria.`,
    roleFilterPrefix: "Rol",
    shareTitle: "Arena LoL Win Tracker",
    shareSubtitle: "Progreso del reto Dios de la Arena",
    shareFooter: "lolarenachampcounter.github.io",
    shareFileName: "progreso-dios-de-la-arena.png"
  },
  en: {
    searchPlaceholder: "Search champion...",
    completed: "Completed",
    export: "Export progress",
    import: "Import progress",
    filterAll: "All",
    filterWon: "Won",
    filterNotWon: "Not won",
    donate: "Buy me a coffee",
    importReplaceOrAdd: "Do you want to replace your current progress or add to it?",
    replace: "Replace",
    add: "Add",
    sortLabel: "Sort by",
    sortNameAsc: "Name A-Z",
    sortNameDesc: "Name Z-A",
    sortWonFirst: "Won first",
    sortNotWonFirst: "Not won first",
    buildLinkLabel: name => `Arena build guide for ${name} (opens metasrc.com in a new tab)`,
    milestone: (pct, count, total) => `🎉 ${pct}% complete! ${count}/${total} champions with a win.`,
    roles: {
      Fighter: "Fighter",
      Mage: "Mage",
      Marksman: "Marksman",
      Assassin: "Assassin",
      Tank: "Tank",
      Support: "Support"
    },
    allWon: "You've already won with every champion! 🏆",
    suggested: name => `Try ${name} — you haven't won with them yet.`,
    roleFilterPrefix: "Role",
    shareTitle: "Arena LoL Win Tracker",
    shareSubtitle: "Arena God Challenge progress",
    shareFooter: "lolarenachampcounter.github.io",
    shareFileName: "arena-god-progress.png"
  }
};

const STORAGE_KEY = "lol-wins";
let champions = [];
// Rol seleccionado en el desglose por rol (clic en una fila lo activa/quita).
// null = sin filtro de rol.
let roleFilter = null;
// Una tarjeta por campeón, creada una sola vez. render() las reordena y las
// oculta, pero nunca vuelve a construirlas: reconstruir el grid entero en
// cada pulsación era lo que disparaba el trabajo de layout.
const cardById = new Map();
let wins = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));

// Cada campeón es una <div class="champion-cell"> (se oculta/reordena) que
// contiene el <button class="champion"> (marca victoria) y un <a> hermano
// con el enlace a la guía de build. El <a> no puede ir dentro del <button>:
// contenido interactivo anidado es HTML inválido (ver nota del importInput
// más abajo, mismo motivo).
function createCard(champ) {
  const cell = document.createElement("div");
  cell.className = "champion-cell";
  cell.dataset.championId = champ.id;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "champion";
  button.innerHTML = `
    <img src="${champ.image}" alt="${champ.name}" loading="lazy" decoding="async" width="64" height="64" />
    <span class="champion-name">${champ.name}</span>
  `;
  cell.appendChild(button);

  if (champ.buildUrl) {
    const link = document.createElement("a");
    link.className = "build-link";
    link.href = champ.buildUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const label = translations[currentLang].buildLinkLabel(champ.name);
    link.setAttribute("aria-label", label);
    link.title = label;
    link.textContent = "↗";
    cell.appendChild(link);
  }

  return { cell, button };
}

function bindCard(button, championId) {
  button.addEventListener("click", () => toggleWin(championId));
}

// El grid ya viene renderizado en el HTML (scripts/prerender.py). Si está,
// lo reutilizamos tal cual: cero peticiones y cero salto de layout.
function hydratePrerenderedGrid() {
  const cells = grid.querySelectorAll(".champion-cell[data-champion-id]");
  if (!cells.length) return false;

  champions = Array.from(cells, cell => {
    const id = cell.dataset.championId;
    const button = cell.querySelector(".champion");
    cardById.set(id, { cell, button });
    bindCard(button, id);
    return {
      id,
      name: cell.querySelector(".champion-name").textContent.trim(),
      image: cell.querySelector("img").getAttribute("src")
    };
  });

  return true;
}

async function loadChampions() {
  // Snapshot local: evita depender de una llamada en vivo a la API de Riot
  // para pintar el contenido principal.
  try {
    const localRes = await fetch("/data/champions.json");
    if (!localRes.ok) throw new Error("local snapshot unavailable");
    const localData = await localRes.json();

    setChampions(
      localData.champions.map(c => ({
        id: c.id,
        name: c.name[currentLang] || c.name.en,
        image: c.image,
        buildUrl: c.buildUrl,
        roles: c.roles
      }))
    );
    return;
  } catch (err) {
    console.warn("No se pudo cargar data/champions.json, usando la API en vivo.", err);
  }

  // Fallback: API en vivo de Data Dragon si el snapshot local falla
  const locale = currentLang === "es" ? "es_ES" : "en_US";

  const versionsRes = await fetch(
    "https://ddragon.leagueoflegends.com/api/versions.json"
  );
  const versions = await versionsRes.json();
  const latestVersion = versions[0];

  const champsRes = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/${locale}/champion.json`
  );
  const data = await champsRes.json();

  setChampions(
    Object.values(data.data).map(c => ({
      id: c.id,
      name: c.name,
      image: `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/img/champion/${c.image.full}`,
      roles: c.tags
    }))
  );
}

function setChampions(list) {
  champions = list;
  grid.innerHTML = "";
  cardById.clear();

  champions.forEach(champ => {
    const { cell, button } = createCard(champ);
    bindCard(button, champ.id);
    cardById.set(champ.id, { cell, button });
    grid.appendChild(cell);
  });

  render();
  checkMilestones(false);
}

// El grid prerenderizado no lleva el rol en el DOM (evitar hincharlo con un
// atributo más x173 tarjetas); para el desglose por rol lo recuperamos con
// este fetch aparte, que sólo se hace cuando hace falta.
async function loadChampionRoles() {
  try {
    const res = await fetch("/data/champions.json");
    if (!res.ok) throw new Error("roles unavailable");
    const data = await res.json();
    const rolesById = new Map(data.champions.map(c => [c.id, c.roles]));
    champions.forEach(c => {
      c.roles = rolesById.get(c.id) || [];
    });
  } catch (err) {
    console.warn("No se pudieron cargar los roles para el desglose de progreso.", err);
  }
}

function init() {
  const savedSort = localStorage.getItem(SORT_KEY);
  if (savedSort) sortSelect.value = savedSort;

  applyLanguage();

  if (hydratePrerenderedGrid()) {
    render();
    checkMilestones(false);
    loadChampionRoles().then(render);
  } else {
    loadChampions();
  }
}

function openImportModal(winsArray) {
  modalText.textContent = translations[currentLang].importReplaceOrAdd;
  replaceBtn.textContent = translations[currentLang].replace || "Sustituir";
  addBtn.textContent = translations[currentLang].add || "Añadir";
  importModal.style.display = "flex";

  replaceBtn.onclick = () => {
    wins = new Set(winsArray);
    finishImport();
  };

  addBtn.onclick = () => {
    winsArray.forEach(c => wins.add(c));
    finishImport();
  };
}

function saveWins() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...wins]));
}

exportBtn.addEventListener("click", () => {
  const data = {
    wins: [...wins],
    exportedAt: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "lol-wins-progress.json";
  a.click();

  URL.revokeObjectURL(url);
});


function toggleWin(championId) {
  if (wins.has(championId)) {
    wins.delete(championId);
  } else {
    wins.add(championId);
  }
  saveWins();
  render();
  checkMilestones(true);
}

// 25/50/75/100% del total de campeones. Cada hito se celebra una única vez
// (se recuerda en localStorage): al cargar la página con progreso ya hecho
// de antes, se marcan como conseguidos en silencio (announce=false) para no
// lanzar de golpe varios avisos retroactivos la primera vez que alguien
// marca una victoria tras instalar esta función.
const MILESTONE_KEY = "lol-milestones";
const MILESTONE_FRACTIONS = [0.25, 0.5, 0.75, 1];
const achievedMilestones = new Set(JSON.parse(localStorage.getItem(MILESTONE_KEY) || "[]"));

function checkMilestones(announce) {
  if (!champions.length) return;
  MILESTONE_FRACTIONS.forEach(frac => {
    const pct = Math.round(frac * 100);
    const threshold = Math.round(champions.length * frac);
    if (wins.size >= threshold && !achievedMilestones.has(pct)) {
      achievedMilestones.add(pct);
      localStorage.setItem(MILESTONE_KEY, JSON.stringify([...achievedMilestones]));
      if (announce) showToast(translations[currentLang].milestone(pct, wins.size, champions.length));
    }
  });
}

let toastTimer;
function showToast(message) {
  const toast = document.getElementById("milestoneToast");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  // Fuerza un reflow para que la transición se dispare también si el toast
  // anterior seguía visible (dos avisos seguidos muy juntos).
  void toast.offsetWidth;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.hidden = true;
    }, 300);
  }, 3500);
}

// Elige un campeón al azar entre los que aún no se han ganado, resetea
// buscador/filtros/rol para que sea visible, y lo resalta y centra en
// pantalla. Si ya se ha ganado con todos, avisa en vez de fallar.
function suggestRandomChampion() {
  const t = translations[currentLang];
  const notWon = champions.filter(c => !wins.has(c.id));
  if (!notWon.length) {
    showToast(t.allWon);
    return;
  }

  const pick = notWon[Math.floor(Math.random() * notWon.length)];

  roleFilter = null;
  searchInput.value = "";
  clearSearchBtn.style.display = "none";
  const allFilterRadio = document.querySelector('input[name="filter"][value="all"]');
  if (allFilterRadio) allFilterRadio.checked = true;
  render();

  const entry = cardById.get(pick.id);
  if (entry) {
    entry.cell.scrollIntoView({ behavior: "smooth", block: "center" });
    entry.button.classList.remove("suggested");
    // Reflow para reiniciar la animación si se sugiere el mismo campeón dos
    // veces seguidas (con la clase ya puesta, re-añadirla no dispara nada).
    void entry.button.offsetWidth;
    entry.button.classList.add("suggested");
    setTimeout(() => entry.button.classList.remove("suggested"), 2000);
  }

  showToast(t.suggested(pick.name));
}

// Genera una tarjeta de progreso como imagen PNG (canvas, sin librerías) y
// dispara su descarga. No usa datos personales, sólo el progreso ya visible
// en la página.
function buildProgressCardCanvas() {
  const t = translations[currentLang];
  const width = 720;
  const height = 200 + ROLE_ORDER.length * 40;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#e5e7eb";
  ctx.font = "bold 28px system-ui, sans-serif";
  ctx.fillText(t.shareTitle, 32, 48);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText(t.shareSubtitle, 32, 74);

  const pct = champions.length ? Math.round((wins.size / champions.length) * 100) : 0;
  ctx.fillStyle = "#86efac";
  ctx.font = "bold 48px system-ui, sans-serif";
  ctx.fillText(`${pct}%`, 32, 130);

  ctx.fillStyle = "#cbd5f5";
  ctx.font = "18px system-ui, sans-serif";
  ctx.fillText(`${wins.size}/${champions.length}`, 200, 130);

  // Barra total
  const barX = 32;
  const barY = 150;
  const barWidth = width - 64;
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(barX, barY, barWidth, 10);
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(barX, barY, (barWidth * pct) / 100, 10);

  // Barras por rol
  const totals = new Map();
  const won = new Map();
  champions.forEach(c => {
    const role = (c.roles && c.roles[0]) || "Fighter";
    totals.set(role, (totals.get(role) || 0) + 1);
    if (wins.has(c.id)) won.set(role, (won.get(role) || 0) + 1);
  });

  let y = 195;
  ROLE_ORDER.filter(role => totals.has(role)).forEach(role => {
    y += 40;
    const total = totals.get(role);
    const count = won.get(role) || 0;
    const rolePct = total ? Math.round((count / total) * 100) : 0;

    ctx.fillStyle = "#cbd5f5";
    ctx.font = "15px system-ui, sans-serif";
    ctx.fillText(t.roles[role], 32, y);

    const roleBarX = 160;
    const roleBarWidth = width - roleBarX - 100;
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(roleBarX, y - 12, roleBarWidth, 8);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(roleBarX, y - 12, (roleBarWidth * rolePct) / 100, 8);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${count}/${total}`, width - 32, y);
    ctx.textAlign = "left";
  });

  ctx.fillStyle = "#64748b";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText(t.shareFooter, 32, height - 16);

  return canvas;
}

function shareProgressCard() {
  const t = translations[currentLang];
  if (!champions.length) return;
  const canvas = buildProgressCardCanvas();
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = t.shareFileName;
    a.click();
    URL.revokeObjectURL(url);
  });
}

function updateTotalProgress() {
  const fill = document.getElementById("totalProgressFill");
  const pctLabel = document.getElementById("totalProgressPct");
  if (!fill || !pctLabel || !champions.length) return;
  const pct = Math.round((wins.size / champions.length) * 100);
  fill.style.width = `${pct}%`;
  pctLabel.textContent = `${pct}%`;
}

const ROLE_ORDER = ["Fighter", "Mage", "Marksman", "Assassin", "Tank", "Support"];

function renderRoleBreakdown() {
  if (!roleList || !champions.length || !champions.some(c => c.roles && c.roles.length)) return;

  const totals = new Map();
  const won = new Map();
  champions.forEach(c => {
    const role = (c.roles && c.roles[0]) || "Fighter";
    totals.set(role, (totals.get(role) || 0) + 1);
    if (wins.has(c.id)) won.set(role, (won.get(role) || 0) + 1);
  });

  const roleNames = translations[currentLang].roles;
  roleList.innerHTML = ROLE_ORDER.filter(role => totals.has(role))
    .map(role => {
      const total = totals.get(role);
      const count = won.get(role) || 0;
      const pct = Math.round((count / total) * 100);
      const pressed = roleFilter === role;
      return (
        `<li><button type="button" class="role-row" data-role="${role}" aria-pressed="${pressed}">` +
        `<span>${roleNames[role]}</span>` +
        `<span class="role-bar"><span class="role-bar-fill" style="width:${pct}%"></span></span>` +
        `<span class="role-count">${count}/${total}</span>` +
        `</button></li>`
      );
    })
    .join("");

  updateActiveRoleChip();
}

function updateActiveRoleChip() {
  if (!activeRoleChip || !activeRoleChipLabel) return;
  if (roleFilter) {
    const t = translations[currentLang];
    activeRoleChipLabel.textContent = `${t.roleFilterPrefix}: ${t.roles[roleFilter]}`;
    activeRoleChip.hidden = false;
  } else {
    activeRoleChip.hidden = true;
  }
}

// Delegación de eventos: el contenido de #roleList se regenera por completo
// en cada render(), así que un listener por botón se perdería; uno solo en
// el contenedor sobrevive a las reescrituras de innerHTML.
roleList.addEventListener("click", e => {
  const btn = e.target.closest(".role-row");
  if (!btn) return;
  roleFilter = roleFilter === btn.dataset.role ? null : btn.dataset.role;
  render();
});

clearRoleFilterBtn.addEventListener("click", e => {
  // El botón vive dentro del <summary>: sin esto, el clic también
  // abriría/cerraría el <details> del desglose por rol.
  e.preventDefault();
  e.stopPropagation();
  roleFilter = null;
  render();
});

function getActiveFilter() {
  return document.querySelector("input[name='filter']:checked").value;
}

function render() {
  const t = translations[currentLang];
  counter.textContent = `${t.completed}: ${wins.size}`;
  updateTotalProgress();

  const search = searchInput.value.toLowerCase();
  const filter = getActiveFilter();
  const sortOption = sortSelect.value;

  // 1️⃣ Filtrar campeones
  const filteredChamps = champions
    .filter(c => c.name.toLowerCase().includes(search))
    .filter(c => {
      if (filter === "won") return wins.has(c.id);
      if (filter === "not-won") return !wins.has(c.id);
      return true;
    })
    .filter(c => !roleFilter || (c.roles && c.roles[0] === roleFilter));

  // 2️⃣ Ordenar según opción
  filteredChamps.sort((a, b) => {
    switch (sortOption) {
      case "name-asc":
        return a.name.localeCompare(b.name);
      case "name-desc":
        return b.name.localeCompare(a.name);
      case "won-first":
        return (wins.has(b.id) ? 1 : 0) - (wins.has(a.id) ? 1 : 0);
      case "not-won-first":
        return (wins.has(a.id) ? 1 : 0) - (wins.has(b.id) ? 1 : 0);
      default:
        return 0;
    }
  });

  // 3️⃣ Actualizar estado de cada tarjeta
  const visible = new Set(filteredChamps.map(c => c.id));
  champions.forEach(champ => {
    const entry = cardById.get(champ.id);
    if (!entry) return;
    const won = wins.has(champ.id);
    entry.button.classList.toggle("won", won);
    entry.button.setAttribute("aria-pressed", won ? "true" : "false");
    entry.cell.hidden = !visible.has(champ.id);
  });

  // 4️⃣ Reordenar moviendo los nodos existentes (appendChild los mueve, no
  //    los duplica). Las tarjetas ocultas quedan delante y no afectan.
  const fragment = document.createDocumentFragment();
  filteredChamps.forEach(champ => {
    const entry = cardById.get(champ.id);
    if (entry) fragment.appendChild(entry.cell);
  });
  grid.appendChild(fragment);

  renderRoleBreakdown();
}


function applyLanguage() {
  const t = translations[currentLang];

  // El <h1> ya viene traducido y con la keyword objetivo en cada HTML:
  // sobrescribirlo aquí lo degradaba a una etiqueta de interfaz.

  searchInput.placeholder = t.searchPlaceholder;
  counter.textContent = `${t.completed}: ${wins.size}`;

  exportBtn.textContent = t.export;
  importBtn.textContent = t.import;

  // Filtros
  document.querySelector('input[value="all"]').parentNode.lastChild.textContent = " " + t.filterAll;
  document.querySelector('input[value="won"]').parentNode.lastChild.textContent = " " + t.filterWon;
  document.querySelector('input[value="not-won"]').parentNode.lastChild.textContent = " " + t.filterNotWon;

  // Tipjar
  document.querySelector(".tipjar").textContent = "☕ " + t.donate;

  document.getElementById("sortLabel").textContent = t.sortLabel;
  sortSelect.options[0].textContent = t.sortNameAsc;
  sortSelect.options[1].textContent = t.sortNameDesc;
  sortSelect.options[2].textContent = t.sortWonFirst;
  sortSelect.options[3].textContent = t.sortNotWonFirst;
}


importInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      let winsArray = Array.isArray(data) ? data : data.wins;

      if (!Array.isArray(winsArray)) throw new Error("Formato incorrecto");

      // Convertimos a string por si vienen como IDs numéricos
      const sanitizedWins = winsArray.map(String);

      // Llamamos al modal
      openImportModal(sanitizedWins);
    } catch (err) {
      alert("Error al leer el archivo JSON.");
      console.error(err);
    }
  };
  reader.readAsText(file);
});

function finishImport() {
  saveWins();
  render();
  checkMilestones(false);
  importModal.style.display = "none";

  // Limpiar el input para permitir importar el mismo archivo dos veces si fuera necesario
  importInput.value = "";
}

closeModal.addEventListener("click", () => {
  importModal.style.display = "none";
});

window.onclick = (event) => {
  if (event.target == importModal) {
    importModal.style.display = "none";
  }
};

if (importBtn) {
  importBtn.addEventListener("click", () => {
    importInput.click(); // Esto abre la ventana de selección de archivo
  });
}

// Un único listener por control: antes había dos por evento y render() se
// ejecutaba dos veces en cada pulsación y en cada cambio de orden.
let searchTimer;
searchInput.addEventListener("input", () => {
  clearSearchBtn.style.display = searchInput.value ? "block" : "none";
  clearTimeout(searchTimer);
  searchTimer = setTimeout(render, 120);
});

clearSearchBtn.addEventListener("click", () => {
  searchInput.value = "";
  clearSearchBtn.style.display = "none";
  clearTimeout(searchTimer);
  render();
});

filterRadios.forEach(radio => radio.addEventListener("change", render));

// El consejo junto a "Sort by" se muestra sólo en :hover/:focus-visible por
// CSS; no necesita JavaScript.

sortSelect.addEventListener("change", () => {
  localStorage.setItem(SORT_KEY, sortSelect.value);
  render();
});

suggestBtn.addEventListener("click", suggestRandomChampion);
shareBtn.addEventListener("click", shareProgressCard);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

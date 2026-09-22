const grid = document.getElementById("championsGrid");
const searchInput = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearch");
const filterRadios = document.querySelectorAll("input[name='filter']");
const counter = document.getElementById("counter");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importInput = document.getElementById("importInput");
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
    sortNotWonFirst: "Por ganar primero"
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
    sortNotWonFirst: "Not won first"
  }
};

const STORAGE_KEY = "lol-wins";
let champions = [];
// Una tarjeta por campeón, creada una sola vez. render() las reordena y las
// oculta, pero nunca vuelve a construirlas: reconstruir el grid entero en
// cada pulsación era lo que disparaba el trabajo de layout.
const cardById = new Map();
let wins = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));

function createCard(champ) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "champion";
  card.dataset.championId = champ.id;
  card.innerHTML = `
    <img src="${champ.image}" alt="${champ.name}" loading="lazy" decoding="async" width="64" height="64" />
    <span class="champion-name">${champ.name}</span>
  `;
  return card;
}

function bindCard(card, championId) {
  card.addEventListener("click", () => toggleWin(championId));
}

// El grid ya viene renderizado en el HTML (scripts/prerender.py). Si está,
// lo reutilizamos tal cual: cero peticiones y cero salto de layout.
function hydratePrerenderedGrid() {
  const cards = grid.querySelectorAll(".champion[data-champion-id]");
  if (!cards.length) return false;

  champions = Array.from(cards, card => {
    const id = card.dataset.championId;
    cardById.set(id, card);
    bindCard(card, id);
    return {
      id,
      name: card.querySelector(".champion-name").textContent.trim(),
      image: card.querySelector("img").getAttribute("src")
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
        image: c.image
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
      image: `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/img/champion/${c.image.full}`
    }))
  );
}

function setChampions(list) {
  champions = list;
  grid.innerHTML = "";
  cardById.clear();

  champions.forEach(champ => {
    const card = createCard(champ);
    bindCard(card, champ.id);
    cardById.set(champ.id, card);
    grid.appendChild(card);
  });

  render();
}

function init() {
  const savedSort = localStorage.getItem(SORT_KEY);
  if (savedSort) sortSelect.value = savedSort;

  applyLanguage();

  if (hydratePrerenderedGrid()) {
    render();
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
}

function getActiveFilter() {
  return document.querySelector("input[name='filter']:checked").value;
}

function render() {
  const t = translations[currentLang];
  counter.textContent = `${t.completed}: ${wins.size}`;

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
    });

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
    const card = cardById.get(champ.id);
    if (!card) return;
    const won = wins.has(champ.id);
    card.classList.toggle("won", won);
    card.setAttribute("aria-pressed", won ? "true" : "false");
    card.hidden = !visible.has(champ.id);
  });

  // 4️⃣ Reordenar moviendo los nodos existentes (appendChild los mueve, no
  //    los duplica). Las tarjetas ocultas quedan delante y no afectan.
  const fragment = document.createDocumentFragment();
  filteredChamps.forEach(champ => {
    const card = cardById.get(champ.id);
    if (card) fragment.appendChild(card);
  });
  grid.appendChild(fragment);
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

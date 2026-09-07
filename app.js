const grid = document.getElementById("championsGrid");
const searchInput = document.getElementById("searchInput");
const filterRadios = document.querySelectorAll("input[name='filter']");
const counter = document.getElementById("counter");
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
    title: "Campeones con victoria",
    searchPlaceholder: "Buscar campeón...",
    completed: "Completados",
    export: "Exportar progreso",
    import: "Importar progreso",
    filterAll: "Todos",
    filterWon: "Con victoria",
    filterNotWon: "Sin victoria",
    donate: "Buy me a coffee",
    // AGREGA ESTAS LÍNEAS:
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
    title: "Champions with victory",
    searchPlaceholder: "Search champion...",
    completed: "Completed",
    export: "Export progress",
    import: "Import progress",
    filterAll: "All",
    filterWon: "Won",
    filterNotWon: "Not won",
    donate: "Buy me a coffee",
    // AGREGA ESTAS LÍNEAS:
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

sortSelect.addEventListener("change", render);

const STORAGE_KEY = "lol-wins";
let champions = [];
let wins = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));

async function loadChampions() {
  // Snapshot local: evita depender de una llamada en vivo a la API de Riot
  // para pintar el contenido principal (mejor rendimiento y contenido
  // disponible de inmediato para usuarios y crawlers).
  try {
    const localRes = await fetch("/data/champions.json");
    if (!localRes.ok) throw new Error("local snapshot unavailable");
    const localData = await localRes.json();

    champions = localData.champions.map(c => ({
      id: c.id,
      name: c.name[currentLang] || c.name.en,
      image: c.image
    }));

    render();
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

  champions = Object.values(data.data).map(c => ({
    id: c.id,
    name: c.name,
    image: `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/img/champion/${c.image.full}`
  }));

  render();
}

document.addEventListener("DOMContentLoaded", () => {
  const savedSort = localStorage.getItem(SORT_KEY);
  if (savedSort) sortSelect.value = savedSort;

  applyLanguage();
  loadChampions();
});

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
  let filteredChamps = champions
    .filter(c => c.name.toLowerCase().includes(search))
    .filter(c => {
      if (filter === "won") return wins.has(c.id);
      if (filter === "not-won") return !wins.has(c.id);
      return true;
    });

  // 2️⃣ Ordenar según opción
  filteredChamps.sort((a, b) => {
    switch(sortOption) {
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

  // 3️⃣ Renderizar
  grid.innerHTML = "";
  filteredChamps.forEach(champ => {
    const div = document.createElement("div");
    div.className = "champion" + (wins.has(champ.id) ? " won" : "");
    div.onclick = () => toggleWin(champ.id);

    div.innerHTML = `
      <img src="${champ.image}" alt="${champ.name}" loading="lazy" decoding="async" width="64" height="64" />
      <div class="champion-name">${champ.name}</div>
    `;

    grid.appendChild(div);
  });
}


searchInput.addEventListener("input", render);
filterRadios.forEach(radio => radio.addEventListener("change", render));


function applyLanguage() {
  const t = translations[currentLang];

  // Título
  document.querySelector("h1").textContent = t.title;

  // Placeholder buscador
  const searchInput = document.getElementById("searchInput");
  searchInput.placeholder = t.searchPlaceholder;

  // Contador
  const counter = document.getElementById("counter");
  counter.textContent = `${t.completed}: ${wins.size}`;

  // Botones Export / Import
  exportBtn.textContent = t.export;
  document.getElementById("exportBtn").textContent = t.export;
document.getElementById("importBtn").textContent = t.import;
  // Filtros
  document.querySelector('input[value="all"]').parentNode.lastChild.textContent = " " + t.filterAll;
  document.querySelector('input[value="won"]').parentNode.lastChild.textContent = " " + t.filterWon;
  document.querySelector('input[value="not-won"]').parentNode.lastChild.textContent = " " + t.filterNotWon;

  // Tipjar
  document.querySelector(".tipjar").textContent = "☕ " + t.donate;

  document.getElementById("sortLabel").textContent = translations[currentLang].sortLabel;
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...wins])); 

  document.getElementById("counter").textContent = `${translations[currentLang].completed}: ${wins.size}`;
  
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

applyLanguage();

if (importBtn) {
  importBtn.addEventListener("click", () => {
    importInput.click(); // Esto abre la ventana de selección de archivo
  });
}

const clearSearchBtn = document.getElementById("clearSearch");

searchInput.addEventListener("input", () => {
  clearSearchBtn.style.display = searchInput.value ? "block" : "none";
  render();
});

clearSearchBtn.addEventListener("click", () => {
  searchInput.value = "";
  clearSearchBtn.style.display = "none";
  render();
});

sortSelect.addEventListener("change", () => {
  localStorage.setItem(SORT_KEY, sortSelect.value);
  render();
});

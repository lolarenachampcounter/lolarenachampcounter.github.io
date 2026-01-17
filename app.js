const grid = document.getElementById("championsGrid");
const searchInput = document.getElementById("searchInput");
const filterRadios = document.querySelectorAll("input[name='filter']");
const counter = document.getElementById("counter");
const exportBtn = document.getElementById("exportBtn");
const importInput = document.getElementById("importInput");

const STORAGE_KEY = "lol-wins";
let champions = [];
let wins = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));

async function loadChampions() {
  const versionsRes = await fetch(
    "https://ddragon.leagueoflegends.com/api/versions.json"
  );
  const versions = await versionsRes.json();
  const latestVersion = versions[0];

  const champsRes = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/es_ES/champion.json`
  );
  const data = await champsRes.json();

  champions = Object.values(data.data).map(c => ({
    id: c.id,
    name: c.name,
    image: `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/img/champion/${c.image.full}`
  }));

  render();
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
  counter.textContent = `Completados: ${wins.size}`;

  const search = searchInput.value.toLowerCase();
  const filter = getActiveFilter();

  grid.innerHTML = "";

  champions
    .filter(c => c.name.toLowerCase().includes(search))
    .filter(c => {
      if (filter === "won") return wins.has(c.id);
      if (filter === "not-won") return !wins.has(c.id);
      return true;
    })
    .forEach(champ => {
      const div = document.createElement("div");
      div.className = "champion" + (wins.has(champ.id) ? " won" : "");
      div.onclick = () => toggleWin(champ.id);

      div.innerHTML = `
        <img src="${champ.image}" alt="${champ.name}" />
        <div class="champion-name">${champ.name}</div>
      `;

      grid.appendChild(div);
    });
}

searchInput.addEventListener("input", render);
filterRadios.forEach(radio => radio.addEventListener("change", render));

loadChampions();

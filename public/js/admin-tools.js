import { ApiService } from "./api.js";

let wordsData = [];
let currentSortKey = "nom";
let currentSortOrder = "asc";

export function initAdminTools() {
  bindAdminActions();
  loadAdminDashboardData();
}

function bindAdminActions() {
  const output = document.getElementById("admin-output");

  document.getElementById("admin-reveal-btn")?.addEventListener("click", () => {
    ApiService.getSecretWord()
      .then((data) => {
        output.textContent = `Secret actuel : ${data.secretElement}`;
      })
      .catch((err) => (output.textContent = "Erreur de récupération."));
  });

  document
    .getElementById("admin-reset-seed-btn")
    ?.addEventListener("click", () => {
      fetch("/api/admin/trigger-reset", { method: "POST" })
        .then((res) => res.json())
        .then((data) => {
          output.textContent = `Word Reset ! Nouveau secret : ${data.secretElement}`;
          loadAdminDashboardData(); // Recharge le tableau
        });
    });

  document
    .getElementById("admin-random-secret-btn")
    ?.addEventListener("click", () => {
      fetch("/api/admin/random-secret", { method: "POST" })
        .then((res) => res.json())
        .then((data) => {
          output.textContent = `Secret aléatoire défini : ${data.secretElement}`;
          loadAdminDashboardData();
        });
    });

  document
    .getElementById("admin-sim-hint-btn")
    ?.addEventListener("click", () => {
      ApiService.requestHint("opposite").then((data) => {
        output.innerHTML = `Indice simulé : ${data.text}`;
      });
    });

  // Gestion du tri au clic sur les entêtes
  document
    .querySelectorAll("#words-stats-table th[data-sort]")
    .forEach((th) => {
      th.addEventListener("click", () => {
        const sortKey = th.getAttribute("data-sort");
        if (sortKey === "image") return; // On ne trie pas sur l'image

        if (currentSortKey === sortKey) {
          currentSortOrder = currentSortOrder === "asc" ? "desc" : "asc";
        } else {
          currentSortKey = sortKey;
          currentSortOrder = "asc";
        }

        renderTable();
      });
    });
}

async function loadAdminDashboardData() {
  try {
    // 1. Récupération de tous les mots de la BDD + Historique des stats
    const [elementsRes, historyRes] = await Promise.all([
      fetch("/api/admin/all-elements-details").then((r) => r.json()), // ou charger db.json
      fetch("/api/admin/stats-history")
        .then((r) => r.json())
        .catch(() => [])
    ]);

    // 2. Traitement et aggregation des données par mot
    wordsData = elementsRes.map((item) => {
      const name = item.nom || item;

      // Filtrer les passages dans l'historique pour ce mot
      const appearances = historyRes.filter(
        (h) => h.secretWord && h.secretWord.toLowerCase() === name.toLowerCase()
      );

      const count = appearances.length;

      // Dernière date d'apparition
      let lastDate = "-";
      if (count > 0) {
        const sortedDates = appearances
          .map((a) => a.date)
          .sort((a, b) => new Date(b) - new Date(a));
        lastDate = sortedDates[0];
      }

      // Calcul des moyennes cumulées dans l'historique
      let avgTries = 0;
      let avgHints = 0;
      let avgTime = 0;

      if (count > 0) {
        const totalTries = appearances.reduce(
          (acc, curr) => acc + (curr.avgTries || 0),
          0
        );
        const totalHints = appearances.reduce(
          (acc, curr) => acc + (curr.avgHints || 0),
          0
        );
        const totalTime = appearances.reduce(
          (acc, curr) => acc + (curr.avgTimeInSeconds || 0),
          0
        );

        avgTries = Number((totalTries / count).toFixed(1));
        avgHints = Number((totalHints / count).toFixed(1));
        avgTime = Math.round(totalTime / count);
      }

      return {
        nom: name,
        image:
          item.image || `assets/illustrations/${name.replace(/\s+/g, "_")}.png`,
        count,
        lastDate,
        avgTries,
        avgHints,
        avgTime
      };
    });

    renderTable();
  } catch (err) {
    console.error("Erreur lors du chargement des stats d'admin :", err);
  }
}

function renderTable() {
  const tbody = document.getElementById("words-stats-body");
  if (!tbody) return;

  // Tri des données
  const sortedData = [...wordsData].sort((a, b) => {
    let valA = a[currentSortKey];
    let valB = b[currentSortKey];

    if (currentSortKey === "lastDate") {
      valA = valA === "-" ? 0 : new Date(valA).getTime();
      valB = valB === "-" ? 0 : new Date(valB).getTime();
    }

    if (typeof valA === "string") {
      return currentSortOrder === "asc"
        ? valA.localeCompare(valB)
        : valB.localeCompare(valA);
    }

    return currentSortOrder === "asc" ? valA - valB : valB - valA;
  });

  // Rendu du HTML
  tbody.innerHTML = sortedData
    .map(
      (item) => `
    <tr>
      <td>
        <img src="${item.image}" alt="${item.nom}" class="word-thumb" onerror="this.style.display='none'" />
      </td>
      <td><strong>${item.nom.charAt(0).toUpperCase() + item.nom.slice(1)}</strong></td>
      <td>${item.count}</td>
      <td>${item.lastDate}</td>
      <td>${item.count > 0 ? item.avgTries : "-"}</td>
      <td>${item.count > 0 ? item.avgHints : "-"}</td>
      <td>${item.count > 0 ? `${item.avgTime}s` : "-"}</td>
    </tr>
  `
    )
    .join("");
}

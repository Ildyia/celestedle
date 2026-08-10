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
    // Utilisation du fetch direct si getSecretWord n'est pas sur ApiService
    fetch("/api/admin/get-secret", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("celestedle_admin_token") || ""}`
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error("Erreur ou non autorisé");
        return res.json();
      })
      .then((data) => {
        if (output)
          output.textContent = `Secret actuel : ${data.secretElement}`;
      })
      .catch((err) => {
        if (output) output.textContent = `Erreur : ${err.message}`;
      });
  });

  document
    .getElementById("admin-reset-seed-btn")
    ?.addEventListener("click", () => {
      fetch("/api/admin/trigger-reset", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("celestedle_admin_token") || ""}`
        }
      })
        .then((res) => res.json())
        .then((data) => {
          if (output)
            output.textContent = `Word Reset ! Nouveau secret : ${data.secretElement}`;
          loadAdminDashboardData();
        })
        .catch(() => {
          if (output) output.textContent = "Erreur lors du reset du seed.";
        });
    });

  document
    .getElementById("admin-random-secret-btn")
    ?.addEventListener("click", () => {
      fetch("/api/admin/random-hash", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("celestedle_admin_token") || ""}`
        }
      })
        .then((res) => res.json())
        .then((data) => {
          if (output)
            output.textContent = `Secret aléatoire défini : ${data.secretElement}`;
          loadAdminDashboardData();
        })
        .catch(() => {
          if (output)
            output.textContent = "Erreur lors de la génération aléatoire.";
        });
    });

  // Gestion du tri au clic sur les entêtes de colonnes
  document
    .querySelectorAll("#words-stats-table th[data-sort]")
    .forEach((th) => {
      th.addEventListener("click", () => {
        const sortKey = th.getAttribute("data-sort");
        if (sortKey === "image") return;

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
  const output = document.getElementById("admin-output");

  try {
    const fetchJson = async (endpoint) => {
      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("celestedle_admin_token") || ""}`
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Réponse non-JSON reçue");
      }
      return res.json();
    };

    const [elementsRes, historyRes] = await Promise.all([
      fetchJson("/api/admin/all-elements-details").catch((err) => {
        console.warn("Impossible de charger les détails des éléments :", err);
        return [];
      }),
      fetchJson("/api/admin/stats-history").catch((err) => {
        console.warn("Impossible de charger l'historique :", err);
        return [];
      })
    ]);

    let elementsList = elementsRes;
    if (!elementsList || elementsList.length === 0) {
      elementsList = await fetchJson("/api/game/elements").catch(() => []);
    }

    wordsData = elementsList.map((item) => {
      const name = typeof item === "string" ? item : item.nom;

      const appearances = (historyRes || []).filter(
        (h) => h.secretWord && h.secretWord.toLowerCase() === name.toLowerCase()
      );

      const count = appearances.length;

      let lastDate = "-";
      if (count > 0) {
        const sortedDates = appearances
          .map((a) => a.date)
          .sort((a, b) => new Date(b) - new Date(a));
        lastDate = sortedDates[0];
      }

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

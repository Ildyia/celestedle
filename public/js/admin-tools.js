import { API_BASE_URL } from "./api.js";

let wordsData = [];
let currentSortKey = "nom";
let currentSortOrder = "asc";

export function initAdminTools() {
  setupLoginHandler();
  bindAdminActions();

  // On affiche le dashboard uniquement si un token est présent
  if (localStorage.getItem("celestedle_admin_token")) {
    showDashboard(true);
    loadAdminDashboardData();
  } else {
    showDashboard(false);
  }
}

// Fonction utilitaire pour basculer l'affichage du Dashboard
function showDashboard(isLoggedIn) {
  const loginBlock = document.getElementById("admin-login-block");
  const dashboardContent = document.getElementById("admin-dashboard-content");

  if (isLoggedIn) {
    if (loginBlock) loginBlock.style.display = "none";
    if (dashboardContent) dashboardContent.style.display = "block";
  } else {
    if (loginBlock) loginBlock.style.display = "block";
    if (dashboardContent) dashboardContent.style.display = "none";
  }
}

function setupLoginHandler() {
  const loginBtn = document.getElementById("admin-login-btn");
  const passwordInput = document.getElementById("admin-password-input");
  const errorMsg = document.getElementById("admin-login-error");

  // Possibilité de valider avec la touche Entrée
  passwordInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") loginBtn?.click();
  });

  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      const password = passwordInput ? passwordInput.value : "";

      try {
        const res = await fetch(`${API_BASE_URL}/admin/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password })
        });

        const data = await res.json();

        if (res.ok && data.token) {
          // Stocke le token et bascule l'affichage
          localStorage.setItem("celestedle_admin_token", data.token);
          if (errorMsg) errorMsg.style.display = "none";

          showDashboard(true);
          loadAdminDashboardData();
        } else {
          if (errorMsg) {
            errorMsg.textContent = data.error || "Mot de passe incorrect";
            errorMsg.style.display = "block";
          }
        }
      } catch (err) {
        if (errorMsg) {
          errorMsg.textContent = "Erreur de connexion au serveur";
          errorMsg.style.display = "block";
        }
      }
    });
  }
}

function bindAdminActions() {
  const output = document.getElementById("admin-output");

  // Helper pour les requêtes POST d'admin
  const sendAdminPost = async (endpoint) => {
    const token = localStorage.getItem("celestedle_admin_token") || "";

    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      }
    });

    if (res.status === 401) {
      localStorage.removeItem("celestedle_admin_token");
      showDashboard(false);
      throw new Error("Session expirée, veuillez vous reconnecter.");
    }

    if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
    return res.json();
  };

  // 1. Révéler le secret actuel
  document.getElementById("admin-reveal-btn")?.addEventListener("click", () => {
    sendAdminPost("/admin/get-secret")
      .then((data) => {
        if (output)
          output.textContent = `Secret actuel : ${data.secretElement}`;
      })
      .catch((err) => {
        if (output) output.textContent = `Erreur : ${err.message}`;
      });
  });

  // 2. Réinitialiser le mot (Seed Reset)
  document
    .getElementById("admin-reset-seed-btn")
    ?.addEventListener("click", () => {
      sendAdminPost("/admin/trigger-reset")
        .then((data) => {
          if (output)
            output.textContent = `Word Reset ! Nouveau secret : ${data.secretElement}`;
          loadAdminDashboardData();
        })
        .catch((err) => {
          if (output)
            output.textContent = `Erreur lors du reset : ${err.message}`;
        });
    });

  // 3. Définir un secret aléatoire
  document
    .getElementById("admin-random-secret-btn")
    ?.addEventListener("click", () => {
      sendAdminPost("/admin/random-hash")
        .then((data) => {
          if (output)
            output.textContent = `Secret aléatoire défini : ${data.secretElement}`;
          loadAdminDashboardData();
        })
        .catch((err) => {
          if (output)
            output.textContent = `Erreur génération aléatoire : ${err.message}`;
        });
    });

  // 4. Tri au clic sur les entêtes du tableau
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
  try {
    const fetchJson = async (endpoint) => {
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
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

    // Chargement parallèle des détails et de l'historique
    const [elementsRes, historyRes] = await Promise.all([
      fetchJson("/admin/all-elements-details").catch((err) => {
        console.warn("Impossible de charger les détails des éléments :", err);
        return [];
      }),
      fetchJson("/admin/stats-history").catch((err) => {
        console.warn("Impossible de charger l'historique :", err);
        return [];
      })
    ]);

    // Fallback si la route /all-elements-details est vide
    let elementsList = elementsRes;
    if (!elementsList || elementsList.length === 0) {
      elementsList = await fetchJson("/game/elements").catch(() => []);
    }

    // Construction du tableau de données compilées
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
    .map((item) => {
      const mins = Math.floor(item.avgTime / 60);
      const secs = item.avgTime % 60;
      const formattedAvgTime = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

      return `
        <tr>
          <td>
            <img src="${item.image}" alt="${item.nom}" class="word-thumb" onerror="this.style.display='none'" />
          </td>
          <td><strong>${item.nom.charAt(0).toUpperCase() + item.nom.slice(1)}</strong></td>
          <td>${item.count}</td>
          <td>${item.lastDate}</td>
          <td>${item.count > 0 ? item.avgTries : "-"}</td>
          <td>${item.count > 0 ? item.avgHints : "-"}</td>
          <td>${item.count > 0 ? formattedAvgTime : "-"}</td>
        </tr>
      `;
    })
    .join("");
}

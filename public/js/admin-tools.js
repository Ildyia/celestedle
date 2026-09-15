import { API_BASE_URL } from "./api.js";
import { TableManager } from "./table.js";

let wordsData = [];
let currentSortKey = "count";
let currentSortOrder = "desc";
let victoriesChartInstance = null;

export function initAdminTools() {
  setupLoginHandler();
  bindAdminActions();

  if (localStorage.getItem("celestedle_admin_token")) {
    showDashboard(true);
    loadAdminDashboardData();
  } else {
    showDashboard(false);
  }
}

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

  const chartModal = document.getElementById("chart-modal");
  document.getElementById("admin-chart-btn")?.addEventListener("click", () => {
    if (chartModal) chartModal.style.display = "flex";
  });
  document
    .getElementById("close-chart-modal")
    ?.addEventListener("click", () => {
      if (chartModal) chartModal.style.display = "none";
    });
}

function renderVictoriesChart(historyRes) {
  const ctx = document.getElementById("victories-chart")?.getContext("2d");
  if (!ctx) return;

  const sortedHistory = [...(historyRes || [])].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );
  const labels = sortedHistory.map((h) => h.date);
  const dataCounts = sortedHistory.map((h) => h.count || 0);

  if (victoriesChartInstance) victoriesChartInstance.destroy();

  victoriesChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Victoires journalières",
          data: dataCounts,
          borderColor: "#a855f7",
          backgroundColor: "rgba(168, 85, 247, 0.15)",
          borderWidth: 2,
          fill: true,
          tension: 0.35
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#f8fafc" } } },
      scales: {
        x: {
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(255, 255, 255, 0.05)" }
        },
        y: {
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(255, 255, 255, 0.05)" }
        }
      }
    }
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
      return res.json();
    };

    const [elementsRes, historyRes] = await Promise.all([
      fetchJson("/admin/all-elements-details").catch(() => []),
      fetchJson("/admin/stats-history").catch(() => [])
    ]);

    const elementsList =
      elementsRes.length > 0
        ? elementsRes
        : await fetchJson("/game/elements").catch(() => []);

    const totalAppearances = historyRes.length;
    const totalVictories = historyRes.reduce(
      (acc, curr) => acc + (curr.count || 0),
      0
    );

    const validTries = historyRes.filter((h) => h.avgTries > 0);
    const globalAvgTries =
      validTries.length > 0
        ? (
            validTries.reduce((acc, curr) => acc + curr.avgTries, 0) /
            validTries.length
          ).toFixed(1)
        : "-";

    const validTimes = historyRes.filter((h) => h.avgTimeInSeconds > 0);
    let globalAvgTimeFormatted = "-";
    if (validTimes.length > 0) {
      const avgSecs = Math.round(
        validTimes.reduce((acc, curr) => acc + curr.avgTimeInSeconds, 0) /
          validTimes.length
      );
      const mins = Math.floor(avgSecs / 60);
      const secs = avgSecs % 60;
      globalAvgTimeFormatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    document.getElementById("kpi-total-appearances").textContent =
      totalAppearances;
    document.getElementById("kpi-total-victories").textContent = totalVictories;
    document.getElementById("kpi-global-tries").textContent = globalAvgTries;
    document.getElementById("kpi-global-time").textContent =
      globalAvgTimeFormatted;

    renderVictoriesChart(historyRes);

    const adminAppContext = {};
    wordsData = await Promise.all(
      elementsList.map(async (item) => {
        const name = typeof item === "string" ? item : item.nom;
        let imagePath = "";
        try {
          imagePath = await TableManager.resolveEntityImage(
            name,
            adminAppContext
          );
        } catch (e) {}
        if (!imagePath)
          imagePath = `assets/illustration/${name.toLowerCase().replace(/\s+/g, "_")}.png`;

        const appearances = historyRes.filter(
          (h) =>
            h.secretWord && h.secretWord.toLowerCase() === name.toLowerCase()
        );
        const count = appearances.length;
        const victories = appearances.reduce(
          (acc, curr) => acc + (curr.count || 0),
          0
        );

        let lastDate = "-";
        if (count > 0) {
          const sortedDates = appearances
            .map((a) => a.date)
            .sort((a, b) => new Date(b) - new Date(a));
          lastDate = sortedDates[0];
        }

        let avgTries = 0,
          avgHints = 0,
          avgTime = 0;
        if (count > 0) {
          avgTries = Number(
            (
              appearances.reduce((acc, curr) => acc + (curr.avgTries || 0), 0) /
              count
            ).toFixed(1)
          );
          avgHints = Number(
            (
              appearances.reduce((acc, curr) => acc + (curr.avgHints || 0), 0) /
              count
            ).toFixed(1)
          );
          avgTime = Math.round(
            appearances.reduce(
              (acc, curr) => acc + (curr.avgTimeInSeconds || 0),
              0
            ) / count
          );
        }

        return {
          nom: name,
          image: imagePath,
          count,
          victories,
          lastDate,
          avgTries,
          avgHints,
          avgTime
        };
      })
    );

    renderTable();
  } catch (err) {
    console.error("Erreur chargement dashboard admin :", err);
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
      const formattedAvgTime =
        item.count > 0
          ? `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
          : "-";

      return `
      <tr>
        <td><img src="${item.image}" alt="${item.nom}" class="word-thumb" onerror="this.style.display='none'" /></td>
        <td><strong>${item.nom.charAt(0).toUpperCase() + item.nom.slice(1)}</strong></td>
        <td>${item.count}</td>
        <td>${item.victories}</td>
        <td>${item.lastDate}</td>
        <td>${item.count > 0 ? item.avgTries : "-"}</td>
        <td>${item.count > 0 ? item.avgHints : "-"}</td>
        <td>${formattedAvgTime}</td>
      </tr>
    `;
    })
    .join("");
}

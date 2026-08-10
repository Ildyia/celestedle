import { ApiService } from "./api.js";

export function showToast(message, type = "info") {
  const toast = document.getElementById("admin-toast");
  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast show ${type}`;

  setTimeout(() => {
    toast.className = "toast";
  }, 3000);
}

export function initAdminTools() {
  const secretDisplay = document.getElementById("secret-word-val");
  const btnGetSecret = document.getElementById("btn-get-secret");
  const btnRandomSecret = document.getElementById("btn-random-secret");
  const btnForceReset = document.getElementById("btn-force-reset");
  const btnRefreshStats = document.getElementById("btn-refresh-stats");

  const loadStats = () => {
    ApiService.fetchDailySuccessCount()
      .then((stats) => {
        document.getElementById("stat-wins").textContent = stats.count ?? 0;
        document.getElementById("stat-tries").textContent = stats.avgTries
          ? stats.avgTries.toFixed(1)
          : 0;
      })
      .catch(() => showToast("Erreur chargement des stats", "error"));
  };

  btnGetSecret?.addEventListener("click", () => {
    ApiService.getSecretWordAdmin()
      .then((data) => {
        if (secretDisplay) secretDisplay.textContent = data.secretElement;
        showToast("Mot secret récupéré", "success");
      })
      .catch(() => showToast("Erreur lors de la récupération", "error"));
  });

  btnRandomSecret?.addEventListener("click", () => {
    const randomHash = Math.floor(Math.random() * 1000000);
    ApiService.triggerRandomSecret(randomHash)
      .then((data) => {
        if (secretDisplay)
          secretDisplay.textContent = data.secret
            ? data.secret.nom || data.secret
            : "Mis à jour";
        showToast("Nouveau mot généré !", "success");
        loadStats();
      })
      .catch(() => showToast("Erreur lors du changement de mot", "error"));
  });

  btnForceReset?.addEventListener("click", () => {
    ApiService.triggerAdminReset()
      .then((data) => {
        if (secretDisplay)
          secretDisplay.textContent = data.secret
            ? data.secret.nom || data.secret
            : "Réinitialisé";
        showToast("Jeu réinitialisé", "success");
        loadStats();
      })
      .catch(() => showToast("Erreur lors du reset", "error"));
  });

  btnRefreshStats?.addEventListener("click", () => {
    loadStats();
    showToast("Statistiques mises à jour", "info");
  });

  loadStats();
}

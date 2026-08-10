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
  const secretDetails = document.getElementById("secret-details");
  const btnGetSecret = document.getElementById("btn-get-secret");
  const btnRandomSecret = document.getElementById("btn-random-secret");
  const btnForceReset = document.getElementById("btn-force-reset");
  const btnRefreshStats = document.getElementById("btn-refresh-stats");
  const btnSetCustom = document.getElementById("btn-set-custom-secret");
  const customInput = document.getElementById("custom-word-input");
  const btnTestHint = document.getElementById("btn-test-hint");
  const hintTypeSelect = document.getElementById("hint-type-select");
  const hintPreviewBox = document.getElementById("hint-preview-box");

  const renderDetails = (details) => {
    if (!secretDetails || !details) return;
    secretDetails.style.display = "block";
    const fmt = (v) => (Array.isArray(v) ? v.join(", ") : v || "Aucun");
    secretDetails.innerHTML = `
      <strong>Type:</strong> ${fmt(details.type)}<br>
      <strong>Lieu:</strong> ${fmt(details.lieu)}<br>
      <strong>Couleur:</strong> ${fmt(details.couleur)}<br>
      <strong>Hitbox:</strong> ${fmt(details.hitbox)}
    `;
  };

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

  // Charger la liste pour l'auto-complétion
  ApiService.fetchAdminElementsList()
    .then((elements) => {
      const datalist = document.getElementById("elements-datalist");
      if (!datalist || !Array.isArray(elements)) return;
      datalist.innerHTML = elements
        .map((el) => `<option value="${el.nom || el}">`)
        .join("");
    })
    .catch(() => {});

  btnGetSecret?.addEventListener("click", () => {
    ApiService.getSecretWordAdmin()
      .then((data) => {
        if (secretDisplay) secretDisplay.textContent = data.secretElement;
        if (data.details) renderDetails(data.details);
        showToast("Mot secret récupéré", "success");
      })
      .catch(() => showToast("Erreur récupération du secret", "error"));
  });

  btnRandomSecret?.addEventListener("click", () => {
    const randomHash = Math.floor(Math.random() * 1000000);
    ApiService.triggerRandomSecret(randomHash)
      .then((data) => {
        if (secretDisplay) secretDisplay.textContent = data.secretElement;
        if (data.details) renderDetails(data.details);
        showToast("Nouveau mot généré !", "success");
        loadStats();
      })
      .catch(() => showToast("Erreur changement de mot", "error"));
  });

  btnForceReset?.addEventListener("click", () => {
    ApiService.triggerAdminReset()
      .then((data) => {
        if (secretDisplay) secretDisplay.textContent = data.secretElement;
        if (data.details) renderDetails(data.details);
        showToast("Jeu réinitialisé", "success");
        loadStats();
      })
      .catch(() => showToast("Erreur lors du reset", "error"));
  });

  btnSetCustom?.addEventListener("click", () => {
    const val = customInput.value.trim();
    if (!val) return showToast("Saisis un nom d'élément", "error");

    ApiService.setSecretWordAdmin(val)
      .then((data) => {
        if (secretDisplay) secretDisplay.textContent = data.secretElement;
        if (data.details) renderDetails(data.details);
        showToast(`Mot défini sur : ${data.secretElement}`, "success");
        customInput.value = "";
      })
      .catch((err) => showToast(err.message, "error"));
  });

  btnTestHint?.addEventListener("click", () => {
    const type = hintTypeSelect?.value;
    if (!type) return;

    ApiService.fetchHint(type)
      .then((data) => {
        if (hintPreviewBox)
          hintPreviewBox.innerHTML = data.text || "Aucune réponse";
        showToast("Indice simulé", "info");
      })
      .catch(() => showToast("Erreur simulation d'indice", "error"));
  });

  btnRefreshStats?.addEventListener("click", () => {
    loadStats();
    showToast("Statistiques mises à jour", "info");
  });

  loadStats();
}

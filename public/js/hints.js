import { ApiService } from "./api.js";

export const HintsManager = {
  updateButtonsState(app) {
    const btnFF = document.getElementById("hint-opt-opposite");
    const btnSecret = document.getElementById("hint-opt-secret");
    const btnTruthLies = document.getElementById("hint-opt-truth-lies");

    if (btnFF) btnFF.disabled = app.usedHintTypes.includes("opposite");
    if (btnSecret)
      btnSecret.disabled = app.usedHintTypes.includes("secret_info");
    if (btnTruthLies)
      btnTruthLies.disabled = app.usedHintTypes.includes("truth_and_lies");
  },

  updateButtonText(app) {
    const textSpan = document.getElementById("hint-btn-text");
    if (!app.nodes.hintBtn || !textSpan) return;
    const remaining = Math.max(app.hintLimit - app.hintUses, 0);
    textSpan.textContent =
      remaining > 0 ? `Hints (${remaining} left)` : `No hints left`;
    app.nodes.hintBtn.disabled = remaining === 0;
  },

  request(type, app) {
    if (app.usedHintTypes.includes(type)) return;

    const modal = document.getElementById("hint-modal");
    if (modal) modal.style.display = "none";

    ApiService.fetchHint(type)
      .then((data) => {
        if (!data || !data.text) return;
        app.hintUses += 1;
        app.usedHintTypes.push(type);
        localStorage.setItem(
          "celestedle_used_hint_types",
          JSON.stringify(app.usedHintTypes)
        );

        this.updateButtonsState(app);
        this.updateButtonText(app);
        this.saveAndRender(data.text);
      })
      .catch(() => app.showToastNotification("Error fetching hint."));
  },

  saveAndRender(text) {
    const savedHints = JSON.parse(
      localStorage.getItem("celestedle_saved_hints") || "[]"
    );
    savedHints.push(text);
    localStorage.setItem("celestedle_saved_hints", JSON.stringify(savedHints));
    this.renderActive();
  },

  renderActive() {
    const container = document.getElementById("active-hints-container");
    if (!container) return;
    const savedHints = JSON.parse(
      localStorage.getItem("celestedle_saved_hints") || "[]"
    );

    container.innerHTML = "";
    savedHints.forEach((hintText) => {
      const card = document.createElement("div");
      card.className = "hint-card";
      card.innerHTML = hintText;
      container.appendChild(card);
    });
  }
};

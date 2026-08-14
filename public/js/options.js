export const OptionsManager = {
  init(app) {
    this.app = app;
    this.bindEvents();
    this.loadPreferences();
  },

  bindEvents() {
    if (this.app.nodes.optionsBtn && this.app.nodes.optionsModal) {
      this.app.nodes.optionsBtn.addEventListener("click", () => {
        this.app.nodes.optionsModal.style.display = "flex";
      });
    }

    const toggleTimerCheckbox = document.getElementById(
      "toggle-timer-checkbox"
    );
    if (toggleTimerCheckbox) {
      toggleTimerCheckbox.addEventListener("change", (e) => {
        this.setShowTimer(e.target.checked);
      });
    }

    if (this.app.nodes.closeOptionsBtn && this.app.nodes.optionsModal) {
      this.app.nodes.closeOptionsBtn.addEventListener("click", () => {
        this.app.nodes.optionsModal.style.display = "none";
      });
    }

    if (this.app.nodes.toggleColorblindCheckbox) {
      this.app.nodes.toggleColorblindCheckbox.addEventListener(
        "change",
        (e) => {
          this.setColorblind(e.target.checked);
        }
      );
    }

    if (this.app.nodes.toggleCursorCheckbox) {
      this.app.nodes.toggleCursorCheckbox.addEventListener("change", (e) => {
        setCustomCursor(e.target.checked, this.app);
      });
    }

    const toggleThemeCheckbox = document.getElementById(
      "toggle-theme-checkbox"
    );
    if (toggleThemeCheckbox) {
      toggleThemeCheckbox.addEventListener("change", (e) => {
        this.setCelesteTheme(e.target.checked);
      });
    }
  },

  loadPreferences() {
    const isColorblind =
      localStorage.getItem("celestedle_colorblind") === "true";
    this.setColorblind(isColorblind);

    const isCustomCursor =
      localStorage.getItem("celestedle_custom_cursor") !== "false";
    setCustomCursor(isCustomCursor, this.app);

    const savedTimer = localStorage.getItem("celestedle_show_timer");
    const isShowTimer = savedTimer !== null ? savedTimer === "true" : true;
    this.setShowTimer(isShowTimer);

    const savedTheme = localStorage.getItem("celestedle_celeste_theme");
    const isCelesteTheme = savedTheme !== null ? savedTheme === "true" : true;
    this.setCelesteTheme(isCelesteTheme);
  },

  setCelesteTheme(enabled) {
    document.body.classList.toggle("theme-celeste", enabled);
    localStorage.setItem("celestedle_celeste_theme", enabled);

    const toggleThemeCheckbox = document.getElementById(
      "toggle-theme-checkbox"
    );
    if (toggleThemeCheckbox) {
      toggleThemeCheckbox.checked = enabled;
    }
  },

  setColorblind(enabled) {
    document.body.classList.toggle("colorblind", enabled);
    localStorage.setItem("celestedle_colorblind", enabled);
    if (this.app.nodes.toggleColorblindCheckbox) {
      this.app.nodes.toggleColorblindCheckbox.checked = enabled;
    }
  },

  setShowTimer(enabled) {
    localStorage.setItem("celestedle_show_timer", enabled);
    const timerBadge = document
      .getElementById("game-timer-display")
      ?.closest(".tries-badge");
    if (timerBadge) {
      timerBadge.style.display = enabled ? "flex" : "none";
    }
    const toggleTimerCheckbox = document.getElementById(
      "toggle-timer-checkbox"
    );
    if (toggleTimerCheckbox) {
      toggleTimerCheckbox.checked = enabled;
    }
  }
};

function setCustomCursor(enabled, app) {
  document.body.classList.toggle("no-custom-cursor", !enabled);
  localStorage.setItem("celestedle_custom_cursor", enabled);
  if (app.nodes.customCursor) {
    app.nodes.customCursor.style.display = enabled ? "block" : "none";
  }
  if (app.nodes.toggleCursorCheckbox) {
    app.nodes.toggleCursorCheckbox.checked = enabled;
  }
}

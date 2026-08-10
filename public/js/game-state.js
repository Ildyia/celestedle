import { ApiService } from "./api.js";

export const GameStateManager = {
  checkDailyReset() {
    const todayDate = new Date().toLocaleDateString("sv-SE", {
      timeZone: "Europe/Paris",
    });
    const savedDate = localStorage.getItem("celestedle_date");

    if (savedDate !== todayDate) {
      const keysToRemove = [
        "tries",
        "gameover",
        "status",
        "history",
        "version",
        "solution",
        "solution_attributes",
        "saved_hints",
        "used_hint_types",
      ];
      keysToRemove.forEach((key) =>
        localStorage.removeItem(`celestedle_${key}`),
      );
      localStorage.setItem("celestedle_date", todayDate);
    }
  },

  checkApplicationVersion() {
    ApiService.fetchSecretVersion().then((data) => {
      if (!data || !data.secretVersion) return;
      const savedVersion = localStorage.getItem("celestedle_version");
      if (savedVersion && savedVersion !== String(data.secretVersion)) {
        const keysToRemove = [
          "tries",
          "gameover",
          "status",
          "history",
          "saved_hints",
          "used_hint_types",
        ];
        keysToRemove.forEach((key) =>
          localStorage.removeItem(`celestedle_${key}`),
        );
        localStorage.setItem("celestedle_version", data.secretVersion);
        location.reload();
      } else if (!savedVersion) {
        localStorage.setItem("celestedle_version", data.secretVersion);
      }
    });
  },

  load(app) {
    app.tryCount = parseInt(localStorage.getItem("celestedle_tries")) || 0;
    if (app.nodes.tryCountSpan) {
      app.nodes.tryCountSpan.textContent = app.tryCount;
    }

    app.usedHintTypes = JSON.parse(
      localStorage.getItem("celestedle_used_hint_types") || "[]",
    );
    app.hintUses = app.usedHintTypes.length;

    app.historyLog =
      JSON.parse(localStorage.getItem("celestedle_history")) || [];
    app.historyLog.forEach((data) => app.addTableRow(data));

    if (localStorage.getItem("celestedle_gameover") === "true") {
      app.renderEndGameScreen();
    }
  },
};
